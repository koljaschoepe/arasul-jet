#!/bin/bash
# =============================================================================
# Das Terminal am Geraet einrichten (Karte terminal-im-frontend, M5, 21.10.2026)
# =============================================================================
# Einmal je Geraet, mit sudo, aus der Wurzel der Installation:
#
#     sudo ./scripts/terminal/einrichten.sh
#
# Danach `COMPOSE_PROFILES=terminal` in die .env und
# `docker compose up -d terminal dashboard-backend`. Je Person dann
# `sudo ./scripts/terminal/nutzer.sh anlegen ara-<id>`.
#
# WAS ES ANLEGT, UND WARUM JEDES STUECK DA IST. Die Tuer in der Oberflaeche
# entscheidet nur, ob jemand hineinkommt und als wer. Was er danach darf,
# entscheidet Linux, und genau das richtet dieses Skript ein:
#
#   1. Die Gruppe `arasul-terminal`. Jeder Terminal-Nutzer hat sie als
#      HAUPTgruppe; an ihr haengen sshd-Regeln und Firewall. Kein Nutzer hat
#      `sudo`, `docker` oder `adm` dazu.
#   2. Eine sshd-Regel fuer diese Gruppe: nur Schluessel, und zwar nur aus
#      einer Datei, die root gehoert (`/etc/arasul-terminal/schluessel/<nutzer>`;
#      ein Nutzer kann sich keinen eigenen Zugang dazulegen), keine
#      Weiterleitungen, kein Tunnel, kein Agent. Ein Terminal ist eine Shell
#      und kein Weg in die Docker-Netze dahinter.
#   3. Eine Firewall fuer diese Gruppe (iptables, Kette `ARASUL_TERMINAL`):
#      Internet ja; vom Geraet selbst nur DNS und die Ports der Oberflaeche
#      (80, 443, 8443), also die Apps ueber `arasul.mjs call` und der
#      Firmenordner, aber kein Ollama, keine Datenbank, kein sshd, kein
#      Traefik-Dashboard; die Docker-Netze gar nicht. Ein systemd-Dienst setzt
#      sie nach jedem Start neu.
#   4. Schluessel, known_hosts und das Geheimnis der Tuer in
#      `config/secrets/terminal/` (0700, gehoert dem Besitzer der Installation,
#      denn als dessen Kennung laufen Backend und Terminal-Container).
#
# Wiederholbar: jeder Schritt prueft, ob er schon getan ist. Ein vorhandener
# Schluessel und ein vorhandenes Geheimnis bleiben.
#
# Abbauen: `sudo ./scripts/terminal/einrichten.sh --abbauen` (nimmt sshd-Regel,
# Firewall und Dienst weg; Nutzer vorher mit `nutzer.sh entfernen`).
# =============================================================================
set -euo pipefail

WURZEL="${ARASUL_WURZEL:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GRUPPE=arasul-terminal
ETC=/etc/arasul-terminal
SSHD_REGEL=/etc/ssh/sshd_config.d/10-arasul-terminal.conf
DIENST=/etc/systemd/system/arasul-terminal-netz.service
NETZ_SKRIPT="$ETC/netz.sh"
GEHEIM="${SECRETS_PFAD:-$WURZEL/config/secrets}/terminal"

sag() { printf '%s\n' "$*"; }
stirb() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || stirb "Bitte mit sudo aufrufen."

# Die Adresse, von der der Terminal-Container per ssh kommt: das Netz
# `arasul-terminal` (compose.core.yaml). Aus der .env, sonst die Vorgabe.
netz_terminal() {
  local wert=""
  if [ -f "$WURZEL/.env" ]; then
    wert="$(grep -E '^NETZ_TERMINAL=' "$WURZEL/.env" | tail -1 | cut -d= -f2- | tr -d '"' || true)"
  fi
  printf '%s' "${NETZ_TERMINAL:-${wert:-172.30.1.64/26}}"
}

abbauen() {
  if [ -x "$NETZ_SKRIPT" ]; then "$NETZ_SKRIPT" aus || true; fi
  if [ -f "$DIENST" ]; then
    systemctl disable --now arasul-terminal-netz.service >/dev/null 2>&1 || true
    rm -f "$DIENST"
    systemctl daemon-reload || true
  fi
  if [ -f "$SSHD_REGEL" ]; then
    rm -f "$SSHD_REGEL"
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  fi
  rm -f "$NETZ_SKRIPT"
  sag "Abgebaut: sshd-Regel, Firewall und Dienst. Gruppe, Nutzer und $GEHEIM bleiben."
  exit 0
}

[ "${1:-}" = "--abbauen" ] && abbauen

BESITZER_UID="$(stat -c %u "$WURZEL")"
BESITZER_GID="$(stat -c %g "$WURZEL")"
[ "$BESITZER_UID" -ne 0 ] || stirb "$WURZEL gehoert root; die Installation gehoert einem Nutzer (meist arasul)."

# --- 1. Gruppe ----------------------------------------------------------------
if ! getent group "$GRUPPE" >/dev/null; then
  groupadd --system "$GRUPPE"
  sag "Gruppe $GRUPPE angelegt."
fi

# --- 2. sshd ------------------------------------------------------------------
NETZ="$(netz_terminal)"
install -d -m 0755 "$ETC" "$ETC/schluessel"
cat >"$SSHD_REGEL" <<EOF
# Arasul: das Terminal fuer Entwickler (scripts/terminal/einrichten.sh).
# Nur fuer die Gruppe $GRUPPE. Das abschliessende "Match all" ist Pflicht:
# diese Datei wird am ANFANG von sshd_config eingebunden, und ohne es gaelte
# alles, was dort danach steht, nur noch fuer diese Gruppe.
Match Group $GRUPPE
    AuthorizedKeysFile $ETC/schluessel/%u
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    AllowTcpForwarding no
    AllowStreamLocalForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitUserRC no
    GatewayPorts no
Match all
EOF
chmod 0644 "$SSHD_REGEL"
if command -v sshd >/dev/null 2>&1; then
  sshd -t || {
    rm -f "$SSHD_REGEL"
    stirb "sshd nimmt die Regel nicht an; sie ist wieder entfernt."
  }
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null ||
    sag "Hinweis: sshd liess sich nicht neu laden; die Regel gilt ab dem naechsten Start."
  sag "sshd-Regel $SSHD_REGEL gesetzt."
else
  sag "Hinweis: kein sshd auf diesem Geraet; ohne ihn kommt das Terminal nicht an."
fi

# --- 3. Firewall --------------------------------------------------------------
cat >"$NETZ_SKRIPT" <<'EOF'
#!/bin/bash
# Firewall der Terminal-Nutzer (gesetzt von scripts/terminal/einrichten.sh).
# Gilt fuer jeden Prozess, dessen Hauptgruppe arasul-terminal ist.
#   an   Kette ARASUL_TERMINAL neu fuellen und vor OUTPUT haengen
#   aus  Kette abhaengen und loeschen
set -euo pipefail
GRUPPE=arasul-terminal
PORTS="${TERMINAL_ERLAUBTE_PORTS:-80 443 8443}"
for ipt in iptables ip6tables; do
  command -v "$ipt" >/dev/null 2>&1 || continue
  case "${1:-an}" in
    an)
      "$ipt" -w -N ARASUL_TERMINAL 2>/dev/null || "$ipt" -w -F ARASUL_TERMINAL
      # DNS am Geraet (systemd-resolved auf 127.0.0.53).
      "$ipt" -w -A ARASUL_TERMINAL -o lo -p udp --dport 53 -j RETURN
      "$ipt" -w -A ARASUL_TERMINAL -o lo -p tcp --dport 53 -j RETURN
      # Die Oberflaeche des Geraets: Apps (arasul.mjs call) und Firmenordner.
      for p in $PORTS; do
        "$ipt" -w -A ARASUL_TERMINAL -m addrtype --dst-type LOCAL -p tcp --dport "$p" -j RETURN
      done
      # Alles andere am Geraet selbst: Ollama, Postgres, sshd, Traefik-Dashboard ...
      "$ipt" -w -A ARASUL_TERMINAL -m addrtype --dst-type LOCAL -j REJECT
      # Die Docker-Netze (Container-Adressen sind keine eigenen des Geraets).
      if [ "$ipt" = iptables ]; then
        "$ipt" -w -A ARASUL_TERMINAL -d 172.16.0.0/12 -j REJECT
      fi
      "$ipt" -w -C OUTPUT -m owner --gid-owner "$GRUPPE" -j ARASUL_TERMINAL 2>/dev/null ||
        "$ipt" -w -I OUTPUT 1 -m owner --gid-owner "$GRUPPE" -j ARASUL_TERMINAL
      ;;
    aus)
      while "$ipt" -w -D OUTPUT -m owner --gid-owner "$GRUPPE" -j ARASUL_TERMINAL 2>/dev/null; do :; done
      "$ipt" -w -F ARASUL_TERMINAL 2>/dev/null || true
      "$ipt" -w -X ARASUL_TERMINAL 2>/dev/null || true
      ;;
  esac
done
EOF
chmod 0755 "$NETZ_SKRIPT"
"$NETZ_SKRIPT" an
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat >"$DIENST" <<EOF
[Unit]
Description=Arasul: Firewall der Terminal-Nutzer
After=network-pre.target
Before=ssh.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$NETZ_SKRIPT an
ExecStop=$NETZ_SKRIPT aus

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable arasul-terminal-netz.service >/dev/null 2>&1 || true
fi
sag "Firewall fuer $GRUPPE gesetzt (Kette ARASUL_TERMINAL)."

# --- 4. Schluessel, known_hosts, Geheimnis der Tuer ---------------------------
install -d -m 0700 -o "$BESITZER_UID" -g "$BESITZER_GID" "$GEHEIM"
if [ ! -s "$GEHEIM/schluessel" ]; then
  ssh-keygen -q -t ed25519 -N '' -C arasul-terminal -f "$GEHEIM/schluessel"
  sag "Schluessel des Terminals erzeugt."
fi
if [ ! -s "$GEHEIM/tor_geheimnis" ]; then
  (umask 077 && openssl rand -hex 32 >"$GEHEIM/tor_geheimnis")
  sag "Geheimnis der Tuer erzeugt."
fi
HOSTKEY=/etc/ssh/ssh_host_ed25519_key.pub
if [ -s "$HOSTKEY" ]; then
  PORT="${TERMINAL_SSH_PORT:-22}"
  if [ "$PORT" = 22 ]; then ziel=host.docker.internal; else ziel="[host.docker.internal]:$PORT"; fi
  printf '%s %s\n' "$ziel" "$(cut -d' ' -f1,2 "$HOSTKEY")" >"$GEHEIM/known_hosts"
else
  sag "Hinweis: $HOSTKEY fehlt; ohne ihn prueft der Container den sshd nicht und verbindet nicht."
fi
cp "$GEHEIM/schluessel.pub" "$ETC/schluessel.pub"
chmod 0644 "$ETC/schluessel.pub"
printf '%s\n' "$NETZ" >"$ETC/netz"
chown -R "$BESITZER_UID:$BESITZER_GID" "$GEHEIM"
chmod 0600 "$GEHEIM"/schluessel "$GEHEIM"/tor_geheimnis
sag "Einrichtung in $GEHEIM (Besitzer $BESITZER_UID, 0700). Der Container kommt aus $NETZ."

sag ""
sag "Fertig. Weiter:"
sag "  1. COMPOSE_PROFILES=terminal in die .env (neben firmenordner, mit Komma)"
sag "  2. docker compose up -d terminal dashboard-backend"
sag "  3. je Person: sudo ./scripts/terminal/nutzer.sh anlegen ara-<id>"
