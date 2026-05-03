# Service Level Agreement (SLA)

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Anlage zu:** [WARTUNGSVERTRAG.md](./WARTUNGSVERTRAG.md)
**Geltungsbereich:** Standard-Tier (verbindlich), Premium-Tier (verbindlich, erweitert)

---

## § 1 Gegenstand

Dieses SLA definiert die zugesicherten Service Level für die vom Auftragnehmer (Arasul GmbH i. G.) gelieferte Arasul-Box. Es gilt ergänzend zum Wartungsvertrag und konkretisiert dessen Leistungsumfang.

---

## § 2 Verfügbarkeit

### 2.1 Zugesicherte Verfügbarkeit (Box-Uptime)

| Tier     | Verfügbarkeit pro Monat | Erlaubte Downtime pro Monat |
| -------- | ----------------------- | --------------------------- |
| Standard | **99,0 %**              | ca. **7,3 Stunden**         |
| Premium  | **99,5 %**              | ca. **3,6 Stunden**         |

### 2.2 Messmethode

- Gemessen wird die Verfügbarkeit der Kern-Services (Backend-API, LLM-Service, Datenbank) auf der Arasul-Box.
- Die Messung erfolgt über den im Lieferumfang enthaltenen Self-Healing-Agent / Health-Check-Endpoint.
- Bezugszeitraum ist der Kalendermonat.
- **Nicht** in die Verfügbarkeit eingerechnet werden:
  - Geplante Wartungsfenster (siehe § 3),
  - Ausschluss-Fälle gemäß § 5.

---

## § 3 Wartungsfenster

(1) Geplante Wartungen werden mindestens **5 Werktage** im Voraus angekündigt.

(2) Standard-Wartungsfenster: **Sonntag, 02:00 - 06:00 Uhr** (deutsche Zeit), nach Möglichkeit außerhalb der Geschäftszeiten des Auftraggebers.

(3) Notfall-Wartungen (kritische Sicherheits-Patches) können kurzfristig durchgeführt werden; der Auftragnehmer informiert den Auftraggeber so früh wie möglich.

---

## § 4 Reaktionszeiten und Wiederherstellungszeiten

### 4.1 Standard-Tier

| Kennzahl                                 | Standard-Tier                     |
| ---------------------------------------- | --------------------------------- |
| Antwortbestätigung (Eingangsbestätigung) | innerhalb **24 Stunden**          |
| Lösungsziel (Standard-Anfragen)          | **5 Werktage** (Richtwert)        |
| RTO (Recovery Time Objective)            | **24 Stunden** ab Schadensmeldung |
| RPO (Recovery Point Objective)           | **24 Stunden** (tägl. Backup)     |

### 4.2 Premium-Tier

| Kennzahl                                 | Premium-Tier                     |
| ---------------------------------------- | -------------------------------- |
| Antwortbestätigung (Eingangsbestätigung) | innerhalb **4 Stunden** (24/7)   |
| Lösungsziel kritische Störungen          | **8 Stunden** (Best Effort)      |
| RTO (Recovery Time Objective)            | **4 Stunden** ab Schadensmeldung |
| RPO (Recovery Point Objective)           | **6 Stunden**                    |

### 4.3 Begriffsdefinitionen

- **Antwortbestätigung:** Erste Reaktion eines Mitarbeiters des Auftragnehmers auf das eingegangene Ticket; nicht zwingend Lösung.
- **RTO:** Maximale Zeit, innerhalb derer die Box nach einem qualifizierten Schadensfall wieder produktionsfähig hergestellt wird.
- **RPO:** Maximaler Datenverlust in Zeit ausgedrückt; entspricht der Frequenz der Datensicherung.
- **Werktag:** Montag bis Freitag, ausgenommen gesetzliche Feiertage am Sitz des Auftragnehmers.

---

## § 5 Ausschlüsse

Nicht zur ungeplanten Downtime im Sinne dieses SLA zählen:

(1) **Höhere Gewalt** (Naturkatastrophen, Krieg, Pandemie, behördliche Anordnungen, staatliche Cyberangriffe, Ausfälle kritischer Infrastruktur).

(2) **Strom- oder Internet-Ausfälle** im Verantwortungsbereich des Auftraggebers (auch bei Standortwechsel, Umzug, Bauarbeiten).

(3) **Vom Auftraggeber verursachte Konfigurationsfehler**, unsachgemäße Eingriffe, nicht autorisierte Software-Installationen.

(4) **Geplante Wartung** gemäß § 3.

(5) **Hardware-Defekte** im Rahmen der gesetzlichen Gewährleistung; deren Behebung richtet sich nach den AGB.

(6) **Ausfälle von Dritt-Diensten** außerhalb der Box (z. B. externe APIs, die der Auftraggeber per n8n-Workflow integriert).

(7) **Unzureichende Mitwirkung** des Auftraggebers (z. B. fehlender Remote-Zugang trotz vorheriger Vereinbarung).

(8) Zeiten, in denen der Auftraggeber die Box bewusst außer Betrieb genommen hat.

---

## § 6 SLA-Erstattung / Service Credits

### 6.1 Berechnung

Wird die zugesicherte Verfügbarkeit (§ 2) im Kalendermonat unterschritten, gewährt der Auftragnehmer dem Auftraggeber eine Gutschrift auf das Wartungsentgelt:

> Pro **0,1 Prozentpunkten** Unterschreitung der zugesicherten Verfügbarkeit: **5 %** des Monatsanteils des Wartungsentgelts (= 1/12 der Jahresvergütung) als Gutschrift.
>
> **Maximalbetrag** der Gutschrift pro Monat: **50 %** des Monatsanteils.

### 6.2 Beispiel (Standard-Tier)

- Zugesicherte Verfügbarkeit: 99,0 %
- Tatsächliche Verfügbarkeit im Monat: 98,5 %
- Unterschreitung: 0,5 Prozentpunkte = 5 × 0,1 Prozentpunkte
- Gutschrift: 5 × 5 % = **25 %** des Monatsanteils
- Bei € 990,–/Jahr Wartungspauschale: € 82,50 Monatsanteil → Gutschrift **€ 20,63**

### 6.3 Geltendmachung

(1) Der Auftraggeber muss den Anspruch auf Service Credits **innerhalb von 30 Tagen** nach Ende des betroffenen Monats schriftlich (E-Mail genügt) geltend machen, unter Angabe der gemessenen Downtime und gegebenenfalls der Ticket-Nummern.

(2) Service Credits werden auf die nächstfolgende Wartungsrechnung angerechnet. Eine Auszahlung in bar erfolgt nicht.

(3) Service Credits sind die **abschließende Kompensation** für SLA-Verletzungen. Weitergehende Schadensersatzansprüche bleiben unberührt, soweit sie nicht durch die Haftungsregelungen der AGB ausgeschlossen sind.

---

## § 7 Eskalationsstufen

| Stufe | Auslöser                                                     | Eskalation                                                           |
| ----- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1     | Standard-Ticket (z. B. Konfigurationsfrage)                  | Bearbeitung durch L1-Support                                         |
| 2     | Ungelöst nach 3 Werktagen / komplexes Problem                | Eskalation an L2-Support / Engineering                               |
| 3     | Kritische Störung (Box nicht erreichbar, Datenverlust droht) | Sofortige Eskalation an Bereitschaft (Premium) bzw. Geschäftsführung |
| 4     | SLA-relevanter Vorfall                                       | Information der Geschäftsführung beider Parteien                     |

---

## § 8 Reporting

(1) Auf Anfrage des Auftraggebers stellt der Auftragnehmer einmal jährlich einen **SLA-Report** zur Verfügung mit:

- gemessene Verfügbarkeit pro Monat,
- Liste der relevanten Vorfälle,
- gewährte Service Credits,
- Übersicht durchgeführter Wartungen.

(2) Im Premium-Tier wird der Report quartalsweise und automatisch zugestellt.

---

## § 9 Geltung und Änderungen

(1) Dieses SLA gilt für die Vertragslaufzeit des [WARTUNGSVERTRAG.md](./WARTUNGSVERTRAG.md).

(2) Anpassungen werden dem Auftraggeber mit einer Frist von 3 Monaten vor Wirksamwerden mitgeteilt.

(3) Bei wesentlichen Verschlechterungen steht dem Auftraggeber ein Sonderkündigungsrecht zu.

---

**Anlagen / mitgeltende Dokumente:**

- [WARTUNGSVERTRAG.md](./WARTUNGSVERTRAG.md)
- [AGB_TEMPLATE.md](./AGB_TEMPLATE.md)
