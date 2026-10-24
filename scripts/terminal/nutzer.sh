#!/bin/bash
# =============================================================================
# Terminal-Nutzer am Geraet (Karte terminal-im-frontend, M5, 21.10.2026)
# =============================================================================
#   sudo ./scripts/terminal/nutzer.sh anlegen   ara-<id>
#   sudo ./scripts/terminal/nutzer.sh entfernen ara-<id>
#   sudo ./scripts/terminal/nutzer.sh liste
#
# `<id>` ist die Kennung der Person am Geraet. Die Verwaltung nennt den Namen
# unter Personen, sobald der Schalter „Entwickler" an ist; die Person selbst
# sieht ihn im Terminal, solange er fehlt.
#
# EIN NUTZER HAT: einen eigenen Ordner `/home/ara-<id>` (0700, nur er), die
# Hauptgruppe `arasul-terminal` und sonst keine, kein Passwort, keinen sudo,
# kein docker. Hereinkommen kann er nur mit dem Schluessel des
# Terminal-Containers, der in einer Datei steht, die root gehoert. Dazu eine
# Grenze fuer Speicher und Rechenzeit, damit eine Sitzung dem Geraet nicht
# die Apps wegnimmt (`TERMINAL_SPEICHER`, `TERMINAL_CPU`).
#
# Voraussetzung: `sudo ./scripts/terminal/einrichten.sh`.
# =============================================================================
set -euo pipefail

GRUPPE=arasul-terminal
ETC=/etc/arasul-terminal
MUSTER='^ara-[1-9][0-9]{0,7}$'
SPEICHER="${TERMINAL_SPEICHER:-8G}"
CPU="${TERMINAL_CPU:-400%}"

sag() { printf '%s\n' "$*"; }
stirb() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || stirb "Bitte mit sudo aufrufen."

pruefe_name() {
  [[ "${1:-}" =~ $MUSTER ]] || stirb "Ein Terminal-Nutzer heisst ara-<id>, etwa ara-7 (nicht: '${1:-}')."
}

anlegen() {
  local n="$1"
  pruefe_name "$n"
  getent group "$GRUPPE" >/dev/null || stirb "Erst einrichten: sudo ./scripts/terminal/einrichten.sh"
  [ -s "$ETC/schluessel.pub" ] || stirb "Erst einrichten: $ETC/schluessel.pub fehlt."
  local netz
  netz="$(cat "$ETC/netz" 2>/dev/null || echo 172.30.1.64/26)"

  if id "$n" >/dev/null 2>&1; then
    [ "$(id -gn "$n")" = "$GRUPPE" ] || stirb "$n gibt es schon, aber nicht als Terminal-Nutzer."
    sag "$n gibt es schon; Schluessel und Grenzen werden erneuert."
  else
    # -K UMASK=077: was im eigenen Ordner neu entsteht, sieht kein anderer.
    useradd --create-home --home-dir "/home/$n" --shell /bin/bash \
      --gid "$GRUPPE" --comment "Arasul Terminal" -K UMASK=077 "$n"
    sag "$n angelegt."
  fi
  # Kein gueltiges Passwort, aber auch kein „gesperrt" (`!`): ein gesperrtes
  # Konto weist sshd ohne PAM auch beim Schluessel ab.
  usermod --password '*' "$n"
  chmod 0700 "/home/$n"
  # Was der Nutzer selbst anlegt, auch in /tmp, sieht kein anderer. `-K UMASK`
  # oben gilt nur fuer den Ordner beim Anlegen, nicht fuer seine Sitzungen.
  for datei in .profile .bashrc; do
    grep -qx 'umask 077' "/home/$n/$datei" 2>/dev/null ||
      printf '\n# Arasul Terminal: nur fuer mich\numask 077\n' >>"/home/$n/$datei"
    chown "$n:$GRUPPE" "/home/$n/$datei"
  done

  # Keine Gruppe ausser der eigenen, auch wenn jemand nachtraeglich eine
  # hinzugefuegt hat.
  local zusatz
  zusatz="$(id -Gn "$n" | tr ' ' '\n' | grep -vx "$GRUPPE" || true)"
  if [ -n "$zusatz" ]; then
    usermod -G "" "$n"
    sag "Zusatzgruppen von $n entfernt: $(echo "$zusatz" | tr '\n' ' ')"
  fi

  # restrict: keine Weiterleitung, kein Agent, kein X11; pty: aber ein Terminal.
  # from=: nur aus dem Netz des Terminal-Containers.
  install -m 0644 -o root -g root /dev/null "$ETC/schluessel/$n"
  printf 'restrict,pty,from="%s" %s\n' "$netz" "$(cut -d' ' -f1,2 "$ETC/schluessel.pub")" >"$ETC/schluessel/$n"

  # Gilt die Regel fuer diesen Nutzer wirklich? sshd sagt es selbst.
  if command -v sshd >/dev/null 2>&1; then
    local wirksam
    wirksam="$(sshd -T -C "user=$n,host=terminal,addr=127.0.0.1" 2>/dev/null || true)"
    grep -qiF "authorizedkeysfile $ETC/schluessel/%u" <<<"$wirksam" ||
      stirb "sshd wendet die Regel des Terminals auf $n nicht an (sshd -T). Erst einrichten.sh."
    grep -qix 'allowtcpforwarding no' <<<"$wirksam" ||
      stirb "sshd erlaubt $n Weiterleitungen (sshd -T). Erst einrichten.sh."
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl set-property "user-$(id -u "$n").slice" MemoryMax="$SPEICHER" CPUQuota="$CPU" >/dev/null 2>&1 ||
      sag "Hinweis: Grenzen fuer Speicher und Rechenzeit liessen sich nicht setzen."
  fi
  sag "Fertig: $n kommt ueber das Terminal herein (Ordner /home/$n, Grenze $SPEICHER, $CPU)."
}

entfernen() {
  local n="$1"
  pruefe_name "$n"
  rm -f "$ETC/schluessel/$n"
  if id "$n" >/dev/null 2>&1; then
    [ "$(id -gn "$n")" = "$GRUPPE" ] || stirb "$n ist kein Terminal-Nutzer; nichts entfernt."
    pkill -KILL -u "$n" 2>/dev/null || true
    sleep 1
    userdel --remove "$n" 2>/dev/null || userdel "$n"
    sag "$n entfernt, samt Ordner und laufenden Prozessen."
  else
    sag "$n gibt es nicht."
  fi
}

liste() {
  getent passwd | awk -F: -v g="$(getent group "$GRUPPE" | cut -d: -f3)" '$4 == g { print $1 "\t" $6 }'
}

case "${1:-}" in
  anlegen) anlegen "${2:-}" ;;
  entfernen) entfernen "${2:-}" ;;
  liste) liste ;;
  *) stirb "Aufruf: nutzer.sh anlegen|entfernen ara-<id> oder nutzer.sh liste" ;;
esac
