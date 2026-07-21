# Auftragsverarbeitungsvertrag (AVV) — Vorlage

> **Status:** DRAFT — Anwaltliche Prüfung vor Vertragsabschluss erforderlich.
>
> Dieser AVV-Entwurf basiert auf Art. 28 DSGVO und der Standardvorlage des
> BMJ (Stand 2024). Er ist nicht abschließend juristisch geprüft.

**Vertrag über die Verarbeitung personenbezogener Daten im Auftrag**
nach Art. 28 DSGVO

---

## § 1 Vertragsparteien

**Verantwortlicher** (im Folgenden „Auftraggeber"):

- Firma: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Anschrift: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Vertretungsberechtigt: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Datenschutzbeauftragter (sofern bestellt): **\*\*\*\***\_\_\_\_**\*\*\*\***

**Auftragsverarbeiter** (im Folgenden „Auftragnehmer"):

- Firma: **[Arasul-Anbieter — bitte einsetzen]**
- Anschrift: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Vertretungsberechtigt: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Datenschutzbeauftragter: **\*\*\*\***\_\_\_\_**\*\*\*\***

---

## § 2 Gegenstand und Dauer

(1) Gegenstand der Verarbeitung ist die Bereitstellung und der Betrieb der
Arasul Edge-AI-Appliance, einschließlich der lokalen LLM-Inferenz, Dokumenten-
Indexierung, Workflow-Engine (n8n) und Workspaces (isolierte Arbeitsumgebungen).

(2) Die Verarbeitung erfolgt **lokal auf der beim Auftraggeber installierten
Hardware**. Eine Übertragung personenbezogener Daten an den Auftragnehmer
erfolgt nur im Rahmen von Wartung, Updates und Support nach den Regelungen in
§ 7 (Subunternehmer) und § 9 (technische Maßnahmen).

(3) Die Laufzeit dieses AVV entspricht der Laufzeit des Hauptvertrags über
die Bereitstellung der Arasul-Appliance.

---

## § 3 Art und Zweck der Datenverarbeitung

Der Auftragnehmer verarbeitet personenbezogene Daten ausschließlich zu folgenden Zwecken:

- Betrieb der KI-Inferenz, Embeddings, RAG-Anfragen
- Speicherung von Chat-Verläufen, Workflow-Definitionen, n8n-Credentials
- Verarbeitung eingehender und ausgehender Nachrichten (Webhooks, Workflow-Aufrufe)
- Telemetrie für Self-Healing, Backup und Monitoring (lokal, kein Versand)
- Remote-Wartung und Software-Updates (nur auf ausdrückliche Anforderung des Auftraggebers)

---

## § 4 Art der Daten und Kategorien betroffener Personen

**Art der personenbezogenen Daten:**

- Stammdaten (Name, Kontaktdaten, Berufs-/Tätigkeitsdaten)
- Kommunikationsinhalte (Chats mit dem KI-Assistenten)
- Dokumenteninhalte (vom Auftraggeber hochgeladene Dokumente, RAG-Index)
- Authentifizierungsdaten (Hash der Passwörter, JWT-Token, Bot-Tokens, OAuth-Tokens)
- Nutzungsdaten (Zeitpunkt, Modell, Tokenanzahl, Workflow-Ausführungen)

**Kategorien betroffener Personen:**

- Mitarbeiter:innen des Auftraggebers
- Endkund:innen / Kontakte des Auftraggebers (z.B. bei Lexware-Integration)
- Externe Kommunikationspartner (z.B. Microsoft-Teams-Mitglieder)

**Besondere Kategorien (Art. 9 DSGVO):** sind nicht primärer Verarbeitungs-
zweck, können aber in Chat-Inhalten enthalten sein. Auftraggeber wird
hinsichtlich seiner Endnutzer eigenständig prüfen, ob seine Anwendungsfälle
Art-9-Daten erfassen.

---

## § 5 Pflichten des Auftragnehmers

Der Auftragnehmer verpflichtet sich:

(1) Personenbezogene Daten nur auf dokumentierte Weisung des Auftraggebers
zu verarbeiten.

(2) Die zur Datenverarbeitung eingesetzten Personen vor Beginn der Tätigkeit
schriftlich zur Vertraulichkeit zu verpflichten.

(3) Die in Anlage 1 (TOM) beschriebenen technischen und organisatorischen
Maßnahmen einzuhalten und auf Anforderung nachzuweisen.

(4) Den Auftraggeber unverzüglich zu informieren, wenn eine Weisung gegen
datenschutzrechtliche Vorschriften verstößt (Art. 28 (3) lit. h DSGVO).

(5) Den Auftraggeber bei seinen Pflichten nach Art. 32–36 DSGVO zu unter-
stützen, soweit angemessen und unter Berücksichtigung der Art der Verarbeitung.

(6) Daten nach Beendigung des Hauptvertrags **innerhalb von 30 Tagen**
entweder zurückzugeben oder zu löschen, nach Wahl des Auftraggebers. Eine
Bestätigung der Löschung wird in Textform erteilt.

(7) Eine Datenschutzverletzung dem Auftraggeber unverzüglich, spätestens
**innerhalb von 24 Stunden** nach Bekanntwerden zu melden.

---

## § 6 Pflichten des Auftraggebers

Der Auftraggeber:

(1) ist allein verantwortlich für die Beurteilung der Zulässigkeit der
Verarbeitung sowie für die Wahrung der Rechte der betroffenen Personen.

(2) erteilt schriftliche Weisungen zur Verarbeitung. Mündliche Weisungen
sind unverzüglich schriftlich (E-Mail genügt) zu bestätigen.

(3) benennt einen Ansprechpartner für datenschutzrechtliche Fragen.

(4) ist verantwortlich für die Erstellung des Verzeichnisses von
Verarbeitungstätigkeiten (Art. 30 DSGVO) bezüglich der über die Appliance
verarbeiteten Daten. Der Auftragnehmer stellt hierzu die in
`docs/legal/DATENSCHUTZ_N8N.md` und der Produktdokumentation enthaltenen
Informationen bereit.

---

## § 7 Subunternehmer

(1) Die Inanspruchnahme von Subunternehmern (weiteren Auftragsverarbeitern)
bedarf der vorherigen schriftlichen Genehmigung durch den Auftraggeber.

(2) Folgende Subunternehmer werden bei Vertragsschluss eingesetzt
(Stand bei Lieferung):

| Subunternehmer | Zweck                                 | Sitz / Drittland | Schutzgrundlage |
| -------------- | ------------------------------------- | ---------------- | --------------- |
| _(keine)_      | Lokale Verarbeitung auf der Appliance | DE               | n/a             |

(3) Bei zusätzlich vom Auftraggeber freigegebenen Konnektoren (z.B. Microsoft
Teams, Slack, Lexware) handelt es sich nicht um Subunternehmer des Auftrag-
nehmers, sondern um eigene Auftragsverarbeitungsverhältnisse zwischen
Auftraggeber und dem jeweiligen SaaS-Anbieter. Der Auftraggeber schließt mit
diesen Anbietern eigenständig AVVs ab; siehe `DRITTLAND_KONNEKTOREN.md`.

(4) Eine Änderung dieser Liste wird dem Auftraggeber **mindestens 30 Tage
im Voraus** in Textform angezeigt; der Auftraggeber hat ein außerordentliches
Kündigungsrecht.

---

## § 8 Übermittlungen in Drittländer

Eine Übermittlung personenbezogener Daten in ein Drittland durch den
Auftragnehmer findet **nicht statt**. Sollten Updates oder Wartung über vom
Auftragnehmer bereitgestellte Cloud-Dienste erfolgen, wird der Auftraggeber
vorab informiert; er kann den Cloud-Bezug jederzeit deaktivieren.

Konnektoren, die der Auftraggeber selbst in n8n einrichtet (Microsoft, Google,
Slack, Stripe, …), übertragen Daten an den jeweiligen Anbieter. Diese
Übermittlungen liegen außerhalb dieses AVV; siehe `DRITTLAND_KONNEKTOREN.md`.

---

## § 9 Technische und organisatorische Maßnahmen (TOM)

Anlage 1 zu diesem Vertrag.

Kurzfassung:

- **Vertraulichkeit:** Zugangskontrolle (Dashboard-Login, JWT, BotFather-Tokens
  AES-256-encrypted), Zutrittskontrolle (Hardware beim Auftraggeber),
  Trennungskontrolle (Multi-User-Isolation, RBAC).
- **Integrität:** Eingabekontrolle (Audit-Log Postgres-Trigger auf
  workflow_entity / credentials_entity / user), Übertragungskontrolle (TLS
  ≥1.2 für jede ausgehende Verbindung, valide CA-signierte Zertifikate).
- **Verfügbarkeit:** Tägliche Backups mit AES-256-Verschlüsselung,
  monatliche Restore-Drills, Self-Healing-Agent.
- **Belastbarkeit:** Ressourcenlimits, Rate-Limiting, Container-Isolation
  (`no-new-privileges`, `cap_drop=ALL`).
- **Wiederherstellbarkeit:** WAL-Archivierung, Wochen-/Monats-Snapshots
  (5-Jahre-Retention), Encryption-Key-Escrow.
- **Verfahren regelmäßiger Überprüfung:** monatliche Backup-Tests, jährlicher
  Penetration-Test, Audit-Log-Reviews.

---

## § 10 Schlussbestimmungen

(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Schriftform.

(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der
übrigen Bestimmungen unberührt.

(3) Anwendbares Recht: deutsches Recht. Gerichtsstand: Sitz des Auftragnehmers.

---

**Ort, Datum:** **\*\*\*\***\_\_\_\_**\*\*\*\***

**Auftraggeber:** **\*\*\*\***\_\_\_\_**\*\*\*\***

**Auftragnehmer:** **\*\*\*\***\_\_\_\_**\*\*\*\***
