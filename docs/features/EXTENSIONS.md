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

- Das Manifest deklariert `faehigkeiten` (`llm`, `rag`, `dateien`, `flows`);
  der Admin gibt sie beim Live-Schalten frei (wirksam = deklariert ∩ freigegeben).
- Das Dashboard reicht der App per postMessage einen **kurzlebigen, pro
  Erweiterung gescopten Token**; damit ruft sie
  `/api/extensions/:id/bruecke/{llm,rag,dateien,flows}` auf. Das Backend prüft
  Token + Erweiterung + Fähigkeit bei **jedem** Aufruf.
- Ein Env-Flag `EXTENSIONS_BRUECKE_ENABLED=false` schaltet die Brücke geräteweit
  ab. Client-SDK: `arasul-bruecke.js` (in den Dev-Vorlagen).
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
Technisch liefert `GET /api/extensions/:id/app/…` die Paket-Dateien same-origin
(Auth über das Session-Cookie); die `Content-Security-Policy: sandbox`-Antwort
plus das iframe-`sandbox`-Attribut geben dem Nutzer-HTML einen eigenen, opaken
Origin — seine Skripte laufen, kommen aber nicht an das Dashboard, seine Cookies
oder die API. Eine `app` ist deshalb bewusst eine **selbst-enthaltene**
`index.html` (Assets im Paket, keine externen Skripte). Deaktivierte
Erweiterungen lassen sich nicht öffnen.

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

## Verwandte Dokumentation

- API: [`API_REFERENCE.md`](../api/API_REFERENCE.md) → Abschnitt **Extensions**
- Datenbank: [`DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) → `extensions`
- Umgebungsvariablen: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)
  → `EXTENSIONS_DIR`, `EXTENSIONS_WATCH_INTERVAL_MS`, `SANDBOX_DEV_TEMPLATES_DIR`
- Flows: [`FLOWS.md`](FLOWS.md) — Chat-Slash-Befehle, Argumente, Werkzeuge, Auslöser
