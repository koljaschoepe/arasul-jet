# Übergabe: was gerade läuft, was offen ist, wo man weitermacht

**Stand: 23.08.2026, 21:20.** Diese Seite ist für die nächste Sitzung
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

## 3. Was bei Kolja liegt, nicht bei der nächsten Sitzung

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

## 6. Fünf Fallen, die einen halben Tag gekostet haben

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

---

## 7. Die Regel, die über allem steht

Eine Aufgabe gilt erst als erledigt, wenn ihre Abnahme **live auf dem Orin**
belegt ist — nicht wenn der Branch gemerged wurde. Der Plan
(`plan.md`) ist der Faden; diese Seite ist nur der Einstieg.
