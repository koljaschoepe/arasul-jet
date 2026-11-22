# Demo ohne Gerät

> Stand: 22.11.2026, J46, J51 und J54 (M7). Das echte Frontend dieses Repos als
> statischer Bau mit gespielten Antworten statt Backend, kostenlos gehostet.
> Einstieg für Fremde ohne Gerät, verlinkt von der Website.
> Adresse: <https://arasul-demo.vercel.app> (Vercel-Projekt `arasul-demo`,
> Team `arasuls-projects`, Hobby-Tarif). `demo.arasul.de` ist vorgesehen,
> siehe [Eigene Adresse](#eigene-adresse).

## Was der Besucher sieht

Die produktive Anwendung eines erfundenen Metallbauers, der **Kerschner
Metallbau GmbH** in Grünfelden (62 Leute, Treppen, Geländer, Schweißbaugruppen;
wer sie ist, steht in [`demo/FIRMA.md`](../../apps/dashboard-frontend/demo/FIRMA.md)).
Angemeldet ist **Miriam Kerschner**, Betriebsleiterin, mit dem Recht in der
Werkstatt. Es gibt keinen Rollenwechsel und kein Band: was sie sieht, folgt
aus ihren Rechten. Oben in der Leiste steht das Logo der Firma, auf der
Startseite ihr Name.

**Deutsch ist Standard**, egal was der Browser meldet; Englisch wählt man in
der Kapsel, dann ist alles englisch (Shell und Werkstatt über das Wörterbuch,
die Fach-Apps und Dateien selbst zweisprachig).

**Sechs Apps**, jede mit eigenem Symbol: Angebote (`file-text`),
Wareneingang (`package-check`), Wartungsplan (`wrench`), Prüfprotokolle
(`clipboard-check`), Urlaubsanträge (`calendar-days`) und die Werkstatt
(`hammer`). Die fünf Fach-Apps haben dieselbe Form: Seitenkopf mit „… anlegen"
und CSV-Export, vier Kennzahlen mit Verlauf, eine Auswertung als Diagramm, was
als Nächstes ansteht, die Liste mit rund 40 Einträgen, Suche, Filter nach
Stand und Sortierung, je Zeile die nächste Aktion, Bearbeiten und Löschen.
Ein Klick öffnet die Einzelansicht als Blatt (am Rechner daneben, am Handy von
unten) mit Feldern, Dateien und Verlauf: bearbeiten, Stand ändern, freigeben
oder ablehnen (mit Satz), Notiz, Datei anhängen, löschen mit Rückfrage. Das
Formular prüft Pflichtfelder und fachliche Regeln (gültig bis nach dem Datum,
Resturlaub, Bestellnummer).

**Beispieldateien**: an den Vorgängen hängen Angebot, Lieferschein,
Wartungs- und Prüfprotokoll, Urlaubsantrag als PDF und Zeichnung oder Foto als
einfache Zeichnung. Der Service Worker erzeugt sie beim Öffnen aus dem Eintrag
(`dokumente.ts`), mit dem Namen der Firma und dem Satz, dass alles erfunden ist.
Sie passen damit auch zu einem eben angelegten oder geänderten Eintrag.

**Die Startseite** ist die des Produkts (Gruß, „Für Sie" mit den Freigaben,
eine Kachel je App). Die Demo setzt zwei Teile dazu (`uebersicht.tsx`): unter
den Gruß Firma, Datum, Schnellzugriffe und sechs Kennzahlen über alle Apps mit
Verlauf; vor die Kacheln „Heute steht an" und „Zuletzt geändert". Freigaben
in „Für Sie" öffnen den Vorgang in seiner App (`zeigt_freigaben`).

**Die Werkstatt** zeigt alle Rückmeldungen (14 aus der Firma), Angebote 1.5.0
(Rabatt) und Prüfprotokolle 1.9.0 (Nacharbeit mit Frist) warten in Test.
Live geschaltet, rechnet Angebote mit Rabatt.

**Der Hinweis auf die Demo** ist eine ruhige Zeile in der Kapsel oben rechts:
„Demo", „Kurz zeigen lassen", „Zurücksetzen" (fragt einmal nach), Deutsch
oder Englisch, „Zur Website". Unter 1180 px ist es ein Knopf „Demo" mit
demselben Menü aus Glas. Über einer App sitzt die Zeile in der Kapsel des
Rahmens, sonst schwebt sie allein an derselben Stelle; der Seitenkopf hält
den Platz frei.

**Der geführte Weg** (`fuehrung.ts`) beginnt nur über „Kurz zeigen lassen".
Fünf Schritte: Startseite, „Für Sie", Angebote, Rückmeldung, Werkstatt. Eine
Karte aus Glas unten rechts, am Handy als Blatt von unten, ein ruhiger Rahmen
um die Stelle (kein Puls, gleitet in 200 ms, bei „weniger Bewegung" sofort).
„Zurück", „Weiter", „Beenden", Escape. Der Stand liegt in `sessionStorage`.

Alles, was der Besucher ändert, liegt in IndexedDB in seinem Browser und
übersteht ein Neuladen; „Zurücksetzen" stellt den Anfang her.

Nicht in der Demo: die Verwaltung (gehört dem Administrator), das Terminal
(meldet „nicht eingeschaltet"), Flows. Jeder Weg, den die Demo nicht kennt,
antwortet mit 404 und dem Satz „In der Demo nicht verfügbar".

## Wie sie gebaut ist

Alles liegt in `apps/dashboard-frontend/demo/`. Das Produkt weiß nichts davon:
kein Schalter in `src/`, kein Zweig im Code.

| Datei                                | Was                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `start.ts`             | Eingang. Meldet den Service Worker an, wartet, bis er die Seite steuert, setzt Kapsel, Übersicht und Weg, lädt dann `src/index.tsx` unverändert                                           |
| `dienst.ts`                          | Service Worker, die **eine Schicht gespielter Antworten**. Fängt jede Anfrage an `/api/…` und an `/apps/<id>/(test/)api/…` ab, auch aus den iframes und von `<img>`. Zustand in IndexedDB |
| `antworten.ts`                       | Die Antworten als reine Funktion: die Plattform in den Formen des Backends, die Fach-Apps mit Einträgen, Stand, Freigabe, Dateien                                                         |
| `firma.ts`, `bestand.ts`, `daten.ts` | Die Firma (Personen, Kunden, Lieferanten, Maschinen, Artikel, Aufträge), die Einträge der fünf Apps, der Zustand mit Rückmeldungen und Fassungen                                          |
| `dokumente.ts`                       | PDF (kleiner Schreiber, Standardschriften) und SVG-Zeichnungen aus dem Eintrag                                                                                                            |
| `kapsel.ts`, `kapsel.css`            | Die Demo-Zeile in der Kapsel und die Gestalt des Wegs; Farben nur aus Tokens                                                                                                              |
| `uebersicht.tsx`, `uebersicht.css`   | Die Übersicht des Betriebs auf der Startseite                                                                                                                                             |
| `fuehrung.ts`                        | Der geführte Weg                                                                                                                                                                          |
| `uebersetzung.ts`, `woerterbuch.ts`  | Englisch ohne Sprachschicht im Produkt: ersetzt sichtbare Sätze im DOM nach Wörterbuch, in der Shell und in der Werkstatt                                                                 |
| `apps/`                              | Die fünf Fach-Apps: `fachapp.tsx` (die gemeinsame Form), je App eine Beschreibung ihrer Fachlichkeit, gebaut wie eine App aus dem Kit (React und `@marken` zur Laufzeit von `/marken/5/`) |
| `vite.config.ts`, `bauen.mjs`        | Der Bau nach `dist-demo/`; die Fach-Apps baut esbuild mit `/marken/5/` als außen                                                                                                          |
| `abnahme.mjs`                        | Die Abnahme mit Playwright                                                                                                                                                                |

Warum ein Service Worker und kein ausgetauschtes `fetch`: er erreicht auch
Bilder (`/api/rueckmeldungen/<id>/bild`) und die Apps im iframe, darunter die
Werkstatt mit ihrem eigenen `fetch`.

## Bauen und prüfen

```bash
cd apps/dashboard-frontend
npm run demo:bauen                       # nach dist-demo/, dist/ bleibt unberührt
npx vitest run demo                      # Antworten und Wörterbuch
ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright> \
  node demo/abnahme.mjs [--bilder <ordner>] [--protokoll <datei>]
ARASUL_DEMO_URL=https://arasul-demo.vercel.app node demo/abnahme.mjs   # gegen die Auslieferung
```

Die Abnahme geht je Sprache bei 360, 390, 768 und 1440 px durch die
Startseite, jede Fach-App (ein Eintrag angelegt, einer geändert, eine Datei
geöffnet), die Werkstatt, die Einstellungen, den geführten Weg und
„Zurücksetzen". Sie ist rot bei waagrechtem Überlauf, einer fremden Herkunft
im Netzwerk, einer Anfrage an `/api/…`, die den Server erreicht, einem Fehler
in der Konsole, einem Band, „Sample" oder „Beispiel-Mitarbeiter", einem Weg,
der von selbst beginnt, und im Englischen bei einem deutschen Satz in Shell
oder Werkstatt. `--sammeln` gibt diese deutschen Reste als Liste aus,
`--sprache` und `--breite` grenzen den Lauf ein.
Passt der Chromium nicht zur Playwright-Fassung: `ARASUL_CHROMIUM=<Pfad>`.

Die CI baut die Demo im Job „Frontend" mit (`Demo bauen (J46)`); die Tests
unter `demo/` laufen mit Vitest.

## Ausliefern

**Aus der CI** (seit J51): `.github/workflows/demo.yml` baut nach jedem Merge
auf `main`, der Frontend, Werkstatt oder Bibliothek ändert (oder von Hand mit
`workflow_dispatch`), und legt `dist-demo/` als Produktion auf
`arasul-demo`. Danach fragt er die Adresse einmal ab. Dafür braucht das Repo
das Geheimnis `VERCEL_TOKEN` (ein Token des Teams `arasuls-projects`, unter
vercel.com › Account Settings › Tokens, im Repo unter Settings › Secrets ›
Actions). Fehlt es, baut der Lauf, meldet „ohne Token nicht ausgeliefert"
und bleibt grün.

**Von Hand**, solange das Geheimnis fehlt:

```bash
cd apps/dashboard-frontend
npm run demo:bauen
cd dist-demo
vercel link --yes --project arasul-demo --scope arasuls-projects
vercel deploy --prod --yes --scope arasuls-projects
```

`dist-demo/vercel.json` bringt die Umschreibung von `/workspace/…` auf
`index.html` und eine CSP mit, die nur die eigene Herkunft erlaubt. Der Bau
legt kein Geheimnis ab; `vercel link` schreibt `.vercel/` und `.env.local`
nach `dist-demo/`, beides ist ignoriert, wird nicht hochgeladen und beim
nächsten Bau gelöscht.

**Das Gerät bleibt unberührt.** `demo/` und `dist-demo/` stehen in
`.dockerignore`; das Abbild des Frontends baut weiter aus `index.html` nach
`dist/`. Ein Merge mit Änderungen hier deployt wie jeder andere auf den Orin,
mit demselben Abbild.

## Eigene Adresse

`demo.arasul.de` ist nicht gesetzt (Stand 20.11.2026). Zwei Schritte von Hand:

1. Im Vercel-Dashboard, Projekt `arasul-demo`, Domains: `demo.arasul.de`
   hinzufügen (die CLI weist das mit `domain_not_owned` ab).
2. Bei Hetzner (DNS von `arasul.de`): `demo` als CNAME auf
   `cname.vercel-dns.com`.
