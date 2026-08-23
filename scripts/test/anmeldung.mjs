/**
 * Eine Anmeldung fuer alle Abnahmen (23.08.2026).
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

const SPEICHER =
  process.env.ARASUL_SITZUNG || path.join(os.tmpdir(), 'arasul-abnahme-sitzung.json');

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

async function istAngemeldet(seite) {
  try {
    return await seite.evaluate(() => document.cookie.includes('arasul_csrf'));
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
  const ok = await seite
    .evaluate(() => document.cookie.includes('arasul_csrf'))
    .catch(() => false);
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
