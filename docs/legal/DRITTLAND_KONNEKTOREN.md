# Drittland-Konnektoren

> **Status:** DRAFT — Anwaltliche Prüfung vor kommerzieller GA erforderlich.

n8n erlaubt es, beliebige externe SaaS-Dienste als Konnektoren zu verwenden.
Wenn der Sitz des Anbieters außerhalb des EWR liegt — oder personenbezogene
Daten in ein Drittland übermittelt werden — ist das eine **eigene**
Datenübermittlung im Sinne von Kapitel V DSGVO.

**Wichtig:** Diese Konnektoren sind keine Subunternehmer des Arasul-Anbieters.
Der Auftraggeber (Verantwortlicher) schließt eigenständig AVVs mit dem
jeweiligen Anbieter und dokumentiert die Verarbeitungstätigkeit selbst.

## Wann ist Art. 44 ff. DSGVO einschlägig?

- Anbieter sitzt außerhalb des EWR **oder** verarbeitet im Drittland.
- Daten werden tatsächlich übermittelt (Telemetrie, API-Calls, Speicherung).
- Es geht um personenbezogene Daten (auch indirekt, z.B. Mail-Adressen,
  Kunden-IDs, Kontaktdaten).

Bei Drittland-Übermittlungen muss eine Schutzgrundlage nach Art. 45–49 DSGVO
vorliegen — bei US-Anbietern in der Regel der **EU-US Data Privacy Framework
(DPF)**, ergänzt durch **Standardvertragsklauseln (SCC)** und ein
**Transfer Impact Assessment (TIA)** des Verantwortlichen.

## Häufige Konnektoren — schneller Überblick

| Anbieter / Konnektor                      | Sitz                    | Übermittlung in Drittland  | Schutzgrundlage                 | AVV vom Anbieter                                       | Bemerkung                                                                   |
| ----------------------------------------- | ----------------------- | -------------------------- | ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Microsoft Teams / Graph**               | USA + EU                | Ja (USA)                   | EU-US DPF + SCC                 | Online verfügbar                                       | EU-Data-Boundary erweitert; Telemetrie geht trotzdem in USA.                |
| **Microsoft 365 OneDrive**                | USA + EU                | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | EU-Data-Boundary für Speicherung; Backups/Telemetrie nicht.                 |
| **Slack**                                 | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | Salesforce-Tochter.                                                         |
| **Google Workspace** (Mail, Docs, Sheets) | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | Standard-Konto: Datenstandort EU; Workspace-Logs in USA.                    |
| **GitHub**                                | USA (Microsoft)         | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | Public-Repos sind eigenständig zu prüfen.                                   |
| **HubSpot**                               | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | EU-Hosting-Option vorhanden.                                                |
| **Salesforce**                            | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | Hyperforce/EU-Region buchbar.                                               |
| **Stripe**                                | Irland (EU) / USA       | Teils                      | SCC für US-Anteile              | Online verfügbar                                       | Bankdaten in EU (Stripe Payments Europe).                                   |
| **OpenAI / ChatGPT API**                  | USA                     | Ja                         | EU-US DPF + SCC + DPA           | Online verfügbar                                       | DPA via openai.com/policies/data-processing-addendum.                       |
| **Anthropic API**                         | USA                     | Ja                         | SCC + DPA                       | Online verfügbar                                       | DPA über Sales/Support; "Claude Privacy" lesen.                             |
| **Lexware Office (Haufe)**                | Deutschland             | Nein                       | n/a — kein Drittland            | Online verfügbar                                       | ISO-27001-Rechenzentren in Frankfurt; SCC im AVV enthalten.                 |
| **DATEV**                                 | Deutschland             | Nein                       | n/a                             | Standard-AVV                                           | Genossenschaft, EU-Sitz.                                                    |
| **Telegram (Bot-API)**                    | UAE / weltweit          | Ja                         | Art. 49 (1) lit. a Einwilligung | Kein klassischer AVV — Telegram ist Übertragungsdienst | Endnutzer wird beim `/start`-Befehl explizit aufgeklärt + Zustimmung holen. |
| **Notion**                                | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       |                                                                             |
| **Trello**                                | USA (Atlassian)         | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       |                                                                             |
| **Asana**                                 | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       |                                                                             |
| **Zapier**                                | USA                     | Ja                         | EU-US DPF + SCC                 | Online verfügbar                                       | Doppel-Brücke vermeiden — n8n macht Zapier oft überflüssig.                 |
| **Make (Integromat)**                     | Tschechien (EWR)        | Möglich, je nach Modul     | SCC für US-Module               | Online verfügbar                                       |                                                                             |
| **AWS / Azure / GCP**                     | USA + EU-Region wählbar | Ja, sofern nicht EU-Region | EU-US DPF + SCC                 | Online verfügbar                                       | Region beim Anlegen explizit auf EU setzen.                                 |

> Die Tabelle ist nicht abschließend. Bei jedem neu eingeführten Konnektor
> muss vor produktivem Einsatz die Drittland-Lage geprüft werden.

## TIA — wann nötig?

Ein Transfer Impact Assessment ist verpflichtend für jede Übermittlung in
ein Drittland ohne Angemessenheitsbeschluss (Art. 45 DSGVO). Für US-Anbieter
unter dem EU-US-DPF entfällt es **nicht** automatisch — nach Schrems-II-
Doktrin bleibt die Pflicht zur Einzelfallprüfung bestehen, weil der DPF
politisch angreifbar ist.

Eine TIA-Vorlage findet sich z.B. unter intersoft-consulting.de.

## Telegram — Sonderfall

Telegram ist nach h.M. **kein Auftragsverarbeiter**, sondern ein Anbieter
eines Übertragungsdiensts (vergleichbar mit einem TK-Anbieter). Es gibt
keinen klassischen AVV mit Telegram. Das BfDI hat 2023 festgestellt, dass
Telegram die DSGVO „missachtet". Praktisch bedeutet das:

- Der Endnutzer (Telegram-User) wählt freiwillig, mit dem Bot zu
  kommunizieren — Auffanggrundlage **Art. 49 (1) lit. a DSGVO** (ausdrückliche
  Einwilligung nach Aufklärung über Risiken).
- Der Bot **muss** beim ersten Kontakt (`/start`) eine Datenschutz-Aufklärung
  ausspielen, die den Drittland-Hinweis enthält und eine Inline-Keyboard-
  Bestätigung verlangt — siehe Phase 6 in `docs/plans/active/EXTERNAL_INTEGRATIONS.md`.
- `telegram_user_id` wird vor Speicherung HMAC-pseudonymisiert.
- Endnutzer bekommt jederzeit `/datenschutz`, `/loeschen`, `/auskunft` als
  Bot-Commands.

## Pflichten des Auftraggebers

Pro Konnektor, den der Auftraggeber in n8n einrichtet:

1. AVV mit dem jeweiligen SaaS-Anbieter abschließen.
2. Drittland-Schutzgrundlage dokumentieren (DPF / SCC / Einwilligung).
3. TIA durchführen, sofern Drittland und kein Angemessenheitsbeschluss.
4. Verarbeitungstätigkeit ins Verzeichnis nach Art. 30 DSGVO eintragen.
5. Mitarbeitende, die den Workflow erstellen / nutzen, schulen.
