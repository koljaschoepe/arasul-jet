/**
 * Pfad-Sperre für Skills (Plan 011, Schritt 6).
 *
 * Anders als bei den Workspace-Agenten (ein einziger Ordner) darf ein Skill
 * MEHRERE Ordner deklarieren — etwa Vorlagen und Verträge zugleich (§8). Der
 * ERSTE Ordner ist das Arbeitsverzeichnis: relative Pfade werden gegen ihn
 * aufgelöst. Ein absoluter Pfad darf jeden der erlaubten Ordner treffen.
 *
 * Regel ohne Ausnahme: Jeder Dateizugriff eines Skills läuft durch
 * `resolveRealWithinRoots`. Die rein lexikalische Prüfung genügt nicht — ein
 * Skill mit Terminal-Recht kann einen Symlink aus dem Ordner heraus legen und
 * ihn danach über das Datei-Werkzeug lesen oder beschreiben. Deshalb wird der
 * tiefste EXISTIERENDE Vorfahre über `realpath` aufgelöst (jedem Symlink
 * folgend) und die Zugehörigkeit erneut geprüft; ein baumelnder Symlink als
 * letztes Glied wird abgewiesen, weil `realpath` ihn nicht auflösen kann.
 */

const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../../utils/errors');

/**
 * Normalisiert die Ordnerliste eines Skills.
 * @param {string[]|string} roots
 * @returns {string[]} Absolute Pfade, Reihenfolge erhalten, Duplikate entfernt.
 * @throws {ValidationError} wenn keine Wurzel übrig bleibt.
 */
function normalizeRoots(roots) {
  const list = (Array.isArray(roots) ? roots : [roots])
    .filter(r => typeof r === 'string' && r.trim().length > 0)
    .map(r => path.resolve(r.trim()));
  const unique = [...new Set(list)];
  if (unique.length === 0) {
    throw new ValidationError('Der Skill hat keinen erlaubten Ordner');
  }
  return unique;
}

/**
 * Lexikalische Prüfung gegen EINE Wurzel.
 *
 * Der Vergleich unterscheidet Gross- und Kleinschreibung, auch auf einem
 * case-insensitiven Dateisystem (macOS). Das ist die sichere Richtung: Ein
 * abweichend geschriebener Pfad wird ABGEWIESEN, nicht durchgelassen. Auf dem
 * Zielsystem (Linux) spielt es ohnehin keine Rolle.
 *
 * @returns {string|null} Absoluter Pfad, oder null wenn er ausbricht.
 */
function within(root, target) {
  const rel = path.relative(root, target);
  if (rel === '') {
    return target;
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return target;
}

/**
 * Löst `relPath` gegen die erlaubten Ordner auf — rein lexikalisch.
 *
 * Relative Pfade gehen gegen die erste Wurzel (das Arbeitsverzeichnis).
 * Absolute Pfade dürfen in jeder Wurzel liegen.
 *
 * @param {string[]|string} roots
 * @param {string} relPath - `.`/'' == Arbeitsverzeichnis.
 * @returns {string} Absoluter, eingesperrter Pfad.
 * @throws {ValidationError} wenn der Pfad alle erlaubten Ordner verlässt.
 */
function resolveWithinRoots(roots, relPath) {
  const list = normalizeRoots(roots);
  const raw = typeof relPath === 'string' ? relPath.trim() : '';

  if (path.isAbsolute(raw)) {
    for (const root of list) {
      const hit = within(root, path.resolve(raw));
      if (hit) {
        return hit;
      }
    }
    throw new ValidationError(
      `Pfad "${relPath}" liegt ausserhalb der erlaubten Ordner (${list.join(', ')})`
    );
  }

  // Relativ → Arbeitsverzeichnis. Bewusst NICHT der Reihe nach durch alle
  // Wurzeln probiert: "bericht.md" wäre sonst je nach Dateibestand mal der eine,
  // mal der andere Ordner — ein Skill soll vorhersagbar dorthin schreiben, wo
  // er es erwartet.
  const workdir = list[0];
  const hit = within(workdir, path.resolve(workdir, raw || '.'));
  if (!hit) {
    throw new ValidationError(`Pfad "${relPath}" liegt ausserhalb des Arbeitsverzeichnisses`);
  }
  return hit;
}

/**
 * Wie `resolveWithinRoots`, aber zusätzlich symlink-sicher.
 *
 * @param {string[]|string} roots
 * @param {string} relPath
 * @returns {string} Absoluter, symlink-aufgelöster, eingesperrter Pfad.
 * @throws {ValidationError} wenn der Pfad auf irgendeinem Weg ausbricht.
 */
function resolveRealWithinRoots(roots, relPath) {
  const list = normalizeRoots(roots);
  const target = resolveWithinRoots(list, relPath); // erst lexikalisch

  // Die Wurzeln selbst symlink-auflösen — sonst schlägt der Vergleich fehl,
  // wenn schon der erlaubte Ordner über einen Symlink erreicht wird.
  const realRoots = [];
  for (const root of list) {
    try {
      realRoots.push(fs.realpathSync(root));
    } catch {
      // Ein (noch) nicht existierender Ordner ist keine Wurzel, in der etwas
      // liegen könnte — überspringen statt hart scheitern, damit ein einzelner
      // fehlender Ordner nicht den ganzen Skill blockiert.
    }
  }
  if (realRoots.length === 0) {
    throw new ValidationError('Keiner der erlaubten Ordner existiert');
  }

  const tail = [];
  let cur = target;
  for (;;) {
    let real;
    try {
      real = fs.realpathSync(cur);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // `cur` kann selbst ein BAUMELNDER Symlink sein (lstat klappt,
        // realpath nicht) — durch ihn zu schreiben würde aus dem Ordner
        // herausführen.
        let lst = null;
        try {
          lst = fs.lstatSync(cur);
        } catch {
          lst = null;
        }
        if (lst && lst.isSymbolicLink()) {
          throw new ValidationError(
            `Pfad "${relPath}" ist ein Symlink aus den erlaubten Ordnern heraus`
          );
        }
        const parent = path.dirname(cur);
        if (parent === cur) {
          break; // Dateisystem-Wurzel erreicht, ohne einen existierenden Vorfahren zu finden
        }
        tail.unshift(path.basename(cur));
        cur = parent;
        continue;
      }
      throw new ValidationError(`Pfad "${relPath}" kann nicht aufgeloest werden`);
    }

    const full = tail.length ? path.join(real, ...tail) : real;
    for (const realRoot of realRoots) {
      if (within(realRoot, full)) {
        return full;
      }
    }
    throw new ValidationError(`Pfad "${relPath}" verlaesst die erlaubten Ordner (Symlink)`);
  }

  // Unerreichbar, solange mindestens eine Wurzel existiert — fail closed.
  throw new ValidationError(`Pfad "${relPath}" kann nicht aufgeloest werden`);
}

/**
 * Prüft einen bereits GEÖFFNETEN Dateideskriptor gegen die erlaubten Ordner.
 *
 * Das schliesst das Zeitfenster zwischen Prüfung und Zugriff (TOCTOU), das eine
 * reine Pfad-Prüfung offen lässt: Wer zwischen `resolveRealWithinRoots` und dem
 * eigentlichen `readFile` einen Pfadbestandteil gegen einen Symlink tauscht,
 * lenkt den Zugriff nach draussen. Genau diese Fähigkeit bringt das
 * Terminal-Werkzeug mit (Plan 011, Schritt 7).
 *
 * Der Deskriptor zeigt immer auf die Datei, die beim Öffnen getroffen wurde —
 * ein späterer Tausch am Pfad ändert daran nichts mehr. Unter Linux verrät
 * `/proc/self/fd/<fd>`, welche Datei das ist; die Prüfung greift damit auch für
 * ZWISCHENverzeichnisse, die `O_NOFOLLOW` (nur letzte Komponente) nicht abdeckt.
 *
 * Ohne `/proc` (etwa macOS in der Entwicklung) ist die Prüfung nicht möglich;
 * dann bleibt es beim vorgelagerten `resolveRealWithinRoots` plus `O_NOFOLLOW`.
 * Auf dem Zielsystem — Linux im Container — greift der volle Schutz.
 *
 * @param {string[]|string} roots
 * @param {number} fd - Offener Dateideskriptor.
 * @param {string} relPath - Nur für die Fehlermeldung.
 * @returns {string|null} Der tatsächlich geöffnete Pfad, oder null wenn nicht prüfbar.
 * @throws {ValidationError} wenn der Deskriptor ausserhalb der Ordner zeigt.
 */
function assertFdWithinRoots(roots, fd, relPath) {
  let echt;
  try {
    echt = fs.readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null; // kein /proc — Aufrufer verlässt sich auf die Vorprüfung
  }
  // Gelöschte Dateien hängt Linux ein " (deleted)" an.
  echt = echt.replace(/ \(deleted\)$/, '');

  for (const root of normalizeRoots(roots)) {
    let realRoot;
    try {
      realRoot = fs.realpathSync(root);
    } catch {
      continue;
    }
    if (within(realRoot, echt)) {
      return echt;
    }
  }
  throw new ValidationError(
    `Pfad "${relPath}" zeigte beim Zugriff aus den erlaubten Ordnern heraus (${echt})`
  );
}

module.exports = {
  normalizeRoots,
  resolveWithinRoots,
  resolveRealWithinRoots,
  assertFdWithinRoots,
};
