# Übergabe: was gerade läuft, was offen ist, wo man weitermacht

**Stand: 24.08.2026, 12:45.** Diese Seite ist für die nächste Sitzung
geschrieben, nicht für den Rückblick. Wer sie liest, soll ohne Chatverlauf
weiterarbeiten können.

Jede Zahl hier ist **abgeschrieben und trägt deshalb ein Datum**. Wer sie
braucht, holt sie aus der Live-Quelle: die Befehle stehen jeweils daneben.

---

## 1. Was ohne diese Sitzung weiterläuft

| Was                                               | Wo                                                | Überlebt                                        |
| ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Der Ausgang-Lauscher auf `llm-service`, 24 h      | auf dem **Gerät**, `logs/ausgang-llm-service.log` | Chat-Ende, Sitzungswechsel, Neustart des Geräts |
| Derselbe Lauscher auf `searxng` als Kanarienvogel | `logs/ausgang-searxng.log`                        | dasselbe                                        |
| Die Healthcheck-Luftmessung, 2 h                  | `logs/health-dauer.log`                           | dasselbe                                        |
| Der Dauerlauf für G7                              | das Gerät selbst                                  | alles außer einem Neustart des Geräts           |
| Nächtlicher Lauf (`scripts/util/nightly-run.sh`)  | **läuft NICHT**, siehe unten                      | ist nicht eingerichtet                          |
| Nächtlicher Wiederherstellungs-Drill              | `backup-service` auf dem Gerät                    | alles                                           |

**Stand der Nacht auf den 24.08.2026, 03:40:** neunundzwanzig PRs (#610 bis
#638), alle gemergt, `main` grün, keine PR offen. Alle dreizehn Abnahmen grün (201
Prüfpunkte), 192 Endpunkte ohne Serverfehler.

**Zwei Messungen laufen und beantworten je eine offene Frage:**

| Frage                                                          | Wo die Antwort steht                                 | Wann          |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| Verhindert `OLLAMA_NO_CLOUD=1` die Verbindung nach ollama.com? | `scripts/test/ausgang-lauscher.sh stand llm-service` | 24.08. abends |
| Läuft das Gerät jetzt ohne Selbstheilungs-Eingriff durch?      | `bash scripts/test/dauerlauf-bericht.sh`             | fortlaufend   |

**Zwischenstand 24.08. 11:44:** bei `llm-service` steht die letzte Zeile auf
**00:23:42**, seitdem elf Stunden nichts. Der Kanarienvogel auf `searxng`
zählte in derselben Minute noch (11:44:43), der Lauscher lebt also. Der Lauf
endet 24.08. 21:43; bis dahin ist es ein starker Zwischenstand, kein Ergebnis.

Beim Lauscher gilt: **keine neue Zeile nach 01:22 heißt, der Schalter wirkt.**
Steht dort eine, war er der falsche, und `OLLAMA_CLOUD_BASE_URL` ist der
nächste Kandidat. Der Kanarienvogel auf `searxng` muss dabei weiterzählen,
sonst misst der Lauscher wieder nichts (siehe Abschnitt 2).

Der G7-Zähler läuft neu ab dem 23.08. 17:01, also ist **G7 frühestens am
30.08.2026 erfüllbar** — Einzelheiten im Plan.

**Der nächtliche Lauf ist nicht eingerichtet.** Am 24.08.2026 nachgesehen:
`launchctl list | grep arasul` ist leer, in `~/Library/LaunchAgents/` liegt
nichts, und es gibt keine `~/logs/claude/nightly-*.log`. Diese Seite hat ihn
bis heute als etwas geführt, das ohne Sitzung weiterläuft.

Schlimmer als das Fehlen war der Pfad darin: die plist zeigte auf
`~/Documents/dev/ara/arasul-jet`. Diesen Ordner **gibt es**, mit einem Stand
von PR #393, also über zweihundert PRs alt. Wer sie so installiert hätte,
hätte einen nächtlichen Lauf bekommen, der auf einem sechs Tage alten Stand
arbeitet und dort committet. Ein falscher Pfad wäre aufgefallen; ein falscher,
der existiert, fällt nicht auf. Die plist trägt jetzt `__REPO__` als
Platzhalter, der beim Einrichten ersetzt wird (Anleitung im Kopf von
`nightly-run.sh`).

**Eingerichtet wird er hier bewusst nicht.** Ein Job, der nachts Claude Code
headless startet, Pläne abarbeitet und PRs merged, ist eine Entscheidung für
Kolja und nicht für eine Sitzung.

**Was NICHT weiterläuft:** der `/loop`-Wecker und alle Hintergrundbefehle
dieser Sitzung. Sie sterben mit dem Chat. Das ist kein Verlust — alles, was
zählt, steht in Dateien.

```bash
scripts/test/ausgang-lauscher.sh stand llm-service   # was der Lauscher bisher sah
scripts/test/ausgang-lauscher.sh stand searxng       # der Kanarienvogel, siehe unten
scripts/test/healthcheck-luft.sh stand               # wie nah die Healthchecks am Timeout sind
bash scripts/test/dauerlauf-bericht.sh               # G7-Stand, live
```

---

## 2. Der eine Befund, auf den der Lauscher wartet

`llm-service` hielt am 23.08.2026 um 17:01 UTC rund eine Minute lang eine
Verbindung zu **`ollama.com`** (34.36.133.15). Vier Versuche, es zu
wiederholen, blieben leer — Einzelheiten im Plan, Abschnitt „Zwei KI-Dienste
rufen nach draußen".

**Wenn der Lauscher etwas fängt**, steht im Protokoll Zeitpunkt, Zustand und
Ziel. Dann lässt sich zum ersten Mal sagen, WAS die Verbindung ausgelöst hat.
Zwei Adressen kommen laut Binärdatei infrage:
`ollama.com/api/web_search` und
`ollama.com/api/experimental/model-recommendations`.

**Wenn er nichts fängt**, ist das ein Ergebnis, kein Nicht-Ergebnis: 24 Stunden
Normalbetrieb ohne eine einzige Verbindung nach draußen gehören in die
G4-Beweislage.

**Aber nur mit dem Kanarienvogel.** Am 23.08.2026 meldete derselbe Lauscher
anderthalb Stunden lang „keine einzige Verbindung nach draußen" — er war
blind, ein Filter verwarf jede Zeile. Ein Beobachter, der nie etwas sieht, ist
von einem Beobachter, der nichts zu sehen bekommt, nicht zu unterscheiden.
Deshalb läuft derselbe Lauscher zusätzlich auf `searxng`, das nachweislich
nach draußen spricht. Stand 23.08. 22:45: **1035 Zeilen bei searxng, null bei
`llm-service`**, in derselben Zeit, mit derselben Mechanik. Erst das macht die
Null belastbar.

---

## 2b. Die Dependabot-Warteschlange, Stand 24.08.2026 mittags

Sechs PRs lagen offen, alle ohne Sicherheitsdruck. Fünf sind erledigt, einer
bleibt bewusst liegen. Jeder trägt seine Diagnose am PR, nicht hier.

| PR                    | Was daraus wurde                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #650 pdfjs-dist 4 → 6 | migriert und gemergt. `PDFDocumentProxy.destroy` gibt es nicht mehr (nur `cleanup`), `isEvalSupported` auch nicht, `page.render` nimmt jetzt `canvas`. Die CSP-Sorge der Vordiagnose war unbegründet: in v6 steht weder `eval(` noch `new Function`                                                                                                                                                                                          |
| #674 uuid 9 → 14      | **ersetzt durch #690**: uuid ist ab v10 ESM-only und bricht Jest. Das Backend nutzte an zwei Stellen nur `v4`, das kommt jetzt aus `node:crypto`. Eine Abhängigkeit weniger, 62 Lock-Zeilen weniger, dieser PR kommt nicht wieder                                                                                                                                                                                                            |
| #675 vite 6 → 8       | gemergt, deployt, Oberfläche 73/73                                                                                                                                                                                                                                                                                                                                                                                                           |
| #682 radix-ui         | gemergt, deployt, Oberfläche 73/73                                                                                                                                                                                                                                                                                                                                                                                                           |
| #664 tiptap-Gruppe    | gelöst nach fünf Ansätzen. Es war eine Auflösung, kein Konflikt: mehrere Kopien von `@tiptap/core`, die Wurzel-Kopie blieb zurück. `overrides` greifen dort nicht — npm meldet die Kopie selbst als `invalid` und lässt sie stehen. Sie zu entfernen bricht zwei Testdateien, weil das gehoistete `tiptap-markdown` von der Wurzel aus auflöst. Eine Zeile in der Wurzel-`package.json` macht daraus **eine** Kopie, 546 Lock-Zeilen weniger |
| #672 vitest 3 → 4     | **bleibt offen.** Der Typfehler ist behoben und liegt im Branch. Dahinter steckt dasselbe Auflösungsmuster: npm legt `@vitest/coverage-v8` in den Workspace, `vitest` läuft aus der Wurzel und findet es nicht. Lokal reproduziert. Der Ausweg wäre wieder eine Wurzel-Deklaration — für ein Testwerkzeug, das ein einziger Workspace benutzt, und ohne belegten Nutzen von vitest 4. 3.2.4 läuft, 1175 Tests grün                           |

Das Muster hinter #664 und #672 ist dasselbe und wird wiederkommen: **npm-Workspaces
heben ein Paket in die Wurzel, seine Abhängigkeit aber nicht.** Wer das nächste
Mal ein `Cannot find package X imported from node_modules/Y` sieht, sucht nicht
im Paket, sondern im Lockfile nach der Ebene.

---

## 2c. Drei Fragen für den autonomen Lauf, mit Belegen

Für einen Plan, der nächste Woche unbeaufsichtigt läuft, sind das die drei
Zahlen, an denen er hängt. Alle drei am 24.08.2026 nachgemessen.

### Haben G2, G3 und G5 ein Messverfahren?

Zwei von dreien ja, und zwar ausdrücklich als Gate-Messung gebaut:

| Gate                | Messverfahren                                                                                                                       | Umfang                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G2 Aktions-Feedback | `scripts/test/rueckmeldung-abnahme.mjs` — Kopfzeile: „Gate G2"                                                                      | führt echte Aktionen in drei Bereichen aus und prüft nach jeder die sichtbare Rückmeldung; dazu J5 (zerstörende Aktion fragt vorher und nennt die Folge). 7 Prüfpunkte                         |
| G3 UI-Konsistenz    | `scripts/test/oberflaeche-abnahme.mjs` — Kopfzeile: „Gate G3", plus die CI-Wächter `bausteine.py`, `einheiten.py`, `modellnamen.py` | sechs Ansichten mal drei Breiten, je drei Fragen (rollt waagerecht, zeichnet überhaupt, Konsolenfehler). 73 Prüfpunkte. Die Wächter decken die Quelltext-Seite ab, die Abnahme die gezeichnete |
| G5 DSGVO            | **keines.** `docs/legal/` hat fünf Unterlagen (AVV-Vorlage, Datenschutz n8n, Drittland-Konnektoren, n8n-Lizenz, README)             | das Gate heißt „dokumentiert", der Maßstab ist Vollständigkeit, nicht ein Lauf. Was fehlt, ist eine Liste, was vollständig heißt                                                               |

Wer also sagt, diese Gates hätten kein Verfahren, hat bei G2 und G3 nicht
nachgesehen. Bei G5 stimmt es.

### Verhindert ein täglich mergender Lauf G7 strukturell?

**Nein, nicht mehr.** Die Sorge war richtig, bevor das Wartungsfenster gebaut
war (#614, #637): die Selbstheilung griff mitten in Deploys ein. Am 24.08.2026
gemessen, nachdem seit 09:39 **sieben Deploys** hintereinander liefen:

```
letzter Selbstheilungs-Eingriff überhaupt:  24.08. 02:44
letzter FEHLGESCHLAGENER Eingriff:          23.08. 17:01
Eingriffe während der sieben Deploys:       null
```

Dazu kommt die Zählweise: G7 zählt ab dem letzten **fehlgeschlagenen** Versuch,
nicht ab jedem Eingriff. Die n8n-Neustarts der Nacht (01:59 bis 02:44) sind
alle mit `service_recovery_verified` beendet und setzen nichts zurück.

Wer das Gegenteil behauptet, soll die Ereignistabelle zeigen:

```bash
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT timestamp, severity, service_name, event_type FROM self_healing_events
   WHERE timestamp > NOW() - INTERVAL '20 hours' ORDER BY timestamp DESC;"
```

### Welche Pflichtprüfungen vor einem unbeaufsichtigten Lauf?

`arasul-jet` hat weder Branch-Schutz noch Rulesets, und `deploy.yml` rollt jeden
Push nach `main` auf den Orin. Das ist **Koljas ausdrückliche Entscheidung** und
bleibt seine. Wenn ein Lauf ohne Aufsicht täglich mergt, ändert sich aber der
Preis eines Fehlers, und dann wären drei Prüfungen Pflicht:

1. **CI Summary** — sie fasst alle übrigen zusammen; ohne sie ist jede einzelne
   umgehbar.
2. **Docker build · document-indexer** — seit dem 24.08. mit Startprobe (#688).
   Vorher lief genau hier ein Fehler drei Tage unentdeckt, bis er zwei Deploys
   zerlegte.
3. **Lockfile drift guard** — der einzige Wächter über der Ein-Lockfile-Regel.

Was NICHT reicht: „alles grün abwarten". Der Deploy-Rollback funktioniert und
hat am 24.08. dreimal sauber zurückgerollt, aber er lässt `git` und Image auf
verschiedenen Ständen zurück (das Gerät stand auf `a3a1436b`, das Image auf dem
Stand davor). Für einen unbeaufsichtigten Lauf gehört das geprüft, bevor er
startet.

---

## 3. Was bei Kolja liegt, nicht bei der nächsten Sitzung

**Neu am 24.08.2026, mit Frist: der Tailscale-Schlüssel des Arbeitsgeräts läuft
am 22.11.2026 ab.** Danach bricht der Fernwartungszugang. Abschalten lässt sich
das nur in der Konsole (https://login.tailscale.com/admin/machines, Gerät
auswählen, „Disable key expiry"), nicht auf dem Gerät und nicht aus einer
Sitzung. Bei einem ausgelieferten Kundengerät wäre dasselbe der Verlust des
Zugangs, deshalb steht es jetzt auch in `docs/ops/REMOTE_MAINTENANCE.md` als
Schritt der Einrichtung.

Diese drei sind **Entscheidungen**, keine Aufgaben. Sie werden nicht
unbeaufsichtigt gebaut.

| Thema                                              | Warum offen                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Der n8n-Knoten „Arasul LLM" umgeht die GPU-Sperre  | drei Wege, alle ändern eine ausgelieferte Integration. Dokumentiert in `docs/integrations/N8N.md` §6c |
| Die Warteschlange bleibt strikt seriell (E2)       | Umbau am Herzstück des Chats, `processingJobId` an zwanzig Stellen                                    |
| `llm-service` → `ollama.com` sperren oder zulassen | erst muss klar sein, was es auslöst. Siehe 2.                                                         |

Bereits **entschieden** und umgesetzt: huggingface.co bleibt erlaubt, damit
der Kunde Modelle nachladen kann (23.08.2026).

---

## 4. Was blockiert ist und warum

| Aufgabe                                 | Blockiert durch                                     |
| --------------------------------------- | --------------------------------------------------- |
| G2, G3 (Plan-Aufgaben, nicht die Gates) | Koljas Repository und ein PAT                       |
| D9 Positivpfad                          | Koljas eigener API-Schlüssel. **Wird nie erfragt.** |
| H2, I1                                  | ein Erstnutzer mit Stoppuhr                         |
| H3                                      | `ara-kit`                                           |
| K2, zweite Hälfte                       | `roadmap/ROADMAP.html` liegt im Steuer-Repo         |

---

## 5. Wie man den Stand selbst herleitet

Nichts davon steht hier als Zahl, weil es sonst beim nächsten Lauf falsch wäre.

```bash
# Alle dreizehn Abnahmen gegen das laufende Gerät (~25 min)
bash scripts/test/abnahmen.sh

# Nur eine davon
bash scripts/test/abnahmen.sh modell-link

# Jeder GET-Endpunkt auf dem Gerät, rot bei jedem 5xx
python3 scripts/test/endpunkte-live.py

# G7: Laufzeit, Selbstheilungen, Sicherungen, Lücken
bash scripts/test/dauerlauf-bericht.sh

# G4: wer verbindet während eines Laufs nach draußen
bash scripts/test/souveraenitaet-abnahme.sh

# Die zerstörenden Abnahmen — NUR auf dem Gerät, nicht von hier
ssh jetson 'cd /home/arasul/arasul/arasul-jet && bash scripts/test/pruefstand.sh hoch'
ssh jetson 'cd /home/arasul/arasul/arasul-jet && bash scripts/test/frischgeraet-abnahme.sh'
ssh jetson 'cd /home/arasul/arasul/arasul-jet && bash scripts/test/werksreset-abnahme.sh'
```

Der Tunnel ist Voraussetzung für alles, was auf `localhost:8443` zeigt:

```bash
nc -z localhost 8443 || ssh -f -N -L 8443:localhost:443 jetson
```

---

## 5b. Was der Tag gebracht hat, in einem Satz je Zeile

Nicht als Erfolgsmeldung, sondern damit die nächste Sitzung weiß, wo schon
gesucht wurde und wo nicht.

| Bereich           | Was sich geändert hat                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Endpunkte         | von **fünf** HTTP 500 auf jedem Gerät zu **null**; 192 antworten, keiner mit Serverfehler                      |
| Fehlermeldungen   | 26 Stellen gaben „Internal server error" statt des Grundes                                                     |
| Selbstheilung     | ein Deploy schickte das Gerät fast in einen Neustart; der Neustart-Eintrag behauptete einen, der nie stattfand |
| n8n               | nach vier Klicks war der Automationen-Tab weg (Anmeldedrossel)                                                 |
| GPU               | der Einbettungsdienst rechnete 5760-mal am Tag für einen Gesundheitscheck                                      |
| Git auf dem Gerät | jeder Deploy hinterließ einen Commit ohne Eltern; Historie geheilt, Rollback funktioniert wieder               |
| Wissensgraph      | `related/:name` hatte drei rekursive Zweige und hat **nie** funktioniert                                       |
| Modelle           | über einen Link hinzufügen und wieder entfernen, mit Abnahme                                                   |
| Indexer           | seit #671 startete jeder **Neubau** mit `ImportError`; gemerkt hat es niemand, weil er nicht neu gebaut wurde  |
| Neustart-Kette    | ein einziger hängender Dienst reichte für einen Geräteneustart; siehe unten                                    |
| Wartungsfenster   | die Selbstheilung startete Dienste **mitten im Deploy** neu, gegen den Deploy                                  |
| Prüfstand         | die Selbstheilung des Produktstacks heilte in den Prüfstand hinein (311 Ereignisse in sieben Tagen)            |
| Stiller Tod       | 23 Zuweisungen beendeten ihr Skript wortlos, sobald `grep` nichts fand; alle behoben, Wächter hält es sauber   |
| Aufgabenzahl      | drei Stellen im Repo nannten drei verschiedene Zahlen (61, 64, gezählt 66)                                     |
| G4, ollama.com    | der Lauscher hat die Verbindung gefangen; `OLLAMA_NO_CLOUD=1` gesetzt, Wirkung wird gemessen                   |
| G6, Sicherung     | der Drill hätte ein fehlendes Schema nicht bemerkt (127 von 206 Tabellen); jetzt geprüft und gegengeprobt      |
| Wartungsfenster   | der Schutz war zehn Sekunden zu kurz, die Selbstheilung griff direkt nach Fensterschluss zu                    |

**Die Neustart-Kette ist der schwerste Befund des Tages.** Der Orin läuft seit
dem 19.08. durch, und das klang nach dem Nachweis für G7. Es war ein Zufall:
`SELF_HEALING_REBOOT_ENABLED` steht auf diesem Gerät aus. Beim Kunden im
unbeaufsichtigten Betrieb — dem Modus, den G7 zusagt — steht der Schalter an,
und dort hätte sich das Gerät in vier Tagen dreimal selbst neu gestartet
(19.08. 21:39, 23.08. 01:05, 23.08. 09:32). Ursache: `get_critical_events_count()`
zählte Protokollzeilen statt Vorfälle, und ein ungesunder Dienst schrieb im
Takt des Durchlaufs immer dieselbe Zeile. Gegengerechnet an den echten Daten
des Geräts: **132 Zeilen, 2 Vorfälle** im Fenster des 19.08.

Behoben an zwei Stellen (Migration 161 und `_category_c_in_cooldown()`), plus
das Wartungsfenster, damit ein Deploy die Kette gar nicht erst anstößt. Live
belegt: dieselbe Funktion auf dem Gerät zählt für die letzten 48 Stunden jetzt
**7 Vorfälle statt 230 Zeilen**.

**Und vier Messungen, die das Falsche gemessen haben** — die sind die
unangenehmere Hälfte: die G4-Abnahme sah nur `established`, hielt
IPv6-Localhost für „draußen", löste die Anzahl statt der Adresse auf, und
`ssh` fraß die Schleifeneingabe, sodass immer nur das **erste** Ziel geprüft
wurde. Dazu eine zerstörende Abnahme, die vom Arbeitsrechner aus auf das
Produktionsgerät zielte, und ein „Fabrikzustand", der das Konto des
Arbeitsgeräts trug.

## 6. Sechs Fallen, die einen halben Tag gekostet haben

Sie stehen in den Kommentaren der jeweiligen Skripte, aber wer neu anfängt,
sollte sie kennen.

1. **`ssh` in einer Schleife frisst die Eingabe.** Ohne `-n` endet jede
   `while read`-Schleife nach dem ersten Eintrag. Die Souveränitäts-Abnahme hat
   deshalb monatelang nur EIN Ziel geprüft.
2. **`ssh -n` und ein Heredoc schließen sich aus.** `-n` leitet stdin von
   `/dev/null`, also kommt eine leere Datei an.
3. **Eine Messung braucht Abstand.** In der Nacht auf den 24.08.2026 habe ich
   dreimal einen eigenen Schluss zurücknehmen müssen, und jedes Mal war die
   Ursache dieselbe Sorte Fehler:

   | Was ich sagte                             | Was stimmte                                  |
   | ----------------------------------------- | -------------------------------------------- |
   | „Der Nachlauf wirkt, null Eingriffe"      | um 00:34 gemessen, der Eingriff kam 00:34:17 |
   | „Der Prüfstand stoppt Produktionsdienste" | belegt war nur, **dass** sie stoppen         |
   | „Der Prüfstand war es"                    | es war mein eigener paralleler Deploy        |

   Die Regel „keine Abnahme während eines Deploys" steht seit Tagen hier. Sie
   gilt auch für Versuche, die einen Befund einkreisen sollen — gerade für die,
   denn dort ist die Versuchung am größten, das erste passende Muster für die
   Antwort zu halten.

4. **Ein Beobachter braucht eine Gegenprobe.** Der Ausgang-Lauscher meldete
   anderthalb Stunden „nichts", während `ss` im selben Moment offene
   Verbindungen zeigte. Die Gegenprobe kostet eine Minute und steht in der
   Anleitung des Skripts. Dasselbe gilt für Tests: der Wartungsfenster-Test
   wurde erst geglaubt, nachdem die Bedingung testweise auf `if False` stand
   und er fehlschlug.
5. **Ein Unit-Test mit nachgebildeter Datenbank findet keinen Spaltenfehler.**
   Am 23.08. gaben fünf Endpunkte auf jedem Gerät HTTP 500, alle von grünen
   Tests gedeckt. Deshalb `endpunkte-live.py`, und deshalb läuft jede Abnahme
   gegen echtes Blech.
6. **Eine Abhängigkeit, die niemand neu baut, ist nicht geprüft — sie ist
   ungeprüft.** Am 24.08. scheiterten zwei Deploys hintereinander an
   `x document-indexer ist unhealthy`, ohne Ursache im Lauf-Log. Sie stand die
   ganze Zeit im Container-Log, aber der Rollback ersetzt den Container, und
   sein Log geht mit ihm. Der Weg zum Befund war ein eigener Beobachter am
   Gerät im 2s-Takt (`docker inspect` auf Status, Health, `StartedAt`) und ein
   dritter, absichtlich herbeigeführter Fehlschlag:

   ```
   11:29:26 restarting unhealthy StartedAt 09:29:22
   11:29:30 restarting unhealthy StartedAt 09:29:26
   ```

   Crash-Loop, kein langsamer Start. Ursache: `#671` hob `qdrant-client` auf
   `>=1.19.0` an, wo `NamedVector` nicht mehr existiert. Der Dienst wurde
   seither nicht neu gebaut, also lief das alte Image weiter (**1.16.2** im
   Container, **1.19.0** im Neubau, beides am Gerät gemessen). Die CI konnte es
   nicht sehen: der Indexer fehlte in der Docker-Matrix, und seine Requirements
   werden im pytest-Job bewusst nicht installiert.

   Drei PRs, jeder für eine Ebene: `#685` repariert den Code, `#687` gibt dem
   Deploy bei Fehlschlag Logs und Neustartzähler mit, `#688` baut den Indexer in
   der CI und startet ihn (`python3 -c "import api_server"`, ohne Netz). Bauen
   allein hätte es nicht gefunden — das Image baut sauber.

---

## 7. Die Regel, die über allem steht

Eine Aufgabe gilt erst als erledigt, wenn ihre Abnahme **live auf dem Orin**
belegt ist — nicht wenn der Branch gemerged wurde. Der Plan
(`plan.md`) ist der Faden; diese Seite ist nur der Einstieg.
