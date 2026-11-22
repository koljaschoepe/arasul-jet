# Demo ohne Gerät

> Stand: 21.11.2026, J46 und J51 (M7). Das echte Frontend dieses Repos als statischer
> Bau mit gespielten Antworten statt Backend, kostenlos gehostet. Einstieg für
> Fremde ohne Gerät, verlinkt von der Website.
> Adresse: <https://arasul-demo.vercel.app> (Vercel-Projekt `arasul-demo`,
> Team `arasuls-projects`, Hobby-Tarif). `demo.arasul.de` ist vorgesehen,
> siehe [Eigene Adresse](#eigene-adresse).

## Was der Besucher sieht

Er ist ohne Anmeldung **Beispiel-Mitarbeiter** der erfundenen Beispielwerk GmbH
(Kälte- und Klimatechnik) und hat drei kleine Apps, jede mit eigenem Symbol,
Seitenkopf, Kennzahlen und einer kompakten Tabelle (`Datenliste`): Angebote
(`file-text`), Wartungsplan (`wrench`), Urlaubsanträge (`calendar-days`).

**Der geführte Weg** (`fuehrung.ts`, seit J51) beginnt beim ersten Besuch von
selbst. Fünf Schritte, jeder mit einem Hinweis aus Glas an der Stelle, um die
es geht, einem Ring um diese Stelle, „Weiter" und „Überspringen":

| Schritt | Stelle                                 | „Weiter" tut                              |
| ------- | -------------------------------------- | ----------------------------------------- |
| 1       | Kachel „Angebote" (sonst die Leiste)   | öffnet Angebote                           |
| 2       | das Icon der Rückmeldung in der Kapsel | geht weiter (schreiben muss man selbst)   |
| 3       | „App-Betreuung" im Band                | wechselt die Person, die Werkstatt öffnet |
| 4       | der Eingang der Werkstatt              | öffnet „Test nach Live"                   |
| 5       | „Live schalten" bei Angebote 1.5.0     | beendet den Weg                           |

Wer selbst klickt, kommt ohne „Weiter" voran (App geöffnet, Rückmeldung
gesendet, Eingang der Werkstatt offen). Ein offener Dialog hat Vorrang, der Hinweis tritt
dann zurück. Am Handy steht der Hinweis über der Leiste unten. Esc und
„Überspringen" beenden den Weg, „So geht's" im Band beginnt ihn neu, als
Mitarbeiter. Der Stand liegt in `sessionStorage`.

Live geschaltet, rechnet Angebote mit Rabatt; das ist der Weg, den die
Website erklärt.

Seit J52 (22.11.2026) hat auch der Mitarbeiter der Demo die **Werkstatt**: dort
stehen nur seine Meldungen mit Stand, eine aus den Beispieldaten und die eben
gesendete. Der Schalter im Band wechselt nicht die Rolle, sondern die Person:
zur App-Betreuung, dieselbe Art Konto mit dem Recht in der Werkstatt. Die
Abnahme der Demo prüft, dass der Mitarbeiter keine fremde Meldung und keine
Seite Eingang, Apps oder Live sieht.

Das Band liegt seit J51 hell auf hell (dunkel auf dunkel), in der Fläche des
Produkts mit feiner Linie darunter: „Demo mit Beispieldaten", Mitarbeiter
oder App-Betreuung, „So geht's", „Zurücksetzen", Deutsch oder Englisch, „Zur
Website". Unter 760 px fallen „Zurücksetzen" und „Zur Website" weg.

Nicht in der Demo: die Verwaltung (gehört dem Administrator), das Terminal
(meldet „nicht eingeschaltet"), Freigaben, Flows. Jeder Weg, den die Demo
nicht kennt, antwortet mit 404 und dem Satz „In der Demo nicht verfügbar".

## Wie sie gebaut ist

Alles liegt in `apps/dashboard-frontend/demo/`. Das Produkt weiß nichts davon:
kein Schalter in `src/`, kein Zweig im Code.

| Datei                               | Was                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `start.ts`            | Eingang. Meldet den Service Worker an, wartet, bis er die Seite steuert, setzt das Band, lädt dann `src/index.tsx` unverändert                                                            |
| `dienst.ts`                         | Service Worker, die **eine Schicht gespielter Antworten**. Fängt jede Anfrage an `/api/…` und an `/apps/<id>/(test/)api/…` ab, auch aus den iframes und von `<img>`. Zustand in IndexedDB |
| `antworten.ts`, `daten.ts`          | Die Antworten als reine Funktion in den Formen des Backends; die Beispieldaten                                                                                                            |
| `band.ts`, `band.css`               | Das Band. Zieht der Shell (`h-dvh`) seine Höhe ab, Farben nur aus Tokens                                                                                                                  |
| `uebersetzung.ts`, `woerterbuch.ts` | Englisch ohne Sprachschicht im Produkt: ersetzt sichtbare Sätze im DOM nach Wörterbuch, in der Shell und in der Werkstatt. Unbekanntes bleibt deutsch                                     |
| `apps/`                             | Die drei Beispiel-Apps, Apps ohne Bau auf `/marken/5/` wie `tests/beispielapp/`, deutsch und englisch                                                                                     |
| `vite.config.ts`, `bauen.mjs`       | Der Bau nach `dist-demo/`                                                                                                                                                                 |
| `abnahme.mjs`                       | Die Abnahme mit Playwright                                                                                                                                                                |

Warum ein Service Worker und kein ausgetauschtes `fetch`: er erreicht auch
Bilder (`/api/rueckmeldungen/<id>/bild`) und die Apps im iframe, darunter das
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

Die Abnahme geht den Weg je Sprache bei 390, 768 und 1440 px und ist rot bei
waagrechtem Überlauf, einer fremden Herkunft im Netzwerk, einer Anfrage an
`/api/…`, die den Server erreicht, und einem Fehler in der Konsole.
`--sammeln` gibt die sichtbaren Sätze aus, die das Wörterbuch braucht.
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
