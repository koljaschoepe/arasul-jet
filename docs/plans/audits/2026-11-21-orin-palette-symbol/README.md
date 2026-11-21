# Bilder vom Orin: Leiste mit Symbolen, Befehlspalette (J51, M7), 21.11.2026

Aufgenommen nach den Deploys von #965 und #966, angemeldet als Probe-Konto
des Administrators, bei 390 und 1440 px, hell und dunkel. Das Theme ist
nur im Browser gesetzt, nicht am Konto; deshalb fehlt das Bild der App im
hellen Rahmen (die App folgt dem Theme des Kontos). Eine Probe-App mit dem
Namen eines Kunden ist auf allen Bildern ausgeblendet.

| Bild                  | Was                                                                         |
| --------------------- | --------------------------------------------------------------------------- |
| `1-start`             | Startseite, Leiste mit unterscheidbaren Symbolen, Kacheln füllen die Breite |
| `2-mehr`              | am Handy „Mehr“ mit „Springen zu …“ obenan                                  |
| `3-palette`           | die Befehlspalette (⌘K/Strg+K, am Handy über „Mehr“)                        |
| `4-palette-gefiltert` | getippt „Ab“                                                                |
| `5-app`               | Enter öffnet die App (nur dunkel)                                           |
| `6-erscheinungsbild`  | Farbschema als drei Karten, Glas mit Schalter                               |
| `7-symbolwahl`        | Verwaltung › Apps › Symbol, Ersatzsymbol gewählt                            |

Die Symbole am Gerät: Belege bringt `receipt` mit, das Cockpit `gauge`.
Ersatzsymbole über `PUT /api/apps/:id/symbol`: Abschluss-Unterlagen
`folder-check`, Probe Cockpit `flask-conical`, die Probe-App des Kunden
`clipboard-list`.

Gesehen und behoben: Das Suchfeld der Palette trug am Orin einen zweiten
Kasten (Regel `input:focus` der Shell), behoben in #966; die Bilder hier sind
danach aufgenommen.
