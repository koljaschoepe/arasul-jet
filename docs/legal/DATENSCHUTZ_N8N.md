# Datenschutz-Hinweise: n8n-Komponente

> **Status:** DRAFT — Anwaltliche Prüfung vor kommerzieller GA erforderlich.
>
> Dieser Text ist als Modul gedacht, das der Auftraggeber (Verantwortlicher
> i.S.v. Art. 4 DSGVO) in seine eigene Datenschutzerklärung übernehmen kann.

## 1. Was n8n ist

n8n ist eine Workflow-Engine, die Ihren Mitarbeitenden ermöglicht, Abläufe
zwischen verschiedenen Diensten zu automatisieren — z.B. „neue Lexware-
Rechnung → Slack-Benachrichtigung → DMS-Eintrag". Die Engine läuft lokal auf
der Arasul-Appliance in Ihrem Netz. Daten verlassen die Appliance nur dann,
wenn ein Workflow das ausdrücklich vorsieht.

## 2. Welche personenbezogenen Daten n8n verarbeitet

| Datenart                            | Speicherort                              | Löschfrist                              |
| ----------------------------------- | ---------------------------------------- | --------------------------------------- |
| Workflow-Definitionen               | PostgreSQL (lokal, Schema `n8n`)         | Bis zur Löschung durch Sie              |
| Credentials (API-Keys, OAuth-Token) | PostgreSQL, AES-encrypted                | Bis zur Löschung durch Sie              |
| Ausführungs-Logs (Erfolg)           | n.v. — werden **nicht** gespeichert      | n.v.                                    |
| Ausführungs-Logs (Fehler)           | PostgreSQL                               | **14 Tage**, dann automatisch gelöscht  |
| Manuelle Test-Ausführungen          | n.v. — werden **nicht** gespeichert      | n.v.                                    |
| Audit-Trail (DSGVO Art. 30)         | PostgreSQL Schema `arasul.n8n_audit_log` | **365 Tage**, dann automatisch gelöscht |
| Webhook-Eingaben                    | nur in Fehler-Logs (s.o.)                | s.o.                                    |

Die Werte stammen aus den Variablen `EXECUTIONS_DATA_SAVE_*` und
`EXECUTIONS_DATA_MAX_AGE` in `compose/compose.app.yaml` und der Migration
`090_n8n_audit_log.sql`.

## 3. Rechtsgrundlage

- **Art. 6 (1) lit. b DSGVO** — Vertragserfüllung mit dem Auftraggeber, soweit
  Workflows der Vertragsdurchführung dienen.
- **Art. 6 (1) lit. f DSGVO** — berechtigtes Interesse des Auftraggebers an
  Geschäftsprozessautomatisierung, soweit keine überwiegenden Interessen der
  Betroffenen entgegenstehen.
- Bei der Verbindung von n8n mit Drittland-SaaS (z.B. Microsoft, Google):
  zusätzlich **Art. 6 (1) lit. a DSGVO** (Einwilligung) und/oder Art. 49 (1)
  lit. b DSGVO (Vertragserfüllung mit Betroffenem) — siehe
  `DRITTLAND_KONNEKTOREN.md`.

## 4. Empfänger der Daten

n8n übermittelt Daten **nur an Empfänger, die der Auftraggeber selbst in
seinen Workflows konfiguriert** (z.B. Microsoft Teams, Slack, Lexware).
Eine standardmäßige Übermittlung findet nicht statt.

Workflows, die solche Übermittlungen vorsehen, sind im Verzeichnis von
Verarbeitungstätigkeiten (Art. 30 DSGVO) zu dokumentieren.

## 5. Sicherheit

- TLS-Pflicht für alle ausgehenden Verbindungen (Standard 443).
- Credentials AES-256-verschlüsselt im PostgreSQL gespeichert; der
  Verschlüsselungsschlüssel liegt als Docker-Secret und wird zusätzlich im
  Backup-Escrow vorgehalten.
- n8n-Editor nur erreichbar nach Dashboard-Login (Forward-Auth) und
  zusätzlich n8n-eigener Authentifizierung.
- Webhook-Endpunkt rate-limited (10 req/s). HMAC-Validierung wird workflow-
  spezifisch eingerichtet.
- SSRF-Schutz auf Container-Ebene (Code-Nodes können kein `process.env`
  lesen, kein freies Dateisystem lesen).
- Community-Packages sind deaktiviert — installierbare Drittanbieter-Nodes
  laufen nur, wenn sie vom Auftragnehmer in das Image vendored wurden.

## 6. Betroffenenrechte

Sie können von uns (dem Auftraggeber als Verantwortlichen) jederzeit:

- Auskunft über die zu Ihrer Person gespeicherten Daten verlangen
  (Art. 15 DSGVO).
- Berichtigung unrichtiger Daten verlangen (Art. 16 DSGVO).
- Löschung Ihrer Daten verlangen (Art. 17 DSGVO).
- Einschränkung der Verarbeitung verlangen (Art. 18 DSGVO).
- Datenübertragbarkeit (Art. 20 DSGVO).
- Widerspruch gegen die Verarbeitung einlegen (Art. 21 DSGVO).
- Beschwerde bei der zuständigen Aufsichtsbehörde einlegen (Art. 77 DSGVO).

Kontakt: **\*\*\*\***\_\_\_\_**\*\*\*\*** (Datenschutzbeauftragter des Auftraggebers).
