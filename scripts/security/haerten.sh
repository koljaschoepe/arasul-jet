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

NODE_ENV_WERT="$(env_wert NODE_ENV)"
SSH_HAERTEN="$(env_wert ENABLE_SSH_HARDENING true)"
FIREWALL="$(env_wert ENABLE_FIREWALL true)"
SSH_PORT_SOLL="$(env_wert SSH_PORT 2222)"

if [ "$NODE_ENV_WERT" != "production" ]; then
    info "Haertung uebersprungen: NODE_ENV ist '${NODE_ENV_WERT:-leer}', nicht production"
    exit 0
fi
if [ "$SSH_HAERTEN" != "true" ] && [ "$FIREWALL" != "true" ]; then
    info "Haertung uebersprungen: ENABLE_SSH_HARDENING und ENABLE_FIREWALL stehen auf false"
    exit 0
fi

# Wie kommen wir an root? Leer heisst: gar nicht.
ALS_ROOT=()
if [ "$(id -u)" -eq 0 ]; then
    ALS_ROOT=(env)
elif command -v "$SUDO_BEFEHL" >/dev/null 2>&1 && "$SUDO_BEFEHL" -n true 2>/dev/null; then
    ALS_ROOT=("$SUDO_BEFEHL" -n)
else
    warnung "Haertung uebersprungen: sie braucht root, und 'sudo -n' verlangt hier ein Passwort (oder sudo fehlt)."
    warnung "  SSH bleibt, wie es ist (Passwort-Anmeldung erlaubt, Port unveraendert), und es gibt keine Firewall."
    warnung "  Nachholen: sudo bash ${WURZEL}/scripts/security/haerten.sh"
    exit 0
fi

ssh_port_jetzt() {
    "${ALS_ROOT[@]}" "$SSHD_BEFEHL" -T 2>/dev/null | awk '$1 == "port" { print $2; exit }'
}

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
printf '%s\n' "$PORT_NACHHER" > config/ssh-port 2>/dev/null || true

if [ "$PORT_NACHHER" != "$PORT_VORHER" ]; then
    warnung "SSH-Port geaendert: ${PORT_VORHER} -> ${PORT_NACHHER}. Das Ara-Kit erreicht dieses Geraet ab jetzt nur noch mit --port ${PORT_NACHHER}."
    warnung "  Von Hand: ssh -p ${PORT_NACHHER} $(id -un)@<geraet>. Die laufende Sitzung bleibt bestehen."
fi
echo "ARASUL_SSH_PORT=${PORT_NACHHER}"

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
exit 0
