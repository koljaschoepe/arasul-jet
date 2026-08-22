---
name: angebot
beschreibung: >-
  Liest die Unterlagen im Kundenordner, fragt einmal nach dem Umfang und schreibt
  daraus ein Angebot als Dokument.
betriebsart: rueckfragen
argumente:
  - name: kunde
    typ: ordner
    beschreibung: Der Ordner des Kunden, mit Anfrage und bisherigen Unterlagen
    pflicht: true
  - name: leistung
    typ: freitext
    beschreibung: Worum es geht, in einem Satz
    pflicht: true
ordner:
  - projekt://aktiv
werkzeuge:
  - dateien_lesen
  - dateien_suchen
  - dateien_schreiben
  - subagent
  - frage_nutzer
rollen:
  - name: sichter
    beschreibung: Liest die Unterlagen im Kundenordner und sagt, was bekannt ist
    werkzeuge:
      - dateien_suchen
      - dateien_lesen
    ergebnis:
      felder:
        - kundenname
        - bekannt
        - offen
      max_zeichen: 2500
    prompt: >-
      Du siehst einen Kundenordner durch, bevor ein Angebot geschrieben wird. Suche die
      vorhandenen Unterlagen, lies die zwei bis drei wichtigsten und halte fest, was ueber
      den Kunden und die Anfrage BEKANNT ist. Erfinde nichts: was du nicht findest, gehoert
      unter "offen". Antworte am Ende ausschliesslich mit einem JSON-Objekt mit den
      Feldern kundenname, bekannt und offen. Deutsch, keine Emojis.
  - name: autor
    beschreibung: Schreibt das Angebot als Markdown-Datei
    werkzeuge:
      - dateien_schreiben
    ergebnis:
      felder:
        - ergebnis
      max_zeichen: 600
    prompt: >-
      Du schreibst geschaeftliche Angebote. Du rufst IMMER dateien_schreiben auf und gibst
      den Text NIE als Antwort zurueck. Ein Angebot hat: Anschreiben in zwei Saetzen,
      Ausgangslage, Leistungsumfang als Liste, Zeitrahmen, Preis als Tabelle, Hinweis zur
      Gueltigkeit. Erfinde KEINE Preise, Firmennamen oder Kontaktdaten: was du nicht weisst,
      schreibst du als [offene Stelle] hin. Deutsch, keine Emojis. Antworte am Ende mit
      einem Satz, was du geschrieben hast.
schritte:
  - name: unterlagen
    typ: subagent
    rolle: sichter
    auftrag: >-
      Sieh den Ordner {{kunde}} durch. Es geht um: {{leistung}}. Was ist ueber den Kunden
      und diese Anfrage bekannt, was fehlt?
    parameter: {}
    iterationen: 1
  - name: umfang
    typ: werkzeug
    werkzeug: frage_nutzer
    parameter:
      frage: >-
        Wie ausfuehrlich soll das Angebot werden?
      optionen:
        - Kompakt, eine Seite, Festpreis
        - Ausfuehrlich, mit Aufwandsschaetzung je Position
        - Nur ein Preisrahmen, ohne Leistungsbeschreibung
    iterationen: 1
  - name: schreiben
    typ: subagent
    rolle: autor
    auftrag: >-
      Schreibe das Angebot nach {{kunde}}/angebot.md.

      Bekannt ist: {{unterlagen}}

      Der Nutzer hat zum Umfang gesagt: {{umfang}}

      Leistung: {{leistung}}
    parameter: {}
    iterationen: 1
grenzen:
  max_aufrufe: 25
  zeitlimit_s: 1800
  werkzeug_runden: 12
  max_tiefe: 2
ausgabe:
  format: keins
---

Du hast ein Angebot fuer den Kunden im Ordner {{kunde}} vorbereitet.

Fasse in hoechstens fuenf Saetzen zusammen: fuer wen das Angebot ist, welchen Umfang
der Nutzer gewaehlt hat, wo die Datei liegt, und welche [offenen Stellen] darin noch
zu fuellen sind. Wenn der Sichter etwas als offen benannt hat, nenne es hier ebenfalls.

Deutsch, keine Emojis, keine Gedankenstriche als Trenner.
