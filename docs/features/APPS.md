# Apps: das Manifest `app.json`, die zwei Stände und die Anmeldung

> Phasen C3 bis C5 des Umbaus vom 26.08.2026. Die Durchsetzung steht in
> `apps/dashboard-backend/src/schemas/apps.js` (Manifest) und
> `apps/dashboard-backend/src/services/app/appZugang.js` (Anmeldung); wer
> eines davon ändert, ändert beides.
>
> **Wie ein Paket auf das Gerät kommt**, steht auf einer eigenen Seite:
> [APP-PAKET.md](APP-PAKET.md). Diese hier sagt, was eine App IST.

**Eine App ist das, was ein Partner mit dem Ara-Kit baut und auf das Gerät
rollt.** Sie besteht aus höchstens zwei Teilen: einem statischen Frontend, das
Arasul unter `/apps/<id>/` ausliefert, und einem Backend-Container, den Traefik
unter `/apps/<id>/api/` erreicht. Eines von beiden muss sie haben, beides darf
sie haben.

Es gibt keinen App-Katalog mehr, aus dem ein Administrator etwas aussucht. Bis
Phase B7 war eine App ein Container aus einem Laden; seit C3 ist sie etwas, das
jemand geschrieben und hierher gebracht hat.

## Wo eine App am Gerät liegt

```
/arasul/apps/<id>/<version>/app.json
/arasul/apps/<id>/<version>/frontend/index.html
/arasul/apps/<id>/<version>/frontend/…
```

Die Version steht im Pfad, weil zwei Versionen gleichzeitig dort liegen: der
Livestand für alle Freigegebenen und der Teststand für die Tester. Ein Ordner,
den der nächste Deploy überschreibt, könnte das nicht.

Das Verzeichnis ist in `dashboard-backend` als `APPS_DIR` eingehängt
(`compose/compose.app.yaml`), schreibbar. Der Weg, auf dem ein Paket dorthin
kommt, ist seit Phase C5 `POST /api/v1/external/apps`: das Gerät packt aus,
prüft, baut und versioniert selbst ([APP-PAKET.md](APP-PAKET.md)). Der ältere
Weg — das Kit legt die Dateien über SSH ab und ruft
`POST /api/apps/<id>/einspielen` — funktioniert weiter und ruft denselben
Dienst.

## Das Manifest, Fassung 1

```json
{
  "schema": 1,
  "id": "urlaubsantrag",
  "name": "Urlaubsantrag",
  "version": "1.2.0",
  "beschreibung": "Urlaub beantragen, Vertretung eintragen, Freigabe holen.",
  "frontend": { "verzeichnis": "frontend" },
  "backend": {
    "image": "urlaubsantrag:1.2.0",
    "bauen": { "verzeichnis": "backend" },
    "gesundheit": "/gesund",
    "umgebung": { "ABTEILUNG_STANDARD": "Werkstatt" }
  },
  "ports": { "backend": 8080 },
  "ressourcen": { "speicher": "512m", "cpus": 1 },
  "modelle": ["qwen3:14b-q8"],
  "flows": { "verzeichnis": "flows" },
  "agent": [
    {
      "method": "GET",
      "path": "antraege",
      "purpose": "Alle Anträge mit dem Stand ihrer Freigabe.",
      "params": [],
      "writes": false
    }
  ]
}
```

| Feld           | Pflicht     | Bedeutung                                                                                                                                   |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`       | ja          | Muss `1` sein. Eine andere Zahl wird abgewiesen, nicht ignoriert.                                                                           |
| `id`           | ja          | Kleinbuchstaben, Ziffern, Bindestrich. Steht im Pfad, im Containernamen, im Router.                                                         |
| `name`         | ja          | Der Anzeigename, wie ein Mensch ihn liest.                                                                                                  |
| `version`      | ja          | Drei Zahlen mit Punkten, optional ein Zusatz: `1.2.0`, `1.2.0-rc1`.                                                                         |
| `beschreibung` | nein        | Ein Satz, höchstens 500 Zeichen.                                                                                                            |
| `frontend`     | nein\*      | `{ "verzeichnis": "frontend" }` — wo im Paket die fertigen Dateien liegen.                                                                  |
| `backend`      | nein\*      | `{ "image", "bauen"?, "gesundheit"?, "umgebung"? }`                                                                                         |
| `ports`        | mit Backend | `{ "backend": 8080 }` — der Port IM Container.                                                                                              |
| `ressourcen`   | nein        | `{ "speicher": "512m", "cpus": 1 }`, das ist auch die Vorgabe.                                                                              |
| `modelle`      | nein        | Welche Sprachmodelle die App braucht (eine **Forderung**).                                                                                  |
| `flows`        | nein        | `{ "verzeichnis": "flows" }` — wo im Paket ihre Flow-Dateien liegen (eine **Lieferung**).                                                   |
| `marken`       | nein        | Das Designsystem: `"5.3.0"` heißt Kopie dieser Fassung (H6), `"5"` heißt zur Laufzeit vom Gerät (M5, Kontrakt 9). Siehe unten.              |
| `agent`        | nein        | Die Routen, die die App einem Agenten anbietet (Brücke, 21.09.2026). Siehe unten.                                                           |
| `verbindungen` | nein        | Hostnamen, zu denen die App ins Internet will (J38, Kontrakt 7). Der Ausgangs-Proxy lässt genau diese durch. Siehe „Das Netz der Apps“.     |
| `symbol`       | nein        | Das Bild der App in der Aktivitätsleiste (M5, Kontrakt 8): ein Lucide-Name (`file-text`) oder ein Kürzel aus 1 bis 3 Großbuchstaben (`BE`). |

\* Mindestens eines von `frontend` und `backend`.

**`symbol`** (M5, Kontrakt 8) hat zwei Schreibweisen, die sich nicht
überschneiden, damit das Gerät am Wert erkennt, was gemeint ist: ein Name aus
dem Lucide-Satz ist klein mit Bindestrichen (`file-text`), ein Kürzel ist groß,
ein bis drei Buchstaben oder Ziffern (`BE`). Das Gerät prüft die **Form**, nicht
den Satz: der wächst mit der Bibliothek der Shell, und ein Backend, das ihn
nachbaut, wiese morgen ein Symbol ab, das die Shell zeichnen kann. Kennt die
Shell den Namen nicht oder fehlt `symbol`, zeigt sie das Kürzel aus dem Namen
der App — ein Tippfehler kostet ein Bild, nie eine App. Abgewiesen wird mit
Grund, etwa `symbol: ein Lucide-Name in Kleinbuchstaben mit Bindestrichen …`.
Die Shell liest das Feld noch nicht; sie folgt mit einer späteren Karte.

`backend.bauen` (Phase C5) sagt, WORAUS das Gerät das Image baut:
`{ "verzeichnis": "backend", "dockerfile": "Dockerfile" }`, beides relativ zum
Paket beziehungsweise zum Bau-Kontext. Mit `bauen` ist `image` der Name, unter
dem das Ergebnis abgelegt wird; ohne `bauen` der Name eines Images, das schon
am Gerät liegt. **Der Deploy-Endpunkt verlangt `bauen`** — er nimmt keine
fertigen Images entgegen. Ein Image-Tar ist ein Dateisystem, das niemand mehr
liest, bevor es läuft, und es ist für eine Architektur gebaut; ein Partner mit
einem x86-Laptop hätte für einen ARM64-Jetson etwas Unbrauchbares geschickt,
ohne es zu merken.

**Unbekannte Felder werden abgewiesen.** Ein Tippfehler oder eine Erwartung an
eine Fassung, die es noch nicht gibt, still zu schlucken hieße, dem Partner zu
bestätigen, dass etwas wirkt, das nichts tut.

**`id` und `version` müssen zum Ordner passen.** Sonst hätte eine App zwei
Namen, je nachdem wen man fragt.

### Was das Manifest NICHT kann

- **Keine Bind-Mounts vom Host.** Eine App bekommt ein Netz, eine Grenze und
  sonst nichts. Braucht sie einen Ordner, ist das ein eigener Beschluss und
  keine Zeile in ihrem eigenen Manifest.
- **Keinen Port am Host.** Erreichbar ist sie unter `/apps/<id>/api/`, sonst
  nirgends. Ein zweiter Weg neben Traefik wäre in Phase C4 nicht mehr zu
  schließen.
- **Keine Geheimnisse in `umgebung`.** Das Manifest liegt im Paket und im
  Kit-Repository des Partners. Den API-Schlüssel je App setzt das Gerät beim
  Einspielen (siehe „Was das Gerät der App mitgibt").
- **Kein Nachinstallieren von Modellen.** `modelle` sagt, welche die App
  verlangt; das Gerät sagt beim Einspielen, was davon fehlt. Ein Deploy, der
  nebenbei sieben Gigabyte lädt, ist keine Installation mehr, sondern ein
  Abend.

## Das Erscheinungsbild einer App (Phase D7)

Eine App bringt ihr Aussehen **nicht mehr selbst mit**. Sie ist React-Code auf
dem Designsystem des Geräts (`packages/marken/`): Schrift, Farben, Abstände und
sechs Bausteine — Kopf, Liste, Karte, Formular, Meldung, Menü.

Der Grund steht auf dem Bildschirm: die App läuft im Rahmen der Shell
(`/apps/<id>/` im iframe), und der Mensch sieht beides als **ein** Ding. Zwei
Erscheinungsbilder übereinander sind kein Geschmack, sondern ein Fehler.

**Seit M5 ist der erste Weg der vom Gerät:** eine App lädt die Bibliothek zur
Laufzeit unter `/marken/5/` und trägt keine Kopie (siehe
[„Die Bibliothek zur Laufzeit“](#die-bibliothek-zur-laufzeit-m5)). Die zwei
Wege mit Kopie gibt es weiter, und Apps, die sie gehen, laufen unverändert:

| Die App hat…      | …und nimmt (Kopie)                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| einen Bauschritt  | die Quelle `packages/marken/src/` (das Ara-Kit spiegelt sie in die Vorlage aus E5) und schreibt JSX |
| keinen Bauschritt | `marken.js` und `marken.css` neben `index.html`, und schreibt `h(Karte, {...})` statt JSX           |

Ohne Bauschritt geht **kein JSX**: JSX braucht einen Übersetzer, und im Browser
übersetzt einer nur mit `eval` — das verbietet die Content-Security-Policy
dieses Geräts. `scripts/util/marken-beilegen.sh` legt die zwei Dateien beim
Einspielen daneben; `tests/beispielapp/` zeigt beides an einem Beispiel, das
läuft.

### Die App folgt dem Theme des Menschen (Phase H2)

Das Theme gehört seit H1 dem angemeldeten Menschen (`admin_users.theme`, Hell
oder Dunkel). Eine App läuft im `iframe` als eigenes Dokument, und
CSS-Variablen reichen nicht über eine Dokumentgrenze — bis H2 stand jede App
deshalb auf den Rückfallwerten von `marken.css`, unabhängig davon, was der
Mensch eingestellt hatte.

Seit H2 reicht die Shell es hinein. Der Rahmen hat dieselbe Herkunft wie die
Shell (deshalb steht an ihm kein `sandbox`, siehe C4), also gibt es zwei Wege,
und beide gehen von der Shell aus:

| Weg                                  | Was dort steht                                        |
| ------------------------------------ | ----------------------------------------------------- |
| `data-theme` am `<html>` der App     | `dark`, oder **gar nichts** — Hell ist der Grund (H1) |
| `postMessage` an das Fenster der App | `{ typ: 'arasul:theme', theme: 'light' \| 'dark' }`   |

**Eine App muss dafür nichts tun.** `marken.css` trägt seit H2 einen Block
`[data-theme='dark']`, also färbt sich alles, was aus der Bibliothek gebaut
ist, von selbst um — die Beispielapp geht diesen Weg und hat keine Zeile
dafür. Die Nachricht ist für eine App, die mehr tut als Farben tauschen (ein
Bild, ein Diagramm): sie nennt den Wert ausdrücklich, während „kein Attribut"
für fremden Code keine Auskunft ist.

Ein dritter Weg braucht von der Shell nichts und steht der App frei: das
`<html>` des **Elternfensters** lesen und mit einem `MutationObserver` darauf
hören. So macht es die Vorlage des Ara-Kits.

Der Wechsel **lädt den Rahmen nicht neu**: das Theme steht weder im `key` noch
in der Adresse des `iframe`, und der App-Tab bleibt stehen, während der Mensch
in den Einstellungen ist. Eine App verliert dabei also nichts — auch kein halb
ausgefülltes Formular.

**Eine App mit Kopie, die schon am Gerät liegt, bekommt die neue `marken.css`
erst beim nächsten Einspielen.** Die Datei liegt neben ihr und nicht in der
Shell. Eine App, die die Bibliothek zur Laufzeit lädt, bekommt sie mit dem
Update des Geräts.

### Die App sagt, auf welcher Fassung sie steht (Phase H6)

Eine App trägt die Bibliothek als **Kopie** — als Spiegel der Quelle in ihrem
Frontend (mit Bau) oder als beigelegtes `marken.js` (ohne). Die Shell zieht mit
jedem Deploy nach, die App bleibt auf dem Stand ihres letzten Paketbaus, und
der Mensch sieht beides in **einem** Rahmen übereinander. Nichts an einer
laufenden App würde davon rot.

Deshalb sagt sie es selbst:

```json
{ "marken": "3.1.0" }
```

Was das Gerät daraus macht: `GET /api/apps` und `GET /api/apps/:id` führen die
Zahl je Stand als `marken` mit (`null`, wenn das Manifest sie nicht nennt), und
die App-Verwaltung zeigt sie in der Karte des Standes. Steht dort eine ältere
Fassung als die der Shell — oder gar keine —, sagt sie das.

**Seit dem Auftrag geraet-zeigt-bibliotheksstand (08.09.2026) steht sie auch in
der Liste** (Einstellungen → Apps, Spalte **Bibliothek**), vor jedem Klick:
ohne Sicht darauf merkt niemand, dass eine App seit Monaten auf einer alten
Bibliothek steht. Sagen beide Stände dasselbe, steht es einmal da, sonst je
Stand. Eine Fassung, die **älter** ist als die des Geräts, und eine, die
**fehlt**, sind eine **Warnung** — Grau mit Text und Dreieck, kein Rot, kein
Verbot: einspielen und live schalten geht weiter, das Kit erzwingt beim Bau,
das Gerät zeigt. Und nur bei Apps mit **Frontend**: ein fremder Container, der
nur ein Backend mitbringt (`dateien.frontend: null`), hat kein
Erscheinungsbild, braucht keine Bibliothek und bekommt keine Warnung — dort
steht „kein Frontend". Die Logik liegt an einer Stelle
(`features/settings/apps/Bibliothek.tsx`), Liste und Karte lesen sie beide.

**Das Gerät vergleicht im Backend nicht.** Die Fassung der Bibliothek kennt die
Shell, weil sie sie mitübersetzt (`FASSUNG` aus `@marken`); eine zweite Zahl im
Backend wäre eine, die eines Tages etwas anderes sagt.

**Und es ist kein Mangel.** Eine App mit einer alten Bibliothek läuft; sie
sieht nur nicht mehr aus wie das Gerät um sie herum. Das ist etwas anderes als
`lieferbar: false`, und es steht deshalb an einer anderen Stelle.

Die Angabe ist **freiwillig**: jede App, die vor H6 gebaut wurde, hat sie
nicht, und ein Manifest deswegen abzuweisen hieße, eine laufende App an einer
Auskunft scheitern zu lassen, die es zu ihrer Bauzeit nicht gab.

Woher ein Partner die richtige Zahl bekommt: aus dem **Paket**, das das
Auslieferungsartefakt trägt — `packages/marken/marken.json` nennt `fassung`,
die Abhängigkeiten und jede Datei mit ihrem sha256
(`scripts/deploy/marken-paket.py`, Einbauanleitung in
`packages/marken/EINBAU.md`).

### Die Bibliothek zur Laufzeit (M5)

> Karte marken-zur-laufzeit, 03.10.2026, Kontrakt 9. Das Ara-Kit baut darauf
> (Karte kit-geruest-bausteine-zur-laufzeit). Gemessen mit
> `scripts/test/marken-laufzeit-abnahme.mjs`.

**Das Gerät liefert seine Bibliothek selbst aus**: Bausteine, Primitive,
Muster, die Tokens beider Themes und das fertig übersetzte Stylesheet, unter
einer festen Adresse auf derselben Herkunft wie jede App:

```
/marken/marken.json         welche Fassung, welche Hauptzahl, welche Adresse
/marken/5/marken.css        Tokens, Regeln der Bausteine, Klassen der Primitive
/marken/5/marken.js         alle drei Sätze, dazu h, rendern und die Hooks
/marken/5/diagramm.js       Chart, Sparkline, SERIENFARBEN
/marken/5/react.js          react            (für eine App mit Bau)
/marken/5/react-dom.js      react-dom
/marken/5/react-dom-client.js  react-dom/client
/marken/5/jsx-runtime.js    react/jsx-runtime
/marken/5/marken.json       dasselbe wie oben, dazu jede Datei mit sha256
```

Eine App, die von dort lädt, **braucht kein Tailwind**: die Klassen, die
Primitive und Muster benutzen, erzeugt das Gerät beim eigenen Bau
(`packages/marken/laufzeit.config.mjs`, aufgerufen von `npm run build` der
Shell) und legt sie in `marken.css`. Die Content-Security-Policy des Geräts
bleibt, wie sie ist: alles kommt von `'self'`, nichts braucht `eval`, kein
Import-Map, keine Inline-Skripte. **Und sie sieht nach einem Update des Geräts
ohne Neubau aus wie das Gerät**: unter `/marken/5/` steht immer die neueste
Fassung 5.x.

**Im Manifest** nennt sie nur die Hauptzahl. Daran erkennt die Verwaltung,
dass es keine Kopie gibt, die veralten könnte:

```json
{ "marken": "5" }
```

**Ohne Bau** (zwei Dateien im Paket, `index.html` und ein Skript):

```html
<link rel="stylesheet" href="/marken/5/marken.css" />
<script type="module" src="app.js"></script>
```

```js
import {
  h,
  rendern,
  useState,
  Seitenleiste,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  Datenliste,
  Freigabe,
} from '/marken/5/marken.js';

rendern(
  h(
    SidebarProvider,
    null,
    h(Seitenleiste, { gruppen: [{ eintraege: [{ kennung: 'a', name: 'Vorgänge' }] }] }),
    h(SidebarInset, null, h(SidebarTrigger), h(Datenliste, {/* … */}))
  ),
  document.getElementById('app')
);
```

Die Adresse ist **absolut** (`/marken/5/…`), anders als die Schnittstelle der
App: sie ist für jede App und jeden Stand dieselbe, auch im Teststand
`/apps/<id>/test/`. Was die App selbst gestaltet, schreibt sie mit den Tokens
(`style: { borderBottom: '1px solid var(--border)' }`), nicht mit
Tailwind-Klassen: die stehen in `marken.css` nur, soweit die Bibliothek sie
benutzt. Ein vollständiges Beispiel, das am Orin läuft:
`tests/marken-laufzeit-app/`.

**Mit Bau** (Vite, JSX, TypeScript): React und die Bibliothek bleiben
außerhalb des Bündels und kommen vom Gerät. React gibt es dann genau einmal,
das des Geräts; ein zweites in der App bricht jeden Hook.

```js
// vite.config.js
const MARKEN = '/marken/5/';
const vomGeraet = {
  react: MARKEN + 'react.js',
  'react-dom': MARKEN + 'react-dom.js',
  'react-dom/client': MARKEN + 'react-dom-client.js',
  'react/jsx-runtime': MARKEN + 'jsx-runtime.js',
  '@marken': MARKEN + 'marken.js',
  '@marken/diagramm': MARKEN + 'diagramm.js',
};
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: { external: Object.keys(vomGeraet), output: { paths: vomGeraet } },
  },
});
```

Im Code bleibt alles wie mit Kopie (`import { Button } from '@marken'`, JSX);
die Typen liefert die Quelle aus dem Paket (`packages/marken/src/`, Alias
`@marken` in der `tsconfig`), gebündelt wird sie nicht. In `index.html` steht
`<link rel="stylesheet" href="/marken/5/marken.css">`, und die eigene CSS-Datei
der App braucht kein `@import 'tailwindcss'` mehr. Gemessen am 03.10.2026: das
Bündel einer kleinen App mit `Button` und `Datenliste` war 1,3 kB statt
mehrerer hundert, Hooks liefen, kein CSP-Verstoß.

**Versionsregel.**

- Unter `/marken/<haupt>/` steht immer die neueste Fassung dieser Hauptzahl,
  die das Gerät hat. Innerhalb einer Hauptzahl fällt kein Name weg und keine
  Eigenschaft ändert ihre Bedeutung (die Regel aus `packages/marken/src/fassung.ts`),
  also darf die App jedes Update ungefragt bekommen.
- Ein Bruch hebt die Hauptzahl und damit die **Adresse**. Das Gerät liefert
  nur die aktuelle Hauptzahl aus; eine App, die eine andere nennt, meldet die
  Verwaltung als Warnung („vom Gerät, 4 statt 5“). Wer vor dem Bau wissen will,
  welche Hauptzahl ein Gerät hat, liest `/marken/marken.json` (ohne Anmeldung).
- Cache: die festen Namen tragen `Cache-Control: no-cache` mit ETag. Der
  Browser behält sie und bekommt ein 304, bis ein Update sie ändert, dann
  sofort die neue Datei. Die Teile `teil-<name>-<hash>.js` ändern sich nie
  unter ihrem Namen und tragen `immutable` für ein Jahr
  (`apps/dashboard-frontend/nginx.conf`).

**Was mit Apps mit Kopie geschieht: nichts.** Eine App mit `"marken": "5.2.1"`
und beigelegtem `marken.js` oder gespiegelter Quelle läuft unverändert, und die
Verwaltung meldet sie wie bisher, sobald sie älter ist als das Gerät. Ein
Wechsel auf die Laufzeit ist ein neues Paket mit `"marken": "5"`, den zwei
Zeilen oben und ohne die Kopie.

Im Kontrakt (`GET /api/v1/external/contract`) steht derselbe Weg als Abschnitt
`marken`: Adresse, Verzeichnis, Eingänge, Theme und die Regeln als Sätze.

**Gemessen am Orin, 03.10.2026** (`scripts/test/marken-laufzeit-abnahme.mjs`,
Bilder unter `docs/plans/audits/2026-10-03-marken-laufzeit-m5/`): eine
Probe-App ohne Bau und ohne Kopie, eingespielt auf 5.3.0, 43 von 43 grün
(Cache-Köpfe mit 304, Seitenleiste 272 und 51 px, Tabelle, Freigabe, hell und
dunkel auf den Flächen der Tokens, kein CSP-Verstoß). Danach ein Update des
Geräts auf 5.3.1 mit einer Reparatur an der Seitenleiste, **die Probe nicht neu
eingespielt**: sie zeigte 5.3.1, die Zahl am Eintrag stand in ihrer Zeile,
42 von 42 grün.

### Die App sagt, welche Routen ein Agent aufrufen darf (Brücke, 21.09.2026)

Eine App läuft am Gerät hinter der Forward-Auth, und ein Mensch kommt mit dem
Browser hinein. Ein **Agent** am Rechner eines Mitarbeiters kommt nicht hinein,
solange er nicht weiß, welche Wege es gibt und was sie tun — eine
Schnittstelle, die man erraten muss, ist keine.

`agent` ist diese Auskunft, und sie steht im Manifest, weil sie zur App gehört
und nicht zum Gerät: das Gerät schreibt sie nicht und ändert sie nicht, es
nimmt sie an.

```json
"agent": [
  {
    "method": "GET",
    "path": "antraege",
    "purpose": "Alle Anträge mit dem Stand ihrer Freigabe.",
    "params": [],
    "writes": false
  }
]
```

Die Form steht im Vertrag der Brücke und ist in drei Repositorien dieselbe: das
Ara-Kit liest sie (`arasul.mjs`), eine App schreibt sie, und dieses Gerät prüft
sie. Die Felder und ihre Grenzen stehen in
[APP-PAKET.md](APP-PAKET.md) unter **Fassung 6**; durchgesetzt werden sie in
`apps/dashboard-backend/src/schemas/apps.js`. **Ein kaputtes Feld weist das
Gerät beim Einspielen ab**, mit dem Weg zum Befund (`agent.1.params.0.type`)
und einem Satz dazu.

**Ausgeliefert wird das Feld von der App selbst**, unter `GET agent` an ihrer
Schnittstelle (`/apps/<id>/api/agent`), samt `id`, `name` und Version — durch
dieselbe Forward-Auth wie alles andere, also sieht es nur, wem die App
freigegeben ist. Das Gerät hält **keine zweite Kopie** bereit: eine App, die
ihre Wege ändert und ihr Manifest nachzieht, sähe sonst zwei verschiedene
Beschreibungen ihrer selbst, je nachdem, wen man fragt.

**Was dort nicht steht, ruft das CLI nicht auf.** Die Liste ist keine
Dokumentation, sondern die Erlaubnis — daher die Strenge. Und `writes: true`
verlangt am CLI ein ausdrückliches `--write`, an dem die Rückfrage an den
Menschen hängt.

Die Angabe ist **freiwillig**, aus demselben Grund wie `marken`: jede App davor
hat sie nicht. Eine App ohne `agent` ist eine App, die ein Mensch bedient.

Womit ein Agent sich ausweist, steht in
[docs/api/API_REFERENCE.md](../api/API_REFERENCE.md#ausweise-brücke-21092026).

## Das Netz der Apps (J38, 02.10.2026)

Das Backend einer App läuft im Docker-Netz **`arasul-apps`**
(`compose/compose.core.yaml`, `internal: true`, Standard `172.30.1.0/26`,
`NETZ_APPS`). Das Netz hat kein Gateway: **kein Weg ins Internet, keiner ins
Haus-LAN.** Drin hängen nur die Apps und drei Dienste der Plattform:

| Aus dem App-Container                      | Ergebnis   | Wodurch                                                             |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------- |
| eigene Datenbank (`ARASUL_DB_URL`)         | ja         | `postgres-db` hängt auch im Netz der Apps                           |
| Datenbank einer anderen App                | verweigert | `config/postgres/pg_hba.conf`: Rolle `arasul_app_*` nur `samerole`  |
| Plattform-Datenbank `arasul_db`            | verweigert | dieselbe Datei, `reject` für jede andere Datenbank                  |
| Plattform-API (`dashboard-backend:3001`)   | ja         | `ARASUL_API_URL`, das Backend hängt im Netz der Apps                |
| Traefik (`reverse-proxy:443`)              | ja         | Traefik hängt im Netz der Apps und erreicht darüber das App-Backend |
| Internet, Haus-LAN, Ollama, andere Dienste | nein       | kein Gateway, keine Mitgliedschaft                                  |

`pg_hba.conf` entscheidet nach dem **Namen der Rolle** und nicht nach der
Adresse: Postgres hängt in zwei Netzen, und eine Adressregel sperrte je nach
Namensauflösung ab und zu die Plattform selbst aus.

**`verbindungen`** im `app.json` ist die Liste der Hostnamen, die die App
darüber hinaus braucht (nur Namen, klein, ohne Schema, Port, Pfad, Platzhalter
oder IP; höchstens 20). Es ist die **Freigabe**: der Ausgangs-Proxy lässt für
diese App genau diese Namen durch (siehe „Der Ausgangs-Proxy“).

### Der Ausgangs-Proxy (J38, 02.10.2026)

Ein einziger Container, `egress-proxy` (`services/egress-proxy/`, Node ohne
Abhängigkeiten, `compose/compose.app.yaml`), hängt im Netz `arasul-apps` und im
Netz `arasul-frontend` (das hat ein Gateway) und ist der **einzige Weg
hinaus**. Die Apps erreichen ihn unter `egress-proxy:3128`.

- **Entschieden wird am Hostnamen**, ohne TLS aufzubrechen: bei `CONNECT
host:port` (https) und bei einer Anfrage mit absoluter URL (http). Der Proxy
  sieht nie den Inhalt. Ein Name, der nicht in `verbindungen` des Standes
  steht, bekommt `403`; die Anfrage geht nicht hinaus.
- **Wer ruft, steht im Zugang**: `HTTPS_PROXY=http://<containername>:<token>@egress-proxy:3128`
  in der Umgebung des App-Containers (`https_proxy` auch klein, ein kleines
  `http_proxy` bewusst nicht: der BusyBox-`wget` im Healthcheck liest es und
  ignoriert `NO_PROXY`, am Orin galten damit alle Apps als unhealthy; dazu `NO_PROXY`
  für Datenbank und Plattform-API und `NODE_USE_ENV_PROXY=1`). Der Token ist ein
  HMAC des Containernamens mit dem Geheimnis des Geräts (`jwt_secret`), beide
  Seiten rechnen ihn; eine App kann sich nicht als andere ausgeben und das
  Manifest nicht überschreiben. Der Stand (`live`/`test`) steckt im Namen.
- **Die Regeln** holt der Proxy alle zehn Sekunden vom Backend
  (`GET /api/ausgang/regeln`, aus den Manifesten der Stände). Ohne Regeln lässt
  er nichts durch (geschlossen, nicht offen). Eine Änderung greift mit dem
  nächsten Einspielen, ohne App-Neustart.
- **Ein freigegebener Name, der auf eine Adresse im Haus zeigt** (privat,
  Loopback, link-local), wird trotzdem abgewiesen: sonst wäre er der Weg einer
  App ins LAN.
- **Ein Programm, das `HTTPS_PROXY` ignoriert**, bekommt keine Verbindung: das
  Netz hat kein Gateway. Sicher, aber für den Bauenden eine Falle; das Kit soll
  sie vorher nennen.
- **Gezählt wird je App, Stand, Name und Ergebnis** (`erlaubt`/`abgewiesen`,
  Anzahl, zuletzt) in `ausgang_zaehler` (Migration 191), ohne Pfad und ohne
  Inhalt. Der Proxy schickt die Zahlen alle fünf Sekunden an
  `POST /api/ausgang/ereignisse` und hält sie bis dahin im Speicher; sie
  überleben einen Neustart von Proxy, Backend und Gerät. Je App und Stand
  höchstens 100 verschiedene abgewiesene Namen, der Rest zählt unter
  `(weitere)`.
- **Die Plattform selbst** (Flows mit externem Modell: das Backend ruft den
  Anbieter direkt) wird im selben Protokoll gezählt, unter „Das Gerät selbst“.
- **Zu sehen** ist alles unter Einstellungen > Verbindungen (nur Admin):
  je App eingetragen, genutzt (Anzahl, zuletzt), abgewiesen in Rot.
- **Ausfall:** steht der Proxy, kommt keine App ins Internet, aber jede erreicht
  weiter ihre Datenbank und die Plattform. Im Leerlauf: siehe die Messung im
  Journal (HISTORIE, J38).

Gemessen wird es mit `scripts/test/ausgang-abnahme.sh` am Gerät.

**Umzug bestehender Apps.** Beim Start des Backends zieht
`appContainer.zieheUm` jeden App-Container ins Soll-Netz: angehalten,
umbenannt, ein neuer mit **derselben** Umgebung (Schlüssel, Datenbankadresse),
denselben Grenzen und dem Etikett `traefik.docker.network` im neuen Netz
gestartet; kommt er nicht gesund hoch, wird er verworfen und der alte läuft
wieder, die App bleibt im alten Netz. Rollen und Datenbanken fasst der Umzug
nicht an, die Daten bleiben, wo sie waren.

**Rückweg in einem Schritt:** `APP_NETZ=arasul-platform_arasul-backend` in die
`.env` und `docker compose up -d dashboard-backend`: das Backend zieht jede
App beim Start dorthin zurück. (Die Regeln in `pg_hba.conf` bleiben, sie
schaden im alten Netz nicht.) Gemessen wird alles mit
`scripts/test/app-netz-abnahme.sh`, als `probe-admin`.

## Die Flows einer App (Phase C6)

Bis C5 war `flows` eine Liste von Namen und damit eine **Forderung**: „diese
Flows müssen am Gerät liegen". Das Paket brachte keine mit, und wer eine App
ausrollte, baute ihre Flows getrennt davon von Hand nach; ob beides
zusammenpasste, zeigte sich beim ersten Lauf.

Seit C6 ist `flows` ein Verzeichnis und damit eine **Lieferung**, genau wie
`frontend`:

```
app.json          "flows": { "verzeichnis": "flows" }
flows/bericht.md  ein Flow: YAML-Kopf, darunter der Auftrag als Markdown
flows/pruefen.md  noch einer
```

Beim Einspielen registriert das Gerät sie **je App und Stand** (`app_flows`).
Der Namensraum ist damit die App: zwei Apps dürfen beide einen `bericht` haben,
ohne voneinander zu wissen, und der `bericht` des Teststandes ist ein anderer
Gegenstand als der des Livestandes — der Teststand ist eine andere Version.

Was für einen Flow **aus einem Paket** zusätzlich gilt:

| Regel                                              | Warum                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Eine `.md` je Flow, der **Dateiname ist der Name** | Ein Flow mit zwei Namen ist einer, den man beim nächsten Mal nicht wiederfindet.                                   |
| Steht `name:` im Kopf, muss er derselbe sein       | Dieselbe Regel wie `id`/`version` gegen den Ordner des Manifests.                                                  |
| **Kein `ordner`**                                  | `ordner` sind absolute Pfade am Gerät; ein Paket könnte `/arasul/config` deklarieren und die Umgebungsdatei lesen. |
| Höchstens 50 Flows je Paket                        | Dieselbe Vorsicht wie bei der Größe des Archivs.                                                                   |

Weil `ordner` nicht geht, hat ein App-Flow heute **keine Datei-Werkzeuge**
(`schemas/flows.js` verlangt für die ohnehin einen Ordner). Den Speicher einer
App gibt es seit H7, und er ist ihre **Datenbank** — das ändert an dieser
Abweisung nichts: die Datenbank erreicht die App aus ihrem eigenen Container,
ein Flow läuft im Backend des Geräts, und die Datei-Werkzeuge wollen einen Pfad
dort. Einen Ordner daneben zu stellen hieße, einen zweiten Ort einzuführen, an
dem Daten einer App liegen, und damit jede Frage des Betriebs zweimal zu
beantworten.

### Wer entscheidet, mit welchem Modell ein Flow läuft

Zwei Menschen, und sie entscheiden über Verschiedenes:

| Wer             | Was                                        | Wo                                     |
| --------------- | ------------------------------------------ | -------------------------------------- |
| der **Partner** | was der Flow tut, und womit er gemeint war | `modell:` im Kopf der Flow-Datei       |
| der **Kunde**   | womit er auf **diesem** Gerät läuft        | `flow_settings` (Tabelle, keine Datei) |

Der Administrator setzt es mit
`PUT /api/apps/<id>/flows/<name>/modell` und nimmt es mit `{"modell": null}`
zurück. **Seine Entscheidung überlebt ein App-Update**, und genau deshalb steht
sie in der Datenbank: schriebe er sie in die Flow-Datei, wäre sie beim nächsten
Paket weg — die Datei gehört dem Partner. So bleibt beides ganz, und ein Deploy
muss keine Datei aussparen.

Sie gilt **ohne Stand**: „welches Modell treibt diesen Flow" meint den Flow,
nicht die Fassung, mit der jemand gerade testet.

Seit Phase D4 trifft er sie **im Browser**, in der App-Ansicht unter
Einstellungen → Apps, und er hat dort eine dritte Wahl: ein Modell bei einem
Anbieter **draußen** (`{"extern": {anbieter, modell, basis_url, schluessel}}`
am selben Weg). `basis_url` ist eine OpenAI-kompatible Adresse ohne
`/chat/completions` — dasselbe Feld passt auf OpenAI, auf Azure, auf ein
gemietetes vLLM und auf ein Gateway im eigenen Netz. Der Schlüssel wird
verschlüsselt abgelegt und nie wieder angezeigt (`flow_settings`,
AES-256-GCM); lokal und extern schließen einander aus, denn ein Flow läuft auf
einem Modell. Rechnet ein Flow draußen, tun es auch seine Delegationen und sein
Prüfschritt — ein Lauf, der halb draußen und halb hier rechnet, wäre das
Gegenteil einer Entscheidung.

**Kein eigener Einstellungsbereich für externe Modelle** (Entscheidung vom
26.08.2026). Ein solcher Bereich wäre eine Liste von Zugängen, von denen
niemand mehr sagen könnte, welcher Flow sie benutzt.

### Starten

Eine App startet ihren eigenen Flow über die externe Schnittstelle, mit dem
Schlüssel, den das Gerät ihr beim Einspielen mitgegeben hat (C4):

```
POST /api/v1/external/flows/bericht/run
X-API-Key: <ARASUL_API_SCHLUESSEL>
{ "args": { "woche": "34" } }
```

**Nur eigene Flows.** Das steht nicht als Prüfung in der Route, sondern in der
Auswahl der Quelle: der Schlüssel trägt `app_id` und `stand`, und damit sucht
das Gerät in `app_flows` mit beiden im `WHERE`. Eine App kann den Flow einer
anderen nicht einmal benennen. Eine Prüfung kann man an einer von drei Routen
vergessen; ein `WHERE` nicht.

Der Lauf landet mit allen Schritten in `flow_runs`/`flow_run_steps` und trägt
`app_id` und `stand` mit.

### Nachlesen, was ein Lauf getan hat (Phase D4)

`GET /api/apps/<id>/laeufe` nennt die Läufe **dieser App** (nicht die des
angemeldeten Menschen — ein App-Lauf trägt als Nutzer den, dem der Schlüssel
gehört), `GET /api/apps/<id>/laeufe/<nr>` einen davon samt Schritten. Vier
Arten von Schritt:

| `kind`     | was er ist                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| `werkzeug` | ein Werkzeug-Aufruf, mit `input` und `output`                                |
| `subagent` | eine Delegation an eine Rolle; ihre inneren Schritte tragen `parent_step_id` |
| `modell`   | der **Gedankengang**: was das Modell sagte, bevor es ein Werkzeug rief       |
| `hinweis`  | ein Vermerk des Runners                                                      |

Der Gedankengang ist seit D4 dabei. Bis dahin meldete die Werkzeug-Schleife nur
die letzte Runde; der Satz, mit dem das Modell seinen nächsten Handgriff
begründet, fiel lautlos weg, und im Protokoll stand eine Kette von Werkzeugen
ohne ein Wort dazu.

## Die zwei Stände

Je App höchstens zwei: `live` und `test`, jeder mit eigener Version, eigenem
Manifest und eigenem Container.

| Stand  | Pfad des Frontends | Pfad des Backends      | Container              |
| ------ | ------------------ | ---------------------- | ---------------------- |
| `live` | `/apps/<id>/`      | `/apps/<id>/api/`      | `arasul-app-<id>-live` |
| `test` | `/apps/<id>/test/` | `/apps/<id>/test/api/` | `arasul-app-<id>-test` |

**Warum getrennte Pfade und nicht ein Pfad je Nutzer:** Traefik entscheidet
über die Route, bevor irgendeine Prüfung gelaufen ist. Welchen Stand ein
bestimmter Mensch sehen darf, weiß erst die Anmeldung — das lässt sich nicht in
eine Routing-Regel schreiben. Zwei Pfade lösen dasselbe ohne diesen Widerspruch.

Ein Frontend merkt davon nichts, **wenn es seine Schnittstelle relativ
aufruft**: `fetch('api/hallo')` löst sich gegen das Verzeichnis der Seite auf
und trifft in beiden Ständen das richtige Backend. Dieselbe Datei, beide Stände.
Ein absoluter Pfad (`/apps/urlaub/api/hallo`) zeigt im Teststand auf den
Livestand — das ist die eine Regel, die eine App einhalten muss.

Zwei Namen sind damit vergeben, und beide aus demselben Grund:

- **`test` als App-Kennung.** `/apps/test/` wäre ein Pfad, der zweimal etwas
  anderes bedeutet; das Schema weist die Kennung ab.
- **`test` als erstes Stück einer Route der App.** `/apps/urlaub/test` ist der
  Teststand von `urlaub`, nicht die Seite `test` der App `urlaub`. Wer eine
  solche Route braucht, nennt sie anders — `/apps/urlaub/tests` oder
  `/apps/urlaub/pruefung` gehen beide.

Ebenso vergeben ist `api`: alles unter `/apps/<id>/api/` gehört dem Container
der App und wird nie als Datei ausgeliefert.

## Der Tester-Kreis

Wer eine App sieht, steht in `app_members` (Migration 168). Seit 169 trägt jede
Freigabe ein Wort dazu, wie weit sie reicht:

- `live` — der Normalfall: der Mensch sieht `/apps/<id>/`.
- `test` — ein Tester: er sieht zusätzlich `/apps/<id>/test/`.

Ein Tester ist kein anderer Nutzer, sondern ein Nutzer mit einer Tür mehr.
Gesetzt wird das über `POST /api/freigaben` mit `{ "stand": "test" }`; gelesen
über `GET /api/apps/meine`. Im Browser steht es an zwei Stellen, und beide
schreiben denselben Weg: in der Freigabe-Matrix (Einstellungen → Personen,
D3, seit M5 mit Schaltern) für das ganze Gerät, und in der App-Ansicht (Einstellungen → Apps, D4) für
diese eine App.

Auch ein Administrator, der eine App benutzen will, braucht sie freigegeben.
Eine Sonderregel „Admins sehen alles" wäre eine zweite Wahrheit neben der
Tabelle (Entscheidung aus C2).

## Wer liefert was aus

```
Browser → Traefik ─┬─ /apps/<id>/api/me   (Zahl 50) → dashboard-backend
                   ├─ /apps/<id>/test/api (Zahl 45) → Container des Teststandes
                   ├─ /apps/<id>/api      (Zahl 40) → Container der App
                   ├─ /apps               (Zahl 30) → dashboard-backend, statisch
                   └─ /                   (Zahl  1) → dashboard-frontend
```

Arasul liefert die statischen Dateien selbst aus und nicht der
Frontend-Container: nur das Backend kennt die Anmeldung und damit die Frage,
welche App wem freigegeben ist. Die Prüfung steht seit C4 darin, siehe „Die
Anmeldung".

Eine Anfrage an `/apps/<id>/api/…`, die trotzdem beim Backend ankommt, ist ein
`404` mit Grund und **nicht** die Startseite der App. Ein Frontend, das auf
seine Schnittstelle HTML zurückbekommt, meldet einen Fehler, der nach einem
Fehler der App aussieht.

## Was ein Stand „lieferbar" nennt

> Auftrag app-leiche, 28.08.2026.

Ein Stand besteht aus drei Dingen, und keines weiß vom anderen: der Zeile in
`app_staende`, dem Container und den Dateien unter `/arasul/apps/<id>/<version>/`.
Am Orin stand `urlaubsantrag` als `test` **und** `live`, beide Container
liefen und meldeten `healthy`, und den Ordner gab es nicht — `GET
/apps/urlaubsantrag/` endete in `INTERNAL_ERROR`, und keine Ansicht zeigte
etwas Rotes.

**Der Healthcheck des Containers prüft das Backend, sonst nichts.** Er ruft
`backend.gesundheit` am Port der App auf (`appContainer.containerBeschreibung`).
Das Frontend liegt nicht im Container, sondern am Host, und ausliefern tut es
Arasul; dass es fehlt, kann der Container nicht wissen. Deshalb rechnet das
Gerät die Gesundheit eines **Standes** selbst, aus beiden Quellen
(`appStore.standZustand`):

| Feld        | Woher                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `backend`   | Docker: läuft er, was sagt seine eigene Prüfung (`healthy`, `unhealthy`) |
| `dateien`   | die Platte: `app.json` da, `index.html` des Frontends da (`null` ohne)   |
| `lieferbar` | bekommt ein Mensch, der auf die Kachel klickt, diese App?                |
| `mangel`    | wenn nicht: warum, als ein Satz                                          |
| `marken`    | die Fassung des Designsystems aus dem Manifest, oder `null` (H6)         |

`GET /api/apps` und `GET /api/apps/:id` tragen alle vier je Stand. Die
Verwaltung (Einstellungen → Apps) zeigt einen Stand ohne `lieferbar` rot,
schon in der Liste; `GET /api/apps/meine` lässt einen Stand ohne Frontend
weg, damit kein Mitarbeiter eine Kachel bekommt, hinter der nichts ist; und
`GET /apps/<id>/` antwortet mit **`503 APP_DATEIEN_FEHLEN`** und dem Satz,
was zu tun ist, statt mit `INTERNAL_ERROR`. Ein Browser, der die Seite lädt,
bekommt dafür — wie für „nicht freigegeben" und „nur Tester" — seit dem
26.09.2026 eine Seite mit einem Satz und dem Weg zur Übersicht statt JSON
(`services/app/appSperrseite.js`); die Schnittstelle bleibt JSON.

**Eine App ohne ihre Datenbank ist krank** (J35, 26.09.2026). Steht für einen
Stand eine Zeile in `app_datenbanken` und kennt `pg_database` den Namen nicht,
ist der Stand nicht `lieferbar`, mit dem Mangel „Die Datenbank dieser App fehlt
am Geraet" — auch wenn der Container `healthy` meldet. Ob der Healthcheck
einer App ihre Datenbank prüft, liegt an ihrem Gerüst (das Kit); das Gerät
weiß es selbst und sagt es. Ein Stand, der nie eine Datenbank bekommen hat,
hat keinen Mangel.

**Aufgeräumt wird nicht von selbst.** Beim Start sieht das Backend einmal
nach und schreibt je Stand ohne Dateien eine Warnung ins Protokoll
(`appStore.pruefeStaende`) — mehr nicht. Docker legt eine fehlende Bind-Quelle
beim Start als leeren Ordner an (Falle aus dem Werksreset vom 28.08.2026); ein
Backend, das bei leerem `/arasul/apps` jeden Stand löschte, hätte nach einem
verrutschten Mount das Gerät leergeräumt. Entfernen tut ein Mensch, und die
Ansicht sagt ihm, welche.

## Die Anmeldung

> Phase C4.

**Eine App bekommt keine eigene Anmeldung.** Wer an Arasul angemeldet ist und
die App freigegeben hat, ist in der App angemeldet; wer nicht, kommt nicht
hinein. Ein Partner baut keine Anmeldemaske, verwaltet keine Passwörter und
speichert keine Sitzungen — das ist eines der drei Dinge, die die Lizenz kauft.

Geprüft wird an zwei Stellen, aber nach **einer** Regel
(`services/app/appZugang.js`):

| Weg                 | Wer prüft                                               |
| ------------------- | ------------------------------------------------------- |
| `/apps/<id>/…`      | Arasul selbst, beim Ausliefern der Seite                |
| `/apps/<id>/api/…`  | Traefik per Forward-Auth auf `GET /api/apps/:id/zugang` |
| `/apps/<id>/api/me` | Arasul selbst                                           |

Die Forward-Auth hängt als Etikett am Container der App
(`services/app/appContainer.js`), nicht in `middlewares.yml`: sie trägt Kennung
und Stand, und beides weiß nur, wer den Container anlegt.

### Was die App über den Aufrufer erfährt

| Kopfzeile       | Inhalt                      |
| --------------- | --------------------------- |
| `X-Arasul-User` | Der Benutzername, als UTF-8 |
| `X-Arasul-Role` | `admin` oder `mitarbeiter`  |

**Beide sind nicht fälschbar.** Traefik löscht sie aus der eingehenden Anfrage,
bevor es sie aus der Antwort der Anmeldung neu setzt
(`forwardauth.authResponseHeaders`). Ein Browser, der `X-Arasul-User: chef`
mitschickt, kommt damit nicht durch.

Der Name steht als UTF-8 in der Kopfzeile, nicht als Latin-1. In Node liest man
ihn mit `Buffer.from(kopf, 'latin1').toString('utf8')`. Wer das nicht möchte,
fragt `api/me`:

```js
const ich = await (await fetch('api/me')).json();
ich.data.benutzer; // "anna"
ich.data.rolle; // "mitarbeiter"
```

`api/me` ist der **dritte vergebene Name** unter `/apps/<id>/` — nach `test`
und `api` — und der einzige, der einer App etwas wegnimmt. Der Grund: eine App
darf ganz ohne Backend auskommen, und dann gäbe es niemanden, der die Frage
beantworten könnte. Vergeben ist genau dieser eine Weg;
`/apps/<id>/api/meine-antraege` gehört weiter der App.

### Was zurückkommt, wenn jemand nicht darf

| Zustand                                   | Seite         | Schnittstelle |
| ----------------------------------------- | ------------- | ------------- |
| keine Sitzung                             | `302` auf `/` | `401`         |
| Sitzung, App nicht freigegeben            | `403`         | `403`         |
| Freigabe nur `live`, Teststand aufgerufen | `403`         | `403`         |
| Freigabe, aber diesen Stand gibt es nicht | `404`         | `404`         |

Die Seite zieht zur Anmeldung um, die Schnittstelle nicht: ein `fetch` der App
bekäme auf einen Umzug die Anmeldeseite als HTML zurück und meldete einen
Fehler, der nach einem Fehler der App aussieht — genau der Fall aus „Wer
liefert was".

**Erst die Freigabe, dann die Existenz.** Eine App, die es am Gerät nicht gibt,
ist `403` und nicht `404`. Sonst wäre die Liste der Apps eines Unternehmens für
jeden angemeldeten Menschen abzählbar.

## Was das Gerät der App mitgibt

Beim Einspielen setzt das Gerät drei Umgebungsvariablen in den Container, über
das hinaus, was `backend.umgebung` im Manifest nennt:

| Variable                | Inhalt                                                |
| ----------------------- | ----------------------------------------------------- |
| `ARASUL_API_URL`        | `http://dashboard-backend:3001/api/v1/external`       |
| `ARASUL_API_SCHLUESSEL` | Der API-Schlüssel dieser App und dieses Standes       |
| `ARASUL_DB_URL`         | Die Datenbank dieser App und dieses Standes (seit H7) |

Wie sie **heißen**, steht im Kontrakt (`GET /api/v1/external/contract`), und
zwar in ihrer Rolle: `umgebung.basis`, `umgebung.schluessel`,
`umgebung.datenbank`. Bis Kontrakt 4 stand der Name im Schlüssel einer
Abbildung und die Erklärung im Wert — wer den Namen zu `basis` suchte, fand
nichts, und die Vorlage des Ara-Kits ließ zwei Felder `null` und startete
keinen Flow.

**`ARASUL_API_URL` endet auf `/api/v1/external`, und die Pfade unter
`endpunkte` fangen damit an.** Wer beides aneinanderhängt, ruft
`/api/v1/external/api/v1/external/flows/…` und bekommt einen 404. Der Kontrakt
sagt es seit H7 zweimal: als `umgebung.praefix` samt
`umgebung.basis_enthaelt_praefix` und als fertigen Weg `endpunkte[].relativ`.
An die Adresse gehört `relativ`, nicht `pfad`.

Damit kann eine App ein Sprachmodell fragen, Text aus einer Datei holen und
einen Flow anstoßen — dieselben Wege, die eine Automatisierung von außen geht,
nur ohne Umweg über Traefik: die App hängt im selben Docker-Netz.

```js
await fetch(`${process.env.ARASUL_API_URL}/models`, {
  headers: { 'x-api-key': process.env.ARASUL_API_SCHLUESSEL },
});
```

**Je Stand einer**, nicht je App einer: der Teststand ist eine andere Version,
die jemand gerade ausprobiert, und was dort in einem Protokoll landet, soll den
Livestand nichts kosten.

### Die Datenbank einer App (Phase H7)

Eine App mit `backend` bekommt je Stand eine eigene Datenbank im PostgreSQL der
Plattform, mit eigener Rolle: `arasul_app_<kennung>_<stand>`. Ihre Adresse steht
in `ARASUL_DB_URL` als `postgresql://…`, eine Zeile, die jeder Treiber versteht.

```js
import pg from 'pg';
const db = new pg.Pool({ connectionString: process.env.ARASUL_DB_URL });
```

**Das ist der Speicher einer App, und es ist nur einer.** Sie bekommt weiterhin
keinen Bind-Mount und kein Volume. Zwei Orte hießen zwei Antworten auf jede
Frage des Betriebs — was wird gesichert, was holt ein Weg zurück wieder herein,
was fällt beim Entfernen weg. Eine hochgeladene Datei gehört deshalb in eine
Spalte; sie wird damit mitgesichert, ohne dass jemand daran denken muss.

**Je App und Stand eine.** Ein Probelauf im Teststand darf die Daten des
Livestandes nicht anfassen. Der Livestand behält seine Daten über jeden
Versionswechsel: angelegt wird nur, was fehlt. Schalten nach live nimmt die
Daten des Teststandes **nicht** mit, und es sichert vorher die des Livestands
(siehe [Live schalten mit Sicherung](#live-schalten-mit-sicherung-m5-04102026)).

**Was nicht bleibt** (J35): das Dateisystem des Containers. Jedes Einspielen
und jedes Schalten **ersetzt** den Container, samt seiner anonymen Volumes —
auch derer, die ein `VOLUME` im Dockerfile anlegt. Eine SQLite-Datei oder ein
Upload-Ordner im Container ist nach dem Update weg. Der Kontrakt sagt das unter
`daten`, damit das Kit es nicht aus zwei Stellen erraten muss.

**Das Passwort wechselt nicht bei jedem Einspielen**, anders als der
API-Schlüssel. Ein Neustart durch Docker behält die Umgebung des Containers,
und ein neues Passwort wäre für ihn ein verlorener Zugang. Es liegt deshalb
verschlüsselt in `app_datenbanken` und kommt beim nächsten Einspielen wieder
heraus.

**Nach einem Neustart des Geräts startet eine App nach ihrer Datenbank**
(J35, 26.09.2026). Docker startet die App-Container (`unless-stopped`) selbst,
sobald der Dienst steht — Postgres dagegen legt erst `ordered-startup.sh` an,
und zwar später. Am Orin kam `belege-live` 40 Sekunden vor `postgres-db` hoch,
und die Faktum-App lief danach ohne Datenbank weiter. Deshalb startet das
Backend, nachdem es die App-Datenbanken geheilt hat (`heileAlle`), jeden
laufenden App-Container neu, der **vor** `pg_postmaster_start_time()`
gestartet ist (`appDatenbank.appsNachDerDatenbank`), und fragt danach jede
Minute noch einmal — startet Postgres allein neu, ist es derselbe Fall. Ein
Container, der nach der Datenbank startete, bleibt stehen: ein Deploy des
Backends fasst keine App an. Ein angehaltener bleibt angehalten.

**Wer sie anfasst und wer nicht.** Die Rolle darf sich anmelden und in ihre
eigene Datenbank schreiben, sonst nichts (`NOSUPERUSER NOCREATEDB NOCREATEROLE`,
`REVOKE ALL … FROM PUBLIC`); an `arasul_db` kommt seit H7 nur noch ihr
Eigentümer. Die nächtliche Sicherung nimmt jede App-Datenbank mit
(`services/backup-service/backup.sh`), der Weg zurück legt sie wieder an und
spielt sie ein — als Rolle der App, sonst gehörten die Tabellen danach
`arasul` —, `POST /api/backup/wiederherstellung/app/:id` holt die Daten
**einer** App zurück, auch nachdem sie entfernt wurde (J35),
`DELETE /api/apps/:id` wirft sie weg — immer, auch ohne
`?dateien=true`: die Pakete kann ein Partner neu einspielen, eine Datenbank
ohne App könnte niemand mehr finden.

**Bei jedem Einspielen ein neuer.** In der Datenbank steht nur der
bcrypt-Abdruck; den Klartext gibt es genau einmal, im Augenblick des Anlegens.
Ihn daneben verschlüsselt abzulegen, um ihn später noch einmal in einen
Container schreiben zu können, wäre ein zweiter Ort, an dem ein gültiger
Schlüssel liegt — und gebraucht würde er nie, weil das Einspielen den Container
ohnehin **ersetzt** statt ihn neu zu starten. Ein Neustart durch Docker
(Gerätestart, `unless-stopped`) behält die Umgebung und damit den Schlüssel.

Was der Schlüssel darf, steht in `VORGABE_ENDPUNKTE`
(`middleware/apiKeyAuth.js`): `llm:chat`, `llm:status`, `document:extract`,
`document:analyze`, `flow:run`. Dieselbe Liste bekommt ein Schlüssel, den ein
Administrator von Hand anlegt.

## Der Lebenslauf

1. Der Partner baut die App mit dem Ara-Kit und schickt das Paket an
   `POST /api/v1/external/apps` ([APP-PAKET.md](APP-PAKET.md)). Das Gerät packt
   aus, legt unter `/arasul/apps/<id>/<version>/` ab und **baut das Image**.
2. Es rollt in den **Teststand**. Einen Parameter dafür gibt es nicht.
3. Benannte Tester probieren unter `/apps/<id>/test/`.
4. Ein Mensch schaltet live: in der Oberfläche unter Einstellungen → Apps
   (seit Phase D4, `POST /api/apps/<id>/schalten`) oder aus dem Kit heraus
   (`POST /api/v1/external/apps/<id>/schalten`, C5), beide mit
   `{"ziel":"live"}`. Zurück auf die Version davor geht es mit
   `{"ziel":"zurueck"}` — das ist ein Tausch, wer ihn zweimal ruft, ist wieder
   da, wo er angefangen hat. Zwei Wege und ein Dienst dahinter: das Kit
   schaltet, wenn der Partner ausgeliefert hat, der Administrator, wenn **er**
   den Teststand gesehen hat. Nach live geht es **gesichert und mit
   Rückfall**, siehe den nächsten Abschnitt.
5. `DELETE /api/apps/<id>` (Sitzung) oder
   `DELETE /api/v1/external/apps/<id>?bestaetigung=<id>` (Schlüssel) entfernt
   beide Container **mitsamt ihren Volumes**, beide Stände, alle Freigaben und
   die Schlüssel der App. Die Dateien bleiben liegen — wer eine App aus dem
   Kit heraus entfernt, will sie üblicherweise gleich wieder einspielen; mit
   `?dateien=true` gehen sie mit. Ein Mensch nimmt den Weg in der Oberfläche
   (Einstellungen → Apps → **App entfernen**, seit dem Auftrag app-leiche vom
   28.08.2026): die Rückfrage ist dieselbe wie die des Kits — die Kennung
   abtippen —, und die Dateien gehen mit, denn ein Kunde, der eine App
   loswerden will, will sie ganz los sein. Aufgeräumt wird sonst beim
   Werksreset.

Schritt 1 und 2 gehen auch anders herum, wenn jemand ohnehin am Gerät sitzt:
Dateien nach `/arasul/apps/<id>/<version>/` legen und
`POST /api/apps/<id>/einspielen` rufen. Das ist derselbe Dienst, nur mit einer
Sitzung statt eines Schlüssels — zwei Wege in das Gerät, eine Logik dahinter.

## Live schalten mit Sicherung (M5, 04.10.2026)

> Auftrag live-schalten-mit-sicherung. Der Ablauf steht in
> `apps/dashboard-backend/src/services/app/liveSchalten.js`, gemessen am Gerät
> mit `scripts/test/live-schalten-abnahme.sh`.

Eine neue Fassung bringt oft eine **Strukturänderung** ihrer Datenbank mit
(eine Spalte, eine Tabelle). Sie läuft beim Start der Fassung, und zwar auf den
echten Daten des Livestands. Scheitert sie mittendrin, bleibt eine halb
geänderte Datenbank zurück, mit der auch die alte Fassung nicht mehr sicher
läuft. Deshalb schaltet das Gerät nicht einfach um:

1. **Anhalten.** Der alte Livestand hält an. Was er zwischen Sicherung und
   Umschalten noch schriebe, wäre nach einem Rückfall verloren.
2. **Sichern.** Ein Stand der Sicherung entsteht (restic, mit den Tags `vorher`
   und `fuer:live:<id>`, siehe [BACKUP_SYSTEM.md](../ops/BACKUP_SYSTEM.md)).
   Er bleibt außerhalb der Aufbewahrung 7/12/60 und steht in der Liste als
   „vor dem Live-Schalten der App …". **Misslingt er, wird nicht geschaltet**,
   und der alte Livestand läuft weiter (`409 LIVE_NICHT_GESICHERT`).
3. **Schalten.** Die Fassung aus dem Teststand wird wie bisher eingespielt.
4. **Zusehen.** Die neue Fassung muss gesund werden: beendet sich der
   Container, startet er neu, meldet er `unhealthy` oder ist er nach 180
   Sekunden nicht gesund, gilt sie als gescheitert. Ohne Healthcheck im
   Manifest gilt sie nach 20 Sekunden ohne Neustart als hochgekommen.
5. **Zurück.** Gescheitert: der neue Container geht, die Live-Datenbank wird
   verworfen und aus dem Stand von Schritt 2 neu eingespielt (mit allem, was
   die halbe Strukturänderung angelegt hatte), und die Fassung von vorher läuft
   wieder, mit ihrer vorigen Version und ihrem Änderungstext. Antwort:
   `409 LIVE_ZURUECKGESCHALTET`.

**Was eine App dafür tun muss:** ihre Strukturänderung beim Start ausführen und,
wenn sie scheitert, sich **beenden** (Exit-Code ungleich 0) oder sich ungesund
melden. Eine App, die den Fehler schluckt und weiterläuft, sieht für das Gerät
gesund aus. Das steht als Regel im Kontrakt unter `daten.regeln`.

**Der Teststand wird dabei nie angefasst**, weder sein Container noch seine
Datenbank, und er bekommt nie eine Kopie der Live-Daten: kopiert wird in keine
Richtung.

**Ein erstes Live-Schalten**, also ohne vorigen Livestand, sichert nichts (es
gibt noch keine Live-Daten). Scheitert es, fällt der eben angelegte Livestand
wieder weg: Zeile, Flows, Schlüssel und die leere Datenbank.

**Der Admin liest es in einem Satz.** Jeder Versuch steht in `app_schaltungen`
(Migration 199). Ging er nicht glatt, zeigt die Karte des Livestands in der
Verwaltung den Satz („Die neue Fassung 1.1.0 ließ sich nicht starten, deshalb
läuft Belege wieder mit Fassung 1.0.0 und den Daten von vorher."), darunter den
zweiten, was er tun kann, und zugeklappt die **Technischen Angaben**: Grund,
Exit-Code, Stand der Sicherung, ob Daten und Fassung zurück sind und die
letzten Zeilen der gescheiterten Fassung.

**Der Änderungstext steht beim Schalten da.** Was der Entwickler beim Ausrollen
schrieb (Kontrakt 8, `aenderungstext`), steht am Teststand und im Dialog „live
schalten", bevor der Admin bestätigt; er wandert mit der Fassung in den
Livestand (`app_staende.aenderungstext`).

**Dauer.** Sichern, schalten und abwarten dauert am Orin um zwei Minuten, mit
Rückfall länger. Der Knopf sagt „Sichert und schaltet…", solange es läuft;
dieselbe App lässt sich in der Zeit nicht ein zweites Mal schalten (`409`).
`{"ziel":"zurueck"}` sichert nicht: es geht auf eine Fassung, die schon auf
diesen Daten lief.

## Grenzen

`maxApps` aus `FEATURE_TIERS` (`services/app/licenseService.js`) greift beim
Einspielen einer **neuen** App — auf beiden Wegen, dem des Kits
(`POST /api/v1/external/apps`) und dem der Sitzung
(`POST /api/apps/:id/einspielen`), denn dahinter steht derselbe Dienst.
Eine neue Version einer App, die schon am Gerät ist, fällt nicht darunter: ein
abgelaufener Schlüssel darf kein Update blockieren, das vielleicht genau den
Fehler behebt, wegen dem jemand anruft.

**Test- und Livestand zählen zusammen: jede eingespielte App belegt einen
Platz** (Entscheidung Kolja vom 30.08.2026, J30). Gezählt werden die Zeilen in
`apps` und nicht die Stände — eine App mit beiden Ständen ist eine App und kein
Paar. Phase H7 hatte den Riegel auf das Schalten nach live verschoben, mit dem
Argument, die Lizenz kaufe den Betrieb; am 30.08.2026 lagen daraufhin drei Apps
am Orin, die Lizenz trägt drei, und `--deploy` einer vierten ging ohne
Widerspruch durch. Eine Grenze, die beim Einspielen nicht greift, ist kein
Verkaufsargument, sondern ein Fund, den ein Partner als Erster meldet.

Bei vollem Kontingent antwortet das Gerät mit **409** und nennt die Zahl, die
die Lizenz trägt, die Apps, die die Plätze belegen, und den Weg heraus:

```
Die Lizenz dieses Geraets traegt 3 Apps, es sind 3: angebot, beispielapp,
urlaubsantrag. probeapp kommt nicht dazu. Test- und Livestand zaehlen zusammen,
jede eingespielte App belegt einen Platz. Eine App entfernen (Einstellungen →
Apps → App entfernen, oder DELETE /api/v1/external/apps/<id>) oder die Lizenz
erweitern.
```

Dieselben Zahlen stehen als `details` daneben (`grenze`, `belegt`, `apps`,
`abgewiesen`); das Kit gibt Meldung und Details wortgleich aus. Gefragt wird
**bevor gebaut wird** (`appPaket.nimmAn`): ein Bau dauert am Orin Minuten, und
ein Partner soll nicht erst warten, um dann zu erfahren, dass diese App gar
nicht auf das Gerät darf. Der Riegel selbst sitzt in `appStore.spieleEin` und
gilt damit für jeden Weg hinein.

Was die Lizenz dieses Geräts trägt, sagt es selbst:
`GET /api/license/info` → `features.maxApps` (`-1` heißt unbegrenzt). Der Wert
kommt aus der Lizenzdatei; ohne eine steht das Gerät auf `community`, und das
sind drei. Gemessen wird das gegen das laufende Gerät mit
`scripts/test/lizenz-abnahme.sh`.

**Die Zahl kann aus der Lizenz selbst kommen** (J32, 23.09.2026): trägt die
signierte Nutzlast `maxApps`, ersetzt sie die Zahl der Stufe — sonst kennten
die bezahlten Stufen nur `-1`, und ob eine Lizenz die Grenze wirklich hebt,
ließe sich nie von oben messen. Signiert wird mit
`scripts/util/lizenz-signieren.js` (privater Schlüssel aus dem Schlüsselbund,
ohne Stripe und ohne Kauf); `scripts/test/testlizenz-abnahme.sh` spielt am
Gerät eine Testlizenz mit `belegt + 1` ein, lässt `lizenz-abnahme.sh` die
Grenze von unten und oben messen und nimmt sie danach mit
`DELETE /api/license` wieder weg — gemessen bis zurück auf `community`. Die
Lizenzdatei liegt seither in `data/lizenz/` und überlebt einen Deploy.

## Die Beispielapp

`tests/beispielapp/` ist die kleinste App, die beide Wege ausübt. Sie gehört
**nicht zum Auslieferungsumfang**: keine Compose-Datei erwähnt sie, kein Setup
installiert sie, `.dockerignore` schließt `**/tests/` aus jedem Image aus.

```bash
# auf dem Gerät
bash scripts/test/beispielapp.sh einspielen
bash scripts/test/beispielapp.sh entfernen

# vom Arbeitsrechner, durch den Tunnel
bash scripts/test/apps-abnahme.sh           # misst beide Pfade (C3)
bash scripts/test/app-anmeldung-abnahme.sh  # misst die Anmeldung (C4)
bash scripts/test/deploy-abnahme.sh         # misst den Deploy-Endpunkt (C5)
bash scripts/test/lizenz-abnahme.sh        # misst die Lizenzgrenze (J30)
bash scripts/test/testlizenz-abnahme.sh     # Testlizenz rein, Grenze messen, wieder community (J32)
bash scripts/test/ausweis-abnahme.sh        # misst die Brücke: `agent` und den Ausweis (J34)
```

`ausweis-abnahme.sh` misst beide Hälften der Brücke: den Kontrakt samt Feld
`agent` und ein Wegwerf-Paket mit einem **kaputten** `agent` (das kostet keinen
Bau — das Manifest wird geprüft, bevor Docker anfängt), dazu den Ausweis mit
**zwei** Menschen, von denen nur einer die App freigegeben hat. Sie läuft
**neben** `abnahmen.sh`: sie braucht drei gelungene Anmeldungen, und die kosten
seit H7 nichts an der Drossel (`skipSuccessfulRequests`), rechnen aber in der
Reihe dort nicht mit.

`deploy-abnahme.sh` spielt den Inhalt der Beispielapp unter einer **eigenen
Kennung** (`beispielapp-deploy`) ein und räumt am Ende alles weg, was es
angelegt hat. Unter derselben Kennung wäre das das Ende der App, die die
C3/C4-Abnahmen brauchen.
