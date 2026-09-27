#!/bin/bash
# =============================================================================
# Haertung des Geraets: SSH und Firewall, ohne stille Fehler (J35, 25.09.2026)
# =============================================================================
# Bis zum 25.09.2026 rief der Bootstrap `harden-ssh.sh` und
# `setup-firewall.sh` ohne sudo auf, beide verlangen root, und `2>/dev/null`
# verschluckte die einzige Zeile, die das sagte. Im Protokoll stand
# "SSH-Hardening fehlgeschlagen (nicht kritisch)", und niemand erfuhr, warum.
# Und waere sie gelungen, laege SSH auf Port 2222, ohne dass das Ara-Kit davon
# wuesste -- es klopft beim naechsten Mal auf 22 und steht vor einer Wand.
#
# Deshalb hier, an einem Ort:
#
#   1. Root ist root, sonst `sudo -n` -- nie eine Passwortfrage, der Bootstrap
#      laeuft unbeaufsichtigt. Geht beides nicht, wird GESAGT, dass und warum
#      nicht, samt dem Befehl zum Nachholen.
#   2. Die Ausgabe der beiden Skripte wird gezeigt, eingerueckt, und nicht
#      weggeworfen. Scheitert eines, steht seine letzte Zeile in der Meldung.
#   3. Der SSH-Port wird vor und nach der Haertung bei `sshd -T` erfragt. Hat
#      er sich geaendert, steht das als Warnung da (das Kit sammelt Zeilen mit
#      "Warnung" aus der Ausgabe des Installers ein und zeigt sie am Ende) und
#      als Zeile `ARASUL_SSH_PORT=<port>` fuer eine Maschine. Dazu schreibt
#      das Skript den Port nach `config/ssh-port` -- die Erstausgabe nennt ihn
#      von dort.
#
# Schalter (Umgebung vor `.env`): ENABLE_SSH_HARDENING, ENABLE_FIREWALL
# (Vorgabe true), SSH_PORT (Vorgabe 2222), NODE_ENV (nur `production` haertet).
#
# EINE AKTUALISIERUNG HAERTET NICHT NACH (J35, 27.09.2026). Mit
# `--aktualisierung` (gesetzt vom Bootstrap, wenn `install.sh` ein vorhandenes
# Geraet uebernommen hat) bleiben SSH, ufw und fail2ban, wie sie sind. Am
# 26.09.2026 hat das Update von 0.8.10 auf 0.8.11 am Orin SSH von 22 auf 2222
# gelegt, Passwoerter gesperrt und ufw samt fail2ban eingeschaltet -- auf einem
# Geraet, dessen Betreiber das nie gewaehlt hatte, und das Kit klopfte danach
# ins Leere. Wer es trotzdem will, sagt es ausdruecklich: `ARASUL_HAERTEN=ja`
# (bzw. `./install.sh --haerten`). Abwaehlen bei der Erstinstallation:
# `./install.sh --ssh-behalten` (das Kit: `--keep-ssh`), also
# ENABLE_SSH_HARDENING=false und ENABLE_FIREWALL=false.
#
# Jeder Weg hinaus schreibt EINEN Satz nach `config/ssh-satz`: was mit SSH
# geschah. Die Schlussmeldung (`scripts/util/erstausgabe.sh`) zeigt ihn.
#
# Rueckgabe: immer 0. Die Haertung ist wichtig, aber kein Grund, eine sonst
# gelungene Installation rot zu machen -- dafuer ist die Meldung da.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL" || exit 0

# Fuer den Selbsttest: dort gibt es weder sshd noch ein echtes sudo.
SUDO_BEFEHL="${ARASUL_SUDO:-sudo}"
SSHD_BEFEHL="${ARASUL_SSHD:-sshd}"

env_wert() {
    local wert="${!1:-}"
    if [ -z "$wert" ] && [ -f .env ]; then
        wert=$(grep "^$1=" .env 2>/dev/null | tail -1 | cut -d'=' -f2- || true)
        case "$wert" in
            "'"*"'") wert="${wert#\'}"; wert="${wert%\'}" ;;
            '"'*'"') wert="${wert#\"}"; wert="${wert%\"}" ;;
        esac
    fi
    printf '%s' "${wert:-${2:-}}"
}

info()    { printf '[INFO] %s\n' "$*"; }
gut()     { printf '[OK] %s\n' "$*"; }
warnung() { printf '[WARNUNG] %s\n' "$*"; }

AKTUALISIERUNG=false
for arg in "$@"; do
    case "$arg" in
        --aktualisierung) AKTUALISIERUNG=true ;;
    esac
done

NODE_ENV_WERT="$(env_wert NODE_ENV)"
SSH_HAERTEN="$(env_wert ENABLE_SSH_HARDENING true)"
FIREWALL="$(env_wert ENABLE_FIREWALL true)"
SSH_PORT_SOLL="$(env_wert SSH_PORT 2222)"
AUSDRUECKLICH="$(env_wert ARASUL_HAERTEN nein)"

# Wie kommen wir an root? Leer heisst: gar nicht.
ALS_ROOT=()
if [ "$(id -u)" -eq 0 ]; then
    ALS_ROOT=(env)
elif command -v "$SUDO_BEFEHL" >/dev/null 2>&1 && "$SUDO_BEFEHL" -n true 2>/dev/null; then
    ALS_ROOT=("$SUDO_BEFEHL" -n)
fi

# `sshd -T` nennt die wirksame Einstellung; es braucht root. Ohne root bleibt
# der Blick in die Dateien -- ungenauer, aber nie falsch herum geraten.
sshd_wert() {
    if [ ${#ALS_ROOT[@]} -gt 0 ]; then
        "${ALS_ROOT[@]}" "$SSHD_BEFEHL" -T 2>/dev/null | awk -v k="$1" '$1 == k { print $2; exit }'
    fi
}
ssh_port_jetzt() {
    local port
    port="$(sshd_wert port)"
    if [ -z "$port" ]; then
        port="$(cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null \
            | awk 'tolower($1) == "port" { print $2; exit }')"
    fi
    printf '%s' "${port:-22}"
}

# Der eine Satz fuer die Schlussmeldung, dazu der Port fuer Kit und Erstausgabe.
satz() {
    printf '%s\n' "$1" > config/ssh-satz 2>/dev/null || true
    info "SSH: $1"
}
port_merken() {
    printf '%s\n' "$1" > config/ssh-port 2>/dev/null || true
    echo "ARASUL_SSH_PORT=$1"
}
bleibt() {
    local port anmeldung=""
    port="$(ssh_port_jetzt)"
    case "$(sshd_wert passwordauthentication)" in
        yes) anmeldung=", Anmeldung mit Passwort erlaubt" ;;
        no) anmeldung=", Anmeldung nur mit Schluessel" ;;
    esac
    satz "SSH bleibt, wie es ist (Port ${port}${anmeldung}): $1."
    port_merken "$port"
}

if [ "$AKTUALISIERUNG" = true ] && [ "$AUSDRUECKLICH" != "ja" ]; then
    bleibt "eine Aktualisierung haertet nicht nach, auch ufw und fail2ban bleiben unberuehrt (haerten: ./install.sh --haerten)"
    exit 0
fi
if [ "$NODE_ENV_WERT" != "production" ]; then
    info "Haertung uebersprungen: NODE_ENV ist '${NODE_ENV_WERT:-leer}', nicht production"
    bleibt "kein Produktivbetrieb (NODE_ENV=${NODE_ENV_WERT:-leer}), also keine Haertung"
    exit 0
fi
if [ "$SSH_HAERTEN" != "true" ] && [ "$FIREWALL" != "true" ]; then
    info "Haertung uebersprungen: ENABLE_SSH_HARDENING und ENABLE_FIREWALL stehen auf false"
    bleibt "die Haertung ist abgewaehlt (--ssh-behalten bzw. --keep-ssh)"
    exit 0
fi
if [ ${#ALS_ROOT[@]} -eq 0 ]; then
    warnung "Haertung uebersprungen: sie braucht root, und 'sudo -n' verlangt hier ein Passwort (oder sudo fehlt)."
    warnung "  SSH bleibt, wie es ist (Passwort-Anmeldung erlaubt, Port unveraendert), und es gibt keine Firewall."
    warnung "  Nachholen: sudo bash ${WURZEL}/scripts/security/haerten.sh"
    bleibt "fuer die Haertung fehlt sudo ohne Passwort"
    exit 0
fi

# Fuehrt ein Skript als root aus, zeigt seine Ausgabe eingerueckt und gibt
# seinen Rueckgabewert weiter. Die letzte nicht leere Zeile ist der Grund.
LETZTE_ZEILE=""
ausfuehren() {
    local ausgabe rc
    ausgabe="$("${ALS_ROOT[@]}" bash "$@" 2>&1)"
    rc=$?
    [ -n "$ausgabe" ] && printf '%s\n' "$ausgabe" | sed 's/^/    /'
    LETZTE_ZEILE="$(printf '%s\n' "$ausgabe" | awk 'NF { z = $0 } END { print z }')"
    return $rc
}

PORT_VORHER="$(ssh_port_jetzt)"
PORT_VORHER="${PORT_VORHER:-22}"
PORT_FUER_FIREWALL="$PORT_VORHER"

if [ "$SSH_HAERTEN" = "true" ]; then
    info "SSH-Haertung (Port ${SSH_PORT_SOLL}, nur Schluessel, fail2ban)..."
    if ausfuehren scripts/security/harden-ssh.sh --port "$SSH_PORT_SOLL" --non-interactive; then
        gut "SSH gehaertet"
    else
        warnung "SSH-Haertung fehlgeschlagen: ${LETZTE_ZEILE:-ohne Ausgabe}"
        warnung "  Nachholen: sudo bash ${WURZEL}/scripts/security/harden-ssh.sh --port ${SSH_PORT_SOLL}"
    fi
else
    info "SSH-Haertung uebersprungen (ENABLE_SSH_HARDENING=${SSH_HAERTEN})"
fi

PORT_NACHHER="$(ssh_port_jetzt)"
PORT_NACHHER="${PORT_NACHHER:-$PORT_VORHER}"
PORT_FUER_FIREWALL="$PORT_NACHHER"

if [ "$PORT_NACHHER" != "$PORT_VORHER" ]; then
    warnung "SSH-Port geaendert: ${PORT_VORHER} -> ${PORT_NACHHER}. Das Ara-Kit erreicht dieses Geraet ab jetzt nur noch mit --port ${PORT_NACHHER}."
    warnung "  Von Hand: ssh -p ${PORT_NACHHER} $(id -un)@<geraet>. Die laufende Sitzung bleibt bestehen."
fi
port_merken "$PORT_NACHHER"

if [ "$FIREWALL" = "true" ]; then
    info "Firewall (ufw: SSH ${PORT_FUER_FIREWALL}, 80, 443, mDNS, Tailscale)..."
    if ausfuehren scripts/security/setup-firewall.sh --ssh-port "$PORT_FUER_FIREWALL" --non-interactive; then
        gut "Firewall aktiv"
    else
        warnung "Firewall-Setup fehlgeschlagen: ${LETZTE_ZEILE:-ohne Ausgabe}"
        warnung "  Nachholen: sudo bash ${WURZEL}/scripts/security/setup-firewall.sh --ssh-port ${PORT_FUER_FIREWALL}"
    fi
else
    info "Firewall-Setup uebersprungen (ENABLE_FIREWALL=${FIREWALL})"
fi

mit_firewall=""
[ "$FIREWALL" = "true" ] && mit_firewall=" und Firewall (ufw)"
if [ "$SSH_HAERTEN" = "true" ]; then
    satz "SSH gehaertet: Port ${PORT_VORHER} -> ${PORT_NACHHER}, Anmeldung nur mit Schluessel, fail2ban${mit_firewall} (abwaehlbar mit ./install.sh --ssh-behalten)."
else
    satz "SSH bleibt auf Port ${PORT_NACHHER}, eingerichtet wurde nur die Firewall (ufw)."
fi
exit 0
