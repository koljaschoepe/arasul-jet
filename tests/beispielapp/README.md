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
| `/apps/beispielapp/api/flow`       | ihr eigener Container | `{"gestartet":true,"lauf":42}` (POST)       |
| `/apps/beispielapp/api/freigaben`  | ihr eigener Container | `{"freigaben":[{"id":1,"status":"offen"}]}` |

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

Seit Phase C6 kommt ein Drittes dazu, und es ist das Mass jener Phase:

- **`flows/wochenbericht.md`** liegt in ihrem Paket. Beim Einspielen
  registriert das Geraet ihn je App und **Stand** (`app_flows`); der Namensraum
  ist die App. Er kommt bewusst ohne `modell:` im Kopf aus — dann gilt das
  Standardmodell des Geraets, und die Beispielapp haengt nicht an einem
  Modellnamen, der auf dem naechsten Geraet ein anderer ist.
- **`/flow`** startet ihn: `POST` gibt die Lauf-Nummer, `GET /flow?lauf=<n>`
  sagt, wie weit er ist. Zwei Aufrufe und nicht einer, weil ein Flow Minuten
  laufen kann und die Zeitlimits von Forward-Auth, Traefik und Browser
  dazwischen alle kuerzer sind.

  Sie startet ihn **mit ihrem eigenen Schluessel**, und den einer anderen App
  koennte sie nicht starten: der Schluessel traegt App und Stand, das Geraet
  sucht mit beiden. Der Schluessel selbst verlaesst den Container auch hier
  nicht — zurueck geht nur, was die Plattform antwortet.

  Der Flow deklariert **keine Ordner**. Ein Flow aus einem Paket bekommt am
  Geraet keine, und damit auch keine Datei-Werkzeuge; er delegiert an eine
  Rolle und schreibt aus deren Ergebnis den Bericht. Ein Schritt in
  `flow_run_steps` entsteht genau dadurch.

Seit Phase C7 das Vierte: ein Flow, der **anhaelt**.

- **`flows/freigabe.md`** fordert mit `freigabe_anfordern` eine Freigabe an.
  Der Lauf steht dann auf `wartend` und tut nichts, bis ein Mensch entscheidet:
  bestaetigt laeuft er ab dem angehaltenen Schritt weiter, abgelehnt endet er
  als `abgebrochen` mit der Begruendung. Entscheiden darf jeder, dem die App
  freigegeben ist -- der Flow nennt keine Person.
- **`flows/freigabe-frist.md`** ist derselbe Flow mit einer Frist von zwoelf
  Sekunden. Er belegt den dritten Ausgang: ohne Entscheidung endet der Lauf als
  `abgelaufen`, und das ist kein Fehler.
- **`/freigaben`** liest, woran ein Lauf haengt (`?lauf=<n>` engt ein). **Nur
  lesen**: eine App, die ihre eigene Freigabe erteilen koennte, waere keine.
- **`/flow?flow=<name>`** waehlt, welchen der drei Flows sie startet; ohne
  Angabe `wochenbericht`.

## Aufruf

```bash
# auf dem Geraet
bash scripts/test/beispielapp.sh einspielen
bash scripts/test/beispielapp.sh entfernen

# Der ganze Weg der Flow-Engine, ueber die externe Schnittstelle (Phase C6)
bash scripts/test/flow-abnahme.sh

# Der ganze Weg einer Freigabe: halten, bestaetigen, ablehnen, ablaufen (C7)
bash scripts/test/freigabe-abnahme.sh
```
