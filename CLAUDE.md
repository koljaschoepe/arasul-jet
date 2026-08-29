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
Shell dem Thema und steht in einer App allein auf dem Rückfall. Zwei Ausgänge,
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
Seit **H1** (29.08.2026) gehört das **Theme dem Menschen**, und es sind zwei
statt drei. »Schwarz« ist gefallen: es unterschied sich von »Dunkel« um zwei
Hintergrundstufen, und jede Farbentscheidung, jede Abnahmetabelle und jedes
Bild gab es dreimal statt zweimal. Es bleiben **Hell** (Vorgabe) und
**Dunkel**. Der Wert steht in `admin_users.theme` (Migration 180) statt im
`localStorage` des Browsers — auf einer Standardsoftware, an der sich Menschen
anmelden, gehört eine Einstellung zu dem, der sie gemacht hat, und nicht zu
dem Rechner, vor dem er zufällig saß; wer sie an einem Gerät umstellt, sieht
sie am nächsten wieder. Sie fährt in `GET /api/auth/session` mit (die Shell
kennt sie damit, bevor sie das erste Mal malt, und braucht keine dritte
Anfrage auf einem Seitenaufbau — die zwei, die es gibt, sind seit G2 die enge
Stelle), gesetzt wird sie über `PUT /api/darstellung`. In `index.css` ist
`:root` jetzt **Hell** und `[data-theme='dark']` trägt alles, was abweicht;
die Klasse `.light` ist weg, denn Hell braucht keinen Selektor, und mit ihr
44 Regeln, die auf Klassen zielten, die es im TSX seit dem Umbau nicht mehr
gibt. Was dabei blieb und **entpräfixt** wurde: Tabellen, Formularfokus und
der Druck — sie sind ganz in Theme-Variablen geschrieben, gelten also in
beiden Themes, und der Druck kam bis dahin im dunklen Theme mit dunklem
Hintergrund aus dem Drucker. Gefallen ist auch das Durchschalten
(`toggleTheme` und die Prop-Kette `theme`/`onToggleTheme` durch vier Ebenen,
die niemand mehr las) und das Theme-Skript in `index.html` — es konnte den
Wert gar nicht mehr kennen, weil erst die Sitzungsprobe sagt, wer da ist.
Der alte Browser-Wert wird **einmal übernommen**: der Schlüssel
`arasul_theme` stand nur im Speicher, wenn jemand aktiv umgestellt hat, also
ist seine Anwesenheit eine Entscheidung; `black` und `dark` werden beide zu
`dark`, danach ist er weg. Gemessen wird das mit
`scripts/test/theme-abnahme.mjs`: ein Mensch stellt in den Einstellungen
Dunkel ein, meldet sich in einem **zweiten Browserkontext** neu an — eigene
Cookies, eigener Speicher — und sieht Dunkel; dazu Übersicht und
Einstellungen in beiden Themes bei 390, 1024 und 1440 px, jeweils mit der
Frage, ob die Fläche wirklich die des Themes ist (zwei Bilder, die gleich
aussehen, sind der häufigste stille Fehlschlag eines Theme-Umbaus). Die Reihe
läuft **neben** `abnahmen.sh` wie die fünf Browser-Abnahmen aus D2 bis D6 und
kostet zwei Anmeldungen. Die **Anmeldeseite hat kein Theme**, und das ist kein
Mangel: vor der Anmeldung ist kein Mensch da, also gilt die Vorgabe. Die
Frage, ob eine **App** dem Theme folgt, hat **H2** beantwortet.

Seit **H2** (29.08.2026) **folgt die App im Rahmen dem Theme, und der Wechsel
lädt sie nicht neu**. Eine App läuft im iframe als eigenes Dokument, und
CSS-Variablen reichen nicht über eine Dokumentgrenze — bis H2 stand jede App
auf den Rückfallwerten von `packages/marken/`, und die waren die des dunklen
Themes: eine helle Shell mit einer dunklen App darin, und der Mensch sieht
beides als ein Ding. Deshalb hat `marken.css` jetzt **dieselbe Form wie
`index.css`**: `:root` ist Hell, `[data-theme='dark']` trägt die zehn Werte,
die abweichen. Nur die zehn — was `index.css` im Dunkeln nicht überschreibt
(Fehler, Erfolg, Warnung, Schrift, Abstände), steht auch hier nur einmal.
Hineingereicht wird es über die **gleiche Herkunft**, die es zwischen Shell
und Rahmen ohnehin gibt (deshalb steht am iframe kein `sandbox`, C4):
`AppRahmen` schreibt `data-theme` in das Dokument der App, bei jedem Wechsel
und bei jedem `load` — **die App muss dafür nichts tun**, die Beispielapp hat
keine Zeile dafür. Dazu geht `postMessage {typ:'arasul:theme', theme}` an ihr
Fenster, für eine App, die mehr tut als Farben tauschen; und weil am Dokument
Hell **ohne** Attribut steht (H1), ist die Nachricht der einzige Weg, der den
Wert ausdrücklich nennt. Die Vorlage des Ara-Kits liest daneben das `<html>`
des Elternfensters mit einem `MutationObserver` — dieselbe Sache aus einer
dritten Richtung, und sie braucht von hier nichts.
**Ohne Neuladen** war dabei nicht die Frage, wo das Theme steht, sondern eine
Frage an die Shell: das Theme steht weder im `key` noch in der Adresse des
iframes, aber der Weg eines Menschen zum Schalter führt in den
**Einstellungs-Tab** — und `TabContent` mountete nur den aktiven Tab, also
starb der App-Tab dabei, egal was `AppRahmen` tut. **Ein App-Tab bleibt jetzt
stehen**, auch wenn er nicht vorn ist; jede andere Ansicht wird weiter
abgeräumt, denn ihr Zustand liegt im Query-Cache über der Shell. Eine App
verliert damit auch kein halb ausgefülltes Formular mehr, wenn jemand
kurz auf seine Notizen sieht.
Und die **eine Quelle ist prüfbar geworden**: jeder `--ara-*`-Rückfall in
`marken.css` ist eine Kopie eines Tokens aus `index.css`, und in der Shell
gewinnt immer der Token — eine veraltete Kopie fällt dort **nie** auf,
sondern nur in einer App, die gerade niemand ansieht. `scripts/test/marken.py`
hält deshalb jeden Rückfall an seinem Token fest (Hell gegen `:root`, Dunkel
gegen `[data-theme='dark']`) und beide Richtungen der Vollständigkeit; beim
ersten Lauf hat er gleich ein Auseinanderlaufen gefunden
(`--ara-schrift-fest` ließ zwei Schriften der Shell weg). `browser/marken.js`
ist **unverändert** — das Stylesheet liegt nicht im Bündel, und der Neubau
liefert Byte für Byte dieselbe Datei. Eine App am Gerät bekommt die neue
`marken.css` erst beim **nächsten Einspielen**: sie liegt neben der App und
nicht in der Shell.
Der Lauf der Theme-Abnahme gegen den Orin **vor** dem Deploy hat dabei einen
Fund gemacht, der nicht der App gehörte, sondern der Shell: **jede dunkle
Zelle war rot**, an jeder Breite, und `<html>` meldete brav
`data-theme="dark"` samt `--background: #141414`, während
`getComputedStyle(document.body).backgroundColor` bei `rgb(246, 246, 246)`
blieb. Nicht der Übergang (`transition: background-color`, die Vermutung aus
H1), sondern der `<style>`-Block in `index.html`, der die Zehntelsekunde vor
dem Stylesheet färbt: er stand **ohne Schicht** da, und ungeschichtetes CSS
gewinnt gegen jede `@layer` — auch gegen `@layer base`, wo `body` seine Farbe
aus `var(--background)` bekommt. Der Hintergrund der Seite war damit auf
`#f6f6f6` genagelt und die geerbte Textfarbe auf `#1a1a1a`, also fast schwarz
auf dunkel. Die Datei warnte im eigenen Kommentar vor genau dieser Falle
(„Do NOT add `* { margin/padding }` here") — nur nicht über ihre eigene
`body`-Regel. Der Block steht jetzt in `@layer flackerschutz`, und weil er vor
dem `<link>` steht, ist das die **unterste** Schicht: er färbt weiter, was er
färben soll, und verliert, sobald das Stylesheet da ist. Am selben Bau
gegengeprüft, einmal mit und einmal ohne Schicht: ohne bleibt `body` im
dunklen Theme bei `rgb(246, 246, 246)`, mit steht `rgb(20, 20, 20)` da.
`check-design-system.js` hält die Regel — kein ungeschichtetes CSS in
`index.html`.

Seit **H3** (29.08.2026) ist `packages/marken/` eine **Komponentenbibliothek**
und nicht mehr nur ein Stylesheet mit sechs Bausteinen. Die sechsundzwanzig
Primitive, aus denen eine Oberfläche besteht — Button, Input, Textarea, Label,
Select, Checkbox, RadioGroup, Switch, Dialog, AlertDialog, Sheet, Popover,
Tooltip, DropdownMenu, ContextMenu, Tabs, Card, Badge, Alert, Toast, Avatar,
Separator, Skeleton, Progress, ScrollArea, Breadcrumb —, lagen bis dahin in
einem Ordner `shadcn` unterhalb der Shell und gehörten damit **ihr allein**: eine App, die einen Knopf brauchte, baute ihren eigenen, und
der sah anders aus. Sie stehen jetzt in `packages/marken/src/primitive/`, die
Shell holt sie über `@marken` wie jeder andere auch. Dreizehn davon gab es
noch nicht; alle auf `radix-ui`, das schon im Lockfile stand — **keine neue
Abhängigkeit**.
Mit ihnen gezogen sind die **Tokens**: `packages/marken/src/theme.css` trägt
seither die zwei `@theme`-Blöcke und die shadcn-Semantik beider Themes, und
`index.css` holt sie von dort. Das ist die Umkehr von H2 — bis dahin war die
Shell die Quelle und die Bibliothek trug die Kopie; seit die Primitive auf
Tailwind geschrieben sind (`bg-secondary`, `text-muted-foreground`), braucht
**eine App** den Block genauso, und hätte ihn sonst abschreiben müssen. Zwei
Zeilen entscheiden dabei, ob es überhaupt geht: der Import trägt **keine
Schicht** (ein `@theme` in `layer(...)` ist keins mehr), und
`@source "../../../packages/marken/src"` sagt Tailwind, wo die Klassen der
Primitive liegen — ohne das stünden sie in der Shell ohne jede Regel da, und
nichts an der Übersetzung wäre rot.
**Zwei Sätze, zwei Laufzeiten, und das ist keine Doppelung.** Die Primitive
brauchen einen Bau; die sechs Bausteine aus D7 (Kopf, Liste, Karte, Formular,
Meldung, Menü) sind auf reinem CSS geschrieben und laufen in einer App **ohne**
Bau. `browser.ts` gibt deshalb nur die Bausteine aus und `browser/marken.js`
trägt weiter nur sie — eine App ohne Tailwind bekäme sonst sechsundzwanzig
Bausteine, von denen kein einziger aussieht wie etwas.
Drei Dinge, die keine Verschiebung waren: `cn()` musste mit (ein Baustein der
Bibliothek darf nicht aus der Shell importieren, `marken.py` Punkt 4), also ist
`@/lib/utils` gefallen; die **Checkbox** steht auf Radix statt auf einem
eigenen `appearance-none`-Input — der Grund für die Handarbeit war richtig, die
Lösung war eine Wette gegen eine geprüfte Bibliothek; und die **Meldungen**
waren achtzig Zeilen `.toast-*` in `index.css`, wo eine App sie nie erreicht
hätte (das Aussehen ist jetzt ein Primitiv, die Warteschlange bleibt in
`ToastContext` — die weiß die Anwendung).
Die **Schauseite** steht unter `/entwickler/bausteine`, in keinem Menü: sie
zeigt jedes Primitiv in allen Zuständen, die es wirklich kennt. Sie gibt es,
weil eine Bibliothek ein Problem hat, das keine andere Abnahme findet — ein
Baustein, den heute niemand benutzt, sieht in einem der beiden Themes falsch
aus, und es merkt erst der, der ihn in einem halben Jahr auf der Seite eines
Kunden einsetzt. `scripts/test/schauseite.mjs` macht Bilder hell und dunkel bei
390, 1024 und 1440 px und fragt je Zelle vier Dinge: stehen alle Stücke da, ist
die Fläche die des Themes, rollt es waagerecht, schweigt die Konsole. Sie läuft
**neben** `abnahmen.sh` und kostet **eine** Anmeldung.
Drei Wächter halten das: `marken.py` meldet ein **Farbliteral** in einem
Baustein (Hex, `rgb()` **oder** eine Klasse aus Tailwinds eingebauter Palette —
`bg-black/50` folgt keinem Thema; der Schleier unter jedem Dialog ist deshalb
ein Token geworden) und einen Namen, den zwei Barrels ausgeben;
`bausteine.py` meldet einen Namen der Bibliothek, den die Shell noch einmal
erklärt, und ein Primitiv **ohne Schaustück**. `knip` sieht die Bibliothek
nicht (es kommt über die Wurzel des Frontends nicht hinaus), also stehen ihre
vier Pakete mit diesem Grund in `ignoreDependencies`.

Seit **H4** (29.08.2026) ist der Satz **vollständig**, und über ihm steht ein
dritter. Die zwanzig Primitive, die noch fehlten — Accordion, AspectRatio,
Calendar, Carousel, Chart, Collapsible, Command, DatePicker, Form, HoverCard,
InputOTP, Menubar, NavigationMenu, Pagination, Resizable, Sidebar, Slider,
Table, Toggle, ToggleGroup —, sind gebaut; das sind **46**. Zwei aus shadcns
Liste sind es **nicht** und mit Absicht: `Drawer` ist `Sheet side="bottom"`,
`Sonner` ist `Toast` samt der Warteschlange in `ToastContext`. Zwei Bausteine
unter einer Sache sind die Verwechslung selbst — derselbe Grund, aus dem
`marken.py` (Punkt 7) keinen Namen zweimal duldet. Und `Combobox` ist kein
eigener Name, sondern das Muster **`Suchauswahl`**.

Denn darüber steht seit H4 der dritte Satz: die **Muster**
(`packages/marken/src/muster/`, sieben Stück) — Datenliste, Suchauswahl,
Dateiablage, Seitenleiste, Formularseite mit Feldgruppe, Leerzustand,
Ladezustand. Der Unterschied zu einem Primitiv ist die **Höhe**, nicht die
Laufzeit: ein Primitiv ist ein Teil, ein Muster ist eine **Form**. Wer mit H3
eine Fachanwendung baute, schrieb für eine sortierbare Liste mit Suchfeld,
Leerzustand und einer Form für kleine Fenster rund zweihundert Zeilen, und die
nächste Anwendung schrieb zweihundert andere — genau daraus sind vor Plan 023
die zwanzig Kopfstellen mit derselben Klassenkette entstanden. Ein Muster weiß
trotzdem nichts von Arasul: `Datenliste` bekommt Zeilen, `Seitenleiste` bekommt
Einträge. Was eine Route, einen Endpunkt oder einen Benutzer kennt, bleibt in
der Shell.

**Vier der sieben Muster gab es schon, in der Shell.** `Section`/`SectionList`,
`EmptyState` und `LoadingSpinner` wissen nichts von Arasul und sind
umgezogen statt daneben gebaut worden — sie heißen jetzt
`Feldgruppe`/`Formularseite`, `Leerzustand` und `Ladezustand`, und ihre Props
sind deutsch wie die der übrigen Bibliothek. Dasselbe für `Chart`/`Sparkline`
(jetzt ein Primitiv) und für `useSchmalesFenster`: der Hook trägt die **eine**
Schwelle des Produkts (900 px), und `Sidebar` und `Datenliste` brauchen sie —
ein Baustein der Bibliothek darf aber nicht aus der Shell importieren
(`marken.py`, Punkt 4). Er steht bei den **Bausteinen**, weil er reines React
ist und keinen Bau braucht; das Bündel `browser/marken.js` gibt ihn seither
mit aus. Mit `Chart` sind auch seine Tokens gewechselt: es stand auf
`--text-muted`, `--bg-card` und `--shadow-md`, und das sind Aliasse der Shell
aus `index.css`, die es in einer App nicht gibt. Jetzt stehen dort die Tokens
aus `theme.css`; der Schatten am Tooltip ist ersatzlos gefallen, denn ein
fester Wert an seiner Stelle wäre eine Farbe ohne Token.

**Vier Abhängigkeiten von außen** kamen dazu, und nur vier: `cmdk` (Suchliste),
`react-day-picker` (Kalender), `embla-carousel-react` (Karussell), `input-otp`
(Einmalcode). Alles andere steht auf `radix-ui`, `react-hook-form`,
`react-resizable-panels` und `recharts`, die schon im Lockfile standen. Sie
stehen mit ihrem Grund in `knip.json` — knip sieht die Bibliothek nicht.
Gemessen am fertigen Bau kosten die drei, die nur die Schauseite braucht,
**153 kB roh und 48 kB gzip**, und Vites selbsttätige Aufteilung legt sie in
den gemeinsamen Brocken, den schon die Anmeldeseite lädt. Das steht als
offener Punkt im PR und ist mit Absicht nicht behoben: `manualChunks` würde
die in `vite.config.ts` festgehaltene Entscheidung umkehren, und die lässt
sich ohne Browser nicht gegenprüfen.

Die **Schauseite** liegt seither in drei Dateien (`Schauseite.tsx` als Rahmen
mit den H3-Stücken, `SchaustueckeH4.tsx`, `SchaustueckeMuster.tsx`) —
dreiundfünfzig Stücke in einer Datei findet niemand mehr; `bausteine.py` liest
deshalb den ganzen Ordner `entwickler/`, verlangt auch je Muster ein
Schaustück und vergleicht ohne Rücksicht auf Groß- und Kleinschreibung (aus
`input-otp.tsx` würde sonst `InputOtp`, und der Aufrufer tippt `InputOTP`).
Der Test dazu zählt seine Erwartung nicht mehr als Zahl, sondern liest die
Ordner mit `import.meta.glob` — eine Zahl, die jemand von Hand nachzieht,
misst irgendwann die Pflege statt das Produkt.

Und der Fund vom Orin ist zu: **ein Schaustück rollt in seinem eigenen
Kasten**. Die Zelle „1024 px · hell" meldete „1039 gegen 1024", und zu sehen
war nichts; mit Tabelle, Kalender, Diagramm und Seitenleiste wäre das bei
390 px die Regel geworden. Der Zustandsblock jedes Stücks trägt jetzt
`overflow-x-auto` **und** `position: relative` (ohne das entkommt ein absolut
gesetztes Kind dem Kasten und zählt zur Rollbreite des Dokuments — der Fund
aus G1). Dazu **nennt die Reihe das Element**: sie fragt jedes, dessen rechter
Rand über die Sichtbreite hinausragt, und schreibt die drei äußersten mit
Wähler und Kante in die rote Zeile. Eine Zahl ohne Element ließ offen, ob es
eine Tabelle war, ein `.sr-only` in einem Knopf oder ein Kasten mit fester
Breite — drei Befunde mit drei verschiedenen Antworten.

Seit **H5** (29.08.2026) steht die **Shell auf der Bibliothek**, und der
Wächter darüber ist zum ersten Mal **scharf**. Drei Zusammensetzungen der
Shell wussten nichts von Arasul und sind Muster geworden: `Modal` und
`ConfirmModal` heißen `Dialogform` und `Bestaetigung` (die Frage steht seither
auf `AlertDialog` statt auf einem Dialog mit Kreuz — Escape, ein Klick daneben
und das Kreuz hießen alle drei stillschweigend „Abbrechen"), `StatTile` und
`StatGrid` heißen `Kennzahl` und `Kennzahlen`. **`FilterBar` ist ganz
gefallen**: es war eine zweite Tab-Leiste neben dem Primitiv `Tabs` — dieselbe
Form, dieselbe Semantik, eine eigene Tastaturmechanik gegen eine geprüfte
Bibliothek. **`DashboardCard` ebenso**, eine zweite Karte neben `Card`, die an
ihrer Stelle nichts tat, was `Feldgruppe` nicht tut. Die drei Sidebar-Spalten
zeigen jetzt dieselbe `Liste` wie das Hamburger-Menü aus D7 (bis dahin zweimal
geschrieben); was der Bibliothek dafür fehlte, war `dicht` — fingerbreit ist
richtig für ein Telefon und zu groß für eine Seitenspalte.
Übrig in `components/ui/` sind **vier**, und jede weiß etwas über dieses Gerät:
`AuthCard`, `Skeleton.tsx`, `NichtGefunden`, `ErrorBoundary`. Damit ist der
Ausnahmeordner von `bausteine.py` weg, und ein `h1`, eine Tab-Leiste, eine
Feldgruppen-Trennlinie oder ein handgebauter Dialog ist **überall** unter
`src/` ein Befund. Er hat beim ersten scharfen Lauf gleich zwei `h1` gefunden;
beide sind jetzt `Kopf mittig` — die Form einer Seite, die aus nichts als sich
selbst besteht.
**Der aktive Zustand ist keine Farbe mehr.** Er ist Schriftstärke und, wo keine
Schrift steht, eine Linie: am Reiter (`border-foreground` statt
`border-primary`), am Symbol der Aktivitätsleiste, an der Zeile der Sidebar.
Der Grund ist nicht Geschmack — `bg-accent` bedeutete daneben „hier ist gerade
die Maus", und wer sie stehen ließ, sah zwei aktive Einträge; ein Akzent, der
zugleich „tu das hier" und „hier bist du" heißt, heißt beides nicht mehr.
Ebenso wenig trägt er einen Zustand: eine erfüllte Passwortregel ist grün, ein
gesunder Dienst ist grün, ein Häkchen nach einer Aktualisierung ist grün.
Und die **Texte sagen, was das Gerät ist**: statt „Edge-KI Verwaltungssystem"
und „Edge-AI-Plattform für NVIDIA Jetson, Multi-Jahres-Betrieb" steht dort
jetzt, dass die Software im Haus läuft und die Apps hostet, die das
Unternehmen braucht.
**Das Bündel ist kleiner als vor H4**, und die Ursache war nicht die Zahl der
Primitive. `App.tsx`, `Login` und fünf weitere Dateien werden nicht
nachgeladen, sondern stehen im Einstieg, und jede holt etwas aus `@marken`;
ohne die Auskunft „diese Bibliothek hat keine Seiteneffekte" behält Rollup
jedes Modul, das über das Barrel erreichbar ist. Damit lag seit H4 der ganze
Satz im ersten Bündel, mitsamt `recharts`, `cmdk`, `react-day-picker`,
`embla-carousel` und `input-otp`. Die übliche Auskunft dafür wäre
`"sideEffects": false` in einer `package.json` — die hat die Bibliothek mit
Absicht nicht (Pfad-Alias, kein npm-Paket, Regel 7). Sie steht jetzt als
`treeshake.moduleSideEffects` in `vite.config.ts`, an derselben Stelle wie der
Alias. Am fertigen Bau gemessen (gzip, `index.html` plus alles, was es als
`modulepreload` nennt): **H3 208,20 kB → H4 388,95 kB → H5 161,77 kB**. Es war
nie etwas dazugekommen, was ein Mensch beim Anmelden braucht — es war von
„später" nach „sofort" gerutscht.
Zwei Meßgeräte kamen dazu. Der **Bilderbogen**
(`scripts/test/bilderbogen.mjs`) ist eine **Kamera** und kein Messgerät: zwanzig
Ansichten mal zwei Themes mal drei Breiten, einmal `--stand vorher` und einmal
`--stand nachher`, damit ein Mensch sie nebeneinanderlegen kann. Er fragt
nichts außer „steht die Ansicht da". Das Breitenraster und die Liste der
Verwaltungsansichten teilt er sich mit der Oberflächen-Reihe über
`scripts/test/ansichten.mjs` — zwei Leser sind der Augenblick, in dem eine
Liste in zwei Dateien auseinanderläuft.
Und der **eine rote Fleck der Theme-Abnahme ist zu**, seit H2. Die Zelle „im
Hellen sagt das Dokument der App »hell«" war nicht rot, weil das Dokument im
Hellen kein Attribut trägt — `themaAus` nimmt `null` seit H3 als »hell«, und
zehn Zellen daneben melden genau so grün. Sie war rot, weil der Abschnitt
davor — der Kern von H1 — das Gerät auf **dunkel** stellt und stehen lässt,
und diese Probe mit „im Hellen" anfing, ohne es herzustellen. Sie stellt es
jetzt selbst ein, wie jeder andere Abschnitt der Reihe: **47 von 47 grün**,
gemessen am Orin.

Seit **H6** (29.08.2026) geht die Bibliothek als **Paket** hinaus, und eine
App sagt, worauf sie steht. Bis H5 hatte sie einen Ausgang nach draußen: das
eingecheckte Bündel für eine App ohne Bau. Wer eine App **mit** Bau schrieb,
nahm „die Quelle" — und das hieß irgendein Ordner in irgendeinem Checkout. Das
Ara-Kit spiegelt sie aus dem Auslieferungsartefakt und liest dort einen
**flachen** Ordner; seit H3 liegen die Primitive in `primitive/`, seit H4 die
Muster in `muster/`, und ein Spiegel, der nur die oberste Ebene mitnimmt, trägt
eine `index.ts`, die auf zwei Ordner zeigt, die es bei ihm nicht gibt.
`scripts/deploy/marken-paket.py` beantwortet die Frage, **was dazugehört**,
einmal und nachprüfbar: `marken.json` nennt die Fassung, die Abhängigkeiten und
jede Datei mit ihrem sha256 — rekursiv. **Das Paket ist, was `marken.json`
nennt**; was er nicht nennt (`__tests__/`, `browser.ts`, `vite.config.mjs`),
gehört nicht dazu. Darum gibt es zwei Aufrufe und trotzdem keine zwei
Wahrheiten: `--ausgabe` legt das Paket als eigenen Ordner hin (das nimmt ein
fremdes Projekt, das spiegelt das Kit), `--stempel` schreibt nur die
`marken.json` — so trägt das **Artefakt aus C10** das Paket, ohne die
Bibliothek ein zweites Mal mitzuschleppen. Die **Abhängigkeiten sind gelesen,
nicht gepflegt**: jeder Import aus `src/`, der kein relativer Pfad ist, muss in
der `package.json` der Shell stehen, und von dort kommt die Version — eine
neue Abhängigkeit steht ohne Zutun im Paket, eine, die niemand installieren
kann, bringt den Bau zum Stehen. Gemessen wird **außerhalb dieses Repos**
(`scripts/test/marken-paket-abnahme.sh`): ein frisches Vite-Projekt in einem
Temp-Ordner, die Abhängigkeiten aus dem Stempel, `src/` hinein, `tsc --noEmit`
und `vite build`, und danach die Frage, ob im Ergebnis wirklich die Bibliothek
steht (`.ara-karte` aus `marken.css`, `--background` und der Dunkel-Block aus
`theme.css`, `bg-secondary` als Beleg, dass Tailwind die Primitive gefunden
hat). Hier baut die Bibliothek immer — die Shell steht daneben, mit ihrem
Alias, ihrer `package.json` und ihrem `node_modules`; ein Paket, das nur im
eigenen Repo baut, ist keins.
Und **eine App sagt, auf welcher Fassung sie steht**: `app.json` kennt seit H6
das freiwillige Feld `marken` (`"3.1.0"`), `GET /api/apps` und
`GET /api/apps/:id` führen es je Stand mit, und die App-Verwaltung meldet in
der Karte des Standes eine Fassung, die älter ist als die der Shell — oder gar
keine. **Das Backend vergleicht nicht**: die Fassung der Bibliothek kennt die
Shell, weil sie sie mitübersetzt (`FASSUNG` aus `@marken`), und eine zweite
Zahl im Backend wäre eine, die eines Tages etwas anderes sagt. **Kein Rot**:
eine App mit einer alten Bibliothek läuft, sie sieht nur nicht mehr aus wie das
Gerät um sie herum — das ist etwas anderes als `lieferbar: false`. Freiwillig
ist das Feld, weil jede App vor H6 es nicht hat und ein Manifest daran
scheitern zu lassen hieße, eine laufende App an einer Auskunft zu messen, die
es zu ihrer Bauzeit nicht gab. `marken.py` hat einen achten Punkt bekommen: die
Beispielapp nennt die Fassung, die `marken-beilegen.sh` ihr wirklich danebenlegt
— sonst hätte der Vorgang, für den H6 gebaut ist, sein erstes falsches Beispiel
im eigenen Repo.

Seit **H7** (29.08.2026) **hat eine App einen Speicher, und der Kontrakt sagt,
wie ihre Werte heißen**. Bis dahin bekam eine App ein Netz, eine
Speichergrenze und zwei Umgebungswerte — keinen Ort, an dem etwas liegen
bleibt. Die Werkstatt hat den Ausweg von Hand genommen: Rolle und Datenbank
per SSH im Plattform-Postgres, das Passwort in eine `.env`, die mit dem
nächsten Arbeitsbaum verschwand. Seither legt das **Gerät** an: je App und
**Stand** eine Datenbank samt eigener Rolle (`arasul_app_<id>_<stand>`,
Migration 181, `services/app/appDatenbank.js`), Adresse als `ARASUL_DB_URL` in
der Umgebung des Containers. Je Stand, weil ein Probelauf die Daten des
Livestandes nicht anfassen darf — dieselbe Trennung wie beim Schlüssel aus C4;
der Livestand behält seine Daten über jeden Versionswechsel. **Es ist nur ein
Ort**, und das ist die Entscheidung: kein Datenordner daneben, denn zwei Orte
hießen zwei Antworten auf jede Frage des Betriebs (was wird gesichert, was
holt ein Weg zurück wieder herein, was fällt beim Entfernen weg) — eine
hochgeladene Datei gehört damit in eine Spalte und ist mitgesichert, ohne dass
jemand daran denken muss. Das Passwort würfelt **nicht** jedes Einspielen neu,
anders als der API-Schlüssel: Docker startet mit `unless-stopped` neu und
behält die alte Umgebung, ein neues Passwort wäre für den Container ein
verlorener Zugang; es liegt verschlüsselt in `app_datenbanken`. Der ganze Weg
ist zu — die Sicherung nimmt jede App-Datenbank mit (gefragt wird
`pg_database` nach dem Präfix und **nicht** die Tabelle: eine Datenbank, deren
Zeile jemand verloren hat, wäre sonst unsichtbar _und_ unwiederbringlich), der
Weg zurück legt sie wieder an und spielt sie ein, das Backend setzt beim Start
das richtige Passwort dazu, `DELETE /apps/:id` wirft sie weg, der Werksreset
räumt jede mit dem Präfix. Dazu verbindet sich mit `arasul_db` nur noch ihr
Eigentümer: eine App-Rolle käme an keine Tabelle, aber sehr wohl an den
Katalog.
Der **Kontrakt ist Fassung 5** und ändert drei Dinge, alle an dem, was das
Gerät mitgibt. `umgebung` nennt die Namen **in ihrer Rolle** (`basis`,
`schluessel`, `datenbank`) statt als Schlüssel einer Abbildung — das Kit las
`umgebung.basis`, fand nichts, und seine Vorlage ließ Adresse und Schlüssel
`null`: die App rief gar nicht erst an, und das Ergebnis sah aus wie ein Gerät
ohne Arasul. Kontrakt und Wirklichkeit stimmten dabei überein, es war allein
die Form. Jeder Endpunkt trägt seinen Weg **auch relativ zur Basis**
(`endpunkte[].relativ`, dazu `umgebung.praefix`): `ARASUL_API_URL` endet auf
`/api/v1/external` und die Pfade fangen damit an, aneinandergehängt ergab das
`/api/v1/external/api/v1/external/…` und einen 404 — zwei Angaben, die einzeln
stimmen, und ein Weg, den es nicht gibt. Ein Endpunkt außerhalb bekäme `null`;
die OpenAI-kompatible Schnittstelle unter `/v1` lässt sich gegen diese Basis
gar nicht ausdrücken, und eine ausgerechnete Antwort wäre eine falsche.
Und **zwei Zusagen hält die Route jetzt**: `GET /flows/runs/:id` liefert
`schritte` (versprochen seit C5, geliefert wurde `steps_used` — eine **Zahl**,
keine Kette; eine App konnte sagen, _dass_ es einen Lauf gab, nicht was darin
geschah), `GET /freigaben` liefert `zusammenhang`, den Text, **an dem**
entschieden wurde.
**Die Lizenz zählt Apps im Betrieb, nicht Teststände.** Der Riegel steht seit
H7 beim Schalten nach live und nicht beim Einspielen. Am Orin standen drei von
drei belegt — `beispielapp`, `angebot`, `urlaubsantrag` —, ohne dass eine
einzige in Betrieb gewesen wäre; ein Partner mit drei gekauften Apps hätte die
vierte nicht einmal **bauen** können, um eine der drei zu ersetzen. Was ein
Mitarbeiter benutzt, ist der Livestand; der Teststand ist die Werkbank.
**Das Standardmodell schickte ein Schema statt der Werte**, achtmal in drei
Läufen (`freigabe_anfordern`, Werkstatt W4). Zwei Stellen im Produkt gehören
dazu, beide zu: die Werkzeug-Antwort sagt jetzt, **zu welchem Aufruf** sie
gehört (`tool_name` für Ollama, `tool_call_id` und `name` für OpenAI) — ohne
das kann ein Modell mit mehreren Werkzeugen die Rückmeldung, an der es seinen
Fehler merken soll, keinem Aufruf zuordnen; und der Assistenten-Zug geht an ein
externes Modell **wortgleich** zurück statt in der übersetzten Ollama-Form ohne
`id` und mit Argumenten als Objekt. Dazu eine **Notbremse**: kommen die
Argumente als Hülle (`properties` mit den Werten eine Ebene tiefer, notfalls
als Zeichenkette), packt die Schleife sie einmal aus, statt achtmal gegen
dieselbe Wand zu fahren — und nur dann, wenn darunter die Namen liegen, die das
Werkzeug wirklich kennt. Gemeldet wird, was **ankam**.
**Die Anmeldedrossel zählt Fehlschläge, nicht Menschen.** Zehn Anmeldungen je
Viertelstunde und IP waren hinter Traefik zehn für das ganze Haus — dort ist
jede Anfrage dieselbe Adresse, und der elfte Mensch, der morgens sein Passwort
_richtig_ eintippt, kam nicht herein. `skipSuccessfulRequests` ist die
Änderung, nicht die Zahl (jetzt 30): eine gelungene Anmeldung ist kein Angriff.
Die scharfe Sperre steht woanders und weiß mehr — fünf Fehlversuche **je Konto**
sperren es fünfzehn Minuten (`record_login_attempt`); die Drossel kennt nur eine
IP, ihre Aufgabe ist das Sprayen über viele Konten. Die Buchführung der
Abnahmen zieht mit: die Kopfzeile wird geschrieben, _nachdem_ hochgezählt und
_bevor_ zurückgenommen wurde, der wahre Rest ist nach einer gelungenen Anmeldung
also einer mehr.
Und die **vier toten CSS-Familien aus G2 sind weg** (`.navigation`,
`.nav-bar`/`.nav-link`, `.msb-*`, `.modal-global`, dazu `.modal-overlay-global`):
508 Zeilen aus `index.css` samt ihren Media-Queries. Wo eine Regel mehrere
Selektoren führte, fiel nur der tote. `ROLLKAESTEN_OHNE_POSITION` in
`check-design-system.js` trägt damit noch **einen** Namen, und der lebt — eine
Ausnahme, die einen toten Kasten am Leben hält, ist selbst tot.

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

Phase **G2** (29.08.2026) hat zwei Reparaturen aus G1 gebracht, und bei beiden
war die genannte Ursache nicht die Ursache. Erstens **enthält ein Rollkasten,
was er wegrollt**: die Zelle „1024 px · Einstellungen · Mitarbeiter" meldete
„rollt waagerecht, 1039 gegen 1024", und zu sehen war nichts. Nicht
`useSchmalesFenster` (bei 1024 px ist das Fenster ≥ 900, die Tabellenform ist
gewollt, und sie rollt seit D4 in ihrem eigenen `overflow-x-auto`), sondern:
`overflow` klammert nur ab, was auch **in** dem Kasten liegt. Ein absolut
gesetztes Kind liegt in seinem nächsten **positionierten** Vorfahren — ist der
Rollkasten `position: static`, ist das irgendein Kasten weiter oben, und das
Kind entkommt: es rollt nicht mit, wird nicht abgeklammert, und seine Breite
zählt zur Rollbreite des **Dokuments**. Die `.sr-only` in den Knöpfen der
Tabelle sind je einen Pixel breit und standen bei x=1042. Deshalb tragen die
drei rollenden Utilities in `index.css` jetzt `position: relative` (nicht
`.overflow-hidden` — dort ist ein Kind, das herausragt, manchmal gewollt); am
Orin gegengeprüft über neun Ansichten mal drei Breiten: null verschobene
Elemente, und was heute überhaupt einem Rollkasten entkommt, ist ausschließlich
`.sr-only`. `check-design-system.js` hält die Regel (je Selektor, weil
`.navigation` sein `overflow-x` erst in einer Media-Query bekommt).

Zweitens **stand die enge Drossel vor dem Backend, nicht darin**. G1 hatte die
zwei Proben jeder Seitenladung von 30 auf 120 je Minute gehoben — wirkungslos,
denn auf dem ganzen Präfix `/api/auth` lag in **Traefik** eine zweite Drossel
mit 30 je Minute, und Traefik antwortet, bevor das Backend die Anfrage sieht.
Am Gerät gemessen: ab der zwölften Anfrage auf `/api/auth/needs-setup` kam 429,
während das Backend `remaining: 79 von 120` meldete. Eine Seitenladung kostet
zwei — ein Büro hinter einer NAT-IP war nach fünf Seiten dicht. Und sie war
**unsichtbar**: Traefiks `rateLimit` schickt keine `RateLimit-*`-Kopfzeilen
(das Traefik-README behauptete das Gegenteil), also meldeten drei Läufe „nie
auf eine Drossel gewartet" und wurden trotzdem rot. Seither haben die zwei
Proben ihre eigene Middleware (`rate-limit-auth-probe`, 120 je Minute, eigener
Router mit `Path` statt Präfix), `rate-limit-auth` behält seine 30 für die
Mutationen, `drosselzahlen.py` liest **vier** Stellen statt drei und verlangt
vom Vorbau nicht Gleichheit, sondern dass er nicht **enger** ist als das
Backend, und `drossel.mjs` zählt 429 **ohne** Kopfzeilen getrennt und nennt sie
in der Schlusszeile — das ist das Merkmal, an dem die beiden zu unterscheiden
sind.

Seit dem Auftrag **artefakt-aktualisiert-nicht** (29.08.2026, M2)
**aktualisiert das Artefakt**. Die Wurzel dahinter trug zwei Fehler auf einmal:
ein Gerät hat sein **Programm** und seinen **Zustand** im selben Verzeichnis,
jedes Artefakt bringt ein neues mit, und wer nicht weiß, wo der Zustand liegt,
rät. Der Kundenweg riet — ohne `.env` erzeugte `interactive_setup.sh`
bedingungslos neue Geheimnisse, während der feste Projektname
(`arasul-platform`) dieselben Volumes übernahm: alte Datenbank, neues Passwort,
und Geräte-CA, `data/apps`, Flows und Sicherungen blieben im alten Ordner
liegen. Und `deploy.yml` riet auch: es trug `/home/arasul/arasul/arasul-jet`
fest im Workflow, während der Live-Stapel aus `/home/arasul/arasul-<Fassung>`
lief — seit dem Werksreset war der Deploy rot (Lauf 33221221851) und es kam
nichts mehr automatisch auf das Gerät.
Seither wird **gefragt statt geraten**: `scripts/lib/installation.sh` liest, aus
welchem Verzeichnis der Stapel wirklich läuft (Dockers Etikett
`com.docker.compose.project.working_dir`), sonst einen Zeiger unter
`$HOME/.arasul`. `install.sh` übernimmt damit eine vorhandene Installation — der
Zustand **zieht um** statt kopiert zu werden (ein `rename`, die Bind-Mounts der
laufenden Container hängen am Inode), das alte Verzeichnis bekommt
`ABGEGEBEN.txt` und `./arasul` weigert sich dort; `--aktualisierung` baut die
Images, **während der alte Stapel noch läuft**, und schaltet ihn erst danach mit
`down --remove-orphans` ab (`up` hätte `docker-proxy` mit dem alten
`working_dir` stehenlassen, wie am 28.08. geschehen). Wo es zweideutig ist, hält
der Installer an: Volumes ohne auffindbare Installation, oder eine `.env` hier
und ein laufendes Gerät dort. **Was der Zustand ist, sagt die Liste des
Werksresets, rückwärts gelesen** — `scripts/test/zustand.py` hält beide
aneinander. Der Deploy fragt seit demselben Tag dasselbe und arbeitet damit im
selben Verzeichnis (ein Artefakt-Ordner bekommt sein `git init`, beim ersten Mal
werden alle Dienste gebaut, `arasul-release.json` fällt); **zusammengelegt sind
die zwei Wege nicht, und das mit Absicht** — ein Bootstrap je Merge wäre am Orin
ein Tagesgeschäft aus Vollbauten. Gemessen wird in der CI, nicht am Gerät
(`scripts/test/aktualisierung-abnahme.sh`: Artefakt A, Zustand anlegen, Artefakt
B darüber, nachzählen), weil A7 lief; der Lauf am Orin steht noch aus. Zwei
Funde am eigenen Werk sind schon eingearbeitet: das Artefakt bringt
`config/secrets/` selbst mit (`README.md`, `.example/`), also wird Eintrag für
Eintrag umgezogen — und mit den Rechten dieses Ordners kam aus dem Tar 755
statt 700, ein Update hätte die Geheimnisse still lesbar gemacht. Siehe
[`docs/ops/AUSLIEFERUNG.md`](docs/ops/AUSLIEFERUNG.md).

| Layer    | Stack                                                             | Path                                                                                              |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript          | `apps/dashboard-frontend/`, Designsystem `packages/marken/` (46 Primitive, 9 Muster, 6 Bausteine) |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                      | `apps/dashboard-backend/`                                                                         |
| AI       | Ollama (LLM) + Text-Extraktion (Indexer) + Embeddings             | `services/llm-service/`, `services/document-indexer/`                                             |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik v2.11      | `compose/`, `config/traefik/`                                                                     |
| Ops      | Self-Healing Agent + Metrics Collector + Backup Service           | `services/self-healing-agent/`, `services/metrics-collector/`                                     |
| DB       | PostgreSQL 16 (sequential migrations; next = highest on disk + 1) | `services/postgres/init/`                                                                         |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32–128 GB, CUDA 8.7–10.0)          | Detection: `scripts/setup/detect-platform.sh`                                                     |

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
