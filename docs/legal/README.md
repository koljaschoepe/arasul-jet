# Legal — DSGVO-Vorlagen

> **Status:** DRAFT — Anwaltliche Prüfung vor kommerzieller GA erforderlich.

Dieser Ordner enthält Datenschutz- und Vertrags-**Vorlagen** für den Verkauf
der Arasul-Appliance an deutsche B2B-Kunden. Sie sind so geschrieben, dass ein
Anwalt sie polieren kann, nicht von null anfangen muss — sie sind **kein
juristisch geprüfter Vertragstext**.

| Datei                      | Zweck                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AVV_TEMPLATE.md`          | Auftragsverarbeitungsvertrag (AVV) Kunde ↔ Arasul nach Art. 28 DSGVO.                                                                  |
| `DATENSCHUTZ_N8N.md`       | Datenschutz-Hinweise zur n8n-Komponente; vom Kunden in seine eigene Datenschutzerklärung übernehmbar.                                  |
| `DRITTLAND_KONNEKTOREN.md` | Liste typischer SaaS-Konnektoren mit Drittland-Hinweis und SCC/TIA-Status.                                                             |
| `N8N_LIZENZ.md`            | n8n Sustainable-Use-License: Bewertung der Appliance-Konstellation, Pflicht-Gate vor Verkaufsstart, Anfrage-Entwurf an license@n8n.io. |

## Vor dem Roll-out muss

1. Ein Datenschutz-Anwalt die drei Dokumente prüfen und auf den konkreten
   Lieferumfang (Hardware, Cloud-Backups, Remote-Wartung) anpassen.
2. Eine **Datenschutz-Folgenabschätzung (DSFA, Art. 35 DSGVO)** vorliegen,
   weil die Appliance KI-Inferenz auf personenbezogenen Daten durchführt
   (hohes Risiko nach DSK-Liste).
3. Der Kunde mit jedem genutzten Drittland-Anbieter (z.B. Microsoft, Google)
   selbständig einen AVV abschließen — Arasul ist nicht Vertragspartner für
   diese Konnektoren, sondern nur die Plattform, auf der der Kunde sie nutzt.
