# EU AI Act - Selbsterklärung des Anbieters

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Anbieter:** Arasul GmbH (in Gründung)
**Produkt:** Arasul Edge-AI-Appliance
**Rechtsgrundlage:** Verordnung (EU) 2024/1689 ("EU AI Act")

---

## 1. Gegenstand der Selbsterklärung

Diese Selbsterklärung dokumentiert die Einordnung der Arasul-Plattform im Sinne der Verordnung (EU) 2024/1689 ("EU AI Act"). Sie wird Auftraggebern (Betreibern im Sinne des AI Act) als Hilfestellung für deren eigene Compliance-Pflichten zur Verfügung gestellt.

---

## 2. Klassifikation des KI-Systems

### 2.1 Allgemeine Einordnung

Die Arasul-Plattform ist ein **KI-System** im Sinne von Art. 3 Nr. 1 AI Act, da sie unter Verwendung maschineller Lernverfahren Outputs generiert (Texte, Empfehlungen, Klassifikationen).

### 2.2 Risiko-Klasse

Die Plattform fällt in der Standard-Konfiguration und für die vorgesehenen Anwendungsfälle (s. u. Ziffer 4) in die Kategorie:

> **"KI-System mit begrenztem Risiko" / "Limited Risk"** (Transparenzpflichten gem. Art. 50 AI Act)

Sie ist **kein Hochrisiko-KI-System** im Sinne von Art. 6 i. V. m. Anhang III AI Act, sofern der Auftraggeber die Plattform innerhalb der bestimmungsgemäßen Anwendungsfälle einsetzt.

### 2.3 Verbotene Praktiken (Art. 5 AI Act)

Die Plattform wird **nicht** zur Durchführung verbotener KI-Praktiken eingesetzt. Insbesondere unterstützt sie keine:

- subliminale, manipulative oder täuschende Techniken,
- Ausnutzung schutzbedürftiger Personen,
- Social Scoring durch öffentliche Stellen,
- biometrische Echtzeit-Fernidentifizierung im öffentlichen Raum,
- Emotionserkennung am Arbeitsplatz oder in Bildungseinrichtungen,
- biometrische Kategorisierung sensibler Merkmale,
- Predictive Policing auf Profil-Basis.

---

## 3. Mapping zu Anhang III AI Act (Hochrisiko-Bereiche)

Die Plattform wird **nicht** für die in Anhang III AI Act genannten Hochrisiko-Bereiche eingesetzt:

| Anhang-III-Bereich                                                                  | Wird durch Arasul unterstützt?                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Biometrik (Identifizierung, Kategorisierung, Emotionserkennung)                  | **Nein.** Keine biometrischen Funktionen.                                                  |
| 2. Kritische Infrastrukturen (Verkehr, Wasser, Gas, Strom)                          | **Nein.** Kein Einsatz im Steuerungspfad kritischer Infrastrukturen.                       |
| 3. Allgemeine und berufliche Bildung (Bewertung, Zugangsentscheidung)               | **Nein.** Keine Lernfortschrittsbeurteilung, keine Zulassungsentscheidungen.               |
| 4. Beschäftigung, Personalmanagement (Recruiting, Bewertung, Beförderung)           | **Nein.** Keine HR-Entscheidungs-Automatisierung; keine Bewertung von Mitarbeitenden.      |
| 5. Wesentliche private und öffentliche Dienste (Kreditwürdigkeit, Sozialleistungen) | **Nein.** Keine Kreditscoring- oder Bonitäts-Funktion; keine Vergabe von Sozialleistungen. |
| 6. Strafverfolgung                                                                  | **Nein.** Kein Einsatz in polizeilichen oder strafverfolgenden Entscheidungen.             |
| 7. Migration, Asyl und Grenzkontrolle                                               | **Nein.** Keine Risiko-Bewertung Reisender, keine Visa-Entscheidungen.                     |
| 8. Justiz und demokratische Prozesse                                                | **Nein.** Keine Unterstützung richterlicher Entscheidungen, keine Wahlbeeinflussung.       |

### 3.1 Wichtige Klarstellung für Berufsgeheimnisträger

Die Nutzung durch Anwaltskanzleien, Arztpraxen, Steuerberatungen und vergleichbare Berufe stellt **keinen** Justiz-Anwendungsfall im Sinne von Anhang III Nr. 8 AI Act dar, solange die Plattform als **Werkzeug zur Unterstützung des Berufsträgers** eingesetzt wird und nicht autonome Entscheidungen mit Außenwirkung trifft. Die Verantwortung für jede Mandanten- / Patienten- / Mandanten-Kommunikation verbleibt vollständig beim Berufsträger.

---

## 4. Bestimmungsgemäße Anwendungsfälle

Die Arasul-Plattform ist für folgende Standard-Anwendungsfälle konzipiert und freigegeben (allesamt **nicht hochrisiko**):

- Dokumenten-Analyse (Vertragsprüfung, Befund-Vorbereitung, Steuerunterlagen)
- Retrieval Augmented Generation (RAG-Suche in eigenen Wissensbeständen)
- Vertragsanalyse und Klausel-Vergleich
- Diktat / Sprache-zu-Text
- E-Mail-Zusammenfassung und -Entwurf
- Workflow-Automatisierung (Routineaufgaben, Reminder, Korrespondenz-Vorbereitung)
- Interne Recherche und Wissens-Erschließung

### 4.1 Nicht zulässige Anwendungsfälle (Vertragsverletzung)

Der Einsatz der Plattform für die in Ziffern 2.3 und 3 genannten verbotenen oder hochrisiko-nahen Verarbeitungen ist vertraglich untersagt (siehe [AGB_TEMPLATE.md](./AGB_TEMPLATE.md)).

---

## 5. Transparenzpflichten (Art. 50 AI Act)

### 5.1 Kennzeichnungspflicht KI-generierter Inhalte

Die Plattform kennzeichnet KI-generierte Inhalte gegenüber dem Endnutzer als solche. Konkret:

- Chat-Antworten werden visuell als KI-generiert markiert
- Generierte Texte enthalten optional einen Disclaimer-Hinweis
- Quellenangaben (RAG) werden separat angezeigt

(Die genaue UI-Umsetzung erfolgt im Rahmen von Phase 1.4 der Plattform-Entwicklung.)

### 5.2 Synthetische Inhalte

Die Plattform erzeugt keine synthetischen Bild-, Audio- oder Video-Inhalte mit Personen-Bezug. Sofern künftig solche Funktionen integriert werden, erfolgt die Kennzeichnung über maschinenlesbare Wasserzeichen.

---

## 6. KI-Kompetenz / AI Literacy (Art. 4 AI Act)

Der Anbieter unterstützt den Auftraggeber bei der Erfüllung seiner Pflicht aus Art. 4 AI Act, ein "ausreichendes Maß an KI-Kompetenz" seines Personals sicherzustellen. Im Lieferumfang enthalten:

- Schulungs-Modul: [AI_LITERACY_MODUL.md](./AI_LITERACY_MODUL.md)
- Kurz-Quiz zur Selbstkontrolle
- Hinweise zur Erkennung von KI-Halluzinationen
- Best Practices für den Umgang mit personenbezogenen Daten

---

## 7. Pflichten des Anbieters (sofern als Anbieter im Sinne AI Act eingeordnet)

Sollte die Plattform durch eigene Konfiguration durch den Auftraggeber in einen Hochrisiko-Anwendungsfall überführt werden, gelten erweiterte Anbieter-Pflichten gemäß Art. 16 ff. AI Act. In diesem Fall

- ist eine erneute Risiko-Bewertung erforderlich,
- werden gegebenenfalls zusätzliche Konformitätsbewertungen notwendig,
- kann der Anbieter nicht weiter ohne Anpassung als Lieferant fungieren.

Der Auftraggeber verpflichtet sich, den Anbieter unverzüglich zu informieren, wenn er eine Verwendung außerhalb der bestimmungsgemäßen Anwendungsfälle plant.

---

## 8. Datengrundlage / verwendete Modelle

| Modell-Familie | Zweck                     | Quelle                        | Lizenz                  |
| -------------- | ------------------------- | ----------------------------- | ----------------------- |
| Gemma (Google) | Allgemeines LLM (Default) | Hugging Face / Ollama-Library | Gemma Terms of Use      |
| Llama-Familie  | Optional, alternativ      | Hugging Face                  | Llama Community License |
| Qwen-Familie   | Optional, mehrsprachig    | Hugging Face                  | Apache 2.0              |
| BGE-M3         | Embeddings                | Hugging Face                  | MIT                     |

Die Modelle werden ausschließlich im **Inferenz-Modus** betrieben. Es findet **kein Training und kein Fine-Tuning** mit Auftraggeber-Daten statt. Die Modelle werden lokal auf der Appliance gespeichert und ausgeführt.

---

## 9. Allgemeine GPAI-Modelle (Art. 51 ff. AI Act)

Die Plattform nutzt vorbestehende General Purpose AI Models (GPAI), insbesondere die in Ziffer 8 genannten LLMs. Diese werden **nicht systemisch riskant** im Sinne von Art. 51 Abs. 1 AI Act genutzt. Die Pflichten des GPAI-Anbieters (Modell-Hersteller) liegen bei den jeweiligen Upstream-Anbietern (Google, Meta, Alibaba); der Anbieter dieser Plattform ist nachgelagerter Integrator.

---

## 10. Dokumentation und Aufbewahrung

Diese Selbsterklärung wird mindestens **10 Jahre** nach Inverkehrbringen der Plattform aufbewahrt (Art. 18 AI Act analog). Sie wird bei wesentlichen Änderungen aktualisiert; das Änderungsdatum oben in diesem Dokument wird dabei fortgeschrieben.

---

## 11. Verantwortungsabgrenzung Anbieter / Betreiber

| Pflicht                                     | Anbieter (Arasul)   | Betreiber (Auftraggeber) |
| ------------------------------------------- | ------------------- | ------------------------ |
| Bereitstellung konformer Software           | X                   |                          |
| Kennzeichnung KI-Outputs (Art. 50)          | X (Implementierung) | X (Information End-User) |
| AI Literacy des eigenen Personals (Art. 4)  | X (Modul)           | X (Schulung)             |
| Bestimmungsgemäße Verwendung                |                     | X                        |
| Aufzeichnungspflichten Hochrisiko (Art. 26) |                     | X (sofern einschlägig)   |
| Datenschutz-Folgenabschätzung               |                     | X (siehe DSFA)           |

---

**Erklärung der Geschäftsführung:**

Mit Unterzeichnung dieser Selbsterklärung bestätigt die Arasul GmbH (i. G.), dass die vorstehenden Angaben nach bestem Wissen und Gewissen zutreffend sind.

Ort, Datum: **********\_\_\_**********

Unterschrift Geschäftsführung: **********\_\_\_**********
