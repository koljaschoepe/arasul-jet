/**
 * Pfad-Sperre für Flows (Plan 011, Schritt 6).
 *
 * Anders als bei den Workspace-Agenten (ein einziger Ordner) darf ein Flow
 * MEHRERE Ordner deklarieren — etwa Vorlagen und Verträge zugleich (§8). Der
 * ERSTE Ordner ist das Arbeitsverzeichnis: relative Pfade werden gegen ihn
 * aufgelöst. Ein absoluter Pfad darf jeden der erlaubten Ordner treffen.
 *
 * Regel ohne Ausnahme: Jeder Dateizugriff eines Flows läuft durch
 * `resolveRealWithinRoots`. Die rein lexikalische Prüfung genügt nicht — ein
 * Flow mit Terminal-Recht kann einen Symlink aus dem Ordner heraus legen und
 * ihn danach über das Datei-Werkzeug lesen oder beschreiben. Deshalb wird der
 * tiefste EXISTIERENDE Vorfahre über `realpath` aufgelöst (jedem Symlink
 * folgend) und die Zugehörigkeit erneut geprüft; ein baumelnder Symlink als
 * letztes Glied wird abgewiesen, weil `realpath` ihn nicht auflösen kann.
 */

const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../../utils/errors');

/**
 * Normalisiert die Ordnerliste eines Flows.
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
    throw new ValidationError('Der Flow hat keinen erlaubten Ordner');
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
 * Der `projekt://`-Praefix, wie ihn ein Flow-Argument vom Typ `ordner` traegt.
 *
 * Er gehoert in die Argumente eines Laufs, nicht in einen Werkzeug-Pfad. Ein
 * Modell weiss das nicht: es liest im Prompt "Schreibe das Angebot nach
 * {{kunde}}/angebot.md", bekommt dort
 * `projekt://aktiv/Abnahme Musterbau GmbH` eingesetzt und reicht genau das an
 * `dateien_schreiben` weiter.
 *
 * Am 23.08.2026 auf dem Orin gemessen: der Lauf meldete Erfolg, die Antwort
 * nannte `angebot.md`, und auf der Platte lag
 *
 *   Abnahme Musterbau GmbH/projekt:/aktiv/Abnahme Musterbau GmbH/angebot.md
 *
 * Ein Kunde, der in seinen Ordner sieht, findet einen Ordner namens `projekt:`
 * und nicht sein Angebot.
 *
 * Aufgeloest wird hier und nicht beim Einsetzen des Platzhalters, weil es hier
 * fuer JEDES Werkzeug gilt, auch fuer einen Pfad, den das Modell selbst aus
 * dem Prompt zusammensetzt.
 */
const PROJEKT_PREFIX = 'projekt://';

/**
 * Nimmt einem Pfad den `projekt://…`-Kopf ab.
 *
 * Der Rest ist bewusst RELATIV: die erste Wurzel ist das Arbeitsverzeichnis,
 * und ein `ordner`-Argument wird genau dazu. `projekt://aktiv/Kunde/x.md` und
 * `projekt://<id>/Kunde/x.md` zeigen beide auf dasselbe, sobald der Lauf dort
 * arbeitet.
 *
 * `projekt://aktiv` allein ist das Arbeitsverzeichnis selbst.
 *
 * @param {string} roh
 * @returns {string} der Pfad ohne Praefix, oder unveraendert
 */
function ohneProjektPraefix(roh) {
  if (typeof roh !== 'string' || !roh.startsWith(PROJEKT_PREFIX)) {
    return roh;
  }
  const rest = roh.slice(PROJEKT_PREFIX.length);
  const schraeg = rest.indexOf('/');
  // `projekt://aktiv` -> '' (das Arbeitsverzeichnis selbst)
  return schraeg === -1 ? '.' : rest.slice(schraeg + 1) || '.';
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
  const raw = ohneProjektPraefix(typeof relPath === 'string' ? relPath.trim() : '');

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
  // mal der andere Ordner — ein Flow soll vorhersagbar dorthin schreiben, wo
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
      // fehlender Ordner nicht den ganzen Flow blockiert.
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
  // Unter Test, weil ein Fehler hier nicht auffaellt, sondern eine Datei an
  // einen Ort legt, an dem niemand sucht.
  ohneProjektPraefix,
  normalizeRoots,
  resolveWithinRoots,
  resolveRealWithinRoots,
  assertFdWithinRoots,
};
