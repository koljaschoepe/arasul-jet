# Anmeldung ohne Slogan — Nachweis am Orin (30.08.2026)

Auftrag `anmeldung-ohne-slogan` (M2), PR #754, Deploy-Lauf 33318018848.

Gemessen gegen `https://192.168.0.197` bei 1440 × 900 px, anonym (vor der
Anmeldung ist kein Mensch da, also kein Theme — das dunkle Bild trägt ein
aufgezwungenes `data-theme="dark"`, wie in `theme-abnahme.mjs`).

| Datei                            | Was zu sehen ist                                                       |
| -------------------------------- | ---------------------------------------------------------------------- |
| `vorher-anmeldung-hell-1440.png` | Stand vor dem Deploy: „Arasul", darunter „Eure Apps, auf eurem Gerät"  |
| `anmeldung-hell-1440.png`        | Maskottchen, „Arasul GmbH", kein Satz, Fußzeile „Betrieben mit Arasul" |
| `anmeldung-dunkel-1440.png`      | dasselbe im dunklen Theme                                              |

Aus dem Dokument gelesen: `h1` = „Arasul GmbH", „Betrieben mit Arasul"
vorhanden, „Eure Apps" nicht mehr. `GET /api/auth/needs-setup` am Gerät:
`{"needsSetup":false,"firmenname":"Arasul GmbH"}`.

Der Firmenname wurde über `PUT /api/settings/firmenname` mit einem
Wegwerf-Administrator gesetzt, der danach wieder gelöscht ist. Alle zwölf
Container waren nach dem Deploy `healthy`.
