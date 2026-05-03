# Auftragsverarbeitungs-Vertrag (AVV) nach Art. 28 DSGVO

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Status:** Vorlage / Template
**Anwendung:** Bei Vertragsschluss zwischen Arasul GmbH (in Gründung) und Auftraggeber als Anlage zum Hauptvertrag.

---

## Präambel

Dieser Auftragsverarbeitungs-Vertrag (nachfolgend "AVV") konkretisiert die datenschutzrechtlichen Verpflichtungen der Vertragsparteien gemäß Art. 28 DSGVO im Rahmen der Bereitstellung und des Betriebs der Arasul Edge-AI-Appliance (nachfolgend "Arasul-Box" oder "Appliance"). Er ergänzt den zugrundeliegenden Hauptvertrag (Kaufvertrag, Lizenzvertrag und/oder Wartungsvertrag).

---

## 1. Vertragsparteien

**Verantwortlicher (Auftraggeber):**

- Firma: [Name des Auftraggebers]
- Anschrift: [Anschrift]
- Vertretungsberechtigt: [Name]
- E-Mail: [Datenschutzkontakt]

**Auftragsverarbeiter:**

- Arasul GmbH (in Gründung)
- Anschrift: [Anschrift Arasul GmbH]
- Vertretungsberechtigt: [Geschäftsführung]
- Datenschutzbeauftragter: [Name / extern]
- E-Mail: datenschutz@arasul.de

---

## 2. Gegenstand und Dauer der Verarbeitung

### 2.1 Gegenstand

Der Auftragsverarbeiter stellt dem Auftraggeber eine Hardware-Appliance (Arasul-Box) mit darauf installierter Software zur Verfügung, welche folgende Verarbeitungsleistungen erbringt:

- KI-gestützte Inferenz (Large Language Model, lokal auf der Appliance)
- Retrieval Augmented Generation (RAG) mit Vektor-Datenbank
- Workflow-Automatisierung über n8n
- Optional: Diktat / Spracheingabe, Telegram-Bot-Integration, E-Mail-Zusammenfassung

### 2.2 Dauer

Die Verarbeitung beginnt mit Inbetriebnahme der Appliance und endet mit Ablauf des Hauptvertrags bzw. mit Rückgabe oder Außerbetriebnahme der Appliance.

---

## 3. Art und Zweck der Verarbeitung

### 3.1 Art

Die personenbezogenen Daten werden ausschließlich **lokal auf der Hardware-Appliance** des Auftraggebers verarbeitet. Es findet **keine Übertragung in die Cloud** und **keine Übermittlung an Dritte** statt.

### 3.2 Zweck

Bereitstellung KI-gestützter Funktionen zur Unterstützung der internen Geschäftsprozesse des Auftraggebers (z. B. Dokumenten-Analyse, Vertragsprüfung, Recherche, Korrespondenz-Erstellung).

---

## 4. Art der Daten

Folgende Datenkategorien können verarbeitet werden:

- Mandanten-, Patienten- oder Klienten-Dokumente (PDF, Office, Text)
- Chat-Verläufe und Prompts
- E-Mail-Inhalte (bei Aktivierung der entsprechenden Workflows)
- Audio-Aufnahmen (bei Diktat-Funktion)
- Strukturierte Geschäftsdaten (Tabellen, Datenbank-Inhalte)
- Nutzungsmetadaten (Benutzer-IDs, Zeitstempel, Audit-Logs)

Besondere Kategorien personenbezogener Daten gemäß Art. 9 DSGVO (z. B. Gesundheitsdaten bei Arztpraxen) können enthalten sein. Berufsgeheimnisse i. S. v. § 203 StGB (z. B. anwaltliche Mandatsbeziehungen) sind regelmäßig betroffen.

---

## 5. Kategorien betroffener Personen

- Mandanten / Klienten / Patienten des Auftraggebers
- Mitarbeiter des Auftraggebers (als Nutzer der Appliance)
- Geschäftspartner und sonstige Kontakte des Auftraggebers
- Sonstige in den verarbeiteten Dokumenten genannte natürliche Personen

---

## 6. Technisch-organisatorische Maßnahmen (TOM)

Der Auftragsverarbeiter trifft die in der Anlage ["TOMs.md"](./TOMs.md) beschriebenen technischen und organisatorischen Maßnahmen gemäß Art. 32 DSGVO. Diese sind Bestandteil dieses AVV.

Wesentliche Maßnahmen:

- LUKS-Festplattenverschlüsselung (Full Disk Encryption)
- Server-Side Encryption mit KMS für Object Storage (MinIO SSE-KMS)
- Verschlüsselte Backups
- Multi-User-Isolation mit Knowledge-Space-ACL
- Audit-Log mit 7-jähriger Aufbewahrung
- Signierte Software-Updates (Cosign)

---

## 7. On-Prem-Klausel / Kein Klartext-Zugriff

### 7.1 Grundsatz

Der Auftragsverarbeiter erhält **keinen Klartext-Zugriff** auf personenbezogene Daten des Auftraggebers, da die Verarbeitung ausschließlich auf der beim Auftraggeber installierten Hardware-Appliance erfolgt.

### 7.2 Ausnahme: Remote-Support

Ein Klartext-Zugriff durch Mitarbeiter des Auftragsverarbeiters ist ausschließlich zulässig, wenn

1. der Auftraggeber explizit und schriftlich (auch per E-Mail) einen Remote-Support beauftragt,
2. der Zugriff auf das zur Fehlerbehebung notwendige Maß beschränkt bleibt,
3. der Zugriff revisionssicher protokolliert wird (Audit-Log),
4. der Zugriff über eine verschlüsselte Verbindung erfolgt (SSH / VPN).

### 7.3 Schweigepflicht-Personal

Mitarbeiter des Auftragsverarbeiters, die im Rahmen von Remote-Support Zugang zu Daten erhalten, welche dem Schutz von **§ 203 StGB** (Verletzung von Privatgeheimnissen) unterliegen, werden ausdrücklich auf die Wahrung dieser Schweigepflicht verpflichtet. Der Auftraggeber erhält auf Anfrage die entsprechenden Verpflichtungserklärungen.

---

## 8. Sub-Auftragsverarbeiter

### 8.1 Grundsatz

Der Auftragsverarbeiter setzt **keine Sub-Auftragsverarbeiter** ein, da die gesamte Verarbeitung lokal auf der Appliance des Auftraggebers stattfindet.

### 8.2 Ausnahme

Im Falle eines beauftragten Remote-Supports (siehe Ziffer 7.2) kann der Auftragsverarbeiter qualifizierte Subunternehmer einsetzen. Diese werden vorab namentlich benannt und vertraglich zur Einhaltung der DSGVO sowie der Schweigepflichten verpflichtet. Der Auftraggeber kann dem Einsatz widersprechen.

---

## 9. Weisungsrecht des Auftraggebers

Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich auf dokumentierte Weisung des Auftraggebers. Eine Weisung gilt als erteilt durch:

- Konfiguration der Appliance durch den Auftraggeber
- Nutzung der Funktionen durch autorisierte Mitarbeiter des Auftraggebers
- Schriftliche Anweisungen (E-Mail, Ticket-System)

Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, hat er den Auftraggeber unverzüglich zu informieren.

---

## 10. Verschwiegenheit der Mitarbeiter

Der Auftragsverarbeiter verpflichtet alle mit der Datenverarbeitung befassten Mitarbeiter schriftlich auf das Datengeheimnis nach Art. 28 Abs. 3 lit. b DSGVO sowie auf einschlägige Schweigepflichten (insbesondere § 203 StGB bei Berufsgeheimnisträgern). Die Verpflichtung wirkt über das Ende des Beschäftigungsverhältnisses hinaus.

---

## 11. Rechte des Auftraggebers

### 11.1 Auskunfts- und Kontrollrechte

Der Auftraggeber ist berechtigt, jederzeit die Einhaltung dieses Vertrags zu kontrollieren, insbesondere durch:

- Einsichtnahme in die TOMs (Anlage [TOMs.md](./TOMs.md))
- Anforderung von Audit-Log-Auszügen
- Vor-Ort-Audits nach angemessener Vorankündigung (mind. 14 Tage)

### 11.2 Unterstützungspflichten

Der Auftragsverarbeiter unterstützt den Auftraggeber bei:

- Beantwortung von Anfragen Betroffener (Art. 15-22 DSGVO)
- Datenschutz-Folgenabschätzungen (siehe [DSFA_VORLAGE.md](./DSFA_VORLAGE.md))
- Meldungen von Datenschutzverletzungen (Art. 33, 34 DSGVO)
- Konsultation der Aufsichtsbehörde

### 11.3 Meldepflicht bei Datenschutzverletzungen

Der Auftragsverarbeiter informiert den Auftraggeber unverzüglich, spätestens innerhalb von **24 Stunden** nach Kenntniserlangung, über jede Datenschutzverletzung, die personenbezogene Daten des Auftraggebers betrifft.

---

## 12. Löschung und Rückgabe nach Vertragsende

Nach Beendigung des Vertrags hat der Auftraggeber die Wahl zwischen:

- **Rückgabe** sämtlicher Daten in einem gängigen Format (Export-Funktion der Appliance)
- **Löschung** sämtlicher Daten, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen

Die Löschung erfolgt durch sicheres Überschreiben der Datenträger (LUKS-Re-Key + Wipe). Der Auftragsverarbeiter bestätigt die Löschung schriftlich.

Audit-Logs unterliegen der gesetzlichen Aufbewahrungsfrist von 7 Jahren (handels- und steuerrechtliche Anforderungen).

---

## 13. Haftung

Die Haftung der Vertragsparteien richtet sich nach Art. 82 DSGVO sowie den Regelungen des Hauptvertrags. Eine darüber hinausgehende Haftung wird nicht begründet.

---

## 14. Schlussbestimmungen

### 14.1 Vorrang

Bei Widersprüchen zwischen diesem AVV und dem Hauptvertrag geht dieser AVV in datenschutzrechtlichen Fragen vor.

### 14.2 Schriftform

Änderungen und Ergänzungen bedürfen der Textform (E-Mail genügt).

### 14.3 Salvatorische Klausel

Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

### 14.4 Gerichtsstand und anwendbares Recht

Es gilt deutsches Recht. Gerichtsstand ist der Sitz des Auftragsverarbeiters.

---

## Anlagen

- Anlage 1: [TOMs.md](./TOMs.md) - Technisch-organisatorische Maßnahmen
- Anlage 2: [DSFA_VORLAGE.md](./DSFA_VORLAGE.md) - Datenschutz-Folgenabschätzung (sofern erforderlich)

---

**Ort, Datum:** **********\_\_\_**********

**Auftraggeber:** **********\_\_\_**********

**Auftragsverarbeiter (Arasul GmbH i. G.):** **********\_\_\_**********
