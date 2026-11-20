# Demo ohne Gerät

> Stand: 20.11.2026, J46 (M7). Das echte Frontend dieses Repos als statischer
> Bau mit gespielten Antworten statt Backend, kostenlos gehostet. Einstieg für
> Fremde ohne Gerät, verlinkt von der Website.
> Adresse: <https://arasul-demo.vercel.app> (Vercel-Projekt `arasul-demo`,
> Team `arasuls-projects`, Hobby-Tarif). `demo.arasul.de` ist vorgesehen,
> siehe [Eigene Adresse](#eigene-adresse).

## Was der Besucher sieht

Er ist ohne Anmeldung **Beispiel-Mitarbeiter** der erfundenen Beispielwerk GmbH
und hat drei kleine Apps: Angebote, Wartungsplan, Urlaubsanträge. Über jeder
App steht das Icon der Rückmeldung (`docs/features/RUECKMELDUNG.md`); eine
Meldung mit Bildschirmfoto und markierter Stelle bleibt in seinem Browser.
Das Band oben schaltet auf **Beispiel-Entwickler** um: dann öffnet sich das
Entwickler-Cockpit mit der Meldung im Eingang, und unter „Test nach Live"
liegt Angebote 1.5.0 bereit. Live geschaltet, rechnet die App mit Rabatt. Das
ist der Weg, den die Website erklärt; „So geht's" im Band nennt ihn in vier
Schritten.

Das Band sagt „Demo mit Beispieldaten", schaltet Deutsch und Englisch, setzt
die Demo zurück und führt auf <https://www.arasul.de>.

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
| `uebersetzung.ts`, `woerterbuch.ts` | Englisch ohne Sprachschicht im Produkt: ersetzt sichtbare Sätze im DOM nach Wörterbuch, in der Shell und im Cockpit. Unbekanntes bleibt deutsch                                           |
| `apps/`                             | Die drei Beispiel-Apps, Apps ohne Bau auf `/marken/5/` wie `tests/beispielapp/`, deutsch und englisch                                                                                     |
| `vite.config.ts`, `bauen.mjs`       | Der Bau nach `dist-demo/`                                                                                                                                                                 |
| `abnahme.mjs`                       | Die Abnahme mit Playwright                                                                                                                                                                |

Warum ein Service Worker und kein ausgetauschtes `fetch`: er erreicht auch
Bilder (`/api/rueckmeldungen/<id>/bild`) und die Apps im iframe, darunter das
Cockpit mit seinem eigenen `fetch`.

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
unter `demo/` laufen mit Vitest. Ausgeliefert wird nicht aus der CI.

## Ausliefern

Von Hand, nach einem Merge, der das Frontend oder die Demo ändert:

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
