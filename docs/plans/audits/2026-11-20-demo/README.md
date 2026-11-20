# Abnahme Demo ohne Gerät (J46, M7), 20.11.2026

`apps/dashboard-frontend/demo/abnahme.mjs`, Chromium (headless shell 1255).

- Gegen den lokalen Bau (`dist-demo/`, Server mit den Regeln aus
  `vercel.json`): Deutsch und Englisch bei 390, 768 und 1440 px, Weg
  vollständig, kein Überlauf, keine fremde Herkunft, keine Anfrage an
  `/api/…` erreichte den Server. Bilder in diesem Ordner.
- Gegen die Auslieferung <https://arasul-demo.vercel.app>: dieselben sechs
  Läufe grün, `netzwerk.txt` mit allen 2238 Anfragen, eine Herkunft.

Bilder je Sprache und Breite: `1-start` (Mitarbeiter), `2-hilfe` (So geht's),
`4-rueckmeldung` (Formular mit Foto und Markierung), `6-eingang` (Cockpit,
Meldung angekommen), `8-test-nach-live`, `10-rabatt` (Angebote 1.5.0 live).
