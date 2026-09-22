# Der Firmenordner

> Stand 22.09.2026, Auftrag `firmenordner-dienst-am-geraet` (J33). Die zwei
> Messungen, auf denen alles hier steht, liegen unter
> [`docs/plans/audits/2026-09-21-firmenordner-dienste/`](../plans/audits/2026-09-21-firmenordner-dienste/MESSUNG.md)
> und
> [`docs/plans/audits/2026-09-21-firmenordner-nachmessung/`](../plans/audits/2026-09-21-firmenordner-nachmessung/MESSUNG.md).

Der Firmenordner ist der Ort, an dem die Dateien des Unternehmens liegen:
Verträge, Angebote, Regeln, die `CLAUDE.md` der Firma. Die Mitarbeiter
gleichen ihn an ihren Rechnern ab, Flows am Gerät lesen ihn, die nächtliche
Sicherung nimmt ihn mit.

**Er läuft nicht von selbst.** Er kostet 2 GB RAM und zwei Kerne, und nicht
jedes Gerät hat einen. Eingeschaltet wird er mit einer Zeile in der `.env`:

```
COMPOSE_PROFILES=firmenordner
```

Danach nimmt jedes `docker compose up -d` ihn mit. Das ist **der eine
Schalter** — auch das Backend liest ihn (`COMPOSE_PROFILES` ist in
`compose.app.yaml` durchgereicht), damit es nicht einen Dienst spiegelt, den
es auf diesem Gerät nicht gibt.

---

## Was darunter läuft

**OpenCloud 8.0.1 mit der Ablage `posix`**, ein Container ohne Datenbank,
300 MB, Apache-2.0. Gewählt am 21.09.2026 nach zwei Messungen am Orin gegen
Nextcloud und Seafile; die Entscheidung und ihre Gegenrede stehen in der
zweiten Messung unter „Entscheidung". Die drei Gründe in einem Satz: er hält
**echte Dateien** unter einem Pfad, den das Gerät ohne `sudo` liest und der
nach einer von außen geänderten Datei nach einer Sekunde stimmt; er verliert
mit dem Klienten, den der Hersteller ausliefert, in keiner der drei
Konfliktvarianten eine Fassung; und ein einzeln freigegebener Ordner liegt bei
seinem Empfänger an seiner echten Stelle im Baum.

Die Fassung steht **fest** (`FIRMENORDNER_VERSION=8.0.1`) und ist genau die
gemessene. Ein Dateidienst, der sich beim nächsten `pull` selbst weiterdreht,
ist auf einem Gerät mit fünf Jahren unbeaufsichtigtem Betrieb kein Dienst,
sondern ein Risiko.

### Wo er im Netz liegt

Er hat **einen eigenen Traefik-Einstiegspunkt auf Port 8443**, nicht einen
Pfad unter 443.

- **Kein Pfad**, weil OpenCloud von ownCloud Infinite Scale abstammt und nur
  auf einer Wurzel läuft: Oberfläche, Anmeldedienst und WebDAV rechnen alle
  mit `/`. Ein Präfix davorzulegen hieße, in jeder Antwort Pfade
  umzuschreiben.
- **Kein zweiter Hostname**, weil der einen DNS-Eintrag im Kundennetz und ein
  neues Gerätezertifikat bräuchte. Ein zweiter Port braucht keins von beidem:
  das Zertifikat aus der **Geräte-CA** trägt `arasul`, `arasul.local`,
  `localhost` und jede IP des Geräts schon, und der Speicher `default` aus
  `config/traefik/dynamic/tls.yml` hängt nicht am Einstiegspunkt.

Der Dienst selbst hat **keinen veröffentlichten Port** und hängt allein am
Netz `arasul-frontend`. Wer ihn erreichen will, geht durch Traefik.

Auf 8443 gibt es weder das Dashboard noch eine App noch die Schnittstelle: jeder
andere Router in `routes.yml` nennt `websecure` und nur `websecure`, dieser
nennt `firmenordner` und nur `firmenordner`.

### Die zwei Grenzen

Beide sind gemessen, keine geschätzt:

| Grenze                   | Wert | Woher                                                           |
| ------------------------ | ---- | --------------------------------------------------------------- |
| `RAM_LIMIT_FIRMENORDNER` | 2G   | Gipfel 1.226 MiB beim Herunterladen mit dem Klienten am Mac     |
| `FIRMENORDNER_CPUS`      | 2.0  | Ohne Grenze 752 % (sieben bis acht von zwölf Kernen) für 23,5 s |

Die CPU-Grenze **kostet Zeit und ist trotzdem richtig**: derselbe Upload
braucht mit zwei Kernen 75,5 s statt 23,5 s. Auf einem Gerät, auf dem daneben
ein Modell rechnet, darf ein Abgleich länger dauern — er darf dem Gerät nicht
die Kerne nehmen.

---

## Die Anmeldung, und warum es eine zweite Passwortablage ist

**Das ist der unangenehme Teil dieser Karte, und er steht deshalb ganz oben in
seinem eigenen Abschnitt.**

Am 21.09.2026 am Orin gemessen: der Dienst **ignoriert die Kopfzeile
`X-Arasul-User`** der Forward-Auth und antwortet `401` — in jeder
Schreibweise, auch hinter Traefik, auch mit gültiger Sitzung. Er hat seinen
eigenen Anmeldedienst (OIDC mit Code-Flow) und nimmt Nutzer entweder von dort
oder von einem **fremden** OIDC-Anbieter. Arasul ist keiner, und ihn dazu zu
machen wäre ein eigenes Vorhaben.

Es blieben zwei Wege, und der zweite war keiner:

1. **Arasul spiegelt Nutzer und Passwort über die Graph-API des Dienstes.**
   Gemessen: Nutzer anlegen `201`, Passwort setzen `200` und danach nur noch
   das neue gültig, sperren `200`, löschen `204`.
2. Forward-Auth als Türsteher davor, und der Mensch meldet sich **ein zweites
   Mal** am Dienst an. Für einen Mitarbeiter ist das die Zumutung, die
   Standardsoftware nicht haben soll.

**Gebaut ist der erste.** Damit hat dieses Gerät das Passwort eines Menschen
an **zwei** Stellen: als bcrypt-Hash in `admin_users`, und im Dienst in dessen
eigener Ablage. Das ist eine Verschlechterung gegenüber „ein Passwort, ein
Ort", und sie wird hier nicht schöngeredet.

**Wie sie geschützt ist**, in fünf Punkten:

1. **Einseitig.** Das Gerät schreibt, der Dienst antwortet. Es gibt keinen
   Weg, auf dem ein Passwort aus dem Dienst zurückkäme.
2. **Der Klartext kommt nur durch, er bleibt nicht.** Gespiegelt wird in genau
   den zwei Augenblicken, in denen das Gerät ihn ohnehin in der Hand hat: der
   Administrator vergibt ein Startpasswort, der Mensch wechselt es. Beide Wege
   laufen durch `services/auth/passwordService.js` → `schreibePasswort`, den
   **einen** Schreibweg für ein Passwort an diesem Gerät. In
   `firmenordner_nutzer` steht kein Passwort; dort steht die Kennung im Dienst.
3. **Der Dienst steht nicht im Netz.** Kein veröffentlichter Port, nur Traefik
   davor, und der nur mit dem Zertifikat der Geräte-CA.
4. **Das Administratorkonto des Dienstes gehört dem Gerät.** Sein Passwort
   liegt in `config/secrets/firmenordner_admin_password` (0600, Ordner 0700),
   wird beim Bootstrap gewürfelt und steht in keiner `.env` und in keiner
   Compose-Datei. Der Dienst liest die Datei selbst (Bind-Mount), das Backend
   über den `config/`-Mount — **ein Geheimnis, ein Ort**. Der eingebaute
   Demo-Nutzer des Abbilds (`einstein`, `marie`, `richard`, mit bekanntem
   Passwort) ist abgeschaltet.
5. **Der Lebenslauf geht mit.** Ein Mensch, der am Gerät gesperrt wird, wird im
   Dienst gesperrt; wer gelöscht wird, wird gelöscht. Nicht als Aufräumlauf,
   sondern in derselben Funktion
   (`services/auth/benutzerService.js`) — was hier fehlt, ist ein Konto, das
   nach dem Ausscheiden noch an die Dateien der Firma kommt.

**Was das Gerät nicht heilen kann:** einen Menschen, den es schon vor dem
Firmenordner gab. Sein Passwort liegt nur als Hash da. `POST
/api/firmenordner/abgleich` legt ihm ein Konto mit einem zufälligen Passwort
an, das niemand kennt, und setzt `passwort_gespiegelt = false`. Er kommt
hinein, sobald jemand sein Passwort einmal setzt oder er es selbst wechselt.

### Der Sync-Klient kommt nicht durch eine Forward-Auth

Er hat das Sitzungs-Cookie nie. Deshalb steht **keine** Forward-Auth vor dem
Router `firmenordner`: sie wäre eine Tür vor einer zweiten Tür, die beide
denselben Menschen fragen, und sie schlösse den Klienten aus. Wer hereinkommt,
entscheidet der Dienst — mit den Nutzern, die Arasul in ihn hineinspiegelt.

Derselbe Grund macht `PROXY_ENABLE_BASIC_AUTH=true` nötig: weder das Backend
des Geräts noch der Kommandozeilen-Klient am Rechner eines Menschen kann ein
Anmeldefenster öffnen.

**Wenn es keine zweite Passwortablage geben darf**, ist Nextcloud mit
`user_saml` im Modus Umgebungsvariable der einzige Dienst, der es kann — und
dann mit dem Scan als Betrieb, `sudo` am Gerät und der Tatsache, dass ein
neuer Ordner erst nach dem Sperren unsichtbar ist. Das steht so in der
Nachmessung unter „Was die Entscheidung kippt", und es ist der Absatz, den man
liest, wenn diese Karte jemals rückgängig gemacht wird.

---

## Die Ordner: eine Wurzel, zwei Ebenen

```
projekte/            Ebene 1 — ein Bereich. Im Dienst: ein RAUM.
  vicona/            Ebene 2 — ein Projekt darin. Im Dienst: ein ORDNER,
  intern/                      einzeln eingeladen.
```

**Zwei Ebenen und nicht mehr.** So hat der Überordner es am 21.09.2026
festgelegt.

**Im Dienst sind die beiden verschiedene Dinge**, und das ist nicht Geschmack,
sondern eine Folge der Messung: OpenCloud kann Rechte nur **erweitern**, nie
unterhalb entziehen. Wer also einen Ordner nicht sehen soll, darf nicht
Mitglied des Ordners darüber sein — Ebene 1 muss deshalb eine Mitgliedschaft
sein und Ebene 2 eine einzelne Einladung.

### Rechte werden nur vergeben

Es gibt **zwei** Stufen, `lesen` und `schreiben`. Eine dritte namens „keine"
gibt es nicht: keine Rechte ist keine Zeile, und genau das macht einen Ordner
für einen Menschen unsichtbar — auch seinen Namen.

Wer auf Ebene 1 ein Recht hat, hat es auf allem darunter. **Mehr** auf einem
Kind ist erlaubt und der Normalfall (lesen auf dem Bereich, schreiben auf dem
einen Projekt). **Weniger** ist ein `409` mit dem Satz, was stattdessen zu tun
ist: das Recht auf dem Elternordner zurücknehmen und die Ordner darunter
einzeln vergeben.

Das wird abgewiesen und nicht stillschweigend ignoriert, und der Unterschied
ist der ganze Punkt: eine Schnittstelle, die „weniger" annimmt und der Dienst
führt es nicht aus, ist die schlimmste Form von Sicherheit — der Administrator
sähe in seiner Liste „lesen", während der Mensch schreibt.

Ein Recht **zurücknehmen** (`DELETE`) ist kein Widerspruch dazu: es nimmt
genau das Recht zurück, das hier vergeben wurde.

### Die Stufe „am Gerät"

Ein Ordner mit `art = 'am_geraet'` wird **nie abgeglichen**. Im Dienst ist er
ein eigener Raum **ohne Mitglieder**; kein Mensch sieht ihn, kein Klient holt
ihn. Lesen kann ihn nur, wer am Gerät in den Ordner sieht: Flows und Apps.

Als unsichtbarer Unterordner eines geteilten Raums geht es **nicht** — das
wäre Entziehen nach unten, und die Graph-API lehnt die dafür nötige Rolle ab
(`Field validation for 'Roles' failed on the 'available_role' tag`, gemessen).
Er liegt deshalb in der Ablage **neben** den geteilten Räumen, nicht darin.

Die Durchsetzung ist doppelt und beides Mal einfach: er bekommt keine
Rechte-Zeile (`POST /rechte` weist ihn ab), und die Abfrage hinter
`GET /api/firmenordner` schneidet zusätzlich auf `art = 'geteilt'` zu.

---

## Echte Dateien, und wer sie liest

Die Ablage liegt unter `data/firmenordner/ablage/` und im Container unter
`/var/lib/opencloud/posix`. Ein Raum „projekte" liegt dort als
`projects/projekte/` — mit dem **Namen** und nicht mit einer UUID, weil
`STORAGE_USERS_POSIX_GENERAL_SPACE_PATH_TEMPLATE` gesetzt ist. Jede Datei
steht unter ihrem Namen. Daneben liegt versteckt `.oc-nodes/` mit der
Verwaltung des Dienstes; die Nutzdaten brauchen sie nicht.

**Der Eigentümer ist das Konto des Geräts** (uid 1000), nicht ein Dienstkonto.
Ein Flow liest die Dateien ohne `sudo` — das war der Punkt, an dem Nextcloud
in der Messung durchgefallen ist.

### Flows

Das Backend hat die Ablage **nur lesend** unter `/arasul/firmenordner`
gemountet. Ein Flow deklariert einen Ordner darunter und arbeitet darin wie in
jedem anderen (`services/flows/pathSafe.js`).

**Lesend und nicht schreibend**, und das ist eine Entscheidung: jede Datei im
Firmenordner hat einen **Menschen** als Urheber (Zielbild, „Apps bekommen
keinen Dateizugriff"). Ein Flow, der hineinschreibt, legt eine Datei an, die
auf jedem Rechner des Hauses auftaucht und die niemand bestellt hat. Der Weg
dafür ist die Freigabe aus C7: der Flow fragt, ein Mensch bestätigt, und der
Mensch legt sie ab.

Gemountet ist `ablage` und nicht der ganze Ordner: die Konfiguration des
Dienstes (Schlüssel, Zertifikate) geht Flows nichts an.

### Sicherung und Weg zurück

Der Firmenordner ist der vierte Topf der nächtlichen Sicherung, neben
`postgres`, `apps`, `flows` und `config`
(`services/backup-service/backup.sh`). Er ist von diesen der einzige, in dem
**ausschließlich** Dinge liegen, die es nirgendwo sonst gibt: Apps lassen sich
neu einspielen, Flows neu schreiben, die Konfiguration neu erzeugen. Was hier
fehlt, ist weg.

Gesichert wird der **Baum**, nicht der Dienst — mit `posix` ist ein `tar`
darüber wirklich der Inhalt und nicht eine Blocksammlung, die ohne ihren Dienst
nichts bedeutet. `.oc-nodes` kommt mit: ohne sie stünden die Dateien nach dem
Weg zurück zwar da, aber der Dienst kennte ihre Rechte nicht.

Zurück geht es mit `wiederherstellen.sh` im Sicherungs-Container, wie bei
`apps` und `flows`. **Der Dienst muss dafür stehen:** `entpacke_nach` räumt
das Ziel leer, bevor es den Baum zurückschreibt, und ein laufendes OpenCloud
sieht mit `inotify` zu, wie ihm der Boden weggezogen wird.

```bash
docker compose stop firmenordner
docker exec backup-service /usr/local/bin/wiederherstellen.sh
docker compose --profile firmenordner up -d firmenordner
```

Die Kopie **außerhalb** des Geräts (USB oder SMB, C9) nimmt
`firmenordner_latest.tar.gz` mit.

---

## Die lesende Route für das CLI

```
GET /api/firmenordner          Authorization: Bearer ausweis_…
```

Sie sagt einem Menschen, **wo sein Firmenordner liegt und welche Ordner er
hat**, und sie ist die vierte Route des Geräts, die einen **Ausweis**
annimmt (Brücke, J34). Das CLI der Wurzel läuft am Rechner eines Menschen, hat
keine Sitzung und muss vor dem ersten Abgleich wissen, wohin es den
Kommandozeilen-Klienten schickt und welche Ordner es anlegen darf.

Die Form der Antwort steht in
[`docs/api/API_REFERENCE.md`](../api/API_REFERENCE.md#firmenordner-j33-22092026).
Zwei Dinge daran sind wichtig:

- **`pfad` ist die echte Stelle im Baum**, auch wenn der Mensch den Ordner
  darüber gar nicht sieht: `projekte/vicona`. Das CLI legt die Kette darüber
  lokal an; der Dienst kennt sie für diesen Menschen nicht, und schreiben darf
  er dort nicht.
- **`503`, wenn es hier keinen Firmenordner gibt** — nicht eine leere Liste.
  „Du hast keine Ordner" und „auf diesem Gerät läuft kein Dateidienst" sind
  zwei verschiedene Auskünfte, und ein CLI, das die erste bekommt, räumt den
  Ordner auf dem Rechner des Menschen leer.

Was vom Abgleich **ausgeschlossen** gehört (`.git`, `node_modules`,
Build-Ordner, `.claude/hooks`, `settings.json`), bestimmt das CLI am Rechner —
bei OpenCloud liegt die Ausschlussliste dort und nicht im Ordner. Das Gerät
sagt, _welche_ Ordner es gibt, nicht _wie_ jemand sie abgleicht.

---

## Was nicht in dieser Karte steht

- **Die Verwaltung im Frontend.** Ordner anlegen und Rechte vergeben geht
  über die Schnittstelle; eine Oberfläche dafür ist ausdrücklich nicht Teil
  dieser Karte.
- **Der Tailnet-Gast.** Die Frage war: „Ein Gast im Tailnet erreicht nur
  diesen Dienst und die Anmeldung, nicht die Belege-App und nicht SSH."

  **Das wird eine eigene Karte, und hier steht, warum.** Was dieses Repo dazu
  beitragen kann, ist getan: der Firmenordner hat einen **eigenen Port**, und
  damit ist die Grenze überhaupt erst als Regel aussprechbar — mit einem Pfad
  auf 443 wäre sie eine Regel über URLs gewesen, die keine Firewall kennt. Was
  fehlt, liegt nicht hier:

  - Die **Tailscale-ACL** ist eine Datei im Tailnet des Unternehmens, nicht im
    Repo. Sie entscheidet, wer 8443, 443 und 22 erreicht.
  - **SSH** ist der Zugang zum Betriebssystem und wird nicht von Arasul
    vergeben.
  - Was auf **443** erreichbar ist, entscheidet ohnehin schon die Anmeldung:
    ein Gast ohne Konto sieht die Anmeldeseite und sonst nichts, und die
    Belege-App liegt hinter der Forward-Auth mit `app_members` (C4).

  Eine Karte, die das zusammenführt, gehört in den Überordner, weil sie ein
  Gerät, ein Tailnet und ein Unternehmen betrifft. Hier wäre sie eine
  Behauptung über Dinge, die dieses Repo nicht schreibt.

- **Der Dauerlauf.** Die Ablage `posix` ist die jüngere der beiden von
  OpenCloud. Ein `500` in einem Lauf der Messung ist kein Beweis, aber ein
  Anlass, den siebentägigen Lauf (A7) zu fragen.
- **Windows als Klient.** Gemessen ist der Mac.

---

## Ablauf: einen Firmenordner einrichten

```bash
# 1. Anschalten
echo 'COMPOSE_PROFILES=firmenordner' >> .env
docker compose up -d firmenordner

# 2. Die Menschen, die es schon gibt, nachtragen
curl -sk -X POST https://arasul/api/firmenordner/abgleich \
  -H "Cookie: arasul_session=…" -H "X-CSRF-Token: …"

# 3. Einen Bereich und ein Projekt darin
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"projekte","name":"Projekte","ebene":1}'
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"vicona","name":"Vicona","ebene":2,"eltern":"projekte"}'

# 4. Und den Ordner, den nur das Gerät liest
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"geraet","name":"Am Gerät","ebene":1,"art":"am_geraet"}'

# 5. Rechte
curl -sk -X POST https://arasul/api/firmenordner/rechte … \
  -d '{"ordner_id":2,"benutzer_id":3,"recht":"schreiben"}'
```

Ein Mensch, dessen Passwort danach einmal gesetzt wird, kommt herein. Sein CLI
fragt `GET /api/firmenordner` und weiß, wohin.
