# Arasul Commercial Launch — Master Plan

> **Stand:** 2026-05-02 · **Branch-Basis:** `feat/telegram-bot-overhaul`
> **Synthese aus 18-Agent-Analyse:** Backend, Frontend, DB, RAG/LLM, Infra, Security/DSGVO, Self-Healing, Tests, RAG-Tiefe, Chat-Tiefe, n8n-Tiefe, Telegram-Tiefe, Onboarding, Daily-UX, DACH-Demand, Konkurrenz, AI-Act-Compliance, Pricing/GTM
> **Ziel:** Vom Pre-Launch (0 Pilotkunden) zum ersten zahlenden DACH-Mittelstand-Kunden in 90 Tagen, zur ersten Case-Study in 6 Monaten, zu 10 zahlenden Kunden in 12 Monaten.
>
> Dieser Plan **ersetzt** alle früheren Pläne (`LLM_RAG_N8N_HARDENING.md`, `TELEGRAM_BOT_OPTIMIZATION.md`, archivierte Pläne in `docs/`). Er ist das aktuelle Source-of-Truth-Dokument für den kommerziellen Launch.

---

## TL;DR — die fünf wichtigsten Entscheidungen

1. **Repositionierung:** Arasul ist eine **KI-Compliance-Appliance**, nicht „Edge AI Box". Lead-Story: §203 StGB + AI-Act-Inventur, nicht Hardware-Specs.
2. **Persona-Reihenfolge ändern:** **Arzt-Verbund (4-Praxen, 18 MA) > Wirtschaftskanzlei (12 MA) > Steuerberater (DATEV-Anxiety) > Maschinenbau**. Nicht Steuerberater zuerst — DATEV Copilot ist seit Feb 2026 gratis für Mitglieder und entwertet das Segment teilweise.
3. **Pricing:** **€5.990 + €990/Jahr Wartung** als Hauptangebot (47 % Bruttomarge bei realistischem CoGS €3.145). Kein Free Pilot — bezahlte 90-Tage-Pilot-Phase à €2.500 anrechenbar.
4. **Multi-User-Isolation ist der härteste technische Pre-Launch-Blocker.** Ohne mandantenfähige Daten-Trennung ist kein Kanzlei-/Praxen-Sale möglich. Phase 1 Priorität 1.
5. **Telegram-Default = OFF für Berufsgeheimnis-Personas.** Drittland UAE, kein AVV verfügbar. Telegram bleibt als Power-User-Feature, aber wird nie als Verkaufsargument bei Arzt/Anwalt benutzt. Ersatz: WhatsApp Business + on-prem Matrix als Roadmap-Item.

---

## Inhalt

- [Teil A — Strategische Grundlagen](#teil-a--strategische-grundlagen)
- [Teil B — Technischer Master-Plan in 8 Phasen](#teil-b--technischer-master-plan-in-8-phasen)
  - [Phase 0 — Strategische Positionierung & Fundament-Entscheidungen](#phase-0--strategische-positionierung--fundament-entscheidungen-woche-0)
  - [Phase 1 — Compliance-Foundation & Multi-Tenancy (Hard Blocker)](#phase-1--compliance-foundation--multi-tenancy-wochen-1-4)
  - [Phase 2 — Daten-Verschlüsselung at rest & Security-Hardening](#phase-2--daten-verschlüsselung-at-rest--security-hardening-wochen-4-6)
  - [Phase 3 — RAG/Chat-Tiefe & Wow-Demo-Politur](#phase-3--ragchat-tiefe--wow-demo-politur-wochen-6-10)
  - [Phase 4 — Onboarding-Hardening & First-Run-Magie](#phase-4--onboarding-hardening--first-run-magie-wochen-10-12)
  - [Phase 5 — Operations, 5-Jahre-Autonomie-Honesty & Support-Tooling](#phase-5--operations-5-jahre-autonomie-honesty--support-tooling-wochen-12-14)
  - [Phase 6 — GTM-Foundation & Pilot-Hunt](#phase-6--gtm-foundation--pilot-hunt-wochen-14-16)
  - [Phase 7 — Pilot-Execution & erste Case-Study](#phase-7--pilot-execution--erste-case-study-wochen-16-28)
  - [Phase 8 — Skalierung & Multi-Box-Operations](#phase-8--skalierung--multi-box-operations-monate-7-12)
- [Teil C — Anhänge](#teil-c--anhänge)
  - [Anhang A — Persona-Briefings](#anhang-a--persona-briefings)
  - [Anhang B — Pricing-Architektur](#anhang-b--pricing-architektur)
  - [Anhang C — Compliance-Doku-Pflichtliste](#anhang-c--compliance-doku-pflichtliste)
  - [Anhang D — Telegram-Strategie](#anhang-d--telegram-strategie-und-was-stattdessen)
  - [Anhang E — Anti-Backlog (was wir NICHT bauen)](#anhang-e--anti-backlog-was-wir-nicht-bauen)
  - [Anhang F — Risiken & Watch-Points](#anhang-f--risiken--watch-points)

---

# Teil A — Strategische Grundlagen

## A.1 Markt-Realität (Stand Mai 2026)

**Tailwinds (warum jetzt):**

- **AI-Act-Enforcement 2. August 2026** zwingt jeden Mittelständler mit KI-Einsatz zur Inventur. BSI bekommt Durchsetzungsrechte. → Window of Opportunity Mai–November 2026.
- **§203 StGB Kriminalisierungs-Risiko** in BRAK-Leitfaden (Dez 2024), KBV PraxisWissen (Mai 2025), BStBK FAQ (Jan 2026), DStV Muster-Richtlinie (April 2026). Cloud-KI ist mit anwaltlicher/ärztlicher Schweigepflicht **nicht** ohne weiteres vereinbar.
- **Bitkom 2026:** KI-Adoption verdoppelt (17 % → 41 %). 44–48 % nennen Datenschutz als Blocker. **93 % wollen deutschen Anbieter.**
- **Digital-Omnibus VII (März 2026):** Hochrisiko-Fristen +16 Monate verschoben (~Dez 2027). Mehr Luft.
- **Hetzner +30–37 % Preise (April 2026)** + Microsoft „Flex Routing" Daten-Leck-Eingeständnis → Anti-Hyperscaler-Welle.
- **Kompetenz-Pflicht Art. 4 EU-AI-Act seit Feb 2025:** Kunde **muss** Personal schulen → Arasul kann das mitliefern.

**Headwinds (was uns gefährdet):**

- **Direkter Konkurrent existiert bereits:** AIVA Enterprise GPT + DGX Spark Bundle bei **€9.999** (ai-ui.ai). NVIDIA-Branding-Halo, schon live. Arasul muss bei **€5.990** klar unterbieten und auf Software-Tiefe differenzieren.
- **Aleph Alpha + Cohere Merger (April 2026, $20 B):** dominiert „Sovereign-AI"-Mindshare in DACH. Greift nur Enterprise an, aber tötet RFPs für Mittelstand-Brands.
- **Microsoft 365 Copilot DE-Region** (Ende 2026) bei €18–21/User/Monat: Default-Substitut. Jeder CFO fragt „warum nicht Copilot?".
- **DATEV Copilot gratis seit Feb 2026 für DATEV-Mitglieder.** Tötet das Steuerberater-Segment teilweise. Arasul muss dort etwas können, was DATEV nicht kann (n8n-Automation, eigene Mandanten-RAG).
- **HBDI-Bewertung Microsoft Copilot positiv** (Nov 2025) und **DAV-Initiative 32/2025**: „automatisierte Verarbeitung ohne Klartext-Mitarbeiter-Zugriff = nicht Offenbaren". Das schwächt das Sovereign-Argument leicht — wir brauchen mehr als „on-prem ist sicherer".
- **Skill-Gap (53 %) ist laut Bitkom #1 Adoption-Blocker**, nicht Privacy. Box ohne Use-Case-Templates und Schulung = Shelfware.

**Etablierte Konkurrenten im 3–8k-Band:** basebox, Localmind, ISAR AI, HostSpezial, UPBITS, **meinGPT** (it-sa-2026-Aussteller!), InnoGPT, Nelpx. Entry-Level €2.400 (RTX 4090). **Der Markt existiert — Arasul ist nicht zu früh.**

## A.2 Repositionierung — Was Arasul ab heute IST

**Vorher (intern):** „Edge-AI-Plattform für NVIDIA Jetson, Plug-&-Play-Box mit Chat/RAG/n8n."

**Nachher (zum Kunden):** „**Arasul ist die einzige sofort einsatzbereite KI-Compliance-Appliance unter 10.000 €**, die DSGVO-konformen Chat, Wissenssuche auf eigenen Dokumenten und Workflow-Automatisierung **komplett offline** liefert — ohne IT-Abteilung, ohne Cloud-Abo, ohne Datenabfluss. Sie löst die KI-Inventur-Pflicht des EU AI Act und schützt Mandanten-/Patienten-Daten unter §203 StGB."

**Drei harte Differenzierer, die Konkurrenten nicht kopieren können:**

1. **Hardware-included plug-and-play unter 8k €** — Aleph Alpha braucht Sales-Engineer, Zylon braucht Datacenter, AIVA ist 9.999 €. Arasul ist die einzige EU-Appliance unter 8k mit komplettem Stack.
2. **n8n-Automation integriert** — keiner der Direktkonkurrenten (AIVA, Zylon, GPT4All, Khoj, LocalAI) liefert eine Workflow-Engine mit. Macht Arasul vom „Chatbot, den ihr gekauft habt" zum „Prozess-Automatisierungs-Appliance".
3. **Self-Healing + 5-Jahres-Autonomie** — Hidden TCO bei Self-Hosted-LLM ist „20–30 % eines Senior-Engineers = 3–6k €/Monat". Arasul greift das frontal an.

**Drei Schwachstellen, die der Plan adressieren muss:**

1. Kein BSI-C5 / SOC-2 / ISO-27001 → AIC4-Self-Mapping in Q3 2026, ISO 27001 in Q1 2027.
2. Jetson AGX Orin = „Robotics-Brand" in IT-Decider-Mindshare (gegen DGX-Spark) → Marketing muss „Industrieller Edge-AI-Computer" framen, nicht „Robotics-Board".
3. Kein Vor-Ort-Servicevertrag → regionale Mini-Systemhaus-Channel-Strategie statt Bechtle/Computacenter.

## A.3 Persona-Reihenfolge (überarbeitet aus Markt-Recherche)

| #   | Persona                                        | Größe     | Schmerz                                                                                                                        | WTP                                                                                                  | Priorität  |
| --- | ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Arztpraxis-Verbund** (Allgemeinmedizin, MVZ) | 15–30 MA  | KBV-PraxisWissen 5/2025: Schatten-KI ist dokumentiert, §203 StGB kriminalisiert. „Mitarbeiter diktieren Arztbriefe in ChatGPT" | 5–8k € + 1–2k €/Jahr — vergleichbar mit PVS-Modul                                                    | ⭐⭐⭐⭐⭐ |
| 2   | **Wirtschaftskanzlei** (Anwalt)                | 10–25 MA  | BRAK-Leitfaden 12/2024 + DAV 32/2025 + §43e BRAO + BORA. Persönliche Anwalts-Haftung. ChatGPT verboten per Mandantenvertrag    | 5–8k € budget-okay (Mid-Tier-Kanzlei-Software €920/Seat zeigt Zahlungsbereitschaft)                  | ⭐⭐⭐⭐   |
| 3   | **Steuerberater** (mittelständische Kanzlei)   | 15–40 MA  | BStBK FAQ 1/2026 + DATEV-Cloud-Pivot-Anxiety, manche Partner wollen sovereign bleiben                                          | 5–8k € — aber DATEV Copilot ist gratis für Mitglieder. Differenziert über n8n + eigene Mandanten-RAG | ⭐⭐⭐     |
| 4   | **Maschinenbau-Mittelstand**                   | 80–200 MA | Schatten-KI auf Konstruktionsplänen, Export-IP-Schutz. VDMA-Thema.                                                             | 8k € = Rounding Error in 80k-ERP-Welt. Aber langer Sales-Zyklus                                      | ⭐⭐       |

**Pilot-Hunt Phase 6/7 fokussiert auf #1 + #2.** Steuerberater (#3) erst, wenn ein DATEV-Cloud-Skeptiker im Outreach-Funnel auftaucht. Maschinenbau (#4) ist ein 2027-Thema.

## A.4 Erfolgs-Definition

| Horizont     | Meilenstein                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tag 30**   | Compliance-Pakete (AVV, AGB, TOMs, DSFA-Vorlage, AI-Act-Selbsterklärung) fertig. NVIDIA-Inception-Eintrag durch. Demo-Box im Schreibtisch-Stock einsatzbereit.                       |
| **Tag 60**   | Multi-User-Iso (MVP) live. MinIO+Postgres-Encryption-at-Rest dokumentiert. RAG-Re-Index abgeschlossen, Test-Pass-Rate ≥ 80 %. 200 personalisierte LinkedIn-Outreaches gemacht.       |
| **Tag 90**   | **1 zahlender Pilot (€2.500 anrechenbar)** mit unterschriebenem Vertrag. Erste Box läuft beim Kunden. Wöchentliche Check-Ins.                                                        |
| **Monat 6**  | **Erste Case-Study schriftlich.** 1 zahlender Kunde mit konvertiertem Pilot (€5.990 + €990 Wartung). 3 weitere Pilots in Arbeit. Stand auf DStBK26 oder Anwaltstag 2026 abgeleistet. |
| **Monat 12** | **5–10 zahlende Kunden.** AIC4-Self-Mapping abgeschlossen. ISO-27001-Vorbereitung läuft. Mini-Systemhaus-Channel mit ≥ 2 Partnern. €30k–€80k MRR-äquivalentes ARR.                   |

---

# Teil B — Technischer Master-Plan in 8 Phasen

> **Lese-Hinweis:** Jede Phase enthält Goal · Tasks (mit Datei-Referenzen, Akzeptanz-Kriterien, Effort) · Definition of Done · Risk-if-Skipped. Effort-Skala: **S** = < 4h · **M** = < 2 Tage · **L** = 2–5 Tage · **XL** = > 5 Tage. Phasen sind weitgehend sequentiell, aber Phase 6 (GTM) startet **parallel zu Phase 3** (RAG-Tiefe), nicht erst danach.

## Phase 0 — Strategische Positionierung & Fundament-Entscheidungen (Woche 0)

**Goal:** Bevor eine Zeile Code geschrieben wird, sechs Fundament-Entscheidungen festklopfen, damit Phase 1–5 nicht in Detail-Diskussionen festsitzen.

### Tasks

#### 0.1 — Repositionierung schriftlich festklopfen (S)

- Datei anlegen: `docs/POSITIONING.md`
- Inhalt:
  - 1-Satz-Pitch (siehe A.2)
  - 3 Differenzierer
  - Persona-Ranking
  - „Was wir NICHT sind" (Anti-Pitch — siehe Anhang E)
- **Akzeptanz:** Datei existiert, README.md und CLAUDE.md verweisen darauf.

#### 0.2 — Persona-Ranking in CLAUDE.md aufnehmen (S)

- CLAUDE.md erhält neuen Abschnitt „Persona-Hierarchie" oben unter „Vision".
- **Akzeptanz:** Jeder Sub-Agent in zukünftigen Audits weiß, dass Arzt > Anwalt > StB > Maschinenbau ist, ohne Rückfragen.

#### 0.3 — Telegram strategisch einordnen (S)

- Datei anlegen: `docs/TELEGRAM_STRATEGY.md` (siehe Anhang D).
- Kern-Entscheidung dokumentieren: **Default-OFF** für neue Box, „Aktivieren nur, wenn Sie keine Berufsgeheimnis-Daten teilen werden". Disclaimer-Modal Pflicht.
- **Akzeptanz:** Telegram-Setup-Wizard zeigt Disclaimer-Modal vor Token-Eingabe (siehe Phase 1.6).

#### 0.4 — Pricing-Architektur fixieren (S)

- Datei anlegen: `docs/PRICING.md` (siehe Anhang B).
- 3 Tiers: **Lite (€3.990, später)**, **Standard (€5.990 + €990/J)** ← Hauptangebot, **Pro (€7.990 + €1.490/J)**.
- 90-Tage-Pilot @ €2.500 anrechenbar dokumentiert.
- **Akzeptanz:** Pricing-Page-Wireframe gezeichnet (kann später Frontend werden).

#### 0.5 — Phasen-Plan-Index in ROADMAP.md (S)

- `docs/ROADMAP.md` aktualisieren: alte Phase-7/8-Cleanup-Sicht ist abgeschlossen. Neuer aktiver Pfad ist dieser Master-Plan.
- Banner an alten Plänen (`LLM_RAG_N8N_HARDENING.md`, `TELEGRAM_BOT_OPTIMIZATION.md`): „Superseded by COMMERCIAL_LAUNCH_MASTER_PLAN.md".
- **Akzeptanz:** `git grep "active plan"` zeigt nur diesen Master-Plan.

#### 0.6 — NVIDIA-Inception-Eintrag (S)

- Auf `nvidia.com/startups` registrieren. Frei. 1h Aufwand.
- DLI-Credits + Marketing-Co-Pilot + PR-Hebel.
- **Akzeptanz:** Inception-Mitgliedschaft bestätigt, Logo-Lizenz für Website verfügbar.

### Definition of Done — Phase 0

Drei neue Doku-Dateien (`POSITIONING.md`, `TELEGRAM_STRATEGY.md`, `PRICING.md`), CLAUDE.md mit Persona-Ranking, ROADMAP.md aktualisiert, NVIDIA-Inception-Eintrag durch. **Effort gesamt: 2 Tage.**

### Risk if skipped

Phase 1+ wird zur Detail-Diskussion. Sub-Agents reden über Maschinenbau, obwohl Fokus Arzt+Kanzlei ist. Telegram-Bot-Energie wird in Compliance-Risiko investiert statt in Compliance-Doku.

---

## Phase 1 — Compliance-Foundation & Multi-Tenancy (Wochen 1-4)

**Goal:** Die fünf harten Pre-Launch-Blocker entfernen, ohne die Arasul-Sale an Kanzlei/Praxis unmöglich ist.

### Tasks

#### 1.1 — Multi-User-Isolation MVP (XL — der härteste Block)

**Problem (aus 5 Audits, mehrfach genannt):** Aktuell sehen alle Mitarbeiter alle Dokumente, alle Chats, alle RAG-Spaces. Killer für Kanzlei (≥ 5 MA), Praxen, jedes Setup mit Mandanten-/Patienten-Daten.

**Architektur-Entscheidung (aus Daily-UX-Audit + Backend-Audit + DB-Audit):**

- **Kein vollständiges Multi-Tenancy** (würde Schema-Refactor von ~85 Migrationen bedeuten).
- **Stattdessen: Multi-User-Isolation auf einer Box** mit drei Rollen: `admin`, `mitarbeiter`, `lesezugriff`.
- Per-User-Owned Resources: Chats, Projects, persönliche Dokumente.
- Per-Team Shared Resources: Knowledge Spaces (mit Per-Space-ACL).

**Konkrete Schritte:**

1. **Migration `086_user_roles.sql`** — `admin_users` bekommt `role` (`admin` | `member` | `readonly`), Default `member`. Bootstrap-User bleibt `admin`. (S)
2. **Migration `087_resource_ownership.sql`** — `chat_conversations`, `projects`, `documents`, `knowledge_spaces` bekommen `owner_id` (FK zu `admin_users`). Backfill: alle existierenden Resources gehen an Bootstrap-Admin. (M)
3. **Migration `088_space_acl.sql`** — neue Tabelle `space_members(space_id, user_id, permission ENUM('owner','editor','viewer'))`. (M)
4. **Backend Middleware `requireOwnership.js`** — neuer Middleware, der bei `/chats/:id`, `/projects/:id`, `/documents/:id` etc. prüft, ob `req.user.id === resource.owner_id` ODER User ist `admin`. (M)
5. **Routen-Audit (M):** alle 46 Routen-Dateien durchgehen, jede Route die Daten zurückgibt:
   - liest? → `WHERE owner_id = $userId OR exists in space_members`.
   - schreibt? → vorher `requireOwnership` checken.
   - **Akzeptanz-Kriterium:** keine Route gibt Daten anderer User zurück. Test-Suite mit 2 Test-Usern, der eine sieht nicht den anderen.
6. **RAG-Filter (M):** `apps/dashboard-backend/src/routes/rag.js:740` — `hybridSearch()` bekommt `user_id` Parameter. Qdrant-Query filtert: `space_id IN (spaces user has access to)`. **Killer-Fix für Kanzlei.**
7. **Frontend (M):** Settings → Benutzerverwaltung-Tab anlegen. Admin kann User anlegen, Rollen vergeben, Space-Membership zuweisen. (`apps/dashboard-frontend/src/features/settings/UserManagement.tsx` neu).
8. **Tests (M):** Integrationstest „User A sieht nicht User B's Chats/Docs/Spaces". Im CI-Gate.

**Effort:** XL (10–12 Tage). **Akzeptanz:** Ein 5-User-Kanzlei-Setup kann im Produkt-Smoketest dargestellt werden, ohne dass Cross-User-Lecks auftreten. RAG-Suche respektiert Space-ACL.

**Risk if skipped:** **0 Pilotkunden bei Persona 1+2.** Hart.

#### 1.2 — Admin-Passwort-Auslieferung (M)

**Problem (Onboarding-Audit):** Admin-Passwort wird vom Bootstrap-Skript ins Terminal gedruckt — auf der Jetson, die der Kunde nie sieht. Datei `.env` wird auf `REDACTED_AFTER_BOOTSTRAP` überschrieben. Kunde steht 5 Min nach Auspacken vor Login-Screen ohne Passwort. **100 % Onboarding-Ausfall.**

**Lösung — drei Optionen, gewählt: Setup-on-First-Login.**

1. **Backend (M):**
   - Neuer Endpoint `POST /api/auth/setup-initial-admin` — nur callable, wenn KEIN Admin-User in DB existiert.
   - Bootstrap-Skript erstellt KEINEN Admin-User mehr automatisch (nur DB-Schema, leeres `admin_users`).
   - In `apps/dashboard-backend/src/middleware/requireAuth.js:1`: wenn `admin_users` leer und Request != `/api/auth/setup-initial-admin`, Redirect/Return `403 SETUP_REQUIRED`.
2. **Frontend (M):**
   - `Login.tsx` checked vorab `GET /api/auth/setup-status`.
   - Wenn `requires_initial_setup: true`, zeige Setup-Wizard-Schritt-0: „Willkommen — bitte legen Sie Ihren ersten Admin-Account an" (Username + Passwort + Passwort-Bestätigung + E-Mail).
   - Nach erfolgreichem Setup: normaler Login-Flow.
3. **Doku (S):**
   - `README.md` und `QUICK_START.md` aktualisieren: „Bei erstem Login werden Sie aufgefordert, einen Admin-Account anzulegen. Notieren Sie das Passwort sicher."
   - Welcome-Print-Beigabe: „Box einschalten → 3 Min warten → http://arasul.local → Admin-Account anlegen."

**Effort:** M (2 Tage). **Akzeptanz:** Frischer Box-Boot → Browser → arasul.local → Setup-Wizard → in 3 Min eingeloggt, ohne dass jemand am Terminal war.

**Risk if skipped:** Jeder Kunde ruft am Tag 1 an. Solo-Dev unmöglich.

#### 1.3 — Compliance-Doku-Pakete schreiben (M, hauptsächlich Schreibarbeit)

Pflicht-Dokumente (siehe Anhang C für volle Liste). Hier nur Top-Priorität:

1. **AVV-Template** (`docs/legal/AVV_TEMPLATE.md`, S) — Basis: [activeMind-Muster](https://www.activemind.de/downloads/av-vertrag/). Anpassung: On-Prem-Klausel („Verarbeiter erhält keinen Klartext-Zugriff auf Mandanten-Daten, außer bei explizit beauftragtem Remote-Support"), §203-StGB-Schweigepflicht-Klausel für Remote-Support-Personal, sub-prozessoren-frei (rein on-prem).
2. **TOM-Dokument** (`docs/legal/TOMs.md`, S) — Art. 32 DSGVO. Beschreibe: Verschlüsselung at rest (siehe Phase 2), TLS, Backup, Patch-Management, Self-Healing, Audit-Logging, Rollen-Trennung.
3. **DSFA-Vorlage** (`docs/legal/DSFA_VORLAGE.md`, S) — Art. 35 DSGVO. Datenflussdiagramm + Risikoanalyse-Template. Kunde füllt aus, Arasul liefert Bausteine.
4. **AI-Act-Selbsterklärung Nicht-Hochrisiko** (`docs/legal/AI_ACT_SELF_DECLARATION.md`, S) — Mapping zu Annex III: keine biometrische Identifikation, keine Justiz-Entscheidung, keine Bewerber-Auswahl, keine kreditwürdigkeit. Standard-Use-Cases (Doc-Review, RAG, Vertragsanalyse, Diktat) sind explizit nicht hochrisiko.
5. **AGB-Template** (`docs/legal/AGB_TEMPLATE.md`, M) — Solo-Dev: Anwalt für €800–1.500 dazuholen. Vertrieb in DACH ohne AGB unmöglich. Kanzlei-Empfehlung: IT-Recht-Kanzlei München, Schwenke.
6. **Wartungsvertrag** (`docs/legal/WARTUNGSVERTRAG.md`, S) — Mindestlaufzeit 12 Monate, 3 Monate Kündigungsfrist zum Jahresende, 8/5-Support, 24h Bestätigung, 5 Werktage Lösungs-Ziel.
7. **SLA-Standard** (`docs/legal/SLA_STANDARD.md`, S) — 99 % Box-Uptime/Monat, RTO 24h, RPO 24h. Premium-Tier (siehe Pricing): 99,5 %, RTO 4h.
8. **Datenschutzerklärung-Template** (`docs/legal/DATENSCHUTZERKLAERUNG.md`, S) — für Kunden-Außenkommunikation. Kunde übernimmt seinen Teil.
9. **AI-Literacy-Mini-Modul** (PDF + In-App-Tour, M) — 2–3 Seiten Onboarding, was KI-Kompetenz nach Art. 4 EU-AI-Act bedeutet, was darf/darf-nicht. **Kostenloses Verkaufsargument:** spart Kunden die Schulungspflicht.

**Effort:** M (3–4 Tage Schreibarbeit + Anwalt-Review für AGB).

**Akzeptanz:** Datei-Set existiert in `docs/legal/`. Anwalt hat AGB+AVV+Wartungsvertrag mind. 1× reviewt.

**Risk if skipped:** Kein Sale ohne diese. Kanzlei-DSB blockt automatisch.

#### 1.4 — KI-Transparenz-UI (Art. 50 EU-AI-Act) (S)

**Pflicht ab 2. Aug 2026:** Nutzer muss erfahren „Diese Antwort wurde von KI generiert".

- Frontend: `apps/dashboard-frontend/src/features/chat/components/ChatMessage.tsx` — assistente-Nachrichten bekommen kleines Footer-Label „🤖 Generiert von [Modell-Name] · [Zeitstempel]". Kann nur durch Admin-Setting deaktiviert werden, mit Audit-Log-Eintrag.
- Backend: Audit-Log-Eintrag bei Aktivierung/Deaktivierung des Labels.
- **Akzeptanz:** Default-State zeigt Label. Deaktivierung erfordert Admin-Rolle und ist im Audit-Log nachvollziehbar.

**Effort:** S (3h). **Risk if skipped:** Bußgeld-Risiko ab Aug 2026.

#### 1.5 — Audit-Log-Robustheit (M)

**Problem (Backend-Audit + Security-Audit):**

- Audit-Logs werden synchron geschrieben, Failures werden silently ignored (`apps/dashboard-backend/src/routes/documents.js:225-234, 693-701, 826-834`).
- Wenn Audit-DB voll ist, droppen Logs — Kanzlei kann nicht beweisen, was wann passierte.

**Fix:**

- Async Audit-Log-Queue (Bull/BullMQ-basiert oder Postgres-basierte Queue mit `pg-boss`).
- Wenn Async-Write fehlschlägt → WARN-Level-Log + Metric.
- Audit-Logs **nicht** unter `app_events` 90-Tage-Retention. Eigene Tabelle, 7 Jahre Aufbewahrung (StBerG-Berufsrecht-Konform).
- Migration `089_audit_log_separate_retention.sql`.

**Effort:** M (2 Tage). **Akzeptanz:** Kanzlei kann via Admin-UI Audit-Log für 7 Jahre exportieren. Async-Writes haben Fail-Handling.

#### 1.6 — Telegram-Disclaimer-Modal & Default-OFF (S)

**Problem (Telegram-Audit + Compliance-Audit):** Telegram = Drittland UAE. Bot-Setup-Wizard zeigt keinen Disclaimer.

**Fix:**

- `apps/dashboard-frontend/src/features/telegram/components/BotSetupWizard.tsx` — Schritt 0 hinzufügen: „⚠️ Telegram ist ein Drittland-Dienst (UAE). Nachrichten werden über Telegram-Server übertragen. Sie sind als Verantwortlicher dafür zuständig sicherzustellen, dass keine Berufsgeheimnis-Daten (Mandanten-, Patienten-, Mandanten-Daten) über diesen Bot verarbeitet werden. Bestätigen Sie, dass Sie Ihren Datenschutzbeauftragten konsultiert haben."
- Checkbox „Ich bestätige" (mit Audit-Log-Eintrag).
- Bot-Feature ist global Default-OFF in Setup-Wizard. Aktivierung über Settings → Erweitert → „Telegram aktivieren".
- DB: `system_config` Setting `telegram.enabled` (default `false`).

**Effort:** S (4h). **Akzeptanz:** Frischer Setup zeigt Telegram-Tab nicht im Sidebar. Aktivierung erfordert explizites Opt-In.

#### 1.7 — n8n External-Node Whitelist (M)

**Problem (Compliance-Audit + Security-Audit):** n8n-Workflows können beliebige HTTP-Requests stellen. SSRF-Risiko + DSGVO-Daten-Export-Risiko.

**Fix:**

- n8n-Container-Config: Default-Whitelist nur für interne Dienste (`http://ollama:11434`, `http://qdrant:6333`, `http://minio:9000`, `http://embedding-service:8000`).
- Externe Domains nur per explizitem Admin-Toggle freigeschaltet, mit Audit-Log.
- HTTP-Node-Logging: jede externe Request wird in `n8n_external_calls` Tabelle geloggt.

**Effort:** M (2 Tage). **Akzeptanz:** Frische Box: Workflow-HTTP-Node kann nicht zu `api.openai.com` connecten ohne Admin-Freigabe.

### Definition of Done — Phase 1

- Multi-User-Iso live, integration-getestet.
- Setup-on-First-Login implementiert. Frischer Boot → Browser → in 3 Min eingeloggt.
- `docs/legal/` enthält AVV, AGB, TOMs, DSFA, AI-Act-Selbsterklärung, Wartungsvertrag, SLA, Datenschutzerklärung, AI-Literacy-Modul. AGB/AVV anwaltlich reviewt.
- KI-Transparenz-Label im Chat aktiv.
- Audit-Log-Robustheit (Async-Queue, 7-Jahre-Retention).
- Telegram Default-OFF + Disclaimer-Modal.
- n8n Whitelist + External-Call-Logging.
- **Smoke-Test: 5-User-Kanzlei-Setup im Demo-Mode lauffähig, kein Cross-User-Leak, Audit-Trail vollständig.**

**Effort gesamt:** 4 Wochen Solo-Dev (entspricht 18–22 Engineering-Tagen).

**Risk if skipped:** Sale unmöglich. Phase 1 ist **nicht** verhandelbar.

---

## Phase 2 — Daten-Verschlüsselung at rest & Security-Hardening (Wochen 4-6)

**Goal:** Die Sicherheits-Befunde aus Security-Audit + GDPR-Audit + Compliance-Audit umsetzen, die für Kanzlei-DSB-Sign-Off Pflicht sind.

### Tasks

#### 2.1 — MinIO Server-Side Encryption (SSE-KMS) (M)

**Problem (Security-Audit):** MinIO speichert Mandanten-Dokumente unverschlüsselt im Filesystem. DSGVO Art. 32 + StBerG §6 verletzbar.

**Fix:**

- MinIO mit `MINIO_KMS_AUTO_ENCRYPTION=on` und integriertem KES-Server (oder Built-in-KMS).
- Master-Key in `/run/secrets/minio_master_key` (Docker-Secret).
- Backup-Service: KMS-Key ebenfalls verschlüsselt sichern.
- Dokumentation: bei Box-Verlust → Daten ohne KMS-Key unbrauchbar.

**Effort:** M (1.5 Tage). **Akzeptanz:** `mc admin info` zeigt SSE aktiv. Bestehende Buckets re-encrypted via Migration-Skript.

#### 2.2 — PostgreSQL-Daten-Verschlüsselung (M)

**Problem:** PG-Datafiles unverschlüsselt unter `/var/lib/postgresql/data/`.

**Lösungs-Optionen:**

- **A — pgcrypto column-level**: Verschlüsselt nur sensible Spalten (Bot-Token sind schon GCM-verschlüsselt). Aufwand mittel, Performance-Impact gering.
- **B — LUKS Full-Disk Encryption** für `/data/`-Volume. Schützt gegen Box-Diebstahl. Bei Reboot: Passphrase nötig (Auto-Unlock via TPM oder ssss-split-Verfahren).
- **C — Setup-Skript fragt Customer beim Bootstrap nach „Volume-Encryption?"** → wenn JA, automatischer LUKS-Setup.

**Empfehlung:** **B + C kombinieren.** Default-On bei Bootstrap, Customer kann opt-out wenn er physische Sicherheit zusichert.

**Effort:** M (2 Tage Skripting + Test). **Akzeptanz:** Fresh-Setup: Volume LUKS-encrypted, automatisch aufgeschlossen via TPM (Jetson hat TPM). Bei Box-Diebstahl ohne TPM → Daten unzugänglich.

#### 2.3 — Backup-Encryption + Qdrant-Snapshots (M)

**Problem (DB-Audit + Self-Healing-Audit):**

- Backup-Verschlüsselung optional, nicht getestet.
- Qdrant-Vektoren werden nicht gesichert. Bei Korruption: Re-Embedding aller Dokumente nötig (Stunden).

**Fix:**

- `services/backup-service/backup.sh`: Verschlüsselung Default-On (AES-256, Key in Docker-Secret).
- Qdrant-Snapshot-API in Backup-Lauf integrieren: `curl -X POST http://qdrant:6333/snapshots`.
- Restore-Drill (`scripts/test/dr-drill-ci.sh`): erweitert auf Qdrant-Snapshot-Restore.
- Restore-Drill prüft auch encrypted-Backups (Decrypt-Test).

**Effort:** M (2 Tage). **Akzeptanz:** Nightly DR-Drill grün, inklusive Qdrant-Roundtrip + Decrypt-Test.

#### 2.4 — IDOR-Fixes (S)

**Problem (Backend-Audit):** Document-Image-Endpunkt `/api/documents/images/:filename` filtert nicht nach User. RAW-fetch über Telegram-Bot-Service hat keine SSRF-Protection. Cursor-Pagination in Chats.js validiert nicht Conversation-Owner.

**Fix:**

- `apps/dashboard-backend/src/routes/documents.js`: Document-Images über `documents.uploaded_by = req.user.id` joinen.
- `apps/dashboard-backend/src/services/telegram/`: SSRF-Whitelist (Allow nur `api.telegram.org`).
- `apps/dashboard-backend/src/routes/chats.js:223-250`: cursor `before` ID validieren gegen `conversation_id`.

**Effort:** S (3h). **Akzeptanz:** Pen-Test-Smoketest: Cross-User-Image-Access schlägt fehl, SSRF-Attack auf interne Service blockiert.

#### 2.5 — Stream-Error-Surface (M)

**Problem (Backend-Audit + Chat-Tiefe-Audit):** Stream-Errors werden an Client nicht propagiert. „Ewig denkende" Antworten. Job-Queue-Subscription wird bei Error nicht unsubscribed → Memory-Leak.

**Fix:**

- `apps/dashboard-backend/src/routes/llm.js:130-140`: Wenn `res.write()` Error → SSE-Event `{type: 'stream_error', code, message}` senden, dann `res.destroy()`.
- Try-Finally für `unsubscribe()`-Cleanup.
- Frontend: `useChatStreaming.ts` empfängt `stream_error`, zeigt Retry-Button.

**Effort:** M (1 Tag). **Akzeptanz:** Künstlich injizierter Stream-Fail → Frontend zeigt Fehler + Retry-Button innerhalb 2s.

#### 2.6 — Update-Signing & Rollback (M)

**Problem (Self-Healing-Audit + Infra-Audit):**

- `.araupdate`-Pakete signiert (RSA), aber Container-Images werden ungeschützt aus Registry gepullt.
- Rollback-Skript existiert nicht — failed Update kann Box bricken.

**Fix:**

- Cosign-signierte Container-Images. CI baut + signiert. Box verifiziert vor Pull.
- `scripts/deploy/rollback.sh` neu: speichert vor jedem Update Snapshot von `compose/`, `.env`, last-known-good Image-Tags. Rollback-Befehl restored.
- Update-Health-Check: nach Update werden alle Service-Healthchecks geprüft. Bei Fail → Auto-Rollback.

**Effort:** M (2 Tage). **Akzeptanz:** Künstlich kaputtes Update → Box recovered automatisch zur Vorversion innerhalb 5 Min.

#### 2.7 — GPU-Arbiter (M)

**Problem (Infra-Audit + AI-Stack-Audit):** Ollama und Embedding-Service teilen sich GPU. Concurrent Inference → undefined behavior, OOM-Risiko, Indexing während Chat = beide hängen.

**Fix:**

- Mini-Service `services/gpu-arbiter/` (Python-Sidecar): semaphore-basierter Lock. Embedding-Service muss vor Inference Lock holen, Ollama auch. Lock-Timeout 30s.
- Alternative: `OLLAMA_NUM_PARALLEL=1` + Embedding-Service-Queue (sequenziell statt parallel).
- **Pragmatische Option für MVP:** zweite Lösung. Später Arbiter-Service.

**Effort:** M (1.5 Tage MVP-Variante). **Akzeptanz:** Lasttest 100 Docs Indexing während aktivem Chat → keine OOMs, keine 500ers.

#### 2.8 — Cloudflared raus, Tailscale rein (M)

**Problem (Compliance-Audit):** Cloudflared = US-Drittland-Transfer. Für Kanzlei/Praxis-Sale unzulässig.

**Fix:**

- `compose/external.yml`: Cloudflared-Profil-Service entfernen oder als „nicht für Berufsgeheimnis"-Default-Off markieren.
- Default-Path: Tailscale Headscale (self-hosted) für Remote-Maintenance. Container `services/tailscale/` (oder Headscale-Stack).
- Doku: `docs/REMOTE_MAINTENANCE.md` aktualisieren.

**Effort:** M (1.5 Tage). **Akzeptanz:** Frische Box: kein Cloudflared, Remote-Support via Tailscale-Authkey.

### Definition of Done — Phase 2

- MinIO SSE aktiv, Migration für bestehende Buckets durchgeführt.
- PG-Volume LUKS-encrypted (mit Setup-Skript-Toggle).
- Backups verschlüsselt, Qdrant in Backup-Lauf, DR-Drill grün.
- IDOR-Fixes deployed, Pen-Test-Smoketest grün.
- Stream-Errors werden propagiert, Retry-Button funktioniert.
- Container-Images cosign-signiert, Rollback automatisch.
- GPU-Arbiter (oder sequenzielle Queue) verhindert OOM bei concurrent inference.
- Cloudflared-Default-Off, Tailscale-Path dokumentiert.

**Effort gesamt:** 2 Wochen Solo-Dev (10–12 Engineering-Tage).

**Risk if skipped:** Kanzlei-DSB blockt. Bei Box-Diebstahl Daten-Leak. Concurrent-Use crasht Box im Demo.

---

## Phase 3 — RAG/Chat-Tiefe & Wow-Demo-Politur (Wochen 6-10)

**Goal:** Wachstumshebel „Tiefe vorhandener Features" einlösen. Aus „kind of works" wird „Donnerwetter-Demo". Fokus: RAG-Quality, Chat-UX, Citations, n8n-Templates.

### Tasks

#### 3.1 — RAG-Qualität: Re-Index + Anti-Hallucination (M)

**Problem (RAG-Tiefe-Audit + AI-Stack-Audit):** 33 % Test-Fail-Rate. Chunking-Config wurde reduziert (300→150 Wörter), aber bestehende Docs nicht re-indexed. Source-Attribution-Fehler in Tests 1, 4. Tests 3, 5, 6 fail wegen zu großer Chunks.

**Fix:**

1. **Re-Index aller bestehender Dokumente** mit aktueller 150-Wort-Child-Chunking-Config. Skript `scripts/rag/reindex-all.sh`. (S)
2. **Stricter Prompt-Template** in `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:154-184`:
   - Klare DOKUMENT-[N]-/ENDE-DOKUMENT-[N]-Delimiter.
   - „Du MUSST jede Aussage mit [N] belegen, wo N exakt der Index aus den DOKUMENT-Markern ist."
   - Temperatur: 0.2 (bestätigt).
   - num_predict: 2048 (bestätigt).
3. **Section-aware Markdown-Chunking** (RAG-Plan Phase 1) — splitte Markdown-Dokumente zuerst nach `## Header`, dann innerhalb der Sektion. Header wird an jeden Child-Chunk vorangestellt. (M)
4. **RAG-Test-Suite** (`tests/rag/dach-suite.json` mit 12 Tests + 8 weiteren) automatisiert in CI laufen lassen. Pass-Rate als CI-Gate ≥ 80 %.
5. **„No Documents Found" Fallback** strikter: wenn `topResult.score < 0.005`, antworte ausschließlich „Diese Information ist in den vorliegenden Dokumenten nicht enthalten." Keine LLM-„Allgemeines Wissen"-Antwort. (S)

**Effort:** M+L (4 Tage). **Akzeptanz:** RAG-Test-Suite ≥ 80 % Pass-Rate. Source-Attribution korrekt in 9/10 Tests.

#### 3.2 — Click-to-Source & PDF-Page-Jump (L)

**Problem (RAG-Tiefe + Chat-Tiefe):** Quellen werden in Chat angezeigt, aber kein Click → keine PDF-Seitennummer, kein Highlight. Killer-Gap vs. Microsoft Copilot.

**Fix:**

1. **Backend:** Document-Indexer extrahiert PDF-Seitennummern in Chunk-Metadata (`document_chunks.page_number`). Migration `090_chunk_page_numbers.sql`. Re-Index nötig.
2. **Frontend:** `apps/dashboard-frontend/src/features/chat/components/ChatMessage.tsx`: Quellen-Item ist Click-bar.
3. **Document-Viewer-Modal:** öffnet PDF im Viewer (z. B. PDF.js), springt zur Seite, highlightet relevanten Text-Range (chunk character offsets).
4. **Inline-Citations im Antwort-Text:** Replace `[1]` durch klickbaren Link-Span. Hover zeigt Snippet.

**Effort:** L (4 Tage). **Akzeptanz:** Im Demo: Frage stellen, Antwort kommt mit `[1]` Link, Click öffnet PDF auf Seite 12 mit gelb hinterlegtem Text.

**Strategischer Wert:** Killer-Demo-Moment für Kanzlei.

#### 3.3 — Modell-Preload + Loading-UX (M)

**Problem (AI-Stack + Chat-Tiefe):** Cold-Start 30–50s. Kein Progress-UI. Erster Demo-Eindruck wird ruiniert, wenn erste Frage 50s wartet.

**Fix:**

1. **Backend:** Bei Container-Startup wird Default-Modell automatisch geladen (`ollama run [model]` in start-Hook). (S)
2. **Modellwechsel-Endpoint:** `POST /api/llm/preload-model` mit SSE-Progress (`{loaded: 0.45}`).
3. **Frontend:** Modell-Switch zeigt Modal „Modell wird geladen — geschätzt 35 Sekunden". Progress-Balken. ETA aus historischen Werten in `llm_performance_metrics`.
4. **Erste-Query-Hint:** wenn Modell noch lädt, queue Anfrage statt fail.

**Effort:** M (2 Tage). **Akzeptanz:** Erste Demo-Frage nach Box-Reboot: < 5s TTFT (warm), 30s mit Progress-Balken (cold-Switch).

#### 3.4 — Persona-UI für System-Prompt (M)

**Problem (Chat-Tiefe-Audit):** 4-Layer-Architecture für System-Prompts existiert (global → AI-Profile → Company-Context → Project-Prompt). Aber **keine Customer-UI**. Kanzlei kann „immer formal, cite §, deutsche Anführungszeichen" nicht eingeben ohne API-Call.

**Fix:**

- `apps/dashboard-frontend/src/features/settings/CompanyProfile.tsx` neu (oder erweitern):
  - Felder: Firma, Branche, Sprache, Mitarbeiterzahl, Produkte, Antwort-Stil, Formalitätsgrad, Spezial-Anweisungen (Freitextfeld 500 Zeichen).
  - Live-Preview: „So würde Arasul auf 'Was ist Vertragsstrafe?' antworten:" → kleines Test-Chat.
- Backend: Settings landen in `company_context` Tabelle.

**Effort:** M (2 Tage). **Akzeptanz:** Kanzlei-Demo: Kanzleichef tippt 5 Felder ein, Live-Preview zeigt formal-Sie-Antwort mit § -Zitat. Wow-Faktor.

#### 3.5 — Chat-PDF-Export (M)

**Problem (Chat-Tiefe):** JSON-Export existiert. Kein PDF. Aber Kanzlei muss Chats für Aktenführung exportieren.

**Fix:**

- Backend-Endpoint `GET /chats/:id/export?format=pdf`.
- Library: Puppeteer (Chromium) oder pdf-lib für reines PDF-Generieren.
- Layout: Logo, Datum, Chat-Titel, User-/Assistant-Bubbles in formaler DE-Typografie, Quellen mit Seitennummern als Fußnoten.
- Optional: Watermark „Generiert von KI — nicht rechtsverbindlich".

**Effort:** M (2 Tage). **Akzeptanz:** Beispiel-Chat als PDF: druckbar, Anwalt-präsentabel, Quellen klickbar.

#### 3.6 — Globale Suche / Cmd+K (M)

**Problem (Daily-UX):** Kein Cmd+K. Chat-Search und Doc-Search getrennt. „Wo ist meine Datei?" = Churn-Trigger.

**Fix:**

- Frontend-Komponente `apps/dashboard-frontend/src/components/CommandPalette.tsx`.
- Cmd+K (Win/Linux: Ctrl+K) öffnet Modal.
- Sucht parallel:
  - Chats (Titel + Inhalt).
  - Dokumente (Titel + Volltext).
  - Knowledge Spaces.
  - Settings-Pages (Quick-Jump).
- Backend: neuer Endpoint `GET /api/search?q=...` aggregiert über alle Quellen, respektiert Multi-User-ACL.

**Effort:** M (2 Tage). **Akzeptanz:** Cmd+K → tippe „Müller" → sieht 3 Chats + 2 Dokumente, kann springen.

#### 3.7 — n8n-Template-Galerie (M+L)

**Problem (n8n-Tiefe-Audit):** n8n existiert, ist aber Silo. Keine Templates für SMB. Ohne Templates ist n8n kein Verkaufsargument.

**Fix:**

1. **Vorgefertigte Templates** als JSON in `services/n8n/workflows/templates/` (M):
   - „Email-Eingang summarisieren" (Gmail → Arasul-LLM → MinIO-Notiz).
   - „PDF in CRM-Ordner ablegen" (MinIO-Upload → Arasul-Documents-extract-structured → Telegram-Notify).
   - „Kunden-Anfrage → Angebot" (existiert als `quote-automation.json`, polieren).
   - „Mandanten-Akte automatisch indexieren" (neue PDF in MinIO → Arasul-Embeddings → Qdrant + Notify).
   - „Termin-Bestätigungs-E-Mail bei Kalender-Eintrag" (für Praxis).
2. **Frontend-Galerie** (L) `apps/dashboard-frontend/src/features/store/N8nTemplates.tsx`:
   - Karten mit Titel, Beschreibung, „1-Klick-Import"-Button.
   - Klick → Backend ruft n8n-API → workflow vorinstalliert.
3. **n8n-SSO** (M) — Traefik-Forward-Auth für `/n8n/*` (Cookie aus Dashboard reicht).

**Effort:** M+L (5 Tage). **Akzeptanz:** Demo: Customer klickt „Email-Summaries"-Template, ist nach 1 Klick + OAuth-Setup live.

#### 3.8 — Stream-Cancel-Race-Bug & Retry-Button (S)

**Problem (Backend-Audit):** Cancel-Race war in Phase 4 P1 gefixt, aber Retry-Button mit `lastSendRef` wird laut Chat-Audit als unzuverlässig genannt. Tests fehlen.

**Fix:**

- WebSocket/SSE-Reconnect-Test in CI (5 Retries mit Backoff).
- Retry-Button-Test: Klick → identischer Request mit gleichen Daten.

**Effort:** S (3h). **Akzeptanz:** Tests grün.

### Definition of Done — Phase 3

- RAG-Test-Pass-Rate ≥ 80 %.
- Click-to-Source mit PDF-Page-Jump funktioniert.
- Modell-Preload + Loading-Modal.
- Persona-UI lebt + Live-Preview.
- Chat-PDF-Export.
- Cmd+K Globale Suche über Chats/Docs/Settings.
- n8n-Template-Galerie mit ≥ 5 Templates und 1-Klick-Import + SSO.
- Stream-Errors propagiert, Retry-Button getestet.

**Effort gesamt:** 4 Wochen Solo-Dev (18–22 Engineering-Tage).

**Risk if skipped:** Demo-Eindruck = „prototype, kein Wow". Erste Pilot-Calls werden cold.

---

## Phase 4 — Onboarding-Hardening & First-Run-Magie (Wochen 10-12)

**Goal:** Aus „funktioniert irgendwie" wird „packt aus, plug-in, in 15 Min wow-Demo". Onboarding-Audit war 43/100 — der Killer-Wert für Solo-Dev-ohne-Support.

### Tasks

#### 4.1 — Welcome-Hardware-Beigaben (S, aber teils physisch)

**Problem:** Kunde packt Box aus → keine Anleitung in Box → Browser → Login-Screen → kein Passwort → Anruf.

**Fix:**

- Beigabe in jeder Box-Verpackung:
  - **A6-Karte „Erste Schritte":** „1. Box an Strom + LAN. 2. 3 Min warten. 3. Browser → http://arasul.local. 4. Admin-Account anlegen. 5. Erste Frage stellen."
  - **USB-Stick** mit AGB, AVV, Datenschutzerklärung, Wartungsvertrag, Bedienungsanleitung-PDF, AI-Literacy-Modul.
- **Akzeptanz:** Mock-Verpackung mit Print-Karte + USB-Stick produziert.

**Effort:** S (Auftrag bei Druckerei + USB-Stick-Bulker, ~€500 für 50 Stück).

#### 4.2 — In-Browser Bootstrap-Status-Dashboard (M)

**Problem (Onboarding-Audit):** Bootstrap dauert 5 Min. Kunde sieht nichts. Modell-Download dauert 20+ Min, kein Progress.

**Fix:**

- Vor-Login-Page bei `arasul.local` zeigt System-Status:
  - „📦 Initialisiere Datenbank... ✓"
  - „🤖 Lade Standard-Modell (Gemma 4)... 45 % (ETA 8 Min)"
  - „🔍 Initialisiere Suche... ✓"
- Polling-Endpoint `GET /api/setup/bootstrap-status`.
- Wenn alle ✓ → Auto-Redirect zum Login/Setup-Wizard.
- Bei Fehler: Error-Card mit Retry-Button + „Logs für Support exportieren"-Button.

**Effort:** M (2 Tage). **Akzeptanz:** Frischer-Boot → Browser → Status-Page zeigt 4 Tasks, dann Setup-Wizard.

#### 4.3 — Modell-Download-Resilienz (M)

**Problem (Onboarding-Audit):** Wenn Modell-Download stalled → kein Recovery → Box „Keine Modelle gefunden".

**Fix:**

- Modell-Download mit 3× Retry und exponential Backoff.
- Fallback: kleines Test-Modell (`tinyllama:1.1b`, ~600 MB) als Notnagel.
- Setup-Wizard-Step-5 hat Retry-Button + „Mit kleinem Modell starten und später upgraden".
- **Pre-loaded Models in Factory-Image** — bei Box-Auslieferung sind Standard-Modelle (Gemma 4) bereits in `/data/models/` enthalten. Internet nur für Updates nötig.

**Effort:** M (2 Tage Skripting + Factory-Image-Bauen). **Akzeptanz:** Box ohne Internet bootet erfolgreich, Default-Modell verfügbar.

#### 4.4 — Sample-Dokumente + Demo-Setup (M)

**Problem (Onboarding + Daily-UX):** Empty-State auf allen Screens. Customer sieht „Keine Chats / Keine Dokumente / Keine Workflows" → keine CTAs.

**Fix:**

- **Branchen-Wahl im Setup-Wizard** (existiert teilweise in Step 2 „KI-Profil") wird verstärkt:
  - „Welche Branche?" → Anwalt | Arzt | Steuerberater | Maschinenbau | Sonstiges
  - Bei Wahl: vorgeladene Sample-Daten passend zur Branche (anonymisiert):
    - Anwalt: 3 Mustervertrag-PDFs („Mietvertrag Beispiel", „NDA Beispiel", „AGB Beispiel"), 1 Demo-Chat, 1 n8n-Template „Vertragsanalyse-Workflow".
    - Arzt: 2 Beispiel-Patientenbriefe (anonymisiert), 1 Demo-Chat „Welche Termine sind diese Woche frei?", 1 Template „Termin-Bestätigung".
    - Steuerberater: 3 Beispiel-Steuererklärungen, 1 Demo-Chat „Welche Abschreibungen sind möglich?", 1 Template „Mandanten-Anfrage".
- Empty-State-Komponenten bekommen CTA-Buttons:
  - „Keine Dokumente — [Sample laden] [Eigenes hochladen]"
  - „Keine Chats — [Mit Beispiel-Frage starten]"

**Effort:** M (3 Tage Sample-Daten + Frontend). **Akzeptanz:** Kanzlei-Setup → 3 PDFs + Demo-Chat-Frage „Was sagt der Mietvertrag zu Kündigungsfristen?" → Antwort in 15s mit Quellen.

#### 4.5 — German-Translation-Audit & Sentinel (S)

**Problem (Onboarding):** Mostly DE, aber inkonsistent. Backend-Errors leaken English (`ValidationError`). TROUBLESHOOTING.md ist English.

**Fix:**

- Frontend i18n-Audit-Skript: prüft alle UI-Strings auf DE-Konsistenz, fail in CI bei englischen Strings (außer Whitelist).
- Backend-Errors mit `code` + `message_de`. Frontend zeigt `message_de` per default.
- TROUBLESHOOTING.md zu DE übersetzen.

**Effort:** S+M (1.5 Tage). **Akzeptanz:** Lint-Check grün. Frische Demo-Box: kein englisches String im UI.

#### 4.6 — Tooltip + In-App-Help-System (M)

**Problem (Daily-UX + Doku-Audit):** Keine Tooltips. „Yellow Warning auf Dashboard" → Customer hat keine Ahnung, ob kritisch.

**Fix:**

- Frontend-Komponente `Tooltip` standardisiert (shadcn/ui).
- Jede ?-Icon im UI zeigt Erklärung in DE.
- Yellow/Red-Status-Badges sind klickbar → Modal mit:
  - Was bedeutet es?
  - Aktion-Empfehlung (z. B. „Speicherplatz < 20 % — alte Backups löschen?")
  - „Logs exportieren"-Button.
- Help-Sidebar (F1 oder ?-Tastatur-Shortcut) öffnet KeyboardShortcutsLegend (existiert!) + Quick-FAQ.

**Effort:** M (3 Tage). **Akzeptanz:** Yellow-Warning → Klick → Modal mit Hilfe → Customer kann selbst handeln.

#### 4.7 — FAQ.md (S)

**Problem (Doku-Audit):** Keine FAQ. TROUBLESHOOTING ist symptom-driven.

**Fix:**

- `docs/FAQ.md` neu (DE).
- 25–30 Q&As gegliedert nach: Onboarding, täglicher Use, Datenschutz, Updates, Notfall.
- Beispiele:
  - „Kann ich mehrere Boxen verbinden?"
  - „Was passiert bei Stromausfall?"
  - „Wie sichere ich meine Daten?"
  - „Sind meine Daten DSGVO-konform geschützt?"
  - „Kann ich Arasul mit meinem CRM/DATEV verbinden?"

**Effort:** S (1 Tag). **Akzeptanz:** Datei existiert, im Sidebar verlinkt.

#### 4.8 — Walkthrough-Videos (M, Kreativaufwand)

**Problem (Doku-Audit):** Null Visuals. Kein Video. Konvertierung von non-tech-Buyer 3× geringer ohne Video.

**Fix:**

- 3 Loom/Asciinema-Videos à 5 Min, deutsch:
  1. „Auspacken & Erstes Login" (5 Min)
  2. „Erste Frage zu eigenen Dokumenten" (5 Min)
  3. „n8n-Workflow für Email-Summaries" (5 Min)
- Hosted: YouTube + im Dashboard (Embed in Setup-Wizard und Help-Sidebar).
- Optional: 1× Pitch-Video für Sales (3 Min).

**Effort:** M (2–3 Tage Recording + Schnitt + Hosting). **Akzeptanz:** Videos public, Setup-Wizard zeigt Video-1 prominent.

### Definition of Done — Phase 4

- Welcome-Print-Karte + USB-Stick mit Beigaben designed.
- Bootstrap-Status-Dashboard im Browser sichtbar.
- Modell-Download-Resilienz + Pre-loaded Factory-Models.
- Branchen-Wahl mit vorgeladenen Sample-Daten + Demo-Chat.
- DE-Translation-Audit grün, TROUBLESHOOTING auf DE.
- Tooltip-System auf allen kritischen UI-Elementen.
- FAQ.md mit 25+ Q&As.
- 3 Walkthrough-Videos online.

**Effort gesamt:** 2 Wochen Solo-Dev (12–14 Engineering-Tage + ~3 Tage Kreativaufwand).

**Risk if skipped:** Onboarding-Score bleibt 43/100. Jeder Pilot-Kunde braucht 30-Min-Onboarding-Call.

---

## Phase 5 — Operations, 5-Jahre-Autonomie-Honesty & Support-Tooling (Wochen 12-14)

**Goal:** Self-Healing-Audit war 4.8/10. „5 Jahre autonom" ist heute eine 18–24-Monate-Realität. Plan: entweder honest-marketing (siehe A.1) ODER die 10 Self-Healing-Gaps schließen.

**Empfehlung:** Beides. Marketing-Tagline ändern AUF „**autonomer Betrieb über 24 Monate, danach 2× pro Jahr Wartungs-Check**", und gleichzeitig die wichtigsten Gaps schließen.

### Tasks

#### 5.1 — Cert-Expiry-Monitoring (S)

**Problem (Self-Healing-Audit):** Self-signed Cert mit 10-Jahres-Lifetime. Kein Monitoring. Nach 10 Jahren: TLS-Bricke ohne Warnung.

**Fix:**

- Self-Healing-Agent: weekly check `openssl x509 -checkend 2592000` (30-Tage-Vorlauf).
- Alert: Telegram + Email + Dashboard-Banner.
- Auto-Renewal: 60-Tage-Vorlauf, Skript existiert.

**Effort:** S (30 Min). **Akzeptanz:** Künstlich Cert auf 25 Tage Restlaufzeit setzen → Alert binnen 24h.

#### 5.2 — AI-Modell-Lifecycle (M)

**Problem (Self-Healing-Audit):** Ollama-Modelle wachsen unbeschränkt. Kunde lädt zweites Modell → +26 GB → Disk voll → Box bricht.

**Fix:**

- `services/self-healing-agent/`: Disk-Monitor erkennt, wenn `/data/models/` > 70 % der verfügbaren Disk.
- Alert + Empfehlung: „Ältestes Modell entfernen?"
- Settings: „Auto-evict ältestes Modell wenn Disk voll" (Toggle, default off).

**Effort:** M (2 Tage). **Akzeptanz:** Test: Box mit 100 GB Disk + 80 GB Modelle → Self-Healing Warning + Vorschlag.

#### 5.3 — Backup-Verifikation + Remote-Target (M)

**Problem (Self-Healing-Audit + DB-Audit):** Backup wird gemacht, aber **nie wiederhergestellt**. Backup-Target ist `/backups/` lokal — bei Disk-Failure kein Schutz. Backup-Failure-Alert fehlt.

**Fix:**

- Wöchentlicher Auto-Restore-Drill: nightly `dr-drill-ci.sh` plus weekly auf der echten Box (in temp-Container, validate Row-Count).
- Backup-Failure-Alert: 3 fehlgeschlagene Nachte hintereinander → Telegram/Email/Dashboard-Red.
- Optional-Remote-Target: NFS / S3 / USB. Setup-Wizard fragt: „Wo sollen Backups landen? [Lokal-Disk] [USB-Stick] [Mein NAS]".

**Effort:** M (3 Tage). **Akzeptanz:** Künstlich Backup fail-injizieren → Alert nach 3 Tagen. Restore-Drill grün.

#### 5.4 — Memory-Leak-Detektion (M)

**Problem (Self-Healing-Audit):** Memory-Sampling existiert (Phase 6 Code), aber Trend-Analyse nicht implementiert. Year 2 OOM ist programmiert.

**Fix:**

- `services/self-healing-agent/healing_engine.py`: 7-Tage-Slope auf `_memory_samples[container]`.
- If `slope > 10 MB/day` für 5 Tage → Auto-Restart-Container + Alert.

**Effort:** M (1 Tag). **Akzeptanz:** Künstlich-leakender Test-Container → Detektion in 5 Tagen, Restart-Action.

#### 5.5 — Support-Bundle-Export im Dashboard (S)

**Problem (Doku-Audit + Self-Healing-Audit):** `export-support-logs.sh` existiert. Aber: Customer kann ihn nicht ausführen (kein SSH-Knowhow).

**Fix:**

- Settings → Support-Tab → „Diagnose-Paket exportieren"-Button.
- Backend-Endpoint `POST /api/support/bundle` erzeugt tar.gz mit redacted Logs, Configs, Health-Snapshot.
- Download-Link + Mailto-Button („An Arasul-Support senden").

**Effort:** S (4h). **Akzeptanz:** Klick → 30s warten → Download-Bundle. PII-redacted (kein Passwort, keine Tokens).

#### 5.6 — On-Box-LED + Heartbeat-External (M, optional)

**Problem (Self-Healing-Audit):** Wenn Box offline → keine Alarmierung. Customer prüft nicht.

**Fix:**

- GPIO-LED via `gpiozero` (Jetson hat GPIO): blinkt grün=ok, gelb=warning, rot=critical.
- Optional: Customer kann eigene Heartbeat-URL eintragen (`https://uptime.arasul.io/{customer_id}` oder eigene Healthchecks-Server). Box pingt 1× / Stunde.

**Effort:** M (2 Tage). **Akzeptanz:** LED-Verhalten lokal sichtbar. Heartbeat-Failure → externe Mail.

#### 5.7 — 5-Jahre-Marketing-Honesty (S)

**Problem (Self-Healing-Audit):** Marketing sagt „5 Jahre autonom", Code sagt „18–24 Monate".

**Fix:**

- Marketing-Texte (README, Landing-Page-Wireframe, Sales-Slides) anpassen:
  - **Vorher:** „5 Jahre autonomer Betrieb"
  - **Nachher:** „24 Monate autonomer Betrieb + 2× jährlicher Wartungs-Check ab Jahr 3 — vollständig vom Wartungsvertrag abgedeckt."
- Wartungs-Vertrags-Beschreibung erweitern: „Inkludiert vor-Ort/Remote-Check 2× jährlich ab Jahr 3."

**Effort:** S (1h). **Akzeptanz:** Konsistente Story über alle Touchpoints.

### Definition of Done — Phase 5

- Cert-Expiry-Monitor mit Auto-Renewal-Test.
- Modell-Lifecycle mit Disk-Eviction-Empfehlung.
- Backup-Failure-Alert + wöchentliche Restore-Drill.
- Memory-Leak-Detektion + Auto-Restart.
- Support-Bundle-Export im Dashboard.
- Optional: LED + Heartbeat-Integration.
- Marketing-Honesty: 24 Monate-Tagline überall.

**Effort gesamt:** 2 Wochen Solo-Dev (10–12 Engineering-Tage).

**Risk if skipped:** Erste Support-Calls in Monat 8–12 ohne Diagnose-Möglichkeit. Self-Healing-Versprechen scheitert in Year 2 → Trust-Crash.

---

## Phase 6 — GTM-Foundation & Pilot-Hunt (Wochen 14-16)

**Goal:** Technik ist 80 % bereit. Jetzt: Pilot-Kunde finden.

> **Wichtig:** Phase 6 startet **parallel zu Phase 3**, nicht erst danach. Die ersten Outbounds (LinkedIn) gehen in Woche 6 raus, nicht in Woche 14.

### Tasks

#### 6.1 — Landing-Page mit konkretem Use-Case (M)

**Problem:** Aktuelle Outside-Story = „Edge-AI-Plattform". Verkauft sich nicht.

**Fix:**

- Single-Page-Landing (z. B. unter `arasul.de` oder `arasul.io`):
  - Hero: „**KI-Compliance für Mandantendaten — ohne Cloud, ohne Daten-Abfluss**"
  - Sub: „Arasul-Box: Chat, Wissenssuche, Workflow-Automatisierung. 5.990 € + 990 €/Jahr. DSGVO + AI-Act-Ready. Made in Germany."
  - 3-Sekunden-Video-Demo (Click → Sample-RAG-Query mit PDF-Quelle).
  - Persona-Cards: „Für Anwaltskanzleien" / „Für Arztpraxen" / „Für Steuerberater" — jede mit eigenem Pitch.
  - „90-Tage-Pilot ab 2.500 €" CTA.
  - Compliance-Badges: „DSGVO ✓ · AI-Act-Ready ✓ · §203 StGB-Konform ✓".
  - Demo-Video + Sales-Pitch-Video.
- Tools: Astro/Next.js, gehostet auf Cloudflare Pages oder Netlify.
- **Optional:** Cloudflared-Tunnel zur eigenen Demo-Box, eingebettet als „Live-Demo" — Click öffnet eigentliche Arasul-Instanz.

**Effort:** M (3–5 Tage). **Akzeptanz:** Live-URL existiert, mobile responsive, Lead-Form senden.

#### 6.2 — LinkedIn-Outreach-Engine (S, dann recurring)

**Problem:** Keine Pilot-Pipeline.

**Fix:**

- LinkedIn Sales Navigator (€80/Monat).
- Ziel-Liste: 200 Kontakte in DACH:
  - 80 Anwaltskanzleien-Inhaber (10–25 MA, Wirtschaftskanzlei oder Sozietät)
  - 80 Arzt-Inhaber (Allgemeinmediziner, MVZ, 4-Praxen-Verbund)
  - 40 Steuerberater (Datev-Skeptiker / on-prem-Affin)
- 20 personalisierte Voice-Notes/Woche.
- Hook-Variante 1 (Anwalt): „Hallo Frau Müller — kurze Frage: Wie haben Sie aktuell gelöst, wenn Mitarbeiter ChatGPT für Mandanten-Schreiben nutzen wollen? §203 StGB ist mit Cloud-KI knifflig. Wir haben eine On-Prem-Box dafür gebaut. 30 Min Demo gefällig?"
- Hook-Variante 2 (Arzt): „Hallo Herr Dr. Weber — wie regeln Sie aktuell, dass keine Patientendaten in ChatGPT landen? KBV hat klare Hinweise dazu — wir haben eine lokale KI-Box gebaut. 30 Min Demo möglich?"
- CRM: HubSpot-Free-Tier oder Notion.
- **Conversion-Erwartung:** 2–3 % Antwort, 0,5–1 % Demo, 1 Pilot pro 200 Outreach.

**Effort:** S (2h Setup + 10h/Woche Outreach). **Akzeptanz:** Nach Woche 8: 200 Touches gemacht, ≥ 5 Demo-Calls, ≥ 1 Pilot-Vereinbarung.

#### 6.3 — Demo-Strategie: Cloudflared-Tunnel (S)

**Problem:** Solo-Dev kann nicht 200× Box versenden.

**Fix:**

- Tier-1-Demo: Eigene Box läuft 24/7 zuhause. Cloudflared-Tunnel-URL → Customer-Browser.
- Demo-Setup mit anonymisierten Sample-Dokumenten passend zu jedem Persona.
- Cloudflared ist hier **nur für Demo, nicht für Production-Box** (siehe Phase 2.8).
- Tier-2-Demo (ab Pilot 1): Versand-Box, 1 Loaner-Box im Stock.

**Effort:** S (1 Tag — Setup-Skript für „Demo-Mode-Wipe" zwischen Calls).

#### 6.4 — Branchenspezifischer Sales-Pitch (M)

**Problem:** Generischer Pitch verliert.

**Fix:**

- 3 Pitch-Decks (Google Slides oder Keynote):
  - **Anwalt** (15 Folien): §203 StGB → BRAK-Leitfaden → AI-Act-Inventur → Demo → 90-Tage-Pilot.
  - **Arzt** (15 Folien): KBV-PraxisWissen → Schatten-KI-Risiko → MVZ-Kontext → Demo → Pilot.
  - **Steuerberater** (15 Folien): BStBK-FAQ → DATEV-Cloud-Anxiety → Custom-RAG-Vorteil → Pilot.
- Each pitch hat: Compliance-Mapping (1-Pager), Live-Demo-Video, ROI-Rechner („Sparen Sie X Stunden/Woche").

**Effort:** M (3 Tage Pitch-Aufbau). **Akzeptanz:** Bei nächstem Demo-Call: Persona-spezifischer Deck wird verwendet.

#### 6.5 — Pilot-Vertrag-Vorlage (S)

**Problem:** Kein juristisches Setup für Pilot.

**Fix:**

- `docs/legal/PILOT_AGREEMENT.md` neu:
  - Laufzeit: 90 Tage.
  - Preis: 2.500 € netto, voll anrechenbar bei späterem Kauf bis Tag 120.
  - Inhalt: 1× Vor-Ort-Setup, wöchentliche Check-Calls, Logging-Recht, schriftliche Erfolgsbestätigung am Tag 85.
  - Rückgabe-Pflicht: bei Tag 90 ohne Kauf-Entscheidung → Box-Rückversand auf Kunden-Kosten.
  - DSGVO/AVV als Anhang.

**Effort:** S (1 Tag). **Akzeptanz:** Anwaltlich reviewt.

#### 6.6 — Trade-Fair-Buchungen (S, mit Vorlauf)

**Problem:** Trade-Fairs sind Pflicht-Termine 2026.

**Fix (sofort buchen):**

- **DStBK26 (Mai 2026):** wahrscheinlich schon zu spät — als Visitor mit 50 Targeted-Meetings besuchen.
- **Anwaltstag 2026 (8.–12. Juni 2026):** kleiner Stand €3–5k, lohnt sich. Sofort anmelden.
- **Legal Operations Konferenz (17.–18. Juni 2026):** 100 % Decision-Maker, Networking-fokussiert.
- **TAXarena München (Sommer 2026):** 6m²-Stand €4–6k.
- **it-sa Nürnberg (27.–29. Okt 2026):** als Visitor, 28k Cybersec-Decider, viele Kanzlei-CIOs.

**Effort:** S (Termine-Buchen, Logistik 1 Tag). **Akzeptanz:** Mindestens 1 Stand gebucht für Q3 2026.

### Definition of Done — Phase 6

- Landing-Page live mit Persona-Pitch.
- LinkedIn-Sales-Navigator-Setup, 200 Outreaches/8 Wochen.
- Cloudflared-Demo-Box läuft.
- 3 Pitch-Decks fertig.
- Pilot-Vertrag-Vorlage anwaltlich reviewt.
- Mindestens 1 Trade-Fair-Stand gebucht.

**Effort gesamt:** 2 Wochen Solo-Dev + recurring Outreach.

**Risk if skipped:** Tech ist fertig, Pilot-Pipeline leer.

---

## Phase 7 — Pilot-Execution & erste Case-Study (Wochen 16-28)

**Goal:** Tag 90 = 1 zahlender Pilot. Tag 180 = 1 konvertierter Kunde + 1 Case-Study.

### Tasks

#### 7.1 — Pilot-Onboarding-Playbook (S)

- Tag 0: Vor-Ort-Setup (4h Aufwand). Kunde dabei. Live-Show: Box auspacken, anschließen, Setup-Wizard, erste Frage zu Kunden-eigenem PDF.
- Tag 1–7: tägliche Check-Mails „Wie war's?".
- Tag 7, 30, 60: Wöchentliche/zweiwöchentliche 30-Min-Calls.
- Tag 30: Use-Case-Logging — was wird tatsächlich genutzt? Stunden gespart?
- Tag 60: Erster Konvertierungs-Call. Kunde: „Wie viel ist Ihnen das wert?"
- Tag 85: Schriftliche Erfolgsbestätigung + Case-Study-Permission.
- Tag 90: Vertragsverlängerung (2.500 € → 5.990 € + Wartungsvertrag).

#### 7.2 — Case-Study-Schreiben (S)

- Format: 4-Seiten-PDF + 3-Min-Video.
- Inhalt: Persona, Problem, Lösung, Resultat (Stunden gespart, Compliance-Sicherheit, ROI).
- Permission vom Kunden + Logo-Lizenz (oft nur „eine kleine Kanzlei in München" wenn Kunde nicht namentlich erscheinen will).

#### 7.3 — Referral-Programm (S)

- Bestehender Pilot empfiehlt: 500 € Bonus (oder 1 Monat kostenlose Wartung) bei Conversion.

#### 7.4 — Mini-Systemhaus-Channel-Pilot (M)

- 5–10 regionale IT-Systemhäuser mit 5–15 MA in DACH identifizieren (über IHK, ALSO-Partner-Liste).
- Channel-Deal: 15–20 % Marge auf Hardware + 25 % Marge auf Wartungs-Recurring.
- Onboarding-Pack: Demo-Box + Pitch-Deck + Co-Branding-Material.
- **Akzeptanz:** Mindestens 2 Systemhaus-Partner unterzeichnet.

#### 7.5 — Pricing-Validierung (S)

- Nach 3 Pilots: WTP-Daten sammeln. „Hätten Sie auch 7.000 € bezahlt?"
- Pricing-Anpassung wenn signifikant.

### Definition of Done — Phase 7

- 1 zahlender Pilot live (Tag 90).
- 1 konvertierter Kunde (Tag 180).
- Erste Case-Study fertig.
- 2 Systemhaus-Partner.
- Referral-Programm aktiv.

**Effort gesamt:** Recurring (2 Tage/Woche Pilot-Pflege).

**Risk if skipped:** Kein PoC, kein Vertriebs-Cycle, kein Vertrauen.

---

## Phase 8 — Skalierung & Multi-Box-Operations (Monate 7-12)

**Goal:** 5–10 zahlende Kunden. Operations skalieren ohne dass Solo-Dev kollabiert.

### Tasks

#### 8.1 — Fleet-Management-Lite (L)

**Problem (Self-Healing-Audit):** Mit 50 Boxen ist jede ein Inseln. Kein Überblick.

**Fix:**

- Opt-in Telemetrie-Dienst (Kunden-Consent in Setup-Wizard).
- Box hashed Machine-ID + sendet 1× pro Tag Health-Summary (CPU, Disk, Cert-Expiry, Crash-Count).
- Cloudflare-Worker-API + minimales Dashboard für Arasul-Operator-View.
- Kein Daten-Inhalt — nur Health-Metriken.

**Effort:** L (1 Woche). **Akzeptanz:** 5+ Boxen sichtbar, Alert wenn 1 down.

#### 8.2 — Update-Pipelines (M)

- USB-Update-Path stabil (Phase 2.6 hat Rollback).
- Online-Update via signed Tauros / Pull-Mechanismus für Boxen mit Internet.
- Beta-Channel für 1–2 Kunden („first to test new features in exchange for €0 wartung").

#### 8.3 — AIC4-Self-Mapping & ISO-27001-Vorbereitung (XL — extern)

**Problem (Compliance-Audit):** Ohne Cert wird Banken/Versicherungs-Sale unmöglich.

**Fix:**

- AIC4-Self-Mapping-Doku (Q3 2026, 5–10k € Beratung).
- ISO-27001-Vorbereitung (Q4 2026), Audit-Termin Q1 2027.
- BMWK-AI-Sandbox-Bewerbung (kostenlos, Bußgeld-Schutz!) — Q3 2026.

**Effort:** XL (extern, ~25k € Budget). **Akzeptanz:** AIC4-Mapping public dokumentiert, ISO-Audit gebucht.

#### 8.4 — Lite-Tier (€3.990) launchen (M)

- Jetson Orin NX 16GB statt AGX.
- Reduzierte Modell-Größe (kein 30B-Modell).
- Klare Use-Case-Beschränkung.
- Erst nach 10+ verkauften Standard-Tier-Boxen.

#### 8.5 — Pro-Tier-SLA-Service (M)

- Premium-Wartung mit 4h-Reaktions-Onsite-Service in 100km um Kunde.
- Outsourcing: Mini-Systemhaus-Channel als Vor-Ort-Servicepartner.

### Definition of Done — Phase 8

- 10 zahlende Kunden.
- Fleet-Dashboard mit ≥ 5 Boxen.
- AIC4-Self-Mapping + ISO-Audit gebucht.
- Lite + Pro-Tier launched.
- 3+ Systemhaus-Partner.

**Risk if skipped:** Plateau bei 2–3 Kunden. Kein Skalierungs-Pfad.

---

# Teil C — Anhänge

## Anhang A — Persona-Briefings

### Persona 1 — „Dr. Weber, Allgemeinmediziner, 4-Praxen-Verbund, 18 MA" ⭐⭐⭐⭐⭐

**Realität:**

- 4 Praxen, 18 Mitarbeiter (4 Ärzte, 14 MFA/Reception/Office).
- Verwaltungs-Software: Medistar oder Turbomed. KIM-Anschluss vorhanden.
- Pain heute: MFA tippen Arztbriefe. Manche nutzen ChatGPT als „Schnell-Korrektur" → Schatten-KI mit Patientendaten.
- §203 StGB = persönliches Strafrechts-Risiko des Arzt-Inhabers.
- KBV PraxisWissen Mai 2025 hat das explizit thematisiert.

**Was Arasul löst:**

- Lokale KI-Diktat-Korrektur, lokale Frage-an-Patientenakten („was war Letzter Termin von Frau Schmidt?"), automatisierte Termin-Bestätigungen via n8n.
- Compliance-Argument: KBV-konform, §203-sicher.

**Was Arasul NICHT macht (kommunizieren!):**

- KEINE Diagnose-Empfehlung. KEIN MDR-Medizinprodukt. „Assistenz, nie Entscheider" (BÄK-Position).

**Pitch-Hook:**

> „Ihre Mitarbeiter nutzen heute heimlich ChatGPT. Das ist ein §203-StGB-Strafrechtsrisiko für Sie. Arasul ist die lokale Alternative — gleicher Komfort, ohne Daten-Abfluss."

**Pricing-Sensitivität:** Niedrig. PVS-Modul kostet vergleichbar. 5–8k €+ akzeptabel.

**Sales-Cycle:** 6–10 Wochen. Inhaber entscheidet.

### Persona 2 — „RAin Müller, Wirtschaftskanzlei, 12 MA" ⭐⭐⭐⭐

**Realität:**

- 12 MA (4 Anwälte, 8 Sekretärinnen/Rechtsfachangestellte).
- Software: advoware, AnNoText, RA-MICRO oder Kanzlei-eigene Lösung.
- Pain: ChatGPT verboten per Mandantenvertrag, M365-Copilot braucht §203-Vereinbarung, die Microsoft nicht in voller Form anbietet.

**Was Arasul löst:**

- Vertragsanalyse („Welche Klauseln in NDA Müller GmbH sind ungewöhnlich?")
- Mandanten-Akten-Suche („Was haben wir letztes Jahr zur Steuerung angeboten?")
- Diktat-Korrektur lokal.
- n8n-Workflows: Mandanten-Anfrage → Auto-Triage.

**Pitch-Hook:**

> „BRAK-Leitfaden 12/2024 + Anwaltsgeheimnis = ChatGPT geht nicht. Aber Mandanten erwarten KI-Tempo. Arasul ist die On-Prem-Antwort — 5.990 € einmal, danach läuft sie 24 Monate ohne IT."

**Pricing-Sensitivität:** Mittel. Kanzlei-Software-Spend liegt bei €11k+/Jahr für 12 MA → 5–8k € +€990 Wartung passt.

**Sales-Cycle:** 8–14 Wochen. Partner-Versammlung entscheidet.

### Persona 3 — „StB Schäfer, Mittelständische Steuerkanzlei, 25 MA" ⭐⭐⭐

**Realität:**

- 25 MA, DATEV-Vollkunde (vorerst).
- DATEV bietet seit Feb 2026 Copilot gratis für Mitglieder → Schäfer hat „kostenlose KI" in der Hand.
- Pain: DATEV pivots cloud-only. Manche Partner wollen sovereign bleiben.

**Was Arasul leistet vs. DATEV Copilot:**

- Eigene Mandanten-Daten in lokaler RAG (DATEV Copilot ist generisch).
- n8n-Automation (DATEV hat keine Workflow-Engine).
- Sovereign (DATEV Copilot ist Cloud, wenn auch Schwarz-Cloud).

**Pitch-Hook:**

> „DATEV Copilot ist gratis — aber er sieht Ihre Mandantenakten nicht. Arasul tut's — und automatisiert Ihre Workflows on top. 5.990 € einmal."

**Pricing-Sensitivität:** Hoch. Kunde prüft TCO genau.

**Sales-Cycle:** 12+ Wochen.

### Persona 4 — „IT-Leiter Maier, Maschinenbau-Mittelständler, 80 MA" ⭐⭐

**Realität:** Schatten-KI auf Konstruktionsplänen, IP-Risiko. Spendet schon 80k+ ERP — 8k Box ist im Budget.

**Pitch-Hook:** „IP-Schutz: Konstruktionsdaten verlassen Ihr Haus nicht."

**Sales-Cycle:** 6+ Monate. **Nicht im Pilot-Hunt 2026.** 2027-Item.

---

## Anhang B — Pricing-Architektur

### Tiers

| Tier                        | HW                   | Preis (einmalig) | Wartung/Jahr | Bruttomarge HW | 5J-LTV     | Launch  |
| --------------------------- | -------------------- | ---------------- | ------------ | -------------- | ---------- | ------- |
| **Lite** (Phase 8)          | Jetson Orin NX 16GB  | €3.990           | €590         | 50 %           | €5.950     | Q1 2027 |
| **Standard** (Hauptangebot) | Jetson AGX Orin 64GB | **€5.990**       | **€990**     | **47 %**       | **€9.930** | Q2 2026 |
| **Pro** (mit SLA)           | Jetson AGX Orin 64GB | €7.990           | €1.490       | 61 %           | €13.950    | Q3 2026 |

### CoGS-Realität (10 Boxen/Quartal)

| Position                         | Netto-EK   |
| -------------------------------- | ---------- |
| Jetson AGX Orin 64GB Dev Kit     | €2.150     |
| NVMe SSD 2TB Enterprise          | €220       |
| Custom Aluminium-Gehäuse         | €180       |
| Industrie-PSU 90W medical-grade  | €45        |
| Lüfter + Heatsink                | €35        |
| Verpackung                       | €25        |
| Beigaben (USB, Print, AVV-Mappe) | €20        |
| Logistik + Schwund               | €60        |
| Pre-Image + QA-Burn-In (4h)      | €320       |
| Gewährleistungs-Rückstellung 3 % | €90        |
| **Total CoGS**                   | **€3.145** |

### 90-Tage-Pilot

- Preis: **€2.500 netto**, voll anrechenbar bei Standard-Kauf bis Tag 120.
- Inkludiert: Vor-Ort-Setup (4h), wöchentliche 30-Min-Calls, AVV-Vereinbarung.
- Bei Tag 90 ohne Kauf: Box geht zurück auf Kunden-Kosten.

### Wartungs-Inhalte (Standard, €990/Jahr)

- Security-Updates monatlich.
- LLM-Modell-Updates quartalsweise.
- Remote-Support 8/5 (Mo–Fr 9–17 Uhr).
- Reaktions-SLA: 24h Bestätigung, 5 Werktage Lösungs-Ziel.
- Jährlicher Health-Check ab Jahr 2.

### Pro-SLA (€1.490/Jahr)

- Wartungs-Inhalte plus:
- Reaktions-SLA: 4h Bestätigung.
- Vor-Ort-Service nächster Werktag innerhalb 100km.
- Quartalsweises Update-Review mit Customer.
- Dedizierter Slack-/Teams-Channel.

### Dual-Use-Steuer-Argument

§6 EStG: Sofortabschreibung digitaler Wirtschaftsgüter (1-Jahres-Nutzungsdauer seit 2021) PLUS 30 % degressive Sonderabschreibung seit Juli 2025 → starkes Verkaufsargument bei B2B.

---

## Anhang C — Compliance-Doku-Pflichtliste

Liste aller Dokumente, die in Phase 1 erstellt werden müssen. Datei-Pfade unter `docs/legal/`.

| Dokument                      | Datei                                 | Zweck                                                  | Priorität           |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------ | ------------------- |
| AVV-Template                  | `AVV_TEMPLATE.md`                     | Art. 28 DSGVO Auftragsverarbeitung                     | P0                  |
| TOM-Dokument                  | `TOMs.md`                             | Art. 32 DSGVO technische/organisatorische Maßnahmen    | P0                  |
| DSFA-Vorlage                  | `DSFA_VORLAGE.md`                     | Art. 35 DSGVO Datenschutz-Folgenabschätzung            | P0                  |
| AI-Act-Selbsterklärung        | `AI_ACT_SELF_DECLARATION.md`          | Nicht-Hochrisiko-Mapping zu Annex III                  | P0                  |
| AGB                           | `AGB_TEMPLATE.md`                     | Standard-Geschäftsbedingungen B2B                      | P0 (Anwalt-Pflicht) |
| Wartungsvertrag               | `WARTUNGSVERTRAG.md`                  | Recurring Wartungs-Vertrag                             | P0                  |
| SLA-Standard                  | `SLA_STANDARD.md`                     | Service-Level-Agreement                                | P0                  |
| Datenschutzerklärung-Template | `DATENSCHUTZERKLAERUNG.md`            | Customer übernimmt für eigene Außenkommunikation       | P1                  |
| AI-Literacy-Modul             | `AI_LITERACY_MODUL.pdf` (auch In-App) | Schulungsmaterial nach Art. 4 AI-Act                   | P0                  |
| BRAK-Leitfaden-Mapping        | `BRAK_MAPPING.md`                     | 1-Pager wie Arasul den BRAK-Leitfaden Dez 2024 umsetzt | P1                  |
| BÄK-Mapping                   | `BAEK_MAPPING.md`                     | 1-Pager Arzt-Persona                                   | P1                  |
| BStBK-Mapping                 | `BSTBK_MAPPING.md`                    | 1-Pager Steuerberater-Persona                          | P2                  |
| DSK-RAG-OH-Mapping            | `DSK_RAG_OH_MAPPING.md`               | DSK Orientierungshilfe Okt 2025 Umsetzung              | P1                  |
| Pilot-Vertrag                 | `PILOT_AGREEMENT.md`                  | 90-Tage-Pilot-Vorlage                                  | P0                  |
| AIC4-Self-Mapping (Phase 8)   | `AIC4_SELF_MAPPING.md`                | BSI AIC4-Kriterien-Mapping                             | P2                  |
| MDR-Abgrenzung                | `MDR_ABGRENZUNG.md`                   | Klarstellung Arasul ≠ Medizinprodukt                   | P1 (für Arzt-Sale)  |

---

## Anhang D — Telegram-Strategie und „was stattdessen"

### Entscheidung

**Telegram bleibt im Produkt** (existierender Code, einige Kunden möchten es). **Aber:**

1. **Default-OFF in Setup-Wizard.** Aktivierung nur durch Admin nach Disclaimer.
2. **Disclaimer-Modal** vor jeder Bot-Aktivierung (siehe Phase 1.6).
3. **Niemals Verkaufsargument** für Persona 1 (Arzt) und Persona 2 (Anwalt). Bei Steuerberater (Persona 3) und Maschinenbau (Persona 4) optional erwähnen.
4. **Branch `feat/telegram-bot-overhaul`** wird abgeschlossen mit:
   - Phase 0 (Bug-Fix) ✓ bereits done.
   - Phase 5 (Rate-Limiting) ✓ bereits live.
   - Phase 6 (UI-Live-Status) → fertig in Phase 3 dieses Plans.
   - **NICHT** geshippt: Phase 1 (Registry), 2 (grammY), 3 (Streaming), 4 (Reminders), 7 (Token Budget). Über-Engineering.

### Roadmap-Alternativen

| Channel                                   | Wann                | Persona                        | Status  |
| ----------------------------------------- | ------------------- | ------------------------------ | ------- |
| **Telegram**                              | jetzt (Default-Off) | StB, Maschinenbau, Tech-Affine | live    |
| **WhatsApp Business API**                 | Q4 2026             | Anwalt, Arzt (E2E)             | Roadmap |
| **On-Prem Matrix** (Synapse oder Conduit) | 2027                | Hochregulierte Kunden          | Roadmap |
| **SMS-Gateway** (mit DACH-Carrier)        | Q2 2027             | Premium-Tier                   | Roadmap |

### Zukünftiger Pivot

Wenn 5+ Kunden WhatsApp nachfragen → priorisieren. WhatsApp Business API hat E2E + EU-Server-Region → DSGVO-tolerant.

---

## Anhang E — Anti-Backlog (was wir NICHT bauen)

Klare Liste, was Arasul **bewusst nicht macht**, um Solo-Dev-Fokus zu wahren.

| NICHT                                            | Warum nicht                                                  | Wann revisited                     |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| Voice-Input/Output                               | Solid Whisper-On-Prem ist erst 2026-Feature. Erstmal Tippen. | 2027 wenn Kunde fragt              |
| Video-Generation                                 | Out of scope. Nicht-Mittelstand-Use-Case.                    | nie                                |
| Multi-Box-Federation (Arasul1 + Arasul2 sync'en) | Komplex, kein klarer Use-Case.                               | Phase 8+ wenn Kunde explizit fragt |
| Eigenes Kanzlei-CRM                              | DATEV/advoware/AnNoText-Markt. Anti-Pattern.                 | nie                                |
| Eigenes ERP / Buchhaltung                        | Anti-Pattern, Datev-Wettbewerb.                              | nie                                |
| Multi-Tenant-SaaS (1 Box, viele Firmen)          | Schema-Refactor. Anti-Strategy. Single-Box-Single-Customer.  | nie                                |
| Mobile-Native-App (iOS/Android)                  | Web-PWA reicht. Solo-Dev.                                    | 2027 wenn Bedarf                   |
| eigenes Foundation-Modell                        | Aleph-Alpha-Domain. Anti-Pattern.                            | nie                                |
| Kubernetes-Migration                             | Docker-Compose reicht. Komplexitäts-Killer.                  | nie                                |
| Eigenes Monitoring-SaaS (à la Datadog)           | Loki + Grafana reicht. Solo-Dev.                             | nie                                |
| Voice-Chat (Telegram-Voice)                      | Out-of-scope.                                                | 2027+                              |
| Reminders / Calendar-AI in Telegram              | Telegram-Plan war over-engineered.                           | nie (in Telegram)                  |
| KI-generierte n8n-Workflows                      | nice-to-have, Phase 8+.                                      | 2027                               |
| Eigene LLM-Fine-Tuning-Pipeline                  | Domain-Adaptation reicht via Prompt + RAG.                   | nie                                |
| 70B+ Modelle                                     | Jetson AGX Orin 64GB packt das nicht.                        | nie auf aktueller HW               |

---

## Anhang F — Risiken & Watch-Points

### Top-Risiken

| Risiko                                                          | Wahrscheinlichkeit | Impact    | Mitigation                                                                                                             |
| --------------------------------------------------------------- | ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Copilot DE-Region** dominiert SMB-Mindshare         | hoch               | hoch      | Differenzierer schärfen: §203 + n8n + 24-Monat-autonom; nicht gegen Copilot positionieren, sondern gegen „Schatten-KI" |
| **DATEV Copilot tötet Steuerberater-Segment**                   | hoch               | mittel    | Persona-3 deprioritisiert, fokus auf Persona 1+2                                                                       |
| **Aleph Alpha + Cohere** gewinnt Kanzlei-Großaufträge           | mittel             | mittel    | Mid-Tier (10–25 MA Kanzlei) ist nicht Aleph-Target. Lower-Mid-Market sweet spot                                        |
| **AIVA Bundle** gewinnt durch NVIDIA-Halo                       | mittel             | hoch      | Preis-unterbieten + Software-Tiefe-Differenzierung                                                                     |
| **AI-Act-Hochrisiko-Umklassifizierung** trifft Kanzlei-Use-Case | niedrig            | hoch      | Self-Erklärung Annex-III-Negativ-Mapping pflegen, BMWK-Sandbox-Teilnahme                                               |
| **Solo-Dev-Bandbreite** kollabiert mit ≥ 3 Pilots               | hoch               | hoch      | Mini-Systemhaus-Channel als Service-Outsourcing für Vor-Ort                                                            |
| **Hardware-Verfügbarkeit** Jetson AGX Orin verschoben           | mittel             | hoch      | Lite-Tier mit Orin NX als Fallback. Pre-Order 20 Stück bei 2 Distributoren                                             |
| **NAND-Krise (SSD-Preise +40 %)**                               | hoch               | mittel    | CoGS defensiv kalkulieren, Pricing nicht zu eng                                                                        |
| **DSB einer Kanzlei lehnt aus formalen Gründen ab**             | mittel             | hoch      | Compliance-Doku-Pflichtliste (Anhang C) komplett, anwaltlich reviewt                                                   |
| **Erste Box bricht im Demo**                                    | niedrig            | sehr hoch | Tier-1-Cloud-Demo + Tier-2-Versand-Box (Loaner-Stock)                                                                  |

### Watch-Points (regelmäßig prüfen)

- [ ] **Quarterly:** AIVA-Bundle-Preis (verändert sich er auf €5–7k → kommt unser Pricing unter Druck?)
- [ ] **Quarterly:** Aleph-Alpha-Cohere-Merger-Status (Bundeskartellamt-Entscheidung)
- [ ] **Monthly:** Microsoft-Copilot-DE-Region-Rollout-Stand (HBDI-Bewertung verändert sich?)
- [ ] **Monthly:** DATEV-Copilot-Updates (welche Features kommen, sind wir noch differenziert?)
- [ ] **Quarterly:** EU-AI-Act-Implementation-Updates (BSI-Guidance, AI-Office-Decisions)
- [ ] **Bi-weekly:** LinkedIn-Outreach-Conversion-Rate (sinkt? Hook-Variante anpassen)
- [ ] **Quarterly:** Pilot-Konversions-Rate (< 50 % Tag-90 → Pricing/Pitch falsch)

### Eskalations-Trigger

- Wenn nach Phase 6 (Woche 16) **0 Demo-Calls** zustande kamen → Pitch komplett neu.
- Wenn nach Phase 7 (Woche 28) **0 zahlende Kunden** → Pricing reduzieren auf €3.990 oder Pivot zu Software-Only-License.
- Wenn nach Monat 9 **< 3 Kunden** → Strategie-Review, ggf. Vertical-Spezialisierung (nur Anwalt) oder M&A.

---

## Schlusswort

Dieser Plan ist **84 Engineering-Wochen Arbeit auf 28 Wochen Solo-Dev verdichtet**. Das geht nur, wenn:

1. **Phase 1 nicht verhandelt wird.** Multi-User-Iso + Compliance-Doku sind nicht-verhandelbar.
2. **Phase 6 parallel zu Phase 3 läuft.** Outreach beginnt in Woche 6, nicht in Woche 14.
3. **Anti-Backlog (Anhang E) eingehalten wird.** Jedes „nice-to-have" ist ein Schuss ins Knie.
4. **Pricing ab Tag 1 €5.990** ist. Kein Free Pilot. Kein €2.990-Discount. Wer billiger gehen muss, baut nicht für DACH-Mittelstand.
5. **Telegram strategisch gehändelt wird** (Anhang D). Default-Off + Disclaimer ist Pflicht.
6. **2-Mai-2026 ist der Inventur-Anker.** Ab da: 8 Wochen Compliance + 12 Wochen Tiefe + 8 Wochen Pilot. Tag 180 = Q4 2026 = dStBK + Anwaltstag-Nachglow + AI-Act-Enforcement-Welle.

**Wenn am Tag 180 ein zahlender Kunde existiert + 1 Case-Study + 200 LinkedIn-Touches + 1 Trade-Fair-Stand → ist das Produkt validiert.** Dann beginnt Skalierung.

Wenn nicht — siehe Eskalations-Trigger oben.

---

_Master Plan synthetisiert aus 18-Sub-Agent-Audit (2026-05-02). Aktualisierungen in `docs/ROADMAP.md` referenzieren._
