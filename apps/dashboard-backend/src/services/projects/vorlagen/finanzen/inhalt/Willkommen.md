# Interne Finanzen

Dieses Projekt bündelt die Finanz-Arbeit deiner Firma.

## So ist es aufgebaut

- `Belege/` — Eingangsrechnungen, Quittungen, Verträge (werden automatisch
  indexiert und sind damit durchsuchbar)
- `Auswertungen/` — Monats-/Quartalsübersichten und Notizen
- `Rechnungen/` — hier landen deine AUSGESTELLTEN Rechnungen (automatisch,
  schreibgeschützt)
- `Meetings/` — Gesprächsnotizen zu Finanzthemen
- `Firmenprofil.md` — die Rechnungs-Pflichtangaben deiner Firma

## Rechnungen stellen

1. Einmalig: `/einrichtung` im Chat füllt das Firmenprofil von deiner
   Webseite; danach die Pflichtangaben prüfen (Anschrift, USt-IdNr.).
2. `/rechnung` im Chat: Empfänger und Leistungen nennen — du bekommst eine
   echte E-Rechnung (ZUGFeRD: PDF mit eingebettetem Rechnungs-XML) mit
   fortlaufender, lückenloser Nummer.

Wichtig zu wissen:

- **Alle Beträge rechnet das Gerät** (Netto, Umsatzsteuer, Brutto) — die KI
  liefert nur die Positionen.
- Ausgestellte Rechnungen sind **schreibgeschützt**: Sie lassen sich weder
  ändern noch löschen (steuerrechtliche Anforderung). Für Korrekturen stellst
  du eine Stornorechnung oder eine neue Rechnung.
- Die Aufbewahrung (GoBD-Archiv) bleibt Sache deines Steuerbüros/DMS — dieses
  Projekt ersetzt sie nicht.
