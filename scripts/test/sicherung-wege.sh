#!/bin/bash
# =============================================================================
# Die Wege rund um die Sicherung auf den Datentraeger, ohne Docker (J37)
# =============================================================================
# Prueft, was sich ohne Geraet und ohne Datentraeger pruefen laesst:
#
#   1. Wiederherstellungscode: Schluessel -> Code -> Schluessel, gross/klein,
#      mit und ohne Striche; neue (32 Zeichen) und aeltere (64 Hex) Schluessel.
#   2. Erstausgabe: der Code steht auf dem Bildschirm UND in der Datei.
#   3. `wiederherstellungscode.sh`: zeigen, --pruefen.
#   4. Werksreset: fragt nach dem Code; ein falscher bricht ab, ohne etwas zu
#      loeschen; `ohne` warnt; der richtige geht weiter (gemessen an einem
#      Wegwerf-Baum, der Reset bricht danach an `docker` ab -- das ist hier
#      gewollt).
#   5. Einhaengen des Datentraegers (`sicherung-datentraeger.sh`) mit falschen
#      `udevadm`, `findmnt`, `mount`: ein USB-Dateisystem wird unter dem Ziel
#      eingehaengt UND als `zustand.json` beschrieben; ein zweites wird
#      ignoriert; Abziehen raeumt auf; ein unbekanntes Dateisystem bleibt
#      draussen; die Systemplatte wird nie genommen.
#   6. Das Skript und die udev-Regel formatieren nichts, loeschen nichts und
#      nehmen nur USB (oder den Pruefweg).
#
# Rueckgabe 0, wenn alles gruen ist.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

gruen=0
rot=0
pruefe() {
  if [ "$2" = ja ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s\n' "$1"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }

# --- 1. Code ------------------------------------------------------------------
# shellcheck source=../lib/wiederherstellungscode.sh
source "$WURZEL/scripts/lib/wiederherstellungscode.sh"
K="$(neuer_sicherungsschluessel)"
pruefe "neuer Schluessel: 32 Zeichen aus A-Z und 2-7" "$(ja bash -c "[[ '$K' =~ ^[A-Z2-7]{32}\$ ]]")" "$K"
C="$(code_aus_schluessel "$K")"
pruefe "Code: acht Gruppen zu vier, mit Strichen" "$(ja bash -c "[[ '$C' =~ ^([A-Z2-7]{4}-){7}[A-Z2-7]{4}\$ ]]")" "$C"
pruefe "Code -> Schluessel (so getippt)" "$(ja [ "$(schluessel_aus_code "$C")" = "$K" ])"
pruefe "Code -> Schluessel (klein, mit Leerzeichen statt Strichen)" \
  "$(ja [ "$(schluessel_aus_code "$(printf '%s' "$C" | tr 'A-Z-' 'a-z ')")" = "$K" ])"
HEX="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
pruefe "aelterer Schluessel (64 Hex) ist ein Code" "$(ja ist_wiederherstellungscode "$(code_aus_schluessel "$HEX")")"
pruefe "Code -> Schluessel bei 64 Hex: Schreibweise bleibt" \
  "$(ja [ "$(schluessel_aus_code "$(code_aus_schluessel "$HEX")")" = "$HEX" ])"
pruefe "Unsinn ist kein Code" "$(ja bash -c "source '$WURZEL/scripts/lib/wiederherstellungscode.sh'; ! ist_wiederherstellungscode 'hallo-welt'")"
pruefe "zwei neue Schluessel sind verschieden" "$(ja [ "$(neuer_sicherungsschluessel)" != "$(neuer_sicherungsschluessel)" ])"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- 2. Erstausgabe -----------------------------------------------------------
( cd "$TMP" && mkdir -p config && bash "$WURZEL/scripts/util/erstausgabe.sh" --datei "$TMP/ausgabe.txt" \
    --passwort 'Pw12345' --wiederherstellungscode "$C" >"$TMP/bildschirm.txt" 2>&1 )
pruefe "Erstausgabe: der Code steht auf dem Bildschirm" "$(ja grep -qF "$C" "$TMP/bildschirm.txt")"
pruefe "Erstausgabe: der Code steht in der Datei" "$(ja grep -qF "$C" "$TMP/ausgabe.txt")"
pruefe "Erstausgabe: sagt, dass er ausser Haus gehoert" "$(ja grep -q 'AUSSERHALB' "$TMP/bildschirm.txt")"
( cd "$TMP" && bash "$WURZEL/scripts/util/erstausgabe.sh" --datei "$TMP/ohne.txt" --passwort 'Pw12345' >"$TMP/b2.txt" 2>&1 )
pruefe "Erstausgabe ohne Code: kein Wiederherstellungscode-Block" "$(ja bash -c "! grep -q 'Wiederherstellungscode' '$TMP/b2.txt'")"

# --- 3. wiederherstellungscode.sh ----------------------------------------------
printf '%s' "$K" > "$TMP/schluessel"
ARASUL_SCHLUESSEL_DATEI="$TMP/schluessel" bash "$WURZEL/scripts/util/wiederherstellungscode.sh" >"$TMP/zeigen.txt" 2>&1
pruefe "wiederherstellungscode.sh zeigt den Code" "$(ja grep -qF "$C" "$TMP/zeigen.txt")"
pruefe "--pruefen: der richtige Code passt" \
  "$(ja env ARASUL_SCHLUESSEL_DATEI="$TMP/schluessel" bash "$WURZEL/scripts/util/wiederherstellungscode.sh" --pruefen "$C")"
pruefe "--pruefen: klein geschrieben passt auch" \
  "$(ja env ARASUL_SCHLUESSEL_DATEI="$TMP/schluessel" bash "$WURZEL/scripts/util/wiederherstellungscode.sh" --pruefen "$(printf '%s' "$C" | tr 'A-Z' 'a-z')")"
pruefe "--pruefen: ein anderer Code passt nicht" \
  "$(ja bash -c "! ARASUL_SCHLUESSEL_DATEI='$TMP/schluessel' bash '$WURZEL/scripts/util/wiederherstellungscode.sh' --pruefen 'AAAA-BBBB-CCCC-DDDD'")"
pruefe "--pruefen: leer passt nicht" \
  "$(ja bash -c "! ARASUL_SCHLUESSEL_DATEI='$TMP/schluessel' bash '$WURZEL/scripts/util/wiederherstellungscode.sh' --pruefen ''")"

# --- 4. Werksreset fragt nach dem Code ------------------------------------------
BAUM="$TMP/baum"
mkdir -p "$BAUM/scripts/setup" "$BAUM/scripts/lib" "$BAUM/scripts/util" "$BAUM/config/secrets" "$BAUM/data"
cp "$WURZEL/scripts/setup/factory-reset.sh" "$BAUM/scripts/setup/"
cp "$WURZEL/scripts/lib/installation.sh" "$WURZEL/scripts/lib/wiederherstellungscode.sh" "$BAUM/scripts/lib/"
cp "$WURZEL/scripts/util/wiederherstellungscode.sh" "$BAUM/scripts/util/"
printf '%s' "$K" > "$BAUM/config/secrets/backup_encryption_key"
# Ein falsches `docker`, das nur festhaelt, dass es gerufen wurde: der Reset
# haette danach Container weggeraeumt.
mkdir -p "$TMP/falsch"
printf '#!/bin/bash\necho gerufen >> "%s/docker-gerufen"\nexit 1\n' "$TMP" > "$TMP/falsch/docker"
chmod +x "$TMP/falsch/docker"
reset() { # Eingaben auf stdin
  ( cd "$BAUM" && PATH="$TMP/falsch:$PATH" bash scripts/setup/factory-reset.sh 2>&1 )
}
AUS1="$(printf 'ja\nFALSCH-CODE\n' | reset)"; RC1=$?
pruefe "Werksreset: ein falscher Code bricht ab" "$(ja [ "$RC1" != 0 ] && grep -q 'passt nicht' <<<"$AUS1")"
pruefe "... und fasst nichts an (docker nie gerufen, Schluessel noch da)" \
  "$(ja [ ! -f "$TMP/docker-gerufen" ] && [ -s "$BAUM/config/secrets/backup_encryption_key" ])"
AUS2="$(printf 'ja\nohne\nnein\n' | reset)"; RC2=$?
pruefe "Werksreset: 'ohne' warnt, dass alle Sicherungen unlesbar werden" \
  "$(ja grep -q 'WARNUNG' <<<"$AUS2" && grep -q 'unlesbar' <<<"$AUS2")"
pruefe "... und bricht ab, wenn das nicht bestaetigt wird" "$(ja [ "$RC2" != 0 ] && [ ! -f "$TMP/docker-gerufen" ])"
AUS3="$(printf 'ja\n%s\n' "$C" | reset)"
pruefe "Werksreset: der richtige Code geht weiter" "$(ja grep -q 'Der Code stimmt' <<<"$AUS3")"
rm -f "$TMP/docker-gerufen"
mkdir -p "$BAUM/config/secrets"; printf '%s' "$K" > "$BAUM/config/secrets/backup_encryption_key"
AUS4="$(printf 'ja\n%s\n' "$(printf '%s' "$C" | tr 'A-Z' 'a-z')" | reset)"
pruefe "Werksreset: der Code klein getippt geht auch" "$(ja grep -q 'Der Code stimmt' <<<"$AUS4")"
rm -f "$BAUM/config/secrets/backup_encryption_key"
AUS5="$(printf 'ja\n' | reset)"
pruefe "Werksreset ohne Schluessel auf dem Geraet: fragt nicht nach einem Code" \
  "$(ja bash -c "! grep -q 'Wiederherstellungscode eingeben' <<<'$AUS5'")"

# --- 5. Datentraeger einhaengen -------------------------------------------------
H="$WURZEL/scripts/system/sicherung-datentraeger.sh"
S="$TMP/stubs"; mkdir -p "$S" "$TMP/ziel" "$TMP/zustand"
cat > "$S/udevadm" <<'STUB'
#!/bin/bash
# udevadm info -q property -n /dev/<geraet>: Eigenschaften aus $STUB_<GERAET>
geraet="${*: -1}"; geraet="${geraet##*/}"
f="$STUB_DIR/udev-$geraet"
[ -f "$f" ] && cat "$f"
exit 0
STUB
cat > "$S/findmnt" <<'STUB'
#!/bin/bash
# --target Z -> Quelle aus $STUB_DIR/gemountet (eine Zeile "quelle ziel"), -o SOURCE/TARGET --source G
args="$*"
if [[ "$args" == *"--source"* ]]; then
  g="${args##*--source }"; g="${g%% *}"
  awk -v g="$g" '$1==g {print $2}' "$STUB_DIR/system-mounts" 2>/dev/null | head -n1
elif [[ "$args" == *"-o SOURCE --target"* ]]; then
  z="${args##*--target }"
  awk -v z="$z" '$2==z {print $1}' "$STUB_DIR/gemountet" 2>/dev/null | head -n1
else
  p="${args##* }"
  awk -v p="$p" '$2==p {print $1}' "$STUB_DIR/system-mounts" 2>/dev/null | head -n1
fi
exit 0
STUB
cat > "$S/mountpoint" <<'STUB'
#!/bin/bash
z="${*: -1}"
grep -q " $z\$" "$STUB_DIR/gemountet" 2>/dev/null
STUB
cat > "$S/mount" <<'STUB'
#!/bin/bash
# mount -t typ -o opts GERAET ZIEL   |   mount --bind QUELLE ZIEL
echo "mount $*" >> "$STUB_DIR/aufrufe"
if [ "$1" = "--bind" ]; then echo "$2 $3" >> "$STUB_DIR/gemountet"; else
  n=$#; ziel="${!n}"; m=$((n-1)); geraet="${!m}"; echo "$geraet $ziel" >> "$STUB_DIR/gemountet"
fi
STUB
cat > "$S/umount" <<'STUB'
#!/bin/bash
echo "umount $*" >> "$STUB_DIR/aufrufe"
z="${*: -1}"; grep -v " $z\$" "$STUB_DIR/gemountet" > "$STUB_DIR/g.neu" 2>/dev/null; mv "$STUB_DIR/g.neu" "$STUB_DIR/gemountet"
STUB
printf '#!/bin/bash\nexit 0\n' > "$S/logger"
chmod +x "$S"/*
export STUB_DIR="$S"
printf 'ID_FS_TYPE=ext4\nID_FS_LABEL=GOLDENBACKUP\nID_FS_UUID=abcd-1234\nID_MODEL=SSD_T7\nID_BUS=usb\n' > "$S/udev-sda1"
printf 'ID_FS_TYPE=ext4\nID_FS_LABEL=ZWEITER\nID_FS_UUID=ffff-0000\n' > "$S/udev-sdb1"
printf 'ID_FS_TYPE=ntfs\nID_MODEL=Kein_Name\n' > "$S/udev-sdc1"
printf 'ID_FS_TYPE=crypto_LUKS\nID_FS_LABEL=GEHEIM\n' > "$S/udev-sdd1"
printf 'ID_FS_TYPE=ext4\nID_FS_LABEL=SYSTEM\n' > "$S/udev-nvme0n1p1"
printf '/dev/nvme0n1p1 /\n' > "$S/system-mounts"
: > "$S/gemountet"; : > "$S/aufrufe"
export ARASUL_SICHERUNG_ZIEL="$TMP/ziel" ARASUL_SICHERUNG_ZUSTAND_DIR="$TMP/zustand"
export ARASUL_SICHERUNG_DEV_DIR="$TMP/dev"
mkdir -p "$TMP/dev"; touch "$TMP/dev/sda1" "$TMP/dev/sdb1" "$TMP/dev/sdc1" "$TMP/dev/sdd1"
lauf() { PATH="$S:$PATH" bash "$H" "$@" >/dev/null 2>&1; }

lauf einhaengen sda1
pruefe "einhaengen: ein USB-Dateisystem wird unter dem Ziel eingehaengt" \
  "$(ja grep -q "mount -t ext4 -o nosuid,nodev,noexec,noatime /dev/sda1 $TMP/ziel" "$S/aufrufe")"
pruefe "... mit zustand.json: Name aus dem Label" "$(ja [ "$(jq -r .name "$TMP/zustand/zustand.json")" = GOLDENBACKUP ])"
pruefe "... Dateisystem, Geraet und Kennung stehen drin" \
  "$(ja [ "$(jq -r '.dateisystem + "|" + .geraet + "|" + .uuid' "$TMP/zustand/zustand.json")" = "ext4|/dev/sda1|abcd-1234" ])"
lauf einhaengen sdb1
pruefe "ein zweiter Datentraeger wird ignoriert" \
  "$(ja [ "$(grep -c '^mount ' "$S/aufrufe")" = 1 ] && [ "$(jq -r .name "$TMP/zustand/zustand.json")" = GOLDENBACKUP ])"
lauf aushaengen sdb1
pruefe "... und sein Abziehen haengt den ersten nicht aus" "$(ja [ -f "$TMP/zustand/zustand.json" ] && grep -q "$TMP/ziel" "$S/gemountet")"
lauf aushaengen sda1
pruefe "aushaengen: der Einhaengepunkt ist leer, zustand.json weg" \
  "$(ja grep -q 'umount -l' "$S/aufrufe" && [ ! -f "$TMP/zustand/zustand.json" ] && ! grep -q "$TMP/ziel" "$S/gemountet")"
: > "$S/aufrufe"
lauf einhaengen sdc1
pruefe "ohne Label: der Name kommt vom Modell" "$(ja [ "$(jq -r .name "$TMP/zustand/zustand.json")" = "Kein Name" ])"
lauf aushaengen sdc1
lauf einhaengen sdd1
pruefe "ein Dateisystem, das Linux hier nicht einhaengt (LUKS), bleibt draussen" \
  "$(ja [ ! -f "$TMP/zustand/zustand.json" ] && ! grep -q '^mount ' "$S/aufrufe")"
lauf einhaengen nvme0n1p1
pruefe "die Systemplatte wird nie das Ziel" "$(ja [ ! -f "$TMP/zustand/zustand.json" ] && ! grep -q '^mount ' "$S/aufrufe")"
printf '/dev/sda1 /media/arasul/GOLDENBACKUP\n' >> "$S/system-mounts"
lauf einhaengen sda1
pruefe "vom Desktop schon eingehaengt: wird per bind auch unter dem Ziel sichtbar" \
  "$(ja grep -q "mount --bind /media/arasul/GOLDENBACKUP $TMP/ziel" "$S/aufrufe")"
# Rest aus einem frueheren Lauf: Zustand und Einhaengepunkt nennen ein Geraet, das es nicht mehr gibt.
rm -f "$TMP/dev/sda1"; : > "$S/aufrufe"
lauf einhaengen sdb1
pruefe "Rest eines verschwundenen Geraets wird ausgehaengt und der neue Datentraeger gilt" \
  "$(ja grep -q 'umount -l' "$S/aufrufe" && [ "$(jq -r .geraet "$TMP/zustand/zustand.json")" = /dev/sdb1 ])"
lauf aushaengen sdb1
mkdir -p "$TMP/zustand"; printf '{\n  "geraet": "/dev/sdz9"\n}\n' > "$TMP/zustand/zustand.json"
lauf einhaengen sdd1
pruefe "zustand.json ohne Einhaengepunkt wird als Rest entfernt" "$(ja [ ! -f "$TMP/zustand/zustand.json" ])"
pruefe "ungueltiger Geraetename wird abgewiesen" "$(ja bash -c "! PATH='$S:$PATH' bash '$H' einhaengen '../etc' >/dev/null 2>&1")"
pruefe "unbekannte Aktion wird abgewiesen" "$(ja bash -c "! PATH='$S:$PATH' bash '$H' formatieren sda1 >/dev/null 2>&1")"

# --- 6. Es formatiert nichts, die Regel nimmt nur USB ------------------------------
pruefe "das Einhaengeskript formatiert, partitioniert und loescht nichts" \
  "$(ja bash -c "! grep -E '^[^#]*(mkfs|wipefs|parted|fdisk|sfdisk|dd |shred|rm -rf)' '$H'")"
REGEL="$WURZEL/config/udev/99-arasul-sicherung.rules"
pruefe "udev-Regel: nur USB (ID_BUS==usb) oder der Pruefweg ARASUL-PROBE" \
  "$(ja grep -q 'ID_BUS}=="usb"' "$REGEL" && grep -q 'ARASUL-PROBE' "$REGEL")"
pruefe "udev-Regel: nur Dateisysteme (ID_FS_USAGE==filesystem)" "$(ja grep -q 'ID_FS_USAGE}=="filesystem"' "$REGEL")"
pruefe "udev-Regel startet die Einheit, nicht ein Skript (RUN+= taugt nicht fuer mount)" \
  "$(ja grep -q 'SYSTEMD_WANTS}+="arasul-sicherung@%k.service"' "$REGEL" && [ -z "$(grep '^[^#]*RUN+=' "$REGEL" | grep -v 'systemctl --no-block stop arasul-sicherung@%k.service')" ])"
pruefe "udev-Regel: beim Abziehen (remove) wird die Einheit gestoppt" \
  "$(ja grep -q 'ACTION=="remove"' "$REGEL" && grep -q 'stop arasul-sicherung@%k.service' "$REGEL")"
pruefe "einheiten-installieren.sh installiert die Regel" "$(ja grep -q '99-arasul-sicherung.rules' "$WURZEL/scripts/system/einheiten-installieren.sh")"
pruefe "einheiten-installieren.sh laedt die udev-Regeln neu (udevadm control --reload)" \
  "$(ja grep -q 'udevadm control --reload' "$WURZEL/scripts/system/einheiten-installieren.sh")"
pruefe "./arasul update schreibt Einheiten und Regeln neu" \
  "$(ja bash -c "grep -q einheiten-installieren.sh <<<\"\$(sed -n '/^cmd_update()/,/^}/p' '$WURZEL/arasul')\"")"
pruefe "Compose: backup-service sieht den Datentraeger mit rslave (er steckt erst nach dem Start)" \
  "$(ja grep -q 'propagation: rslave' "$WURZEL/compose/compose.monitoring.yaml")"
pruefe "Compose: auch das Backend (nur lesend, rslave)" \
  "$(ja bash -c "grep -q rslave <<<\"\$(grep -A6 'target: /arasul/extern\$' '$WURZEL/compose/compose.app.yaml')\"")"
pruefe "install.sh kennt --wiederherstellungscode" "$(ja grep -q -- '--wiederherstellungscode' "$WURZEL/install.sh")"
pruefe "interactive_setup.sh schreibt den Schluessel aus dem Code, sonst einen neuen" \
  "$(ja grep -q 'ARASUL_WIEDERHERSTELLUNGSCODE' "$WURZEL/scripts/interactive_setup.sh" && grep -q 'neuer_sicherungsschluessel' "$WURZEL/scripts/interactive_setup.sh")"

echo ""
echo "${gruen} von $((gruen + rot)) gruen"
[ "$rot" = 0 ]
