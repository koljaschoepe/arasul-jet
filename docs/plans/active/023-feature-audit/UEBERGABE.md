# Übergabe: was gerade läuft, was offen ist, wo man weitermacht

**Stand: 23.08.2026, 20:15.** Diese Seite ist für die nächste Sitzung
geschrieben, nicht für den Rückblick. Wer sie liest, soll ohne Chatverlauf
weiterarbeiten können.

Jede Zahl hier ist **abgeschrieben und trägt deshalb ein Datum**. Wer sie
braucht, holt sie aus der Live-Quelle: die Befehle stehen jeweils daneben.

---

## 1. Was ohne diese Sitzung weiterläuft

| Was                                              | Wo                                                | Überlebt                                        |
| ------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| Der Ausgang-Lauscher auf `llm-service`, 24 h     | auf dem **Gerät**, `logs/ausgang-llm-service.log` | Chat-Ende, Sitzungswechsel, Neustart des Geräts |
| Der Dauerlauf für G7                             | das Gerät selbst                                  | alles außer einem Neustart des Geräts           |
| Nächtlicher Lauf (`scripts/util/nightly-run.sh`) | launchd auf dem Mac, 02:30                        | Chat-Ende                                       |
| Nächtlicher Wiederherstellungs-Drill             | `backup-service` auf dem Gerät                    | alles                                           |

**Was NICHT weiterläuft:** der `/loop`-Wecker und alle Hintergrundbefehle
dieser Sitzung. Sie sterben mit dem Chat. Das ist kein Verlust — alles, was
zählt, steht in Dateien.

```bash
scripts/test/ausgang-lauscher.sh stand llm-service   # was der Lauscher bisher sah
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

## 6. Drei Fallen, die einen halben Tag gekostet haben

Sie stehen in den Kommentaren der jeweiligen Skripte, aber wer neu anfängt,
sollte sie kennen.

1. **`ssh` in einer Schleife frisst die Eingabe.** Ohne `-n` endet jede
   `while read`-Schleife nach dem ersten Eintrag. Die Souveränitäts-Abnahme hat
   deshalb monatelang nur EIN Ziel geprüft.
2. **`ssh -n` und ein Heredoc schließen sich aus.** `-n` leitet stdin von
   `/dev/null`, also kommt eine leere Datei an.
3. **Ein Unit-Test mit nachgebildeter Datenbank findet keinen Spaltenfehler.**
   Am 23.08. gaben fünf Endpunkte auf jedem Gerät HTTP 500, alle von grünen
   Tests gedeckt. Deshalb `endpunkte-live.py`, und deshalb läuft jede Abnahme
   gegen echtes Blech.

---

## 7. Die Regel, die über allem steht

Eine Aufgabe gilt erst als erledigt, wenn ihre Abnahme **live auf dem Orin**
belegt ist — nicht wenn der Branch gemerged wurde. Der Plan
(`plan.md`) ist der Faden; diese Seite ist nur der Einstieg.
