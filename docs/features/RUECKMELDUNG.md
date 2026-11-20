# Die Rückmeldung im Rahmen

> Stand 20.11.2026, Karte `rueckmeldung-im-rahmen` (J42, M7). Quelle ist der
> Vertrag der Verbesserungsschleife, `company/schleife.md` im Überordner
> (Teil „Rückmeldung“, Regeln 1 bis 3). Was danach kommt: die Schnittstelle für
> Kit und Cockpit mit dem Schalter je App für Bilder (J43), das
> Entwickler-Cockpit (J44).

Über jeder App zeigt der Rahmen von Arasul oben rechts ein kleines Icon. Ein
Mitarbeiter tippt darauf, schreibt in freien Worten, was fehlt oder nicht
stimmt, und markiert auf einem Bildschirmfoto der Seite die Stelle. App, Stand,
Seite, Person und Zeit hängen Rahmen und Gerät selbst an. Gespeichert wird am
Gerät. Lesen kann eine Meldung nur, wer das Kennzeichen **Entwickler** trägt.

Keine App bekommt dafür eine Zeile Code, und keine App kann es abschalten:
Icon, Formular und Bildschirmfoto gehören dem Rahmen, nicht der App.

---

## Was der Mitarbeiter sieht

1. Oben rechts über der App ein rundes Icon (Sprechblase mit Plus), 28 px,
   halbdurchsichtig, mit dem Hinweis „Rückmeldung zu dieser Seite“. Es ist die
   eine Ausnahme vom Beschluss „keine Kopfleiste“ (02.10.2026): es schwebt über
   der App, statt eine Leiste über sie zu legen. Am Handy steht es ebenso oben
   rechts, weit weg von der Leiste unten.
2. Ein Klick nimmt zuerst das Bildschirmfoto auf und öffnet dann das Formular:
   - **Was fehlt oder stimmt nicht?** Freier Text, Pflicht, bis 5000 Zeichen.
   - **Bildschirmfoto mitschicken**, vorausgewählt und abwählbar. Darunter das
     Foto: Ziehen zeichnet einen Rahmen um die Stelle, Tippen setzt ein
     kleines Quadrat; jede neue Geste ersetzt die vorige.
   - Ein Satz, was mitgeht: App, Seite, Name, Uhrzeit, gespeichert am Gerät.
3. Nach dem Absenden steht nur „Ihre Rückmeldung ist angekommen.“ Einen Weg,
   die eigene Meldung wieder zu lesen, gibt es nicht (Regel 2 der Schleife,
   von Kolja am 20.11.2026 so entschieden).

Ließ sich kein Foto aufnehmen, sagt das Formular es in einem Satz, und die
Meldung geht nur mit Text.

## Wie das Bildschirmfoto entsteht

**Im Rahmen gerendert, nicht über eine Browser-Schnittstelle.** Die App läuft
als iframe gleicher Herkunft (`docs/features/APPS.md`, kein `sandbox`), also
darf der Rahmen ihr Dokument lesen. `modern-screenshot` (MIT, ohne weitere
Abhängigkeiten) klont das Dokument, legt es in ein SVG mit `foreignObject` und
lässt den Browser es auf eine Leinwand malen: das Bild ist, was der Browser
selbst rendert, mit allen Stilen der App. Gezeichnet wird der sichtbare Teil
des iframes, verschoben um den Scrollstand des Dokuments; bis zur doppelten
Auflösung. Die Bibliothek wird erst beim ersten Foto geladen.
(`apps/dashboard-frontend/src/features/apps/rueckmeldung/bildschirmfoto.ts`)

Verworfen: `getDisplayMedia`. Es fragt bei **jedem** Foto nach einer Freigabe
des Bildschirms, und auf dem iPhone gibt es es nicht.

Gemessen am 20.11.2026 am Orin, App Belege, Probe mit Playwright:

| Browser  | Breite  | Dauer  | Ergebnis                        |
| -------- | ------- | ------ | ------------------------------- |
| Chromium | 1440 px | 548 ms | deckungsgleich mit dem Schirm   |
| Chromium | 390 px  | 61 ms  | deckungsgleich, doppelte Dichte |
| WebKit   | 1440 px | 220 ms | deckungsgleich                  |
| WebKit   | 390 px  | 100 ms | deckungsgleich, doppelte Dichte |

Grenzen: Inhalt in einem eigenen Rollbereich der App kommt so, wie er dort
gerade steht. Ein Bild der App, das der Browser nicht hergibt, oder mehr als
acht Sekunden ergeben „ohne Bild“. Die Markierung wird vor dem Absenden in das
PNG gezeichnet (Farbe aus dem Token `--primary`) und zusätzlich als
`{ x, y, breite, hoehe }` in Anteilen gespeichert.

## Was gespeichert wird, und wo

| Was                       | Wo                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Text, App, Stand, Seite   | `public.rueckmeldungen` (Migration 214)                                             |
| Person, Zeit, Stand `neu` | dieselbe Zeile; Person aus der Sitzung, Zeit vom Gerät                              |
| Markierung                | `markierung` (JSONB, Anteile 0 bis 1)                                               |
| Bildschirmfoto            | Datei `<APPS_DIR>/.rueckmeldungen/<uuid>.png`, am Orin `data/apps/.rueckmeldungen/` |

- **Bilder als Dateien, im Baum der Apps.** Damit gehen sie jede Nacht ohne
  Umbau der Sicherung in den Stand (`services/backup-service/staende.sh`
  sichert `/arasul/apps` ganz) und kommen mit „Apps zurückholen“ wieder. Das
  Vorbild ist `.eingang`: ein Ordner mit Punkt wird nie als App gelesen.
- **Mit der Meldung geht das Bild.** `DELETE /api/rueckmeldungen/:id` löscht
  Zeile und Datei; scheitert beim Melden die Zeile, wird die Datei gleich
  wieder entfernt. In älteren Ständen der Sicherung bleibt beides, bis diese
  ablaufen.
- **Eine gelöschte Person** lässt ihre Meldungen ohne Namen zurück
  (`ON DELETE SET NULL`, in der Zusammenfassung der Löschung als
  `anon_rueckmeldungen`).
- **Werksreset:** die Tabelle steht bei den Inhalten, der Ordner der Bilder
  geht mit derselben Stufe.
- Nur PNG, höchstens 6 MB; die Seite muss unter `/apps/<app_id>/` liegen.

## Wer was darf

| Weg                                | Wer                                                                   |
| ---------------------------------- | --------------------------------------------------------------------- |
| `POST /api/rueckmeldungen`         | jeder, der die App in diesem Stand benutzen darf (`appZugang.pruefe`) |
| `GET /api/rueckmeldungen`          | nur Kennzeichen Entwickler                                            |
| `GET /api/rueckmeldungen/:id/bild` | nur Kennzeichen Entwickler                                            |
| `DELETE /api/rueckmeldungen/:id`   | nur Kennzeichen Entwickler                                            |

Das Kennzeichen wird bei **jedem** lesenden Aufruf frisch aus der Datenbank
gelesen, nicht aus dem Zwischenspeicher der Anmeldung: ein entzogenes
Kennzeichen gilt beim nächsten Aufruf. Die Rolle Administrator allein reicht
nicht. Belegt in `apps/dashboard-backend/__tests__/unit/rueckmeldungen.test.js`
(Abweisung für Mitarbeiter und für Administrator ohne Kennzeichen) und gegen
echtes Postgres in `__tests__/pg/rueckmeldungen.test.js`.

Einzelheiten der Wege: [`docs/api/API_REFERENCE.md`](../api/API_REFERENCE.md#rückmeldungen-j42-m7-20112026).

## Die Liste für Entwickler

Verwaltung › **Rückmeldungen**, nach Apps, nur in der Leiste, wenn die Person
das Kennzeichen trägt. Neueste zuerst; je Meldung App (mit „(Test)“ für den
Teststand), Person, Zeit, Text, Seite und das Foto mit der Stelle, das auf
Klick groß aufgeht; „Entfernen“ mit Rückfrage. Bewusst nicht mehr: den Eingang
mit Ständen und die Sicht je App baut das Entwickler-Cockpit (J44).

## Abnahme am Orin

`scripts/test/rueckmeldung-im-rahmen-abnahme.mjs`, am 20.11.2026 nach dem
Deploy 49 von 49 grün (Chromium und WebKit, 1440 und 390 px, Belege, Abschluss,
Probe-App). Bericht und Bilder:
[`docs/plans/audits/2026-11-20-rueckmeldung/`](../plans/audits/2026-11-20-rueckmeldung/README.md).

## Was diese Karte nicht baut

Die Schnittstelle für das Kit und den Schalter je App, ob Bilder an den Agenten
gehen (J43); das Entwickler-Cockpit (J44); keinen Chat, keinen Agenten im
Browser, keine Abstimmung, keine Sicht für andere Mitarbeiter.
