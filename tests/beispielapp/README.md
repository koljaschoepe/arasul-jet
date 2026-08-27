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

| Weg                                | Wer liefert           | Was zu sehen ist                            |
| ---------------------------------- | --------------------- | ------------------------------------------- |
| `/apps/beispielapp/`               | Arasul (Backend)      | die Seite, mit dem Namen des Angemeldeten   |
| `/apps/beispielapp/api/me`         | Arasul (Backend)      | `{"benutzer":"anna","rolle":"mitarbeiter"}` |
| `/apps/beispielapp/api/hallo`      | ihr eigener Container | `{"app":…,"pfad":"/hallo","nutzer":"anna"}` |
| `/apps/beispielapp/api/schluessel` | ihr eigener Container | `{"gesetzt":true,"antwort":200}`            |
| `/apps/beispielapp/api/gesund`     | ihr eigener Container | `{"status":"ok"}`, auch Dockers Healthcheck |

Der Pfad in der Antwort ist die eigentliche Aussage: das Backend sieht
`/hallo`, nicht `/apps/beispielapp/api/hallo`. Traefik schneidet das Praefix
ab, und eine App muss nicht wissen, unter welchem Namen sie haengt.

Seit Phase C4 kommen zwei Aussagen dazu, und beide gehoeren der Plattform:

- **`nutzer` in `/hallo`** ist der Kopf `X-Arasul-User`, den die Forward-Auth
  vor diesem Container gesetzt hat. Er ist nicht faelschbar -- Traefik loescht
  ihn aus der eingehenden Anfrage, bevor es ihn aus der Antwort der Anmeldung
  neu setzt. `/api/me` sagt dasselbe, ohne dass die App ein Backend braucht.
- **`/schluessel`** ruft mit `ARASUL_API_SCHLUESSEL` die externe Schnittstelle
  auf und gibt nur deren HTTP-Code zurueck. Der Schluessel selbst verlaesst
  den Container nicht; eine Beispielapp, die ihn anzeigt, waere eine Anleitung
  dafuer, es genauso zu machen.

Zu sehen ist all das nur fuer jemanden, dem die App freigegeben ist. Ein
anderer bekommt 403, wer gar nicht angemeldet ist einen Umzug zur Anmeldung.

## Aufruf

```bash
# auf dem Geraet
bash scripts/test/beispielapp.sh einspielen
bash scripts/test/beispielapp.sh entfernen
```
