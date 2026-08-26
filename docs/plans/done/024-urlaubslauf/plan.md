# Plan 024, Urlaubslauf: fünfzehn autonome Phasen

> **Abgelöst am 26.08.2026 durch den Überordner-Plan vom 26.08.2026**
> (`arasul/roadmap/plans/aktiv/2026-08-26-umbau-standardsoftware.md`, nicht
> öffentlich). Keine der fünfzehn Phasen ist gelaufen; der Urlaubslauf wurde
> am selben Tag abgesagt. Die Gates G1 bis G7 sind durch die acht Abnahmen des
> Überordner-Plans ersetzt, ihr Stand steht in `#roadmap-meta` von
> `docs/plans/ROADMAP.html`. Diese Seite ist Geschichte, nichts hier ist eine
> Aufgabe.

> Grundlage: die Firmensicht `plans/aktiv/2026-08-24-urlaubslauf.md` im
> Steuer-Repo. Sie trägt die Entscheidungen und die Widersprüche dazu. Diese
> Seite hier sagt, **wie** im Repo gearbeitet wird.
>
> Angelegt: 2026-08-24. Nachfolger von `023-feature-audit`, das am selben Tag
> nach `docs/plans/done/` gegangen ist.

## Stand

| Phase | Datum  | Gate-Strang                                                      | Zielbild-Strang                                                       | Stand |
| ----- | ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ----- |
| 0     | 30.08. | G7 abnehmen und festschreiben                                    |                                                                       | offen |
| 1     | 30.08. | volle Reihe grün halten, Bestandsaufnahme der Abnahmen           | welche der Routendateien fasst welche Ressource an                    | offen |
| 2     | 31.08. | G3 breit: alle Ansichten mal alle Breiten, CI-Wächter nachziehen | J13 Schritt 1, Lesepfade                                              | offen |
| 3     | 01.09. | G2 breit: jede Aktion in jedem Bereich                           | J13 Schritt 2, Schreibpfade                                           | offen |
| 4     | 02.09. | G1, der Rest aus 023 (siehe unten)                               | J13 Abnahme: ein Skript belegt, dass kein Benutzer fremde Daten sieht | offen |
| 5     | 03.09. | G7-Ursachenarbeit, eng gefasst                                   | J14 Datenmodell und Endpunkte                                         | offen |
| 6     | 04.09. | G6: Wiederherstellungsdrill über alle Tabellen                   | J14 Oberfläche, Mitarbeiterliste                                      | offen |
| 7     | 05.09. | G1 bis G3 Nachlauf                                               | J14 App-Freigabe                                                      | offen |
| 8     | 06.09. | G4: die Souveränitäts-Abnahme härten                             | J14 Abnahme                                                           | offen |
| 9     | 07.09. | Nachlauf                                                         | K4 Deploybefehl, Entwurf                                              | offen |
| 10    | 08.09. | Nachlauf                                                         | K4 fertig, einmal gegen den Orin ausgerollt                           | offen |
| 11    | 09.09. | Nachlauf                                                         | K5 Doku-Seite, die dreizehn Endpunkte durcharbeiten                   | offen |
| 12    | 10.09. | Gesamtabnahme, `#roadmap-meta` aus der Messung setzen            |                                                                       | offen |
| 13    | 11.09. | reparieren, was Phase 12 gefunden hat                            |                                                                       | offen |
| 14    | 12.09. | Reserve und Abschlussbericht                                     |                                                                       | offen |

Der Schnitt ist ein Vorschlag. Ändern ist erlaubt, solange die Reihenfolge
bleibt: Gates vorn, Zielbild hinten, Reserve am Ende.

## Das Ziel

Am Ende sind G1, G2, G3, G4, G6 und G7 belegbar grün, und `#roadmap-meta` trägt
diesen Stand **aus einer Messung heraus**. **G5 ist nicht Teil dieses Plans.**

Ein halb fertiger Zielbild-Strang ist ein zulässiges Ergebnis, ein halb fertiges
Gate nicht.

## Die zwei Stränge

Jede Phase hat beide. Wo sie sich berühren, gewinnt der Gate-Strang; bei Verzug
fällt der Zielbild-Strang zuerst.

| ID  | Zielbild-Strang                                                                                            | Repo         |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| J13 | Kein Benutzer sieht Daten eines anderen. Jede Route prüft `owner_id` und `space_members` aus Migration 089 | `arasul-jet` |
| J14 | Ein Admin legt Mitarbeiter an und gibt ihnen einzelne Anwendungen frei                                     | `arasul-jet` |
| K4  | Ein Befehl rollt die Anwendung eines Partners auf ein Kundengerät aus                                      | `ara-kit`    |
| K5  | Eine Seite erklärt, wie ein Partner mit `X-API-Key` gegen die dreizehn Endpunkte arbeitet                  | `ara-kit`    |

**Die harte Bedingung für J14.** Es gibt eine Oberfläche, und die Rolle blendet
aus. Aber **die Rolle entscheidet nichts**: verweigert wird im Backend, in den
Routen, gegen `owner_id` und `space_members`. Eine Sichtbarkeitsregel im
Frontend ist kein Rechtekonzept — ein vergessenes `if` wäre sonst ein Datenleck
statt eines Schönheitsfehlers.

## Was aus 023 offen übernommen wird

Nicht abschreiben, im abgeschlossenen Plan nachlesen. Er ist am 24.08.2026 mit
der uebrigen Plan-Historie aus dem Arbeitsbaum genommen worden und steht in der
Git-Historie:

```bash
git show 4837f70b:docs/plans/done/023-feature-audit/plan.md | less
```

Der Abschnitt heisst „Stand". Die Uebergabe desselben Plans liegt weiter im
Baum: `docs/plans/done/023-feature-audit/UEBERGABE.md`, dort stehen die acht
Fallen.

| Aufgabe                                 | Warum sie offen ist                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| E2                                      | Umbau am Herzstück des Chats, liegt als Entscheidung bei Kolja |
| G2, G3 (Plan-Aufgaben, nicht die Gates) | brauchen Koljas Repository und einen Zugangsschlüssel          |
| G5 (Plan-Aufgabe: Vektorsuche)          | verlangt die Rücknahme einer Architekturentscheidung           |
| H2, I1                                  | brauchen einen Erstnutzer mit Stoppuhr                         |
| H3                                      | hängt an `ara-kit`                                             |
| K2, zweite Hälfte                       | die Roadmap-Seite liegt im Steuer-Repo                         |
| D9 Positivpfad                          | braucht Koljas eigenen API-Schlüssel. **Wird nie erfragt.**    |

## Der Takt je Phase

**Oft deployen, selten voll abnehmen.** Am 24.08.2026 gemessen: ein Deploy
kostet im Median 43 s, die volle Reihe 20,4 min. Bündeln von Deploys spart
Sekunden und kostet die Fehlerzuordnung.

1. Deploy nach jedem grünen PR.
2. Volle Abnahme-Reihe **zweimal je Phase**, zur Mitte und am Ende.
3. Dazwischen nur die betroffene Einzelabnahme.

**Die Abnahme-Reihe wird nicht parallelisiert.** Sie ist absichtlich seriell,
weil mehrere Browser gleichzeitig gegen dasselbe Gerät gingen.

Zahlen neu holen statt hier lesen:

```bash
bash scripts/test/abnahmen.sh                  # die volle Reihe
gh run list --workflow=deploy.yml --limit 12   # Deploy-Dauern
bash scripts/test/dauerlauf-bericht.sh         # G7-Stand
```

## Die Notbremse

Kolja greift während des Laufs nicht ein, deshalb hält der Lauf sich selbst an.

1. **Dreimal rot in derselben Abnahme, auch an wechselnden Stellen: Phase
   beenden.** Der Zusatz ist wichtig. Am 24.08.2026 war dieselbe Abnahme zweimal
   rot an zwei verschiedenen Stellen, und die Ursache war ein Messfehler. Eine
   Regel, die auf dieselbe _Stelle_ abhebt, lässt einen wandernden Messfehler
   durch.
2. **Zweimal rot an wechselnden Stellen heißt zuerst Messfehler, nicht
   Regression.** Bevor eine Regression notiert wird, läuft eine Sonde, die den
   **Ort** jeder Meldung mitschreibt. **Ohne Sonde wird kein Verdacht gegen eine
   Abhängigkeit notiert.** Am 24.08. wären sonst Vite 8 und pdfjs 6 als
   Verursacher in den Plan gewandert, beide unschuldig; der wahre Verursacher
   stand im Ort der Meldung (`/n8n/:241`).
3. **Ein Deploy, der das Gerät nicht gesund zurückgibt: Phase beenden.** Kein
   zweiter Versuch am selben Tag.
4. **Eine Tagesseite je Phase**, höchstens dreißig Zeilen: was gemacht, was
   gemessen, was rot, was offen, plus die Gate-Tabelle mit gemessenem Stand.

## Regeln, die in jeder Phase gelten

1. **Kein Grün-Dribbeln.** Ein Abnahmeskript darf geändert werden, wenn es das
   Falsche misst — aber jede solche Änderung steht mit Begründung in der
   Tagesseite. Eine Phase, die ein Skript ändert **und** dasselbe Gate im selben
   Lauf grün meldet, lässt die Meldung von einem Widerleger-Subagenten prüfen.
   Am 24.08.2026 sind an einem Tag vier Messungen aufgefallen, die das Falsche
   gemessen haben.
2. **Best Practices wie im Repo definiert.** Kein toter Code, keine doppelten
   Komponenten, gemeinsame Bausteine wiederverwenden, die Wächter der CI bleiben
   scharf.
3. **Rückfragen sind verboten.** Eine offene Frage wird als Zeile in die
   Tagesseite geschrieben, die Aufgabe übersprungen, der Lauf geht weiter.
4. **Nichts wird von Hand in `#roadmap-meta` geschrieben.** Der Gate-Stand
   entsteht aus der Messung, und nur aus der vollen Reihe am Phasenende.
5. **`main` ist seit dem 24.08.2026, 20:13 geschützt.** Das Ruleset heißt
   „main geschuetzt" und verlangt vier Dinge: einen Pull Request, grüne
   Statuschecks, kein Force-Push, keine Löschung. **Das kehrt die frühere
   Regel um** — bis dahin galt „kein Branch-Schutz, jeder Push geht auf den
   Orin", und der Lauf sollte die Folgen selbst tragen.

   Praktisch für den Lauf: **ein direkter Push auf `main` schlägt fehl**
   (`push declined due to repository rule violations`). Jede Änderung geht
   über einen PR, dessen CI grün sein muss, bevor gemergt wird. Der Deploy
   hängt weiter am Merge — er entfällt also nicht, er kommt nur einen Schritt
   später. Nachsehen mit:

   ```bash
   gh api repos/koljaschoepe/arasul-jet/rulesets
   ```

## Die Mechanik

**Ein deterministisches Ablaufskript je Phase**, das Subagenten verteilt:
Kontrollfluss im Code, nicht in der Anweisung. Subagenten liefern ihr Ergebnis
zurück, nicht ihren Leseverlauf, damit der Hauptagent über zwölf Stunden dünn
bleibt.

**Dazu `aufgaben.json` als Gedächtnis.** Sie überlebt jede
Kontextzusammenfassung, ein Vorhaben im Kopf des Agenten nicht. Eine Zeile je
Aufgabe:

```json
{
  "id": "P2-G3-01",
  "phase": 2,
  "strang": "gate",
  "titel": "Oberflaechen-Abnahme auf alle Ansichten mal alle Breiten ausweiten",
  "abnahme": "node scripts/test/oberflaeche-abnahme.mjs",
  "bedingung": "73 von 73, dreimal hintereinander",
  "deckel_minuten": 90,
  "zustand": "offen",
  "versuche": 0,
  "notiz": ""
}
```

`zustand` ist `offen`, `laeuft`, `gruen`, `rot` oder `uebersprungen`. Nichts
anderes. **Der Zustand wird nach jedem Schritt geschrieben**, nicht am Ende —
damit ein Abbruch mitten in der Nacht den nächsten Morgen nicht bei null
anfangen lässt.

Der Entwurf des Ablaufskripts steht in der Firmensicht. Er gehört einmal trocken
durchlaufen, bevor Phase 1 startet, und der Trockenlauf muss dreierlei belegen:
dass das Skript mit einer Aufgabendatei aus drei Zeilen durchläuft, dass die
Notbremse bei dreimal Rot greift, und dass der Zustand nach einem harten Abbruch
stimmt.

## Woran am Ende gemessen wird

1. Sechs Gates grün, jedes mit dem Befehl belegbar, der es misst.
2. `#roadmap-meta` trägt diesen Stand aus der Messung.
3. Fünfzehn Tagesseiten, je höchstens dreißig Zeilen.
4. Der Zielbild-Strang so weit, wie er gekommen ist, ehrlich benannt.
