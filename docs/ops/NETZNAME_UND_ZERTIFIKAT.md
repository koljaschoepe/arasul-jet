# Netzname und Zertifikat

> Unter welchem Namen ein Mitarbeiter das Gerät erreicht, und was sein Browser
> beim ersten Aufruf sieht.
> Stand: 27.08.2026 (Phase C10 des Umbaus vom 26.08.2026).

## Kurz

| Adresse                             | Woher der Name kommt                   | Wann sie geht                                      |
| ----------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `https://arasul/`                   | DHCP-Hostname, der Router löst ihn auf | fast immer (Fritzbox und die meisten Firmenrouter) |
| `https://arasul.local/`             | mDNS über Avahi                        | immer, auch ohne mitspielenden Router              |
| `https://192.168.1.50/`             | die IP selbst                          | immer                                              |
| `https://<gerät>.<tailnet>.ts.net/` | Tailscale MagicDNS                     | von unterwegs, mit browser-vertrautem Schloss      |

Alle vier zeigen auf dasselbe Traefik. Alle vier stehen im Zertifikat des
Geräts — bis auf die letzte, die Tailscale selbst absichert.

## Der Name

Das Gerät heißt schlicht **`arasul`**. Diesen Namen setzt
`scripts/setup/setup-mdns.sh` an zwei Stellen:

1. **System-Hostname** (`hostnamectl set-hostname arasul`). Der DHCP-Client
   meldet ihn beim Router an, und ein Router, der DHCP-Namen in seinen DNS
   einträgt — eine Fritzbox tut das, die meisten Firmenrouter auch — löst
   danach `arasul` im ganzen Netz auf. Daher `https://arasul/` **ohne**
   `.local`.
2. **Avahi** (`/etc/avahi/avahi-daemon.conf`, `host-name=arasul`). Das ist der
   Rückfall: mDNS braucht keinen Router, der mitspielt, sondern nur ein
   Betriebssystem, das mDNS kann. Windows 10 ab 1809, macOS, iOS und Android
   14 können es. Daher `https://arasul.local/`.

Ein anderer Name geht bei der Installation:

```bash
./install.sh --name werkstatt      # https://werkstatt/ und https://werkstatt.local/
```

**Zwei Arasul-Geräte im selben Netz brauchen zwei Namen.** Beide hießen sonst
`arasul`, und mDNS gäbe dem zweiten von selbst `arasul-2.local` — der Name
stünde dann aber nicht im Zertifikat. Bei der Installation des zweiten Geräts
also `--name` setzen.

Nachträglich ändern:

```bash
sudo MDNS_NAME=werkstatt bash scripts/setup/setup-mdns.sh
./arasul zertifikat        # das Zertifikat trägt sonst weiter den alten Namen
```

## Das Zertifikat

Das Gerät stellt sein TLS-Zertifikat selbst aus. Dafür entsteht beim ersten
Start eine **Geräte-CA** (`scripts/security/geraete-zertifikat.sh`):

```
config/traefik/certs/
  arasul-ca.key    der private Schlüssel der CA. Verlässt das Gerät nie.
  arasul-ca.crt    das CA-Zertifikat. Das ist die Datei, die verteilt wird.
  arasul.key       der private Schlüssel des Geräts.
  arasul.crt       das Zertifikat des Geräts, dahinter die CA (die Kette).
```

Warum eine eigene CA und nicht weiter ein selbstsigniertes Zertifikat: ein
selbstsigniertes muss **jeder** Mitarbeiter an **jedem** Gerät einzeln als
Ausnahme bestätigen, und in Chrome und auf iOS geht das seit Jahren nur über
Umwege. Mit einer eigenen CA verteilt der Admin **eine** Datei, und danach ist
jeder Name dieses Geräts vertraut — auch nach einer Erneuerung des
Zertifikats, denn die CA bleibt dieselbe.

Es gibt **keine** Firmen-CA, die alle Kundengeräte unterschreibt. Die wäre ein
einziger Punkt, an dem alle Kunden gleichzeitig verlieren. Wer den Schlüssel
eines Geräts hat, kann sich als dieses eine Gerät ausgeben und sonst nichts.

### Zwei Laufzeiten, mit Absicht verschieden

| Was              | Laufzeit | Warum                                                                                                                                                                           |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geräte-CA        | 10 Jahre | Sie wird verteilt. Ein Wechsel kostet den Admin einen zweiten Rundgang durch die Firma.                                                                                         |
| Gerätezertifikat | 800 Tage | Apple lehnt seit September 2020 jedes Serverzertifikat über 825 Tage ab, auch von einer vertrauten CA. Ein Zertifikat über zehn Jahre wäre auf jedem iPhone der Firma ungültig. |

Die 800 Tage erneuert die Selbstheilung von selbst, sobald weniger als 60 Tage
bleiben (`services/self-healing-agent/healing_engine.py`,
`check_tls_cert_expiry`, geprüft alle zwei Stunden). Die CA bleibt dabei
dieselbe; verteilt werden muss nichts noch einmal. Von Hand geht es mit
`./arasul zertifikat`.

## Die CA verteilen

Der Admin lädt die Datei einmal herunter: **Einstellungen → Sicherheit →
Gerätezertifikat herunterladen** (`GET /api/system/ca-zertifikat`, nur für
Administratoren). Heraus kommt `arasul-ca.crt`.

**Bis dahin sieht jeder Browser eine Warnung, und das ist auch richtig so.** Es
gibt keinen Trick, der sie vorher wegnimmt; jede Anleitung, die etwas anderes
behauptet, meint „auf Weiter klicken".

### Windows 10 / 11

```powershell
# Als Administrator, für alle Benutzer des Rechners:
Import-Certificate -FilePath .\arasul-ca.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
```

Von Hand: Doppelklick auf die Datei → _Zertifikat installieren_ →
_Lokaler Computer_ → _Alle Zertifikate in folgendem Speicher speichern_ →
_Vertrauenswürdige Stammzertifizierungsstellen_. Browser danach neu starten.
Firefox hat einen eigenen Speicher: _Einstellungen → Datenschutz →
Zertifikate anzeigen → Importieren → „Dieser CA vertrauen, um Websites zu
identifizieren"_.

Im Netz verteilen: Gruppenrichtlinie unter _Computerkonfiguration → Richtlinien
→ Windows-Einstellungen → Sicherheitseinstellungen → Richtlinien für
öffentliche Schlüssel → Vertrauenswürdige Stammzertifizierungsstellen_.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain arasul-ca.crt
```

Von Hand: Doppelklick öffnet die Schlüsselbundverwaltung → Schlüsselbund
_System_ → Doppelklick auf „Arasul Geräte-CA" → _Vertrauen_ → _Bei Verwendung
dieses Zertifikats: Immer vertrauen_. Safari und Chrome nutzen diesen
Schlüsselbund, Firefox seinen eigenen (siehe oben).

### iOS und iPadOS

Zwei Schritte, und der zweite wird gern vergessen:

1. Die Datei auf das Gerät bringen (AirDrop, Mail an sich selbst, oder in
   Safari `https://arasul/api/system/ca-zertifikat` aufrufen und die Warnung
   durchklicken). iOS meldet „Profil geladen" → _Einstellungen → Geladenes
   Profil → Installieren_.
2. **Vertrauen erteilen**: _Einstellungen → Allgemein → Info → Vertrauen für
   Zertifikate_ → den Schalter neben „Arasul Geräte-CA" einschalten. Ohne
   diesen zweiten Schritt ist das Profil installiert und das Zertifikat
   trotzdem nicht vertraut.

### Android

Ab Android 7 unterscheidet das System _Benutzer_- und _System_-Zertifikate.
Chrome und die meisten Apps trauen Benutzer-Zertifikaten für normales Surfen;
eine App mit eigener Zertifikatsprüfung kann sie ablehnen.

_Einstellungen → Sicherheit → Verschlüsselung und Anmeldedaten →
Zertifikat installieren → CA-Zertifikat → Trotzdem installieren_ → die Datei
auswählen. Das Gerät verlangt dafür eine Bildschirmsperre.

Der Weg heißt je nach Hersteller anders; die Suche in den Einstellungen nach
„Zertifikat" führt überall hin.

## TLS über eine IP-Adresse

`https://192.168.1.50/` muss funktionieren, weil das der erste Weg ist, den ein
Admin probiert, wenn der Name noch nicht auflöst. Zwei Dinge machen ihn
möglich, und beide stehen seit Phase C10 fest:

1. Das Zertifikat trägt **jede** IPv4-Adresse des Geräts als
   `subjectAltName` (`hostname -I` plus die Docker-Brücken).
2. Traefik hat ein **Vorgabezertifikat**
   (`stores.default.defaultCertificate` in `config/traefik/dynamic/tls.yml`).
   Ein Browser auf einer IP schickt keinen Namen mit — eine IP ist keine SNI —,
   und ohne Vorgabe hätte Traefik an dieser Stelle nichts anzubieten.
   `sniStrict` bleibt aus demselben Grund `false`.

### `tailscale serve` ist raus, und warum (27./28.08.2026)

Am 27.08.2026 brach `https://100.121.244.80` (die **Tailscale**-Adresse des
Orin) mit `tls: internal error` (Alert 80) ab, während derselbe Aufruf durch
einen SSH-Tunnel auf `localhost` funktionierte.

Die Ursache war nicht Traefik. Auf dem Orin lief

```
tailscale serve --bg --https=443 https+insecure://127.0.0.1:443
```

(gesetzt von `scripts/setup/setup-tailscale.sh`, damit der MagicDNS-Name ein
browser-vertrautes Schloss hat). Damit hörte **tailscaled** auf Port 443 der
Tailscale-Adresse. tailscaled kennt genau ein Zertifikat, nämlich das auf
`<gerät>.<tailnet>.ts.net`, und sucht es über den Namen im ClientHello. Ein
Aufruf über die rohe IP nennt keinen Namen, tailscaled findet nichts und bricht
ab. Der SSH-Tunnel geht auf `127.0.0.1:443` und damit an tailscaled vorbei.

Einen Tag später kam die Rechnung: nach einem Werksreset **startete der
`reverse-proxy` gar nicht mehr**. tailscaled hielt `100.121.244.80:443`, und
ein Wildcard-Bind auf `0.0.0.0:443` schlägt fehl, solange eine einzelne Adresse
denselben Port hält. Das Gerät war damit im **eigenen Firmennetz** nicht mehr
erreichbar — wegen einer Bequemlichkeit für den Fernzugriff.

**Entscheidung (28.08.2026, Phase C10): `tailscale serve` fällt.** Es ist aus
`setup-tailscale.sh` entfernt, das Verbinden über die Oberfläche schaltet es
nicht mehr ein, und die drei Endpunkte `/api/tailscale/serve` samt dem
Assistenten-Schritt „Sicherer Name" gibt es nicht mehr. Ein vorhandenes `serve`
aus einer früheren Einrichtung wird beim nächsten Verbinden mit
`tailscale serve reset` zurückgenommen.

Was an seine Stelle tritt: **nichts Neues.** Ohne `serve` antwortet Traefik auf
allen Adressen des Geräts — LAN-IP, Netzname, Tailscale-IP und MagicDNS-Name —
mit demselben Zertifikat aus der Geräte-CA. Es gibt damit genau einen Weg zum
vertrauten Schloss, und er gilt für beide Netze: die CA einmal verteilen (siehe
oben).

Nachsehen, wer auf 443 hört:

```bash
sudo ss -lntp | grep ':443'          # erwartet: NUR docker-proxy auf 0.0.0.0
tailscale serve status               # erwartet: "No serve config"
openssl s_client -connect 100.121.244.80:443 -noservername </dev/null   # Zertifikat
openssl s_client -connect 192.168.1.50:443  -noservername </dev/null    # Zertifikat
```

## Prüfen

```bash
# Was der Browser bekommt:
openssl s_client -connect arasul:443 -servername arasul </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

# Hat die verteilte CA dieses Zertifikat unterschrieben?
openssl verify -CAfile arasul-ca.crt <(openssl s_client -connect arasul:443 \
  -servername arasul </dev/null 2>/dev/null | openssl x509)

# Alles auf einmal, über die Schnittstelle:
bash scripts/test/auslieferung-abnahme.sh
```
