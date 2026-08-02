# Kundenservice

Dieses Projekt beantwortet Kundenfragen — ausschließlich aus dem Wissen, das
HIER abgelegt ist. Es ist bewusst von deinen anderen Projekten getrennt:
Kundendaten, Angebote oder interne Unterlagen können nie in einer
Service-Antwort landen.

## So ist es aufgebaut

- `Wissen/` — alles, was der Service wissen darf: FAQ, Produktinfos,
  Richtlinien, Preislisten. Einfach Dateien hineinlegen (auch PDF/Word) —
  sie werden automatisch indexiert.

## So funktioniert es

- Im Chat: `/antwort` mit einer Kundenfrage — die Antwort stützt sich NUR auf
  den `Wissen/`-Ordner und nennt ihre Quellen.
- Automatisch per E-Mail: Ein n8n-Workflow liest eingehende Mails, ruft
  `/antwort` über die externe Schnittstelle auf und verschickt die Antwort.
  Die Einrichtung ist in der Anleitung beschrieben
  (docs/integrations/N8N.md, Abschnitt „Kundenservice-Automatik").

## Wichtig

Die Antwort erfindet nichts: Steht etwas nicht im Service-Wissen, verweist
sie höflich an einen Mitarbeiter. Je besser der `Wissen/`-Ordner gepflegt
ist, desto mehr Fragen werden vollständig beantwortet.
