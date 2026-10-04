#!/bin/bash
# =============================================================================
# staende.sh — die Staende der Sicherung (M5, 03.10.2026)
# =============================================================================
# Bis hierher schrieb jede Nacht je Ziel ein ganzes `tar` in einen Tagesordner:
# am Orin 230 MB Firmenordner, 35 MB App-Pakete und 200 MB WAL-Archiv, jede
# Nacht neu, auch wenn sich keine Datei bewegt hatte. Seit M5 entsteht je Nacht
# ein STAND, der nur Geaendertes neu schreibt.
#
# DAS WERKZEUG IST restic, und zwar aus drei Gruenden, die die anderen nicht
# zusammen erfuellen:
#
#   1. Es VERSCHLUESSELT IMMER (AES-256-CTR mit Poly1305). Es gibt keinen
#      Schalter fuer Klartext, also auch keinen, den eine Konfiguration
#      versehentlich umlegt. Ein Ordner mit Hardlinks (rsync --link-dest)
#      laege dagegen im Klartext auf dem Datentraeger -- genau das, was J37
#      ausgeschlossen hat. Borg verschluesselt auch, aber nur, wenn man es
#      beim Anlegen sagt (`--encryption none` gibt es).
#   2. Es ZERLEGT INHALTE, NICHT DATEIEN. Eine geaenderte Zeile im
#      Datenbankabzug schreibt die paar Bloecke drumherum neu, nicht den
#      ganzen Abzug; eine Datei, die im Firmenordner nur umbenannt wurde,
#      kostet nichts. Hardlinks sparen nur bei unveraenderten GANZEN Dateien.
#   3. Es IST EINE DATEI. Ein statisch gebautes Go-Programm, in Alpine fuer
#      aarch64 und x86_64 als Paket (`apk add restic`, 0.16.4 in 3.19). Borg
#      braucht Python mit C-Erweiterungen und auf beiden Seiten dieselbe
#      Hauptversion. Ein x86-Geraet spaeter ist damit dieselbe Zeile im
#      Dockerfile.
#
# Die Aufbewahrung (7 Tage, 12 Wochen, 60 Monate, dazu immer die fuenf
# neuesten) ist `restic forget` mit genau diesen Zahlen, und das Zurueckholen eines einzelnen Stands ist
# `restic restore`. Beides wird hier nicht nachgebaut.
#
# DER SCHLUESSEL IST DER SICHERUNGSSCHLUESSEL DES GERAETS, und damit der
# Wiederherstellungscode (scripts/lib/wiederherstellungscode.sh). Kein zweiter
# Schluessel, nichts Abgeleitetes: wer den Code hat, oeffnet jeden Stand.
#
# JE SCHLUESSEL EIN EIGENES REPO: `<wurzel>/staende-<abdruck>`. Der Abdruck
# ist derselbe wie im Manifest seit J37 (sha256 ueber den Schluessel, 16
# Zeichen) und verraet den Schluessel nicht. Warum je Schluessel: nach einer
# Neuinstallation OHNE Code hat das Geraet einen neuen Schluessel, und mit dem
# laesst sich in das alte Repo weder schreiben noch daraus lesen. Es bleibt
# dann unangetastet liegen -- weder die Aufbewahrung noch das Platzschaffen
# fassen es an --, und wer den alten Code nennt, kommt an jeden Stand darin.
# Das neue Repo entsteht daneben.
#
# LEISE: jeder restic-Aufruf laeuft mit `nice -n 19` und `ionice -c 3` (nur,
# wenn die Platte sonst nichts zu tun hat). Am Orin gemessen, 03.10.2026: 45
# volle Lesedurchgaenge nacheinander, waehrenddessen gemma4:e4b 30,20 statt
# 30,48 Token/s (-0,9 %), CPU im Mittel 17,5 % ueber zwoelf Kerne.
#
# Diese Datei ist beides: eine Bibliothek (`source`, von backup.sh,
# wiederherstellen.sh und restore-drill.sh) und ein Befehl im Container:
#
#   staende.sh liste [--quelle lokal|extern] [--json]
#   staende.sh zurueckholen <stand> <ziel> [--quelle lokal|extern] [--pfad <pfad>]...
#   staende.sh pruefen [--quelle lokal|extern] [--daten <anteil>]
#   staende.sh klartext <ordner>
#
# `zurueckholen` schreibt NUR in einen neuen, leeren Ordner ausserhalb der
# laufenden Daten (`/arasul/...`). Den Weg zurueck AUF das Geraet geht
# `wiederherstellen.sh`, mit Abzug des jetzigen Stands vorher.
# =============================================================================
# Bibliothek: was hier gesetzt wird, lesen die, die sie einbinden.
# shellcheck disable=SC2034

STAND_TAGE="${BACKUP_STAND_TAGE:-7}"
STAND_WOCHEN="${BACKUP_STAND_WOCHEN:-12}"
STAND_MONATE="${BACKUP_STAND_MONATE:-60}"
# Die neuesten so vielen Staende bleiben immer (Auftrag sicherung-zurueckholen,
# am Orin gefunden 04.10.2026): die Regel 7/12/60 behaelt je Tag nur den
# NEUESTEN Stand. Wer „Jetzt sichern“ drueckt, etwas aendert und noch einmal
# sichert, verlor damit sofort den ersten Stand -- genau den, zu dem er zurueck
# will. Naechte sind davon nicht betroffen (eine je Tag); es geht um die Staende
# von Hand. `--keep-within 2d` war der erste Versuch und behielt in restic
# 0.16.4 (und 0.19) an einer nachgestellten Reihe JEDEN Stand, auch die von vor
# vier Tagen -- deshalb die Zahl statt der Frist.
STAND_LETZTE="${BACKUP_STAND_LETZTE:-5}"
# Wie viel auf dem Ziel frei bleiben muss, bevor ein Stand entsteht. Darunter
# faellt der aelteste Stand (mit Hinweis). 2 GB sind auf einer SSD wenig und
# reichen fuer mehrere Naechte mit normalem Wachstum.
STAND_RESERVE_MB="${BACKUP_STAND_RESERVE_MB:-2048}"
# Der Zwischenspeicher von restic. LOKAL, nie auf dem Datentraeger: was dort
# liegt, soll nur das Repo sein. (Er ist ohnehin verschluesselt, aber ein
# Ordner, der sich bei jedem Lauf mitbewegt, gehoert nicht auf einen Stick.)
STAND_CACHE="${BACKUP_STAND_CACHE:-/backups/.restic-cache}"
STAND_SCHLUESSEL="${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}"
# Wohin backup.sh die Datenbankabzuege legt, bevor sie in den Stand gehen.
# Unkomprimiert: gzip zerstoert die Wiedererkennung gleicher Bloecke, und
# restic komprimiert ohnehin (Repo-Format 2).
STAND_DB_QUELLE="${BACKUP_STAND_DB_QUELLE:-/arasul/datenbank}"
STAND_TAG=arasul
STAND_HOST=arasul
# Was je Stand nachgesehen wird (`stand_inhalt`): welche Apps, welche
# App-Datenbanken, welche Bereiche des Firmenordners darin stehen. Dieselben
# Pfade, die backup.sh sichert.
STAND_APPS_PFAD="${APPS_BACKUP_DIR:-/arasul/apps}"
STAND_BEREICHE_PFAD="${FIRMENORDNER_BACKUP_DIR:-/arasul/firmenordner}/posix/projects"
# Der Stand VOR einem Zurueckholen (Auftrag sicherung-zurueckholen, M5): ein
# ganz normaler Stand mit dem zusaetzlichen Tag `vorher` und, wofuer er
# entstand, `fuer:app:<id>`, `fuer:bereich:<kennung>` oder `fuer:geraet`.
# backup.sh setzt die Tags ueber dieses Feld.
STAND_EXTRA_TAGS=()

# nice immer, ionice nur, wenn es hier geht (am Mac gibt es keines, und ein
# Container ohne Recht darauf liesse den eigentlichen Befehl gar nicht laufen).
STAND_LEISE=(nice -n 19)
if command -v ionice >/dev/null 2>&1 && ionice -c 3 true 2>/dev/null; then
    STAND_LEISE+=(ionice -c 3)
fi

stand_log() {
    printf '[%s] %s\n' "${TIMESTAMP:-$(date +%Y%m%d_%H%M%S)}" "$*"
}

# Der Abdruck eines Schluessels -- dieselbe Rechnung wie `abdruck_des_schluessels`
# in backup.sh (und damit wie im Manifest auf dem Datentraeger).
stand_abdruck() { # [schluesseldatei]
    local datei="${1:-$STAND_SCHLUESSEL}"
    [ -f "$datei" ] || return 1
    printf 'arasul-sicherung:%s' "$(cat "$datei")" | sha256sum | cut -c1-16
}

stand_repo() { # wurzel [schluesseldatei]
    local abdruck
    abdruck=$(stand_abdruck "${2:-}") || return 1
    printf '%s/staende-%s' "$1" "$abdruck"
}

# Alle Repos unter einer Wurzel, auch die anderer Schluessel.
stand_repos() { # wurzel
    find "$1" -mindepth 1 -maxdepth 1 -type d -name 'staende-*' 2>/dev/null | sort
}

stand_restic() { # repo schluesseldatei argumente...
    local repo="$1" schluessel="$2"
    shift 2
    RESTIC_REPOSITORY="$repo" RESTIC_PASSWORD_FILE="$schluessel" RESTIC_CACHE_DIR="$STAND_CACHE" \
        RESTIC_PROGRESS_FPS=0 "${STAND_LEISE[@]}" restic "$@"
}

stand_oeffnet() { # repo schluesseldatei
    [ -f "$1/config" ] || return 1
    stand_restic "$1" "$2" cat config >/dev/null 2>&1
}

stand_anlegen() { # repo schluesseldatei
    [ -f "$1/config" ] && return 0
    mkdir -p "$(dirname "$1")" || return 1
    stand_restic "$1" "$2" init --repository-version 2 >/dev/null 2>&1
}

# Freier Platz in KiB an der Stelle des Repos (oder seines Elternordners).
stand_frei_kb() { # pfad
    local ort="$1"
    [ -e "$ort" ] || ort=$(dirname "$ort")
    df -P -k "$ort" 2>/dev/null | awk 'NR==2 {print $4}'
}

# Wie gross die Quellen zusammen sind, KiB (obere Grenze fuer einen Stand).
stand_quellen_kb() { # quellen...
    local kb
    kb=$(du -skc "$@" 2>/dev/null | tail -n1 | cut -f1)
    printf '%s' "${kb:-0}"
}

stand_groesse_kb() { # repo -> KiB, 0 wenn es das Repo nicht gibt
    local kb
    kb=$(du -sk "$1" 2>/dev/null | cut -f1)
    printf '%s' "${kb:-0}"
}

# Die Staende, aelteste zuerst, als JSON-Liste. `vorher` und `fuer` kommen aus
# den Tags: ein Stand, der vor einem Zurueckholen entstand, sagt, wofuer.
stand_liste() { # repo schluesseldatei
    local roh
    roh=$(stand_restic "$1" "$2" snapshots --json --tag "$STAND_TAG" 2>/dev/null) || return 1
    jq -c 'sort_by(.time) | map({id, kurz: .short_id, zeit: .time, pfade: .paths,
             vorher: ((.tags // []) | any(. == "vorher")),
             fuer: ((.tags // []) | map(select(startswith("fuer:")) | sub("^fuer:"; "")) | .[0] // null)})' <<<"$roh"
}

# Was in EINEM Stand steht, ohne ihn zurueckzuholen: die Apps (Ordner unter
# /arasul/apps), die App-Datenbanken (Abzuege unter /arasul/datenbank/apps)
# und die Bereiche des Firmenordners (Raeume unter posix/projects). `restic ls`
# mit Ordnern listet nur deren unmittelbaren Inhalt (seit restic 0.15 nicht
# rekursiv) -- am Orin 0,5 s je Stand. Ein Stand aendert sich nie; backup.sh
# fragt deshalb nur die neuen und uebernimmt den Rest aus der vorigen Liste.
stand_inhalt() { # repo schluesseldatei stand
    local roh
    roh=$(stand_restic "$1" "$2" ls --json "$3" "$STAND_APPS_PFAD" "${STAND_DB_QUELLE}/apps" "$STAND_BEREICHE_PFAD" 2>/dev/null) || return 1
    jq -sc --arg a "$STAND_APPS_PFAD" --arg d "${STAND_DB_QUELLE}/apps" --arg b "$STAND_BEREICHE_PFAD" '
      [.[] | select(.struct_type == "node")] as $n
      | {apps: ([$n[] | select(.type == "dir" and .path == ($a + "/" + .name) and (.name | startswith(".") | not)) | .name] | sort),
         app_datenbanken: ([$n[] | select(.type == "file" and .path == ($d + "/" + .name) and (.name | endswith(".sql"))) | .name | sub("\\.sql$"; "")] | sort),
         bereiche: ([$n[] | select(.type == "dir" and .path == ($b + "/" + .name) and (.name | startswith(".") | not)) | .name] | sort)}' <<<"$roh"
}

# Die Liste wie `stand_liste`, je Stand mit `inhalt`. Was die vorige Liste
# ($3, JSON) schon wusste, wird uebernommen; nur neue Staende werden gefragt.
# `inhalt: null` heisst: liess sich nicht lesen.
stand_liste_mit_inhalt() { # repo schluesseldatei [vorige_liste_json]
    local liste alt="${3:-[]}" id inhalt paare=''
    liste=$(stand_liste "$1" "$2") || return 1
    jq -e 'type == "array"' <<<"$alt" >/dev/null 2>&1 || alt='[]'
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        inhalt=$(jq -c --arg id "$id" 'map(select(.id == $id and .inhalt != null)) | .[0].inhalt // empty' <<<"$alt" 2>/dev/null)
        [ -n "$inhalt" ] || inhalt=$(stand_inhalt "$1" "$2" "$id") || inhalt=''
        paare+="$(jq -cn --arg id "$id" --argjson i "${inhalt:-null}" '{key: $id, value: $i}')"$'\n'
    done < <(jq -r '.[].id' <<<"$liste")
    jq -c --argjson m "$(printf '%s' "$paare" | jq -sc 'from_entries')" 'map(. + {inhalt: $m[.id]})' <<<"$liste"
}

# Aufraeumen nach forget. Umgepackt wird hoechstens die Haelfte dessen, was
# frei ist: restic schreibt beim Umpacken erst das Neue und loescht dann das
# Alte, und auf einem vollen Ziel waere das der naechste Abbruch. Ist gar
# nichts frei (`--max-repack-size 0`), entfernt es nur Pakete, die ganz
# unbenutzt sind -- dafuer muss es nichts schreiben ausser dem Index.
#
# KNAPP (beim Platzschaffen): jedes Paket mit auch nur einem freien Byte wird
# umgepackt (`--max-unused 0`), und das so lange, wie es Platz bringt. Am Orin
# gemessen (03.10.2026): faellt der ERSTE Stand eines Repos, liegen seine
# eigenen Daten in denselben Paketen wie die, die alle Staende teilen -- ein
# einzelnes Aufraeumen mit der halben Luft gab 10 von 60 MB frei, und der neue
# Stand passte nicht. Jede Runde macht Luft fuer die naechste.
stand_aufraeumen() { # repo schluesseldatei [knapp]
    local frei vorher ausgabe runde extra=()
    [ "${3:-}" = knapp ] && extra=(--max-unused 0)
    for runde in 1 2 3 4 5 6 7 8; do
        frei=$(stand_frei_kb "$1")
        if ! ausgabe=$(stand_restic "$1" "$2" prune ${extra[@]+"${extra[@]}"} \
                --max-repack-size "$(( ${frei:-0} / 2 ))K" 2>&1); then
            stand_log "[WARNING] Aufraeumen im Repo gescheitert: $(tail -n 2 <<<"$ausgabe" | tr '\n' ' ')"
            return 1
        fi
        [ "${3:-}" = knapp ] || return 0
        vorher=$frei
        frei=$(stand_frei_kb "$1")
        # Keine Luft mehr gewonnen (weniger als 1 MB): fertig.
        [ "${frei:-0}" -gt $(( ${vorher:-0} + 1024 )) ] || return 0
    done
    return 0
}

# --- Ist das Ziel voll, faellt der aelteste Stand -----------------------------
# NIE der letzte: ein Ziel, auf das nicht einmal ein Stand passt, ist voll, und
# das wird gemeldet (STAND_VOLL), statt die einzige Sicherung zu opfern.
# Jeder entfallene Stand steht in STAND_ENTFALLEN_PLATZ (eine Zeile je Stand,
# Zeitpunkt) -- daraus macht backup.sh den Hinweis.
STAND_ENTFALLEN_PLATZ=""
STAND_VOLL=false
stand_aeltesten_nehmen() { # repo schluesseldatei
    local liste anzahl id zeit
    liste=$(stand_liste "$1" "$2") || return 1
    anzahl=$(jq 'length' <<<"$liste")
    [ "${anzahl:-0}" -gt 1 ] || return 1
    id=$(jq -r '.[0].id' <<<"$liste")
    zeit=$(jq -r '.[0].zeit' <<<"$liste")
    stand_restic "$1" "$2" forget "$id" >/dev/null 2>&1 || return 1
    stand_aufraeumen "$1" "$2" knapp || true
    STAND_ENTFALLEN_PLATZ+="${zeit}"$'\n'
    stand_log "[WARNING] Das Ziel ist voll: der aelteste Stand (${zeit%%.*}) ist entfallen"
    return 0
}

# Platz schaffen VOR dem Schreiben: frei bleiben muss die Reserve plus das,
# was gleich neu dazukommt ($3, KiB). Am Orin gemessen (03.10.2026): wer erst
# beim Schreiben merkt, dass es nicht reicht, steht mit null freien Bytes da
# -- und dann kann restic nicht einmal mehr aufraeumen, weil auch das einen
# neuen Index schreibt. Der aelteste Stand fiel, der neue kam trotzdem nicht.
stand_platz() { # repo schluesseldatei [noetig_kb]
    local frei reserve=$((STAND_RESERVE_MB * 1024 + ${3:-0}))
    frei=$(stand_frei_kb "$1")
    while [ -n "$frei" ] && [ "$frei" -lt "$reserve" ]; do
        stand_aeltesten_nehmen "$1" "$2" || return 1
        frei=$(stand_frei_kb "$1")
    done
    return 0
}

# --- Einen Stand anlegen ------------------------------------------------------
# Setzt STAND_ID, STAND_GELESEN (Bytes der Quellen), STAND_GESCHRIEBEN (um so
# viel ist das Repo auf dem Ziel gewachsen -- die Zahl, um die es geht),
# STAND_RC (0, oder 3: Stand steht, einzelne Dateien waren nicht lesbar) und
# STAND_FEHLER.
#
# Ausschluesse ueber das Feld STAND_AUSSCHLUESSE, die Zeit des Stands ueber
# STAND_ZEIT ("JJJJ-MM-TT hh:mm:ss"; leer = jetzt). STAND_ZEIT ist fuer
# Abnahmen da, die mehrere Naechte an einem Abend nachstellen.
STAND_AUSSCHLUESSE=()
stand_sichern() { # repo schluesseldatei quellen...
    local repo="$1" schluessel="$2"
    shift 2
    STAND_ID=""
    STAND_GELESEN=0
    STAND_GESCHRIEBEN=0
    STAND_RC=0
    STAND_FEHLER=""
    STAND_VOLL=false

    if [ ! -f "$schluessel" ]; then
        STAND_FEHLER="Der Sicherungsschluessel fehlt (${schluessel})"
        return 1
    fi
    if ! stand_anlegen "$repo" "$schluessel"; then
        STAND_FEHLER="Das Repo liess sich nicht anlegen (${repo})"
        return 1
    fi
    if ! stand_oeffnet "$repo" "$schluessel"; then
        STAND_FEHLER="Der Schluessel oeffnet das Repo nicht (${repo})"
        return 1
    fi
    # Sperren eines abgebrochenen Laufs (Neustart mitten in der Nacht) raeumt
    # restic nur weg, wenn ihr Prozess nicht mehr lebt.
    stand_restic "$repo" "$schluessel" unlock >/dev/null 2>&1 || true

    local args=(--json --host "$STAND_HOST" --tag "$STAND_TAG") a
    for a in ${STAND_EXTRA_TAGS[@]+"${STAND_EXTRA_TAGS[@]}"}; do
        args+=(--tag "$a")
    done
    for a in ${STAND_AUSSCHLUESSE[@]+"${STAND_AUSSCHLUESSE[@]}"}; do
        args+=(--exclude "$a")
    done
    [ -n "${STAND_ZEIT:-}" ] && args+=(--time "$STAND_ZEIT")

    # WIE VIEL KOMMT NEU DAZU? Nur gefragt, wenn es knapp werden kann: ist
    # mehr frei, als die Quellen zusammen gross sind, passt jeder Stand. Sonst
    # rechnet `restic backup --dry-run` es aus, ohne etwas zu schreiben (es
    # liest nur, was sich geaendert hat). Die Zahl ist ungepackt, also eher zu
    # gross als zu klein -- auf einem knappen Ziel die richtige Seite.
    local frei noetig_kb=0 probe
    frei=$(stand_frei_kb "$repo")
    if [ -n "$frei" ] && [ "$frei" -lt $(( $(stand_quellen_kb "$@") + STAND_RESERVE_MB * 1024 )) ]; then
        probe=$(stand_restic "$repo" "$schluessel" backup --dry-run "${args[@]}" "$@" 2>/dev/null \
            | grep '"message_type":"summary"' | tail -n1)
        noetig_kb=$(( $(jq -r '.data_added // 0' <<<"$probe" 2>/dev/null || echo 0) / 1024 ))
    fi
    if ! stand_platz "$repo" "$schluessel" "$noetig_kb"; then
        stand_log "[WARNING] Zu wenig Platz fuer den neuen Stand (gebraucht $((noetig_kb / 1024)) MB plus ${STAND_RESERVE_MB} MB Reserve), und es gibt nur noch einen Stand"
    fi

    local versuch ausgabe rc vorher nachher zusammenfassung
    for versuch in 1 2 3 4 5 6 7 8; do
        vorher=$(stand_groesse_kb "$repo")
        rc=0
        ausgabe=$(stand_restic "$repo" "$schluessel" backup "${args[@]}" "$@" 2>&1) || rc=$?
        nachher=$(stand_groesse_kb "$repo")
        if [ "$rc" = 0 ] || [ "$rc" = 3 ]; then
            zusammenfassung=$(grep '"message_type":"summary"' <<<"$ausgabe" | tail -n1)
            STAND_ID=$(jq -r '.snapshot_id // empty' <<<"$zusammenfassung" 2>/dev/null)
            STAND_GELESEN=$(jq -r '.total_bytes_processed // 0' <<<"$zusammenfassung" 2>/dev/null)
            STAND_GESCHRIEBEN=$(((nachher - vorher) * 1024))
            [ "$STAND_GESCHRIEBEN" -lt 0 ] && STAND_GESCHRIEBEN=0
            STAND_RC=$rc
            if [ "$rc" = 3 ]; then
                grep -v '"message_type"' <<<"$ausgabe" | head -n 5 | sed 's/^/    /'
            fi
            [ -n "$STAND_ID" ] && return 0
            STAND_FEHLER="restic meldete keinen Stand"
            return 1
        fi
        # VOLL: der aelteste Stand faellt, dann noch einmal. Was restic vom
        # abgebrochenen Lauf hinterlassen hat, nimmt das Aufraeumen mit.
        if grep -qi 'no space left' <<<"$ausgabe"; then
            if stand_aeltesten_nehmen "$repo" "$schluessel"; then
                continue
            fi
            stand_aufraeumen "$repo" "$schluessel" knapp || true
            STAND_VOLL=true
            STAND_FEHLER="Das Ziel ist voll, und es gibt keinen aelteren Stand mehr, der fallen koennte"
            return 1
        fi
        STAND_FEHLER=$(grep -v '"message_type"' <<<"$ausgabe" | tail -n 3 | tr '\n' ' ')
        return 1
    done
    STAND_FEHLER="Nach ${versuch} Versuchen noch immer kein Platz"
    STAND_VOLL=true
    return 1
}

# --- Aufbewahrung: 7 Tage, 12 Wochen, 60 Monate -------------------------------
# `--group-by tags`: die Staende sind eine Reihe JE TAG-SATZ, nicht je
# Rechnername und Pfaden. Sonst begaenne eine Nacht, in der der Firmenordner
# nicht eingehaengt war, eine eigene Reihe mit eigener Aufbewahrung. Jeder
# normale Stand traegt genau `arasul` und ist damit in derselben Reihe.
#
# Ein Stand mit `vorher` (vor einem Zurueckholen, vor dem Live-Schalten) steht
# in einer eigenen Reihe (Auftrag live-schalten-mit-sicherung, M5,
# 04.10.2026). Bis dahin galt `--group-by ''`, und die Staende davor zaehlten
# bei „die fuenf neuesten“ und „je Tag der neueste“ mit: wer an einem Tag
# zweimal live schaltete, verdraengte den Stand dieser Nacht. Jetzt gilt
# 7/12/60 und die fuenf nur unter den normalen Staenden.
#
# `--keep-tag vorher`: ein Stand, der vor einem Zurueckholen entstand, ist der
# Weg, dieses Zurueckholen rueckgaengig zu machen. Die Regel 7/12/60 behielte
# von zwei Staenden eines Tages nur den spaeteren -- wer an einem Tag zweimal
# zurueckholt, verloere den ersten Weg zurueck. Er bleibt deshalb, bis das Ziel
# voll ist (dann faellt auch er als aeltester, `stand_aeltesten_nehmen`).
# Zurueckgeholt wird selten; dedupliziert kostet so ein Stand fast nichts.
#
# `--keep-last $STAND_LETZTE` (5): siehe oben, die Staende von Hand.
# Setzt STAND_ENTFALLEN (Zahl).
stand_aufbewahren() { # repo schluesseldatei
    local roh
    STAND_ENTFALLEN=0
    roh=$(stand_restic "$1" "$2" forget --json --tag "$STAND_TAG" --group-by tags --keep-tag vorher --keep-last "$STAND_LETZTE" \
        --keep-daily "$STAND_TAGE" --keep-weekly "$STAND_WOCHEN" --keep-monthly "$STAND_MONATE" 2>/dev/null) || return 1
    STAND_ENTFALLEN=$(jq '[.[] | (.remove // []) | length] | add // 0' <<<"$roh" 2>/dev/null || echo 0)
    if [ "${STAND_ENTFALLEN:-0}" -gt 0 ]; then
        stand_aufraeumen "$1" "$2" || true
    fi
    return 0
}

# --- Liegt auf dem Ziel nur Verschluesseltes? ---------------------------------
# Gezaehlt wird jede Datei, die NICHT nach Chiffrat aussieht. Drei Sorten:
#
#   staende-*/keys/*  die Schluesselhuelle von restic: JSON mit Parametern der
#                     Ableitung (scrypt), Salz und dem VERSCHLUESSELTEN
#                     Hauptschluessel. Gilt, solange sie genau diese Felder hat.
#   staende-*/...     alles andere im Repo: Chiffrat ist nicht komprimierbar
#                     und hat keinen Dateikopf. Klartext ist, was gzip auf
#                     weniger als 90 % bringt, ODER was einen Kopf traegt:
#                     gzip (und sich als gzip lesen laesst -- zwei Bytes
#                     1f8b hat jedes 65536. Chiffrat zufaellig auch), tar,
#                     zip, PDF. Ein schon gepacktes Archiv waere sonst
#                     unsichtbar: es laesst sich ja nicht weiter packen.
#   sonst             die Tagesordner von vor M5: `openssl enc` (Salted__).
#
# MANIFEST.json ist ausgenommen; es ist mit Absicht Klartext (Namen, Groessen,
# Abdruck des Schluessels) und enthaelt keine Daten.
# Traegt die Datei den Kopf eines bekannten Formats?
stand_hat_kopf() { # datei
    local kopf
    kopf=$(head -c 8 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n')
    case "$kopf" in
        1f8b*) gzip -t "$1" 2>/dev/null && return 0 ;;
        504b0304*|255044462d*) return 0 ;;   # zip, %PDF-
    esac
    [ "$(dd if="$1" bs=1 skip=257 count=5 2>/dev/null)" = ustar ]
}

# Setzt STAND_KLARTEXT (Zahl) und STAND_KLARTEXT_DATEIEN (eine Zeile je Datei).
# Nicht in `$( )` aufrufen: dort gingen beide mit der Unterschale verloren.
STAND_KLARTEXT=0
STAND_KLARTEXT_DATEIEN=""
stand_klartext() { # ordner
    local datei n=0 groesse probe gepackt
    STAND_KLARTEXT_DATEIEN=""
    while IFS= read -r datei; do
        [ -n "$datei" ] || continue
        case "$datei" in
            */MANIFEST.json) continue ;;
            */staende-*/keys/*)
                if jq -e 'type == "object"
                          and ((keys - ["created","username","hostname","kdf","N","r","p","salt","data"]) | length == 0)
                          and (.data | type == "string")' "$datei" >/dev/null 2>&1; then
                    continue
                fi
                ;;
            */staende-*/*)
                groesse=$(stat -c%s "$datei" 2>/dev/null || echo 0)
                [ "$groesse" -gt 0 ] || continue
                if ! stand_hat_kopf "$datei"; then
                    probe=$((groesse < 65536 ? groesse : 65536))
                    gepackt=$(head -c "$probe" "$datei" | gzip -c | wc -c)
                    if [ $((gepackt * 100)) -ge $((probe * 90)) ]; then
                        continue
                    fi
                fi
                ;;
            *)
                [ "$(head -c 8 "$datei" 2>/dev/null)" = "Salted__" ] && continue
                ;;
        esac
        n=$((n + 1))
        STAND_KLARTEXT_DATEIEN+="${datei}"$'\n'
    done < <(find "$1" -type f 2>/dev/null)
    STAND_KLARTEXT=$n
}

# --- Einen Stand zurueckholen, in einen eigenen Ordner -------------------------
# NIE ueber die laufenden Daten: das Ziel muss neu oder leer sein und darf
# nicht unter /arasul liegen (dort haengen Apps, Flows, Firmenordner und
# Konfiguration des laufenden Geraets).
stand_zurueckholen() { # repo schluesseldatei stand ziel [pfad...]
    local repo="$1" schluessel="$2" stand="$3" ziel="$4"
    shift 4
    case "$ziel" in
        /arasul|/arasul/*)
            echo "Nicht nach ${ziel}: dort liegen die laufenden Daten. Ein eigener Ordner, bitte." >&2
            return 2 ;;
        /*) : ;;
        *) echo "Das Ziel braucht einen absoluten Pfad: ${ziel}" >&2; return 2 ;;
    esac
    if [ -e "$ziel" ] && [ -n "$(ls -A "$ziel" 2>/dev/null)" ]; then
        echo "${ziel} ist nicht leer. Zurueckgeholt wird nur in einen neuen oder leeren Ordner." >&2
        return 2
    fi
    mkdir -p "$ziel" || return 1
    local args=(--target "$ziel") p
    for p in "$@"; do
        args+=(--include "$p")
    done
    stand_restic "$repo" "$schluessel" restore "$stand" "${args[@]}"
}

# --- Befehl ------------------------------------------------------------------
stand_wurzel_fuer() { # lokal|extern
    if [ "$1" = extern ]; then
        printf '%s/arasul-sicherung' "${BACKUP_EXTERN_ZIEL:-/arasul/extern}"
    else
        printf '%s' "${BACKUP_DIR:-/backups}"
    fi
}

stand_befehl() {
    local befehl="${1:-}"
    [ $# -gt 0 ] && shift
    local quelle=lokal json=false daten="" pfade=() rest=()
    while [ $# -gt 0 ]; do
        case "$1" in
            --quelle) quelle="$2"; shift 2 ;;
            --json) json=true; shift ;;
            --daten) daten="$2"; shift 2 ;;
            --pfad) pfade+=("$2"); shift 2 ;;
            *) rest+=("$1"); shift ;;
        esac
    done
    local repo
    repo=$(stand_repo "$(stand_wurzel_fuer "$quelle")") || {
        echo "Ohne Sicherungsschluessel (${STAND_SCHLUESSEL}) gibt es keinen Stand." >&2
        return 1
    }
    case "$befehl" in
        liste)
            local liste
            if ! liste=$(stand_liste "$repo" "$STAND_SCHLUESSEL"); then
                echo "Kein lesbares Repo unter ${repo}" >&2
                return 1
            fi
            if [ "$json" = true ]; then
                printf '%s\n' "$liste"
            else
                jq -r '.[] | "\(.kurz)  \(.zeit[0:19] | sub("T"; " "))"' <<<"$liste"
            fi
            ;;
        zurueckholen)
            if [ "${#rest[@]}" -lt 2 ] 2>/dev/null; then
                echo "Aufruf: staende.sh zurueckholen <stand> <ziel> [--quelle lokal|extern] [--pfad <pfad>]..." >&2
                return 2
            fi
            stand_zurueckholen "$repo" "$STAND_SCHLUESSEL" "${rest[0]}" "${rest[1]}" ${pfade[@]+"${pfade[@]}"}
            ;;
        pruefen)
            if [ -n "$daten" ]; then
                stand_restic "$repo" "$STAND_SCHLUESSEL" check --read-data-subset "$daten"
            else
                stand_restic "$repo" "$STAND_SCHLUESSEL" check
            fi
            ;;
        klartext)
            local ordner
            if [ -n "${rest[0]+x}" ]; then
                ordner="${rest[0]}"
            else
                ordner=$(stand_wurzel_fuer "$quelle")
            fi
            stand_klartext "$ordner"
            printf '%s' "$STAND_KLARTEXT_DATEIEN"
            echo "klartext=${STAND_KLARTEXT}"
            [ "$STAND_KLARTEXT" = 0 ]
            ;;
        *)
            sed -n '50,62p' "${BASH_SOURCE[0]}"
            return 2
            ;;
    esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    stand_befehl "$@"
    exit $?
fi
