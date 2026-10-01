const { z } = require('zod');
const { AppId } = require('./apps');

/**
 * POST /api/backup/wiederherstellung (Phase C9)
 *
 * `bestaetigung` muss das Wort `wiederherstellen` sein. Kein Wahlfeld, kein
 * `true`: dieser Aufruf ersetzt die GANZE Datenbank des Geraets, und ein
 * `{"bestaetigung": true}` schreibt sich in einem Skript versehentlich hin.
 * Ein Wort, das man tippen muss, tippt niemand aus Versehen -- dasselbe
 * Muster wie beim Werksreset und beim Entfernen einer App.
 *
 * `datei` ist ein NAME, kein Pfad. Der Sicherungsordner steht fest; ein Pfad
 * von aussen koennte auf alles zeigen, was der Sicherungs-Container sieht,
 * und das Ergebnis waere eine Datenbank aus unbekannter Quelle. Ohne Angabe
 * gilt die neueste Sicherung.
 */
/**
 * Woher zurueckgeholt wird (J37): vom angesteckten Datentraeger oder von diesem
 * Geraet. Ein Wort aus einer festen Liste, kein Pfad.
 */
const Quelle = z.enum(['lokal', 'extern']);

/**
 * Der Wiederherstellungscode (J37): nur noetig, wenn der Schluessel dieses
 * Geraets nicht zur Sicherung passt. Buchstaben, Ziffern, Leerzeichen und
 * Striche -- nichts, was eine Shell oder ein Dateiname je deuten koennte. Er
 * geht nicht in die Befehlszeile, sondern in die Umgebung des Aufrufs.
 */
const Wiederherstellungscode = z
  .string()
  .trim()
  .max(100)
  .regex(
    /^[A-Za-z0-9 -]*$/,
    'Der Wiederherstellungscode besteht nur aus Buchstaben, Ziffern und Strichen'
  )
  .optional();

const WiederherstellungBody = z
  .object({
    datei: z
      .string()
      .trim()
      .max(255)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'Nur der Name der Sicherung, kein Pfad (Buchstaben, Ziffern, Punkt, Strich, Unterstrich)'
      )
      .optional(),
    quelle: Quelle.default('lokal'),
    wiederherstellungscode: Wiederherstellungscode,
    bestaetigung: z.literal('wiederherstellen', {
      error:
        'Zum Bestaetigen muss das Feld `bestaetigung` das Wort "wiederherstellen" enthalten. ' +
        'Dieser Aufruf ersetzt die ganze Datenbank.',
    }),
  })
  .strict();

/**
 * POST /api/backup/wiederherstellung/app/:id (J35)
 *
 * Die Daten EINER App. `bestaetigung` ist ihre Kennung, abgetippt -- wie beim
 * Entfernen einer App: der Aufruf wirft die jetzige Datenbank der App weg
 * (vorher abgezogen) und legt die gesicherte an ihre Stelle. `stand` engt auf
 * einen Stand ein; ohne ihn kommen beide, soweit gesichert.
 */
const AppWiederherstellungParams = z.object({ id: AppId }).strict();

const AppWiederherstellungBody = z
  .object({
    bestaetigung: z.string().trim().min(1).max(100),
    stand: z.enum(['test', 'live']).optional(),
    quelle: Quelle.default('lokal'),
    // Mit dem Paket der App (ihr Frontend und Backend aus dem Archiv) oder nur
    // ihre Daten. Vorgabe: mit Paket -- eine App ohne ihr Paket laeuft nicht.
    paket: z.boolean().default(true),
    wiederherstellungscode: Wiederherstellungscode,
  })
  .strict();

module.exports = { WiederherstellungBody, AppWiederherstellungParams, AppWiederherstellungBody };
