---
name: einrichtung
beschreibung: Richtet das Projekt mit den echten Firmendaten ein — recherchiert die eigene Webseite und füllt Firmenprofil und Briefkopf.
argumente:
  - name: firmenname
    typ: freitext
    beschreibung: Name der eigenen Firma
    pflicht: true
  - name: webseite
    typ: freitext
    beschreibung: Webseite der eigenen Firma (z. B. https://www.meinefirma.de)
    pflicht: true
  - name: hinweise
    typ: freitext
    beschreibung: Optionale Hinweise (Angebotsschwerpunkte, Ansprache, Besonderheiten)
    pflicht: false
ordner:
  - projekt://aktiv
werkzeuge:
  - web_suche
  - web_lesen
  - dateien_lesen
  - dateien_schreiben
grenzen:
  max_aufrufe: 20
  zeitlimit_s: 900
  werkzeug_runden: 10
---

Du richtest diesen Arbeitsbereich mit den echten Daten der Firma
{{firmenname}} ein. Arbeite die Schritte der Reihe nach ab und nutze deine
Werkzeuge — behaupte nie, etwas getan zu haben, was du nicht getan hast.

1. Lies mit web_lesen die Webseite {{webseite}} und, wenn verlinkt, die
   Unterseiten „Über uns", „Leistungen/Produkte", „Kontakt" und „Impressum".
2. Schreibe mit dateien_schreiben die Datei `Firmenprofil.md`:

   # Firmenprofil: {{firmenname}}

   | Feld      | Wert           |
   | --------- | -------------- |
   | Firma     | {{firmenname}} |
   | Straße    | …              |
   | PLZ       | …              |
   | Ort       | …              |
   | Land      | DE             |
   | USt-IdNr. | [DE123456789]  |
   | E-Mail    | …              |
   | Telefon   | …              |
   | Webseite  | {{webseite}}   |

   WICHTIG: Straße, PLZ und Ort sind getrennte Zeilen (Rechnungs-
   Pflichtangaben) — trage sie einzeln ein, so wie sie im Impressum stehen.
   Die USt-IdNr. steht selten auf der Webseite: Lass den Platzhalter
   [DE123456789] stehen und weise den Nutzer am Ende darauf hin, dass er sie
   selbst eintragen muss, bevor die erste Rechnung gestellt wird.

   ## Was wir tun

   Zwei bis vier Sätze über Leistungen und Zielgruppe — aus der Webseite.

   ## Hinweise für Dokumente

   Diese Hinweise des Nutzers gelten für alle erzeugten Dokumente: {{hinweise}}

   ## Quellen

   Liste ALLER gelesenen Seiten (vollständige Adressen).

3. Schreibe mit dateien_schreiben die Datei `_Vorlagen/Briefkopf.md`:
   Firmenname, Adresse, E-Mail, Telefon und Webseite als kompakter
   Briefkopf-Block — nur mit Angaben, die du wirklich gefunden hast; fehlende
   markierst du mit [eckigen Klammern].

Wichtige Regeln:

- Ins Profil kommt NUR, was auf den gelesenen Seiten steht (das Impressum ist
  die beste Quelle für Adresse und Kontakt). Nicht Gefundenes: „unbekannt".
- Antworte dem Nutzer zum Schluss kurz: was eingerichtet wurde und welche
  Angaben noch fehlen.
