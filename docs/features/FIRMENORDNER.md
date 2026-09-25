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

**Er läuft nicht von selbst.** Er kostet unter Last bis zu 4 GB RAM und zwei
Kerne, und nicht jedes Gerät hat einen. Eingeschaltet wird er mit einer Zeile in der `.env`:

```
COMPOSE_PROFILES=firmenordner
```

Danach nimmt jedes `docker compose up -d` ihn mit. Das ist **der eine
Schalter** — auch das Backend liest ihn (`COMPOSE_PROFILES` ist in
`compose.app.yaml` durchgereicht), damit es nicht einen Dienst spiegelt, den
es auf diesem Gerät nicht gibt.

**Und genau deshalb muss beim Einschalten auch das Backend neu angelegt
werden.** Eine Umgebungsvariable erreicht einen Container, der schon läuft,
nicht; am 22.09.2026 am Orin gemessen: der Dateidienst lief, und
`GET /api/firmenordner` sagte weiter „auf diesem Gerät läuft kein
Firmenordner". `docker compose up -d firmenordner dashboard-backend` ist der
Befehl — nicht nur der erste Name.

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

| Grenze                   | Wert | Woher                                                              |
| ------------------------ | ---- | ------------------------------------------------------------------ |
| `RAM_LIMIT_FIRMENORDNER` | 4G   | Bei 2G einmal `OOMKilled`, einmal halber Durchsatz — derselbe Lauf |
| `FIRMENORDNER_CPUS`      | 2.0  | Ohne Grenze 752 % (sieben bis acht von zwölf Kernen) für 23,5 s    |

Die CPU-Grenze **kostet Zeit und ist trotzdem richtig**: derselbe Upload
braucht mit zwei Kernen 75,5 s statt 23,5 s. Auf einem Gerät, auf dem daneben
ein Modell rechnet, darf ein Abgleich länger dauern — er darf dem Gerät nicht
die Kerne nehmen. **Sie** ist der Schutz des Geräts, nicht die RAM-Grenze.

#### Warum die RAM-Grenze am 22.09.2026 von 2G auf 4G gegangen ist

Die alte Begründung lautete „Gipfel 1.226 MiB beim Herunterladen" — und die
Zahl war richtig gemessen und falsch **gelesen**. Was `docker stats` meldet,
ist nicht der Bedarf, sondern der Stand, den der Go-Laufzeitkern gerade
**hält**: er gibt freigegebene Seiten erst unter Druck zurück. Am
Nebencontainer gegengemessen, immer derselbe Lauf (6,4 GB in 16-MB-Dateien,
64 gleichzeitige Übertragungen):

| Grenze | Gipfel        | Durchsatz     | Ausgang                                         |
| ------ | ------------- | ------------- | ----------------------------------------------- |
| 2 GiB  | **2.048 MiB** | —             | **`OOMKilled`, 388 Übertragungen verloren**     |
| 2 GiB  | **2.048 MiB** | **79,7 MB/s** | durchgekommen, halber Durchsatz                 |
| 3 GiB  | 3.030 MiB     | 170,6 MB/s    | durch                                           |
| 4 GiB  | 3.895 MiB     | 169,9 MB/s    | durch                                           |
| 4 GiB  | 3.923 MiB     | 170,0 MB/s    | durch, mit **128** gleichzeitigen Übertragungen |

**Die Zahl folgt der Grenze, nicht der Last** — deshalb sagt ein einzelner
Gipfelwert nichts. Was etwas sagt, ist der Ausgang, und bei 2 GiB ist er
**Zufall**: zwei identische Läufe, einmal vom Kernel erschlagen, einmal
durchgekommen mit halber Geschwindigkeit.

**Vierundsechzig gleichzeitige Übertragungen sind kein Extremfall.** Der
Klient des Herstellers nimmt sechs je Rechner; das sind zehn Menschen im Haus,
die morgens ihren Ordner abgleichen — also der Normalfall eines
Firmengeräts und nicht sein schlimmster Tag.

**`GOMEMLIMIT` wäre der naheliegende zweite Knopf**, und er steht absichtlich
nicht da. Gemessen hilft er in einem Bereich (viele kleine Dateien: Gipfel
2.005 → 1.684 MiB, Durchsatz 87,7 → 104,4 MB/s) und in dem, der wehtut, gar
nicht (64 parallel: 3.756 statt 3.895 MiB). Ein zweiter Wert, der der Grenze
von Hand nachgezogen werden muss, damit er überhaupt etwas tut, ist genau die
Sorte Doppelung, die eines Tages auseinanderläuft.

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
2. **Der Klartext kommt nur durch, er bleibt nicht.** Gespiegelt wird in den
   Augenblicken, in denen das Gerät ihn ohnehin in der Hand hat: der
   Administrator vergibt ein Startpasswort, der Mensch wechselt es — beide Wege
   laufen durch `services/auth/passwordService.js` → `schreibePasswort`, den
   **einen** Schreibweg für ein Passwort an diesem Gerät —, und seit dem
   26.09.2026 die **Anmeldung**, aber nur, solange das Passwort im Dienst noch
   fehlt (`ordnerVerwaltung.spiegleBeiAnmeldung`). In `firmenordner_nutzer`
   steht kein Passwort; dort steht die Kennung im Dienst.
3. **Der Dienst steht nicht im Netz.** Kein veröffentlichter Port, nur Traefik
   davor, und der nur mit dem Zertifikat der Geräte-CA.
4. **Das Administratorkonto des Dienstes gehört dem Gerät**, und es heißt
   `arasul-dienst`, nicht `admin`. OpenCloud legt es fest als `admin` an —
   derselbe Name, den der Installer dem ersten Menschen gibt; der kam deshalb
   nicht in den Dateidienst (409 beim Anlegen, 401 beim Abgleich,
   Kundendurchlauf 2 am 25.09.2026). Das Backend benennt es beim ersten
   Kontakt über die Graph-API um (`ordnerdienst.umbenennenWennNoetig`, nach
   einem 401 und nur mit dem Passwort des Dienstes); die Rolle hängt an der
   Kennung, es bleibt Administrator. Frisches und bestehendes Gerät gehen
   denselben Weg, ohne Handgriff, und am Gerät kann niemand `arasul-dienst`
   heißen. Sein Passwort
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

**Eine Sperre wirkt im Dateidienst nicht sofort**, und das gehört gesagt. Am
Orin gemessen (22.09.2026): `accountEnabled` steht im selben Augenblick auf
`false`, der Dienst lässt den Menschen aber noch **zwanzig bis vierzig
Sekunden** herein — er hält einen angemeldeten Nutzer im Zwischenspeicher. Am
Gerät selbst ist die Sperre sofort scharf (die Sitzungen fallen mit
`blacklistAllUserTokens`); am Dateidienst dauert es unter einer Minute. Ein
**Passwortwechsel** dagegen wirkt sofort — das alte Wort ist im selben
Augenblick `401`. Wer jemanden auf der Stelle aussperren muss, setzt ihm also
ein Passwort und sperrt danach.

**Ein Mensch, den es schon vor dem Firmenordner gab**, hat am Gerät nur einen
Hash. `POST /api/firmenordner/abgleich` legt ihm ein Konto mit einem
zufälligen Passwort an, das niemand kennt, und setzt `passwort_gespiegelt =
false`. Seit dem 26.09.2026 heilt das seine **nächste Anmeldung** — in der
Oberfläche oder über `arasul.mjs login`: wer sich anmeldet, hat das Passwort
gerade bewiesen, und das Gerät spiegelt es dann einmal. Vorher kam er erst
herein, wenn jemand sein Passwort setzte oder er es wechselte.

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
firma/               Ebene 0 — die Wurzel. Im Dienst: ein eigener RAUM der
  .claude/                     Art `wurzel`; alle lesen, Administratoren
  .claude/sicht.md             schreiben. Genau eine je Gerät.
projekte/            Ebene 1 — ein Bereich. Im Dienst: ein RAUM.
  vicona/            Ebene 2 — ein Projekt darin. Im Dienst: ein ORDNER,
  intern/                      einzeln eingeladen.
```

**Zwei Ebenen und nicht mehr.** So hat der Überordner es am 21.09.2026
festgelegt. Die Wurzel darüber ist keine dritte Ebene, sondern der Ort, an
dem die Regeln liegen (siehe unten).

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

### Die Wurzel

> Seit dem Auftrag `firmenordner-rechte-im-frontend` (22.09.2026), Migration 184.

Das Zielbild (`company/plattform.md`) hat über den zwei Ebenen eine **Ebene
0**: `firma/`, alle lesen, nur der Administrator schreibt. Darin liegen die
`CLAUDE.md` der Firma, ihre Skills und Agents, die Liste der fremden Orte
(`.claude/places.json`) und die je Mitarbeiter erzeugte `.claude/sicht.md`.

**Im Dienst gibt es über einem Raum nichts.** Die Wurzel ist deshalb ein
eigener Raum mit `art = 'wurzel'`, und das CLI der Wurzel am Rechner des
Menschen legt ihn **oben** in den lokalen Baum, nicht in einen Unterordner;
die Räume der Ebene 1 kommen darunter an ihre echte Stelle. `GET
/api/firmenordner` führt sie zuerst, mit `pfad` leer und `ebene` 0.

**Wer sie liest, steht in keiner Rechte-Zeile.** Jeder aktive Mensch liest,
jeder Administrator schreibt — das folgt aus `admin_users.role`, und eine
zweite Tabelle dafür wäre eine Kopie, die auseinanderläuft. Im Dienst wird es
zu einer Einladung je Mensch (Leser oder Schreiber): gesetzt beim Anlegen der
Wurzel für alle, die es schon gibt, beim Spiegeln eines neuen Menschen, beim
Stilllegen und Zulassen, und bei jedem `POST /abgleich`
(`spiegleWurzelMitglieder`). Ein Recht je Person auf die Wurzel gibt es nicht
(`POST /rechte` antwortet 400). Gemessen wird das über WebDAV: ein
Mitarbeiter bekommt auf `PUT` in die Wurzel 403, ein Administrator 201.

**Genau eine je Gerät**, und sie **fällt zuletzt**: solange ein anderer
Ordner besteht, hängt an ihr die Kette nach oben, die jeder Mensch mit
irgendeinem Recht liest (Regel 1). Angelegt wird sie in der Verwaltung mit
einem Knopf oder vom CLI der Wurzel beim Ausrollen (`POST /ordner` mit
`art: "wurzel"`).

### `sicht.md`: was es für diesen Menschen gibt

Regel 3 des Zielbildes: „Was es gibt, steht in `sicht.md`, je Mitarbeiter
vom Gerät erzeugt aus seinen Rechten: seine Ordner mit Recht, seine Apps mit
Verweis auf ihre `APP.md`, die fremden Orte. Höchstens eine Bildschirmseite.
Niemand pflegt Kontext je Rolle von Hand."

`GET /api/firmenordner/sicht` liefert sie als `text/markdown`, mit Ausweis
oder Sitzung; das CLI legt sie beim Abgleich unter `.claude/sicht.md` ab. Sie
entsteht aus denselben zwei Abfragen wie `GET /api/firmenordner` und
`GET /api/apps/meine` — also nennt sie **nichts, was der Mensch nicht hat**,
auch keinen Namen. Die Orte kommen aus `.claude/places.json` der Wurzel,
gelesen über den Dienst (Form wie im CLI: `{ places: [{ name, description?,
local?, write? }] }`). Jeder Abschnitt ist auf seine Zeilen gekürzt, der Rest
steht als Zahl.

### Wer zuletzt wann etwas geändert hat

Die Verwaltung zeigt je Ordner die letzten Änderungen — **gelesen aus dem
Dienst**, nicht aus dem Gerät. Auf der Platte gehört jede Datei dem Konto des
Geräts (uid 1000, `posix`); wer sie hochgeladen hat, steht nirgends im
Dateisystem. Der Dienst führt dagegen je Element ein Protokoll
(`activitylog`), und die Graph-Erweiterung `org.libregraph/activities` gibt es
heraus: am 22.09.2026 am Orin gemessen steht nach einem `PUT` eines Menschen
binnen Sekunden `{user} added {resource} to {folder}` mit seinem Anzeigenamen
und der Zeit darin — ein `PROPFIND` nennt dagegen nur `getlastmodified` und
den **Eigentümer des Raums**, nie den, der geschrieben hat.
`GET /api/firmenordner/ordner/:id/aenderungen` löst die Vorlage zu einem Satz
auf; leer, wenn der Dienst steht oder den Ordner noch nicht kennt.

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

Belegt ist das, nicht behauptet: die Abnahme löst eine Sicherung aus, liest im
Bericht `firmenordner: true`, **öffnet das Archiv mit dem Schlüssel dieses
Geräts** in einem Wegwerfordner und sieht nach, ob der Baum darin steht.

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

## Wegwerfen: was dabei wirklich passiert

> Gemessen am 22.09.2026 am Orin, Auftrag `firmenordner-wegwerfen-und-grenzen`
> (J33) — die Zahlen und die Messhülle liegen unter
> [`docs/plans/audits/2026-09-22-firmenordner-grenzen/`](../plans/audits/2026-09-22-firmenordner-grenzen/MESSUNG.md).

`DELETE /api/firmenordner/ordner/:id` wirft einen Ordner **samt allem, was
darin liegt** weg. Das ist die einzige Zusage dieser Karte, die lange dauern
darf, und sie hat drei Stufen, die man einzeln kennen muss.

**Ein Raum (Ebene 1) braucht zwei `DELETE`, und beide immer.** Das erste
antwortet `204` und lässt ihn als `trashed` in der Liste stehen — seine
Dateien liegen unverändert da. Erst ein zweites mit `Purge: T` nimmt ihn weg.

**Ein Ordner (Ebene 2) braucht ebenfalls zwei Schritte**, und der zweite ist
neu seit diesem Auftrag: ein WebDAV-`DELETE` ist kein Wegwerfen, sondern ein
Verschieben. Der Ordner liegt danach unter
`projects/<raum>/.Trash/files/<uuid>.trashitem/` und **jede Datei darin ist
noch da**. Das Gerät leert deshalb genau diesen einen Eintrag hinterher
(`oc:trashbin-original-location` nennt, woher er kam) — **nicht** den ganzen
Papierkorb: darin liegt auch, was ein Mensch gelöscht hat und morgen
zurückholen will.

**Die Dauer hängt an der Zahl der Dateien, nicht an der des Dienstes.**
Gemessen: **11,4 s für 6.000 Dateien** in zwanzig Ordnern, also rund 1,9 ms je
Datei. Die alte Zeitgrenze des Backends lag bei zehn Sekunden — knapp darunter,
und damit war ein Arbeitsbaum mittlerer Größe nicht wegzuwerfen.

### Der Fehler vom 22.09.2026, und warum er so schwer zu lesen war

Ein Raum mit 6.076 Dateien antwortete `500 grpc error`, im Log stand
`context canceled`. Nachgestellt, beide Richtungen:

| Was                            | Mit Zeit (11,8 s) | Nach 10 s abgeschnitten |
| ------------------------------ | ----------------- | ----------------------- |
| Dateien auf der Platte         | 0                 | **0**                   |
| Raum in `/graph/v1.0/drives`   | weg               | **weg**                 |
| Antwort an den Aufrufer        | `204`             | **Abbruch**             |
| Zweiter Versuch danach         | —                 | **`500 grpc error`**    |
| Namen im Suchindex (von 11.9k) | 968 (8 %)         | **11.927 (100 %)**      |

Der Dienst räumte also **zu Ende**, während das Backend schon abgeschnitten
hatte. Übrig blieb: ein Raum ohne Dateien, eine Zeile am Gerät, die ihn weiter
führte, ein Suchindex, der jeden Dateinamen behielt, und ein `500` auf jeden
weiteren Versuch, bis jemand den Container neu startete. **Eine Ursache, drei
Symptome** — und keines davon sah nach einer Zeitgrenze aus.

Drei Dinge halten das jetzt:

1. **Wegwerfen hat seine eigene Geduld.** `FIRMENORDNER_ZEITGRENZE_LOESCHEN_MS`
   steht bei **15 Minuten** (bei 1,9 ms je Datei reicht das für ein paar
   hunderttausend), die zehn Sekunden gelten weiter für alles andere.
2. **Die Route setzt dieselbe Zahl auf ihre eigene Antwort.** `index.js`
   schneidet jede Antwort nach 60 s ab (TIMEOUT-001); ohne dieses
   `res.setTimeout` wäre die Grenze darüber eine Behauptung.
3. **Am Ende wird nachgesehen, nicht geglaubt.** Meldet der Dienst einen
   Fehler, fragt das Gerät die **Liste** der Räume — steht er nicht mehr
   darin, ist er weg, und der Statuscode ist eine Fußnote fürs Protokoll.
   Über die Liste und nicht über den einzelnen Raum: `GET /drives/<weg>`
   antwortet `500 grpc error` und nicht `404`, und daraus ist „gibt es nicht"
   von „ging gerade schief" nicht zu unterscheiden. Kommt die Liste selbst
   nicht, ist das ein „steht noch da" — wer nicht nachsehen konnte, behauptet
   nichts.

### Der Suchindex

Der Suchdienst hält seinen bleve-Index unter `data/firmenordner/ablage/search`.
Nach einem **vollständigen** Wegwerfen verliert er die Dateinamen des Raums;
nach einem **abgeschnittenen** behält er jeden einzelnen, denn er erfährt von
der Löschung nie. Das ist derselbe Fehler wie oben, eine Stufe weiter.

**Zwei Messgeräte, zwei Antworten — und man muss sie auseinanderhalten:**

- **Die Suche** (`REPORT /dav/spaces` mit `oc:search-files`) findet nach dem
  Wegwerfen **nichts**, in beiden Fällen: der Dienst kennt den Raum nicht mehr
  und gibt nichts aus ihm heraus. Das ist, was ein Mensch sieht.
- **`grep` über die Indexdateien** sieht, was auf der Platte steht, und nur er
  sieht den Unterschied: 11.567 → **968** Treffer mit Reparatur, 11.927 →
  **11.927** ohne.

Die 968, die bleiben, sind **Bytes gelöschter Dokumente in einem
bleve-Segment, das noch nicht verschmolzen ist**. Dass es Leichen sind und
keine lebenden Einträge, sagt genau der Vergleich: eine Löschung im Index ist
je Dokument ganz oder gar nicht — 92 % verschwinden nicht, wenn die Dokumente
noch da wären. Gegengemessen über sechs Minuten unter Indexlast (8.000 neue Dateien
daneben, acht statt vier Segmente): die Zahl
bleibt bei 968, bis bleve dieses Segment anfasst; einen Befehl, der das
erzwingt, gibt es nicht.

**Wer wirklich null will**, nimmt den Index einmal ganz weg — er ist
abgeleitet, nicht Nutzdaten, und der Dienst baut ihn neu auf:

```bash
docker compose stop firmenordner
rm -rf data/firmenordner/ablage/search
docker compose --profile firmenordner up -d firmenordner
```

Das ist ein Neustart und deshalb **kein** Teil des Wegwerfens.

### Symlinks werden nicht abgeglichen

Gemessen mit vier Sorten im Baum — auf eine Datei daneben, auf einen Ordner
daneben, ins Leere, nach draußen (`/etc/hostname`): **keiner** steht im
`PROPFIND`, **keiner** ist herunterzuladen (`404`), **keiner** steht in der
Suche. Der Ablagetreiber `posix` geht an ihnen vorbei, und zwar **wortlos** —
es gibt keine Fehlermeldung, an der jemand es merken könnte, und auf dem
Rechner des Menschen sieht der Ordner vollständig aus.

Das Gerät kann das nicht heilen: was der Dateidienst nicht kennt, kennt auch
das Backend nicht. Es **sagt** es deshalb — `GET /api/firmenordner` führt
`nicht_abgeglichen` mit, und das CLI am Rechner eines Menschen ist die einzige
Stelle, die beim Lauf über den Baum einen Symlink wirklich sehen kann.

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

## Was am Gerät gemessen wurde, bevor es hier stand

Am 22.09.2026 lief eine Wegwerf-Instanz (`j33karte-*`, eigenes
Compose-Projekt, Port nur auf `127.0.0.1`, `mem_limit`, `restart: no`,
hinterher restlos entfernt) neben dem Produkt am Orin, und jeder Aufruf, den
`ordnerdienst.js` macht, wurde einmal wirklich gestellt. **Fünf davon waren
falsch**, und alle fünf hätten erst am Gerät gefehlt:

| Was                    | Erwartet                            | Gemessen                                                       |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Die Rollen holen       | `/graph/v1.0/roleManagement/…`      | **404** — es ist `v1beta1`                                     |
| Die Rolle wählen       | ein Name, eine Rolle                | **„Can view" zweimal, „Can edit" dreimal**, gleicher Name      |
| Einen Ordner anlegen   | `POST /drives/<raum>/root/children` | **404** — es ist `MKCOL /dav/spaces/<raum>/<pfad>`             |
| Einen Ordner wegwerfen | `DELETE /drives/<raum>/items/<id>`  | **405** — es ist `DELETE /dav/spaces/<raum>/<pfad>`            |
| Einen Raum wegwerfen   | ein `DELETE`                        | **204, und der Raum bleibt** — erst ein zweites mit `Purge: T` |

Die zweite und die fünfte sind die, die ohne Messung jahrelang unbemerkt
geblieben wären.

**Gleicher Name, verschiedene Rolle.** Was die gleichnamigen Rollen
unterscheidet, ist die Bedingung ihrer Berechtigungen — und sie ist genau
unsere Ebene:

```
Can view   exists @Resource.Root     ein ganzer Raum    (Ebene 1)
Can view   exists @Resource.Folder   ein Ordner darin   (Ebene 2)
Can edit   exists @Resource.Root     ein ganzer Raum
Can edit   exists @Resource.Folder   ein Ordner darin
Can edit   exists @Resource.File     eine einzelne Datei (hier nie)
```

Die erste passende zu nehmen wäre eine Wette auf die Reihenfolge, in der der
Dienst sie aufzählt — und die Wette wäre schon beim ersten Lauf verloren
gewesen: dort stand die Ordner-Rolle vor der Raum-Rolle.

**Ein `204`, das nichts löscht.** Das erste `DELETE` auf einen Raum antwortet
`204` und liest sich als „erledigt". Der Raum steht danach mit
`root.deleted.state = "trashed"` weiter in der Liste, und seine Dateien liegen
unverändert auf der Platte — nachgesehen, beide Richtungen. Erst ein zweites
`DELETE` mit `Purge: T` nimmt ihn wirklich weg. Deshalb macht `loescheRaum`
**immer beide** Aufrufe.

**Und was richtig war und nun belegt ist:** ein über die Graph-API angelegter
Mensch meldet sich mit demselben Passwort am WebDAV an (`207`); ein `PATCH`
auf das Passwort macht das alte sofort ungültig (`401`) und das neue gültig;
`accountEnabled: false` sperrt — **nach rund drei Sekunden**, der Dienst hält
einen Nutzer kurz im Zwischenspeicher (die Abnahme wartet das deshalb ab, statt
sofort zu messen); ein Mensch mit einem Recht **nur** auf einem Ordner der
Ebene 2 sieht den Raum darüber nicht (`404` auf dessen Wurzel, und er steht
nicht in `me/drives`); ein Raum ohne Mitglieder taucht bei niemandem auf; und
eine hochgeladene Datei liegt als
`posix/projects/<raum>/<ordner>/<datei>` auf der Platte, Eigentümer das Konto
des Geräts.

---

## Die Verwaltung im Frontend

> Seit dem Auftrag `firmenordner-rechte-im-frontend` (22.09.2026).

**Einstellungen → Firmenordner** (`/workspace/settings?tab=firmenordner`,
`features/settings/FirmenordnerSettings.tsx` plus `firmenordner/`): der
Ordnerbaum mit Kennung, Name und Art, Anlegen (Bereich, Projekt, am Gerät)
und Wegwerfen (Kennung abtippen, wie beim Kit-Weg), die **Rechte-Matrix**
Menschen mal Ordner mit einer Stufe je Zelle — keine, lesen, schreiben —, und
je Ordner die letzten Änderungen. Ein Ordner am Gerät hat **keine
Rechtespalte**, die Wurzel auch nicht (ihre Regel steht als Satz über der
Matrix). Ein Projekt, dessen Bereich der Mensch schon hat, sagt in der Zelle
„wie oben: lesen" und bietet trotzdem mehr an; **weniger** weist das Backend
mit 409 ab, und der Satz mit dem Ausweg steht dann über der Matrix. Die
Vergabe erzeugt dieselbe Zeile wie `POST /api/firmenordner/rechte` — die
Abnahme misst genau das.

**Der Mitarbeiter** sieht seine Ordner im Benutzermenü der Kopfleiste unter
**Mein Firmenordner** (`features/firmenordner/`), neben seinen Ausweisen: die
Adresse des Dienstes und die Liste aus `GET /api/firmenordner`, mit Stufe. Ein
Ordner ohne Recht steht dort nicht, auch sein Name nicht.

## Was nicht in dieser Karte steht

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
# 1. Anschalten -- und BEIDE Container anfassen
echo 'COMPOSE_PROFILES=firmenordner' >> .env
docker compose up -d firmenordner dashboard-backend

# 2. Die Menschen, die es schon gibt, nachtragen
curl -sk -X POST https://arasul/api/firmenordner/abgleich \
  -H "Cookie: arasul_session=…" -H "X-CSRF-Token: …"

# 3. Einen Bereich und ein Projekt darin
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"projekte","name":"Projekte","ebene":1}'
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"vicona","name":"Vicona","ebene":2,"eltern":"projekte"}'

# 4. Die Wurzel (genau eine; die Verwaltung hat dafür einen Knopf)
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"firma","name":"Firma","art":"wurzel"}'

# 5. Und den Ordner, den nur das Gerät liest
curl -sk -X POST https://arasul/api/firmenordner/ordner … \
  -d '{"kennung":"geraet","name":"Am Gerät","ebene":1,"art":"am_geraet"}'

# 5. Rechte
curl -sk -X POST https://arasul/api/firmenordner/rechte … \
  -d '{"ordner_id":2,"benutzer_id":3,"recht":"schreiben"}'
```

Ein Mensch, dessen Passwort danach einmal gesetzt wird, kommt herein. Sein CLI
fragt `GET /api/firmenordner` und weiß, wohin.
