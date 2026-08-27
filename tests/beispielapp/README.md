# Beispielapp

Die kleinste App, die das App-Modell aus Phase C3 vollstaendig ausuebt: ein
statisches Frontend, das Arasul unter `/apps/beispielapp/` ausliefert, und ein
Backend-Container, den Traefik unter `/apps/beispielapp/api/` erreicht.

**Sie gehoert nicht zum Auslieferungsumfang.** Sie liegt unter `tests/`, wird
von keiner Compose-Datei erwaehnt, von keinem Setup installiert und ist in
`.dockerignore` (`**/tests/`) von jedem Image ausgeschlossen. Auf das Geraet
kommt sie mit dem Git-Checkout des Deploys, und dort tut sie nichts, bis jemand
`scripts/test/beispielapp.sh einspielen` aufruft.

Sie hat keine Abhaengigkeiten: das Frontend ist eine HTML-Datei ohne Build, das
Backend ein Node-Programm mit dem eingebauten `http`-Modul. Ein `npm install`
gaebe es hier nicht, und der Wurzel-Lockfile bleibt unberuehrt.

## Was sie beweist

| Weg                            | Wer liefert           | Was zu sehen ist                            |
| ------------------------------ | --------------------- | ------------------------------------------- |
| `/apps/beispielapp/`           | Arasul (Backend)      | die Seite                                   |
| `/apps/beispielapp/api/hallo`  | ihr eigener Container | `{"app":"Beispielapp","pfad":"/hallo"}`     |
| `/apps/beispielapp/api/gesund` | ihr eigener Container | `{"status":"ok"}`, auch Dockers Healthcheck |

Der Pfad in der Antwort ist die eigentliche Aussage: das Backend sieht
`/hallo`, nicht `/apps/beispielapp/api/hallo`. Traefik schneidet das Praefix
ab, und eine App muss nicht wissen, unter welchem Namen sie haengt.

## Aufruf

```bash
# auf dem Geraet
bash scripts/test/beispielapp.sh einspielen
bash scripts/test/beispielapp.sh entfernen
```
