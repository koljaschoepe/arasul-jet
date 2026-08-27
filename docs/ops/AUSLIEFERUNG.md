# Auslieferung

> Wie ein Stand dieses Repos auf ein Gerät beim Kunden kommt.
> Stand: 27.08.2026 (Phase C10 des Umbaus vom 26.08.2026).

Ein Satz vorweg: **das Artefakt ist der Bauplan, nicht das Gebäude.** Es
enthält den Quellstand, keine Docker-Images. Die Images tragen CUDA, laufen auf
ARM64 mit der NVIDIA-Laufzeit des Jetson, und ein GitHub-Läufer ist x86 ohne
GPU. Das Gerät baut deshalb selbst, beim ersten Start.

## Der Weg in drei Schritten

```
Tag `v1.2.0` im Jet-Repo
   └─ .github/workflows/release.yml
        └─ scripts/deploy/artefakt-bauen.sh
             └─ arasul-1.2.0.tar.gz  (+ .sha256)
                  └─ GitHub-Release am öffentlichen Jet-Repo
                       └─ ARA_INSTALLER_URL der Website zeigt darauf
                            └─ curl arasul.de/api/install | bash
                                 └─ install.sh im Artefakt
                                      └─ ./arasul bootstrap
```

## Das Artefakt

| Was            | Wert                                                             |
| -------------- | ---------------------------------------------------------------- |
| Dateiname      | `arasul-<Fassung>.tar.gz`                                        |
| Verzeichnis    | ein einziges, `arasul-<Fassung>/`                                |
| Einstiegspunkt | `install.sh` im Wurzelverzeichnis                                |
| Beschreibung   | `arasul-release.json` im Wurzelverzeichnis                       |
| Prüfsumme      | `arasul-<Fassung>.tar.gz.sha256` als zweite Datei am Release      |
| Gebaut von     | `scripts/deploy/artefakt-bauen.sh` (aus `git archive`, nicht aus dem Arbeitsverzeichnis) |

`arasul-release.json`:

```json
{
  "fassung": "1.2.0",
  "commit": "a1b2c3d",
  "gebaut": "2026-08-27T20:15:00Z",
  "einstiegspunkt": "install.sh",
  "repo": "Arasul-GmbH/arasul-jet"
}
```

**Der Einstiegspunkt nennt sich selbst.** Das Ara-Kit (`lib/install.mjs`) und
`/api/install` der Website lesen `einstiegspunkt` aus dieser Datei und rufen
genau diese Datei im ausgepackten Verzeichnis auf. Sie raten nicht, und der
Name lässt sich ändern, ohne dass zwei fremde Repos gleichzeitig angefasst
werden müssen.

Was nicht im Artefakt liegt: `.git`, `.github`, `.claude`, `.husky`, `tests/`,
`docs/plans`, `docs/archive`, alles Unversionierte. `docs/` selbst liegt drin,
weil `/api/docs` die Schnittstellenbeschreibung ausliefert und das
Admin-Handbuch auf das Gerät gehört, auf dem es gebraucht wird.

## Die Fassung kommt aus dem Bau

Bis zum 27.08.2026 stand sie in einer Datei `VERSION`, und dort stand
`1.0.0` — seit Monaten unverändert, unabhängig davon, was gerade lief. Phase B7
hat den Rückfall deshalb auf `0.0.0` gesetzt; damit lehnte `validateManifest`
jedes Paket mit einer `min_version` ab, mit der Begründung „Current version
0.0.0 is below minimum required version 1.0.0". Beides sind Sätze über eine
Datei, nicht über ein Gerät.

Jetzt (`scripts/lib/fassung.sh`), in dieser Reihenfolge:

1. `arasul-release.json` im Wurzelverzeichnis — der Weg des Artefakts.
2. Git: ein Tag genau auf `HEAD` ergibt die Tag-Nummer ohne `v`, sonst
   `JJJJMMTT-<sieben Stellen SHA>` — der Weg des Deploys auf den Orin.
3. Nichts. Dann sagt das Gerät „Vorserie" und nimmt keine Aktualisierung an.

Wo die Zahl landet:

| Weg                      | Wer setzt sie                              | Wohin                    |
| ------------------------ | ------------------------------------------ | ------------------------ |
| Installation aus Artefakt | `install.sh`                              | `SYSTEM_VERSION` in `.env` |
| Deploy nach `main`       | `scripts/deploy/deploy-local.sh` (Schritt 1a) | `SYSTEM_VERSION` in `.env` |
| Anzeige                  | `utils/version.js`                         | `/api/health`, `/api/system/info`, Einstellungen |

Der Deploy startet danach `dashboard-backend` neu, und nur den. Die Fassung
wechselt bei jedem Deploy (sie trägt den SHA); den ganzen Stapel deswegen
durchzusehen, hätte dieses Repo schon einmal elf Deploys in 66 Minuten
gekostet.

## Die Adresse des Artefakts

Die Website bekommt **eine** Umgebungsvariable, `ARA_INSTALLER_URL`, und sie
zeigt auf die Release-Datei:

```
https://github.com/Arasul-GmbH/arasul-jet/releases/download/v<Fassung>/arasul-<Fassung>.tar.gz
```

`arasul.de/api/download` streamt diese Datei hinter dem Kunden-Token;
`arasul.de/api/install` liefert ein kleines Shell-Skript, das sie lädt,
auspackt und den Einstiegspunkt aufruft. Beide bleiben unverändert — hier steht
nur die Form der Adresse, das Website-Repo zieht eine eigene Phase nach.

Solange die Website die Adresse noch nicht hat, geht es direkt:

```bash
curl -fsSLO https://github.com/Arasul-GmbH/arasul-jet/releases/download/v1.2.0/arasul-1.2.0.tar.gz
curl -fsSLO https://github.com/Arasul-GmbH/arasul-jet/releases/download/v1.2.0/arasul-1.2.0.tar.gz.sha256
sha256sum -c arasul-1.2.0.tar.gz.sha256
tar xzf arasul-1.2.0.tar.gz
cd arasul-1.2.0
./install.sh
```

## Was `install.sh` tut

Es ist eine dünne Schicht über `./arasul bootstrap`. Es legt an, was der
Bootstrap voraussetzt und was ein unbeaufsichtigter Lauf nicht erfragen kann:

1. Fassung aus `arasul-release.json` lesen. Fehlt sie, bricht es ab — ein Gerät
   ohne Fassung nimmt später keine Aktualisierung an, und das fällt erst
   Monate später auf.
2. Voraussetzungen prüfen: `docker`, `docker compose`, `openssl`, `curl`, und
   ob der Docker-Dienst diesem Benutzer antwortet.
3. `.env` schreiben (`scripts/interactive_setup.sh --non-interactive`). Ohne
   `--passwort` erzeugt es ein Startpasswort und zeigt es **einmal** am Ende.
4. Netzname setzen (`scripts/setup/setup-mdns.sh`): System-Hostname für DHCP
   plus Avahi für `.local`. Siehe
   [NETZNAME_UND_ZERTIFIKAT.md](NETZNAME_UND_ZERTIFIKAT.md).
5. `./arasul bootstrap` — Hardware, Zertifikate, Images bauen, Datenbank,
   Dienste, Admin, **Kit-Schlüssel**, Rauchtest.
6. `arasul-platform.service` installieren, damit das Gerät nach einem Neustart
   von selbst hochkommt (in der richtigen Reihenfolge, nicht dreizehn Container
   gleichzeitig auf einem gerade gestarteten Orin).

Optionen:

```bash
./install.sh                          # Passwort wird erzeugt und einmal gezeigt
./install.sh --passwort 'Geheim123'   # Passwort vorgeben
./install.sh --name werkstatt         # anderer Netzname als `arasul`
```

## Was der Bootstrap einmal zeigt

Am Ende stehen zwei Dinge auf dem Bildschirm, und beide nur dort:

- **Das Startpasswort des Administrators** (wenn `install.sh` es erzeugt hat).
- **Der Deploy-Schlüssel für das Ara-Kit**, Bereich `app:deploy`. Mit ihm rollt
  ein Partner Apps auf dieses Gerät, ohne SSH und ohne Passwort (Phase C5). In
  der Datenbank steht nur sein bcrypt-Abdruck; nachschlagen geht nicht.

Verloren? Ein neuer Schlüssel, der alte wird entwertet:

```bash
bash scripts/util/kit-schluessel.sh liste
bash scripts/util/kit-schluessel.sh anlegen "Kit von Firma Meier"
bash scripts/util/kit-schluessel.sh widerrufen aras_ab12cd3
```

## Was gefallen ist, und warum

| Weg                                   | Stand      | Begründung                                                                                                                                             |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/deploy/create-factory-image.sh` | gestrichen | Baute Images auf einem Quellgerät und packte sie mit. Das Artefakt aus der CI kann das nicht (x86, keine GPU) und braucht es nicht: das Gerät baut selbst. Zwei Auslieferungswege wären zwei Geräte-Zustände. |
| `scripts/deploy/factory-install.sh`    | gestrichen | Der Einstiegspunkt des Factory-Images. Fällt mit ihm; `install.sh` ist der eine Einstiegspunkt.                                                          |
| `scripts/deploy/create-deployment-image.sh` | gestrichen | Dritter Packer derselben Art, und er lud `llama3.1:8b` vor — ein Modell, das seit Phase C8 nicht mehr im Katalog steht. Er lieferte also aktiv Falsches aus. |
| `packaging/build_deb.sh` + `DEBIAN/`   | gestrichen | Ein `.deb` der Plattform. Niemand rief es auf, keine Zeile Dokumentation beschrieb den Weg, und die Auslieferung ist ein Tarball mit Einstiegspunkt. Die **systemd-Units** unter `packaging/arasul-platform/etc/` bleiben: `install.sh` und `./arasul bootstrap` installieren sie. |
| `scripts/deploy/create-update-package.sh` | bleibt, nachgezogen | Erzeugt die signierten `.araupdate`-Pakete für den Offline-Weg über USB, und der lebt (`updateService`, `scripts/util/arasul-usb-trigger.sh`). Nachgezogen: die Fassung kommt aus dem Bau statt aus `VERSION`, und `PROJECT_ROOT` zeigte auf `scripts/` statt auf das Wurzelverzeichnis. |
| Datei `VERSION`                        | gestrichen | Siehe oben.                                                                                                                                             |

## Abnahme

```bash
# Am Gerät, der zerstörende Teil:
sudo bash scripts/setup/factory-reset.sh
curl -fsSL https://arasul.de/api/install | bash

# Vom Arbeitsrechner, alles über die Schnittstelle:
ssh -f -N -L 8443:localhost:443 jetson
ARASUL_PASSWORT=... bash scripts/test/auslieferung-abnahme.sh
```

Das Abnahmeskript misst die Fassung, das CA-Zertifikat, die Namen im
Zertifikat, TLS ohne SNI und den Kit-Schlüssel. Was es nicht beweisen kann:
dass die Installation aus dem Artefakt kam. Es sieht nur das Ergebnis; der
Beweis ist der Ablauf oben.
