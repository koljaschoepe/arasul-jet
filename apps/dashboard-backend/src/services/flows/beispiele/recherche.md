---
name: recherche
beschreibung: Recherchiert ein Thema im Web über Subagenten und fasst es mit Quellen zusammen.
argumente:
  - name: thema
    typ: freitext
    beschreibung: Das Recherche-Thema
    pflicht: true
werkzeuge:
  - web_suche
  - web_lesen
  - subagent
rollen:
  - name: sucher
    beschreibung: Findet relevante Seiten zum Thema.
    werkzeuge:
      - web_suche
    ergebnis:
      felder:
        - treffer
      max_zeichen: 2000
    prompt: >-
      Suche mit dem Werkzeug web_suche nach dem genannten Thema. Gib die besten
      drei bis fünf URLs zurück, je mit einem kurzen Satz, warum die Seite
      relevant ist. Keine eigenen Vermutungen — nur, was die Trefferliste hergibt.
  - name: leser
    beschreibung: Liest eine Seite und extrahiert belegte Fakten.
    werkzeuge:
      - web_lesen
    ergebnis:
      felder:
        - fakten
        - quelle
      max_zeichen: 2000
    prompt: >-
      Lies die genannten Seiten mit dem Werkzeug web_lesen. Gib ausschließlich
      Fakten zurück, die im Text stehen, und nenne unter „quelle" die URLs.
      Erfinde nichts und fasse nicht zu weit zusammen.
  - name: pruefer
    beschreibung: Prüft die gesammelten Fakten auf Widersprüche.
    ergebnis:
      felder:
        - bewertung
      max_zeichen: 1000
    prompt: >-
      Prüfe die gesammelten Fakten auf Widersprüche und offene Unsicherheiten.
      Nenne, was gut belegt ist und was auf nur einer Quelle beruht.
schritte:
  - name: suchen
    typ: subagent
    rolle: sucher
    auftrag: >-
      Finde relevante Seiten zum Thema {{thema}}.
  - name: lesen
    typ: subagent
    rolle: leser
    auftrag: >-
      Lies die in diesem Ergebnis genannten Seiten und lies daraus die belegten
      Fakten samt Quelle heraus:

      {{suchen}}
  - name: pruefen
    typ: subagent
    rolle: pruefer
    auftrag: >-
      Prüfe diese gesammelten Fakten auf Widersprüche und offene Unsicherheiten:

      {{lesen}}
grenzen:
  max_aufrufe: 30
  zeitlimit_s: 1200
  werkzeug_runden: 12
---

Du hast das Thema {{thema}} im Web recherchiert: relevante Seiten gesucht, die
Fakten daraus gelesen und einmal auf Widersprüche geprüft. Die Ergebnisse dieser
Schritte stehen dir unten zur Verfügung.

Schreibe jetzt die **Antwort für den Nutzer** — sie darf niemals leer sein:

- Zuerst ein kurzer, sachlicher Absatz, der das Thema {{thema}} beantwortet.
- Danach eine Zeile „Quellen:" und darunter die verwendeten URLs als Liste.

Stütze dich ausschließlich auf die gelesenen und geprüften Fakten aus den
Schritt-Ergebnissen. Erfinde nichts. Antworte auf Deutsch.
