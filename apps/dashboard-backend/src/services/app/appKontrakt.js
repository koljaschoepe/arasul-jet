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
  BILD_MAX_ANZAHL,
  BILD_MAX_ZEICHEN,
} = require('../../schemas/externalApi');
const { VORGABE_ENDPUNKTE, ALLE_ENDPUNKTE } = require('../../config/apiBereiche');
const { KOPF_BENUTZER, KOPF_ROLLE } = require('./appZugang');
const appPaket = require('./appPaket');
const appFlows = require('./appFlows');

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
const KONTRAKT_VERSION = 6;

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
  'Mit `backend` braucht es `ports.backend`, sonst weiss Traefik nicht, wohin.',
  '`ports` ohne `backend` ist ein Port, auf dem nichts lauscht.',
  'Die Kennung `test` ist vergeben: `/apps/<id>/test/` ist der Teststand jeder App.',
  '`id` und `version` muessen zum Ordner passen, in dem das Manifest liegt.',
  'Unbekannte Felder werden abgewiesen, nicht ignoriert.',
  '`modelle` ist eine Forderung, keine Lieferung: das Geraet installiert kein Modell nach, es sagt beim Einspielen, welches fehlt.',
  '`flows` ist umgekehrt eine LIEFERUNG (seit Kontrakt 2): das Paket bringt die Dateien mit, das Geraet registriert sie je App und Stand.',
  '`marken` nennt die Fassung des Designsystems, auf der die App steht (seit Kontrakt 4, freiwillig). Das Geraet vergleicht sie mit seiner eigenen und meldet in der App-Verwaltung eine, die aelter ist -- eine Kopie der Bibliothek veraltet lautlos.',
  '`agent` nennt die Routen, die diese App einem Agenten anbietet (seit Kontrakt 6, freiwillig). Eine Liste; je Eintrag `method`, `path`, `purpose`, `params` und `writes`, und nichts sonst.',
  '`agent[].path` ist RELATIV zur Schnittstelle der App (`/apps/<id>/api/`): ohne Anfrage, ohne `..`, ohne leeres Stueck, hoechstens 200 Zeichen. Ein fuehrender Schraegstrich wird abgeschnitten, nicht abgewiesen.',
  '`agent[].purpose` ist ein Satz in EINER Zeile, hoechstens 200 Zeichen.',
  '`agent[].params` ist eine Liste, leer wenn die Route keine nimmt -- nicht weggelassen. Je Eintrag `name` (einfache Kennung), `type` aus string, number, integer oder boolean, und `required`.',
  '`PUT`, `PATCH` und `DELETE` muessen `writes: true` tragen: eine Route, die etwas aendert, darf sich nicht als lesend ausgeben. Das CLI verlangt fuer `writes: true` ein ausdrueckliches --write.',
  'Innerhalb von `agent` steht keine Route zweimal (`method` und `path` zusammen) und kein Parametername zweimal je Route.',
  'AUSGELIEFERT wird das Feld von der APP, unter `GET agent` an ihrer Schnittstelle, samt `id`, `name` und Version. Das Geraet haelt keine zweite Kopie bereit: es nimmt das Feld an und gibt es nicht aus.',
  'Eine App mit `backend` bekommt je Stand eine eigene DATENBANK (seit Kontrakt 5). Sie steht im Manifest nicht: das Geraet legt sie an, nennt ihre Adresse in `umgebung.datenbank` und wirft sie mit der App wieder weg. Der Teststand hat seine eigene; ein Probelauf fasst die Daten des Livestandes nicht an. Was bleibt und was nicht, steht unter `daten`.',
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
  'Dauerhaft ist GENAU EIN Ort: die Datenbank aus `umgebung.datenbank`. Sie ueberlebt jedes Einspielen, jedes Schalten, jeden Neustart des Containers und des Geraets.',
  'Das Dateisystem des Containers ueberlebt das naechste Einspielen NICHT. Der Container wird dabei ersetzt, samt seiner anonymen Volumes -- auch derer aus `VOLUME` im Dockerfile. Eine SQLite-Datei oder ein Upload-Ordner darin ist nach dem Update weg. Eine hochgeladene Datei gehoert in eine Spalte (`bytea`).',
  'Test- und Livestand haben je eine eigene Datenbank. Schalten nach live nimmt die Daten des Teststandes NICHT mit; der Livestand behaelt seine eigenen ueber jeden Versionswechsel.',
  'Die Datenbank beginnt leer, und ihr Schema legt die App selbst an (beim Start `CREATE TABLE IF NOT EXISTS` oder eigene Migrationen). Die Rolle der App ist Eigentuemerin ihrer Datenbank und darf das; an eine andere Datenbank kommt sie nicht.',
  'Gesichert wird jede Nacht und auf Anforderung, je App und Stand ein Abzug. Zurueck kommen die Daten EINER App ueber `POST /api/backup/wiederherstellung/app/:id` (Administrator, `bestaetigung` ist die Kennung) -- auch nachdem die App entfernt wurde; das naechste Einspielen findet sie dann vor.',
  'Entfernen der App wirft ihre Datenbanken weg. Die Sicherungen davon bleiben liegen.',
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
  '`einreicher` ist der Benutzername des Menschen, der den Lauf ausloest -- der Wert aus `X-Arasul-User`. Er muss ein aktives Konto sein, dem die App freigegeben ist, sonst 400.',
  '`freigabe.ohne_einreicher: true` schliesst ihn vom Entscheiden aus (Vier-Augen-Prinzip). Er sieht die Anfrage nicht unter /api/freigabe-anfragen, und entscheidet er trotzdem, antwortet das Geraet 403. Braucht `einreicher`.',
  '`freigabe.entscheider` nennt ENTWEDER `{"rolle":"admin"}` ODER `{"konten":["name",…]}`. Nur diese Menschen sehen und entscheiden die Anfrage; jeder andere sieht sie nicht und bekommt beim Entscheiden 403. Jedes Konto muss die App freigegeben haben, sonst 400.',
  'Bleibt nach der Regel niemand, der entscheiden koennte, weist das Geraet den Start mit 400 ab -- statt eine Freigabe anzulegen, die in ihre Frist laeuft.',
  'Die Regel gilt fuer jede Freigabe dieses Laufs. `GET /freigaben` nennt je Anfrage `einreicher`, `ohne_einreicher` und `entscheider` (Rolle oder Konten).',
]);

/** Die Namen, die unter `/apps/<id>/` der Plattform gehoeren. */
const VERGEBENE_PFADE = Object.freeze([
  { pfad: 'test', wem: 'Der Teststand der App: /apps/<id>/test/' },
  { pfad: 'api', wem: 'Das Backend der App, ueber Traefik' },
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
  'Jeder Modellaufruf ueber diese Schnittstelle steht im Protokoll des Geraets: App, Stand, Mensch, Weg, Modell, Beginn, Dauer, Ausgang. Der Administrator liest es unter Einstellungen -> Apps.',
  'Ohne Inhalt: kein Dateiname, kein Text, kein Prompt, keine Antwort. Von der Antwort steht nur ihr sha256 da, dazu der Auftrag (`job_id`), den die Antwort der Route nennt -- wer einen Vorschlag aufbewahrt, kann ihn damit seinem Aufruf zuordnen.',
  'Fuer wen die App fragt, nennt sie mit der Kopfzeile X-Arasul-User (den Wert aus der Forward-Auth unveraendert weiterreichen) oder mit dem Feld `einreicher`; an `/v1` mit dem Feld `user`. Der Name muss ein aktives Konto sein, dem die App freigegeben ist, sonst 400 und kein Aufruf.',
  'Nennt die App niemanden, wird der Aufruf trotzdem protokolliert, ohne Menschen.',
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
  'Die Datei geht als multipart/form-data unter `file`, dazu die Felder aus `anfrage` (alles Zeichenketten). PDF, DOCX, Text und Bilder (PNG, JPEG, TIFF, BMP), hoechstens 50 MB.',
  'Das Geraet liest zuerst den TEXT der Datei (bei Fotos und Scans ueber seine Texterkennung) und gibt dem Modell diesen Text samt `schema`. Das Modell sieht kein Bild; wer das Bild selbst an ein Modell geben will, nimmt `llm/chat` mit `images` (siehe `bilder`).',
  '`data` ist ein Objekt oder null. Es ist NICHT gegen `schema` geprueft: ein Feld kann fehlen, einen anderen Typ haben oder dazukommen. Die App prueft die Felder selbst, bevor sie etwas daraus macht.',
  '`data` ist null, wenn die Antwort des Modells kein JSON-Objekt war; sie steht dann unveraendert in `raw_response`.',
  'Scheitert das Modell (Zeitgrenze, Fehler), antwortet das Geraet mit HTTP 500 in der Form von `fehlschlag` -- ohne den Fehler-Umschlag der uebrigen Fehler.',
  'Fehlt `file` oder `schema`, oder ist `schema` kein JSON, antwortet es mit 400 im Fehler-Umschlag (`error.code` VALIDATION_ERROR).',
  'Ein Vorschlag des Modells ist kein Beleg: `job_id` ordnet ihn seinem Eintrag im Protokoll des Geraets zu (siehe `protokoll`).',
]);

/**
 * Ein Bild an ein Bildmodell (J35, 26.09.2026). Siehe `services/llm/bildmodell.js`.
 */
const BILDER_REGELN = Object.freeze([
  '`POST llm/chat` nimmt `images`: eine Liste von Bildern als Base64, PNG oder JPEG. Der Vorsatz einer data:-URL (`data:image/png;base64,`) darf davorstehen, das Geraet schneidet ihn ab.',
  `Hoechstens ${BILD_MAX_ANZAHL} Bilder je Aufruf, je Bild hoechstens ${BILD_MAX_ZEICHEN} Zeichen Base64; der ganze Koerper hoechstens 10 MB.`,
  'Ohne `model` nimmt das Geraet sein Bildmodell (zuerst das der Aufgabe `vision`, in der Kurzliste `llava-phi3`). Gibt es keines, antwortet es mit 503.',
  'Mit `model` muss es ein Modell sein, das Bilder liest; ein Textmodell weist das Geraet mit 400 ab und nennt die Bildmodelle, die es hat. Das Bild wird nie still weggelassen und nie gegen eine Beschreibung getauscht.',
  '`GET models` nennt je Modell `supports_vision_input`.',
  'Das Bildmodell ohne `model` ist das der Aufgabe `vision`, und das ist nicht unbedingt das, das ein Dokument am besten liest. Wer Felder aus einem Foto lesen laesst, nennt `model` ausdruecklich und misst am Geraet des Kunden; `document/extract-structured` (Texterkennung, dann Textmodell) ist der zweite Weg zum Vergleich.',
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
      was: 'Ein Paket einspielen; rollt IMMER in den Teststand',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/apps/:id/schalten',
      bereich: 'app:deploy',
      was: 'Livestand schalten: `{"ziel":"live"}` oder `{"ziel":"zurueck"}`',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/apps/:id',
      bereich: 'app:deploy',
      was: 'Was das Geraet ueber diese App weiss, beide Staende',
    },
    {
      verb: 'DELETE',
      pfad: '/api/v1/external/apps/:id?bestaetigung=<id>&dateien=<true|false>',
      bereich: 'app:deploy',
      was: 'App weg: beide Container samt Volumes, beide Staende, alle Freigaben, ihre Datenbanken (die Sicherungen davon bleiben)',
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
      was: 'Stand eines Auftrags',
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
      was: 'Welche Modelle am Geraet sind',
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
      was: 'Felder nach einem Schema aus einer Datei lesen (Anfrage und Antwort unter `auslesen`)',
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
      was: 'Welche Flows dieser Schluessel starten darf. Mit dem Schluessel einer App: NUR ihre eigenen, im Stand ihres Containers',
    },
    {
      verb: 'POST',
      pfad: '/api/v1/external/flows/:name/run',
      bereich: 'flow:run',
      was: 'Einen Flow anstossen. Gesucht wird im Namensraum des Schluessels. Optional `einreicher` und `freigabe` (siehe `freigaben`)',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/flows/runs/:id',
      bereich: 'flow:run',
      was: 'Der Lauf eines Flows, mit seinen Schritten (`schritte`: position, art, name, status, modell, eingabe, ausgabe, Zeiten). `steps_used` ist ihre Anzahl, nicht die Kette',
    },
    {
      verb: 'GET',
      pfad: '/api/v1/external/freigaben?lauf=<id>',
      bereich: 'flow:run',
      was: 'Die Freigaben dieser App nachlesen, samt `zusammenhang` -- dem Text, an dem entschieden wurde. Nur lesen: entschieden wird ueber die Sitzung eines Menschen',
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
        'Das Standardmodell steht im Kopf (`modell:`). Der Administrator am Geraet darf es je Flow ueberschreiben; seine Ueberschreibung liegt in der Datenbank und ueberlebt ein App-Update.',
        '`ordner` ist fuer einen Flow aus einem Paket nicht erlaubt: die Datei-Werkzeuge brauchen einen abgeschirmten Datenordner je App, und den gibt es nicht. Der Speicher einer App ist ihre DATENBANK (`umgebung.datenbank`, seit Kontrakt 5), und die erreicht die App selbst -- nicht ein Flow, der im Backend des Geraets laeuft.',
        `Hoechstens ${appFlows.MAX_FLOWS} Flows je Paket.`,
        'Der Namensraum ist die App: zwei Apps duerfen denselben Flow-Namen tragen.',
        'Das Werkzeug `freigabe_anfordern` haelt den Lauf an, bis ein Mensch bestaetigt (Status `wartend`). Ablehnung beendet ihn als `abgebrochen`, Fristablauf als `abgelaufen`.',
        'Entscheiden darf, wem die App freigegeben ist. Die Flow-Datei nennt dafuer keine Person und keine Rolle; den Kreis enger ziehen kann die APP beim Start des Laufs (`freigaben`, seit 25.09.2026).',
        'Die Frist steht als `frist_minuten` in den `parameter` des Schritts; ohne Angabe gilt die Vorgabe des Geraets.',
      ],
    },
    koepfe: {
      benutzer: KOPF_BENUTZER,
      rolle: KOPF_ROLLE,
      rollen: ['admin', 'mitarbeiter'],
      hinweis:
        'Traefik loescht beide aus der eingehenden Anfrage und setzt sie aus der Antwort der ' +
        'Anmeldung neu; sie sind nicht faelschbar. Der Wert steht als UTF-8 in der Kopfzeile: ' +
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
      was: {
        ARASUL_API_URL: 'Die externe Schnittstelle im Docker-Netz, ohne Umweg ueber Traefik',
        ARASUL_API_SCHLUESSEL:
          'Der Schluessel dieser App und dieses Standes, bei jedem Einspielen neu',
        ARASUL_DB_URL:
          'Die Datenbank dieser App und dieses Standes, als postgresql://…; nur mit `backend`',
      },
      // Und was `basis` bereits ENTHAELT. Ohne diese zwei Zeilen haengt jeder
      // die Pfade aus `endpunkte` an die Adresse und ruft den Weg zweimal.
      praefix: PRAEFIX,
      basis_enthaelt_praefix: true,
      hinweis:
        'Alle drei setzt das Geraet in den Container, zusaetzlich zu `backend.umgebung`. ' +
        '`basis` endet auf `praefix`: an sie gehoert `endpunkte[].relativ`, nicht ' +
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
        'app.json liegt im Wurzelverzeichnis des Archivs, nicht in einem Ordner darueber.',
        'Nur Dateien und Ordner. Symlinks, Hardlinks und Geraetedateien weisen das Paket ab.',
        'Mit `backend` braucht das Paket `backend.bauen`: gebaut wird am Geraet, fertige Images nimmt dieser Weg nicht.',
        'Das Frontend ist fertig gebaut. Das Geraet liefert aus, es baut keine Seite.',
        'Ein Deploy rollt immer in den Teststand. Live schaltet ein Mensch.',
        'Eine Version, die gerade live ist, wird nicht ueberschrieben: neue Fassung, neue Nummer.',
        'Mit `flows` im Manifest muss der Ordner da sein und wenigstens eine .md enthalten.',
        'Jede eingespielte App belegt einen Platz der Lizenz, Test- und Livestand zusammen. Ist das Kontingent voll, weist das Geraet das Paket einer NEUEN App ab (409), und zwar bevor es baut; eine neue Version einer App, die schon da ist, geht immer durch.',
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
        'Der Schluessel des Kits traegt `app:deploy` und wird am Geraet angelegt ' +
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
    freigaben: {
      start: alsJsonSchema(ExternalFlowRunBody),
      regel: alsJsonSchema(FreigabeRegel),
      rollen: ['admin'],
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
      regeln: AUSLESEN_REGELN,
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
    endpunkte: ENDPUNKTE,
  };
}

module.exports = {
  KONTRAKT_VERSION,
  PRAEFIX,
  MANIFEST_REGELN,
  DATEN_REGELN,
  FREIGABE_REGELN,
  PROTOKOLL_REGELN,
  AUSLESEN_REGELN,
  BILDER_REGELN,
  ENDPUNKTE,
  VERGEBENE_PFADE,
  kontrakt,
};
