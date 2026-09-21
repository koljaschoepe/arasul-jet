#!/usr/bin/env bash
# Laeuft AM MAC. Die Klienten stammen aus den Herstellerpaketen (nur entpackt, nicht
# installiert) unter /tmp/j33-klienten; die Dienste am Orin sind ueber einen SSH-Tunnel
# auf 127.0.0.1 erreichbar (18081 Nextcloud, 18082 OpenCloud).
K=/tmp/j33-klienten
NCC="$K/e-Nextcloud/Nextcloud.pkg/Payload/Applications/Nextcloud.app/Contents/MacOS/nextcloudcmd"
OCC="$K/e-OpenCloud_Desktop-v4.0.0-macos-clang-arm64/OpenCloud_Desktop.pkg/Payload/Applications/OpenCloud.app/Contents/MacOS/opencloudcmd"
AUSSCHLUSS=/tmp/j33-ausschluss.lst
# Beide Klienten verlangen eine Ausschlussliste. Die letzten drei Zeilen halten die Journaldatei des
# Klienten selbst aus dem Abgleich: mit `--sync-hidden-files` nimmt opencloudcmd sonst
# `.sync_journal.db` mit und meldet danach Konflikte und einen 500 an seiner eigenen Datei.
printf '.git\nnode_modules\n.next\n.venv\n__pycache__\n.sync_journal*\n._sync_*\n.sync_*.db*\n' > "$AUSSCHLUSS"
OCB=https://localhost:18082
NCB=http://localhost:18081
ORIN=arasul@192.168.0.197

# Vorbereitung am Mac, einmal: die zwei Pakete laden (gh release download v4.0.0 -R opencloud-eu/desktop
# -p '*macos-clang-arm64.pkg'; Nextcloud-34.0.4.pkg aus dem Cask), mit `pkgutil --expand-full` nach
# $K/e-<Name>/ entpacken, Pruefsumme gegen die des Herstellers halten. Nichts wird installiert.
tunnel() { ssh -f -N -M -S /tmp/j33.sock -L 18081:127.0.0.1:18081 -L 18082:127.0.0.1:18082 "$ORIN"; }

# OpenCloud: oc <nutzer> <passwort> <raum> <ordner> [--remote-folder x]
oc() { local u=$1 p=$2 r=$3 d=$4; shift 4; OPENCLOUD_TOKEN="$p" "$OCC" -u "$u" --trust --non-interactive --sync-hidden-files --exclude "$AUSSCHLUSS" "$@" "$OCB" "$r" "$d" 2>&1 | tail -${TAIL:-2}; }
# Nextcloud: nc <nutzer> <passwort> <ordner> [--path x]
ncs() { local u=$1 p=$2 d=$3; shift 3; "$NCC" --non-interactive -h --exclude "$AUSSCHLUSS" -u "$u" -p "$p" "$@" "$d" "$NCB" 2>&1 | tail -${TAIL:-2}; }

zeit() { local s=$(date +%s); "$@"; echo "  -> $(( $(date +%s) - s )) s"; }
