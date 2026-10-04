---
name: schritte
beschreibung: Vier Schritte mit Modell und Faehigkeiten; der erste haelt an einer Freigabe, damit kein Modell rechnet (Abnahme M5, Modell je Schritt).
ausloeser:
  - typ: zeitplan
    zeitplan: '* * * * *'
werkzeuge: [freigabe_anfordern, subagent]
rollen:
  - name: leser
    ergebnis: { felder: [betrag] }
    prompt: Du gibst den vorgegebenen Wert unveraendert als JSON aus.
  - name: rechner
    ergebnis: { felder: [text] }
    prompt: Du antwortest als JSON mit dem Feld text.
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Probe Modell je Schritt, bitte nicht bestaetigen
      zusammenhang: Dieser Lauf haelt an, damit kein Modell rechnet.
      frist_minuten: 30
  - name: erkennen
    typ: subagent
    rolle: leser
    modell: probe-fehlt:1b
    faehigkeiten: { text: true, bild: true, werkzeuge: true }
    auftrag: 'Gib genau dieses JSON aus: <<<{"betrag": "1,00"}>>>'
  - name: rechnen
    typ: subagent
    rolle: rechner
    modell: gemma4:e4b
    faehigkeiten: { text: true, werkzeuge: true, mindestkontext: 8192 }
    auftrag: 'Gib genau dieses JSON aus: <<<{"text": "Fertig."}>>>'
  - name: frei
    typ: subagent
    rolle: rechner
    faehigkeiten: { text: true }
    auftrag: 'Gib genau dieses JSON aus: <<<{"text": "Fertig."}>>>'
grenzen:
  zeitlimit_s: 120
---

Antworte mit einem Wort.
