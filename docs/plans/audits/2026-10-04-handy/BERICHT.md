# Abnahme Handy: Leiste unten, Tabellen als Listen, Notizen weg (M5)

Am Orin, 04.10.2026, nach dem Deploy von PR 893, bei 390 × 844 px im Browser
(Chromium, Touch), als `probe-admin` und `probe-j36-a`.
`scripts/test/handy-abnahme.sh` (sechs Probe-Apps `probe-handy-1004-*`, am Ende
entfernt) → `handy-abnahme.mjs`. Dreimal gelaufen, dreimal **30 grün, 0 rot**.

- Leiste unten: Unterkante 785 + 60 = 845 px, Breite 390 px; Haus, genau vier
  Apps, „Mehr" mit den zwei übrigen Apps, Verwaltung (nur Admin),
  Einstellungen, Name und Abmelden. Keine Statusleiste.
- Eine App füllt den Schirm über der Leiste: Rahmen 390 × 785 px.
- Auf Startseite, Einstellungen, jedem der elf Verwaltungsbereiche und jeder
  App-Seite: `scrollWidth <= clientWidth` (Seite und Ansicht).
- Personen und Apps (Verwaltung) ohne `<table>`; die Felder einer Freigabe in
  der Lauf-Ansicht sind am Handy eine Liste.
- `GET /api/notizen` → 404; Tabelle `public.notizen` am Orin weg (Migration 202).

Bilder: `admin-mehr.png`, `admin-start.png`, `admin-app.png`, `mitarbeiter-*.png`
und die Verwaltungsseiten.
