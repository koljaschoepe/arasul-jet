# n8n-Lizenzlage für die Arasul-Appliance

> **Status: UNGEKLÄRT — PFLICHT-GATE vor Verkaufsstart.**
> Vor dem ersten kommerziellen Verkauf einer Arasul-Appliance mit
> vorinstalliertem n8n MUSS eine schriftliche Klärung durch n8n
> (license@n8n.io) vorliegen. Der versandfertige Anfrage-Entwurf steht in
> [§6](#6-e-mail-entwurf-an-licensen8nio). Ohne Antwort bzw. bei negativer
> Antwort: n8n vor Auslieferung deaktivieren (App-Store-Modell, Kunde
> installiert selbst) oder OEM-Lizenz verhandeln.

Zuletzt geprüft: Juli 2026 · n8n-Version auf der Appliance: 2.29.10

---

## 1. Die Lizenz: Sustainable Use License (SUL)

n8n steht (Haupt-Codebase, „fair-code") unter der **Sustainable Use
License**. Kernklausel (sinngemäß, Wortlaut siehe
<https://github.com/n8n-io/n8n/blob/master/LICENSE.md>):

> _"You may use or modify the software only for your own internal business
> purposes or for non-commercial or personal use. You may distribute the
> software or provide it to others only if you do so free of charge for
> non-commercial purposes."_

Zusätzlich gilt für einzelne Enterprise-Features die **n8n Enterprise
License** (separater Ordner in der Codebase; auf der Appliance nicht
aktiviert).

### Was die SUL-FAQ ausdrücklich verbietet / erlaubt

Aus der offiziellen FAQ („Sustainable Use License", n8n-Doku):

- **Erlaubt:** interne Nutzung im eigenen Unternehmen (auch kommerziell
  tätiger Unternehmen), eigene interne Workflows, Consulting/Support-
  Dienstleistungen rund um n8n.
- **Verboten (ohne Zusatzvereinbarung):**
  - n8n zu **hosten und Dritten gegen Geld** als Produkt/Feature
    anzubieten (kommerzielle Distribution),
  - **White-Labeling** / Einbetten von n8n in ein eigenes kommerzielles
    Produkt, bei dem n8n als Fremdmarke verschwindet,
  - Weitervertrieb gegen Entgelt.

## 2. Warum die Appliance ein Grenzfall ist

Arasul verkauft **Hardware (Jetson) + vorinstallierte Software** als
Plug-&-Play-Appliance. n8n ist darauf vorinstalliert und im Dashboard als
Tab („Automationen") erreichbar. Das berührt die SUL in zwei Punkten:

| Aspekt                                                             | Bewertung                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| n8n wird **mitgeliefert** (auf dem Gerät vorinstalliert)           | Distribution — nach SUL nur „free of charge for non-commercial purposes" zulässig. Dass der Kunde für das Gesamtpaket zahlt, macht es zum Graubereich, selbst wenn n8n selbst nicht separat bepreist wird.                                                                                                             |
| n8n läuft **auf dem Gerät des Kunden**, betrieben vom Kunden       | Spricht FÜR uns: es ist kein Hosting-Angebot durch Arasul; der Kunde betreibt seine eigene Instanz („internal business purposes" des Kunden).                                                                                                                                                                          |
| n8n erscheint als **Tab im Arasul-Dashboard** (same-origin-iframe) | Grenze zum Embedding. Entscheidend: n8n bleibt sichtbar als n8n gebrandet (eigener Login, eigenes UI, keine Umbenennung) — KEIN White-Labeling. n8n vermarktet „Embed" allerdings als eigenes kommerzielles Angebot (<https://n8n.io/embed/>), d. h. n8n selbst betrachtet eingebettete Szenarien als lizenzpflichtig. |
| **OEM-/Embed-Lizenz**                                              | Drittquellen nennen ~50.000 USD/Jahr Einstiegspreis für n8n Embed (unverifiziert; offizielle Preise nur auf Anfrage). Für eine Kleinserien-Appliance ggf. unwirtschaftlich → umso wichtiger, die Nicht-Embed-Auslegung schriftlich bestätigen zu lassen.                                                               |

### Arasul-Positionierung (die wir bestätigen lassen wollen)

1. **Der Kunde betreibt seine eigene n8n-Instanz** auf eigener Hardware,
   für eigene interne Zwecke. Arasul hostet nichts und verkauft keinen
   Zugang zu n8n als Service.
2. **n8n bleibt sichtbar als n8n gebrandet**: eigener Login-Screen, n8n-UI,
   n8n-Name. Der Dashboard-Tab ist nur ein same-origin-iframe-Fenster auf
   die Kunden-Instanz (n8ns eigenes `X-Frame-Options: sameorigin` wird
   respektiert, keine Header-Manipulation, keine CSP-Aufweichung).
3. **Kein separater Preis für n8n**: n8n wird nicht bepreist, beworben wird
   „Automationen mit n8n (Open-Source-Workflow-Engine)".
4. **Alternativ-Modell als Fallback** (falls n8n die Vorinstallation
   ablehnt): n8n wird NICHT vorinstalliert, sondern der Kunde installiert
   es mit einem Klick selbst über den Arasul-App-Store (Arasul liefert nur
   die Compose-Definition; der Pull kommt von Docker Hub). Das entspricht
   dem heutigen App-Store-Modell (siehe `docs/integrations/N8N.md`, Kopf).

## 3. Was NICHT strittig ist

- Die interne Nutzung durch den Endkunden ist von der SUL klar gedeckt.
- Community-Nodes/Custom-Nodes von Arasul (`services/n8n/custom-nodes/`)
  sind eigene Werke und unproblematisch.
- Die Telemetrie-Abschaltung (`N8N_DIAGNOSTICS_ENABLED=false` etc.) ist
  lizenzrechtlich unbedenklich (keine Copyleft-/Attributionsklausel
  verletzt).

## 4. Pflicht-Gate vor Verkaufsstart

- [ ] E-Mail aus §6 an license@n8n.io versandt (Datum: **\_\_\_\_**)
- [ ] Schriftliche Antwort von n8n erhalten und in `docs/legal/` abgelegt
- [ ] Ergebnis in Roadmap-Gate eingetragen (docs/plans/ROADMAP.html)
- [ ] Bei negativer/ausbleibender Antwort: Fallback-Entscheidung
      dokumentiert (App-Store-Selbstinstallation ODER OEM-Verhandlung
      ODER n8n von der Appliance entfernen)

**Bis alle Kästchen abgehakt sind, darf keine Appliance mit
vorinstalliertem n8n kommerziell ausgeliefert werden.**

## 5. Quellenlage

| Quelle                                                 | Inhalt                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| <https://github.com/n8n-io/n8n/blob/master/LICENSE.md> | SUL-Volltext + Enterprise-License-Hinweis |
| <https://docs.n8n.io/sustainable-use-license/>         | offizielle FAQ (erlaubt/verboten)         |
| <https://n8n.io/embed/>                                | kommerzielles Embed-/OEM-Angebot          |
| license@n8n.io                                         | offizieller Klärungsweg für Lizenzfragen  |
| Drittquellen (Blogs/Foren, unverifiziert)              | Embed ab ~50k USD/Jahr                    |

## 6. E-Mail-Entwurf an license@n8n.io

Versandfertig; vor dem Senden Firmierung/Signatur ergänzen.

```text
To: license@n8n.io
Subject: License clarification — n8n pre-installed on an on-premise
         edge appliance (Sustainable Use License)

Dear n8n licensing team,

we are preparing to sell an on-premise edge-AI appliance ("Arasul", built
on NVIDIA Jetson hardware) to business customers, and we would like to
clarify whether our intended use of n8n is covered by the Sustainable Use
License before we start selling. We want to do this right.

Our setup, precisely:

1. The appliance is a physical device the customer buys once and runs
   entirely on their own premises. Nothing is hosted by us; the device is
   designed for fully local, GDPR-compliant operation without cloud
   dependencies.
2. n8n (community edition, currently pinned to 2.29.10) is pre-installed
   on the device as one of several open-source components (alongside
   PostgreSQL, MinIO, Ollama, etc.). Each customer device runs its own,
   single-tenant n8n instance, used exclusively for that customer's own
   internal workflows.
3. We do not charge for n8n separately, we do not offer n8n as a hosted
   service, and we do not resell access to it. The customer administers
   their own n8n user accounts on their own device.
4. n8n remains visibly n8n: it keeps its own login, its own UI and its
   name. Our administration dashboard shows the customer's n8n editor in
   a browser tab via a same-origin iframe (respecting n8n's
   X-Frame-Options: sameorigin — we do not strip or modify headers), with
   a visible note that this is n8n. There is no white-labeling and no
   rebranding.
5. We disable telemetry (N8N_DIAGNOSTICS_ENABLED=false and related flags)
   for GDPR reasons and apply security hardening (external task runners,
   SSRF protection, restricted file access). We ship two example workflow
   templates that we authored ourselves.
6. We may provide paid support/maintenance for the appliance as a whole
   (OS updates, security patches). Updating the n8n container to newer
   upstream versions would be part of that maintenance.

Our questions:

a) Is pre-installing the n8n community edition on a customer-owned,
   customer-operated appliance, as described above, permitted under the
   Sustainable Use License — given that n8n itself is not separately
   charged for and not white-labeled?
b) If not: which of the following would be acceptable without an embed/
   OEM agreement? (i) shipping only a one-click installer that pulls the
   official n8nio/n8n image from Docker Hub on the customer's device,
   (ii) documenting a manual installation path for the customer.
c) Does presenting the customer's own n8n instance inside our dashboard
   via a same-origin iframe (clearly branded as n8n, own login) change
   the assessment in a)?
d) If an embed/OEM license is required for our scenario: what are the
   conditions and pricing for a small-volume hardware appliance vendor
   (initial volumes in the tens of devices per year, not SaaS)?

We are happy to provide screenshots, our compose configuration, or a demo
device. Thank you for your time — we would rather clarify this now than
build on a wrong assumption.

Kind regards,
[Name]
[Firma, Anschrift]
[E-Mail, Telefon]
```

---

_Verwandte Dokumente:_ [`DATENSCHUTZ_N8N.md`](DATENSCHUTZ_N8N.md) ·
[`DRITTLAND_KONNEKTOREN.md`](DRITTLAND_KONNEKTOREN.md) ·
[`../integrations/N8N.md`](../integrations/N8N.md) ·
[`../integrations/N8N_AGENTS.md`](../integrations/N8N_AGENTS.md)
