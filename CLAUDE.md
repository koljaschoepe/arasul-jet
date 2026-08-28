# CLAUDE.md — Arasul Platform

## Vision

**Arasul ist Standardsoftware, die auf einem Server im Unternehmen interne
Apps hostet.** Die Apps baut ein Partner oder ein tech-affiner Mensch im
Unternehmen mit dem **Ara-Kit** (offen, Apache 2.0, eigenes Repo) und rollt sie
auf das Gerät, einen NVIDIA Jetson. Mitarbeiter melden sich mit E-Mail und
Passwort an und sehen die Apps, die ein Admin ihnen freigegeben hat. Die Lizenz
kauft drei Dinge: Anmelden und Zuweisen, die Flow-Engine mit
Nachvollziehbarkeit, den Betrieb (Updates, Backup, Wiederherstellung,
Wartung); dazu Freigaben als Plattformdienst. Alles läuft lokal und
DSGVO-konform, Ziel: fünf Jahre unbeaufsichtigter Betrieb. Ein Wort für alles,
was auf dem Gerät läuft: **App**.

## Architecture at a glance

```
Internet (443) → Traefik → Dashboard-Frontend (React 19 SPA)
                         → Dashboard-Backend (Express API :3001)
                              ├─ PostgreSQL 16 (migrations in services/postgres/init/)
                              ├─ Ollama / LLM-Service (:11434/:11436) [GPU]
                              ├─ Document-Indexer (:9102, nur Text-Extraktion)
                              └─ Docker-Proxy → Self-Healing, Metrics, Backup
```

Zwölf Container, `docker compose ps` ist die Wahrheit. Das Backend ist der
alte Express-Kern, radikal gekürzt (Phasen B1 bis B7 des Umbaus vom
26.08.2026, Messungen unter `docs/plans/audits/`): keine Dokumente, kein RAG,
kein Chat in der Oberfläche, kein Editor, kein Terminal, keine Sandbox, kein
n8n, kein Erweiterungs-Baukasten. Was bleibt: Anmeldung, Modelle, Flows mit
Läufen und Schritten, die externe API mit Schlüssel (`/api/v1/external`,
OpenAI-kompatibel unter `/v1`), Betrieb (Updates, Backup, Selbstheilung,
Werksreset, Fernzugriff). `llm_jobs` ist zustandslos und gehört dem Ersteller
des API-Schlüssels; der `document-indexer` extrahiert Text auf Anfrage
(`POST /extract-text`); Flows arbeiten mit ihren Datei-Werkzeugen in den im
Flow deklarierten Ordnern; `embedding-service` läuft ohne Profil, weil die
OpenAI-kompatible `/v1/embeddings` ihn braucht. Das App-Modell steht seit C3
(Manifest `app.json`, Tabellen `apps` und `app_staende`, Frontend unter
`/apps/<id>/` von Arasul ausgeliefert, Backend als Container über Traefik unter
`/apps/<id>/api/`, je App ein Test- und ein Livestand — siehe
[`docs/features/APPS.md`](docs/features/APPS.md)); die App-Anmeldung steht seit
C4 (Forward-Auth vor jedem App-Backend, `X-Arasul-User` und `X-Arasul-Role`),
der Deploy-Endpunkt seit C5 (`POST /api/v1/external/apps` nimmt ein Paket, baut
das Image am Gerät, rollt in den Teststand; `schalten` setzt den Livestand und
nimmt ihn zurück; `GET /api/v1/external/contract` ist der Vertrag mit dem
Ara-Kit — siehe [`docs/features/APP-PAKET.md`](docs/features/APP-PAKET.md)).
Seit C6 bringt eine App ihre **Flows** im Paket mit (`flows/*.md`, je App und
Stand registriert in `app_flows`, Namensraum ist die App); das Modell je Flow
steht im Frontmatter, der Admin überschreibt es in `flow_settings`, und diese
Überschreibung überlebt ein App-Update. Eine App startet nur ihre eigenen
Flows — der Schlüssel aus C4 trägt App und Stand, gesucht wird mit beiden.
Seit C7 kann ein Flow **anhalten**: das Werkzeug `freigabe_anfordern` legt eine
Zeile in `approvals`, der Lauf steht auf `wartend`, und wer die App freigegeben
hat, bestätigt oder lehnt über `/api/freigabe-anfragen` ab (der Flow nennt keine
Person). Bestätigt läuft er ab dem angehaltenen Schritt weiter, abgelehnt endet
er als `abgebrochen` mit Begründung, ohne Entscheidung nach der Frist als
`abgelaufen` — siehe [`docs/features/FLOWS.md`](docs/features/FLOWS.md).
Seit C8 ist der **Modellkatalog die Kurzliste**: vier Modelle, festgelegt an
`ollama list` am Orin und einmal notiert in
[`config/modelle/kurzliste.json`](config/modelle/kurzliste.json) — das
Standardmodell der Flows (`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`), ein kleines
schnelles (`gemma4:e4b`), eines für Einbettungen (`nomic-embed-text`), eines für
Bilder und eingescannten Text (`llava-phi3`). Geladen wird nur, was darin steht;
der Katalog kommt ausschließlich aus Migrationen, und die Plattformprofile
(`config/platforms/*.json`, `utils/hardware.js`, `detect-platform.sh`) tragen
dieselbe Liste — `scripts/test/kurzliste.py` hält sie aneinander. Gestrichene
Gewichte nimmt `scripts/util/modelle-aufraeumen.sh` von Hand vom Gerät, nicht
der Deploy. Bei RAM-Überlast entlädt die Selbstheilung jetzt das Modell (der
Idle-Unload bleibt daneben bestehen).
Seit C9 nimmt die **Sicherung** Apps und Konfiguration mit, ein Weg zurück holt
sie samt Containern wieder.
Seit C10 gibt es die **Auslieferung**: die CI baut aus einem Tag ein
versioniertes Artefakt (`scripts/deploy/artefakt-bauen.sh`,
`.github/workflows/release.yml`), hängt es als GitHub-Release an das Jet-Repo,
und `install.sh` im Wurzelverzeichnis des Artefakts ist sein Einstiegspunkt —
er schreibt die `.env`, setzt den Netznamen und ruft `./arasul bootstrap`. Die
**Fassung kommt aus dem Bau** und nicht mehr aus einer Datei `VERSION`
(`scripts/lib/fassung.sh`: Tag auf HEAD, sonst Datum plus SHA); der Bootstrap
zeigt einmal das Startpasswort und den **Kit-Schlüssel** (`app:deploy`). Das
Gerät heißt im Firmennetz schlicht `arasul` (DHCP-Hostname, Rückfall
`arasul.local` über mDNS) und trägt ein Zertifikat aus einer beim ersten Start
erzeugten **Geräte-CA**, deren Zertifikat der Admin einmal aus der Oberfläche
lädt und verteilt — siehe [`docs/ops/AUSLIEFERUNG.md`](docs/ops/AUSLIEFERUNG.md)
und [`docs/ops/NETZNAME_UND_ZERTIFIKAT.md`](docs/ops/NETZNAME_UND_ZERTIFIKAT.md).
Der erste Werksreset am Orin (28.08.2026) hat fünf Wege gefunden, auf denen die
Installation nicht ohne Hand durchlief, und alle fünf sind zu: der
**Werksreset installiert nichts mehr** (kein `preconfigure.sh`, kein
Modell-Pull) und räumt jeden Container mit Name `arasul-*` oder Etikett
`arasul.*`, die App-Images und alle Volumes des Geräts weg; `tailscale serve`
ist **gestrichen**, weil es Traefik den Port 443 nimmt (auch aus Oberfläche und
API); Geheimnisse mit `$` stehen in der `.env` in Anführungszeichen, sonst liest
docker compose sie als Variable. Zwei neue Wächter halten die Klassen fest:
`scripts/test/wurzelpfad.py` (ein Skript, das sein Wurzelverzeichnis eine Ebene
zu hoch ansetzt) und der erweiterte `stiller-tod.py`, der jetzt auch `arasul`
selbst liest. Gemessen wird die Installation seither **bei jedem Zug**: der
CI-Job `Installation` baut das Artefakt, packt es aus und fährt
`./install.sh --nur-vorbereiten` darin; `scripts/test/bootstrap-abnahme.sh`
misst am Gerät, was danach wirklich läuft.
Der zweite Werksreset (ebenfalls 28.08.2026, Release v0.2.0) lief bis zum Ende
und war trotzdem rot: der **Rauchtest wartet jetzt je Dienst** über
`wait_for_healthy` mit Zeitgrenze, statt einmal zu stoßen (das
`dashboard-frontend` war neun Sekunden später healthy), und die Prüfung des
Self-Healing-Agenten ist sein Docker-Health-Status (`heartbeat.py --test`) statt
einer Suche nach dem Prozess. Vor allem aber hängt die **Erstausgabe** — das
Startpasswort und der Kit-Schlüssel — an keiner Bedingung mehr: sie erscheint
immer und **vor** dem Fehlerbericht, und sie steht zusätzlich in
`config/secrets/erstausgabe.txt` (0600, mit dem Hinweis, sie nach dem Lesen zu
löschen). Ein Ort dafür, `scripts/util/erstausgabe.sh`; `install.sh` hat seinen
doppelten Schlussblock verloren und übergibt am Ende an den Bootstrap. Dazu:
`data/` gehört nach dem Bootstrap dem Menschen, der installiert (Docker legt
eine fehlende Bind-Quelle als root an), und `wurzelpfad.py` stolpert nicht mehr
über einen **Ordner**, der wie ein Skript heißt.
Seit D1 steht die **Shell** aus Beschluss 10: dreispaltig, links die Apps aus
`GET /api/apps/meine`, in der Mitte die Übersicht oder eine App (iframe auf
`/apps/<id>/`, Forward-Auth aus C4), rechts die **Notizen** (`/api/notizen`,
einer je Mensch). Mitarbeiter-Sicht zuerst: **die Rolle blendet aus, das
Backend entscheidet** — die Verwaltung (Modelle, Einstellungen) ist für einen
Mitarbeiter nicht sichtbar, und `requireRole` antwortet ihm dort ohnehin mit
403; das Abmelden sitzt deshalb im Benutzermenü der Kopfleiste und nicht mehr
in den Einstellungen. Angemeldet wird mit Benutzername **oder** E-Mail (C1);
ein vom Administrator gesetztes Passwort ist ein Startpasswort und wird beim
ersten Anmelden gewechselt (`admin_users.passwort_vom_admin`, Migration 178).
Die Zahl der offenen Freigaben aus C7 steht in der Statusleiste. Abnahme:
`scripts/test/shell-abnahme.sh` — sie läuft **neben** `abnahmen.sh`, weil die
Reihe dort mit zehn Anmeldungen auf der Drossel sitzt (die Bilder in drei
Breiten hat D6 übernommen).
Seit D2 wird die **Freigabe aus C7 im Dashboard entschieden**: die Übersicht
zeigt die offenen Anfragen mit Titel, Zusammenhang und Restzeit, bestätigen
oder ablehnen mit Begründung geht an `POST /api/freigabe-anfragen/:id/…`, und
die Liste aktualisiert sich über die Entwertung der Abfrage — ohne Neuladen,
auch nach einem Fehler (ein 409 heißt gerade, dass die Liste veraltet ist).
Die Oberfläche liegt in `features/freigaben/`, zusammengesetzt wird sie in
`features/workspace/TabContent.tsx`: nur die Shell importiert quer, die
Übersicht bekommt die Liste als Slot. Zwei Funde der D1-Abnahme sind zu:
`DownloadContext` fragt `/models/catalog` nur noch als `admin` (für einen
Mitarbeiter war es ein 403 in der Konsole beim Laden der Shell), und
`GET /api/settings` ist aus der Verwaltungsprobe von `shell-abnahme.sh` heraus
— diesen Weg gibt es gar nicht, 404 war richtig, gemessen wird jetzt
`GET /api/system/info`. Abnahme: `scripts/test/dashboard-abnahme.sh` (Klick im
Browser über `scripts/test/dashboard-bilder.mjs`); sie läuft ebenfalls neben
`abnahmen.sh` und **nicht** in derselben Viertelstunde wie `shell-abnahme.sh`.
Seit D3 gibt es die **Verwaltung der Mitarbeiter** als Einstellungs-Sektion
(`/workspace/settings?tab=benutzer`, `features/settings/MitarbeiterSettings.tsx`
plus `features/settings/mitarbeiter/`): die Liste der Menschen am Gerät mit
Rolle, Zustand und der Spalte **Passwort** („Startpasswort" oder „eigenes",
`passwort_vom_admin` steht seit D3 auch in `GET /api/benutzer`), Anlegen und
Startpasswort-Setzen als Dialog, und darunter die **Freigabe-Matrix** Menschen
mal Apps (`GET/POST /api/freigaben`, `DELETE /api/freigaben/:appId/:benutzerId`
aus C2, Apps aus `GET /api/apps`) — ein Häkchen je Zelle, darunter der Stand
(`live` oder `test`, der Tester-Kreis aus C3). Die Matrix führt **alle**
Benutzer, auch Administratoren: die Rolle sagt, wer verwaltet, nicht wer
arbeitet. Sie liegt in den Einstellungen und nicht als eigener Knopf in der
Aktivitätsleiste, weil deren Ansichten die Arbeit tragen (Apps, Modelle) und das
Zahnrad darunter das Einrichten des Geräts. Der dritte Fund der D-Abnahmen ist
zu: `useMemoryBudget` fragte `GET /api/models/memory-budget`
(`requireRole('admin')`) aus der Statusleiste in **jeder** Shell — für einen
Mitarbeiter beim Laden zwei 403 (`retry: 1`) und danach alle zehn Sekunden
eines; seit D3 nur noch als `admin`, und ohne Budget fällt der Modell-Umschalter
von selbst weg. Abnahme A4: `scripts/test/admin-abnahme.sh` (der Admin-Teil
passiert im Browser über `scripts/test/admin-bilder.mjs`); sie läuft neben
`abnahmen.sh` und **nicht** in derselben Viertelstunde wie `shell-abnahme.sh`
oder `dashboard-abnahme.sh` — die drei brauchen zusammen acht der zehn
Anmeldungen je Viertelstunde.
Seit D4 gibt es die **App-Verwaltung** als Einstellungs-Sektion
(`/workspace/settings?tab=apps`, `features/settings/AppsSettings.tsx` plus
`features/settings/apps/`), und mit ihr die Sicht dessen, der das Gerät
betreibt: je App die zwei **Stände** mit Version, Zustand und Gesundheit ihres
Containers samt Schalter **live** und **zurück**
(`POST /api/apps/:id/schalten`, dieselbe Sache wie der Kit-Weg aus C5, aber
für einen Menschen mit einer Sitzung), die **Tester** (die Spalte einer App aus
der D3-Matrix, aus der anderen Richtung gelesen), die **Flows** je Stand mit dem
Modell, das sie treibt, die **Läufe** und die **Logs** des Containers. Ein Klick
auf einen Flow öffnet seine Datei samt Prompt
(`GET /api/apps/:id/flows/:name` — was der Partner geschrieben hat, ist nicht
geheim: es liegt auf diesem Gerät, und wer es verwaltet, haftet dafür); ein
Klick auf einen Lauf zeigt seine Schritte
(`GET /api/apps/:id/laeufe`, `.../laeufe/:runId` — eigene Wege, weil
`GET /api/flows/laeufe` an `user_id` hängt und ein App-Lauf dem gehört, der den
Schlüssel angelegt hat). Darunter der **Gedankengang**: was das Modell sagte,
bevor es ein Werkzeug rief, fiel in `toolLoop` bis D4 lautlos weg und steht
jetzt als Schritt der Art `modell` im Protokoll. Das **Modell je Flow** stellt
ein Dialog um — aus dem Paket, eines vom Gerät (Kurzliste, C8) oder eines bei
einem Anbieter draußen (`{"extern": {anbieter, modell, basis_url, schluessel}}`
am selben `PUT .../modell`; Migration 179 ergänzt `extern_basis_url`, der
Schlüssel liegt verschlüsselt und kommt nirgends heraus, lokal und extern
schließen einander aus). **Kein eigener Settings-Bereich für externe Modelle**
(Entscheidung 26.08.2026): eine Liste von Zugängen, von denen niemand mehr
sagen könnte, welcher Flow sie benutzt, wäre das Gegenteil einer Übersicht.
Zwei Funde der D3-Abnahme sind zu: der **Einrichtungsassistent ist gestrichen**
(SetupWizard, `/api/system/setup-*`, die vier `setup_`-Spalten) — jede seiner
Fragen gehört woandershin, und übrig geblieben wäre ein Bildschirm, der
wiederholt, was der Bootstrap gerade gezeigt hat; und die Einstellungsseite ist
bei 1440 px mit offener Notizspalte nicht mehr abgeschnitten (Radix'
`ScrollArea` legte um den Inhalt ein Element mit `display: table`, das sich nach
dem Inhalt richtete statt nach der Spalte — jetzt ein gewöhnlicher Rollbereich,
und was breiter ist, rollt in seinem eigenen Kasten). Abnahme A5:
`scripts/test/app-admin-abnahme.sh` (Browser über
`scripts/test/app-admin-bilder.mjs`, zwei Sitzungen in einem Lauf); auch sie
läuft neben `abnahmen.sh` und **nicht** in derselben Viertelstunde wie die drei
anderen Browser-Abnahmen — zusammen brauchen die vier zehn Anmeldungen.
Seit D5 stehen **Modelle und System** als Sicht des Betreibers. Die
**Modelle** sind die Kurzliste aus C8 und nicht mehr ein Laden: vier Zeilen
(`features/modelle/`, Tab `modelle` ohne eigenen Router) mit Laden, Standard
setzen (`POST /api/models/default`), in den und aus dem Speicher und Entfernen,
darüber KI-RAM und das geladene Modell aus `GET /api/models/memory-budget`.
Der frühere Store mit Suche, Facetten, Größenklassen und Detailseite ist
gefallen — samt `storeFilterStore`, `extensionStore`, `SidebarSearch` und
`sanitizeUrl`; die Sidebar zeigt jetzt dieselben vier Modelle als Liste. Unter
**System** kommt die **Sicherung** dazu (`features/system/sicherung/`, die C9-Wege
mit einem Menschen davor): Zustand, jetzt sichern, die Liste mit Datum und
Größe, der Wiederherstellungstest und die letzte Kopie **außerhalb** — leer,
wenn es nie eine gab. Das Zurückspielen bleibt bewusst ohne Knopf. Die
**Aktualisierungen** sagen die Wahrheit: die Fassung kommt aus dem Bau (C10),
und kann dieses Gerät nicht über die Schnittstelle einspielen
(`einspielenMoeglich`), steht der Grund da statt eines Knopfes, der zuverlässig
scheitert. Die Auslastung liest ihre Zahlen aus `features/system/geraetezustand.ts`
— der alte `useDashboardData` holte alle 30 Sekunden vier Antworten, die
niemand las. Zwei Funde der D4-Abnahme sind zu: `app-admin-abnahme.sh` schickt
`rolle` statt `role` und räumt das Startpasswort des Wegwerf-Mitarbeiters weg,
und die **Tabellen der Verwaltung stehen unter 900 px als Liste**
(Mitarbeiter und Freigabe-Matrix, `useSchmalesFenster`; immer nur eine Form im
Dokument, sonst wären die Kennungen doppelt da). Abnahme A6:
`scripts/test/system-abnahme.sh` (Browser über `scripts/test/system-bilder.mjs`:
Sicherung auslösen, Meldung, Liste; die Modelle gegen
`config/modelle/kurzliste.json`); auch sie läuft neben `abnahmen.sh` und
**nicht** in derselben Viertelstunde wie die vier anderen Browser-Abnahmen.
Seit D6 gibt es die **Oberflächen-Abnahme** als eine Reihe
(`scripts/test/oberflaeche-abnahme.mjs`; ohne Buchstaben — A1 bis A8 sind
vergeben, A7 ist der siebentägige Dauerlauf): zwölf Ansichten mal drei
Breiten (390, 1024, 1440) für Mitarbeiter und Administrator, dazu die CSP
(Kopfzeilen und Verstöße), die Tastatur (Tab-Reihenfolge durch Anmeldung und
Shell, Escape schließt einen Dialog, Enter bestätigt) und die Fehlerzustände
(Backend weg, ein Mitarbeiter auf einer Admin-Adresse, eine Adresse, die es
nicht gibt). Ausgabe ist eine Tabelle Ansicht mal Breite, die Bilder liegen
unter `docs/plans/audits/<datum>-oberflaeche-d6/`. **Keine zwei Wahrheiten:**
das Breitenraster, die Konsolenfrage und die Bilder standen bis dahin in
sechs Skripten nebeneinander — `csp-abnahme.mjs` und `shell-bilder.mjs` sind
gefallen, die vier übrigen `*-bilder.mjs` haben ihre Breitenschleife verloren
und behalten ihren Handgriff (anlegen, entscheiden, umstellen, sichern). Die
Reihe kostet **zwei** Anmeldungen, beide für ihren Wegwerf-Mitarbeiter (mit
dem Startpasswort und danach mit dem eigenen); der Administrator kommt über
den geteilten Token. Sie läuft deshalb neben `abnahmen.sh`, aus dem `csp` und
`oberflaeche` heraus sind — die Reihe dort sitzt wieder bei genau zehn. Der
Fund der D5-Abnahme ist zu: `getDefaultModel()` fiel ohne gesetztes
`is_default` auf das **zuletzt geladene** Modell zurück, ohne die Aufgabe zu
beachten, und setzte das Abzeichen „Standard" am Orin auf `llava-phi3` — ein
Bildmodell, das die Ansicht daneben selbst nicht als Standard anbietet. Die
Rückfälle beachten jetzt die Aufgabe (`is_task_default` für `text` vor allem
anderen), und `POST /api/models/default` weist ein Modell ab, mit dem kein
Flow rechnen kann.
Der erste Lauf dieser Reihe am Orin (28.08.2026, dreimal: 71/80, 18/20, 72/80)
hat zwei Dinge gefunden, und beide sind zu. **Unter 900 px stehen Notizen und
Mitte nie nebeneinander**: bei 390 px bekam die Mitte null Pixel (48 für die
Aktivitätsleiste, 160 für die Sidebar und 220 für die Notizen sind mehr, als da
ist), alle sieben Verwaltungsansichten waren rot, und jedes Bild zeigte
„NOTIZEN — noch nichts notiert". Seither liegen die Notizen dort als **Blatt**
über der Mitte (`data-shell-blatt` in `index.css`, dasselbe Panel an derselben
Stelle des Baums — die Notizen dürfen nicht unmounten), sie fangen **zu** an
(`notizenBlattOffen`, nicht persistiert), und jede Ansicht, die kommt,
schließt sie; die Statusleiste lässt bei 390 px die Fassung weg und zählt die
Freigaben als Zahl neben dem Symbol. Die Reihe macht die Notizen vor jeder
schmalen Messung ausdrücklich zu und misst sie danach als eigene Zelle
„Notizen" bei 390 px, aufgezogen. Zweitens **meldet Abmelden jetzt ab, auch
wenn die Sitzung schon tot ist**: `POST /api/auth/logout` trug `requireAuth`,
und nach einem Passwortwechsel (der alle Sitzungen entwertet) antwortete es
mit 401 — das httpOnly-Cookie `arasul_session` blieb mit totem Token im
Browser stehen, wo keine Seite es löschen kann. Jetzt `optionalAuth`, Cookies
fallen immer, 200. Dazu zwei Dinge gegen den flüchtigen zweiten Fund (Lauf 2
brach an der zweiten Anmeldung ab, Lauf 1 und 3 nicht): die Reihe hält die
HTTP-Antwort von `POST /api/auth/login` fest und nennt sie im roten Feld statt
nur „keine Shell", und die drei per `React.lazy` nachgeladenen Bündel
versuchen es dreimal (`utils/lazyNachladen.ts`) — die Shell wird genau einmal
geholt, nämlich wenn die Anmeldung durch ist, und eine verlorene Anfrage sah
danach aus wie ein Gerät, das nicht anmeldet.
Der zweite Lauf (28.08.2026, dreimal: 35/36, 19/21, 35/36) hat alle
sechsunddreißig Zellen Ansicht mal Breite grün gezeigt und war trotzdem rot —
zweimal an der Reihe selbst, nicht am Produkt. **Die Probe „eine Ansicht macht
das Blatt wieder zu" klickte auf eine App-Kachel, und die liegt unter dem
Blatt**: `locator.click` wartete fünfzehn Sekunden, warf, und Lauf 1 und 3
endeten dort — vor Tastatur, Fehlerzuständen und der ganzen Verwaltung. Ein
Mensch kann diesen Klick dort auch nicht ausführen. Über dem Blatt (es beginnt
bei 35 % der Höhe) liegen die Kopfleiste und die **Tab-Leiste**; die Reihe
öffnet den zweiten Tab deshalb **vor** dem Blatt, wechselt danach über die
Leiste und misst so dieselbe Regel an einem Weg, den es gibt. Jeder andere
Klick im Arbeitsplatz geht über `klickFrei`, das vorher wegräumt, was oben
liegt — gefragt wird dabei `data-shell-blatt` und nicht die Fensterbreite, denn
über 900 px schaltet derselbe Knopf die persistierte Notiz-**Spalte**.
Zweitens **wartet die Reihe die Anmeldedrossel ab, statt rot zu werden**: drei
Läufe kosten sechs der zehn Versuche je Viertelstunde und IP (`loginLimiter`),
daneben melden sich Überordner und Rückbau an, und Lauf 2 bekam an der zweiten
Anmeldung ein 429. Sie merkt sich jetzt nach jeder Anmeldung
`RateLimit-Remaining` und `RateLimit-Reset` (in `/tmp`, neben der Token-Datei,
damit der nächste Lauf es weiß), fragt danach **vor** dem ersten Handgriff, und
ein 429 am Formular wird über `Retry-After` abgewartet und einmal wiederholt.
Seit D7 gibt es das **Designsystem für alle Apps** (`packages/marken/`):
Schrift, Farben und Abstände aus `index.css` und sechs Bausteine daraus —
Kopf, Liste, Karte, Formular (mit Feld und Knopf), Meldung, Menü. Kein neues
Erscheinungsbild, ein gemeinsames: jeder Wert steht als
`var(--token-der-shell, <derselbe Wert>)`, also folgt die Bibliothek in der
Shell dem Thema und steht in einer App allein auf »Schwarz«. Zwei Ausgänge,
eine Quelle — die Shell übersetzt `src/` über den Vite-Alias `@marken` mit
(**kein npm-Paket**, kein Lockfile-Eintrag, kein `dist/`, das jemand vergisst),
eine App ohne Bau lädt das eingecheckte Bündel `browser/marken.js`, in dem
React mitliegt (`npm run marken`, danebengelegt von
`scripts/util/marken-beilegen.sh`). Kein JSX darin: JSX braucht im Browser
`eval`, und das verbietet die CSP dieses Geräts. `scripts/test/marken.py` hält
Quelle und Bündel aneinander. `PageHeader` ist gefallen, `Kopf` nimmt seinen
Platz — zwei Seitenköpfe wären genau die Doppelung, gegen die die Bibliothek
gebaut ist. Die **Beispielapp** ist damit React (weiter ohne Bau und ohne
Abhängigkeit), die Referenz-App Urlaubsantrag zieht nach; das Kit spiegelt die
Quelle in die Vorlage aus E5.
Und die Shell hat **unter 900 px einen eigenen Aufbau** statt eines
geschrumpften Desktops: ein Hamburger-Menü in der Kopfleiste (daneben der Name
dessen, was dasteht), **eine Spalte**, die Notizen als eigene **Ansicht** —
keine Aktivitätsleiste, keine Sidebar, keine Tab-Leiste. Das Blatt aus D6 ist
gefallen (`data-shell-blatt`): es nahm der Mitte ihre Pixel nicht mehr weg,
verdeckte sie aber weiter, und die zweite Messung am Orin zeigte die App
abgedunkelt dahinter. Jetzt liegt nichts mehr übereinander — entweder steht
die Ansicht da oder der Zettel. Die Reihe aus D6 misst das mit: `wegRaeumen`
statt `blattZumachen`, die Station „eine Ansicht macht die Notizen zu" geht
über das Menü auf die Übersicht (ein Mitarbeiter mit einer App hat dort genau
diesen Weg), und „es steht etwas da" zählt den Text **im Rahmen** mit —
`innerText` endet am iframe, und bei 390 px hat die App die Spalte für sich.
Ab 900 px bleiben die drei Spalten aus D1.
Der Rest der neuen Oberfläche kommt mit den weiteren D-Phasen.

Vier Läufe der D6-Reihe am Orin nach dem D7-Deploy (28.08.2026: 90/91, 91/91,
90/91, 91/91) waren zweimal rot, je genau einmal und je an einer anderen
Stelle — und beide Male im Startpasswort-Wechsel des Wegwerf-Mitarbeiters. Es
lag **am Produkt, nicht an der Reihe**, und beide Male an derselben Sache: eine
einzelne HTTP-Antwort entschied alles, und niemand sah nach, ob sie kam.
**Abmelden ist die einzige Stelle, die das httpOnly-Cookie `arasul_session`
löschen kann** — eine Seite sieht es nie. Der Passwortwechsel ist selbst eine
Mutation, und jede angenommene Mutation dreht das Cookie `arasul_csrf`
(`middleware/csrf.js`); Chromium führt `document.cookie` im Renderer als Kopie
und zieht sie erst kurz danach nach, das Abmelden folgt dem Wechsel aber auf dem
Fuß. Wer noch den alten Wert liest, bekommt **403 CSRF_INVALID, bevor die Route
läuft** — `res.clearCookie` fällt aus, und im Browser bleibt eine tote Sitzung
stehen, die niemand mehr wegbekommt. Jeder andere Mutationsweg hat diese
Erholung längst (`useApi` holt bei `CSRF_INVALID` einen frischen Wert und
wiederholt einmal); das Abmelden geht bewusst nicht durch `useApi` und war damit
der einzige Weg ohne. Es wiederholt jetzt einmal und liest das Cookie dabei neu
— eine abgelehnte Anfrage dreht es nicht, der zweite Versuch trifft.
`GET /api/auth/csrf` hilft hier nicht: der Weg verlangt eine gültige Sitzung,
und die ist nach dem Wechsel gerade tot. Zweitens **wirft eine verlorene
Sitzungsprobe niemanden mehr auf die Anmeldung**: `GET /api/auth/session`
antwortet in beiden Fällen mit 200, alles andere ist keine Aussage über die
Sitzung — `checkAuth` fragt jetzt bis zu dreimal und mit Zeitgrenze (ein 429
wird nicht wiederholt, das ist eine Antwort). Ohne Zeitgrenze blieb eine
hängende Anfrage für immer hängen, und die Oberfläche zeigte dauerhaft „Prüfe
Authentifizierung …". Dieselbe Klasse wie `utils/lazyNachladen` aus D6.
Und die Reihe **erklärt ihre roten Felder**: sie schreibt jeden Wortwechsel mit
`/api/auth/*` mit, samt dem, der gar nicht kam, und nennt ihn in der Zeile —
„arasul_session blieb stehen" ließ offen, ob der Weg 403 sagte, 429 oder gar
nichts, drei Befunde mit drei verschiedenen Antworten.

Fünf Läufe der Reihe ohne Pause (28.08.2026, für G1) haben gezeigt, dass das
Gerät **drei Drosseln** auf den Wegen hat, die jede Seitenladung nimmt, und
die Abnahmen nur eine kannten: `loginLimiter` (zehn je Viertelstunde),
`generalAuthLimiter` auf `needs-setup` und `logout` (dreißig je Minute) und
`sessionProbeLimiter` auf `session` (hundertzwanzig je Minute), alle je IP,
und hinter Traefik ist das eine IP für alles, was anklopft. Lauf 4 fiel an
einem 429 der Sitzungsprobe. Seither ist **die Drossel eine Sache**:
`scripts/test/drossel.mjs` (Browser) und `_arasul_drossel_py` in
`scripts/test/anmeldung.sh` (curl) merken sich aus **jeder** Antwort, die
eine Drossel trägt, den Stand je Drossel in einer Datei, warten vor der
Anmeldung und vor jeder Seitenladung (`laden` in `oberflaeche-abnahme.mjs`)
und wiederholen ein 429 einmal; `scripts/test/drosselzahlen.py` hält die
Zahlen an `middleware/rateLimit.js` fest, damit sie nicht zweimal auseinander
laufen. Und der **Prüfbenutzer legt sich selbst an**: der Werksreset in G1
löscht jeden Benutzer, auch den, mit dem die Abnahmen anmelden (28.08.2026,
11:55, `pruefer`), und danach war jede Anmeldung ein 401 über den Messaufbau.
Ein 401 für `ARASUL_BENUTZER` ruft jetzt einmal
`scripts/util/pruefbenutzer.sh` (idempotent: `ON CONFLICT DO UPDATE`, Hash
aus dem `bcrypt` des Backend-Containers, am Gerät oder über
`ssh $ARASUL_GERAET`, Passwort nur über STDIN) und meldet sich noch einmal
an, mit klarer Meldung, was geschah. Über die Schnittstelle geht das nicht:
das Startpasswort des Administrators nach dem Reset kennen die Abnahmen
nicht, und sollen es nicht.

Der Auftrag **app-leiche** (28.08.2026, für G1) hat am Orin eine App gefunden,
die registriert war, gesund meldete und nicht ausgeliefert werden konnte:
`urlaubsantrag` stand als `test` und `live` in `app_staende`, beide Container
liefen `healthy`, und `data/apps/urlaubsantrag/` gab es nicht —
`GET /apps/urlaubsantrag/` war ein `INTERNAL_ERROR`. **Der Healthcheck des
Containers prüft das Backend, sonst nichts**; das Frontend liegt am Host, und
dass es fehlt, kann der Container nicht wissen. Seither rechnet das Gerät die
Gesundheit je **Stand** selbst (`appStore.standZustand`: `dateien`,
`lieferbar`, `mangel` in `GET /api/apps` und `GET /api/apps/:id`), die
Verwaltung zeigt einen Stand ohne `lieferbar` rot, schon in der Liste,
`GET /api/apps/meine` lässt ihn weg, und `GET /apps/<id>/` antwortet
`503 APP_DATEIEN_FEHLEN` mit dem Satz, was zu tun ist. Beim Start warnt das
Backend je Stand ohne Dateien (`pruefeStaende`) und **räumt nicht**: Docker
legt eine fehlende Bind-Quelle leer an, und ein Backend, das dann jeden Stand
löschte, räumte nach einem verrutschten Mount das Gerät leer. Entfernen tut
ein Mensch — der Weg fehlte in der Oberfläche und steht jetzt unter
Einstellungen → Apps → **App entfernen** (Kennung abtippen wie beim Kit,
`DELETE /api/apps/:id?dateien=true`, derselbe Dienst wie der Kit-Weg aus C5).

Der Auftrag **sitzungsdrossel** (28.08.2026, für G1) hat die enge Drossel
**gemessen statt vermutet**, und es war eine andere als die genannte. Ein Lauf
der Oberflächen-Abnahme macht **44 Seitenladungen in 129 s** und stand in
seiner vollsten Minute bei **22 von 30** auf `generalAuthLimiter` (den trug
`needs-setup`, und mit ihm das Abmelden) — 73 % der Decke, ohne Luft für
irgendwen sonst hinter derselben IP. Die Sitzungsprobe, auf die die Abnahmen
seit dem Vortag schauten, stand im selben Lauf bei **21 von 120**. Die
Erklärung des Auftrags — die Reihe frage nicht vor der Seitenladung — trug
nicht: `laden` fragt seit dem Vortag, und die Buchführung ist vollständig
(46 Antworten der einen Drossel, 44 der anderen, alle mitgeschrieben).
Deshalb zwei Dinge. Erstens tragen **beide Proben, die jede Seitenladung
macht, dieselbe Drossel**: `needs-setup` ist von den dreißig je Minute auf
`probeLimiter` gezogen (120 je Minute, zusammen mit `session`; eine
Seitenladung kostet zwei davon, also sechzig je Minute und IP), und die
dreißig gehören dem Abmelden allein — einer Mutation. Das Argument dafür stand
seit C3 im Code, es galt nur der halben Sache. Zweitens **ist ein 429 in einer
Zelle kein Rot**: die Buchführung aus Kopfzeilen kann nie vollständig sein,
weil hinter Traefik alle dieselbe IP haben, also merkt sich `ansichtMessen`,
ob während der Zelle eine Drossel 429 gesagt hat, wartet ab, was sie sagt, und
misst noch einmal (dreimal höchstens) — dieselbe Regel, die das Anmeldeformular
seit D6 hat. Und die Reihe **sagt am Ende, wie knapp es war**: der kleinste
Rest je Drossel steht in der Schlusszeile, denn „22 von 30" ist die Zahl, die
den Tag gekostet hat.

| Layer    | Stack                                                             | Path                                                          |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript          | `apps/dashboard-frontend/`, Designsystem `packages/marken/`   |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                      | `apps/dashboard-backend/`                                     |
| AI       | Ollama (LLM) + Text-Extraktion (Indexer) + Embeddings             | `services/llm-service/`, `services/document-indexer/`         |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik v2.11      | `compose/`, `config/traefik/`                                 |
| Ops      | Self-Healing Agent + Metrics Collector + Backup Service           | `services/self-healing-agent/`, `services/metrics-collector/` |
| DB       | PostgreSQL 16 (sequential migrations; next = highest on disk + 1) | `services/postgres/init/`                                     |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32–128 GB, CUDA 8.7–10.0)          | Detection: `scripts/setup/detect-platform.sh`                 |

## Non-negotiable rules

1. **Backend** — every route uses `asyncHandler` and throws custom errors from
   `utils/errors.js`. Never `try/catch` at route level, never `throw new Error`.
   Details: [`apps/dashboard-backend/CLAUDE.md`](apps/dashboard-backend/CLAUDE.md).
2. **Frontend** — every call goes through `useApi`. TypeScript only, theme
   tokens via CSS variables (no hex literals). Details:
   [`apps/dashboard-frontend/CLAUDE.md`](apps/dashboard-frontend/CLAUDE.md).
3. **Tests before commit** — `./scripts/test/run-tests.sh --backend|--frontend|--all`.
4. **Deploy** — there is no local dev server. After code changes:
   `docker compose up -d --build <service>`. The user verifies in the browser.
5. **Docs stay in sync**: API change → `docs/api/API_REFERENCE.md`,
   schema change → `docs/api/DATABASE_SCHEMA.md`,
   new env var → `docs/ENVIRONMENT_VARIABLES.md`.
6. **Conventional commits** — `feat|fix|docs|refactor|test|chore: <subject>`.
7. **Lockfile strategy: root-only.** This is an npm-workspaces monorepo with
   exactly **one** lockfile — `/package-lock.json`. Never add a per-workspace
   `package-lock.json` (they drift from the root lock and break `npm ci` on
   `main` — see the 2026-05-05 incident, festgehalten im Plan
   „Dependabot + Lock-File Hardening" vom 02.07.2026, nachzulesen ueber
   [`docs/plans/HISTORIE.md`](docs/plans/HISTORIE.md)).
   Install with `npm ci` from the repo root; Dockerfiles install via
   `npm ci --workspace=<name> --include-workspace-root`. CI's **Lockfile drift
   guard** fails any PR whose root lock is out of sync. **Dependabot is off**
   since 24.08.2026 (`.github/dependabot.yml` removed) — dependencies move only
   inside a plan with a gate reference, never by a bot's PR.
8. **PR hygiene** — keep the queue clean: one active PR per work-stream (finish
   what's open before starting the next related change), always merge/close with
   `--delete-branch` (no branch outlives its PR), and sweep stale/merged/superseded
   PRs on sight. Details: [`CONTRIBUTING.md`](CONTRIBUTING.md#pr-hygiene).

## Task router — which CLAUDE.md to read

Each subfolder owns its own `CLAUDE.md` with the conventions for code in that
folder. Read the closest one to where you're working:

| If you're touching…                     | Read first                                      |
| --------------------------------------- | ----------------------------------------------- |
| A backend route / service / middleware  | `apps/dashboard-backend/CLAUDE.md`              |
| A React component, hook, or feature     | `apps/dashboard-frontend/CLAUDE.md`             |
| A new long-running service / Dockerfile | `services/CLAUDE.md`                            |
| A SQL migration                         | `services/postgres/CLAUDE.md`                   |
| Compose / Traefik / infra wiring        | `services/CLAUDE.md` + `docs/ops/DEPLOYMENT.md` |
| Onboarding / first-time setup           | `docs/development/ONBOARDING.md`                |
| Testing strategy across the platform    | `docs/development/TESTING.md`                   |

Deeper-dive context packs (one-off topics — LLM queue, security review
checklist, etc.) live under `.claude/context/`.

## Woran gerade gearbeitet wird

**Der laufende Plan liegt nicht in diesem Repo.** Seit dem 26.08.2026 steuert
der Überordner-Plan `arasul/roadmap/plans/aktiv/2026-08-26-umbau-standardsoftware.md`
(Steuer-Repo `Arasul-GmbH/arasul-os`, nicht öffentlich) die Arbeit an allen drei
Repos. Er legt je Phase einen Worktree dieses Repos an und gibt dem Worker eine
`PHASE.md` mit: was zu tun ist, woran es gemessen wird, wie hier gearbeitet
wird. Wer eine `PHASE.md` im Wurzelverzeichnis findet, liest sie nach dieser
Datei. Sie wird nie committet.

Plan `024` (Urlaubslauf) ist am 26.08.2026 abgelöst worden und liegt unter
[`docs/plans/done/024-urlaubslauf/`](docs/plans/done/024-urlaubslauf/). Seine
Übergabe nennt, was auf dem Gerät ohne Sitzung weiterläuft; für alles Ältere
verweist sie auf die Übergabe des Vorgängers
[`docs/plans/done/023-feature-audit/UEBERGABE.md`](docs/plans/done/023-feature-audit/UEBERGABE.md)
— dort stehen die **acht Fallen**, die einen halben Tag gekostet haben. Sie
gelten weiter.

Eine Aufgabe gilt erst als erledigt, wenn ihre Abnahme **live auf dem Orin**
belegt ist, nicht wenn der Branch gemerged wurde.

`docs/plans/active/` enthält **höchstens einen** Plan und ist normalerweise
leer. Das ist keine Konvention, sondern eine Prüfung: `scripts/test/plan-faden.py`
schlägt fehl, sobald dort zwei liegen. Ein Plan dort ist ein Einzelauftrag, kein
zweiter Faden neben dem Überordner. Angefangene, aber ruhende Pläne liegen unter
[`docs/plans/paused/`](docs/plans/paused/README.md) mit einem Satz, warum sie
ruhen und was noch offen ist.

**Ziele kommen von außen.** Was dieses Repo bis wann können muss, entscheidet
das Steuer-Repo, nicht dieses hier. Hier steht, _wie_ gebaut wird. Wer ein Ziel
ohne Bezug zu einer Phase oder Abnahme findet, hat eine Idee gefunden, keine
Aufgabe.

**Die acht Abnahmen** (A1 bis A8) haben am 26.08.2026 die sieben Verkaufs-Gates
ersetzt; G5 Recht bleibt bei Kolja außerhalb der Abnahmen. Ihr Stand steht in
`#roadmap-meta` von [`docs/plans/ROADMAP.html`](docs/plans/ROADMAP.html), alle
`open`, und wird aus einer Messung gesetzt, nie von Hand; der Überordner liest
ihn mit `roadmap-build.py`. Achtung: der Themenspeicher auf derselben Seite
stammt aus der Zeit **vor** Plan 023 und ist nicht der laufende Faden.

**Die vier Befehle** sind der Mechanismus, nicht die Quelle: `/plan` (Interview
zu einer Planseite), `/work` (autonome Ausführung bis zum Live-Verify auf dem
Jetson — bleibt für **Einzelaufträge**, die keine Phase des Überordners sind),
`/audit` (Scan zu Befunden), `/status` (Lagebild). Sie liegen als Skills unter
`.claude/skills/`, nicht als Befehle unter `.claude/commands/` — den Ordner gibt
es nicht.

**Nichts in diesem Repo läuft nach Uhrzeit.** Ein langer autonomer Lauf wird
von Hand gestartet: `./scripts/util/autonom-run.sh` (führt `/work --autonom`
aus, Voreinstellung fünf Stunden, `ARASUL_LAUF_STUNDEN=30` für einen Lauf über
einen Tag hinaus). Er mergt **einmal je Plan-Phase**, nicht je Aufgabe — am
24.08.2026 waren es sonst elf Deploys in 66 Minuten.

## Quick reference

### Entry points

| Domain      | File                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js` → `routes/index.js`            |
| Frontend    | `apps/dashboard-frontend/src/App.tsx`                                |
| Database    | `services/postgres/init/` (next migration = highest NNN on disk + 1) |
| LLM Service | `services/llm-service/api_server.py`                                 |
| Setup       | `scripts/interactive_setup.sh`                                       |
| Bootstrap   | `./arasul bootstrap`                                                 |

### Commands

```bash
docker compose up -d                               # Start all services
docker compose up -d --build <service>             # Rebuild one service
docker compose logs -f <service>                   # Stream logs
docker compose ps                                  # Service status (incl. health)
docker exec -it postgres-db psql -U arasul -d arasul_db   # DB shell
make build s=dashboard-frontend                    # Makefile shortcut
make logs s=dashboard-backend                      # Logs via Make
./scripts/test/run-tests.sh --all                  # All tests
```

### Debugging

| Symptom             | Command                                                |
| ------------------- | ------------------------------------------------------ |
| Service won't start | `docker compose logs <service>`                        |
| DB problem          | `docker exec postgres-db pg_isready -U arasul`         |
| LLM not responding  | `docker compose logs llm-service`                      |
| GPU status          | `docker exec llm-service nvidia-smi` (or `tegrastats`) |

## Documentation

| Topic                  | File                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Architecture           | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                                           |
| API reference          | [docs/api/API_REFERENCE.md](docs/api/API_REFERENCE.md)                                                                 |
| API errors             | [docs/api/API_ERRORS.md](docs/api/API_ERRORS.md)                                                                       |
| Database schema        | [docs/api/DATABASE_SCHEMA.md](docs/api/DATABASE_SCHEMA.md)                                                             |
| Design                 | [docs/development/DESIGN.md](docs/development/DESIGN.md)                                                               |
| Development            | [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md)                                                     |
| Onboarding             | [docs/development/ONBOARDING.md](docs/development/ONBOARDING.md)                                                       |
| Testing                | [docs/development/TESTING.md](docs/development/TESTING.md)                                                             |
| Environment variables  | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)                                                         |
| Platform compatibility | [docs/features/PLATFORM_COMPATIBILITY.md](docs/features/PLATFORM_COMPATIBILITY.md)                                     |
| Admin handbook         | [docs/ops/ADMIN_HANDBUCH.md](docs/ops/ADMIN_HANDBUCH.md) (DE)                                                          |
| Deployment             | [docs/ops/DEPLOYMENT.md](docs/ops/DEPLOYMENT.md)                                                                       |
| Troubleshooting        | [docs/ops/TROUBLESHOOTING.md](docs/ops/TROUBLESHOOTING.md)                                                             |
| Backup & DR            | [docs/ops/BACKUP_SYSTEM.md](docs/ops/BACKUP_SYSTEM.md), [docs/ops/DISASTER_RECOVERY.md](docs/ops/DISASTER_RECOVERY.md) |
| Flows                  | [docs/features/FLOWS.md](docs/features/FLOWS.md) (Definitionen, Argumente, Werkzeuge, Läufe, externer Trigger)         |
| Legal / DSGVO          | [docs/legal/](docs/legal/) (AVV-Vorlage, Datenschutz-Module, Drittland-Konnektoren)                                    |
| Full doc index         | [docs/INDEX.md](docs/INDEX.md)                                                                                         |
| Contributing           | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                     |
