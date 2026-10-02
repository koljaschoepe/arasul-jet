#!/bin/bash
# =============================================================================
# sicherung-datentraeger.sh — der angesteckte Datentraeger wird die Sicherungs-SSD
# (J37, 02.10.2026)
# =============================================================================
# Aufruf durch die systemd-Einheit arasul-sicherung@<geraet>.service, die udev
# startet (config/udev/99-arasul-sicherung.rules):
#
#   sicherung-datentraeger.sh einhaengen sda1    haengt /dev/sda1 ein
#   sicherung-datentraeger.sh aushaengen sda1    raeumt auf (Stick abgezogen)
#
# WAS ES TUT: das Dateisystem des Datentraegers wird unter
# /mnt/arasul-sicherung eingehaengt (nosuid,nodev,noexec) und sein Name, sein
# Dateisystem und seine Kennung stehen danach in
# /run/arasul-sicherung/zustand.json -- das liest das Dashboard, um dem Admin
# den Namen und den freien Platz zu zeigen. Freier Platz wird NICHT hier
# gemessen, sondern live vom Backend am eingehaengten Ordner.
#
# WAS ES NIE TUT: formatieren, partitionieren, etwas auf den Datentraeger
# schreiben. Eingehaengt wird, was da ist. Hat der Datentraeger kein
# Dateisystem, das Linux kennt, passiert nichts -- und das Dashboard sagt
# „kein Datentraeger angesteckt“, nicht „Fehler“.
#
# Ein zweiter Datentraeger, solange einer eingehaengt ist, wird ignoriert: es
# gibt genau eine Sicherungs-SSD.
#
# Haengt das Betriebssystem den Datentraeger schon selbst ein (Desktop,
# udisks2: /media/<benutzer>/<name>), wird dieser Einhaengepunkt unter
# /mnt/arasul-sicherung ein zweites Mal sichtbar gemacht (bind), statt ein
# zweites Mal einzuhaengen.
# =============================================================================
set -uo pipefail

ZIEL="${ARASUL_SICHERUNG_ZIEL:-/mnt/arasul-sicherung}"
ZUSTAND_DIR="${ARASUL_SICHERUNG_ZUSTAND_DIR:-/run/arasul-sicherung}"
ZUSTAND="${ZUSTAND_DIR}/zustand.json"
DEV_DIR="${ARASUL_SICHERUNG_DEV_DIR:-/dev}"
# Dateisysteme, die Linux einhaengen kann UND die eine Sicherung tragen
# (Dateien ueber 4 GB: vfat taugt nicht, wird aber nicht verboten -- das
# Dashboard sagt es, wenn eine Datei nicht passt).
ERLAUBT="ext2 ext3 ext4 xfs btrfs exfat ntfs ntfs3 vfat f2fs"

aktion="${1:-}"
kern="${2:-}"
if [ -z "$aktion" ] || [ -z "$kern" ] || [[ ! "$kern" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    echo "Aufruf: $0 einhaengen|aushaengen <geraet, z. B. sda1>" >&2
    exit 2
fi
GERAET="/dev/${kern}"

log() { logger -t arasul-sicherung "$*" 2>/dev/null || true; echo "$*"; }

json_text() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
}

eigenschaft() { # Name aus udev
    udevadm info -q property -n "$GERAET" 2>/dev/null | sed -n "s/^$1=//p" | head -n1
}

eingehaengt_von() { # Quelle dessen, was unter $ZIEL steckt
    findmnt -n -o SOURCE --target "$ZIEL" 2>/dev/null | head -n1
}

# Steht dieses Geraet als Sicherungsziel im Zustand? (`grep` auf die Datei, kein Rohr.)
zustand_nennt() {
    grep -q "\"geraet\": \"$1\"" "$ZUSTAND" 2>/dev/null
}

ist_ziel_mountpunkt() {
    mountpoint -q "$ZIEL" 2>/dev/null
}

# Ein Rest aus einem frueheren Lauf: der Zustand nennt ein Geraet, das es nicht
# mehr gibt (abgezogen, Probelauf abgebrochen), oder es ist nichts mehr
# eingehaengt. Beides wird aufgeraeumt, bevor ein neuer Datentraeger gilt --
# sonst bliebe „gesichert auf ARASUL-...“ stehen.
rest_aufraeumen() {
    local alt
    alt="$(sed -n 's/.*"geraet": "\(.*\)".*/\1/p' "$ZUSTAND" 2>/dev/null | head -n1)"
    if ist_ziel_mountpunkt; then
        if [ -n "$alt" ] && [ "$alt" != "$GERAET" ] && [[ "$alt" == /dev/* ]] && [ ! -e "${DEV_DIR}/${alt#/dev/}" ]; then
            umount -l "$ZIEL" 2>/dev/null && log "Rest von ${alt} unter ${ZIEL} ausgehaengt (Geraet gibt es nicht mehr)"
            rm -f "$ZUSTAND" "${ZUSTAND}.neu"
        fi
    elif [ -e "$ZUSTAND" ]; then
        log "Rest in ${ZUSTAND} entfernt (unter ${ZIEL} haengt nichts)"
        rm -f "$ZUSTAND" "${ZUSTAND}.neu"
    fi
}

case "$aktion" in
einhaengen)
    rest_aufraeumen
    # Ob es das Geraet gibt, sagt udev: ohne Eigenschaften kein Dateisystem.
    typ="$(eigenschaft ID_FS_TYPE)"
    if [ -z "$typ" ] || ! grep -qw -- "$typ" <<<"$ERLAUBT"; then
        log "${GERAET}: Dateisystem '${typ:-keines}' wird nicht eingehaengt"
        exit 0
    fi
    # Nie ein Dateisystem, das schon das Geraet traegt.
    for punkt in / /boot /boot/efi /home /var; do
        quelle="$(findmnt -n -o SOURCE "$punkt" 2>/dev/null | head -n1)"
        if [ "$quelle" = "$GERAET" ]; then
            log "${GERAET} traegt ${punkt}, wird nicht als Sicherungsziel genommen"
            exit 0
        fi
    done
    mkdir -p "$ZIEL"
    if ist_ziel_mountpunkt; then
        if [ "$(eingehaengt_von)" = "$GERAET" ] || zustand_nennt "$GERAET"; then
            log "${GERAET} ist schon unter ${ZIEL} eingehaengt"
        else
            log "${ZIEL} ist belegt (von $(eingehaengt_von)), ${GERAET} wird ignoriert"
            exit 0
        fi
    else
        schon="$(findmnt -n -o TARGET --source "$GERAET" 2>/dev/null | head -n1)"
        if [ -n "$schon" ]; then
            mount --bind "$schon" "$ZIEL" || { log "Bind von ${schon} nach ${ZIEL} fehlgeschlagen"; exit 1; }
            log "${GERAET} war schon unter ${schon}; auch unter ${ZIEL} sichtbar"
        else
            mount -t "$typ" -o nosuid,nodev,noexec,noatime "$GERAET" "$ZIEL" \
                || { log "${GERAET} liess sich nicht einhaengen"; exit 1; }
            log "${GERAET} (${typ}) unter ${ZIEL} eingehaengt"
        fi
    fi

    name="$(eigenschaft ID_FS_LABEL_ENC)"
    [ -n "$name" ] && name="$(printf '%b' "$name")"
    [ -z "$name" ] && name="$(eigenschaft ID_FS_LABEL)"
    [ -z "$name" ] && name="$(eigenschaft ID_MODEL | tr '_' ' ')"
    [ -z "$name" ] && name="Datentraeger"
    mkdir -p "$ZUSTAND_DIR"
    chmod 755 "$ZUSTAND_DIR"
    umask 022
    cat > "${ZUSTAND}.neu" <<JSON
{
  "name": "$(json_text "$name")",
  "label": "$(json_text "$(eigenschaft ID_FS_LABEL)")",
  "dateisystem": "$(json_text "$typ")",
  "geraet": "$(json_text "$GERAET")",
  "uuid": "$(json_text "$(eigenschaft ID_FS_UUID)")",
  "seit": "$(date -Iseconds)"
}
JSON
    mv -f "${ZUSTAND}.neu" "$ZUSTAND"
    ;;
aushaengen)
    # Nur raeumen, was dieses Geraet eingehaengt hat: ein ignorierter zweiter
    # Datentraeger darf den ersten nicht aushaengen.
    if [ -s "$ZUSTAND" ] && ! zustand_nennt "$GERAET"; then
        log "${GERAET} war nicht das Sicherungsziel, nichts aufzuraeumen"
        exit 0
    fi
    if ist_ziel_mountpunkt; then
        # Lazy: ein Sicherungslauf, der gerade noch liest, haelt ihn sonst fest.
        umount -l "$ZIEL" 2>/dev/null && log "${ZIEL} ausgehaengt (${GERAET} abgezogen)"
    fi
    rm -f "$ZUSTAND" "${ZUSTAND}.neu"
    ;;
*)
    echo "Unbekannte Aktion: $aktion" >&2
    exit 2
    ;;
esac
exit 0
