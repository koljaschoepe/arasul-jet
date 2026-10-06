/**
 * Der Kontrakt zwischen Geraet und Ara-Kit (Phase C5 des Umbaus vom
 * 26.08.2026, Zeile 29 vom 27.08.2026).
 *
 * Das Ara-Kit ist ein eigenes Repository und lebt sein eigenes Leben: es baut
 * Apps, prueft deren Vorlage und rollt sie auf ein Geraet, das ein anderer
 * Mensch zu einem anderen Zeitpunkt aktualisiert hat. Zwischen beiden liegt
 * genau eine Schnittstelle, und bis hierher lag sie in zwei Repositories
 * gleichzeitig -- als Schema hier und als Nachbau dort. Zwei Nachbauten
 * desselben Vertrags laufen auseinander; die Frage ist nur, wann jemand es
 * merkt.
 *
 * DIESER ENDPUNKT IST DIE EINE QUELLE. Das Kit prueft seine Vorlage gegen das,
 * was das Geraet hier ausgibt, und merkt an der Kontraktversion, dass es zu
 * einem Geraet nicht passt -- bevor es ein Paket schickt, das dort abgewiesen
 * wird.
 *
 * WAS JSON-SCHEMA NICHT KANN, STEHT ALS SATZ DANEBEN. `z.toJSONSchema` uebergeht
 * jede `.refine`-Regel still, und im Manifest sind das gerade die
 * interessanten: „mindestens eines von Frontend und Backend", „mit Backend
 * braucht es einen Port", „die Kennung `test` ist vergeben". Ein Kit, das nur
 * das Schema prueft, haelte ein Manifest fuer gueltig, das das Geraet
 * abweist. Deshalb `regeln`.
 */

const { z } = require('zod');
const { versionFuerAnzeige } = require('../../utils/version');
const { AppManifest } = require('../../schemas/apps');
const { FlowDefinition } = require('../../schemas/flows');
const {
  ExternalFlowRunBody,
  FreigabeRegel,
  ExtractStructuredFelder,
  ExtractStructuredAntwort,
  ExtractStructuredFehlschlag,
  ExtractStructuredLaeuft,
  ExtractStructuredAbgeholt,
  BILD_MAX_ANZAHL,
  BILD_MAX_ZEICHEN,
} = require('../../schemas/externalApi');
const { VORGABE_ENDPUNKTE, ALLE_ENDPUNKTE } = require('../../config/apiBereiche');
const { KOPF_BENUTZER, KOPF_ROLLE } = require('./appZugang');
const appPaket = require('./appPaket');
const appFlows = require('./appFlows');
const originalDienst = require('../flows/original');

/**
 * Die Kontraktversion.
 *
 * Sie zaehlt hoch, wenn sich etwas aendert, worauf ein Kit sich verlassen hat:
 * ein Pflichtfeld im Manifest, ein Kopfzeilenname, ein Endpunkt, eine der
 * Regeln. Sie zaehlt NICHT hoch, wenn eine Beschreibung praeziser wird.
 *
 * Von Hand, nicht aus der Systemversion abgeleitet: das Geraet bekommt
 * Aktualisierungen, die den Vertrag nicht anfassen, und ein Kit, das nach jeder
 * davon behauptet, es passe nicht mehr, waere schlimmer als keine Pruefung --
 * beim dritten falschen Alarm liest niemand mehr hin.
 *
 * `__tests__/unit/appKontrakt.test.js` haelt einen Fingerabdruck des
 * Kontraktes fest und faellt um, wenn sich etwas aendert, ohne dass diese Zahl
 * mitgeht. Das ist die einzige Stelle, an der diese Zahl ueberhaupt eine
 * Bedeutung bekommt.
 */
const KONTRAKT_VERSION = 14;

/*
 * Fassung 2 (Phase C6, 27.08.2026): `flows` im Manifest ist keine Liste von
 * Namen mehr, sondern ein Verzeichnis -- aus einer Forderung ist eine
 * Lieferung geworden. Ein Kit, das noch `"flows": ["a","b"]` schreibt, wird
 * vom Geraet abgewiesen (`.strict()` plus Typpruefung), und genau dafuer ist
 * diese Zahl da: es merkt es, bevor es ein Paket schickt.
 *
 * Fassung 3 (Phase C7, 27.08.2026): das Werkzeug `freigabe_anfordern` kommt
 * dazu. Ein Kit, das gegen Fassung 2 prueft, weist einen Flow damit als
 * ungueltig ab, obwohl das Geraet ihn nimmt -- und der Partner suchte den
 * Fehler in seiner Datei. Dazu ein Endpunkt: eine App darf nachlesen, woran
 * ihr Lauf haengt (`GET /freigaben`).
 *
 * Fassung 4 (Phase H6, 29.08.2026): das Manifest kennt `marken`, die Fassung
 * des Designsystems, auf der die App steht. Sie ist FREIWILLIG, also bleibt
 * jedes Manifest von Fassung 3 gueltig -- die Zahl geht trotzdem mit, und aus
 * demselben Grund wie bei 3: das Manifest ist `.strict()`, ein Kit, das gegen
 * Fassung 3 prueft, wiese `marken` als unbekanntes Feld ab, obwohl das Geraet
 * es nimmt und liest. Der Vertrag sagt hier, dass es angekommen ist.
 *
 * Fassung 5 (Phase H7, 29.08.2026): drei Aenderungen, alle an derselben
 * Stelle -- an dem, was das Geraet einer App MITGIBT.
 *
 *   1. `umgebung` nennt die Namen in IHRER ROLLE. Bis Fassung 4 stand der Name
 *      im Schluessel einer Abbildung und die Erklaerung im Wert
 *      (`{"ARASUL_API_URL": "Die externe Schnittstelle …"}`). Das Kit liest
 *      `umgebung.basis` und `umgebung.schluessel` und fand dort nichts; sein
 *      `--check` meldete am 29.08.2026 am Orin „umgebung.basis fehlt im
 *      Kontrakt oder ist kein Name", und die Vorlage liess zwei Felder `null`
 *      und startete keinen Flow. Kontrakt und Wirklichkeit stimmten ueberein --
 *      `docker inspect` zeigt genau diese zwei Namen --, es war allein die
 *      Form, ueber die sich Kit und Produkt nicht einig waren. Die Erklaerungen
 *      stehen jetzt daneben, unter `was`.
 *
 *   2. Jeder Endpunkt traegt seinen Weg AUCH relativ zur Basis (`relativ`).
 *      `ARASUL_API_URL` endet auf `/api/v1/external`, und die Pfade unter
 *      `endpunkte` fangen damit an. Beide Angaben stimmen; wer sie
 *      aneinanderhaengt, bekommt
 *      `/api/v1/external/api/v1/external/flows/…` und einen 404. Der Kontrakt
 *      sagte nicht, dass es dasselbe Stueck ist. Jetzt sagt er es zweimal: als
 *      `umgebung.praefix` samt `basis_enthaelt_praefix` und als fertiger
 *      relativer Weg an jedem Endpunkt.
 *
 *   3. `umgebung.datenbank` kommt dazu: die Adresse der Datenbank dieser App
 *      und dieses Standes. Ein Kit, das gegen Fassung 4 prueft, kennt sie
 *      nicht -- die App laeuft trotzdem, sie hat nur keinen Speicher.
 *
 * Fassung 5 BLEIBT am 30.08.2026, obwohl `paket.regeln` einen Satz dazubekommen
 * hat (die Lizenzgrenze beim Einspielen, J30). Die Zahl geht mit, wenn ein Kit
 * ohne sie etwas falsch macht; hier macht sie nur etwas sichtbar, was das
 * Geraet ohnehin tut -- ein Kit, das den Satz nicht liest, bekommt dieselbe
 * Abweisung mit derselben Begruendung, es hat sie nur nicht vorher gewusst.
 * Und sie zu erhoehen waere hier der SCHADEN: das Kit haelt an, sobald ein
 * Geraet eine hoehere Nummer traegt als es kennt (`.ara/knowledge/deploy.md`).
 * Aus einem zusaetzlichen Hinweis wuerde damit ein Geraet, auf das gar nichts
 * mehr einspielen kann, bis jemand das Kit nachzieht.
 *
 * Fassung 6 (Bruecke, 21.09.2026): das Manifest kennt `agent` -- die Liste der
 * Routen, die eine App einem Agenten nennt. Sie ist FREIWILLIG wie `marken`,
 * also bleibt jedes Manifest von Fassung 5 gueltig; die Zahl geht trotzdem
 * mit, und zwar aus dem Grund, aus dem es diese Karte ueberhaupt gibt: das
 * Manifest ist `.strict()`, und ein Geraet auf Fassung 5 weist ein Paket mit
 * `agent` beim Einspielen ab. Genau das ist am 21.09.2026 passiert -- die
 * Werkstatt schrieb das Feld in `apps/belege/app.json` (ihr PR 11), und
 * `app.mjs --check` bekam vom Orin „`agent` kennt das Geraet nicht.
 * Unbekannte Felder werden abgewiesen." Ein Kit, das gegen Fassung 5 prueft,
 * wuerde das Feld aus demselben Grund abweisen wie das alte Geraet. Der
 * Vertrag sagt hier, dass es angekommen ist.
 *
 * Fassung 6 BLEIBT am 25.09.2026 (J35), obwohl zwei Abschnitte dazukommen:
 * `freigaben` (ein Lauf nennt seinen Einreicher und kann den Kreis der
 * Entscheider enger ziehen) und `daten` (was eine App dauerhaft behaelt und
 * was nicht). Beides ist FREIWILLIG und additiv: ein Kit, das die Abschnitte
 * nicht liest, startet Laeufe wie bisher und bekommt Freigaben wie bisher.
 * Die Zahl zu erhoehen waere derselbe Schaden wie am 30.08. -- das Kit haelt
 * bei einer Fassung an, die es nicht kennt, und am Orin baute an diesem Tag
 * ein anderer Agent mit genau diesem Kit.
 *
 * FOLGE FUER DAS KIT, und sie ist nicht klein: `KIT_CONTRACT_VERSIONS` in
 * `.ara/tools/lib/contract.mjs` endet bei 5, und das Kit haelt mit Rueckgabe 1
 * an, sobald ein Geraet hoeher steht -- nicht nur beim Manifest mit `agent`,
 * sondern bei jeder App. Das ist die eingebaute Ordnung („erst das Kit, dann
 * dieses Geraet") und kein Versehen; sie kostet aber einen Zug im Kit, bevor
 * wieder etwas auf ein Geraet mit dieser Fassung kommt.
 */

/*
 * Fassung 7 (J38, 02.10.2026): Apps laufen in einem eigenen Netz ohne Internet,
 * und das Manifest kennt `verbindungen` -- die Hostnamen, zu denen eine App von
 * sich aus verbinden will. Das Feld ist FREIWILLIG, jedes Manifest von
 * Fassung 6 bleibt gueltig. Die Zahl geht trotzdem mit, aus zwei Gruenden:
 *
 *   1. Das Manifest ist `.strict()`: ein Geraet auf Fassung 6 weist ein Paket
 *      mit `verbindungen` ab, und ein Kit, das gegen 6 prueft, taete es auch.
 *   2. Anders als bei 5 und 6 aendert sich hier, was eine App ERLEBT: sie
 *      erreicht ihre Datenbank, die Plattform-API und sonst nichts. Eine App,
 *      die beim Start eine Adresse im Internet ruft (eine Schriftart-API, ein
 *      Webdienst), lief bis gestern und laeuft ab dem Update dort nicht mehr.
 *      Ein Kit, das das nicht weiss, baut ihr Paket weiter, und der Fehler
 *      zeigt sich erst am Kundengeraet. Der Abschnitt `netz` sagt es vorher.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * endet bei 5 (siehe Fassung 6) und muss auf 7 gehoben werden, bevor ein Kit
 * auf ein Geraet mit dieser Fassung einspielt. Der PR nennt es ausdruecklich.
 */

/*
 * Fassung 8 (M5, 02.10.2026): fuenf neue Felder, die ein Entwickler im Kit
 * nennt und die das Geraet bisher als unbekannt abwies (Manifest und
 * Flow-Kopf sind `.strict()`). Quelle ist der Abschnitt „Flows und Freigaben"
 * in `company/frontend.md` des Ueberordners; der genaue Schnitt steht in
 * `docs/features/APP-PAKET.md`.
 *
 *   `symbol`          im Manifest: Lucide-Name oder Kuerzel
 *   `arten`           je Flow: `autonom`, `ergebnis_bestaetigen`
 *   `ausloeser`       je Flow: `hand`, `zeitplan`, `ereignis`
 *   `stufen`          je Flow: benannte Freigabestufen
 *   `faehigkeiten`    je Schritt: `text`, `bild`, `werkzeuge`, `mindestkontext`
 *   `aenderungstext`  beim Ausrollen, als Feld neben dem Paket
 *
 * ALLE FREIWILLIG, jedes Paket von Fassung 7 bleibt gueltig und rollt
 * unveraendert aus. Die Zahl geht trotzdem mit, aus dem Grund von 3, 4 und 7:
 * ein Kit, das gegen 7 prueft, wiese die Felder als unbekannt ab, obwohl das
 * Geraet sie nimmt. Die Stufen wirken seit M5 (Frist, Standardperson), die
 * Arten seit dem 04.10.2026 (der Admin schaltet je Flow, `docs/features/FLOWS.md`,
 * Abschnitt Arten), der Zeitplaner seit demselben Tag (Abschnitt Zeitplaner).
 * Die Zahl blieb bei 9: es kam kein Feld dazu, nur eine Wirkung, und ein
 * Paket, das `arten` nennt, war schon gueltig.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss auf 8 gehoben werden, bevor ein Kit auf ein Geraet mit dieser Fassung
 * einspielt.
 */

/*
 * Fassung 9 (M5, 03.10.2026): das Geraet liefert seine Bibliothek ZUR
 * LAUFZEIT aus, unter `/marken/<haupt>/`, und `marken` im Manifest kennt
 * dafuer eine zweite Form: nur die Hauptzahl (`"5"`). Eine App in dieser Form
 * traegt keine Kopie, sie laedt Bausteine, Muster, Tokens und das fertige
 * Stylesheet vom Geraet und sieht nach einem Update ohne Neubau aus wie das
 * Geraet. Drei Zahlen (`"5.2.1"`) bleiben die Form fuer eine Kopie, und die
 * Verwaltung meldet sie weiter, sobald sie veraltet.
 *
 * Dazu der Abschnitt `marken`: Adresse, Eingaenge, Import-Weg mit und ohne
 * Bau und die Versionsregel.
 *
 * FREIWILLIG, jedes Paket von Fassung 8 bleibt gueltig und laeuft
 * unveraendert. Die Zahl geht trotzdem mit, aus dem Grund von 3, 4, 7 und 8:
 * ein Kit, das gegen 8 prueft, wiese `"marken": "5"` als ungueltige Fassung
 * ab, obwohl das Geraet sie nimmt.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 9 kennen, bevor ein Kit auf ein Geraet mit dieser Fassung einspielt.
 */

/*
 * Fassung 10 (M5, 04.10.2026): Korrekturfelder in der Freigabe. Zwei neue
 * Felder im Flow-Kopf: `rollen[].ergebnis.aenderbar` (welche Felder ihres
 * Ergebnisses ein Mensch in einer Freigabe aendern darf) und `original` am
 * erkennenden Schritt (Bild oder PDF, relativ zur Adresse der App). Dazu nimmt
 * `POST /api/freigabe-anfragen/:id/bestaetigen` die geaenderten Felder, und
 * `GET /freigaben` nennt `felder`, `korrekturen` und `original`.
 *
 * FREIWILLIG, jedes Paket von Fassung 9 bleibt gueltig: ohne `aenderbar` ist
 * kein Feld aenderbar, die Freigabe zeigt sie nur. Die Zahl geht trotzdem mit,
 * aus dem Grund von 3, 4, 7, 8 und 9: Kopf und Rolle sind `.strict()`, und ein
 * Kit, das gegen 9 prueft, wiese `aenderbar` und `original` als unbekannt ab.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 10 kennen, bevor ein Kit auf ein Geraet mit dieser Fassung einspielt.
 */

/*
 * Fassung 12 (M5, 04.10.2026): `zeigt_freigaben` im Manifest, ein Wahrheitswert.
 * Eine App, die ihre Freigaben SELBST zeigt (sie liest `?freigabe=<nummer>`
 * und entscheidet dort mit dem Baustein `Freigabe`), erklaert es damit, und
 * ein Klick in „Fuer Sie" oeffnet sie beim Vorgang. Ohne das Feld gilt: sie
 * zeigt nicht selbst, und das Geraet oeffnet die Freigabe in Arasul, mit
 * demselben Baustein, denselben Regeln und denselben Rechten.
 *
 * FREIWILLIG, jedes Paket von Fassung 11 bleibt gueltig. Die Zahl geht mit,
 * aus dem Grund von 3, 4, 7 bis 11: das Manifest ist `.strict()`, und ein Kit,
 * das gegen 11 prueft, wiese `zeigt_freigaben` als unbekannt ab.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 12 kennen, bevor ein Kit auf ein Geraet mit dieser Fassung einspielt;
 * eine App mit eigener Freigabe-Ansicht traegt `zeigt_freigaben: true` ein,
 * sonst entscheidet das Geraet an ihrer Stelle.
 */

/*
 * Fassung 11 (M5, 04.10.2026): der Abschluss ueber die App. Ein neues Feld im
 * Flow-Kopf, `abschluss: { route }`: nach der letzten Stufe ruft das Geraet
 * diese Route des Backends der eigenen App mit dem Ergebnis auf (inklusive der
 * korrigierten Felder). Erst eine Empfangsbestaetigung (2xx) macht den Lauf
 * `fertig`; sonst steht er auf `nicht_uebergeben`, bis ein Admin „erneut"
 * ausloest. Dazu eine Umgebungsvariable, `ARASUL_ABSCHLUSS_TOKEN`: das
 * Geheimnis, an dem die App den Aufruf des Geraets erkennt.
 *
 * FREIWILLIG, jedes Paket von Fassung 10 bleibt gueltig und laeuft wie bisher;
 * ein Flow ohne `abschluss` wird `fertig` wie vorher. Die Zahl geht trotzdem
 * mit, aus dem Grund von 3, 4, 7, 8, 9 und 10: der Kopf ist `.strict()`, und
 * ein Kit, das gegen 10 prueft, wiese `abschluss` als unbekannt ab.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 11 kennen, bevor ein Kit auf ein Geraet mit dieser Fassung einspielt.
 * Eine App, die eine Abschluss-Route anbietet, liest `ARASUL_ABSCHLUSS_TOKEN`
 * und prueft `Authorization: Bearer`; eine schon laufende App bekommt die
 * Variable erst mit dem naechsten Einspielen.
 *
 * Dazu, OHNE neue Zahl (M5, 04.10.2026, Auftrag live-schalten-mit-sicherung):
 * Live schalten sichert vorher und faellt bei einer gescheiterten
 * Strukturaenderung selbst zurueck (409 `LIVE_ZURUECKGESCHALTET`). Kein Feld
 * kam dazu, jedes Paket rollt wie bisher; neu ist eine Regel unter `daten`
 * und eine Antwort mehr des Schalters. Ein Kit, das gegen 11 prueft, nimmt
 * beides an.
 */

/*
 * Fassung 13 (M5, 04.10.2026, Auftrag ereignis-und-app-routen): Ereignisse der
 * App und Routen von Apps als Werkzeug.
 *
 *   1. `ausloeser: ereignis` wirkt. Eine App meldet ein Ereignis mit ihrem
 *      Schluessel (`POST /api/v1/external/ereignisse/:name`, Bereich
 *      `flow:run`); das Geraet startet jeden Flow ihres Standes, der darauf
 *      hoert, mit `daten` als Argumenten und dem Ausloeser `ereignis` am Lauf.
 *   2. Ein neues Feld im Flow-Kopf, `routen`, und ein neues Werkzeug,
 *      `route_aufrufen`: ein Flow ruft Routen der eigenen App und der Apps,
 *      die er nennt, im Namen des Menschen des Laufs und nur mit dessen
 *      Zugang zur Ziel-App. Eine nicht genannte Route weist das Geraet ab.
 *
 * FREIWILLIG, jedes Paket von Fassung 12 bleibt gueltig und laeuft wie bisher.
 * Die Zahl geht mit, aus dem Grund von 3, 4, 7 bis 12: der Kopf ist
 * `.strict()` und das Werkzeug steht in einer festen Liste; ein Kit, das gegen
 * 12 prueft, wiese `routen` und `route_aufrufen` als unbekannt ab.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 13 kennen, bevor ein Kit auf ein Geraet mit dieser Fassung einspielt.
 * Eine App, die Ereignisse meldet, ruft den neuen Weg mit
 * `ARASUL_API_SCHLUESSEL`; eine App, deren Route ein Flow ruft, liest
 * `X-Arasul-User` wie bei jedem Aufruf ueber Traefik.
 */

/*
 * Fassung 14 (M5, 06.10.2026, Auftrag erkennung-liest-das-original): die
 * Erkennung liest das Original. Gefunden im Fremdtest vom 06.10.2026: das
 * Modell eines erkennenden Schritts bekam nur den Auftrag als Text und
 * antwortete „Fehlt Beleg"; Felder gab es nur bei „unsicher", und mit
 * `ergebnis_bestaetigen` kamen zwei Freigaben.
 *
 *   1. `original` ist keine Anzeige mehr allein: das Geraet holt die Datei
 *      ueber die Adresse der App und gibt sie dem Bildmodell als Bild (ein PDF
 *      als seine ersten Seiten). Fehlt sie oder ist sie zu gross, haelt der
 *      Lauf mit einer Freigabe und dem Grund an, statt ohne Bild zu raten.
 *   2. Ein erkennender Flow in der Art `ergebnis_bestaetigen` hat genau EINE
 *      Pruefung: die Freigabe der Erkennung, immer mit den Feldern.
 *   3. Ein Lauf traegt einen kurzen `titel` (beim Start, sonst aus den
 *      erkannten Feldern); er steht vorn an jeder Freigabe des Laufs.
 *
 * FREIWILLIG, jedes Paket von Fassung 13 bleibt gueltig: ohne `original`
 * laeuft ein erkennender Schritt wie bisher mit dem Auftrag als Text, und
 * `titel` beim Start darf fehlen. Die Zahl geht mit, weil sich ein Verhalten
 * aendert, auf das sich ein Kit verlassen hat (eine Vorlage, die `--felder`
 * mit einem eigenen Schritt `entscheiden` baut, bekaeme jetzt zwei Pruefungen
 * nur noch, wenn sie diesen Schritt behaelt), und weil der Start `.strict()`
 * ist: ein Kit, das gegen 13 prueft, wiese `titel` als unbekannt ab.
 *
 * FOLGE FUER DAS KIT: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
 * muss 14 kennen; Wissen (`app.md`), Geruest und `--new --felder` ziehen nach
 * (eine eigene Kit-Karte).
 */

/**
 * Die Bibliothek zur Laufzeit (Kontrakt 9): wo sie liegt, wie eine App sie
 * holt und wann sich die Adresse aendert.
 *
 * Die Fassung selbst steht NICHT hier: das Backend uebersetzt die Bibliothek
 * nicht mit, die Shell tut es (`FASSUNG` aus `@marken`), und das Frontend
 * legt beim Bau `/marken/marken.json` daneben. Eine zweite Zahl hier waere
 * eine, die eines Tages etwas anderes sagt.
 */
const MARKEN_REGELN = Object.freeze([
  'Eine App KANN die Bibliothek zur Laufzeit vom Gerät laden, statt eine Kopie mitzubringen. Dann nennt sie in `app.json` nur die Hauptzahl (`"marken": "5"`) und das Paket trägt keine Datei der Bibliothek.',
  'Die Adresse ist `/marken/<haupt>/`, absolut und für jede App und jeden Stand dieselbe (auch im Teststand `/apps/<id>/test/`). Sie liegt auf derselben Herkunft wie die App, die Content-Security-Policy des Geräts lässt sie zu.',
  'Ohne Bau: `<link rel="stylesheet" href="/marken/5/marken.css">` und `import { h, rendern, Seitenleiste, Datenliste, Freigabe } from "/marken/5/marken.js"`; `h(...)` statt JSX. Die App braucht kein Tailwind, die Klassen der Primitive stehen fertig in `marken.css`.',
  'Mit Bau: dieselben zwei Dateien, und `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime` und die Bibliothek bleiben außerhalb des Bündels (Rollup `external` mit `output.paths` auf `/marken/5/react.js`, `/marken/5/react-dom.js`, `/marken/5/react-dom-client.js`, `/marken/5/jsx-runtime.js`, `/marken/5/marken.js`). React gibt es dann genau einmal, das des Geräts; ein zweites bricht jeden Hook.',
  'VERSIONSREGEL: unter `/marken/5/` steht immer die neueste Fassung 5.x des Geräts. Innerhalb einer Hauptzahl fällt kein Name weg und keine Eigenschaft ändert ihre Bedeutung, also bekommt die App mit jedem Update des Geräts die neue Fassung, ohne Neubau. Ein Bruch hebt die Hauptzahl und damit die Adresse; das Gerät liefert nur die aktuelle Hauptzahl aus, und die Verwaltung meldet eine App, die eine andere nennt.',
  'Welche Fassung und Hauptzahl das Gerät ausliefert, steht ohne Anmeldung in `/marken/marken.json` (`fassung`, `haupt`, `adresse`, `eingaenge`); `/marken/<haupt>/marken.json` nennt dazu jede Datei mit sha256.',
  'Cache: die festen Namen (`marken.js`, `marken.css`, `react.js` ...) tragen `Cache-Control: no-cache` mit ETag, der Browser fragt nach und bekommt 304, bis ein Update sie ändert. Die Teile `teil-*.js` tragen einen Hash im Namen und `immutable`.',
  'Eine Kopie (drei Zahlen, `"marken": "5.2.1"`) läuft unverändert weiter; die Verwaltung meldet sie, sobald das Gerät weiter ist.',
]);

/**
 * Die Regeln des Manifests, die kein JSON-Schema traegt.
 *
 * Sie stehen als Text und nicht als Ausdruck, weil sie kein Programm sein
 * sollen: das Kit soll sie einem Menschen zeigen koennen, wenn sein Manifest
 * abgewiesen wird. Durchgesetzt werden sie ohnehin am Geraet
 * (`schemas/apps.js`) -- hier stehen sie, damit das Kit sie VORHER kennt.
 */
const MANIFEST_REGELN = Object.freeze([
  'Mindestens eines von `frontend` und `backend`. Eine App ohne beides ist nichts.',
  'Mit `backend` braucht es `ports.backend`, sonst weiß Traefik nicht, wohin.',
  '`ports` ohne `backend` ist ein Port, auf dem nichts lauscht.',
  'Die Kennung `test` ist vergeben: `/apps/<id>/test/` ist der Teststand jeder App.',
  '`id` und `version` müssen zum Ordner passen, in dem das Manifest liegt.',
  'Unbekannte Felder werden abgewiesen, nicht ignoriert.',
  '`modelle` ist eine Forderung, keine Lieferung: das Gerät installiert kein Modell nach, es sagt beim Einspielen, welches fehlt.',
  '`flows` ist umgekehrt eine LIEFERUNG (seit Kontrakt 2): das Paket bringt die Dateien mit, das Gerät registriert sie je App und Stand.',
  '`marken` nennt die Fassung des Designsystems, auf der die App steht (seit Kontrakt 4, freiwillig). Drei Zahlen heißen: die App trägt eine Kopie; das Gerät vergleicht sie mit seiner eigenen und meldet in der App-Verwaltung eine, die älter ist -- eine Kopie der Bibliothek veraltet lautlos. Nur die Hauptzahl (`"5"`, seit Kontrakt 9) heißt: die App lädt die Bibliothek zur Laufzeit vom Gerät, siehe `marken`.',
  '`agent` nennt die Routen, die diese App einem Agenten anbietet (seit Kontrakt 6, freiwillig). Eine Liste; je Eintrag `method`, `path`, `purpose`, `params` und `writes`, und nichts sonst.',
  '`agent[].path` ist RELATIV zur Schnittstelle der App (`/apps/<id>/api/`): ohne Anfrage, ohne `..`, ohne leeres Stück, höchstens 200 Zeichen. Ein führender Schrägstrich wird abgeschnitten, nicht abgewiesen.',
  '`agent[].purpose` ist ein Satz in EINER Zeile, höchstens 200 Zeichen.',
  '`agent[].params` ist eine Liste, leer wenn die Route keine nimmt -- nicht weggelassen. Je Eintrag `name` (einfache Kennung), `type` aus string, number, integer oder boolean, und `required`.',
  '`PUT`, `PATCH` und `DELETE` müssen `writes: true` tragen: eine Route, die etwas ändert, darf sich nicht als lesend ausgeben. Das CLI verlangt für `writes: true` ein ausdrückliches --write.',
  'Innerhalb von `agent` steht keine Route zweimal (`method` und `path` zusammen) und kein Parametername zweimal je Route.',
  'AUSGELIEFERT wird das Feld von der APP, unter `GET agent` an ihrer Schnittstelle, samt `id`, `name` und Version. Das Gerät hält keine zweite Kopie bereit: es nimmt das Feld an und gibt es nicht aus.',
  '`verbindungen` ist die Liste der Hostnamen, zu denen die App von sich aus ins Internet will (seit Kontrakt 7, freiwillig). Nur Namen, kleingeschrieben, ohne Schema, Port, Pfad, Platzhalter oder IP-Adresse; höchstens 20, keiner doppelt. Das Feld ist die FREIGABE: der Ausgangs-Proxy des Geräts lässt für diese App genau diese Namen durch und weist jeden anderen ab; der Administrator sieht je App, was eingetragen ist, was genutzt und was abgewiesen wurde -- siehe `netz`.',
  '`symbol` ist das Bild der App in der Aktivitätsleiste (seit Kontrakt 8, freiwillig): ein Name aus dem Lucide-Satz (klein, mit Bindestrichen, z. B. `file-text`) ODER ein Kürzel aus 1 bis 3 Großbuchstaben oder Ziffern (z. B. `BE`). Das Gerät prüft die Form, nicht den Satz: kennt die Shell den Namen nicht, zeigt sie das Kürzel aus dem Namen der App. Ohne `symbol` gilt dasselbe Kürzel.',
  '`zeigt_freigaben` erklärt, dass die App ihre Freigaben selbst zeigt (seit Kontrakt 12, freiwillig): sie liest `?freigabe=<nummer>` aus ihrer Adresse und zeigt die Ansicht der Freigabe. Dann öffnet ein Klick in „Für Sie" die App beim Vorgang (Tieflink). Ohne das Feld, oder mit `false`, gilt „zeigt nicht selbst": das Gerät öffnet die Freigabe in Arasul, mit demselben Baustein und denselben Regeln. Wo sie gezeigt wird, ändert nicht, wer entscheiden darf: siehe `freigaben`.',
  'Eine App mit `backend` bekommt je Stand eine eigene DATENBANK (seit Kontrakt 5). Sie steht im Manifest nicht: das Gerät legt sie an, nennt ihre Adresse in `umgebung.datenbank` und wirft sie mit der App wieder weg. Der Teststand hat seine eigene; ein Probelauf fasst die Daten des Livestandes nicht an. Was bleibt und was nicht, steht unter `daten`.',
]);

/**
 * Was eine App im Netz erreicht und was nicht (J38, 02.10.2026).
 *
 * Gemessen wird es am Geraet mit `scripts/test/app-netz-abnahme.sh`: aus einem
 * App-Container die eigene Datenbank ja, die einer anderen App und die der
 * Plattform nein, die Plattform-API ja, das Internet nein.
 */
const NETZ_REGELN = Object.freeze([
  'Das Backend einer App läuft im Netz `arasul-apps`. Das Netz hat KEINEN Weg ins Internet und keinen ins Haus-LAN.',
  'Erreichbar sind aus dem Container: die EIGENE Datenbank (`umgebung.datenbank`), die Plattform-API (`umgebung.basis`) und Traefik. Sonst nichts.',
  'Die Rolle einer App darf sich nur mit der Datenbank ihres Standes verbinden. Die Datenbank einer anderen App und die der Plattform weist Postgres ab.',
  'Ein Aufruf ins Internet (eine Schriftart, ein Webdienst, ein Paketmanager beim Start) scheitert. Abhängigkeiten gehören beim Bauen ins Image, nicht in den Start.',
  'Modelle erreicht eine App über die Plattform-API (`llm/chat`, `document/…`), nie direkt.',
  '`verbindungen` nennt die Hostnamen, die die App darüber hinaus braucht. Nur diese erreicht sie, und nur über den Ausgangs-Proxy des Geräts (`egress-proxy:3128`, Zugang je App und Stand).',
  'Den Proxy findet die App in `HTTPS_PROXY` und `HTTP_PROXY` (`https_proxy` auch klein, ein kleines `http_proxy` bewusst nicht: der Healthcheck mancher Images liest es und ignoriert `NO_PROXY`; `NO_PROXY` nennt Datenbank und Plattform-API), die das Gerät in ihre Umgebung schreibt; das Manifest kann sie nicht überschreiben. `curl`, `wget` und `NODE_USE_ENV_PROXY=1` (gesetzt) lesen sie; ein Programm, das sie ignoriert, bekommt keine Verbindung.',
  'Der Proxy entscheidet am HOSTNAMEN und bricht kein TLS auf. Ein freigegebener Name, der auf eine Adresse im Haus zeigt (privat, Loopback, link-local), wird trotzdem abgewiesen. Jeder Aufruf wird je App, Stand und Name gezählt (erlaubt, abgewiesen), ohne Pfad und ohne Inhalt.',
  'Eine Änderung an `verbindungen` gilt mit dem nächsten Einspielen des Standes und greift im Proxy innerhalb von zehn Sekunden; ein Neustart der App ist dafür nicht nötig.',
]);

/**
 * Wie viel Last das Geraet traegt (J40, 02.10.2026).
 *
 * Gemessen am Orin (AGX Orin 64 GB, `qwen3.8:27b-q4_K_M`) mit zwoelf
 * Probe-Konten, `scripts/test/last-zwoelf-personen.py`; Tabelle und Weg in
 * `docs/features/LAST.md`. Die Zahlen gelten fuer dieses Geraet und dieses
 * Modell; ein anderes Geraet misst neu.
 */
const LAST_REGELN = Object.freeze([
  'Das Gerät rechnet EINE lokale KI-Anfrage zur Zeit (Chat und Flow-Schritte teilen sich eine Sperre); die anderen warten der Reihe nach. Ein zweiter Platz im Modell hätte keinen Durchsatz gebracht (gemessen: 11,7 / 12,0 / 12,1 Token/s bei 1 / 2 / 4 Anfragen zugleich).',
  'Eine Antwort von rund 110 Token dauert am Orin etwa 14 Sekunden (12 bis 18). Die Wartezeit einer Anfrage ist ungefähr (Anfragen vor ihr + 1) mal 14 Sekunden; unter einer Minute bleibt sie, solange höchstens drei vor ihr stehen.',
  'Zwölf Personen mit üblicher Nutzung (eine KI-Anfrage je Person alle paar Minuten, 14 Minuten gemessen): Chat typisch 16 Sekunden, in 95 von 100 Fällen unter 35 Sekunden, längste 37. Flow-Läufe mit kurzer Antwort typisch 15 Sekunden.',
  'Fragen alle zwölf im selben Augenblick, wartet die erste 14 Sekunden, typisch 87 und die letzte 169 Sekunden. Eine App, die viele Anfragen auf einmal abschickt, soll sie nicht zugleich loslassen, sondern `timeout_seconds` hoch genug setzen und die Antwort abholen (`warten`).',
  'Die Warteschlange fasst 20 wartende Anfragen neben der einen, die rechnet: ab der 22. gleichzeitigen Anfrage antwortet das Gerät mit 503 und dem Satz, die Warteschlange sei voll. Eine App fängt das ab und versucht es nach einigen Sekunden noch einmal, statt es dem Menschen zu zeigen.',
  'Flow-Läufe treten an der Sperre zwischen die wartenden Chat-Anfragen: bei dichter Last (zwölf Personen, alle halbe Minute eine Anfrage) wartete der Chat typisch 124 Sekunden, ein kurzer Flow typisch 17.',
]);

/**
 * Was eine App dauerhaft behaelt (J35, 25.09.2026).
 *
 * Das Kit sagte an zwei Stellen Verschiedenes: seine Wissensseite, eine
 * SQLite-Datei ueberlebe das naechste Einspielen nicht, und sein Werkzeug,
 * eine eigene Datenbank komme mit. Beides stimmt -- es sind zwei Orte, und
 * der Kontrakt nannte bis hierher nur den einen. Gemessen wird beides mit
 * `scripts/test/daten-vier-augen-abnahme.sh`: eine Zeile in der Datenbank
 * ueberlebt Einspielen und Schalten, eine Datei im Container nicht.
 */
const DATEN_REGELN = Object.freeze([
  'Dauerhaft ist GENAU EIN Ort: die Datenbank aus `umgebung.datenbank`. Sie überlebt jedes Einspielen, jedes Schalten, jeden Neustart des Containers und des Geräts.',
  'Das Dateisystem des Containers überlebt das nächste Einspielen NICHT. Der Container wird dabei ersetzt, samt seiner anonymen Volumes -- auch derer aus `VOLUME` im Dockerfile. Eine SQLite-Datei oder ein Upload-Ordner darin ist nach dem Update weg. Eine hochgeladene Datei gehört in eine Spalte (`bytea`).',
  'Test- und Livestand haben je eine eigene Datenbank. Schalten nach live nimmt die Daten des Teststandes NICHT mit; der Livestand behält seine eigenen über jeden Versionswechsel.',
  'Die Datenbank beginnt leer, und ihr Schema legt die App selbst an (beim Start `CREATE TABLE IF NOT EXISTS` oder eigene Migrationen). Die Rolle der App ist Eigentuemerin ihrer Datenbank und darf das; an eine andere Datenbank kommt sie nicht.',
  'Gesichert wird jede Nacht und auf Anforderung, je App und Stand ein Abzug. Zurück kommen die Daten EINER App über `POST /api/backup/wiederherstellung/app/:id` (Administrator, bestätigt mit seinem Passwort; vorher sichert das Gerät den jetzigen Stand) -- auch nachdem die App entfernt wurde; das nächste Einspielen findet sie dann vor.',
  'Entfernen der App wirft ihre Datenbanken weg. Die Sicherungen davon bleiben liegen.',
  'Live schalten sichert vorher die Live-Datenbank (ein Stand der Sicherung) und hält den alten Livestand dafür an. Eine Strukturänderung läuft beim Start der neuen Fassung; scheitert sie, muss sich der Prozess beenden (Exit-Code ungleich 0) oder sich ungesund melden. Beendet sich der Container, startet er neu, meldet er `unhealthy` oder ist er nach 180 Sekunden nicht gesund, schaltet das Gerät selbst auf Fassung UND Daten von vorher zurück und antwortet mit 409 `LIVE_ZURUECKGESCHALTET` (`details.hilfe`, `details.schaltung`). Ohne Healthcheck im Manifest gilt der Container nach 20 Sekunden ohne Neustart als hochgekommen. Der Teststand wird dabei nicht angefasst.',
]);

/**
 * Wer die Freigaben eines Laufs entscheidet (J35, 25.09.2026).
 *
 * Bis hierher jeder, dem die App freigegeben ist -- auch der, der den Vorgang
 * eingereicht hat. Fuer eine Kanzlei ist das genau der Fall, den sie
 * ausschliessen muss: niemand gibt seinen eigenen Vorschlag frei. Die Regel
 * setzt die APP beim Start des Laufs; sie kennt den Menschen aus
 * `X-Arasul-User`. Nicht das Modell und nicht die Flow-Datei: ein Werkzeug-
 * Parameter, den das Modell setzt, waere eine Regel, die das Modell auch
 * weglassen kann.
 */
const FREIGABE_REGELN = Object.freeze([
  'Der Kreis ist, wem die App freigegeben ist. Ein Lauf kann ihn beim Start enger ziehen, nie weiter.',
  '`einreicher` ist der Benutzername des Menschen, der den Lauf auslöst -- der Wert aus `X-Arasul-User`. Er muss ein aktives Konto sein, dem die App freigegeben ist, sonst 400.',
  'Wer eingereicht hat, entscheidet nie selbst (seit 04.10.2026, unabhängig von `ohne_einreicher`): er sieht die Anfrage nicht unter /api/freigabe-anfragen, kann sie weder übernehmen noch bekommen, und entscheidet er trotzdem, antwortet das Gerät 403. `freigabe.ohne_einreicher: true` bleibt erlaubt und braucht `einreicher`.',
  '`freigabe.entscheider` nennt ENTWEDER `{"rolle":"admin"}` ODER `{"konten":["name",…]}`. Nur diese Menschen sehen und entscheiden die Anfrage; jeder andere sieht sie nicht und bekommt beim Entscheiden 403. Jedes Konto muss die App freigegeben haben, sonst 400.',
  'Bleibt nach der Regel niemand, der entscheiden könnte, weist das Gerät den Start mit 400 ab -- statt eine Freigabe anzulegen, die in ihre Frist läuft.',
  'Die Regel gilt für jede Freigabe dieses Laufs. `GET /freigaben` nennt je Anfrage `einreicher`, `ohne_einreicher`, `entscheider` (Rolle oder Konten) und `kreis`.',
  '`GET /flows/runs/:id` nennt unter `freigabe`, wer eingereicht hat und wer entscheidet: `einreicher`, `ohne_einreicher`, `entscheider`, `kreis` (die Konten, die JETZT entscheiden können), `liegt_bei` (bei wem die offene Anfrage liegt, null = bei allen im Kreis), `wo` und `adresse` (wo der Mensch entscheidet: in der App, in der die Freigabe entstand, oder unter „Für Sie" in Arasul), `offen` (die wartende Anfrage mit ihrer `stufe`, oder null) und `satz` -- ein fertiger Satz für den Menschen, der eingereicht hat. Ohne App ist `freigabe` null.',
  'Felder einer Freigabe (seit Kontrakt 10): `GET /freigaben` nennt je Anfrage `felder` (je Feld `name`, `vorschlag` der KI, `unsicher`, `fehlend`, `aenderbar`; null ohne Erkennung), `felder_schritt`, `original` (Adresse gleicher Herkunft oder null) und nach der Bestätigung `korrekturen` (je Feld `feld`, `vorschlag`, `wert`, `von`, `am`; null = nichts geändert). Änderbar ist, was die Rolle unter `ergebnis.aenderbar` nennt.',
  'WO ENTSCHIEDEN WIRD UND WER: die Entscheidung trifft immer ein Mensch mit seiner Sitzung, nie die App mit ihrem Schlüssel und nie der Flow. Gezeigt wird die Freigabe in der App (mit `zeigt_freigaben`) oder unter „Für Sie" in Arasul; in beiden Fällen geht die Entscheidung an das Gerät (`POST /api/freigabe-anfragen/:id/bestaetigen` oder `…/ablehnen`), und das Gerät prüft die Regeln dieses Abschnitts: Kreis, Einreicher, `liegt_bei`.',
  'Der kurze Titel des Laufs (seit Kontrakt 14): `titel` beim Start (höchstens 120 Zeichen, freiwillig), sonst bildet das Gerät ihn bei einer Erkennung aus den ersten drei erkannten Werten in der Reihenfolge von `ergebnis.felder`. Er steht vorn an jeder Freigabe des Laufs (`<titel> – <Grund>`), damit zwei Karten zu unterscheiden sind; `GET /flows/runs/:id` nennt ihn als `titel`. Was die App beim Start nannte, überschreibt das Gerät nicht.',
  'Bei wem eine Freigabe liegt, setzt NIE die App und nie der Flow: eine neue Anfrage liegt bei der Standardperson ihrer Stufe, die der Administrator je App und Stufe in der Verwaltung setzt; ohne sie bei allen im Kreis. Jeder im Kreis kann sie übernehmen oder an einen anderen im Kreis weitergeben; entscheiden kann nur, bei dem sie liegt. `GET /freigaben` nennt je offener Anfrage `liegt_bei`.',
]);

/** Die Namen, die unter `/apps/<id>/` der Plattform gehoeren. */
const VERGEBENE_PFADE = Object.freeze([
  { pfad: 'test', wem: 'Der Teststand der App: /apps/<id>/test/' },
  { pfad: 'api', wem: 'Das Backend der App, über Traefik' },
  { pfad: 'api/me', wem: 'Arasul selbst: Benutzer und Rolle als JSON, auch ohne App-Backend' },
]);

/**
 * Das Wegstueck, unter dem die externe Schnittstelle haengt.
 *
 * Es steht an zwei Stellen im Kontrakt und muss beide Male dasselbe sein: am
 * Anfang jedes `pfad` unter `endpunkte`, und am Ende der Adresse, die eine App
 * als `ARASUL_API_URL` bekommt (`services/app/appSchluessel.js`, `API_URL`).
 * `relativZurBasis` rechnet das eine aus dem anderen aus, damit niemand die
 * beiden von Hand aneinanderhalten muss.
 */
const PRAEFIX = '/api/v1/external';

/**
 * Derselbe Weg, aber von der Adresse aus gerechnet, die die App bekommen hat.
 *
 * DER FUND VOM ORIN (Werkstatt W2, 29.08.2026). `ARASUL_API_URL` endet auf
 * `/api/v1/external`, die Pfade hier fangen damit an. Wer beides
 * aneinanderhaengt -- und das ist das Naheliegende --, ruft
 * `/api/v1/external/api/v1/external/flows/freigabe/run` und bekommt einen 404.
 * Beide Angaben waren richtig, der Kontrakt sagte nur nicht, dass es dasselbe
 * Stueck ist. Jede App loeste die Ueberschneidung selbst auf, und jede anders.
 *
 * Ein Endpunkt, der NICHT unter dem Praefix liegt, bekommt `null`. Die
 * OpenAI-kompatible Schnittstelle unter `/v1` ist so einer: sie haengt am
 * Wurzelverzeichnis, weil fremde Werkzeuge dort eine Basis-URL erwarten, und
 * laesst sich gegen `ARASUL_API_URL` gar nicht ausdruecken. `null` ist die
 * ehrliche Antwort darauf; eine ausgerechnete waere eine falsche.
 */
function relativZurBasis(pfad) {
  return pfad.startsWith(`${PRAEFIX}/`) ? pfad.slice(PRAEFIX.length) : null;
}

/**
 * Das Protokoll der Modellaufrufe (J35), als Saetze fuer einen Menschen.
 */
const PROTOKOLL_REGELN = Object.freeze([
  'Jeder Modellaufruf über diese Schnittstelle steht im Protokoll des Geräts: App, Stand, Mensch, Weg, Modell, Beginn, Dauer, Ausgang. Der Administrator liest es unter Einstellungen -> Apps.',
  'Ohne Inhalt: kein Dateiname, kein Text, kein Prompt, keine Antwort. Von der Antwort steht nur ihr sha256 da, dazu der Auftrag (`job_id`), den die Antwort der Route nennt -- wer einen Vorschlag aufbewahrt, kann ihn damit seinem Aufruf zuordnen.',
  'Für wen die App fragt, nennt sie mit der Kopfzeile X-Arasul-User (den Wert aus der Forward-Auth unverändert weiterreichen) oder mit dem Feld `einreicher`; an `/v1` mit dem Feld `user`. Der Name muss ein aktives Konto sein, dem die App freigegeben ist, sonst 400 und kein Aufruf.',
  'Nennt die App niemanden, wird der Aufruf trotzdem protokolliert, ohne Menschen.',
  'Auch jeder Modellschritt eines Flows dieser App steht dort, als Weg `flows/<name>` mit seinem Lauf (`run_id`) und dem Menschen, den die App beim Start als `einreicher` nannte -- auch der Satz, den ein Flow nach einer Freigabe schreibt. Ein Flow braucht dafür nichts zu tun.',
]);

/**
 * Wie lange ein Weg wartet, und was danach kommt (J35, 26.09.2026).
 *
 * Bis hierher antwortete das Geraet nach 60 s mit 408, auch wenn die Route
 * 600 s versprach (TIMEOUT-001, `utils/anfrageFrist.js`), und nach ihrer
 * eigenen Wartezeit mit 500 „Job timed out". Beides liess eine App ohne
 * Ergebnis zurueck, das das Geraet Sekunden spaeter fertig hatte -- sie las
 * doppelt. Jetzt antwortet die Route selbst, mit 202 und dem Weg zum Abholen.
 */
const WARTEN_REGELN = Object.freeze([
  '`llm/chat`, `document/analyze` und `document/extract-structured` warten `timeout_seconds` auf das Modell (Vorgabe 300, höchstens 600). Das Gerät schneidet keine dieser Anfragen vorher ab; ein 408 gibt es auf diesen Wegen nicht mehr.',
  'Rechnet der Auftrag nach der Wartezeit noch, antwortet das Gerät mit HTTP 202: `success: false`, `status: "laeuft"`, `job_id` und `abholen` -- der Weg zum Ergebnis relativ zur Basis. Der Auftrag läuft weiter; die Datei NICHT noch einmal schicken.',
  '`abholen` ist bei `document/extract-structured` der Weg `document/extract-structured/<job_id>` (Antwort wie `auslesen.abgeholt`), bei `llm/chat` und `document/analyze` `llm/job/<job_id>`. Das 202 von `document/extract-structured` und `document/analyze` trägt schon `extracted_text`, `filename`, `char_count` und `metadata`.',
  'Abholen bei `document/extract-structured`: GET auf `abholen`. 202 heißt weiter warten (ein paar Sekunden, nicht im Takt der Millisekunden), 200 ist das Ergebnis in der Form `auslesen.abgeholt`, 500 der Fehlschlag.',
  'Abholen bei `llm/chat` und `document/analyze`: `llm/job/<job_id>` antwortet immer mit 200 und nennt den Stand in `status` (`pending`, `processing`, `completed`, `error`, `cancelled`); die Antwort des Modells steht bei `completed` in `content` (nicht in `response`), ein Fehler in `error`.',
  'Ein fertiges Ergebnis liegt eine Stunde, danach 404. Abholen kann nur dieselbe App im selben Stand; ein fremder Auftrag ist 404.',
  'Schließt die App die Verbindung, bevor die Antwort kommt, bricht das Gerät den Auftrag ab. Wer nicht warten will, setzt eine kleine `timeout_seconds` und holt ab.',
]);

/**
 * Das Auslesen eines Dokuments nach einem Schema (J35, 26.09.2026).
 *
 * Das Kit hat die Antwort bis hierher geraten: seine Probe vom 25.09.2026 las
 * `data` richtig, weil sie es so erwartet hatte, und meldete danach als offene
 * Stelle, dass die Form nirgends steht (K21). Sie steht jetzt als JSON-Schema
 * unter `auslesen.antwort` -- aus demselben Zod-Schema, gegen das der Test die
 * echte Antwort der Route prueft --, und das, was ein Schema nicht sagt, hier.
 */
const AUSLESEN_REGELN = Object.freeze([
  'Die Datei geht als multipart/form-data unter `file`, dazu die Felder aus `anfrage` (alles Zeichenketten). PDF, DOCX, Text und Bilder (PNG, JPEG, TIFF, BMP), höchstens 50 MB.',
  'Das Gerät liest zuerst den TEXT der Datei (bei Fotos und Scans über seine Texterkennung) und gibt dem Modell diesen Text samt `schema`. Das Modell sieht kein Bild; wer das Bild selbst an ein Modell geben will, nimmt `llm/chat` mit `images` (siehe `bilder`).',
  '`data` ist ein Objekt oder null. Es ist NICHT gegen `schema` geprüft: ein Feld kann fehlen, einen anderen Typ haben oder dazukommen. Die App prüft die Felder selbst, bevor sie etwas daraus macht.',
  '`data` ist null, wenn die Antwort des Modells kein JSON-Objekt war; sie steht dann unverändert in `raw_response`.',
  'Scheitert das Modell, antwortet das Gerät mit HTTP 500 in der Form von `fehlschlag` -- ohne den Fehler-Umschlag der übrigen Fehler.',
  'Rechnet das Modell nach `timeout_seconds` noch, ist das kein Fehlschlag: HTTP 202 in der Form von `laeuft`, mit `abholen` (`document/extract-structured/<job_id>`). Ein GET dort liefert 202, solange es rechnet, dann 200 in der Form von `abgeholt` oder 500 als `fehlschlag` (siehe `warten`).',
  'Fehlt `file` oder `schema`, oder ist `schema` kein JSON, antwortet es mit 400 im Fehler-Umschlag (`error.code` VALIDATION_ERROR).',
  'Ein Vorschlag des Modells ist kein Beleg: `job_id` ordnet ihn seinem Eintrag im Protokoll des Geräts zu (siehe `protokoll`).',
]);

/**
 * Ein Bild an ein Bildmodell (J35, 26.09.2026). Siehe `services/llm/bildmodell.js`.
 */
const BILDER_REGELN = Object.freeze([
  '`POST llm/chat` nimmt `images`: eine Liste von Bildern als Base64, PNG oder JPEG. Der Vorsatz einer data:-URL (`data:image/png;base64,`) darf davorstehen, das Gerät schneidet ihn ab.',
  `Höchstens ${BILD_MAX_ANZAHL} Bilder je Aufruf, je Bild höchstens ${BILD_MAX_ZEICHEN} Zeichen Base64; der ganze Körper höchstens 10 MB.`,
  'Ohne `model` nimmt das Gerät seine Bildvorgabe (in der Kurzliste `gemma4:e4b`), liegt die nicht am Gerät, das Modell der Aufgabe `vision` (`llava-phi3`). Gibt es keines, antwortet es mit 503.',
  'Mit `model` muss es ein Modell sein, das Bilder liest; ein Textmodell weist das Gerät mit 400 ab und nennt die Bildmodelle, die es hat. Das Bild wird nie still weggelassen und nie gegen eine Beschreibung getauscht.',
  '`GET models` nennt je Modell `supports_vision_input`.',
  'Die Bildvorgabe ist gemessen: am Orin las `gemma4:e4b` mit fünf erfundenen Belegfotos (Tankquittung, Rechnung, Kassenbon, Bewirtung, schräges Handyfoto) alle sechs Felder in rund 5 s je Beleg, `llava-phi3` fast keines. Wer sich darauf nicht verlassen will, nennt `model` und misst am Gerät des Kunden; `document/extract-structured` (Texterkennung, dann Textmodell) ist der zweite Weg zum Vergleich.',
]);

/**
 * Was ein Kit am Geraet aufrufen kann.
 *
 * Der Bereich (`bereich`) ist der Wert, der in `allowed_endpoints` eines
 * Schluessels stehen muss. Ein Kit sieht damit auf einen Blick, welchen
 * Schluessel es braucht -- und ein Geraet, das einen Bereich noch nicht kennt,
 * nennt ihn hier auch nicht.
 *
 * `relativ` kommt aus `relativZurBasis` und steht nicht in der Liste: eine
 * zweite Schreibweise desselben Weges waere die naechste Stelle, an der zwei
 * Angaben auseinanderlaufen.
 */
const ENDPUNKTE = Object.freeze(
  [
    { verb: 'GET', pfad: '/api/v1/external/contract', bereich: null, was: 'Dieser Kontrakt' },
    {
      verb: 'POST',
      pfad: '/api/v1/external/apps',
      bereich: 'app:deploy',
      was: 'Ein Paket einspielen; rollt IMMER in den Teststand. Optional ein Multipart-Feld `aenderungstext` (ein paar Sätze, was neu ist, höchstens 1000 Zeichen)',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/apps/:id/schalten',
      bereich: 'app:deploy',
      was: 'Livestand schalten: `{"ziel":"live"}` (vorher gesichert, bei Scheitern selbst zurück: 409 `LIVE_ZURUECKGESCHALTET`, ohne Sicherung 409 `LIVE_NICHT_GESICHERT`) oder `{"ziel":"zurueck"}`',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/apps/:id',
      bereich: 'app:deploy',
      was: 'Was das Gerät über diese App weiß, beide Stände',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/apps/:id/protokoll?stand=<test|live>&zeilen=<1..1000>',
      bereich: 'app:deploy',
      was: 'Die letzten Zeilen des Containers einer App (Vorgabe: Teststand, 200 Zeilen, höchstens 1000), mit Zeitstempel, dazu ob er läuft, Neustarts und Rückgabewert. Jeder Wert aus seiner Umgebung ab 8 Zeichen steht als `[geschwärzt]` da; `geschwaerzt` zählt die Stellen. 404, wenn es den Container nicht gibt (App ohne `backend`, Bau gescheitert)',
    },
    {
      verb: 'DELETE',
      pfad: '/api/v1/external/apps/:id?bestaetigung=<id>&dateien=<true|false>',
      bereich: 'app:deploy',
      was: 'App weg: beide Container samt Volumes, beide Stände, alle Freigaben, ihre Datenbanken (die Sicherungen davon bleiben)',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/update',
      bereich: 'system:update',
      was: 'Stand der Plattform: eigene Fassung, laufender oder letzter Update-Lauf mit Protokoll',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/update/neueste',
      bereich: 'system:update',
      was: 'Die neueste Fassung im Netz',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/update',
      bereich: 'system:update',
      was: 'Das Gerät auf eine neue Fassung bringen: `{"fassung":"0.8.15"}` (ohne Angabe die neueste); sichert vorher, 202, Fortschritt in GET',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/update/zurueck',
      bereich: 'system:update',
      was: 'Zurück auf die vorige Fassung (das Programm, nicht die Daten); 202',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/llm/chat',
      bereich: 'llm:chat',
      was: 'Sprachmodell fragen; mit `images` ein Bildmodell (siehe `bilder`)',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/llm/job/:jobId',
      bereich: 'llm:status',
      was: 'Stand eines Auftrags; der Abholweg nach einem 202 von `llm/chat` und `document/analyze`',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/llm/queue',
      bereich: 'llm:status',
      was: 'Die Warteschlange',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/models',
      bereich: 'llm:status',
      was: 'Welche Modelle am Gerät sind',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/document/extract',
      bereich: 'document:extract',
      was: 'Text aus einer Datei holen',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/document/extract-structured',
      bereich: 'document:extract',
      was: 'Felder nach einem Schema aus einer Datei lesen (Anfrage und Antwort unter `auslesen`). Rechnet das Modell nach `timeout_seconds` noch: 202 mit `abholen` (siehe `warten`)',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/document/extract-structured/:jobId',
      bereich: 'document:extract',
      was: 'Ein Auslesen abholen, das nach seiner Wartezeit noch rechnete: 202 rechnet noch, 200 fertig, 500 gescheitert (siehe `warten`)',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/document/analyze',
      bereich: 'document:analyze',
      was: 'Datei holen und vom Modell auswerten lassen',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/flows',
      bereich: 'flow:run',
      was: 'Welche Flows dieser Schlüssel starten darf. Mit dem Schlüssel einer App: NUR ihre eigenen, im Stand ihres Containers',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/flows/:name/run',
      bereich: 'flow:run',
      was: 'Einen Flow anstoßen. Gesucht wird im Namensraum des Schlüssels. Optional `einreicher` und `freigabe` (siehe `freigaben`) und `titel` (seit Kontrakt 14, ein kurzer Titel für die Freigabekarten)',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/ereignisse/:name',
      bereich: 'flow:run',
      was: 'Ein Ereignis der App melden (seit Kontrakt 13): startet jeden Flow dieser App in diesem Stand, der unter `ausloeser` auf den Namen hört, mit `daten` als Argumenten. Optional `einreicher` und `titel` (seit Kontrakt 14, Titel jedes gestarteten Laufs). 202 mit `laeufe`, ohne zu warten',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/flows/runs/:id',
      bereich: 'flow:run',
      was: 'Der Lauf eines Flows, mit seinen Schritten (`schritte`: position, art, name, status, modell, eingabe, ausgabe, Zeiten) und `freigabe` (wer eingereicht hat, wer entscheidet und wo, siehe `freigaben`). `steps_used` ist ihre Anzahl, nicht die Kette',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/freigaben?lauf=<id>',
      bereich: 'flow:run',
      was: 'Die Freigaben dieser App nachlesen, samt `zusammenhang` -- dem Text, an dem entschieden wurde. Nur lesen: entschieden wird über die Sitzung eines Menschen',
    },
  ].map(e => Object.freeze({ ...e, relativ: relativZurBasis(e.pfad) }))
);

/**
 * Ein Zod-Schema als JSON-Schema, aus Sicht dessen, der es SCHREIBT.
 *
 * `io: 'input'` und nicht `'output'`: das Kit prueft, was ein Mensch in
 * `app.json` tippt, und dort sind Felder mit Vorgabewert optional. Aus der
 * Ausgabesicht waeren sie Pflicht -- ein Kit, das danach prueft, verlangte
 * `ressourcen` in jedem Manifest.
 */
function alsJsonSchema(schema) {
  return z.toJSONSchema(schema, { io: 'input' });
}

/**
 * Der Kontrakt, wie ihn `GET /api/v1/external/contract` ausgibt.
 *
 * Ohne Zeitstempel und ohne Zufall: der Aufrufer soll zwei Antworten
 * vergleichen koennen, und die Pruefung in `__tests__` bildet einen
 * Fingerabdruck daraus. Der Umschlag mit `timestamp` kommt aus der Route,
 * so wie ueberall.
 */
function kontrakt() {
  return {
    kontrakt: KONTRAKT_VERSION,
    arasul: versionFuerAnzeige(),
    app_json: {
      schema: alsJsonSchema(AppManifest),
      regeln: MANIFEST_REGELN,
    },
    flow_frontmatter: {
      // Der YAML-Kopf einer Flow-Datei. `systemPrompt` steht darin NICHT --
      // das ist der Markdown-Rumpf unter dem Kopf, und der Parser setzt ihn
      // ein, bevor er gegen dieses Schema prueft (`services/flows/flowFile.js`).
      schema: alsJsonSchema(FlowDefinition),
      rumpf: 'systemPrompt ist der Markdown-Rumpf unter dem YAML-Kopf, kein Feld im Kopf.',
      // Was fuer einen Flow AUS EINEM PAKET zusaetzlich gilt (C6). Wie die
      // Manifest-Regeln steht es als Satz und nicht als Ausdruck: das Kit soll
      // es einem Menschen zeigen koennen.
      regeln: [
        'Eine Datei je Flow unter `flows.verzeichnis`, Endung `.md`. Der Dateiname IST der Name.',
        'Steht im Kopf ein `name:`, muss er derselbe sein wie der Dateiname.',
        'Das Standardmodell steht im Kopf (`modell:`). Der Administrator am Gerät darf es je Flow überschreiben; seine Überschreibung liegt in der Datenbank und überlebt ein App-Update.',
        '`ordner` ist für einen Flow aus einem Paket nicht erlaubt: die Datei-Werkzeuge brauchen einen abgeschirmten Datenordner je App, und den gibt es nicht. Der Speicher einer App ist ihre DATENBANK (`umgebung.datenbank`, seit Kontrakt 5), und die erreicht die App selbst -- nicht ein Flow, der im Backend des Geräts läuft.',
        `Höchstens ${appFlows.MAX_FLOWS} Flows je Paket.`,
        'Der Namensraum ist die App: zwei Apps dürfen denselben Flow-Namen tragen.',
        'Das Werkzeug `freigabe_anfordern` hält den Lauf an, bis ein Mensch bestätigt (Status `wartend`). Ablehnung beendet ihn als `abgebrochen`, Fristablauf als `abgelaufen`.',
        'Wer entscheidet, nennt die Flow-Datei nicht, weder Person noch Rolle. Es gelten die Regeln unter `freigaben`: der Kreis ist, wem die App freigegeben ist, die App kann ihn beim Start enger ziehen, wer eingereicht hat entscheidet nie, und entscheiden kann nur, bei wem die Anfrage liegt.',
        'Die Frist steht als `frist_minuten` in den `parameter` des Schritts; ohne Angabe gilt die Vorgabe des Geräts.',
        '`arten` nennt, welche Arten der Flow kann (seit Kontrakt 8, freiwillig): `autonom` und `ergebnis_bestaetigen`, mindestens eine, keine doppelt. Der Administrator wählt je Flow zwischen den genannten, sie gilt ab dem nächsten Lauf. `ergebnis_bestaetigen` hält den Lauf am Ende an und legt eine Freigabe mit dem Ergebnis an (in der letzten Stufe des Flows, sonst ohne Stufe); `autonom` legt keine an. Ohne Angabe gilt die erste genannte Art, ohne `arten` `autonom`. Ein Flow, der erzeugt (kein Schritt mit `faehigkeiten.bild`), läuft autonom oder mit Freigabe von Anfang an, nie mit stillem Rückfall. Ein Flow, der erkennt (mindestens ein `subagent`-Schritt mit `faehigkeiten.bild: true`), legt bei fehlender oder unsicherer Erkennung auch in `autonom` eine Freigabe mit dem Grund `Erkennung unsicher: Feld X` an: ein deklariertes Feld der Rolle ohne Wert, oder eines, das die Rolle im JSON unter `unsicher` (Liste von Feldnamen) nennt; kam kein JSON oder scheiterte die Rolle, gelten alle Felder als unsicher. In der Art `ergebnis_bestaetigen` (seit Kontrakt 14) legt ein erkennender Schritt diese Freigabe IMMER an, auch wenn alles sicher erkannt ist, mit den Feldern und dem Titel `Ergebnis bestätigen: <Flow>`; sie ist die Bestätigung des Laufs, am Ende kommt keine zweite. Eine Vorlage, die dafür einen eigenen Schritt `freigabe_anfordern` anhängt, bekommt zwei Prüfungen.',
        '`ausloeser` nennt, wodurch der Flow startet (seit Kontrakt 8, freiwillig): eine Liste von Objekten mit `typ` `hand`, `zeitplan` (dazu `zeitplan`, fünf Felder wie in cron, z. B. `"0 6 * * 1-5"`) oder `ereignis` (dazu `ereignis`, der Name eines Ereignisses der App). Höchstens 5, keiner doppelt. `zeitplan` wirkt seit dem 04.10.2026: das Gerät startet den Flow im LIVESTAND zur genannten Zeit (Zeitzone des Geräts, Europe/Berlin; Sommer- und Winterzeit richtig: eine Uhrzeit, die es beim Umstellen nicht gibt, läuft einmal danach, eine doppelte nur beim ersten Mal), genau einmal je Termin, ohne Argumente und ohne Einreicher (der Lauf trägt den Auslöser `zeitplan`). Ein Flow mit Pflichtargument ohne Vorgabe läuft nicht nach Zeitplan. Läuft oder wartet schon ein Lauf desselben Flows, entfällt der Termin. Verpasste Termine (Gerät aus): der jüngste wird höchstens einmal nachgeholt, wenn er höchstens eine Stunde zurückliegt, sonst übersprungen; der Administrator sieht es auf der Seite der App und pausiert den Zeitplan je Flow. Ein Ausdruck, den das Gerät nicht lesen kann (Minute 61), wird beim Einspielen abgewiesen. `ereignis` wirkt seit Kontrakt 13, siehe die nächste Regel.',
        '`ereignis` (seit Kontrakt 13): die App meldet ein Ereignis mit ihrem Schlüssel, `POST ereignisse/<name>` relativ zur Basis (Bereich `flow:run`), Körper `{"daten": {…}, "einreicher": "<X-Arasul-User>"}`, beides freiwillig. Das Gerät startet JEDEN Flow derselben App im selben Stand, der unter `ausloeser` `{typ: ereignis, ereignis: <name>}` nennt; eine App löst kein Ereignis einer anderen aus. `daten` werden die Argumente des Flows mit demselben Namen (Werte als Zeichenkette, Zahl oder Wahrheitswert; was der Flow nicht deklariert, fällt weg). Fehlt ein Pflichtargument, passt eine Auswahl nicht oder ist der Flow ausgeschaltet, startet DIESER Flow nicht, die anderen schon. Der Lauf trägt den Auslöser `ereignis` und den Namen (`GET flows/runs/:id` nennt `ausloeser` und `ereignis`); Einreicher ist, wen die App nennt, sonst niemand. Die Antwort wartet nicht auf die Läufe: 202 mit `laeufe` (je `flow`, `run_id`) und `nicht_gestartet` (je `flow`, `grund`), 200 mit leeren Listen, wenn kein Flow hört.',
        '`stufen` nennt die benannten Freigabestufen (seit Kontrakt 8, freiwillig), z. B. `pruefung` und `leitung`: je Stufe `name`, optional `bezeichnung` und `frist_minuten`. Höchstens 5, keine doppelt. Nennt ein `freigabe_anfordern`-Schritt in `parameter.stufe` eine Stufe, muss der Flow sie deklarieren. Die Person je Stufe setzt der Administrator, nicht der Flow: eine neue Freigabe der Stufe liegt zuerst bei ihrer Standardperson (je App und Stufenname, zwei Flows mit derselben Stufe teilen sie), ohne sie bei allen mit Zugang (`freigaben`).',
        '`faehigkeiten` je Schritt nennt, was der Schritt vom Modell braucht (seit Kontrakt 8, freiwillig): `text`, `bild`, `werkzeuge` (je true oder false) und `mindestkontext` (Tokens, 512 bis 1048576). Nur bei `typ: subagent`; ein Werkzeug-Schritt ruft kein Modell und wird mit `faehigkeiten` abgewiesen.',
        '`ergebnis.aenderbar` an einer Rolle nennt, welche ihrer `felder` ein Mensch in einer Freigabe ändern darf (seit Kontrakt 10, freiwillig; nur Namen aus `felder`). Die Freigabe aus der Erkennung zeigt alle Felder mit dem Vorschlag der KI, unsichere und fehlende zuerst mit „pruefen", ohne Prozentzahl; änderbar sind nur diese. Wer bestätigt, schickt geänderte Werte unter `felder` mit (`POST /api/freigabe-anfragen/:id/bestaetigen`); ein Feld, das hier nicht steht, weist das Gerät mit 400 ab. Gespeichert wird je Feld der Vorschlag, der neue Wert, wer und wann (`korrekturen`), und der weitere Lauf arbeitet mit dem neuen Wert.',
        '`original` an einem erkennenden Schritt (`typ: subagent` mit `faehigkeiten.bild: true`, seit Kontrakt 10, freiwillig) nennt das Bild oder PDF, das er liest, als Pfad RELATIV zur Adresse der App, mit Platzhaltern wie der Auftrag (`api/belege/{{beleg}}`): ohne `/` am Anfang, ohne `..`, ohne Schema. Die Freigabe zeigt es links, zoombar, geladen unter `/apps/<id>/` (Teststand `/apps/<id>/test/`) mit der Sitzung dessen, der entscheidet. Ergibt das Einsetzen keinen solchen Pfad, entsteht die Freigabe ohne Original.',
        `Das Modell liest das Original (seit Kontrakt 14): vor dem Modellaufruf holt das Gerät die Datei über die Adresse der App im Stand des Laufs (Teststand und Livestand getrennt). Ein Pfad unter \`api/\` geht an das Backend der App (GET an ihren Container, mit \`X-Arasul-User\` und \`X-Arasul-Role\` des Menschen des Laufs und nur mit dessen Zugang zur App, wie \`route_aufrufen\`), jeder andere an die Dateien ihres Frontends. PNG und JPEG gehen unverändert als Bild an das Modell, ein PDF als seine ersten ${originalDienst.MAX_SEITEN} Seiten (PNG); höchstens ${originalDienst.MAX_BYTES / 1024 / 1024} MB, erkannt an den ersten Bytes, nicht am Namen. Das Modell ist das des Schritts, wenn es Bilder liest, sonst das Bildmodell des Geräts (\`gemma4:e4b\`); hat der Administrator den Flow auf ein externes Modell gestellt, geht das Bild dorthin mit (als Bildteil im OpenAI-Format). Fehlt das Original, ist es zu groß, kein PNG, JPEG oder PDF, oder liegt kein Bildmodell am Gerät, ruft das Gerät KEIN Modell auf: der Lauf hält mit einer Freigabe an (\`Original fehlt\`, \`Original zu groß\`, \`Original nicht lesbar\`, \`Original nicht abrufbar\`, \`Kein Bildmodell am Gerät\`), der Grund steht als Satz im Zusammenhang, die Felder sind leer. Ohne \`original\` bekommt das Modell wie bis Kontrakt 13 nur den Auftrag als Text.`,
        '`abschluss` nennt die Abschluss-Route der eigenen App (seit Kontrakt 11, freiwillig): `abschluss: { route: "/abschluss/beleg" }`, ein Pfad des Backends so, wie die App ihn sieht (ohne `/apps/<id>/api`), mit führendem `/`, ohne Host, Abfrage und `..`. Nach der letzten Stufe (bei der Art `ergebnis_bestaetigen` nach der Bestätigung) ruft das Gerät sie mit POST und JSON auf: `lauf` (Nummer, zugleich Kopf `Idempotency-Key: arasul-lauf-<nummer>` und `X-Arasul-Lauf`), `flow`, `app`, `stand`, `argumente`, `ergebnis` (Text), `felder` (je Feld der geltende Wert, mit den Korrekturen; null ohne Erkennung), `korrekturen` (je Feld `feld`, `vorschlag`, `wert`, `von`, `am`; null ohne) und `angenommen`. `Authorization: Bearer` trägt `ARASUL_ABSCHLUSS_TOKEN`; die App prüft es und legt ein Ergebnis zu einer Lauf-Nummer nur einmal an (derselbe Aufruf kommt bei „erneut" wieder). Antwortet sie mit 2xx, ist der Lauf `fertig`; mit allem anderen, nach 30 Sekunden ohne Antwort oder gar nicht, steht er auf `nicht_uebergeben` mit dem Grund, und der Administrator loest in der Verwaltung „erneut" aus, ohne dass die Schritte neu laufen. Das Gerät folgt keiner Weiterleitung. Das Manifest braucht ein `backend`.',
        '`routen` nennt die Routen, die das Werkzeug `route_aufrufen` rufen darf (seit Kontrakt 13, freiwillig; nur mit dem Werkzeug und das Werkzeug nur mit `routen`): je Eintrag `methode` (GET, POST, PUT, PATCH, DELETE), `pfad` wie bei `abschluss.route` (so, wie die App ihn sieht, mit führendem `/`; ein Wegstück `{name}` steht für genau ein Wegstück aus Buchstaben, Ziffern und . _ ~ -), optional `app` (die Kennung einer anderen App; ohne `app` die eigene, dann braucht das Manifest ein `backend`) und `zweck` (ein Satz für das Modell). Höchstens 20, keine doppelt.',
        '`route_aufrufen` nimmt `app` (leer = eigene), `methode` (Vorgabe GET), `pfad` (mit eingesetzten Werten) und `daten`: in einem Werkzeug-Schritt als JSON-Text oder als Liste `name=wert`, beim Modell als Objekt; bei GET und DELETE als Abfrage, sonst als JSON-Körper. Das Gerät prüft ZUERST, dass Methode und Pfad zu einem Eintrag unter `routen` für genau diese App passen, DANN, dass der Mensch des Laufs die Ziel-App im Stand des Laufs benutzen darf (dieselbe Freigabe wie im Browser): der Einreicher, sonst das Konto, dem der Lauf gehört (bei Zeitplan und Ereignis ohne Einreicher der Besitzer des Schlüssels der App). Gerufen wird derselbe Stand der Ziel-App, über ihren Container im Netz `arasul-apps`, mit `X-Arasul-User` und `X-Arasul-Role` dieses Menschen, `X-Arasul-Lauf` und `X-Arasul-App` (die rufende App); kein Geheimnis, kein `ARASUL_ABSCHLUSS_TOKEN`, kein freier Host, keine Weiterleitung, keine Shell. Eine Abweisung oder eine Antwort außer 2xx beendet einen Werkzeug-Schritt als Fehler mit dem Grund im Lauf (`Route abgewiesen: …`); die Antwort der App (höchstens 8000 Zeichen) ist die Ausgabe des Schritts.',
      ],
    },
    koepfe: {
      benutzer: KOPF_BENUTZER,
      rolle: KOPF_ROLLE,
      rollen: ['admin', 'mitarbeiter'],
      hinweis:
        'Traefik löscht beide aus der eingehenden Anfrage und setzt sie aus der Antwort der ' +
        'Anmeldung neu; sie sind nicht fälschbar. Der Wert steht als UTF-8 in der Kopfzeile: ' +
        "Buffer.from(kopf, 'latin1').toString('utf8').",
    },
    umgebung: {
      // DIE NAMEN IN IHRER ROLLE (Kontrakt 5). Bis Fassung 4 stand der Name im
      // Schluessel und die Erklaerung im Wert -- wer den Namen zu `basis`
      // suchte, fand nichts. Die Rolle ist das, was ein Kit kennt; der Name
      // ist das, was dieses Geraet daraus macht.
      basis: 'ARASUL_API_URL',
      schluessel: 'ARASUL_API_SCHLUESSEL',
      datenbank: 'ARASUL_DB_URL',
      abschluss_token: 'ARASUL_ABSCHLUSS_TOKEN',
      was: {
        ARASUL_API_URL: 'Die externe Schnittstelle im Docker-Netz, ohne Umweg über Traefik',
        ARASUL_API_SCHLUESSEL:
          'Der Schlüssel dieser App und dieses Standes, bei jedem Einspielen neu',
        ARASUL_DB_URL:
          'Die Datenbank dieser App und dieses Standes, als postgresql://…; nur mit `backend`',
        ARASUL_ABSCHLUSS_TOKEN:
          'Das Geheimnis, an dem die App den Aufruf ihrer Abschluss-Route als den des Geräts erkennt (`Authorization: Bearer`); nur mit `backend`, ändert sich nicht bei einem Update',
      },
      // Und was `basis` bereits ENTHAELT. Ohne diese zwei Zeilen haengt jeder
      // die Pfade aus `endpunkte` an die Adresse und ruft den Weg zweimal.
      praefix: PRAEFIX,
      basis_enthaelt_praefix: true,
      hinweis:
        'Alle setzt das Gerät in den Container, zusätzlich zu `backend.umgebung`. ' +
        '`basis` endet auf `praefix`: an sie gehört `endpunkte[].relativ`, nicht ' +
        '`endpunkte[].pfad`. `datenbank` fehlt bei einer App ohne `backend` -- ' +
        'sie hat keinen Container, in den sie ginge.',
    },
    paket: {
      format: 'tar.gz',
      packen: 'tar czf paket.tgz -C <ordner> .',
      wurzel: [
        'app.json',
        '<frontend.verzeichnis>/',
        '<backend.bauen.verzeichnis>/',
        '<flows.verzeichnis>/',
      ],
      max_archiv_bytes: appPaket.MAX_ARCHIV_BYTES,
      max_entpackt_bytes: appPaket.MAX_ENTPACKT_BYTES,
      max_eintraege: appPaket.MAX_EINTRAEGE,
      regeln: [
        'app.json liegt im Wurzelverzeichnis des Archivs, nicht in einem Ordner darüber.',
        'Nur Dateien und Ordner. Symlinks, Hardlinks und Gerätedateien weisen das Paket ab.',
        'Mit `backend` braucht das Paket `backend.bauen`: gebaut wird am Gerät, fertige Images nimmt dieser Weg nicht.',
        'Das Frontend ist fertig gebaut. Das Gerät liefert aus, es baut keine Seite.',
        'Ein Deploy rollt immer in den Teststand. Live schaltet ein Mensch.',
        'Neben `paket` nimmt der Deploy ein Textfeld `aenderungstext` (seit Kontrakt 8, freiwillig): ein paar Sätze, was in dieser Version neu ist, 1 bis 1000 Zeichen. Es gehört zum Ausrollen, nicht zur Version, und steht deshalb nicht im Manifest. Ein leeres oder zu langes Feld weist das Gerät mit 400 ab. Der Administrator sieht ihn am Teststand und beim Live-Schalten; er wandert mit der Fassung in den Livestand.',
        'Eine Version, die gerade live ist, wird nicht überschrieben: neue Fassung, neue Nummer.',
        'Mit `flows` im Manifest muss der Ordner da sein und wenigstens eine .md enthalten.',
        'Jede eingespielte App belegt einen Platz der Lizenz, Test- und Livestand zusammen. Ist das Kontingent voll, weist das Gerät das Paket einer NEUEN App ab (409), und zwar bevor es baut; eine neue Version einer App, die schon da ist, geht immer durch.',
      ],
    },
    apps: {
      basis: '/apps/<id>/',
      teststand: '/apps/<id>/test/',
      api: '/apps/<id>/api/',
      vergeben: VERGEBENE_PFADE,
      hinweis:
        'Ein Frontend ruft seine Schnittstelle RELATIV auf (fetch("api/hallo")). Ein absoluter ' +
        'Pfad zeigt im Teststand auf den Livestand.',
    },
    schluessel: {
      kopf: 'X-API-Key',
      praefix: 'aras_',
      bereiche: ALLE_ENDPUNKTE,
      vorgabe: VORGABE_ENDPUNKTE,
      hinweis:
        'Der Schlüssel des Kits trägt `app:deploy` und wird am Gerät angelegt ' +
        '(scripts/util/kit-schluessel.sh); ein Administrator kann ihn widerrufen.',
    },
    daten: {
      ort: 'datenbank',
      je_stand: true,
      ueberlebt: ['einspielen', 'schalten', 'neustart', 'sicherung'],
      ueberlebt_nicht: ['dateisystem_des_containers', 'anonyme_volumes', 'entfernen_der_app'],
      wiederherstellen: '/api/backup/wiederherstellung/app/:id',
      regeln: DATEN_REGELN,
    },
    netz: {
      name: 'arasul-apps',
      internet: false,
      erreichbar: ['datenbank', 'plattform_api', 'traefik'],
      forderung: 'verbindungen',
      regeln: NETZ_REGELN,
    },
    freigaben: {
      start: alsJsonSchema(ExternalFlowRunBody),
      regel: alsJsonSchema(FreigabeRegel),
      rollen: ['admin'],
      lauf: {
        feld: 'freigabe',
        weg: '/api/v1/external/flows/runs/:id',
        felder: [
          'einreicher',
          'ohne_einreicher',
          'entscheider',
          'kreis',
          'liegt_bei',
          'wo',
          'adresse',
          'offen',
          'satz',
        ],
      },
      regeln: FREIGABE_REGELN,
    },
    // Das Protokoll der Modellaufrufe (26.09.2026, J35). Additiv, die
    // Kontraktversion bleibt: eine App, die niemanden nennt, wird trotzdem
    // protokolliert -- nur ohne Menschen.
    protokoll: {
      wege: [
        'llm/chat',
        'document/analyze',
        'document/extract-structured',
        'v1/chat/completions',
        'v1/embeddings',
        'flows/:name/run',
      ],
      einreicher: {
        kopf: KOPF_BENUTZER,
        feld: 'einreicher',
        feld_openai: 'user',
      },
      regeln: PROTOKOLL_REGELN,
    },
    // Anfrage und Antwort des Auslesens, und wie ein Bild an ein Modell geht
    // (26.09.2026, J35). Additiv, die Kontraktversion bleibt -- aus demselben
    // Grund wie bei `protokoll`.
    auslesen: {
      weg: 'document/extract-structured',
      bereich: 'document:extract',
      anfrage: alsJsonSchema(ExtractStructuredFelder),
      antwort: alsJsonSchema(ExtractStructuredAntwort),
      fehlschlag: alsJsonSchema(ExtractStructuredFehlschlag),
      // Die Wartezeit ist um, das Modell rechnet noch (J35): 202, und der Weg
      // zum Ergebnis. Additiv, die Kontraktversion bleibt bei 6.
      laeuft: alsJsonSchema(ExtractStructuredLaeuft),
      abholen: 'document/extract-structured/:job_id',
      abgeholt: alsJsonSchema(ExtractStructuredAbgeholt),
      regeln: AUSLESEN_REGELN,
    },
    warten: {
      status: 202,
      wege: {
        'llm/chat': 'llm/job/:job_id',
        'document/analyze': 'llm/job/:job_id',
        'document/extract-structured': 'document/extract-structured/:job_id',
      },
      hoechstens_sekunden: 600,
      vorgabe_sekunden: 300,
      aufbewahrt_sekunden: 3600,
      regeln: WARTEN_REGELN,
    },
    bilder: {
      weg: 'llm/chat',
      bereich: 'llm:chat',
      feld: 'images',
      formate: ['png', 'jpeg'],
      max_anzahl: BILD_MAX_ANZAHL,
      max_zeichen: BILD_MAX_ZEICHEN,
      regeln: BILDER_REGELN,
    },
    // Additiv (J40): die Kontraktversion bleibt, eine App, die den Abschnitt
    // nicht liest, bekommt dieselbe Antwort wie vorher.
    last: {
      geraet: 'jetson-agx-orin-64',
      modell: 'qwen3.8:27b-q4_K_M',
      gleichzeitig_rechnend: 1,
      warteschlange_max: 20,
      antwort_sekunden: { typisch: 14, von: 12, bis: 18, token: 110 },
      zwoelf_personen: {
        uebliche_nutzung: { chat_p50_s: 16, chat_p95_s: 34, flow_p50_s: 15 },
        alle_zugleich: { p50_s: 87, p95_s: 169 },
      },
      regeln: LAST_REGELN,
    },
    // Kontrakt 9: die Bibliothek zur Laufzeit.
    marken: {
      adresse: '/marken/<haupt>/',
      verzeichnis: '/marken/marken.json',
      manifest: { laufzeit: '"marken": "<haupt>"', kopie: '"marken": "<fassung>"' },
      eingaenge: {
        'marken.js': 'Bausteine, Primitive, Muster, dazu h, rendern und die Hooks',
        'marken.css': 'Tokens beider Themes, Regeln der Bausteine, Klassen der Primitive',
        'diagramm.js': 'Chart, Sparkline, SERIENFARBEN',
        'react.js': 'react',
        'react-dom.js': 'react-dom',
        'react-dom-client.js': 'react-dom/client',
        'jsx-runtime.js': 'react/jsx-runtime',
      },
      theme: 'data-theme="dark" am <html> der App, gesetzt von der Shell; Hell ist kein Attribut',
      regeln: MARKEN_REGELN,
    },
    endpunkte: ENDPUNKTE,
  };
}

module.exports = {
  KONTRAKT_VERSION,
  PRAEFIX,
  MANIFEST_REGELN,
  DATEN_REGELN,
  NETZ_REGELN,
  LAST_REGELN,
  FREIGABE_REGELN,
  PROTOKOLL_REGELN,
  AUSLESEN_REGELN,
  BILDER_REGELN,
  MARKEN_REGELN,
  ENDPUNKTE,
  VERGEBENE_PFADE,
  kontrakt,
};
