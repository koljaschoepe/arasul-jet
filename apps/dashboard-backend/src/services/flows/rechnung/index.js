/**
 * Rechnungs-Werkzeug `rechnung_erstellen` (Plan 014, Phase 5).
 *
 * Der Rechnungs-Flow lässt das MODELL nur strukturierte Positionen liefern —
 * alles Weitere ist CODE: Summen (summen.js), Pflichtfeld-Validierung
 * (validierung.js), lückenlose Nummer (nummernkreis.js, transaktional NACH
 * bestandener Validierung), Factur-X-XML (zugferdXml.js) und das
 * PDF/A-3b-Dokument (rechnungsPdf.js). Die ausgestellte PDF wird
 * schreibgeschützt abgelegt (chmod 0444 + ablageService-Wächter über die
 * Registrierung in `rechnungsnummern`).
 *
 * Der Verkäufer kommt aus dem `Firmenprofil.md` des Projekts (gepflegt über
 * /einrichtung) — fehlende Pflichtangaben nennt das Werkzeug ALLE auf einmal.
 */

const path = require('path');
const fs = require('fs').promises;
const BaseTool = require('../../../tools/baseTool');
const logger = require('../../../utils/logger');
const ablageService = require('../../projects/ablageService');
const ordnerSyncService = require('../../projects/ordnerSyncService');
const { parseSteckbrief } = require('../../projects/steckbriefIndex');
const { berechneSummen } = require('./summen');
const { validiereRechnung } = require('./validierung');
const { erzeugeXml } = require('./zugferdXml');
const { erzeugePdf } = require('./rechnungsPdf');
const nummernkreis = require('./nummernkreis');

/** Firmenprofil-Tabelle → Verkäufer-Objekt (Feldnamen wie im Steckbrief-Muster). */
function verkaeuferAusProfil(text) {
  const felder = parseSteckbrief(text);
  return {
    name: felder.firma || null,
    strasse: felder.strasse || null,
    plz: felder.plz || null,
    ort: felder.ort || null,
    land: felder.land || 'DE',
    ust_id: felder.ust_id || null,
    email: felder.email || null,
    telefon: felder.telefon || null,
    iban: felder.iban || null,
  };
}

/** Zahlungsziel bändigen: 0–365 Tage, Standard 14 (kein negatives/absurdes). */
function zahlungszielTage(roh) {
  const n = Math.round(Number(roh));
  if (!Number.isFinite(n) || n < 0) {
    return 14;
  }
  return Math.min(n, 365);
}

/** Positionen tolerant lesen: JSON-String ODER bereits geparstes Array. */
function parsePositionen(roh) {
  if (Array.isArray(roh)) {
    return roh;
  }
  const text = String(roh || '').trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

class RechnungErstellenTool extends BaseTool {
  constructor(deps = {}) {
    super();
    this.deps = deps;
  }

  get name() {
    return 'rechnung_erstellen';
  }

  get description() {
    return (
      'Stellt eine Rechnung aus: zieht die nächste lückenlose Rechnungsnummer, ' +
      'rechnet alle Summen in Code und legt ein ZUGFeRD-PDF (PDF/A-3 mit ' +
      'eingebettetem EN-16931-XML) schreibgeschützt im Arbeitsverzeichnis ab. ' +
      'Der Verkäufer kommt aus dem Firmenprofil.md des Projekts.'
    );
  }

  get parameters() {
    return {
      kaeufer_name: {
        type: 'string',
        description: 'Name des Rechnungsempfängers (Firma oder Person)',
        required: true,
      },
      kaeufer_strasse: { type: 'string', description: 'Straße und Hausnummer', required: false },
      kaeufer_plz: { type: 'string', description: 'Postleitzahl', required: false },
      kaeufer_ort: { type: 'string', description: 'Ort', required: false },
      kaeufer_land: {
        type: 'string',
        description: 'Ländercode (z. B. DE), Standard DE',
        required: false,
      },
      positionen: {
        type: 'string',
        description:
          'Die Rechnungspositionen als JSON-Array: [{"bezeichnung": "…", "menge": 2, ' +
          '"einheit": "Tag", "einzelpreis_netto": "1200.00", "ust_satz": 19}] — ' +
          'NUR Netto-Einzelpreise; alle Summen rechnet das Werkzeug selbst',
        required: true,
      },
      leistungsdatum: {
        type: 'string',
        description: 'Liefer-/Leistungsdatum (JJJJ-MM-TT), falls bekannt',
        required: false,
      },
      zahlungsziel_tage: {
        type: 'number',
        description: 'Zahlungsziel in Tagen (Standard 14)',
        required: false,
      },
      schluss_text: {
        type: 'string',
        description: 'Optionaler Schlusssatz unter der Rechnung',
        required: false,
      },
    };
  }

  /**
   * @param {object} params
   * @param {{projektId?:string|null, projektUnterpfad?:string|null}} context -
   *   der Runner reicht Projekt + Ablage-Unterpfad des Arbeitsverzeichnisses.
   */
  async execute(params = {}, context = {}) {
    const {
      projektOrdner = ablageService.projektOrdner,
      kreis = nummernkreis,
      sync = ordnerSyncService,
      jetzt = () => new Date(),
    } = this.deps;

    const projektId = context.projektId || null;
    if (!projektId) {
      return (
        'Fehler: Für die Rechnung fehlt der Projekt-Bezug, der Flow braucht ein ' +
        'projekt://-Arbeitsverzeichnis (z. B. projekt://aktiv/Rechnungen).'
      );
    }

    // 1. Verkäufer aus dem Firmenprofil des Projekts.
    const wurzel = await projektOrdner(projektId);
    let profilText;
    try {
      profilText = await fs.readFile(path.join(wurzel, 'Firmenprofil.md'), 'utf8');
    } catch {
      return (
        'Fehler: Firmenprofil.md fehlt in der Projekt-Wurzel, bitte zuerst /einrichtung ' +
        'ausführen (füllt das Profil mit den Firmendaten).'
      );
    }
    const verkaeufer = verkaeuferAusProfil(profilText);

    // 2. Positionen (Modell) → Summen (Code).
    const positionen = parsePositionen(params.positionen);
    if (!positionen) {
      return (
        'Fehler: "positionen" muss ein JSON-Array sein, z. B. ' +
        '[{"bezeichnung": "Beratungstag", "menge": 2, "einheit": "Tag", ' +
        '"einzelpreis_netto": "1200.00", "ust_satz": 19}]'
      );
    }

    const kaeufer = {
      name: String(params.kaeufer_name || '').trim(),
      strasse: String(params.kaeufer_strasse || '').trim() || null,
      plz: String(params.kaeufer_plz || '').trim() || null,
      ort: String(params.kaeufer_ort || '').trim() || null,
      land: String(params.kaeufer_land || 'DE').trim() || 'DE',
    };
    const datum = jetzt();

    let summen;
    try {
      summen = berechneSummen(positionen);
      // 3. Eingebaute Validierung — VOR dem Ziehen der Nummer (keine Lücken).
      //    `positionen` roh mitgeben: die Quersumme rechnet unabhängig nach.
      await validiereRechnung({ verkaeufer, kaeufer, summen, positionen, datum });
    } catch (err) {
      return `Fehler: ${err.message}`;
    }

    // 4. Nummer transaktional ziehen + Dateien erzeugen (Rollback = keine Lücke).
    const unterpfad = context.projektUnterpfad || '';
    const relPfad = unterpfad ? `${unterpfad}/{{nummer}}.pdf` : '{{nummer}}.pdf';
    // Merker für die Rollback-Aufräumung: Wirft NACH dem Schreiben noch etwas
    // (z. B. der COMMIT), wird die Nummer zurückgerollt — die Datei-Leiche
    // würde dann per wx den nächsten Lauf mit derselben Nummer blockieren.
    let geschriebeneDatei = null;
    let ergebnis;
    try {
      ergebnis = await kreis.mitNaechsterNummer({
        projektId,
        jahr: datum.getFullYear(),
        pfad: relPfad,
        summen: summen.api,
        arbeit: async nummer => {
          const xml = await erzeugeXml({
            nummer,
            datum,
            verkaeufer,
            kaeufer,
            summen,
            leistungsdatum: params.leistungsdatum,
          });
          const pdf = await erzeugePdf({
            nummer,
            datum,
            verkaeufer,
            kaeufer,
            summen,
            xml,
            leistungsdatum: params.leistungsdatum,
            zahlungszielTage: zahlungszielTage(params.zahlungsziel_tage),
            schlussText: String(params.schluss_text || '').trim() || null,
          });
          const abs = path.join(wurzel, relPfad.split('{{nummer}}').join(nummer));
          await fs.mkdir(path.dirname(abs), { recursive: true });
          // wx: nie überschreiben. Liegt eine NICHT registrierte Leiche eines
          // früheren, abgebrochenen Laufs im Weg, wird sie beiseitegelegt
          // (nichts zerstören) und erneut geschrieben.
          try {
            await fs.writeFile(abs, pdf, { flag: 'wx' });
          } catch (err) {
            if (err.code !== 'EEXIST') {
              throw err;
            }
            const rel = relPfad.split('{{nummer}}').join(nummer);
            if (await kreis.istRegistrierteRechnung(projektId, rel)) {
              throw err; // echte Rechnung — niemals anfassen
            }
            await fs.rename(abs, `${abs}.verwaist-${Date.now()}`);
            await fs.writeFile(abs, pdf, { flag: 'wx' });
          }
          geschriebeneDatei = abs;
          await fs.chmod(abs, 0o444).catch(() => {});
        },
      });
    } catch (err) {
      // Rollback-Aufräumung: die Nummer ist weg, also darf die Datei nicht
      // liegen bleiben (sonst blockiert wx den nächsten Lauf mit der Nummer).
      if (geschriebeneDatei) {
        await fs.unlink(geschriebeneDatei).catch(() => {});
      }
      logger.error(`rechnung_erstellen: ${err.message}`);
      return `Fehler: Rechnung konnte nicht ausgestellt werden, ${err.message}`;
    }

    sync.trigger(projektId);

    const s = summen.api;
    return (
      `Rechnung ${ergebnis.nummer} ausgestellt.\n` +
      `Empfänger: ${kaeufer.name}\n` +
      `Netto: ${s.netto} € · Umsatzsteuer: ${s.umsatzsteuer} € · Brutto: ${s.brutto} €\n` +
      `Datei (schreibgeschützt, ZUGFeRD/PDF-A-3): ${ergebnis.pfad}\n` +
      `WICHTIG: Nenne dem Nutzer GENAU diese Beträge und diese Nummer, sie sind verbindlich berechnet.`
    );
  }
}

module.exports = { RechnungErstellenTool, verkaeuferAusProfil, parsePositionen };
