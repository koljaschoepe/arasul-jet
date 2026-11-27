# App-Schale nach Klickentwurf 7 (J60, M7), erste Stufe

Stand 27.11.2026. Gemessen am Demo-Bau (`npm run demo:bauen`, lokal ausgeliefert), nicht am Orin.

## Gebaut

- Glasleiste: Vogel oder „‹ vorige Ebene“, rechts Live und Test (nur Prüfende), Rückmeldung mit Bildschirmfoto, Suche; im Test der blaue Streifen. Live, Test und Rückmeldung schiebt der Rahmen der App per Portal in die Leiste (`features/apps/Kapsel.tsx`).
- Popup-Suche (Cmd+K, Strg+K, „/", nie in einem Eingabefeld): Gruppen Apps, Befehle, Konto, Verwaltung nur für Admins. Ersetzt die Befehlspalette.
- Dock: Start, Für Sie mit Zahl, Plus mittig, Store, Zuletzt. Aktivitätsleiste und Leiste unten sind entfernt.
- Start: Begrüßung, „Erste Schritte“ (verschwindet bei vier von vier), „Für Sie“ mit Wischen (rechts gibt frei, 5 Sekunden Rückgängig; links öffnet die Einzelansicht mit Pflichtgrund), „Zuletzt“.
- Store nach Abteilung mit Reihe „Neu“ (`seit` aus `GET /api/apps/meine`).
- Einstellungen „Hell | Dunkel“, Vorgabe hell; ein gespeichertes `system` gilt als hell.

## Bewusst offen

- **Abteilung hat keine Quelle.** Ein Feld in `app.json` wäre Kontrakt 15 (Fingerabdruck in `appKontrakt.test.js`), das entscheidet Kolja. Bis dahin steht jede App unter „Weitere“.
- Wischen gibt nur frei, wo die Freigabe keine Felder hat und die App sie nicht selbst zeigt.
- Plus öffnet die Suche; „Neu“ als eigene Auswahl fehlt.
- „Erste Schritte“ und „Zuletzt“ liegen je Browser, nicht am Gerät.
- Demo: Glas-X und „Demo“ im Dock fehlen noch; die Demo-Zeile steht in der Leiste (ab 900 px) oder unten rechts.
- Nicht gemacht: Abnahme am Orin, Bilder bei 1920x1080 und dunkel, Vergleich mit dem Klickentwurf, zweiter Prüfer.

## Bilder

`bilder/start-1440.png`, `suche-1440.png`, `app-1440.png`, `app-390.png`.
