# Bilder vom Orin: Felder 44 px, Leiste ohne Umbruch, scharfe Palette (J42, M7), 21.11.2026

Aufgenommen nach dem Deploy von #968 mit
`scripts/test/felder-leiste-palette-bilder.mjs`, angemeldet als Probe-Konto des
Administrators, bei 390 px (Handy, grober Zeiger) und 1440 px (Maus), hell und
dunkel. Eine Probe-App mit dem Namen eines Kunden ist auf allen Bildern
ausgeblendet; die Seite Personen wird gemessen, aber nicht fotografiert, weil
dort echte Namen und die Freigaben je App stehen.

Messung: **42 grün, 0 rot.**

| Bild                      | Was                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `felder-profil`           | Eingabefelder: 390 px je 44 px hoch, 1440 px je 32 px                                                            |
| `felder-erscheinungsbild` | Radio und Schalter behalten ihre Größe, bei grobem Zeiger mit unsichtbarer Trefferfläche von 44 px (gemessen 47) |
| `leiste-langer-name`      | 390 px, „Abschluss-Unterlagen“ gewählt: der Name passt nicht in eine Zeile, also nur das Symbol auf der Fläche   |
| `palette-ab`              | „Ab“ getippt: nur Abschluss-Unterlagen (live und Test), nicht mehr Belege                                        |

Was gemessen wurde, je Theme:

- Felder bei 390 px: Profil 4 Eingaben, Passwort 3 Eingaben, Daten 3 Auswahlfelder, alle 44 px; Checkbox, Radio und Schalter auf Erscheinungsbild, Personen und Daten mit Trefferfläche 47 px. Bei 1440 px alle Felder 32 px.
- Leiste bei 390 px: jede App der Leiste einmal gewählt. „Abschluss-Unterlagen“ zeigt nur das Symbol, „Probe Cockpit“ und „Belege“ den Namen in einer Zeile; unter „Mehr“ steht „Einstellungen“ in einer Zeile. Keine Leiste höher als 56 px.
- Palette bei 390 px (über „Mehr“ › „Springen zu …“) und 1440 px (Strg+K): „Ab“ findet Abschluss-Unterlagen und nicht Belege.
