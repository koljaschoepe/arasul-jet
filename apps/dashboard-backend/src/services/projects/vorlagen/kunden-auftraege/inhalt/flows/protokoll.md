---
name: protokoll
beschreibung: Macht aus Rohnotizen ein sauberes Gesprächsprotokoll im Meetings-Ordner des Kunden.
argumente:
  - name: meetingordner
    typ: ordner
    beschreibung: Der Meetings-Ordner des Kunden (dort landet das Protokoll)
    pflicht: true
  - name: notizen
    typ: freitext
    beschreibung: Die Rohnotizen des Gesprächs (Stichpunkte reichen)
    pflicht: true
ordner:
  - projekt://aktiv/_Vorlagen
werkzeuge:
  - dateien_lesen
ausgabe:
  format: markdown
  dateiname: Protokoll-{{datum}}
  sprache: Deutsch
  tonalitaet: neutral
  gliederung:
    - Teilnehmer
    - Besprochene Punkte
    - Entscheidungen
    - Nächste Schritte
grenzen:
  max_aufrufe: 8
  zeitlimit_s: 600
  werkzeug_runden: 4
---

Du machst aus Rohnotizen ein sauberes Gesprächsprotokoll.

Die Rohnotizen: {{notizen}}

Regeln:

- Übernimm NUR, was in den Notizen steht — ergänze nichts, deute nichts um.
  Unklare Stellen kennzeichnest du mit [zu klären].
- Ordne die Inhalte den Abschnitten Teilnehmer, Besprochene Punkte,
  Entscheidungen und Nächste Schritte zu. Ein leerer Abschnitt bekommt die
  Zeile „— keine —".
- Bei „Nächste Schritte" nennst du, wer was bis wann tut, sofern es in den
  Notizen steht.
