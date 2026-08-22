/**
 * Git-Sync-Dienst (Plan 013, B9) — Projektordner ↔ GitHub-Repo.
 *
 * Ein Projekt wird an EIN GitHub-Repo gekoppelt (gitStore/`project_git`). Dieser
 * Dienst legt dafür KEINEN eigenen Checkout an: er macht den Projektordner
 * selbst zum Arbeitsbaum. `PROJECT_GIT_DIR/<id>` IST die Ablage des Projekts,
 * dieselbe, die `ablageService` unter `ABLAGE_DIR/<id>` zeigt, dieselbe, die im
 * Dateibaum, im Terminal und im Chat erscheint.
 *
 * DARAUS FOLGT DIE WICHTIGSTE REGEL DIESER DATEI: hier wird NIE `cwd` gelöscht,
 * sondern höchstens `cwd/.git`. Wer den Ordner löscht, löscht die Dateien des
 * Kunden. Das stand bis zum 22.08.2026 an drei Stellen so im Code, weil der
 * Kommentar oben von einem „container-lokalen Checkout" sprach, den es nie gab.
 *
 * Abgeglichen wird zwei-wegig: lokale Änderungen werden committet, dann wird
 * die Ferne hereingeholt (merge) und zurückgeschoben (push). Ein Merge-Konflikt
 * wird sauber gemeldet und der Arbeitsbaum wieder freigeräumt (merge --abort) —
 * nie bleibt ein halb-gemergter Baum zurück.
 *
 * Warum das Git-CLI statt einer Bibliothek: kein neuer Lockfile-Eintrag, kein
 * Docker-Rebuild-Rauschen (Regel „minimalistisch/wartbar zuerst"). Aufrufe gehen
 * über `execFile` (Argument-Array, KEINE Shell → keine Injection). Der PAT wird
 * pro Aufruf als `http.extraHeader` mitgegeben und landet damit NIE in
 * `.git/config` auf der Platte (so macht es auch GitHub Actions).
 *
 * Testbarkeit: die eigentliche Git-Ausführung (`run`) und die DB-Schicht (`store`)
 * sind injizierbar; die Fachlogik (clone/merge/push/Konflikt) steht damit ohne
 * echtes Git/Postgres im Test.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs/promises');
const execFileP = promisify(execFile);

const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const gitStore = require('./gitStore');

/** Container-lokales Wurzelverzeichnis für Projekt-Checkouts. */
const PROJECT_GIT_DIR = process.env.PROJECT_GIT_DIR || '/arasul/projects';
/** Wall-clock-Grenze pro Git-Aufruf (Netz kann hängen → GIT_TERMINAL_PROMPT=0). */
const GIT_TIMEOUT_MS = parseInt(process.env.GIT_TIMEOUT_MS || '120000', 10);
/** Identität der automatischen Sync-Commits. */
const COMMIT_NAME = 'Arasul';
const COMMIT_EMAIL = 'arasul@localhost';

/**
 * In-Prozess-Sperre je Projekt: verhindert, dass zwei überlappende Syncs (Doppel-
 * klick o.Ä.) gleichzeitig add/commit/fetch/merge/push auf demselben Checkout
 * fahren und sich an `index.lock` / am Status ins Gehege kommen.
 */
const aktiveSyncs = new Set();

/**
 * Ein Git-Aufruf. `pat` (optional) wird als Basic-Auth-Header injiziert und aus
 * jeglicher Fehlerausgabe wieder entfernt, damit er nie geloggt/zurückgegeben
 * wird. Gibt `{ stdout, stderr, code }` zurück; wirft NICHT bei Exit≠0 (der
 * Aufrufer entscheidet, ob ein Fehlercode erwartet ist — z.B. Merge-Konflikt).
 */
async function gitRoh(args, { cwd = undefined, pat = null } = {}) {
  const authArgs = [];
  let redaction = null;
  if (pat) {
    const basic = Buffer.from(`x-access-token:${pat}`).toString('base64');
    redaction = basic;
    authArgs.push('-c', `http.extraHeader=AUTHORIZATION: basic ${basic}`);
  }
  const alle = [
    '-c',
    `user.name=${COMMIT_NAME}`,
    '-c',
    `user.email=${COMMIT_EMAIL}`,
    ...authArgs,
    ...args,
  ];
  const saeubern = text => {
    let s = String(text || '');
    if (redaction) {
      s = s.split(redaction).join('***');
    }
    return s;
  };
  try {
    const { stdout, stderr } = await execFileP('git', alle, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false' },
    });
    return { stdout: saeubern(stdout), stderr: saeubern(stderr), code: 0 };
  } catch (err) {
    // execFile wirft bei Exit≠0 UND bei Signalen/Timeouts. Exit-Fehler tragen
    // `code` (Zahl) + stdout/stderr; echte Ausführungsfehler tragen einen String-`code`.
    if (typeof err.code === 'number') {
      return { stdout: saeubern(err.stdout), stderr: saeubern(err.stderr), code: err.code };
    }
    throw new ValidationError(`Git nicht ausführbar: ${saeubern(err.message)}`);
  }
}

/** Baut aus einem Roh-Runner einen „muss klappen"-Runner (wirft bei Exit≠0). */
function macheGit(run) {
  return async (args, opts = {}) => {
    const r = await run(args, opts);
    if (r.code !== 0) {
      const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ');
      throw new ValidationError(`Git-Fehler (${args[0]}): ${detail || 'unbekannt'}`);
    }
    return r;
  };
}

/** Ist `dir` ein Git-Arbeitsbaum? */
async function istRepo(dir) {
  try {
    await fs.access(path.join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

/** Der Checkout-Pfad eines Projekts (UUID als Ordnername → sicher, eindeutig). */
function checkoutPfad(projectId) {
  return path.join(PROJECT_GIT_DIR, projectId);
}

/**
 * Koppelt ein Projekt an ein Repo (Repo/Branch/PAT) und prüft die Erreichbarkeit
 * per `ls-remote` — so scheitert ein falscher PAT/URL SOFORT und sichtbar, nicht
 * erst beim ersten Sync. Ein leerer PAT lässt einen bereits gespeicherten Token
 * unverändert (Repo/Branch nachträglich ändern ohne PAT-Neueingabe).
 *
 * Reihenfolge bewusst: ERST prüfen, DANN speichern. Sonst überschriebe ein
 * fehlgeschlagener „Verbinden" eine bereits funktionierende Kopplung (inkl. PAT),
 * ohne Rückweg. Der lokale Checkout wird beim Repo-/Branch-Wechsel NICHT hier
 * angefasst — der nächste Sync merkt die abweichende Ferne und klont neu.
 */
async function verbinde({ projectId, repoUrl, branch = 'main', pat = null }, deps = {}) {
  const { run = gitRoh, store = gitStore } = deps;
  // Effektiven PAT bestimmen (neuer PAT oder der bereits gespeicherte) — OHNE
  // vorher etwas zu überschreiben.
  const effektiverPat = pat || (await store.entschluesselePat({ projectId }));
  const probe = await run(['ls-remote', '--heads', repoUrl], { pat: effektiverPat });
  if (probe.code !== 0) {
    throw new ValidationError('Repository nicht erreichbar, Token, URL oder Rechte prüfen.');
  }
  // Erst nach erfolgreicher Probe schreiben.
  const kopplung = await store.upsertKopplung({ projectId, repoUrl, branch, pat });
  logger.info(`Git-Kopplung gesetzt: Projekt ${projectId} → ${repoUrl} (${branch})`);
  return kopplung;
}

/** Status/Kopplung eines Projekts (ohne Geheimnis) oder null. */
function status({ projectId }, deps = {}) {
  const { store = gitStore } = deps;
  return store.getKopplung({ projectId });
}

/**
 * Zwei-Wege-Sync: lokal committen → fetch → merge → push. Ein Merge-Konflikt
 * wird als ConflictError mit Dateiliste gemeldet und der Baum per `merge --abort`
 * freigeräumt.
 *
 * @returns {Promise<{status, commit, pushed}>}
 */
/**
 * Macht den Projektordner zum Arbeitsbaum für dieses Repo, ohne eine einzige
 * Datei des Nutzers anzufassen.
 *
 * Der frühere Weg war `git clone` in einen leeren Ordner. Das setzte voraus,
 * dass der Ordner leer sein DARF — und genau das ist er nicht: er ist die
 * Ablage. Deshalb andersherum: `.git` neu anlegen, den vorhandenen Bestand als
 * ersten Commit festhalten und die Ferne dazuholen. Der Merge in Schritt (3)
 * bringt beide Seiten zusammen.
 *
 * Zwei Sonderfälle:
 *  - Die Ferne ist leer oder der Branch existiert dort noch nicht. Dann bleibt
 *    es beim lokalen Stand; der erste Push legt den Branch an.
 *  - Der Projektordner ist leer, es gibt also keinen lokalen Commit. Dann ist
 *    die Ferne der Stand, und `reset --hard` holt sie herein. Das ist der Fall,
 *    der früher der Klon war.
 *
 * @param {object} p
 * @param {string} p.cwd Projektordner (IST die Ablage)
 * @param {string} p.repoUrl Repository
 * @param {string} p.branch Zweig
 * @param {string|null} p.pat Token
 * @param {Function} p.git werfende Git-Ausführung
 * @param {Function} p.run nicht werfende Git-Ausführung
 */
async function setzeArbeitsbaumAuf({ cwd, repoUrl, branch, pat, git, run }) {
  await fs.mkdir(cwd, { recursive: true });
  // NUR die Verwaltung. Nie den Inhalt.
  await fs.rm(path.join(cwd, '.git'), { recursive: true, force: true });

  // `init -b` gibt es erst ab git 2.28; der Rückfall setzt den Zweig danach.
  const initMitZweig = await run(['-C', cwd, 'init', '-b', branch]);
  if (initMitZweig.code !== 0) {
    await git(['-C', cwd, 'init']);
    await git(['-C', cwd, 'checkout', '-B', branch]);
  }
  await git(['-C', cwd, 'remote', 'add', 'origin', repoUrl]);

  // Bestand festhalten, sonst hätte der Merge unten kein HEAD, in das er
  // hineinmergen könnte.
  await git(['-C', cwd, 'add', '-A']);
  const bestand = await run(['-C', cwd, 'status', '--porcelain']);
  if (bestand.stdout.trim()) {
    await git(['-C', cwd, 'commit', '-m', 'Bestand vor der Kopplung']);
  }

  const geholt = await run(['-C', cwd, 'fetch', 'origin', branch], { pat });
  if (geholt.code !== 0) {
    return;
  }
  const fern = await run(['-C', cwd, 'rev-parse', '--verify', `origin/${branch}`]);
  if (fern.code !== 0) {
    return;
  }
  const kopf = await run(['-C', cwd, 'rev-parse', '--verify', 'HEAD']);
  if (kopf.code !== 0) {
    // Leerer Projektordner: die Ferne ist der Stand.
    await git(['-C', cwd, 'reset', '--hard', `origin/${branch}`]);
  }
}

async function synchronisiere({ projectId }, deps = {}) {
  const { run = gitRoh, store = gitStore } = deps;
  const git = macheGit(run);

  const kopplung = await store.getKopplung({ projectId });
  if (!kopplung) {
    throw new NotFoundError('Für dieses Projekt ist kein Repository gekoppelt');
  }
  // Sperre je Projekt — nie zwei Syncs gleichzeitig auf demselben Checkout.
  if (aktiveSyncs.has(projectId)) {
    throw new ConflictError('Für dieses Projekt läuft bereits eine Synchronisierung');
  }
  aktiveSyncs.add(projectId);

  const pat = await store.entschluesselePat({ projectId });
  const branch = kopplung.branch || 'main';
  const cwd = kopplung.local_path || checkoutPfad(projectId);

  try {
    // (1) Arbeitsbaum sicherstellen. Ein VORHANDENES `.git` muss noch auf DIESE
    // Ferne + DIESEN Branch zeigen — nach einer Neukopplung (anderes Repo/anderer
    // Branch) zeigt es sonst noch aufs alte origin, und wir pushten ins FALSCHE
    // Repository. Passt etwas nicht, wird die Verwaltung neu aufgesetzt.
    //
    // NEU AUFSETZEN heisst: `.git` weg, Dateien bleiben. Bis zum 22.08.2026 stand
    // hier `fs.rm(cwd)`, und `cwd` ist der Projektordner selbst. Wer ein Projekt
    // mit Dateien an ein Repo koppelte und auf Synchronisieren drueckte, verlor
    // beim ersten Lauf alles, was nicht im Repo stand.
    let brauchtAufsetzen = !(await istRepo(cwd));
    if (!brauchtAufsetzen) {
      const origin = await run(['-C', cwd, 'remote', 'get-url', 'origin']);
      const aktBranch = await run(['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']);
      const fernePasst = origin.code === 0 && origin.stdout.trim() === kopplung.repo_url;
      const branchPasst = aktBranch.code === 0 && aktBranch.stdout.trim() === branch;
      brauchtAufsetzen = !fernePasst || !branchPasst;
    }
    if (brauchtAufsetzen) {
      await setzeArbeitsbaumAuf({ cwd, repoUrl: kopplung.repo_url, branch, pat, git, run });
    }

    // (1b) Schutz gegen einen zuvor unsauber abgebrochenen Merge: liegen noch
    // ungemergte Pfade herum, würde `add -A` die Konfliktmarker als „gelöst"
    // committen und ins Repo pushen. Stattdessen sichtbar als Konflikt melden.
    const ungemergt = await run(['-C', cwd, 'ls-files', '-u']);
    if (ungemergt.stdout.trim()) {
      await store.markiereSync({
        projectId,
        status: 'konflikt',
        error: 'Ungelöster Merge-Konflikt im Checkout, bitte im Repository auflösen',
        localPath: cwd,
      });
      throw new ConflictError('Ungelöster Merge-Konflikt, bitte im Repository auflösen', {
        conflicts: [],
      });
    }

    // (2) Lokale Änderungen einsammeln (macht den Push zwei-wegig).
    await git(['-C', cwd, 'add', '-A']);
    const dirty = await git(['-C', cwd, 'status', '--porcelain']);
    if (dirty.stdout.trim()) {
      await git(['-C', cwd, 'commit', '-m', `Arasul-Sync ${new Date().toISOString()}`]);
    }

    // (3) Ferne holen und mergen — nur, wenn der Remote-Branch existiert.
    // RESTGRENZE (Plan 014, Phase 5): Ein Merge, der eine Datei am Pfad einer
    // ausgestellten Rechnung ändert, würde sie überschreiben (der 0444-Modus
    // schützt nicht gegen git-Arbeitsbaum-Updates). Das ist eine bewusst
    // ungeschützte, sehr unwahrscheinliche Kombination: Finanz-Projekte mit
    // Rechnungen sind keine Code-Repos, und git-gekoppelte Projekte sind vom
    // Auto-Index ausgenommen. Wer beides koppelt, verantwortet die Ablage
    // seines Remotes selbst; der klare Zerstörungspfad (`trenne`) ist gesperrt.
    const fetch = await run(['-C', cwd, 'fetch', 'origin', branch], { pat });
    const remoteRef = await run(['-C', cwd, 'rev-parse', '--verify', `origin/${branch}`]);
    if (fetch.code === 0 && remoteRef.code === 0) {
      // `--allow-unrelated-histories`: beim ERSTEN Sync eines Projekts, das schon
      // Dateien hatte, sind der lokale Bestandscommit und die Ferne zwei
      // getrennte Historien. Ohne das Kennzeichen verweigert git den Merge, und
      // der Nutzer saehe „refusing to merge unrelated histories" statt seiner
      // Dateien. Die Schutzwirkung des Kennzeichens (Versehen gegen ein fremdes
      // Repo) hat hier keinen Sinn: die Kopplung IST die ausdrueckliche Ansage,
      // dass diese beiden zusammengehoeren.
      const merge = await run([
        '-C',
        cwd,
        'merge',
        '--no-edit',
        '--allow-unrelated-histories',
        `origin/${branch}`,
      ]);
      if (merge.code !== 0) {
        const konflikte = await run(['-C', cwd, 'diff', '--name-only', '--diff-filter=U']);
        // Baum wieder freiräumen — MUSS klappen, sonst bliebe ein halb-gemergter
        // Baum stehen, den der nächste Lauf (1b) fängt.
        await git(['-C', cwd, 'merge', '--abort']);
        const dateien = konflikte.stdout
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
        await store.markiereSync({
          projectId,
          status: 'konflikt',
          error: `Merge-Konflikt in ${dateien.length} Datei(en)`,
          localPath: cwd,
        });
        throw new ConflictError('Merge-Konflikt, bitte im Repository auflösen', {
          conflicts: dateien,
        });
      }
    }

    // (4) Zurückschieben.
    await git(['-C', cwd, 'push', 'origin', `HEAD:${branch}`], { pat });

    const head = await run(['-C', cwd, 'rev-parse', '--short', 'HEAD']);
    const commit = head.code === 0 ? head.stdout.trim() : null;
    const aktualisiert = await store.markiereSync({
      projectId,
      status: 'synchronisiert',
      error: null,
      commit,
      localPath: cwd,
    });
    logger.info(`Git-Sync ok: Projekt ${projectId} @ ${commit}`);
    return { status: 'synchronisiert', commit, pushed: true, kopplung: aktualisiert };
  } catch (err) {
    // ConflictError ist bereits protokolliert & aussagekräftig — durchreichen.
    if (err instanceof ConflictError) {
      throw err;
    }
    await store.markiereSync({
      projectId,
      status: 'fehler',
      error: err.message || 'Sync fehlgeschlagen',
      localPath: cwd,
    });
    throw err;
  } finally {
    aktiveSyncs.delete(projectId);
  }
}

/**
 * Löst die Kopplung: der verschlüsselte PAT wird gelöscht und die Git-Verwaltung
 * (`.git`) aus dem Projektordner entfernt. **Die Dateien bleiben.**
 *
 * Bis zum 22.08.2026 löschte diese Funktion `checkoutPfad(projectId)` rekursiv,
 * also den Projektordner. „Kopplung trennen" in der Oberfläche hat damit alle
 * Dateien des Projekts gelöscht: Dokumente, Notizen, Code. Wer eine Kopplung
 * löst, will die Verbindung los sein, nicht seine Arbeit.
 *
 * Der Rechnungs-Schutz (Plan 014, Phase 5) steht weiter davor. Er ist seit dem
 * Umbau eigentlich gegenstandslos — es wird ja nichts mehr gelöscht, was eine
 * Rechnung sein könnte — bleibt aber als zweite Sicherung stehen: sollte hier
 * je wieder ein rekursives Löschen einziehen, faellt es an ihm auf.
 */
async function trenne({ projectId }, deps = {}) {
  const { store = gitStore, db = require('../../database') } = deps;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS anzahl FROM rechnungsnummern WHERE projekt_id = $1`,
    [projectId]
  );
  if ((rows[0]?.anzahl ?? 0) > 0) {
    throw new ConflictError(
      `Das Projekt enthält ${rows[0].anzahl} ausgestellte, unveränderliche Rechnung(en), ` +
        'die Git-Kopplung kann nicht getrennt werden, ohne diese Belege zu löschen. ' +
        'Bitte die Rechnungen zuerst sichern/exportieren.'
    );
  }
  const geloescht = await store.loescheKopplung({ projectId });
  try {
    await fs.rm(path.join(checkoutPfad(projectId), '.git'), {
      recursive: true,
      force: true,
    });
  } catch (err) {
    logger.warn(`Git-Verwaltung ${projectId} nicht entfernbar: ${err.message}`);
  }
  return geloescht;
}

module.exports = {
  verbinde,
  status,
  synchronisiere,
  trenne,
  // für Tests:
  gitRoh,
  checkoutPfad,
  PROJECT_GIT_DIR,
};
