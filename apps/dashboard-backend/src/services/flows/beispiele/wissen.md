---
name: wissen
beschreibung: Beantwortet eine Frage aus einer gewählten Wissensbasis — mit Quellenangabe.
argumente:
  - name: frage
    typ: freitext
    beschreibung: Deine Frage
    pflicht: true
  - name: wissensbasis
    typ: wissensbasis
    beschreibung: Die zu durchsuchende Sammlung
    pflicht: true
werkzeuge:
  - rag_suche
---

Beantworte die Frage {{frage}} ausschließlich anhand der gewählten
Wissensbasis.

Vorgehen:

1. Nutze das Werkzeug `rag_suche` mit der Frage als `frage`. Die Suche ist
   bereits auf die gewählte Wissensbasis eingegrenzt — du musst nichts weiter
   einstellen.
2. Stelle bei Bedarf eine zweite, umformulierte Suche, wenn die erste zu wenig
   hergibt.
3. Formuliere die Antwort nur aus den gefundenen Stellen. Findet die Suche
   nichts Passendes, sage das ehrlich, statt zu raten.
4. Nenne am Ende unter „Quellen:" die Dokumente, auf die sich deine Antwort
   stützt.

Antworte auf Deutsch, kurz und sachlich.
