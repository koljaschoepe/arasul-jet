# Datenschutz-Folgenabschätzung (DSFA) - Vorlage

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Rechtsgrundlage:** Art. 35 DSGVO
**Anwendung:** Vorlage für Auftraggeber, die eine DSFA für den Einsatz der Arasul-Box durchführen müssen.

---

## Hinweis zur Anwendung

Eine DSFA ist gemäß Art. 35 Abs. 1 DSGVO erforderlich, wenn eine Verarbeitung "voraussichtlich ein hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat". Beim Einsatz der Arasul-Box in **Anwaltskanzleien, Arztpraxen, Steuerberatungen** und vergleichbaren Berufsgruppen mit **§ 203 StGB-Schweigepflicht** ist eine DSFA in der Regel angezeigt, da:

- Berufsgeheimnisse / besondere Kategorien personenbezogener Daten verarbeitet werden,
- KI-gestützte Entscheidungsunterstützung zum Einsatz kommt,
- große Datenmengen mit potenziell sensitivem Inhalt verarbeitet werden.

Diese Vorlage unterstützt den Auftraggeber bei der eigenständigen DSFA-Erstellung. Sie ersetzt keine fachkundige Beratung.

---

## 1. Beschreibung der Verarbeitungsvorgänge

### 1.1 Verantwortlicher

- Name / Firma des Auftraggebers: ********\_\_********
- Anschrift: ********\_\_********
- Datenschutzbeauftragter: ********\_\_********

### 1.2 Auftragsverarbeiter

- Arasul GmbH (in Gründung), siehe [AVV_TEMPLATE.md](./AVV_TEMPLATE.md)

### 1.3 Verarbeitungsvorgänge im Überblick

| Vorgang                        | Beschreibung                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| KI-Inferenz (LLM)              | Generierung von Texten und Antworten auf Basis lokal gespeicherter Sprachmodelle   |
| RAG (Retrieval Augmented Gen.) | Vektor-basierte Suche in eigenem Dokumenten-Bestand mit anschließender LLM-Antwort |
| Workflow-Automatisierung (n8n) | Kettung mehrerer Verarbeitungsschritte, ggf. mit E-Mail-/Telegram-Anbindung        |
| Diktat / Transkription         | Spracheingabe wird lokal in Text gewandelt                                         |
| Dokumenten-Indexierung         | OCR + Chunking + Embedding eigener Dokumente (PDF, Office)                         |
| Chat-Historie                  | Speicherung von Benutzer-Konversationen für Wiederaufnahme und Auditierung         |

---

## 2. Systematische Beschreibung der Zwecke

### 2.1 Hauptzwecke

- Effizienzsteigerung in der täglichen Mandats- / Patienten- / Mandantenarbeit
- Recherche-Unterstützung in eigenen Wissensbeständen
- Standardisierung wiederkehrender Schreibvorgänge (Schriftsätze, Befunde, Steuerunterlagen)
- Wahrung der Vertraulichkeit durch lokale Verarbeitung (im Gegensatz zu Cloud-KI-Diensten)

### 2.2 Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO)

- Wirtschaftlicher Betrieb der Kanzlei / Praxis / Beratung
- Erfüllung der Berufspflichten (Sorgfalt, Schnelligkeit)
- Wahrung der Vertraulichkeit durch Vermeidung von Cloud-Übermittlung

### 2.3 Vertragliche Erforderlichkeit (Art. 6 Abs. 1 lit. b DSGVO)

- Erfüllung des Mandats- / Behandlungs- / Beratungsvertrags

---

## 3. Bewertung der Notwendigkeit und Verhältnismäßigkeit

| Kriterium                      | Bewertung                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Datenminimierung               | Nur unbedingt erforderliche Daten werden verarbeitet; Knowledge-Spaces erlauben gezielte Auswahl     |
| Speicherbegrenzung             | Chat-Historie konfigurierbar; Audit-Log 7 Jahre (gesetzlich); Dokumente nach Mandats-Ende löschbar   |
| Zweckbindung                   | Verarbeitung ausschließlich zu den o. g. Zwecken; keine Weitergabe                                   |
| Integrität und Vertraulichkeit | Lokale Verarbeitung, LUKS-FDE, MinIO-SSE-KMS, TLS, AES-GCM für Tokens                                |
| Alternative Verfahren          | Cloud-KI (z. B. ChatGPT, Claude.ai) wäre einfacher, aber datenschutzrechtlich nicht zulässig (§ 203) |
| Verhältnismäßigkeit            | Lokale Verarbeitung ist das mildeste verfügbare Mittel zur Zweckerreichung                           |

---

## 4. Risiken für Rechte und Freiheiten

### 4.1 Identifizierte Risiken

| Risiko                                               | Auswirkung                                         | Relevanz                |
| ---------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| R1: Verletzung der Schweigepflicht (§ 203 StGB)      | Strafbarkeit, Schadensersatz, Zulassungsverlust    | Hoch                    |
| R2: Unbefugter physischer Zugriff (Box-Diebstahl)    | Datenleck, Identitätsdiebstahl, Reputationsschaden | Mittel - Hoch           |
| R3: Unbefugter logischer Zugriff (gehackter Account) | Datenleck, Manipulation, Erpressung                | Mittel                  |
| R4: KI-Halluzinationen / fehlerhafte Outputs         | Falsche Mandantenberatung, Behandlungsfehler       | Hoch (operativ)         |
| R5: Verlust der Verfügbarkeit (Hardware-Defekt)      | Geschäftsunterbrechung                             | Mittel                  |
| R6: Ungewolltes Training mit eigenen Daten           | Nicht relevant (keine Trainings-Funktion an Bord)  | Sehr gering             |
| R7: Datenleck bei Remote-Support                     | Vertraulichkeitsverletzung                         | Gering (mit Klausel)    |
| R8: Verkettung mit anderen Datenquellen              | Profilbildung, ungewollte Inferenz                 | Gering (lokal isoliert) |

### 4.2 Risiko-Matrix-Template

| Risiko-ID | Eintrittswahrscheinlichkeit (1-5) | Schadensausmaß (1-5) | Risiko-Wert (W × S) | Bewertung |
| --------- | --------------------------------- | -------------------- | ------------------- | --------- |
| R1        | \_\_                              | \_\_                 | \_\_                | \_\_      |
| R2        | \_\_                              | \_\_                 | \_\_                | \_\_      |
| R3        | \_\_                              | \_\_                 | \_\_                | \_\_      |
| R4        | \_\_                              | \_\_                 | \_\_                | \_\_      |
| R5        | \_\_                              | \_\_                 | \_\_                | \_\_      |
| ...       | ...                               | ...                  | ...                 | ...       |

**Bewertungs-Skala:**

- 1-5: gering
- 6-10: mittel
- 11-15: hoch
- 16-25: sehr hoch (DSFA-Pflicht greift, Maßnahmen zwingend)

---

## 5. Abhilfemaßnahmen

Sämtliche Abhilfemaßnahmen sind detailliert in der Anlage [TOMs.md](./TOMs.md) beschrieben. Auszug der wichtigsten Maßnahmen:

| Risiko | Abhilfemaßnahme                                                                           |
| ------ | ----------------------------------------------------------------------------------------- |
| R1     | Lokale Verarbeitung, Verschwiegenheits-Verpflichtung Personal, Audit-Log                  |
| R2     | LUKS-FDE, physische Sicherung beim Auftraggeber, TPM-Boot-Verifikation                    |
| R3     | Starke Passwörter, JWT-Sessions, MFA für Admins, Rate-Limiting, Audit-Log                 |
| R4     | KI-Literacy-Modul (siehe [AI_LITERACY_MODUL.md](./AI_LITERACY_MODUL.md)), Quellen-Anzeige |
| R5     | Self-Healing-Agent, Backups, Wartungsvertrag mit Reaktionszeiten                          |
| R6     | Modelle ausschließlich Read-Only-Inferenz; kein Online-Training                           |
| R7     | Schweigepflicht-Klausel im AVV (Ziffer 7.3), Vier-Augen-Prinzip                           |
| R8     | Strikte Mandanten-Isolation auf Box-Ebene, Knowledge-Space-ACL                            |

---

## 6. Datenflussdiagramm

```
+----------------+       (TLS)      +------------------+
|   Anwender     |  --------------> |  Reverse-Proxy   |
| (Mitarbeiter   |                  |  Traefik :443    |
|  Auftraggeber) |                  +--------+---------+
+----------------+                           |
                                             v
                                  +----------+----------+
                                  | Dashboard-Backend   |
                                  | Express :3001       |
                                  | (AuthN/AuthZ, JWT)  |
                                  +----+-----+-----+----+
                                       |     |     |
                +----------------------+     |     +----------------------+
                |                            |                            |
                v                            v                            v
       +-----------------+        +-------------------+         +------------------+
       | PostgreSQL 16   |        | LLM-Service       |         | Qdrant           |
       | (Audit, Chats,  |        | Ollama :11434     |         | Vektor-DB :6333  |
       |  Konfiguration) |        | + Embedding-Svc   |         |                  |
       +-----------------+        +-------------------+         +------------------+
                |                            |                            |
                +----------------------------+----------------------------+
                                             |
                                             v
                                   +---------+----------+
                                   |  Lokales Storage   |
                                   |  (LUKS-FDE) +      |
                                   |  MinIO SSE-KMS     |
                                   +--------------------+

                  KEIN Datenfluss nach außen (außer signierte Update-Checks)
```

---

## 7. Konsultation des Datenschutzbeauftragten

| Frage                                             | Antwort / Empfehlung |
| ------------------------------------------------- | -------------------- |
| Ist die Verarbeitung erforderlich?                | ****\_\_****         |
| Sind die TOMs angemessen?                         | ****\_\_****         |
| Sind weitere Maßnahmen erforderlich?              | ****\_\_****         |
| Empfehlung zur Konsultation der Aufsichtsbehörde? | ****\_\_****         |

---

## 8. Konsultation der Aufsichtsbehörde (Art. 36 DSGVO)

Eine Konsultation der zuständigen Aufsichtsbehörde ist erforderlich, wenn die DSFA ergibt, dass die Verarbeitung trotz der getroffenen Abhilfemaßnahmen ein hohes Risiko zur Folge hat. Bei sachgerechter Anwendung der Arasul-Box mit den dokumentierten TOMs wird dies in der Regel **nicht** erforderlich sein.

---

## 9. Ergebnis und Freigabe

| Position                | Name | Datum | Unterschrift |
| ----------------------- | ---- | ----- | ------------ |
| Verantwortlicher        |      |       |              |
| Datenschutzbeauftragter |      |       |              |
| Geschäftsführung        |      |       |              |

**Ergebnis (zutreffendes ankreuzen):**

- [ ] Verarbeitung mit getroffenen Maßnahmen zulässig
- [ ] Konsultation der Aufsichtsbehörde erforderlich
- [ ] Verarbeitung in dieser Form nicht zulässig

---

## 10. Überprüfungs-Intervall

Die DSFA ist mindestens **alle 24 Monate** sowie bei wesentlichen Änderungen (z. B. neue Funktionen, Hardware-Wechsel, neue Datenkategorien) zu überprüfen.

---

**Anlagen:**

- [AVV_TEMPLATE.md](./AVV_TEMPLATE.md) - Auftragsverarbeitungs-Vertrag
- [TOMs.md](./TOMs.md) - Technisch-organisatorische Maßnahmen
- [AI_ACT_SELF_DECLARATION.md](./AI_ACT_SELF_DECLARATION.md) - EU-AI-Act-Selbsterklärung
