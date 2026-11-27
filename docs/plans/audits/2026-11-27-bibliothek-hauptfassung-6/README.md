# Bibliothek Hauptfassung 6 (J59, M7)

Stand 27.11.2026, Bibliothek 6.0.0. Entwurf: Abschnitt „Fassung vom 27.11.2026“ in
`gestaltung.md` des Überordners, Vorlage `klickentwurf/arasul-klickentwurf.html`.

## Gebaut

Tokens (Grund, Blau samt Verlauf, Glas mit Rückfall), fünfzehn neue Bausteine auf
reinem CSS (siehe `docs/development/DESIGN.md`, Abschnitt „Hauptfassung 6“),
Fassung 6.0.0, Adresse `/marken/6/` in Werkstatt, Demo, Kontrakt und Proben,
Bündel neu gebaut, Schaustück auf `/entwickler/bausteine`.

## Gemessen (lokal, vor dem Merge)

- `marken.py` und `bausteine.py` grün; Kontrast in beiden Themes ≥ 4,5:1.
- `vitest`: 89 Dateien, 904 Tests grün, darunter 28 neue (`Fassung6.test.tsx`):
  Linien-Satz, Knöpfe, Dock, Popup, Ebene, Board (Maus sofort, Finger nach 400 ms,
  Alt+Pfeil), Reiter, Segmente, Wischzeile (Schwelle 40 %), Rückgängig (5 s).
- Bei 390 px: kein Seitenüberlauf, keine Schaltfläche unter 44 × 44 px.
- Ein Test fand einen echten Fehler (Endlosschleife in der Marke des Docks), behoben.

## Bilder (lokale Probe ohne Anmeldung, `bilder/`)

`schau-hell-1440.png`, `schau-dunkel-1440.png`, `schau-hell-390.png`.

## Noch offen

Ansicht am Orin und in der Demo bei 1920, 1440 und 390 px, neben dem Klickentwurf,
und der Urteil des zweiten Prüfers: nach dem Merge und Deploy.
