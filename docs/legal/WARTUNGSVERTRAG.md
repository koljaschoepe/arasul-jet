# Software-Wartungs- und Support-Vertrag

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Zwischen:**

- Arasul GmbH (in Gründung), nachfolgend "Auftragnehmer", und
- [Auftraggeber], nachfolgend "Auftraggeber"

---

## Präambel

Dieser Vertrag regelt die laufende Wartung und den Support der vom Auftragnehmer gelieferten Arasul Edge-AI-Appliance einschließlich der darauf installierten Software. Er ergänzt den zugrundeliegenden Kauf- und Lizenzvertrag ([AGB_TEMPLATE.md](./AGB_TEMPLATE.md)).

---

## § 1 Vertragsgegenstand

(1) Der Auftragnehmer erbringt für den Auftraggeber Wartungs- und Support-Leistungen für die im Hauptvertrag spezifizierte Arasul-Box samt Software-Stack.

(2) Die Wartungsleistungen umfassen die in § 3 beschriebenen Leistungen je nach gebuchtem Tier (Standard oder Premium).

---

## § 2 Vertragslaufzeit, Kündigung

(1) Der Wartungsvertrag beginnt mit Übergabe der Arasul-Box an den Auftraggeber und hat eine **Mindestlaufzeit von 12 Monaten**.

(2) Im **ersten Vertragsjahr** ist die Wartung im Kaufpreis der Appliance enthalten.

(3) Nach Ablauf der Mindestlaufzeit verlängert sich der Vertrag automatisch um jeweils **12 weitere Monate**, sofern er nicht von einer Vertragspartei mit einer Frist von **3 Monaten** zum jeweiligen Vertragsende schriftlich gekündigt wird.

(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.

(5) Kündigungen bedürfen der Textform (E-Mail genügt).

---

## § 3 Leistungen des Auftragnehmers

### 3.1 Software-Updates

- Bereitstellung von Software-Updates über den Update-Kanal der Plattform
- Sämtliche Updates werden mittels **Cosign / Sigstore signiert** und vor Installation auf der Appliance verifiziert
- Major-Releases nach Verfügbarkeit, Minor-Releases regelmäßig
- Auf Wunsch des Auftraggebers Wechsel auf den LTS-Kanal (geringere Update-Frequenz, längere Stabilität)

### 3.2 Sicherheits-Patches

- Kritische Sicherheits-Patches werden nach Möglichkeit **innerhalb von 7 Tagen** nach Bekanntwerden bereitgestellt
- Information des Auftraggebers über kritische Sicherheitslücken (CVE-Notification)
- Empfehlungen zur Konfiguration und zu Mitigationen

### 3.3 Konfigurations-Hilfe

- Unterstützung bei der Erstkonfiguration und bei wesentlichen Änderungen
- Hilfestellung bei der Einrichtung von Knowledge-Spaces, Workflows, Integrationen
- Beantwortung administrativer Fragen rund um die Plattform

### 3.4 Support (Standard-Tier)

- **8/5-Support:** Werktags Montag bis Freitag, 09:00 bis 17:00 Uhr (deutsche Zeit), gesetzliche Feiertage am Sitz des Auftragnehmers ausgenommen
- **Antwortbestätigung:** Innerhalb von **24 Stunden** nach Eingang einer Anfrage über das Ticket-System oder per E-Mail (gerechnet in Support-Zeiten)
- **Lösungsziel:** **5 Werktage** für Standard-Anfragen (Richtwert, **kein bindendes SLA**)
- Kommunikationskanäle: Ticket-System (Web), E-Mail, optional Telefon-Hotline

### 3.5 Support (Premium-Tier, optional gegen Aufpreis)

- **24/7-Support:** rund um die Uhr, 7 Tage die Woche
- **Reaktionszeit:** **4 Stunden** für kritische Störungen
- Bindendes SLA gemäß [SLA_STANDARD.md](./SLA_STANDARD.md)
- Priorisierte Bearbeitung
- Optional: dediziertes Account-Management

### 3.6 Wartungs-Check ab Vertragsjahr 3

- **Zweimal jährlich** Wartungs-Check durch den Auftragnehmer (remote oder vor Ort)
- Inhalt: Health-Check, Backup-Verifikation, Performance-Review, Update-Empfehlungen
- Vor-Ort-Termine ggfs. mit Reisekosten gemäß § 4 Abs. 4

---

## § 4 Vergütung

(1) Die jährliche Wartungspauschale beträgt:

- **Standard-Tier:** € 990,– netto pro Jahr
- **Premium-Tier:** € 1.490,– netto pro Jahr

(2) Die Vergütung ist **jährlich im Voraus** fällig, jeweils zum Beginn des neuen Wartungsjahres.

(3) Der Auftragnehmer ist berechtigt, die Vergütung einmal jährlich zum Vertragsverlängerungstermin anzupassen, sofern dies dem Auftraggeber mit einer Frist von 3 Monaten vor Ablauf der laufenden Vertragsperiode mitgeteilt wird. Anpassungen über 5 % p.a. berechtigen den Auftraggeber zur Sonderkündigung.

(4) Vor-Ort-Einsätze und Reisekosten sind nicht in der Wartungspauschale enthalten und werden gemäß gesondertem Angebot abgerechnet.

(5) Leistungen außerhalb des Wartungsumfangs (z. B. kundenseitig gewünschte Custom-Entwicklungen, Schulungen, Migrationen) werden nach Aufwand zu marktüblichen Stundensätzen abgerechnet.

---

## § 5 Mitwirkungspflichten des Auftraggebers

(1) Der Auftraggeber stellt sicher, dass die Arasul-Box mit dem Internet verbunden ist (für Update-Downloads und Remote-Support, sofern beauftragt).

(2) Der Auftraggeber benennt einen Ansprechpartner und einen Stellvertreter mit ausreichender technischer Kompetenz.

(3) Der Auftraggeber führt regelmäßig die mitgelieferten Backup-Funktionen aus und testet diese.

(4) Bei Remote-Support gewährt der Auftraggeber den notwendigen Zugang gemäß den Bestimmungen des [AVV_TEMPLATE.md](./AVV_TEMPLATE.md), Ziffer 7.

---

## § 6 Ausgeschlossene Leistungen

Folgende Leistungen sind **nicht** im Wartungsvertrag enthalten:

- **Hardware-Defekte:** Diese unterliegen der separaten Hardware-Gewährleistung gemäß § 7 [AGB_TEMPLATE.md](./AGB_TEMPLATE.md). Reparaturen oder Austausch außerhalb der Gewährleistung werden nach Aufwand abgerechnet.
- **Schäden durch kundenseitige Fehlbedienung**, unsachgemäße Eingriffe, ungeeignete Betriebsumgebung (z. B. Überhitzung, Feuchtigkeit, Stromschwankungen ohne USV)
- **Schäden durch nicht-autorisierte Veränderungen** an Hardware oder Software
- **Höhere Gewalt** (siehe § 12 [AGB_TEMPLATE.md](./AGB_TEMPLATE.md))
- **Drittsoftware**, die der Auftraggeber selbst installiert hat
- **Daten-Wiederherstellung** über die mitgelieferten Backup-Mechanismen hinaus
- **Schulung der End-Anwender** über das Erstkundengespräch hinaus

---

## § 7 Reaktionszeiten und Service Level

(1) Bindende Service Level gelten ausschließlich im **Premium-Tier** und sind in [SLA_STANDARD.md](./SLA_STANDARD.md) detailliert geregelt.

(2) Im **Standard-Tier** sind die in § 3.4 genannten Antwort- und Lösungszeiten **Richtwerte**, die der Auftragnehmer nach besten Kräften einzuhalten bemüht ist.

---

## § 8 Datenschutz

(1) Im Rahmen der Wartungstätigkeit kann der Auftragnehmer auf personenbezogene Daten des Auftraggebers Zugriff erhalten. Es gilt der [AVV_TEMPLATE.md](./AVV_TEMPLATE.md) als Anlage zu diesem Vertrag.

(2) Das Personal des Auftragnehmers wird auf Datenschutz und einschlägige Schweigepflichten (insbesondere § 203 StGB) verpflichtet.

---

## § 9 Haftung

Die Haftung des Auftragnehmers richtet sich nach § 9 [AGB_TEMPLATE.md](./AGB_TEMPLATE.md). Eine darüber hinausgehende Haftung wird durch diesen Wartungsvertrag nicht begründet.

---

## § 10 Schlussbestimmungen

(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform.

(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

(3) Es gilt deutsches Recht. Gerichtsstand ist der Sitz des Auftragnehmers.

---

**Ort, Datum:** **********\_\_\_**********

**Auftraggeber:** **********\_\_\_**********

**Auftragnehmer (Arasul GmbH i. G.):** **********\_\_\_**********

---

**Anlagen:**

- [AVV_TEMPLATE.md](./AVV_TEMPLATE.md) - Auftragsverarbeitungs-Vertrag
- [TOMs.md](./TOMs.md) - Technisch-organisatorische Maßnahmen
- [SLA_STANDARD.md](./SLA_STANDARD.md) - Service Level Agreement
