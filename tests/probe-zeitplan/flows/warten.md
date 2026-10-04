---
name: warten
beschreibung: Läuft jede Minute und wartet auf eine Freigabe, damit der zweite Termin einen laufenden Lauf vorfindet (Abnahme M5, Zeitplaner).
ausloeser:
  - typ: zeitplan
    zeitplan: '* * * * *'
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Probe Zeitplaner, bitte nicht bestaetigen
      zusammenhang: Dieser Lauf haelt an, damit der naechste Termin einen laufenden Lauf vorfindet.
      frist_minuten: 30
grenzen:
  zeitlimit_s: 120
---

Der Lauf ist freigegeben worden. Schreibe genau einen Satz.
