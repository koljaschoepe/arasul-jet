/**
 * Eine Anmeldung fuer alle Abnahmen (23.08.2026, erweitert am 27.08.2026).
 *
 * Seit dem 27.08.2026 teilen sich AUCH die curl-Abnahmen diese Sitzung:
 * `abnahmen.sh` meldet sich einmal an und baut daraus die Datei, die hier
 * gelesen wird (`scripts/test/anmeldung.sh`, `arasul_sitzung_bauen`). Vorher
 * hatten Browser und Kommandozeile je eine eigene Anmeldung.
 *
 * Jede Abnahme meldete sich selbst an. Das Geraet erlaubt zehn Anmeldungen je
 * Viertelstunde und IP (`loginLimiter`), also stand nach der sechsten oder
 * siebten Messung HTTP 429 im Weg — und die Abnahmen meldeten daraufhin
 * Dinge ueber das GERAET, die nur ueber den Messaufbau galten. Ein falsches
 * Rot kostet genauso viel Zeit wie ein falsches Gruen.
 *
 * Deshalb liegt die Sitzung in einer Datei und wird wiederverwendet. Ist sie
 * abgelaufen oder fehlt sie, wird EINMAL angemeldet.
 *
 * Die Datei enthaelt ein gueltiges Sitzungs-Cookie des Geraets und gehoert
 * deshalb nicht ins Repository; `.gitignore` schliesst sie aus.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const SPEICHER =
  process.env.ARASUL_SITZUNG || path.join(os.tmpdir(), 'arasul-abnahme-sitzung.json');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Den Pruefbenutzer am Geraet anlegen, wenn er fehlt (28.08.2026).
 *
 * Der Werksreset von G1 loescht jeden Benutzer, auch den, mit dem die
 * Abnahmen sich anmelden; um 11:55 war `pruefer` weg, und danach kam keine
 * Browser-Abnahme mehr durch. Ein 401 fuer diesen Benutzer heisst seither
 * nicht "Ende", sondern: einmal anlegen (`scripts/util/pruefbenutzer.sh`,
 * idempotent, am Geraet oder ueber ssh), einmal wiederholen. Der Aufrufer
 * entscheidet, ob der Code ein 401 war; hier wird nur angelegt.
 *
 * Liefert `{ ok, meldung }` und wirft nie.
 */
export function pruefbenutzerAnlegen({ benutzer, passwort }) {
  const lauf = spawnSync('bash', [path.join(WURZEL, 'scripts/util/pruefbenutzer.sh')], {
    env: { ...process.env, ARASUL_BENUTZER: benutzer, ARASUL_PASSWORT: passwort },
    encoding: 'utf-8',
    timeout: 120000,
  });
  const meldung = `${lauf.stdout || ''}${lauf.stderr || ''}`.trim().split('\n').pop() || '';
  return { ok: lauf.status === 0, meldung: meldung || `Rueckgabe ${lauf.status}` };
}

/**
 * Liefert eine angemeldete Seite. Wirft nie wegen einer abgewiesenen
 * Anmeldung, sondern gibt `{ seite, angemeldet: false, grund }` zurueck —
 * die Abnahme soll das benennen koennen, statt daran zu scheitern.
 */
export async function angemeldeteSeite(kontextBauen, { url, benutzer, passwort }) {
  const gespeichert = fs.existsSync(SPEICHER) ? SPEICHER : undefined;
  let kontext = await kontextBauen(gespeichert);
  let seite = await kontext.newPage();

  await seite.goto(`${url}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(2500);
  if (await istAngemeldet(seite)) {
    return { kontext, seite, angemeldet: true };
  }

  // Sitzung abgelaufen oder keine da: einmal anmelden.
  await kontext.close();
  kontext = await kontextBauen(undefined);
  seite = await kontext.newPage();
  await seite.goto(url, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[name="username"], input[type="text"]', benutzer);
  await seite.fill('input[type="password"]', passwort);
  await seite.click('button[type="submit"]');
  await seite.waitForTimeout(4000);

  if (!(await istAngemeldet(seite))) {
    return {
      kontext,
      seite,
      angemeldet: false,
      grund:
        'Die Anmeldung kam nicht durch. Haeufigste Ursache: zehn Anmeldungen ' +
        'je Viertelstunde und IP sind aufgebraucht (HTTP 429). Das sagt nichts ' +
        'ueber das Geraet.',
    };
  }
  try {
    await kontext.storageState({ path: SPEICHER });
  } catch {
    /* nicht schreibbar — dann eben jedes Mal neu anmelden */
  }
  return { kontext, seite, angemeldet: true };
}

/**
 * Angemeldet ist, wer eine Auskunft ueber sich selbst bekommt.
 *
 * Bis zum 27.08.2026 stand hier `document.cookie.includes('arasul_csrf')`. Das
 * war die Frage nach einem NEBENPRODUKT der Anmeldung, nicht nach der Anmeldung:
 * seit `abnahmen.sh` einen Token je Lauf teilt, kann eine gueltige Sitzung aus
 * dem Sitzungs-Cookie allein bestehen (`arasul_session` ist HttpOnly, den
 * CSRF-Wert holt die Oberflaeche bei Bedarf ueber GET /api/auth/csrf). Die
 * alte Pruefung haette in genau diesem Fall Nein gesagt und eine zweite
 * Anmeldung ausgeloest -- also das getan, was das Teilen verhindern soll.
 */
async function istAngemeldet(seite) {
  try {
    return await seite.evaluate(async () => {
      const antwort = await fetch('/api/auth/me', { credentials: 'include' });
      return antwort.ok;
    });
  } catch {
    return false;
  }
}

/** Den Einrichtungs-Hinweis wegklicken, damit er nichts verdeckt. */
export async function hinweisWeg(seite) {
  await seite.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* Speicher gesperrt, stoert nur die Sicht */
    }
  });
}

/**
 * Der Pfad der gespeicherten Sitzung, oder `undefined`, wenn es keine gibt.
 * Direkt in `newContext({ storageState: ... })` verwendbar.
 */
export function sitzungsZustand() {
  return fs.existsSync(SPEICHER) ? SPEICHER : undefined;
}

/** Die Sitzung nach einer erfolgreichen Anmeldung merken. Wirft nie. */
export async function sitzungMerken(kontext) {
  try {
    await kontext.storageState({ path: SPEICHER });
  } catch {
    /* nicht schreibbar — dann eben jedes Mal neu anmelden */
  }
}

/**
 * Meldet an, WENN das Passwortfeld da ist. Mit einer gueltigen gespeicherten
 * Sitzung ist es das nicht, und der Aufruf tut nichts.
 *
 * Liefert `{ angemeldet, neu, grund }`. `angemeldet: false` heisst: die
 * Anmeldung kam nicht durch, meist weil die zehn Versuche je Viertelstunde
 * aufgebraucht sind. Das sagt nichts ueber das Geraet, und die Abnahme soll
 * genau das schreiben koennen.
 */
export async function anmeldenFallsNoetig(seite, kontext, { url, benutzer, passwort }) {
  const feld = seite.locator('input[type="password"]');
  await feld.waitFor({ timeout: 8000 }).catch(() => {});
  if ((await feld.count()) === 0) {
    return { angemeldet: true, neu: false };
  }
  await seite.fill('input[name="username"], input[type="text"]', benutzer);
  await feld.fill(passwort);
  await seite.click('button[type="submit"]');
  await seite.waitForTimeout(4000);
  const ok = await istAngemeldet(seite);
  if (!ok) {
    return {
      angemeldet: false,
      neu: true,
      grund:
        'Die Anmeldung kam nicht durch. Haeufigste Ursache: zehn Anmeldungen ' +
        'je Viertelstunde und IP sind aufgebraucht (HTTP 429). Das sagt nichts ' +
        'ueber das Geraet.',
    };
  }
  await sitzungMerken(kontext);
  return { angemeldet: true, neu: true };
}
