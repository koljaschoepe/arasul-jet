/**
 * phasenlauf.mjs — der Ablauf einer Phase aus Plan 024, als Code statt als
 * Anweisung.
 *
 * Warum als Skript und nicht als Auftragstext: waehrend des Urlaubslaufs
 * (30.08. bis 12.09.2026) greift niemand ein. Ein Kontrollfluss, der in einer
 * Anweisung steht, ist verhandelbar — ein Agent, der zwoelf Stunden gegen ein
 * Kriterium arbeitet, das er aendern darf, praezisiert es irgendwann. Hier ist
 * er es nicht.
 *
 * Zwei Dinge trennt diese Datei bewusst:
 *
 *   1. den ABLAUF (diese Datei) — deterministisch, testbar, ohne Aussenwelt
 *   2. die WERKZEUGE (`werkzeuge`-Objekt) — Agenten rufen, mergen, deployen,
 *      Abnahmen ausfuehren
 *
 * Nur wegen dieser Trennung laesst sich der Trockenlauf fuehren, den Plan 024
 * vor Phase 1 verlangt: `scripts/test/phasenlauf-test.mjs` setzt Attrappen ein
 * und prueft den Ablauf, ohne einen Agenten zu rufen oder etwas zu deployen.
 *
 * Aufruf im Ernstfall (die Werkzeuge kommen von aussen herein):
 *   import { fuehrePhase } from './phasenlauf.mjs'
 *   await fuehrePhase({ phase: 1, pfad: 'docs/plans/active/024-urlaubslauf', werkzeuge })
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Die einzigen erlaubten Zustaende. Nichts anderes. */
export const ZUSTAENDE = ['offen', 'laeuft', 'gruen', 'rot', 'uebersprungen'];

/**
 * Laedt die Aufgabendatei.
 *
 * Sie ist das Gedaechtnis des Laufs. Ein Vorhaben im Kopf des Agenten
 * ueberlebt keine Kontextzusammenfassung, eine Datei im Repo schon.
 */
export async function ladeAufgaben(pfad) {
  const datei = path.join(pfad, 'aufgaben.json');
  const roh = JSON.parse(await readFile(datei, 'utf8'));
  for (const a of roh) {
    if (!ZUSTAENDE.includes(a.zustand)) {
      throw new Error(`Aufgabe ${a.id}: Zustand "${a.zustand}" gibt es nicht`);
    }
  }
  return roh;
}

/**
 * Schreibt den Zustand zurueck — nach JEDEM Schritt, nicht am Ende.
 *
 * Der Grund steht in Plan 024: ein Abbruch mitten in der Nacht darf den
 * naechsten Morgen nicht bei null anfangen lassen.
 */
export async function schreibeAufgaben(pfad, aufgaben) {
  const datei = path.join(pfad, 'aufgaben.json');
  await writeFile(datei, `${JSON.stringify(aufgaben, null, 2)}\n`, 'utf8');
}

/**
 * Fuehrt eine Phase aus. Gibt einen Bericht zurueck, keine Seitenwirkung nach
 * aussen ausser ueber `werkzeuge`.
 *
 * `werkzeuge` muss bieten:
 *   agent({auftrag, label})      -> {fertig, prNummer, begruendung}
 *   mergeUndDeploy(prNummer)     -> {gemergt}
 *   geraetGesund()               -> boolean
 *   fuehreAbnahmeAus(befehl)     -> {gruen, stelle}
 *   volleReihe(wann)             -> {gruen, ergebnis}
 *   schreibeTagesseite(bericht)  -> void
 *   sonde({aufgabe, lauf})       -> void        (optional)
 */
export async function fuehrePhase({ phase, pfad, werkzeuge, protokoll = () => {} }) {
  const alle = await ladeAufgaben(pfad);
  const dieser = alle.filter(a => a.phase === phase);

  // Je ABNAHME zaehlen, nicht je Stelle. Der Zusatz ist der Kern der
  // Notbremse: am 24.08.2026 war dieselbe Abnahme zweimal rot an zwei
  // verschiedenen Stellen, und die Ursache war ein Messfehler. Eine Regel, die
  // auf dieselbe Stelle abhebt, laesst einen wandernden Messfehler durch.
  const rotZaehler = new Map();
  const letzteStelle = new Map();

  const bericht = {
    phase,
    gestoppt: false,
    grund: '',
    gruen: 0,
    rot: 0,
    uebersprungen: 0,
    sonden: [],
    reihen: [],
  };

  const stoppe = grund => {
    if (bericht.gestoppt) return;
    bericht.gestoppt = true;
    bericht.grund = grund;
    protokoll(`STOPP: ${grund}`);
  };

  async function arbeiteStrang(liste, name) {
    for (const a of liste) {
      if (bericht.gestoppt) return;

      a.zustand = 'laeuft';
      a.versuche = (a.versuche ?? 0) + 1;
      await schreibeAufgaben(pfad, alle);

      // Ein Subagent bekommt GENAU EINE Aufgabe und gibt ein Ergebnis zurueck,
      // nicht seinen Leseverlauf. Ueber zwoelf Stunden ist ein duenner
      // Hauptagent die eigentliche Schwierigkeit.
      const ergebnis = await werkzeuge.agent({
        auftrag: a,
        label: `${name}:${a.id}`,
        deckelMinuten: a.deckel_minuten,
      });

      if (!ergebnis?.fertig) {
        // Keine Rueckfrage an den Menschen. Notieren, ueberspringen,
        // weitermachen — waehrend des Laufs ist niemand da, der antwortet.
        a.zustand = 'uebersprungen';
        a.notiz = ergebnis?.begruendung ?? 'ohne Ergebnis zurueckgekommen';
        bericht.uebersprungen++;
        await schreibeAufgaben(pfad, alle);
        continue;
      }

      if (ergebnis.prNummer) {
        await werkzeuge.mergeUndDeploy(ergebnis.prNummer);
        if (!(await werkzeuge.geraetGesund())) {
          a.zustand = 'rot';
          a.notiz = 'Deploy ohne gesundes Geraet';
          await schreibeAufgaben(pfad, alle);
          stoppe('Deploy ohne gesundes Geraet');
          return;
        }
      }

      // Nur die betroffene Einzelabnahme, nicht die volle Reihe. Ein Deploy
      // kostet Sekunden, die Reihe zwanzig Minuten.
      const lauf = await werkzeuge.fuehreAbnahmeAus(a.abnahme);

      if (lauf.gruen) {
        a.zustand = 'gruen';
        bericht.gruen++;
        rotZaehler.set(a.abnahme, 0);
      } else {
        a.zustand = 'rot';
        a.notiz = lauf.stelle ?? '';
        bericht.rot++;
        const zahl = (rotZaehler.get(a.abnahme) ?? 0) + 1;
        rotZaehler.set(a.abnahme, zahl);

        const vorige = letzteStelle.get(a.abnahme);
        letzteStelle.set(a.abnahme, lauf.stelle);

        // Zweimal rot an WECHSELNDER Stelle heisst zuerst Messfehler, nicht
        // Regression. Ohne Sonde wird kein Verdacht gegen eine Abhaengigkeit
        // notiert: am 24.08.2026 waeren sonst Vite 8 und pdfjs 6 als
        // Verursacher in den Plan gewandert, beide unschuldig. Der wahre
        // Verursacher stand im Ort der Meldung.
        if (zahl === 2 && vorige !== undefined && vorige !== lauf.stelle) {
          bericht.sonden.push({ abnahme: a.abnahme, stellen: [vorige, lauf.stelle] });
          await werkzeuge.sonde?.({ aufgabe: a, lauf });
        }

        if (zahl >= 3) {
          await schreibeAufgaben(pfad, alle);
          stoppe(`dreimal rot: ${a.abnahme}`);
          return;
        }
      }
      await schreibeAufgaben(pfad, alle);
      await pruefeMitte();
    }
  }

  /**
   * Die Reihe „zur Mitte" muss in der Mitte laufen, nicht am Ende.
   *
   * Im ersten Entwurf standen beide Reihen hintereinander am Schluss. Das
   * waeren zwanzig Minuten fuer eine Messung, die dasselbe misst wie die
   * naechste zwanzig Minuten spaeter. Der Sinn der Mitte-Reihe ist, einen
   * Bruch zu finden, waehrend noch Zeit ist, ihn zu beheben.
   *
   * „Mitte" heisst: die Haelfte aller Aufgaben dieser Phase hat einen
   * Endzustand. Bei zwei nebenlaeufigen Straengen gibt es keinen schaerferen
   * Begriff, und ein schaerferer waere hier auch nichts wert.
   */
  let mitteGelaufen = false;
  async function pruefeMitte() {
    if (mitteGelaufen || bericht.gestoppt || zuTun === 0) return;
    // Steht schon etwas auf rot, laeuft die Reihe nicht. Der Trockenlauf hat
    // genau das gefunden: bei vier roten Aufgaben startete die Mitte-Reihe nach
    // der zweiten, und unmittelbar danach griff die Notbremse. Das waeren
    // zwanzig Minuten Messung auf einem Stand, von dem schon bekannt ist, dass
    // er kaputt ist. Die Mitte-Reihe soll einen UNBEKANNTEN Bruch finden.
    if (dieser.some(a => a.zustand === 'rot')) return;
    const fertig = dieser.filter(a => ['gruen', 'rot', 'uebersprungen'].includes(a.zustand)).length;
    if (fertig * 2 < zuTun) return;
    mitteGelaufen = true;
    const r = await werkzeuge.volleReihe('Mitte');
    bericht.reihen.push({ wann: 'Mitte', gruen: r.gruen });
  }

  const gate = dieser.filter(a => a.strang === 'gate' && a.zustand === 'offen');
  const zielbild = dieser.filter(a => a.strang === 'zielbild' && a.zustand === 'offen');
  const zuTun = gate.length + zielbild.length;

  // Beide Straenge nebeneinander. Wo sie sich beruehren, gewinnt der
  // Gate-Strang — deshalb steht er zuerst in der Liste.
  await Promise.all([arbeiteStrang(gate, 'Gate'), arbeiteStrang(zielbild, 'Zielbild')]);

  // Volle Reihe zweimal je Phase. Nach einem Stopp nicht mehr: die Phase ist
  // beendet, und eine Messung auf einem Stand, den niemand mehr anfasst,
  // kostet zwanzig Minuten fuer nichts.
  if (!bericht.gestoppt) {
    // Falls die Phase so kurz war, dass die Mitte nie erreicht wurde, holt
    // dieser Aufruf sie nach. Zweimal dieselbe Reihe hintereinander waere
    // vierzig Minuten fuer eine Aussage.
    await pruefeMitte();
    const r = await werkzeuge.volleReihe('Ende');
    bericht.reihen.push({ wann: 'Ende', gruen: r.gruen });
  }

  await werkzeuge.schreibeTagesseite(bericht);
  return bericht;
}
