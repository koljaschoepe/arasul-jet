# Abnahme Verwaltung Gerät und System am Orin (M5), 04.10.2026

Stand: `d9b55c7` (PR #910) am Orin, gemessen nach dem Deploy.

- `scripts/test/verwaltung-geraet-abnahme.sh`: **32 grün, 0 rot.** System-Satz und drei
  Zahlen, `sprachmodell` 404, Basis-Prompt unberührt, Name und Logo gesetzt, ausgeliefert
  (image/png, nosniff, dieselben Bytes), SVG/falsches PNG/über 256 KB abgewiesen, Lizenz nur
  gelesen (eine ungültige Zeile abgelehnt, danach dieselbe), Aktualisierung und Fernzugriff
  nur gelesen, danach Name und Logo exakt wie vorher (keiner, keines).
- `scripts/test/verwaltung-geraet-bilder.mjs`: **alles grün.** Leiste mit sieben Bereichen,
  sieben alte Adressen landen beim Abschnitt, System zugeklappt, Logo in der Leiste sofort,
  Name auf der Anmeldeseite, Fassung einmal, Aktualisierung nur bis in die Bestätigung
  (erfundene Fassung 9.9.9 im Browser), Lizenz-Dialog, Fernzugriff an mit Adresse (Schalter nie
  angeklickt), keine Technikwörter zugeklappt, 390 px ohne Überlauf, **null schreibende Aufrufe**
  an Aktualisierung, Fernzugriff und Lizenz.

Bilder: `system.png`, `system-dienste-aufgeklappt.png`, `geraet.png`, `unternehmen-bearbeiten.png`,
`leiste-mit-logo.png`, `anmeldung-mit-name.png`, `aktualisierung-bestaetigung.png`,
`lizenz-aufgeklappt.png`, `lizenz-einspielen-dialog.png`, `fernzugriff-technik.png`,
`geraet-schmal.png`.
