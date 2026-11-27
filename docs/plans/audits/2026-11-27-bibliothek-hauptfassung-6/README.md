# Bibliothek Hauptfassung 6 (J59, M7)

Stand 27.11.2026, Bibliothek 6.0.0. Entwurf: Abschnitt „Fassung vom 27.11.2026“ in
`gestaltung.md` des Überordners, Vorlage `klickentwurf/arasul-klickentwurf.html`.

## Gebaut

Tokens (Grund, Blau samt Verlauf, Glas mit Rückfall), fünfzehn neue Bausteine auf
reinem CSS (siehe `docs/development/DESIGN.md`, Abschnitt „Hauptfassung 6“),
Fassung 6.0.0, Adresse `/marken/6/` in Werkstatt, Demo, Kontrakt und Proben,
Bündel neu gebaut, Schaustück auf `/entwickler/bausteine`.

## Gemessen

- `marken.py`, `bausteine.py`, `check-design-system.js` grün; Kontrast in beiden Themes ≥ 4,5:1.
- `vitest`: 89 Dateien, 904 Tests grün, darunter 30 neue (`Fassung6.test.tsx`): Linien-Satz,
  Knöpfe, Dock, Popup, Ebene, Board (Maus sofort, Finger nach 400 ms, Alt+Pfeil), Reiter,
  Segmente, Wischzeile (Schwelle 40 %), Rückgängig (5 s). Ein Test fand einen echten Fehler
  (Endlosschleife in der Marke des Docks), behoben.
- Backend: Fingerabdruck des Kontrakts und eine Fixture auf Bibliothek 6 gezogen.
- Bei 390 px: kein Seitenüberlauf, keine Schaltfläche unter 44 × 44 px (lokale Probe).
- **Am Orin** (Deploy `deploy.yml` grün, `/marken/marken.json` nennt 6.0.0, `/marken/6/`):
  `scripts/test/schauseite.mjs` mit `probe-admin`, 37 von 37 grün (59 Stücke, hell und dunkel, 390,
  1024 und 1440 px, Konsole leer, kein Überlauf). Bilder: `../2026-11-27-bibliothek-hauptfassung-6-oberflaeche/`.
- **Demo** auf Vercel (`arasul-demo`): `/marken/marken.json` nennt 6.0.0, `demo/abnahme.mjs` grün
  („Alles grün“); Bilder `demo/demo-start-{1920,1440,390}.png`.

## Bilder

`bilder/`: `schau-{hell,dunkel}-{1440,390}.png` (lokale Probe ohne Anmeldung), je Bühne
`popup-*`, `blatt-*`, `vollbild-*` und `wischzeile-*` (halb gewischt). `demo/`: Start der Demo.

## Zweiter, unabhängiger Prüfer (nur Bilder, Klickentwurf, Abschnitt)

Runde 1: **mit schwerem Befund** (Dock ohne Wort, Meldung als eckige Karte, Wischzeile und
Listenzeile ohne App-Icon, Stufenleiste zu breit, Popup ohne „esc“ und Squircles, Live-Icon zu
klein, Hinweis am Rand abgeschnitten, Blatt hell nicht belegt). Alles behoben (PR 982).
Runde 2, zwei Prüfer: **ohne schweren Befund.** Reste, bewusst nicht behoben oder dem Schaustück
geschuldet: Board-Spalten 280 px (Maß aus `VORBILDER.md`), gesperrter Zustand unter 4,5:1
(vom Kontrastgebot ausgenommen), Vogel links in der Glasleiste und Popup-Kapsel am Handy als
freistehende Kapsel (Sache der App-Schale, J60), das Segment-Gleitstück maß vor dem Laden der
Schrift (behoben mit `document.fonts.ready`).

## Zu entscheiden und Folgen

- **Kontraktzahl bleibt 14.** Das Gerät liefert nur `/marken/6/` aus: eine App auf Bibliothek 5
  wird beim Ausrollen abgewiesen. Werkstatt, Demo-Apps und Proben sind umgezogen, die Kit-Vorlage
  muss auf 6 (Kit-Auftrag). Ob daraus eine Kontraktzahl 15 wird, entscheidet Kolja.
- Die App-Schale (Aktivitätsleiste, Kopf) der Demo und des Geräts ist noch die alte; sie baut
  J60 auf diesen Bausteinen. Neu sind in der Demo schon Grund, Karten und Blau.
- Beim Ausliefern per `vercel deploy` entstand versehentlich einmal ein Vercel-Projekt
  `dist-demo` (der Link in `dist-demo/.vercel` fehlte nach dem Neubau). Es sollte im Dashboard
  gelöscht werden; `arasul-demo` ist korrekt ausgeliefert.
