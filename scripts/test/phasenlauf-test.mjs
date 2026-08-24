/**
 * phasenlauf-test.mjs — der Trockenlauf, den Plan 024 vor Phase 1 verlangt.
 *
 * Er prueft den Ablauf einer Phase, ohne einen Agenten zu rufen, ohne zu
 * mergen und ohne zu deployen: `werkzeuge` ist eine Attrappe. Genau dafuer
 * trennt `scripts/util/phasenlauf.mjs` den Ablauf von den Werkzeugen.
 *
 * Plan 024 nennt drei Dinge, die der Trockenlauf belegen muss:
 *
 *   1. das Skript laeuft mit einer Aufgabendatei aus drei Zeilen durch
 *   2. die Notbremse greift, wenn eine Abnahme dreimal rot ist
 *   3. der Zustand stimmt nach einem harten Abbruch
 *
 * Dazu kommen zwei Faelle, die aus dem 24.08.2026 stammen: dass die Notbremse
 * auch bei WECHSELNDEN Stellen zaehlt, und dass bei der zweiten wechselnden
 * Stelle eine Sonde laeuft, bevor irgendjemand eine Regression notiert.
 *
 * Aufruf: node scripts/test/phasenlauf-test.mjs
 */

import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fuehrePhase, ladeAufgaben } from '../util/phasenlauf.mjs';

let fehler = 0;
const pruefe = (was, ok, detail = '') => {
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  if (!ok) fehler = 1;
};

/** Eine Aufgabe, wie sie in aufgaben.json steht. */
const aufgabe = (id, strang, abnahme) => ({
  id,
  phase: 1,
  strang,
  titel: `Testaufgabe ${id}`,
  abnahme,
  bedingung: 'gruen',
  deckel_minuten: 30,
  zustand: 'offen',
  versuche: 0,
  notiz: '',
});

/**
 * Attrappen. Jede merkt sich, was mit ihr gemacht wurde — das ist der Beleg.
 * `abnahmeAntwort` ist eine Funktion, damit jeder Fall sein eigenes Verhalten
 * mitbringen kann.
 */
function werkzeugkasten({ agentAntwort, abnahmeAntwort, gesund = () => true } = {}) {
  const spur = { agenten: [], deploys: [], abnahmen: [], reihen: [], sonden: 0, tagesseite: null };
  return {
    spur,
    werkzeuge: {
      async agent({ auftrag, label }) {
        spur.agenten.push(label);
        return agentAntwort ? agentAntwort(auftrag) : { fertig: true, prNummer: 100 };
      },
      async mergeUndDeploy(pr) {
        spur.deploys.push(pr);
        return { gemergt: true };
      },
      async geraetGesund() {
        return gesund();
      },
      async fuehreAbnahmeAus(befehl) {
        spur.abnahmen.push(befehl);
        return abnahmeAntwort ? abnahmeAntwort(befehl, spur.abnahmen.length) : { gruen: true };
      },
      async volleReihe(wann) {
        spur.reihen.push(wann);
        return { gruen: true };
      },
      async sonde() {
        spur.sonden++;
      },
      async schreibeTagesseite(bericht) {
        spur.tagesseite = bericht;
      },
    },
  };
}

async function mitOrdner(aufgaben, arbeit) {
  const ordner = await mkdtemp(path.join(tmpdir(), 'phasenlauf-'));
  await writeFile(path.join(ordner, 'aufgaben.json'), JSON.stringify(aufgaben, null, 2));
  try {
    return await arbeit(ordner);
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

// --- 1. Drei Zeilen, alles gruen --------------------------------------------
{
  const aufgaben = [
    aufgabe('P1-A', 'gate', 'abnahme-a'),
    aufgabe('P1-B', 'gate', 'abnahme-b'),
    aufgabe('P1-C', 'zielbild', 'abnahme-c'),
  ];
  await mitOrdner(aufgaben, async ordner => {
    const { spur, werkzeuge } = werkzeugkasten();
    const bericht = await fuehrePhase({ phase: 1, pfad: ordner, werkzeuge });
    const danach = await ladeAufgaben(ordner);

    pruefe('drei Aufgaben laufen durch', bericht.gruen === 3, `${bericht.gruen} gruen`);
    pruefe('nicht gestoppt', !bericht.gestoppt);
    pruefe(
      'jede Aufgabe steht am Ende auf gruen',
      danach.every(a => a.zustand === 'gruen'),
      danach.map(a => a.zustand).join(', ')
    );
    pruefe('je Aufgabe ein Agent', spur.agenten.length === 3, spur.agenten.join(', '));
    pruefe('je Aufgabe ein Deploy', spur.deploys.length === 3);
    pruefe(
      'zwei volle Reihen, Mitte vor Ende',
      spur.reihen.join(',') === 'Mitte,Ende',
      spur.reihen.join(',')
    );
    pruefe('eine Tagesseite', spur.tagesseite !== null);
  });
}

// --- 2. Die Notbremse bei dreimal rot ---------------------------------------
{
  const aufgaben = [
    aufgabe('P1-A', 'gate', 'immer-rot'),
    aufgabe('P1-B', 'gate', 'immer-rot'),
    aufgabe('P1-C', 'gate', 'immer-rot'),
    aufgabe('P1-D', 'gate', 'immer-rot'),
  ];
  await mitOrdner(aufgaben, async ordner => {
    // Dieselbe Abnahme, jedes Mal eine ANDERE Stelle. Genau der Fall vom
    // 24.08.2026: eine Regel, die auf dieselbe Stelle abhebt, wuerde hier
    // nicht greifen.
    const { spur, werkzeuge } = werkzeugkasten({
      abnahmeAntwort: (_b, n) => ({ gruen: false, stelle: `stelle-${n}` }),
    });
    const bericht = await fuehrePhase({ phase: 1, pfad: ordner, werkzeuge });
    const danach = await ladeAufgaben(ordner);

    pruefe('dreimal rot stoppt die Phase', bericht.gestoppt, bericht.grund);
    pruefe('der Grund nennt die Abnahme', bericht.grund.includes('immer-rot'), bericht.grund);
    pruefe('genau drei Versuche, nicht vier', spur.abnahmen.length === 3, `${spur.abnahmen.length}`);
    pruefe(
      'die vierte Aufgabe bleibt offen',
      danach.find(a => a.id === 'P1-D').zustand === 'offen'
    );
    pruefe(
      'bei der zweiten wechselnden Stelle lief eine Sonde',
      spur.sonden === 1,
      `${spur.sonden} Sonden`
    );
    pruefe('nach dem Stopp keine volle Reihe', spur.reihen.length === 0, spur.reihen.join(','));
  });
}

// --- 3. Der Zustand nach einem harten Abbruch -------------------------------
{
  const aufgaben = [
    aufgabe('P1-A', 'gate', 'abnahme-a'),
    aufgabe('P1-B', 'gate', 'abnahme-b'),
  ];
  await mitOrdner(aufgaben, async ordner => {
    // Die zweite Aufgabe bricht hart ab — so, wie ein abgestuerzter Lauf mitten
    // in der Nacht aussieht.
    const { werkzeuge } = werkzeugkasten({
      agentAntwort: a => {
        if (a.id === 'P1-B') throw new Error('harter Abbruch');
        return { fertig: true, prNummer: 1 };
      },
    });
    let geworfen = false;
    try {
      await fuehrePhase({ phase: 1, pfad: ordner, werkzeuge });
    } catch {
      geworfen = true;
    }
    const danach = await ladeAufgaben(ordner);
    const a = danach.find(x => x.id === 'P1-A');
    const b = danach.find(x => x.id === 'P1-B');

    pruefe('der Abbruch wird nicht verschluckt', geworfen);
    pruefe('die fertige Aufgabe steht auf gruen', a.zustand === 'gruen', a.zustand);
    pruefe(
      'die abgebrochene steht auf laeuft, nicht auf offen',
      b.zustand === 'laeuft',
      `${b.zustand} — der naechste Morgen sieht, wo es abriss`
    );
    pruefe('ihr Versuch ist gezaehlt', b.versuche === 1, `${b.versuche}`);
  });
}

// --- 4. Deploy ohne gesundes Geraet -----------------------------------------
{
  const aufgaben = [aufgabe('P1-A', 'gate', 'abnahme-a'), aufgabe('P1-B', 'gate', 'abnahme-b')];
  await mitOrdner(aufgaben, async ordner => {
    const { spur, werkzeuge } = werkzeugkasten({ gesund: () => false });
    const bericht = await fuehrePhase({ phase: 1, pfad: ordner, werkzeuge });
    const danach = await ladeAufgaben(ordner);

    pruefe('ein krankes Geraet stoppt die Phase', bericht.gestoppt, bericht.grund);
    pruefe(
      'kein zweiter Versuch am selben Tag',
      spur.deploys.length === 1,
      `${spur.deploys.length} Deploys`
    );
    pruefe('gar keine Abnahme mehr', spur.abnahmen.length === 0);
    pruefe(
      'die zweite Aufgabe bleibt offen',
      danach.find(x => x.id === 'P1-B').zustand === 'offen'
    );
  });
}

// --- 5. Ein Agent ohne Ergebnis fragt nicht nach ----------------------------
{
  const aufgaben = [aufgabe('P1-A', 'gate', 'abnahme-a'), aufgabe('P1-B', 'gate', 'abnahme-b')];
  await mitOrdner(aufgaben, async ordner => {
    const { werkzeuge } = werkzeugkasten({
      agentAntwort: a =>
        a.id === 'P1-A'
          ? { fertig: false, begruendung: 'braucht einen Schluessel' }
          : { fertig: true, prNummer: 2 },
    });
    const bericht = await fuehrePhase({ phase: 1, pfad: ordner, werkzeuge });
    const danach = await ladeAufgaben(ordner);
    const a = danach.find(x => x.id === 'P1-A');

    pruefe('die offene Aufgabe wird uebersprungen', a.zustand === 'uebersprungen', a.zustand);
    pruefe('ihr Grund steht in der Notiz', a.notiz.includes('Schluessel'), a.notiz);
    pruefe('der Lauf geht weiter', bericht.gruen === 1 && !bericht.gestoppt);
  });
}

console.log(fehler ? '\nPhasenlauf: FEHLGESCHLAGEN' : '\nPhasenlauf: in Ordnung');
process.exit(fehler);
