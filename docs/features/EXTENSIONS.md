# Erweiterungs-Baukasten

Arasul ist offen: eigene **Apps**, **n8n-Flows** und **Werkzeug-Konnektoren**
lassen sich lokal bauen, paketieren, herunterladen, weitergeben und wieder
installieren — ohne Cloud, ohne fremden Marktplatz (Plan 012 Phase E).

## Das mentale Modell

```
Erweiterungs-Werkstatt (Sandbox)  →  Paket  →  Register  →  Erweiterungen-Ansicht
   ANLEITUNG.md + Beispiele          .tar.gz    Tabelle       Karte mit An/Aus
   /erweiterung · /execute                      extensions
```

1. **Werkstatt anlegen** — beim Anlegen einer Sandbox den Typ
   _Erweiterungs-Werkstatt_ wählen. Der Ordner ist dann schon mit `ANLEITUNG.md`
   und drei Beispiel-Erweiterungen bestückt.
2. **Bauen** — im Chat `/erweiterung` aufrufen (legt das Gerüst an bzw. baut es
   weiter) und `/execute` (führt die Erweiterung aus und prüft sie).
   Alternativ von Hand oder mit einem externen Agenten im Terminal.
3. **Registrieren — automatisch** — der Werkstatt-Watcher (s. u.) übernimmt
   jeden Ordner mit gültiger `manifest.json` von selbst ins Register; die Karte
   erscheint direkt in der Erweiterungen-Ansicht, Aktivieren bleibt EIN Klick.
   Manuell geht es weiterhin: Erweiterungen-Ansicht → „Eigene Erweiterung
   bauen" → _Aus Werkstatt paketieren_, oder die **Werkstatt-Leiste** (s. u.).
4. **Verteilen** — _Herunterladen_ liefert ein `.tar.gz`; auf einem anderen Gerät
   im selben Dialog _Paket importieren_.
5. **Weiterbauen** — _Forken_ legt eine neue Werkstatt-Sandbox mit einer Kopie an.

## Vom leeren Ordner zum Tab (Plan 023 H2)

In der Werkstatt liegt ein Befehl im PATH:

```bash
erweiterung neu meine-app --name "Meine App"
erweiterung pruefen meine-app
```

Der erste legt das Gerüst mit fertigem Manifest an, der zweite prüft es, bevor
der Watcher es still ablehnt. Beide drucken danach dieselbe Kette:

1. Der Werkstatt-Watcher sieht den Ordner (spätestens nach
   `EXTENSIONS_WATCH_INTERVAL_MS`) und registriert die Erweiterung.
2. Sie erscheint im Katalog, **ausgeschaltet**. Nichts geht ungefragt live.
3. Einschalten, deklarierte Fähigkeiten dabei einmal freigeben.
4. Danach steht sie links in der Leiste, ein Klick öffnet ihren Tab.

Dieser vierte Satz ist der Grund für den Befehl. Ohne ihn wartet jemand, der
gerade einen Ordner angelegt hat, auf einen Knopf, den es nicht gibt.

**Die doppelte Prüfung ist Absicht, aber bewacht.** Die Wahrheit über ein
gültiges Manifest steht im Backend (`extensionPackage.validiereManifest`); die
Werkstatt kommt dort nicht heran und spiegelt die Regeln. Damit die beiden nicht
auseinanderlaufen, vergleicht `scripts/test/geruest-regeln.py` sie bei jedem
Testlauf: Fähigkeitenliste, Typen, und das Id-Muster über sein Verhalten an den
Rändern statt über seinen Text.

Dieser Wächter hat einen konkreten Anlass. Am 22.08.2026 bekamen drei neue
Fähigkeiten ihre Routen, ihre Dienste und ihre Tests, standen aber nicht in
`BRUECKE_FAEHIGKEITEN`. Alle Tests waren grün, und deklarieren konnte sie
niemand.

## Automatisch live — der Werkstatt-Watcher

Seit der Interview-Entscheidung vom 2026-07-29 gilt: **die Plattform erkennt
Werkstatt-Erweiterungen von selbst.** Ein Watcher im Backend
(`services/extensions/werkstattWatcher.js`, Takt `EXTENSIONS_WATCH_INTERVAL_MS`,
Standard 15 s) scannt die Ordner aller Erweiterungs-Werkstätten — die Wurzel und
jeden direkten Unterordner:

- **Neue** Ordner mit gültiger `manifest.json` werden sofort registriert und
  erscheinen als Karte in der Erweiterungen-Ansicht (deaktiviert — Aktivieren
  bleibt eine bewusste Entscheidung, EIN Klick).
- **Geänderte** Manifeste/Assets (erkannt über Größe/mtime des Ordnerbaums)
  aktualisieren das Paket im Register; `enabled` bleibt dabei unverändert —
  eine aktivierte Erweiterung bleibt aktiviert, eine deaktivierte deaktiviert.
- **Fehlerhafte** Manifeste werden einmal im Log gemeldet (WARN) und dann in
  Ruhe gelassen, bis sich der Ordner ändert. Der Grund wird zusätzlich gemerkt
  und über `GET /api/extensions/werkstatt/status` ausgeliefert — die
  Werkstatt-Leiste zeigt „N Ordner abgelehnt" mit Grund-Tooltip, damit eine
  kaputte `manifest.json` nicht mehr still verschluckt wird.
- Neben den echten Werkstätten scannt der Watcher **immer** den kanonischen
  Ordner `<SANDBOX_DATA_DIR>/werkstatt` — dorthin bauen die beiden Chat-Bau-Flows
  (`/erweiterung`, `/execute`, `flow.ordner` ist fest). So wird auch das per Flow
  Gebaute registriert, ohne dass eine eigene Werkstatt-Sandbox nötig ist.
- Der Watcher **deinstalliert nie**: verschwindet ein Werkstatt-Ordner, bleibt
  die registrierte Erweiterung bestehen (Entfernen bleibt Handarbeit).

Die Oberfläche lädt die Erweiterungs-Liste alle 20 s nach — neue Karten und
Seitenleisten-Einträge erscheinen ohne Reload.

## Werkstatt-Panel — Erweiterungen verwalten (Plan 017 Schritt 7)

Werkstatt-Sandboxes zeigen über dem Terminal ein auf-/zuklappbares **Panel**
(löst die alte „Werkstatt-Leiste" mit Freitext-Ordnerfeld + Rocket-Button ab).
Datenquelle ist das Werkstatt-Inventar
(`GET /api/extensions/werkstatt/inventar?projekt=<slug>`): jede erkannte
Erweiterung mit ruhigem Status-Punkt — **● live · ○ bereit · ○ erkannt ·
▲ abgelehnt** (mit Grund, z. B. kaputte `manifest.json`). Pro Zeile:
**Live schalten · Zurücknehmen · Rollback · Öffnen · Herunterladen** (lucide
Blocks/Package, kein Rocket/Hammer).

**Freigabe-Dialog:** Schaltet man eine Erweiterung mit deklarierten
Brücken-Fähigkeiten live, erscheint einmalig „Diese Erweiterung darf: …" —
erst nach Bestätigung erhält sie die freigegebenen Fähigkeiten. Ohne Freigabe
antwortet jeder Brücken-Aufruf mit `403`.

**Rollback (ein Schritt zurück):** Jedes Überschreiben (Bauen, Import,
Watcher-Update) sichert vorher den aktuellen Stand als genau einen
Rollback-Punkt (`EXTENSIONS_DIR/.rollback/<id>.tar.gz`).
`POST /api/extensions/:id/rollback` stellt ihn wieder her — bei Flow-
Erweiterungen inkl. n8n-Reimport.

## KI-Brücke — Erweiterungen nutzen die lokale Basis (Plan 017 Schritt 2/3)

Eine live geschaltete App läuft weiter im abgeriegelten iframe (opaker Origin,
keine Cookies/fremden APIs). Über die **KI-Brücke** kann sie kontrolliert LLM,
RAG, einen eigenen Datentopf und n8n-Flows nutzen:

- Das Manifest deklariert `faehigkeiten` (`llm`, `rag`, `dateien`, `flows`,
  `netz`, `tabellen`, `zeitplan`); der Admin gibt sie beim Live-Schalten frei
  (wirksam = deklariert ∩ freigegeben).
- Das Dashboard reicht der App per postMessage einen **kurzlebigen, pro
  Erweiterung gescopten Token**; damit ruft sie
  `/api/extensions/:id/bruecke/{llm,rag,dateien,flows,netz,tabellen,zeitplan}`
  auf. Das Backend prüft Token + Erweiterung + Fähigkeit bei **jedem** Aufruf.
- Ein Env-Flag `EXTENSIONS_BRUECKE_ENABLED=false` schaltet die Brücke geräteweit
  ab. Client-SDK: `arasul-bruecke.js` (in den Dev-Vorlagen).

Die Fähigkeit `rag` nimmt seit dem 23.08.2026 ein `dateiname`-Feld: dann kommt
der indexierte Text genau dieser Datei zurück, auch aus PDF oder DOCX. Das ist
derselbe Weg, den das Flow-Werkzeug `rag_suche` seit Plan 021, Schritt 8 geht.
Ohne Dateinamen bräuchte es die Vektorsuche, und die läuft auf einem
gewöhnlichen Gerät nicht — der Aufruf sagt das dann und nennt den Weg. Vorher
lief er unbedingt in Qdrant und war damit für jede Erweiterung tot, obwohl auf
dem Orin 2171 Dokumente mit 37 487 Abschnitten im Textlayer liegen.

`arasul-bruecke.js` ist **unsere** Datei, kein Nutzerinhalt. Sie zieht deshalb
als einzige in einer bestehenden Werkstatt nach, wenn sich die ausgelieferte
Fassung ändert (beim Start des Backends und beim nächsten Flow in diesem
Ordner); alles andere in der Werkstatt bleibt unangetastet. Wer eigene
Änderungen braucht, legt eine eigene Datei an.

Das ist kein Beiwerk: die Vorlagen wurden bis zum 23.08.2026 nur **einmal**
ausgesät und nie überschrieben. Als H1 der Brücke `netz`, `tabellen` und
`zeitplan` gab, kannte die Client-Datei jeder bestehenden Werkstatt diese drei
nicht — und weil ein gebautes Paket seine Kopie in sich trägt, wäre der Fehler
in jede dort gebaute App mitgewandert. Ein Test hält Routen und Client-Datei
jetzt zusammen.

- Flow-Erweiterungen werden beim Live-Schalten per n8n-API importiert +
  aktiviert (`GET /api/extensions/:id/flow-status` zeigt aktiv/letzter Lauf);
  fehlt `N8N_API_KEY` oder ist n8n aus, degradiert das sichtbar.

## Agenten-Paket in der Werkstatt (Plan 017 Schritt 9)

Jede Erweiterungs-Werkstatt wird mit einem minimalen Agenten-Paket bestückt:
`/plan`, `/execute`, `/info` als Claude-Code-Commands (`.claude/commands/`) plus
`AGENTS.md` für Codex, dazu geräteneutrale Kontextdateien unter `kontext/`
(Brücke, Verbindungen, Paketformat). Ablauf: `/plan` (Interview → `PLAN.html`) →
`/execute` (baut) → im Werkstatt-Panel live schalten.

## Das Paketformat

Ein Paket ist ein Ordner mit einer `manifest.json` im Wurzelverzeichnis:

```json
{
  "id": "meine-erweiterung",
  "name": "Meine Erweiterung",
  "description": "Ein Satz, was sie tut.",
  "type": "app",
  "accessTier": "internet",
  "version": "0.1.0",
  "arasulExtensionVersion": 1,
  "entry": "index.html"
}
```

| Feld                     | Pflicht | Werte                                                   |
| ------------------------ | ------- | ------------------------------------------------------- |
| `id`                     | ja      | Kleinbuchstaben/Ziffern/Bindestriche, 2–50 Zeichen      |
| `name`                   | ja      | max. 100 Zeichen                                        |
| `type`                   | ja      | `app` · `flow` · `tool`                                 |
| `accessTier`             | nein    | `internet` (Standard) · `internal` · `full`             |
| `version`                | nein    | Standard `0.1.0`                                        |
| `entry`                  | ja      | relative Startdatei im Paket (kein `..`, nicht absolut) |
| `arasulExtensionVersion` | nein    | aktuell `1`                                             |

Die Startdatei je Typ: `app` → HTML-Seite, `flow` → `workflow.json`,
`tool` → ausführbares Skript (liest stdin, schreibt JSON auf stdout).

## App-Erweiterung „in der Mitte" öffnen

Eine aktivierte `app`-Erweiterung läuft direkt in der Arbeitsfläche — wie n8n.
Auf ihrer Detailseite (Erweiterungen → Karte anklicken) erscheint **„Öffnen"**;
das lädt ihre Startdatei als eigenen Mitte-Tab in einem **Sandbox-iframe**.
Technisch liefert `GET /api/extensions/:id/app/t/:token/…` die Paket-Dateien;
die `Content-Security-Policy: sandbox`-Antwort plus das iframe-`sandbox`-Attribut
geben dem Nutzer-HTML einen eigenen, opaken Origin — seine Skripte laufen,
kommen aber nicht an das Dashboard, seine Cookies oder die API. Eine `app` ist
deshalb bewusst eine **selbst-enthaltene** `index.html` (Assets im Paket, keine
externen Skripte). Deaktivierte Erweiterungen lassen sich nicht öffnen.

Der Token im Pfad ersetzt das Cookie, und zwar notgedrungen (23.08.2026): weil
der Rahmen einen opaken Origin hat, gilt jede Unteranfrage daraus als
cross-site, und `arasul_session` ist `SameSite=Strict`. Bis dahin konnte
**keine Unterdatei** einer App nachladen — kein Stylesheet, kein Bild und auch
nicht `arasul-bruecke.js`, die Client-Datei der KI-Brücke. Nur die Startdatei
kam an. Die angemeldete Seite holt den Token und hängt ihn an die Adresse des
Rahmens; relative Verweise im App-HTML erben ihn von selbst. Er gilt 15 Minuten
und öffnet nur die Dateien dieser einen Erweiterung.

Gemessen wird das mit `scripts/test/erweiterung-abnahme.mjs`: es öffnet die
Beispiel-App auf dem Gerät und prüft den Text, den nur eine **antwortende**
Brücke erzeugt. Ein Blick auf den Tab hätte grün gesagt, die App zeichnet ihre
Oberfläche ja auch ohne Brücke.

## Zugriffs-Stufen

Dieselben drei Stufen wie bei einer Sandbox — wähle immer die niedrigste, die
reicht:

| Stufe      | UI-Bezeichnung               | Bedeutung                                       |
| ---------- | ---------------------------- | ----------------------------------------------- |
| `internet` | Nur Internet                 | Kein Zugriff auf Datenbank, Speicher oder RAG   |
| `internal` | Interne Dienste              | Zusätzlich LLM, Qdrant, Datenbank, Speicher     |
| `full`     | Voller Systemzugriff (Admin) | Plattform-Repo (rw) + Docker-Socket — nur Admin |

## Sicherheit beim Import

Einem hochgeladenen Archiv wird **nichts** geglaubt. Abgewiesen werden:
Symlinks, Hardlinks, Gerätedateien, absolute Pfade und jeder `..`-Ausbruch.
Obergrenzen: 2000 Einträge, 64 MB entpackt, 64 KB Manifest. Was die Prüfung
nicht besteht, wird verworfen — nicht „bereinigt"; ein bereits teilweise
entpacktes Verzeichnis wird gelöscht.

Auch beim Paketieren gilt: der gewählte Unterordner muss **innerhalb** der
Sandbox liegen. Eine frisch installierte Erweiterung ist zunächst
**deaktiviert** und muss bewusst eingeschaltet werden — das gilt auch für
alles, was der Werkstatt-Watcher automatisch registriert.

## Ausgehende Aufrufe (Fähigkeit `netz`, Plan 023 H1)

Eine Erweiterung, die DATEV oder Lexware erreichen soll, deklariert ihre Ziele
im Manifest:

```json
{
  "faehigkeiten": ["netz"],
  "netz": { "ziele": ["https://api.datev.de/v1/"] }
}
```

Aufgerufen wird über `POST /api/extensions/:id/bruecke/netz` mit
`{ url, methode, kopf, rumpf }`. Durchgesetzt wird im Backend, nicht in der
Anwendung. Drei Wände, in dieser Reihenfolge:

1. **Fähigkeit.** `netz` muss deklariert **und** freigegeben sein. Die Freigabe
   passiert beim Aktivieren, sichtbar, einmal.
2. **Ziel.** Die Adresse muss in `netz.ziele` stehen. Der Pfad zählt als
   Präfix: `https://api.datev.de/v1/` erlaubt `/v1/belege`, nicht `/admin`. Ein
   anderer Rechner oder ein anderer Port ist ein anderes Ziel.
3. **Adresse.** Der Name wird aufgelöst, und **jede** zurückgegebene Adresse
   muss außerhalb des eigenen Netzes liegen. Ohne diese Wand wäre die zweite
   eine Empfehlung: ein Name im Manifest kann auf `127.0.0.1` oder
   `172.17.0.1` zeigen, absichtlich oder weil jemand den DNS-Eintrag geändert
   hat, nachdem die Erweiterung installiert war.

Weitere Festlegungen:

|                                                  |                                                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nur `https`                                      | Ein Kundengeheimnis geht nicht im Klartext ins Netz                                                                                                                                           |
| Keine Umleitungen                                | Eine Umleitung ist eine zweite Adresse, die niemand geprüft hat. Die Erweiterung bekommt Status und `location` zurück und kann selbst entscheiden; dann läuft es wieder durch alle drei Wände |
| `host`, `cookie`, `content-length`, `connection` | Setzt die Erweiterung nicht. Ein selbst gesetzter `cookie` wäre der Weg, fremde Sitzungen mitzuschicken                                                                                       |
| Zeitlimit und Größe                              | `EXTENSIONS_NETZ_TIMEOUT_MS`, `EXTENSIONS_NETZ_MAX_ANTWORT`                                                                                                                                   |

Jeder Aufruf steht im Protokoll mit Erweiterung, Methode, Ziel, Status und der
Adresse, mit der wirklich verbunden wurde.

## Eigene Tabellen (Fähigkeit `tabellen`, Plan 023 H1)

Eine Erweiterung darf Zustand ablegen, aber nicht neben den Kundendaten. Jede
bekommt deshalb ein eigenes Postgres-Schema `ext_<slug>`.

**Die Erweiterung schickt niemals SQL.** Sie sagt, was sie will:

```js
await bruecke('tabellen', {
  aktion: 'anlegen',
  name: 'belege',
  spalten: [
    { name: 'nummer', typ: 'text' },
    { name: 'betrag', typ: 'zahl' },
  ],
});
await bruecke('tabellen', {
  aktion: 'schreiben',
  name: 'belege',
  werte: { nummer: 'R-2026-001', betrag: 119.0 },
});
await bruecke('tabellen', { aktion: 'lesen', name: 'belege', wo: { nummer: 'R-2026-001' } });
```

Das SQL entsteht im Backend aus geprüften Bezeichnern und gebundenen Werten.
Eine Brücke, die SQL durchreicht, wäre keine Brücke, sondern ein
Datenbankzugang mit Extraschritten: die erste Erweiterung mit einem Tippfehler
im Escaping läse `admin_users`.

| Aktion      |                                                                            |
| ----------- | -------------------------------------------------------------------------- |
| `liste`     | welche Tabellen gehören dieser Erweiterung                                 |
| `anlegen`   | Tabelle mit deklarierten Spalten; `id` und `angelegt_am` kommen immer dazu |
| `schreiben` | eine Zeile; Werte werden gebunden                                          |
| `lesen`     | Gleichheitsfilter auf bekannten Spalten, neueste zuerst                    |
| `loeschen`  | mit Filter, oder ausdrücklich `alles: true`                                |

Erlaubte Spaltentypen: `text`, `zahl`, `ganzzahl`, `wahrheit`, `zeitpunkt`,
`json`. Bewusst kurz; was fehlt, lässt sich als `text` ablegen.

**Kein freies WHERE.** Gleichheit auf bekannten Spalten reicht für den Zustand
einer Anwendung, und alles darüber wäre wieder ein Weg, SQL hereinzureichen.

**Ungültige Namen werden abgewiesen, nicht bereinigt.** Wer eine Tabelle
`a"; DROP TABLE admin_users; --` nennen will, bekommt einen Fehler. Sie
stillschweigend umzubenennen wäre schlimmer: die Erweiterung fände ihre eigene
Tabelle nie wieder.

Grenzen: 25 Tabellen und 60 Spalten je Erweiterung, 500 Zeilen je Leseaufruf.
Beim Deinstallieren wird das Schema samt Inhalt entfernt.

## Nächtliche Läufe (Fähigkeit `zeitplan`, Plan 023 H1)

```js
await bruecke('zeitplan', {
  aktion: 'anlegen',
  flow: 'abgleich',
  uhrzeit: '03:00',
  args: { quelle: 'datev' },
});
```

**Was läuft, ist ein Flow.** Nicht Code der Erweiterung: die läuft im Browser,
in einem iframe, und nachts ist kein Browser offen. Ein Flow ist Arasuls eigene,
prüfbare Ausführungsebene mit einem Werkzeugsatz, der schon abgesichert ist.
Eine zweite Ausführungsumgebung für Erweiterungen wäre eine zweite
Angriffsfläche für denselben Zweck.

**Kein Cron-Ausdruck**, sondern `HH:MM` in Gerätezeit. Der frühere Cron-Parser
für Flow-Zeitpläne ist am 28.07.2026 ersatzlos entfernt worden; ihn für „einmal
nachts" zurückzuholen hieße, eine Fehlerquelle für einen Nutzen einzukaufen, den
niemand belegt hat.

Wer einen anderen Takt braucht, baut eine **Flow-Erweiterung**: die wird als
n8n-Workflow ausgerollt und aktiviert (`flowDeployService.liveSchalten`), und
n8ns Schedule-Trigger kann jeden Takt. Dieser Weg existiert seit Plan 017 und
war die Antwort auf „zeitgesteuert" schon vor H1 — nur eben nicht für
App-Erweiterungen im iframe.

Zwei Eigenschaften, an denen so etwas sonst scheitert:

|                       |                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Läuft nicht zu oft    | Der letzte Lauf wird je Zeitplan festgehalten und tagesgenau verglichen. Der Takt schaut jede Minute nach; ohne diesen Vergleich liefe der Flow im Nachholfenster elfmal |
| Läuft nicht gar nicht | Ein Nachholfenster von `EXTENSIONS_ZEITPLAN_NACHHOLEN_MIN` Minuten. Ein Gerät, das um 03:00 gerade neu startet, hätte sonst genau diesen einen Lauf verloren             |

Der Lauf wird **vor** dem Start vermerkt, nicht danach: sonst würde ein Flow,
der eine Minute läuft, im nächsten Takt ein zweites Mal gestartet. Ein
gescheiterter Lauf steht mit seinem Grund in `letzter_fehler`.

Grenzen: 10 Zeitpläne je Erweiterung. Wird die Erweiterung deaktiviert oder
entfernt, laufen ihre Zeitpläne nicht mehr.

## Ablageorte

| Was                | Pfad (Container)                      | Bind-Mount               |
| ------------------ | ------------------------------------- | ------------------------ |
| Pakete (Register)  | `/arasul/extensions`                  | `data/extensions`        |
| Werkstatt-Vorlagen | `/arasul/sandbox-build/dev-templates` | `services/sandbox/` (ro) |
| Sandbox-Ordner     | `/arasul/sandbox/projects/<slug>`     | `data/sandbox/projects`  |

## Grenzen (Stand „Automatisch live", 2026-07-29)

- Eine **aktivierte** `app`-Erweiterung hat einen eigenen Eintrag in der
  Activity-Bar (Puzzle-Icon, Klick öffnet ihren Mitte-Tab über den generischen
  Tab-Typ `extension`) — die frühere Lücke ist geschlossen. Deaktivierte sowie
  `flow`/`tool`-Pakete erscheinen dort nicht.
- Die Zugriffs-Stufe ist im Manifest deklariert und wird angezeigt; sie steuert
  heute die Sandbox, in der gebaut wird, noch nicht eine eigene Laufzeit pro
  Erweiterung.

## Ein fremdes Projekt zur Erweiterung machen (Plan 023 H4)

n8n ist der erste Fall und damit die Vorlage. Der Weg hat vier Schritte, und
der vierte ist der, den alle vergessen.

**1. Erreichbar machen, same-origin.** Traefik routet `/n8n` auf dieselbe
Herkunft wie das Dashboard (`config/traefik/`). Das ist keine Bequemlichkeit,
sondern die Voraussetzung für Schritt 4: nur ein same-origin-Rahmen lässt sich
von außen anfassen. Ein fremdes Projekt auf einer eigenen Domain bleibt eine
Blackbox.

**2. Die Anmeldung übernehmen.** Der Kunde meldet sich EINMAL an, bei Arasul.
`GET /api/automations/session` meldet den festen Besitzer bei n8n an und reicht
dessen Sitzungs-Cookie durch. n8ns eigene Anmeldung erscheint nie
(`AutomationenTab.tsx`).

**3. Auf den Kaltstart einstellen.** Ein fremder Dienst braucht nach einem
Geräte-Neustart länger als die Oberfläche. Wer beim ersten Fehlversuch aufgibt,
liefert ein Gerät aus, an dem die Erweiterung nach jedem Stromausfall „kaputt"
aussieht. Der Tab probiert acht Mal mit wachsendem Abstand, zusammen rund 48
Sekunden.

**4. Das Design angleichen.** Ein fremdes Projekt bringt sein eigenes Design
mit, und zwar immer. Bei n8n war das hell und orange in einer schwarzen, blauen
Oberfläche — im Rundgang der auffälligste Bruch überhaupt.

Zwei Hebel reichen fast immer, und beide werden **aus der laufenden Fassung
gelesen**, nicht aus der Dokumentation des Projekts:

|             | bei n8n 2.29.10, gelesen am 22.08.2026               |
| ----------- | ---------------------------------------------------- |
| Akzentfarbe | `--color--primary--h/s/l` auf `:root`, in HSL-Teilen |
| Hell/Dunkel | `body[data-theme]`, gemerkt unter `N8N_THEME`        |

Dazu kommt, was NICHT am Akzent hängt: n8n hat eine eigene Orange-Leiter
(`--color--orange-50` bis `-950`), die stehen bliebe. Ersetzt wird nur der
Farbton, die Helligkeit jeder Stufe bleibt — sonst kippen die Kontraste, die
das fremde Projekt damit baut.

Die Arasul-Farbe wird zur Laufzeit aus dem eigenen Dokument gelesen
(`--primary`), nicht als Zahl hinterlegt: Arasul hat je Thema eine andere, und
eine zweite Stelle mit derselben Farbe wäre beim nächsten Umfärben falsch.

Wie das im Einzelnen aussieht, steht in
`apps/dashboard-frontend/src/features/workspace/viewers/n8nDesign.ts`; WANN es
passiert, in `AutomationenTab.tsx`. Für das nächste fremde Projekt ist die
Trennung die eigentliche Anleitung: die Farbregeln gehören in eine eigene,
prüfbare Datei, der Rahmen sagt nur Bescheid.

**Was offen bleibt.** Der Verstoß gegen die Content-Security-Policy beim
Einbetten ist bekannt und folgenlos. Und: wird das fremde Projekt
aktualisiert und ändert seine Variablennamen, greift die Angleichung nicht mehr
— sie fällt dann auf das fremde Design zurück, statt zu scheitern. Beim
Aktualisieren also einmal hinsehen.

## Der Vertrag für zweite Werkzeuge (Plan 023 H3)

Ein Partner baut über **ara-kit**, ein Unternehmen im Terminal. Beide müssen
dasselbe Paket erzeugen. Was „dasselbe" heißt, entscheidet nicht die Meinung,
sondern `scripts/test/paket-vergleich.py`:

```bash
python3 scripts/test/paket-vergleich.py ara-kit-bau/ terminal-bau/
```

**Dasselbe heißt nicht byte-gleich.** Zwei gzip-Archive derselben Dateien
unterscheiden sich schon durch den Zeitstempel im Kopf. Verglichen wird, was ein
Paket ausmacht:

| Was        | Wie                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Manifest   | normalisiert: Reihenfolge der Schlüssel egal, Einrückung egal, `faehigkeiten` als **Menge**       |
| Dateiliste | ohne Ordner, relativ zur Paketwurzel                                                              |
| Inhalt     | SHA-256 je Datei                                                                                  |
| `version`  | zählt **nicht** (zwei Fassungen derselben Anwendung sind dieselbe Anwendung). Mit `--streng` doch |

Ein zweites Werkzeug muss also nicht die Formatierung des Backends treffen. Es
muss dieselben Felder mit denselben Werten schreiben und dieselben Dateien
liefern.

**Artefakte des Betriebssystems zählen.** `._*`, `.DS_Store` und `__MACOSX/`
werden vom Import mitentpackt, sind also Teil des Pakets. Der Vergleich meldet
sie, benennt sie aber als das, was sie sind — sonst sucht jemand eine Stunde,
was `._index.html` bedeutet. Beim Packen auf macOS hilft `COPYFILE_DISABLE=1`.

Was ein zweites Werkzeug zusätzlich einhalten muss, steht schon oben: die
Manifest-Regeln (`erweiterung pruefen` spiegelt sie, `geruest-regeln.py` hält
die Spiegelung ehrlich) und das Paketformat `arasulExtensionVersion: 1`.

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md) → Abschnitt **Extensions**
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) → `extensions`
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)
  → `EXTENSIONS_DIR`, `EXTENSIONS_WATCH_INTERVAL_MS`, `SANDBOX_DEV_TEMPLATES_DIR`
- Flows: [`FLOWS.md`](FLOWS.md) — Chat-Slash-Befehle, Argumente, Werkzeuge, Auslöser
