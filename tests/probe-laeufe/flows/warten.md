---
name: warten
beschreibung: Läuft jede Minute und wartet auf eine Freigabe, die niemand erteilt: ein Lauf ohne Person, den der Administrator abbricht (Abnahme M5, Verwaltung Läufe).
ausloeser:
  - typ: zeitplan
    zeitplan: '* * * * *'
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Probe Läufe, bitte nicht bestaetigen
      zusammenhang: Dieser Lauf haelt an, damit der Administrator ihn abbrechen kann.
      frist_minuten: 30
grenzen:
  zeitlimit_s: 120
---

Der Lauf ist freigegeben worden. Schreibe genau einen Satz.
