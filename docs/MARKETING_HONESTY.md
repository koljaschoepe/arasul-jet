# Marketing-Sprache: Autonomer Betrieb (Phase 5.7)

> **Internal — gilt für alle kundenorientierten Texte**: Landing-Page,
> Pitch-Decks, Verträge, Demo-Materialien, README-Banner. Stand: 2026-05-03.

---

## Verbindliche Formulierung

**Statt:**

- "5 Jahre autonomer Betrieb"
- "Plug & Play für 5 Jahre"
- "5-Jahres-Autonomie"

**Verwende:**

- **"24 Monate autonomer Betrieb + 2× jährlicher Wartungs-Check ab Jahr 3"**
- "Vollständig vom Wartungsvertrag abgedeckt — keine zusätzlichen Kosten."

## Begründung

Self-Healing-Audit (April 2026) hat gezeigt: Aktueller Code-Stand erlaubt
realistisch ~18-24 Monate ohne Eingriff (Cert-Expiry, Disk-Wear, OS-Updates).
Eine 5-Jahre-Aussage ist daher **Versprechen, das wir nicht halten können**.

Die ehrliche Aussage gewinnt Vertrauen — und der Wartungsvertrag deckt
das ab, ohne zusätzliche Customer-Kosten.

## Erwähnung im Wartungsvertrag

Aus `docs/legal/WARTUNGSVERTRAG.md` § 2 (Leistungen):

> Inkludiert ab Jahr 3: 2× jährlich Wartungs-Check (Remote oder vor Ort).
> Beinhaltet: OS-Updates, Cert-Erneuerung, NVMe-Wear-Check, Backup-Validierung.

## Anwendung

| Kontext            | Empfehlung                                                                   |
| ------------------ | ---------------------------------------------------------------------------- |
| Landing-Page Hero  | "DSGVO-konforme KI ohne Cloud-Abo. 24 Monate autonom + Wartung."             |
| Pitch-Deck Slide 5 | "Autonomer Betrieb 24 Monate · Wartung ab Jahr 3 · 5-Jahres-TCO transparent" |
| README.md          | (kein 5-Jahres-Claim — bleibt sachlich)                                      |
| Vertrag            | siehe Wartungsvertrag § 2                                                    |

## Phase 5.1 (Self-Healing) Verstärkung

Cert-Expiry-Monitoring ist live (Self-Healing-Agent prüft alle Sessions,
Auto-Renewal at <60 Tage). Phase 5.2-5.4 (Disk-Eviction, Backup-Failure-
Alert, Memory-Leak-Detektion) erweitern die Autonomie schrittweise — Ziel
ist, die "24 Monate" als sicheren Marketing-Floor zu halten.

## Phase 5.5 — Support-Bundle-Export

Neu: `POST /api/support/bundle` (Settings → Support → Diagnose-Paket
exportieren). Customer kann Diagnose-Bundle ohne SSH selbst erzeugen
und an Support senden. Audit-Log-Eintrag bei jedem Export.
