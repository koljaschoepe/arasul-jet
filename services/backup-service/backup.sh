#!/bin/bash
# =============================================================================
# Die naechtliche Sicherung (Phase C9 des Umbaus vom 26.08.2026)
# =============================================================================
# Vier Dinge werden gesichert, und die Frage dahinter ist jedes Mal dieselbe:
# WAS BEKOMMT DER KUNDE NACH EINEM GERAETEVERLUST NICHT ZURUECK, WENN ES HIER
# FEHLT?
#
#   postgres   Nutzer und Rollen, Apps und ihre Staende, Freigaben, Schluessel,
#              Flow-Laeufe mit Schritten, Freigabe-Anfragen, die Einstellungen
#              des Administrators je Flow, das Migrationsbuch. Das ganze
#              Datenmodell aus den Phasen B bis C8 steckt darin -- `pg_dump`
#              nimmt jedes Schema mit, es steht keine Tabellenliste im Weg.
#              DAZU JEDE APP-DATENBANK (Phase H7): seit H7 bekommt jede App je
#              Stand eine eigene Datenbank im selben Cluster, und `pg_dump` des
#              Plattform-Abzugs sieht sie nicht -- er nimmt eine Datenbank, und
#              das ist `arasul_db`. Was ein Partner in seiner App ablegt, waere
#              sonst das Einzige, was ein Geraeteverlust wirklich vernichtet.
#   apps       Die PAKETE der Apps (`/arasul/apps/<id>/<version>/`): Manifest,
#              fertiges Frontend, Dockerfile mit Kontext. Bis Phase C9 stand
#              das in keinem Archiv, und das war das groesste Loch: die
#              Datenbank haette nach der Wiederherstellung `app_staende` mit
#              Versionen genannt, deren Dateien es nicht mehr gibt. Die Images
#              werden NICHT gesichert -- sie werden aus dem Paket neu gebaut,
#              am Geraet, fuer das Geraet (dieselbe Entscheidung wie beim
#              Deploy, siehe `services/app/appPaket.js`).
#   flows      Die Flow-Dateien unter `/arasul/flows`, die ein Mensch am Geraet
#              geschrieben hat. Die Flows, die eine App MITBRINGT, liegen im
#              App-Paket und kommen mit `apps`.
#   firmenordner
#              Die Dateien der Firma (J33, 22.09.2026). Das ist der Ordner,
#              den die Mitarbeiter an ihren Rechnern abgleichen -- Vertraege,
#              Angebote, Regeln, alles, was im Haus entsteht. Er ist von den
#              vier hier der einzige, in dem AUSSCHLIESSLICH Dinge liegen, die
#              es nirgendwo sonst gibt: die Apps lassen sich neu einspielen,
#              die Flows neu schreiben, die Konfiguration neu erzeugen. Was
#              hier fehlt, ist weg.
#              GESICHERT WIRD DER BAUM, NICHT DER DIENST. Die Ablage `posix`
#              haelt echte Dateien (genau darum ist dieser Dienst gewaehlt
#              worden, 21.09.2026) -- ein `tar` darueber ist deshalb wirklich
#              der Inhalt und nicht eine Blocksammlung, die ohne ihren Dienst
#              nichts bedeutet. Mitgenommen wird auch `.oc-nodes`, die
#              Verwaltung des Dienstes: ohne sie stuenden die Dateien nach dem
#              Weg zurueck zwar da, aber der Dienst kennte ihre Rechte nicht.
#   config     `.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie faehrt auf
#              einem leeren Geraet kein einziger Container hoch.
#
# NICHT gesichert werden App-Volumes: es gibt keine. Eine App bekommt weder
# Bind-Mount noch benanntes Volume (`services/app/appContainer.js`). Ihren
# Speicher hat sie seit H7 trotzdem, und zwar als Datenbank -- genau ein Ort je
# App und Stand, damit es auf die Frage „was wird gesichert" genau eine Antwort
# gibt. Wer einen zweiten Ort einfuehrt, aendert diese Zeile.
#
# DER SICHERUNGSSCHLUESSEL IST NICHT IM ARCHIV. `config/secrets/backup_encryption_key`
# wird ausgenommen, und zwar nicht aus Vorsicht, sondern weil es sonst sinnlos
# waere: wer das Archiv oeffnen will, braucht den Schluessel VORHER. Er gehoert
# ausserhalb des Geraets aufbewahrt, sonst ist jede Sicherung Papier.
#
# Zurueckgespielt wird mit `wiederherstellen.sh` in diesem Ordner -- ein Weg,
# nicht drei.
# =============================================================================
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u) # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
WEEKLY_RETENTION_WEEKS=${BACKUP_WEEKLY_RETENTION_WEEKS:-52}
WEEKLY_RETENTION_DAYS=$((WEEKLY_RETENTION_WEEKS * 7))
MONTHLY_RETENTION_MONTHS=${BACKUP_MONTHLY_RETENTION_MONTHS:-60}
MONTHLY_RETENTION_DAYS=$((MONTHLY_RETENTION_MONTHS * 30))

# Backup encryption (AES-256-CBC via openssl)
BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-false}
BACKUP_ENCRYPT_KEY_FILE=${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}

# Meldet der Bericht die Absicht oder das Ergebnis? Frueher die Absicht:
# `"encrypted": "$BACKUP_ENCRYPT"`. Faellt encrypt_file durch, weil openssl
# fehlt oder der Schluessel nicht da ist, stand im Bericht trotzdem
# verschluesselt, waehrend jede Datei im Klartext lag. Genau diese Sorte Zusage
# hat Gate G6 aufgemacht. Deshalb wird jetzt mitgezaehlt, was wirklich passiert
# ist (Plan 023 S3).
VERSCHLUESSELUNG_ERFOLGT=true
if [ "$BACKUP_ENCRYPT" = "true" ] && [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
    echo "[$TIMESTAMP] [ERROR] BACKUP_ENCRYPT=true, aber der Schluessel fehlt (${BACKUP_ENCRYPT_KEY_FILE})"
    VERSCHLUESSELUNG_ERFOLGT=false
fi

encrypt_file() {
    local src="$1"
    if [ "$BACKUP_ENCRYPT" = "true" ] && [ -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
        # Use -pass file: instead of pass:$KEY so the secret is not visible in
        # /proc/<pid>/cmdline to other processes on the host while openssl runs.
        if openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "${src}.enc" -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null; then
            mv "${src}.enc" "$src"
            echo "[$TIMESTAMP] Encrypted: $(basename "$src")"
            return 0
        else
            echo "[$TIMESTAMP] [ERROR] Verschluesselung fehlgeschlagen fuer $(basename "$src"), Datei bleibt im Klartext"
            rm -f "${src}.enc"
            VERSCHLUESSELUNG_ERFOLGT=false
            return 1
        fi
    fi
    return 0
}

# -----------------------------------------------------------------------------
# Passt der Schluessel zu dem, was schon da ist? (J37, 02.10.2026)
# -----------------------------------------------------------------------------
# Anlass: Koljas Sicherung der Belege-App auf den Mac fiel vom 26.09. bis
# 01.10.2026 still aus, 146 Ausfaelle im Log. Die Neuinstallation hatte einen
# NEUEN Schluessel erzeugt (`config/secrets/` wird beim Werksreset geloescht);
# was danach lief, war mit dem neuen Schluessel verschluesselt, was auf dem
# Stick lag, mit dem alten -- und nichts hat das gesagt.
#
# GEPRUEFT WIRD VOR DER NEUEN SICHERUNG, denn danach waere die neueste Datei
# immer eine mit dem jetzigen Schluessel und die Pruefung immer gruen. Gelesen
# werden nur die ersten Bytes: entschluesselt wird der Anfang, und er muss ein
# gzip-Kopf sein (1f8b). Ein falscher Schluessel liefert Zufall.
#
# Das Ergebnis steht in `/backups/schluessel_pruefung.json`; das Dashboard
# zeigt es im Admin-Bereich, und das Backend schickt dem Admin eine Mitteilung
# (`services/betrieb/schluesselWaechter.js`). Diese Pruefung bricht die
# Sicherung NICHT ab: eine neue Sicherung mit dem jetzigen Schluessel ist
# besser als keine.
EXTERN_ZIEL=${BACKUP_EXTERN_ZIEL:-/arasul/extern}
EXTERN_AN=${BACKUP_EXTERN_AN:-auto}
EXTERN_TAGE=${BACKUP_EXTERN_TAGE:-14}

abdruck_des_schluessels() {
    [ -f "$BACKUP_ENCRYPT_KEY_FILE" ] || { printf ''; return 0; }
    printf 'arasul-sicherung:%s' "$(cat "$BACKUP_ENCRYPT_KEY_FILE")" | sha256sum | cut -c1-16
}

ist_verschluesselt() {
    [ "$(head -c 8 "$1" 2>/dev/null)" = "Salted__" ]
}

passt_zum_schluessel() {
    [ -f "$BACKUP_ENCRYPT_KEY_FILE" ] || return 1
    [ "$(openssl enc -d -aes-256-cbc -pbkdf2 -in "$1" -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null \
        | head -c 2 | od -An -tx1 | tr -d ' \n')" = "1f8b" ]
}

# Liegt das Ziel wirklich ausserhalb? (Geraetenummer, siehe kopiere_nach_aussen.)
extern_ist_draussen() {
    [ "$EXTERN_AN" = "false" ] && return 1
    [ -d "$EXTERN_ZIEL" ] || return 1
    local dev_ziel dev_hier
    dev_ziel=$(stat -c %d "$EXTERN_ZIEL" 2>/dev/null || echo "")
    dev_hier=$(stat -c %d /backups 2>/dev/null || echo "")
    [ -n "$dev_ziel" ] && [ "$dev_ziel" != "$dev_hier" ]
}

# $1 = Dateien, eine Zeile je Datei, aelteste zuerst. Setzt BEWERTUNG_* .
bewerte_sicherungen() {
    BEWERTUNG_NEUESTE=""
    BEWERTUNG_PASST=null
    BEWERTUNG_LESBAR=0
    BEWERTUNG_UNLESBAR=0
    local datei
    while IFS= read -r datei; do
        [ -n "$datei" ] && [ -f "$datei" ] || continue
        BEWERTUNG_NEUESTE="$(basename "$datei")"
        if ! ist_verschluesselt "$datei" || passt_zum_schluessel "$datei"; then
            BEWERTUNG_LESBAR=$((BEWERTUNG_LESBAR + 1))
            BEWERTUNG_PASST=true
        else
            BEWERTUNG_UNLESBAR=$((BEWERTUNG_UNLESBAR + 1))
            BEWERTUNG_PASST=false
        fi
    done <<<"$1"
}

APP_ZEILEN=""
SCHLUESSEL_PASST=null
pruefe_schluessel() {
    local lokal_liste extern_liste
    lokal_liste=$(find /backups/postgres -maxdepth 1 -name 'arasul_db_*.sql.gz' ! -name '*latest*' 2>/dev/null | sort | tail -n 60)
    bewerte_sicherungen "$lokal_liste"
    local l_neueste="$BEWERTUNG_NEUESTE" l_passt="$BEWERTUNG_PASST" l_lesbar="$BEWERTUNG_LESBAR" l_unlesbar="$BEWERTUNG_UNLESBAR"

    local e_neueste="" e_passt=null e_lesbar=0 e_unlesbar=0
    if extern_ist_draussen; then
        extern_liste=$(find "$EXTERN_ZIEL/arasul-sicherung" -mindepth 2 -maxdepth 2 -name 'arasul_db_*.sql.gz' 2>/dev/null \
            | awk -F/ '{print $(NF-1) "/" $NF "\t" $0}' | sort | tail -n 60 | cut -f2)
        bewerte_sicherungen "$extern_liste"
        e_neueste="$BEWERTUNG_NEUESTE"; e_passt="$BEWERTUNG_PASST"; e_lesbar="$BEWERTUNG_LESBAR"; e_unlesbar="$BEWERTUNG_UNLESBAR"
    fi

    local passt=null grund=""
    if [ "$l_passt" = false ] || [ "$e_passt" = false ]; then
        passt=false
        if [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
            grund="Der Sicherungsschluessel dieses Geraets fehlt."
        elif [ "$e_passt" = false ]; then
            grund="Der Schluessel dieses Geraets passt nicht zur letzten Sicherung auf dem Datentraeger (${e_neueste})."
        else
            grund="Der Schluessel dieses Geraets passt nicht zur letzten Sicherung (${l_neueste})."
        fi
    elif [ "$l_passt" = true ] || [ "$e_passt" = true ]; then
        passt=true
    fi
    SCHLUESSEL_PASST="$passt"
    # Wird der Stick nicht gelesen (nicht angesteckt), steht das als `null`,
    # nicht als `true`: „nicht geprueft" ist keine Zusage.

    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg abdruck "$(abdruck_des_schluessels)" \
        --argjson passt "$passt" \
        --arg grund "$grund" \
        --arg l_neueste "$l_neueste" --argjson l_passt "$l_passt" \
        --argjson l_lesbar "$l_lesbar" --argjson l_unlesbar "$l_unlesbar" \
        --arg e_neueste "$e_neueste" --argjson e_passt "$e_passt" \
        --argjson e_lesbar "$e_lesbar" --argjson e_unlesbar "$e_unlesbar" \
        '{zeitpunkt:$zeitpunkt, abdruck:$abdruck, passt:$passt, grund:$grund,
          lokal:{neueste:(if $l_neueste=="" then null else $l_neueste end), passt:$l_passt, lesbar:$l_lesbar, unlesbar:$l_unlesbar},
          extern:{neueste:(if $e_neueste=="" then null else $e_neueste end), passt:$e_passt, lesbar:$e_lesbar, unlesbar:$e_unlesbar},
          aeltere_unlesbar:($l_unlesbar + $e_unlesbar)}' \
        > /backups/schluessel_pruefung.json.neu \
        && mv -f /backups/schluessel_pruefung.json.neu /backups/schluessel_pruefung.json
    if [ "$passt" = false ]; then
        echo "[$TIMESTAMP] [ERROR] ${grund}"
    fi
}
pruefe_schluessel || echo "[$TIMESTAMP] [WARNING] Schluesselpruefung selbst ist gescheitert"

echo "[$TIMESTAMP] Starting backup..."
BACKUP_OK=true

# PostgreSQL backup (use .pgpass to avoid password in process listing)
mkdir -p /backups/postgres /backups/postgres/weekly
# `*` als Datenbank und nicht `$POSTGRES_DB`: seit H7 wird auch je App eine
# Datenbank im selben Cluster abgezogen, und ein Eintrag, der nur `arasul_db`
# nennt, gaebe dort kein Passwort her.
echo "$POSTGRES_HOST:${POSTGRES_PORT:-5432}:*:$POSTGRES_USER:$POSTGRES_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
if pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$TIMESTAMP.sql.gz; then
    # Verify backup integrity
    if gunzip -t /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null; then
        PG_BYTES=$(stat -c%s /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null || echo "0")
        if [ "$PG_BYTES" -gt 100 ] 2>/dev/null; then
            echo "[$TIMESTAMP] PostgreSQL backup completed and verified (${PG_BYTES} bytes)"
        else
            echo "[$TIMESTAMP] [ERROR] PostgreSQL backup too small (${PG_BYTES} bytes) — likely empty"
            BACKUP_OK=false
        fi
    else
        echo "[$TIMESTAMP] [ERROR] PostgreSQL backup corrupt (gunzip integrity check failed)"
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] PostgreSQL backup failed"
    BACKUP_OK=false
fi
# `|| true`, weil `set -e` sonst genau hier aussteigt: `encrypt_file` gibt bei
# fehlgeschlagener Verschluesselung 1 zurueck, und dieser Aufruf steht am
# Zeilenanfang. Das Skript waere ohne Bericht abgebrochen -- und der
# Healthcheck haette einen veralteten `backup_report.json` gefunden und rot
# gemeldet, ohne zu sagen, woran es lag. Der Fehlschlag ist nicht verschwunden:
# `VERSCHLUESSELUNG_ERFOLGT` steht auf false, und der Block weiter unten legt
# BACKUP_OK dafuer um.
encrypt_file /backups/postgres/arasul_db_$TIMESTAMP.sql.gz || true
ln -sf arasul_db_$TIMESTAMP.sql.gz /backups/postgres/arasul_db_latest.sql.gz

# -----------------------------------------------------------------------------
# Die Datenbanken der Apps (Phase H7)
# -----------------------------------------------------------------------------
# GEFRAGT WIRD DER CLUSTER, NICHT DIE TABELLE. Die Namen stuenden auch in
# `app_datenbanken`, aber eine Sicherung, die eine Tabelle fragt, sichert nur,
# was dort steht -- und eine Datenbank, deren Zeile jemand verloren hat, waere
# unsichtbar UND unwiederbringlich. Der Praefix ist die Wahrheit; er ist
# dieselbe Zeichenkette wie `PRAEFIX` in `services/app/appDatenbank.js`.
#
# EIN FEHLSCHLAG HIER IST EIN FEHLSCHLAG. Anders als bei einem fehlenden
# Ordner: eine Datenbank, die der Cluster gerade genannt hat, muss sich auch
# abziehen lassen. Ein Geraet ohne Apps hat null davon und laeuft still durch.
mkdir -p /backups/postgres/apps
APP_DBS=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'arasul\\_app\\_%' ORDER BY datname" \
  2>/dev/null || true)
APP_DB_ANZAHL=0
for APP_DB in $APP_DBS; do
    ZIEL="/backups/postgres/apps/${APP_DB}_${TIMESTAMP}.sql.gz"
    if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$APP_DB" \
         --no-owner --no-acl --clean --if-exists | gzip > "$ZIEL" \
       && gunzip -t "$ZIEL" 2>/dev/null; then
        encrypt_file "$ZIEL" || true
        ln -sf "$(basename "$ZIEL")" "/backups/postgres/apps/${APP_DB}_latest.sql.gz"
        APP_DB_ANZAHL=$((APP_DB_ANZAHL + 1))
    else
        echo "[$TIMESTAMP] [ERROR] App-Datenbank ${APP_DB} liess sich nicht sichern"
        BACKUP_OK=false
    fi
done
# `|| true`: unter `set -e` beendet ein `[ ] && echo` mit falschem Test das
# Skript -- und null App-Datenbanken sind der Normalfall auf einem neuen Geraet.
[ "$APP_DB_ANZAHL" -gt 0 ] && echo "[$TIMESTAMP] ${APP_DB_ANZAHL} App-Datenbank(en) gesichert" || true
# Welche App welche Datenbank hat (J37): das Manifest auf dem Datentraeger
# braucht die Zuordnung, weil sich aus dem Namen der Datenbank die Kennung der
# App nicht sicher zurueckrechnen laesst (Bindestrich, langer Name mit Abdruck).
APP_ZEILEN=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAF'|' -c \
  "SELECT app_id, stand, datenbank FROM public.app_datenbanken ORDER BY app_id, stand" \
  2>/dev/null || true)
rm -f ~/.pgpass

# Weekly snapshot: copy Sunday's backup to weekly dir (kept longer)
if [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/weekly/
    echo "[$TIMESTAMP] Weekly PostgreSQL snapshot saved"
fi

# Monthly snapshot: copy 1st of month to monthly dir (5-year retention)
if [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/postgres/monthly
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/monthly/
    echo "[$TIMESTAMP] Monthly PostgreSQL snapshot saved"
fi

# Bis zum 26.08.2026 stand hier die MinIO-Sicherung (Phase B4 des Rueckbaus:
# der Objektspeicher ist weg, kein Dienst schreibt mehr hinein). Kritisch ist
# seitdem nur noch Postgres; ein Ausfall dort setzt BACKUP_OK auf false.

# -----------------------------------------------------------------------------
# Ordner sichern: apps, flows, config
# -----------------------------------------------------------------------------
# EINE Funktion fuer alle drei. Bis Phase C9 stand der Flow-Block dreissig
# Zeilen lang von Hand da; die Apps daneben zu stellen haette ihn ein zweites
# und die Konfiguration ein drittes Mal bedeutet -- drei Stellen, an denen der
# naechste Verschluesselungs- oder Aufbewahrungsfehler je einzeln zu suchen
# waere.
#
# EIN FEHLENDER ORDNER IST EINE WARNUNG, KEIN FEHLSCHLAG: aeltere Staende haben
# den Mount nicht, und ein Geraet ohne eine einzige App hat kein
# `/arasul/apps`. BACKUP_OK dort umzulegen hiesse, den Healthcheck auf einem
# gesunden Geraet rot zu faerben.
#
# EIN LEERER ORDNER IST KEIN FEHLER. `tar` schreibt dann ein gueltiges Archiv
# mit einem Eintrag, und genau das ist die richtige Antwort auf "es gibt hier
# nichts": naechste Nacht steht vielleicht etwas drin.
#
# WER WAEHREND DES LAUFS SCHREIBT, LAESST DIE SICHERUNG NICHT SCHEITERN (J35,
# 27.09.2026). Am Orin schrieb der Abgleich eines Rechners knapp tausend Dateien
# in den Firmenordner, waehrend `backup-service` neu startete und sicherte.
# GNU tar endet dann mit 1 ("file changed as we read it", "File removed before
# we read it") -- das Archiv ist trotzdem vollstaendig fuer alles, was sich
# nicht bewegt hat. Bis dahin hiess jede Zahl ausser 0 hier "Archiv liess sich
# nicht anlegen", der Bericht stand auf `partial_failure`, der Healthcheck fiel
# und der Deploy von PR 801 rollte zurueck. Im Alltag ist genau das der
# Normalfall: jemand legt eine Datei ab, waehrend die Nacht sichert.
# Deshalb: 1 ist "es hat sich etwas bewegt", 2 und mehr bleiben ein Fehlschlag
# (fehlendes Recht, volle Platte, kaputte Quelle), und in beiden Faellen wird
# das Archiv danach gegengelesen. WAS sich bewegt hat, steht im Bericht
# (`<name>_geaendert`, `<name>_geaendert_dateien`) -- eine Datei, die erst
# waehrend des Laufs kam, ist vielleicht nicht im Archiv, und das muss man
# sehen koennen, statt es zu vermuten.
#
# Gefragt wird nach der CTIME und nicht nach der mtime: der Abgleichsklient
# setzt die mtime einer Datei auf die seines Rechners, eine gerade abgelegte
# Datei kann also "von gestern" sein. Die ctime setzt nur der Kern.
#
# Setzt $ARCHIV_STATUS auf true | false | skipped und $ARCHIV_GEAENDERT auf die
# Liste der Pfade (relativ zur Quelle, eine Zeile je Pfad), die sich waehrend
# des Laufs bewegt haben.
ARCHIV_STATUS=skipped
ARCHIV_GEAENDERT=""
sichere_ordner() {
    local name="$1" quelle="$2"
    shift 2
    local ziel="/backups/${name}/${name}_${TIMESTAMP}.tar.gz"
    ARCHIV_STATUS=skipped
    ARCHIV_GEAENDERT=""

    if [ ! -d "$quelle" ]; then
        echo "[$TIMESTAMP] [WARNING] ${name}: ${quelle} nicht eingehaengt — uebersprungen"
        return 0
    fi

    mkdir -p "/backups/${name}" "/backups/${name}/weekly"

    # Der Stempel VOR dem ersten Lesen: alles, dessen ctime danach liegt, hat
    # sich waehrend des Laufs bewegt.
    local stempel meldungen rc=0
    stempel=$(mktemp)
    meldungen=$(mktemp)
    tar -czf "$ziel" -C "$quelle" "$@" . 2>"$meldungen" || rc=$?

    if [ "$rc" -le 1 ]; then
        # Was waehrend des Laufs kam oder sich aenderte (find), und was tar
        # verschwinden sah (seine Meldungen) -- das Zweite findet `find` nicht
        # mehr, weil es nicht mehr da ist.
        ARCHIV_GEAENDERT=$(
            {
                find "$quelle" -mindepth 1 -type f -cnewer "$stempel" -printf './%P\n' 2>/dev/null || true
                sed -nE 's/^tar: (.*): (file changed as we read it|File removed before we read it|file shrank by .*)$/\1/p' "$meldungen"
            } | sort -u
        )
    fi
    if [ "$rc" -gt 1 ]; then
        sed "s/^/[$TIMESTAMP] ${name}: /" "$meldungen" | head -20
    fi
    rm -f "$stempel" "$meldungen"

    # Erst packen, dann GEGENLESEN. Ein `tar`, das ohne Fehler zurueckkommt,
    # sagt nichts darueber, ob sich das Archiv wieder oeffnen laesst.
    if [ "$rc" -le 1 ] && tar -tzf "$ziel" >/dev/null 2>&1; then
        local bytes anzahl=0
        bytes=$(stat -c%s "$ziel" 2>/dev/null || echo "0")
        if [ -n "$ARCHIV_GEAENDERT" ]; then
            anzahl=$(printf '%s\n' "$ARCHIV_GEAENDERT" | wc -l)
        fi
        if [ "$rc" = 1 ] || [ "$anzahl" -gt 0 ]; then
            echo "[$TIMESTAMP] ${name}: gesichert und gegengelesen (${bytes} Bytes, tar ${rc}), ${anzahl} Datei(en) haben sich waehrend des Laufs geaendert"
        else
            echo "[$TIMESTAMP] ${name}: gesichert und gegengelesen (${bytes} Bytes)"
        fi
        encrypt_file "$ziel"
        ln -sf "$(basename "$ziel")" "/backups/${name}/${name}_latest.tar.gz"
        [ "$DAY_OF_WEEK" = "7" ] && cp "$ziel" "/backups/${name}/weekly/"
        if [ "$DAY_OF_MONTH" = "01" ]; then
            mkdir -p "/backups/${name}/monthly"
            cp "$ziel" "/backups/${name}/monthly/"
        fi
        ARCHIV_STATUS=true
        return 0
    fi

    echo "[$TIMESTAMP] [ERROR] ${name}: Archiv liess sich nicht anlegen oder nicht wieder oeffnen (tar ${rc})"
    rm -f "$ziel"
    ARCHIV_STATUS=false
    BACKUP_OK=false
    return 1
}

# Die Pakete der Apps. `.eingang` bleibt draussen: dort liegt, was ein Deploy
# gerade auspackt oder als Bruchstueck hinterlassen hat -- nie etwas, das eine
# Wiederherstellung braucht (`services/app/appPaket.js`).
APPS_SRC=${APPS_BACKUP_DIR:-/arasul/apps}
sichere_ordner apps "$APPS_SRC" --exclude=./.eingang || true
APPS_OK="$ARCHIV_STATUS"

# Flow definitions (Plan 011): Markdown files under data/flows, mounted here
# read-only. They are small but USER-AUTHORED and reproducible from nowhere else
# — Postgres does not contain them. A device loss without this would
# silently take every self-built flow with it.
FLOWS_SRC=${FLOWS_BACKUP_DIR:-/arasul/flows}
sichere_ordner flows "$FLOWS_SRC" || true
FLOWS_OK="$ARCHIV_STATUS"

# Der Firmenordner (J33, 22.09.2026). Ein Geraet ohne das Profil
# `firmenordner` hat diesen Mount nicht -- `sichere_ordner` ueberspringt ihn
# dann mit einer Warnung und laesst BACKUP_OK in Ruhe, wie bei `apps` auf
# einem Geraet ohne App.
FIRMENORDNER_SRC=${FIRMENORDNER_BACKUP_DIR:-/arasul/firmenordner}
sichere_ordner firmenordner "$FIRMENORDNER_SRC" || true
FIRMENORDNER_OK="$ARCHIV_STATUS"
# Was sich waehrend des Laufs bewegt hat, fuer den Bericht: die Zahl und
# hoechstens hundert Pfade. Tausend Pfade machten den Bericht nicht klueger,
# nur die Seite langsamer, die ihn liest; die Zahl sagt, wie viele es waren.
FIRMENORDNER_GEAENDERT=0
FIRMENORDNER_GEAENDERT_DATEIEN='[]'
if [ -n "$ARCHIV_GEAENDERT" ]; then
    FIRMENORDNER_GEAENDERT=$(printf '%s\n' "$ARCHIV_GEAENDERT" | wc -l)
    FIRMENORDNER_GEAENDERT_DATEIEN=$(printf '%s\n' "$ARCHIV_GEAENDERT" | head -n 100 | jq -R . | jq -sc .)
fi

# Die Konfiguration: `.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie faehrt
# auf einem leeren Geraet nichts hoch.
#
# OHNE DEN SICHERUNGSSCHLUESSEL, siehe Kopf dieser Datei. Bis Phase C9 sicherte
# das ein zweites Skript auf dem Host (`scripts/backup/backup.sh`), das der
# Zeitplan nie aufrief -- die Konfiguration war damit auf keinem Geraet
# gesichert, auf dem niemand von Hand nachgeholfen hat.
CONFIG_SRC=${CONFIG_BACKUP_DIR:-/arasul/konfiguration}
sichere_ordner config "$CONFIG_SRC" --exclude=./config/secrets/backup_encryption_key || true
CONFIG_OK="$ARCHIV_STATUS"

# WAL archive backup: include in daily backup for PITR
WAL_COUNT=0
if [ -d /backups/wal ] && [ "$(ls -A /backups/wal 2>/dev/null)" ]; then
    mkdir -p /backups/wal-archive
    tar -czf /backups/wal-archive/wal_$TIMESTAMP.tar.gz -C /backups/wal . 2>/dev/null || true
    WAL_COUNT=$(ls /backups/wal/ 2>/dev/null | wc -l)
    echo "[$TIMESTAMP] WAL archive backup completed ($WAL_COUNT files)"
fi

# Wer Verschluesselung verlangt und Klartext bekommt, hat keine Sicherung nach
# Zusage. Das muss laut sein, nicht als Warnung im Protokoll verschwinden.
if [ "$BACKUP_ENCRYPT" = "true" ] && [ "$VERSCHLUESSELUNG_ERFOLGT" != true ]; then
    echo "[$TIMESTAMP] [ERROR] Verschluesselung war verlangt, ist aber nicht durchgehend erfolgt"
    BACKUP_OK=false
fi

# -----------------------------------------------------------------------------
# Die Kopie ausserhalb des Geraets (Entscheidung Kolja, 27.08.2026)
# -----------------------------------------------------------------------------
# Eine Sicherung, die auf derselben Platte liegt wie das Original, ueberlebt
# genau die Faelle nicht, fuer die es sie gibt: Diebstahl, Feuer, Platte tot.
# Deshalb ein Ziel AUSSERHALB -- ein USB-Datentraeger oder eine SMB-Freigabe im
# Kundennetz, eingehaengt vom Betriebssystem und hier nur als Ordner sichtbar.
#
# KEIN CLOUD-ZIEL. Nicht aus Bequemlichkeit weggelassen: das Geraet steht beim
# Kunden, die Daten bleiben dort, und ein Ziel, das eine Zugangskennung zu
# einem fremden Rechenzentrum braucht, waere genau der Bruch, den die
# Datenschutzzusage dieses Produkts nicht macht.
#
# EINGEHAENGT WIRD NICHT HIER. Ob der Stick steckt oder die Freigabe verbunden
# ist, entscheidet das Betriebssystem des Geraets. Dieser Dienst schaut nach,
# ob unter dem Ziel etwas Beschreibbares liegt, und sagt sonst, dass es fehlt.
#
# WAS BEIM MISSLINGEN PASSIERT: nichts Rotes. Ein abgezogener Stick ist der
# Normalfall im Alltag und darf die naechtliche Sicherung nicht als
# fehlgeschlagen melden -- sonst faerbt sich der Healthcheck rot, waehrend
# lokal alles vollstaendig gesichert ist. Sichtbar bleibt es trotzdem: der
# Bericht sagt, wann die letzte Kopie ausserhalb entstanden ist, und ueber
# `/api/backup/status` liest das jeder.
EXTERN_STATUS=kein_ziel
EXTERN_KOPIERT=0
EXTERN_BYTES=0
EXTERN_KLARTEXT=0
EXTERN_FREI=0

# NUR VERSCHLUESSELTES VERLAESST DAS GERAET (J37, 02.10.2026). Der Stick wird
# abgezogen, verliehen, vergessen; was auf ihm liegt, muss ohne den Schluessel
# wertlos sein. Jede Datei wird VOR dem Kopieren auf den Kopf von `openssl enc`
# (`Salted__`) geprueft und NACH dem Kopieren noch einmal; eine Datei mit
# gzip- oder tar-Kopf kommt nicht auf den Datentraeger. Heisst das, dass bei
# `BACKUP_ENCRYPT=false` nichts kopiert wird? Ja: `nur_verschluesselt`, laut
# im Bericht und im Dashboard -- nicht stillschweigend Klartext.
#
# DER AUFBAU AUF DEM STICK: `arasul-sicherung/<JJJJMMTT>/` mit den neuesten
# Dateien dieses Tages, dazu `MANIFEST.json` (welche Apps, welche Dateien, mit
# welchem Schluessel-Abdruck). Das Manifest ist Klartext und enthaelt nur
# Namen und Groessen -- es erlaubt dem Dashboard, dem Admin die Apps auf dem
# Stick zu zeigen, ohne den Schluessel zu haben.
#
# DIE ZAHL DER TAGE auf dem Stick ist begrenzt (`BACKUP_EXTERN_TAGE`, 14), und
# wenn der Platz nicht reicht, gehen die AELTESTEN Tage zuerst. Nie aber, solange
# der Schluessel nicht zur letzten Sicherung auf dem Stick passt: dann sind die
# alten Tage vielleicht das Einzige, was sich mit dem frueheren Schluessel
# (Wiederherstellungscode) noch oeffnen laesst.

stick_tage() { # aelteste zuerst
    find "$EXTERN_ZIEL/arasul-sicherung" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' 2>/dev/null | sort
}

stick_frei_kb() {
    df -P -k "$EXTERN_ZIEL" 2>/dev/null | awk 'NR==2 {print $4}'
}

kopiere_nach_aussen() {
    if [ "$EXTERN_AN" = "false" ]; then
        EXTERN_STATUS=abgeschaltet
        return 0
    fi
    if [ ! -d "$EXTERN_ZIEL" ]; then
        EXTERN_STATUS=kein_ziel
        echo "[$TIMESTAMP] Kein Ziel ausserhalb eingehaengt — nur lokal gesichert"
        return 0
    fi
    # LIEGT DAS ZIEL WIRKLICH AUSSERHALB? Das ist keine Formalie, sondern die
    # ganze Zusage dieses Abschnitts. Ein Bind-Mount auf einen Host-Pfad, den
    # niemand eingehaengt hat, legt Docker als leeren Ordner an -- er ist da,
    # er nimmt Dateien an, und die Kopie laege auf derselben Platte wie das
    # Original. Der Bericht wuerde "ausserhalb gesichert" melden, waehrend ein
    # Plattenausfall beides mitnimmt.
    #
    # Erkannt wird an der GERAETENUMMER des Dateisystems: gleiche Nummer wie
    # der Sicherungsordner heisst dieselbe Platte, also kein Ziel ausserhalb.
    # `mountpoint` gibt es in busybox nicht, `stat -c %d` schon.
    if ! extern_ist_draussen; then
        EXTERN_STATUS=nicht_eingehaengt
        echo "[$TIMESTAMP] Kein Datentraeger angesteckt (das Ziel liegt auf derselben Platte wie das Geraet) — nur lokal gesichert"
        return 0
    fi

    # Ein Ordner, der da ist, aber nichts annimmt, ist kein Ziel. Genau so
    # sieht ein Mountpunkt aus, dessen Datentraeger abgezogen wurde (oder ein
    # schreibgeschuetzter): der Ordner bleibt, das Schreiben schlaegt fehl.
    if ! touch "${EXTERN_ZIEL}/.arasul_schreibprobe" 2>/dev/null; then
        EXTERN_STATUS=nicht_beschreibbar
        echo "[$TIMESTAMP] [WARNING] Der Datentraeger nimmt nichts an (schreibgeschuetzt oder abgezogen?)"
        return 0
    fi
    rm -f "${EXTERN_ZIEL}/.arasul_schreibprobe"

    # Die Liste dessen, was kopiert wird: nur Verschluesseltes.
    local quellen=() abgelehnt=0 quelle echt benoetigt_kb=0
    for quelle in \
        /backups/postgres/arasul_db_latest.sql.gz \
        /backups/postgres/apps/*_latest.sql.gz \
        /backups/apps/apps_latest.tar.gz \
        /backups/flows/flows_latest.tar.gz \
        /backups/firmenordner/firmenordner_latest.tar.gz \
        /backups/config/config_latest.tar.gz; do
        [ -e "$quelle" ] || continue
        # Ueber den Link hinweg auf die echte Datei: ein Symlink auf dem Stick
        # zeigt ins Leere, sobald er woanders steckt.
        echt=$(readlink -f "$quelle" 2>/dev/null || echo "$quelle")
        if ! ist_verschluesselt "$echt"; then
            echo "[$TIMESTAMP] [WARNING] $(basename "$echt") ist nicht verschluesselt — kommt nicht auf den Datentraeger"
            abgelehnt=$((abgelehnt + 1))
            continue
        fi
        quellen+=("$echt")
        benoetigt_kb=$((benoetigt_kb + $(du -k "$echt" 2>/dev/null | cut -f1)))
    done
    if [ "${#quellen[@]}" = 0 ]; then
        EXTERN_STATUS=nur_verschluesselt
        echo "[$TIMESTAMP] [ERROR] Es gibt nichts Verschluesseltes zu kopieren (${abgelehnt} Datei(en) im Klartext) — Datentraeger bleibt leer"
        return 0
    fi

    # PLATZ. Reicht er nicht, gehen die aeltesten Tage zuerst -- ausser der
    # Schluessel passt nicht zu dem, was dort liegt (siehe oben).
    local ordner heute
    heute=$(date +%Y%m%d)
    ordner="${EXTERN_ZIEL}/arasul-sicherung/${heute}"
    mkdir -p "$ordner" || { EXTERN_STATUS=fehler; return 0; }
    local frei tag
    frei=$(stick_frei_kb)
    while [ -n "$frei" ] && [ "$frei" -lt $((benoetigt_kb + benoetigt_kb / 10 + 1024)) ]; do
        tag=$(stick_tage | grep -v "/${heute}\$" | head -n1)
        if [ -z "$tag" ] || [ "$SCHLUESSEL_PASST" = false ]; then
            EXTERN_STATUS=zu_wenig_platz
            EXTERN_FREI=$((frei * 1024))
            echo "[$TIMESTAMP] [ERROR] Auf dem Datentraeger ist zu wenig Platz (frei $((frei / 1024)) MB, gebraucht $((benoetigt_kb / 1024)) MB)"
            return 0
        fi
        echo "[$TIMESTAMP] Platz knapp: Tag $(basename "$tag") wird vom Datentraeger genommen"
        rm -rf "$tag"
        frei=$(stick_frei_kb)
    done

    local fehler=0 name basis ziel_datei
    : > "${ordner}/.dateien.neu"
    for echt in "${quellen[@]}"; do
        name=$(basename "$echt")
        ziel_datei="${ordner}/${name}"
        if cp -f "$echt" "${ordner}/.neu-${name}" && sync "${ordner}/.neu-${name}" 2>/dev/null; then
            # Gegenprobe: gleich gross, und wieder ein Chiffrat-Kopf.
            if [ "$(stat -c%s "${ordner}/.neu-${name}" 2>/dev/null)" = "$(stat -c%s "$echt" 2>/dev/null)" ] \
               && ist_verschluesselt "${ordner}/.neu-${name}"; then
                mv -f "${ordner}/.neu-${name}" "$ziel_datei"
                # Frueheres derselben Art aus demselben Tag wegnehmen: mehrere
                # Laeufe am Tag (Start, Nacht, „Jetzt sichern“) sollen den Stick
                # nicht vollschreiben.
                #
                # NICHT, wenn der Schluessel nicht zur letzten Sicherung passt:
                # dann ist die fruehere Datei dieses Tages vielleicht die
                # einzige, die sich mit dem alten Schluessel (Code) noch oeffnen
                # laesst.
                if [ "$SCHLUESSEL_PASST" != false ]; then
                    basis=$(printf '%s' "$name" | sed -E 's/_[0-9]{8}_[0-9]{6}\.(sql|tar)\.gz$//')
                    local alt
                    for alt in "$ordner"/${basis}_[0-9]*_[0-9]*.*; do
                        [ -e "$alt" ] && [ "$alt" != "$ziel_datei" ] || continue
                        [ "$(printf '%s' "$(basename "$alt")" | sed -E 's/_[0-9]{8}_[0-9]{6}\.(sql|tar)\.gz$//')" = "$basis" ] && rm -f "$alt"
                    done
                fi
                EXTERN_KOPIERT=$((EXTERN_KOPIERT + 1))
                EXTERN_BYTES=$((EXTERN_BYTES + $(stat -c%s "$echt" 2>/dev/null || echo 0)))
                continue
            fi
        fi
        rm -f "${ordner}/.neu-${name}"
        echo "[$TIMESTAMP] [WARNING] ${name} liess sich nicht vollstaendig auf den Datentraeger kopieren"
        fehler=1
    done
    rm -f "${ordner}/.dateien.neu"
    # `sync`, bevor der Bericht behauptet, die Kopie liege draussen. Ohne das
    # steht sie im Schreibpuffer des Geraets, und wer den Stick jetzt abzieht,
    # nimmt eine halbe Datei mit.
    sync

    # Das Manifest dieses Tages: gelesen wird, was WIRKLICH im Ordner liegt.
    schreibe_manifest "$ordner"

    # Aufraeumen: mehr als EXTERN_TAGE Tage bleiben nicht, solange der
    # Schluessel passt.
    if [ "$SCHLUESSEL_PASST" != false ]; then
        local ueber
        ueber=$(( $(stick_tage | wc -l) - EXTERN_TAGE ))
        if [ "$ueber" -gt 0 ]; then
            stick_tage | head -n "$ueber" | while IFS= read -r tag; do
                echo "[$TIMESTAMP] Datentraeger: Tag $(basename "$tag") ist aelter als ${EXTERN_TAGE} Tage und wird entfernt"
                rm -rf "$tag"
            done
        fi
    fi

    # DIE PROBE, DIE DIE ZUSAGE BELEGT: auf dem ganzen Datentraeger (unser
    # Ordner) darf keine Datei einen gzip- oder tar-Kopf haben.
    local datei
    EXTERN_KLARTEXT=0
    while IFS= read -r datei; do
        [ "$(basename "$datei")" = "MANIFEST.json" ] && continue
        if ! ist_verschluesselt "$datei"; then
            EXTERN_KLARTEXT=$((EXTERN_KLARTEXT + 1))
            echo "[$TIMESTAMP] [ERROR] ${datei#"$EXTERN_ZIEL"/} auf dem Datentraeger ist NICHT verschluesselt"
        fi
    done < <(find "$EXTERN_ZIEL/arasul-sicherung" -type f ! -name 'MANIFEST.json' 2>/dev/null)
    EXTERN_FREI=$(( $(stick_frei_kb) * 1024 ))

    if [ "$EXTERN_KLARTEXT" -gt 0 ]; then
        EXTERN_STATUS=fehler
        BACKUP_OK=false
        return 0
    fi
    if [ "$fehler" = "1" ] || [ "$EXTERN_KOPIERT" = "0" ]; then
        EXTERN_STATUS=fehler
        echo "[$TIMESTAMP] [WARNING] Kopie ausserhalb unvollstaendig (${EXTERN_KOPIERT} Dateien)"
        return 0
    fi

    EXTERN_STATUS=kopiert
    echo "[$TIMESTAMP] Kopie ausserhalb: ${EXTERN_KOPIERT} Dateien, ${EXTERN_BYTES} Bytes, alle verschluesselt -> arasul-sicherung/${heute}"

    # Der Merker steht in einer EIGENEN Datei und nicht nur im Tagesbericht.
    # Grund: die Frage lautet "wann lag zuletzt eine Kopie ausserhalb", und die
    # Antwort darf nicht verschwinden, sobald der Stick eine Nacht abgezogen
    # ist. Der Tagesbericht wird jede Nacht ueberschrieben, diese Datei nur
    # dann, wenn wirklich kopiert wurde.
    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg ziel "arasul-sicherung/${heute}" \
        --argjson dateien "$EXTERN_KOPIERT" \
        --argjson bytes "$EXTERN_BYTES" \
        --slurpfile manifest "${ordner}/MANIFEST.json" \
        '{zeitpunkt:$zeitpunkt, ziel:$ziel, ordner:$ziel, dateien:$dateien, bytes:$bytes,
          apps:($manifest[0].apps | map(.id))}' \
        > /backups/extern_bericht.json.neu && mv -f /backups/extern_bericht.json.neu /backups/extern_bericht.json
}

art_der_datei() {
    case "$(basename "$1")" in
        arasul_db_*) echo postgres ;;
        arasul_app_*) echo app-datenbank ;;
        apps_*) echo apps ;;
        flows_*) echo flows ;;
        firmenordner_*) echo firmenordner ;;
        config_*) echo config ;;
        *) echo sonstiges ;;
    esac
}

# Das Manifest eines Tagesordners auf dem Datentraeger.
schreibe_manifest() {
    local ordner="$1" datei
    local dateien_json apps_json ids
    dateien_json=$(
        for datei in "$ordner"/*.sql.gz "$ordner"/*.tar.gz; do
            [ -f "$datei" ] || continue
            printf '%s\t%s\t%s\n' "$(basename "$datei")" "$(stat -c%s "$datei" 2>/dev/null || echo 0)" "$(art_der_datei "$datei")"
        done | jq -R -s -c 'split("\n") | map(select(length>0) | split("\t") | {name:.[0], bytes:(.[1]|tonumber), art:.[2]})'
    )
    # Die Apps: aus der Tabelle (id, Stand, Datenbank) UND aus den Ordnern
    # unter /arasul/apps -- eine App ohne Datenbank gibt es auch.
    ids=$(find "${APPS_SRC:-/arasul/apps}" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' 2>/dev/null | sort)
    apps_json=$(
        {
            printf '%s\n' "$APP_ZEILEN" | awk -F'|' 'NF==3 {print "z\t" $1 "\t" $2 "\t" $3}'
            printf '%s\n' "$ids" | awk 'NF {print "i\t" $1 "\t\t"}'
        } | jq -R -s -c '
            split("\n") | map(select(length>0) | split("\t")) as $z
            | ($z | map(.[1]) | unique) as $ids
            | $ids | map(. as $id | {
                id: $id,
                staende: [$z[] | select(.[0]=="z" and .[1]==$id) | .[2]],
                datenbanken: [$z[] | select(.[0]=="z" and .[1]==$id) | .[3]]
              })'
    )
    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg abdruck "$(abdruck_des_schluessels)" \
        --argjson dateien "${dateien_json:-[]}" \
        --argjson apps "${apps_json:-[]}" \
        '{zeitpunkt:$zeitpunkt, abdruck:$abdruck, apps:$apps, dateien:$dateien,
          bytes:($dateien | map(.bytes) | add // 0)}' \
        > "${ordner}/.MANIFEST.neu" && mv -f "${ordner}/.MANIFEST.neu" "${ordner}/MANIFEST.json"
}
kopiere_nach_aussen

# Cleanup: only run if backup succeeded (don't purge WAL if we might need it for recovery)
if [ "$BACKUP_OK" = true ]; then
    # Was `*_latest` gerade zeigt, wird NIE weggeraeumt.
    #
    # Die Aufbewahrung loescht nach Alter (`-mtime`), und der Name des neuesten
    # Archivs steht nicht auf der Ausnahmeliste -- nur der Symlink `*_latest`
    # tut das, und der ist nicht die Datei. Solange jede Nacht ein neues Archiv
    # entsteht, faellt das nicht auf. Sobald eines fehlt (Ordner nicht
    # eingehaengt, Platte voll, Dienst stand still), altert das letzte
    # vorhandene ueber die Frist hinaus und wird geloescht -- und dann gibt es
    # gar keines mehr. Auf einem Geraet, das fuenf Jahre unbeaufsichtigt
    # laufen soll, ist das kein Randfall.
    schuetze_neueste() {
        local ordner="$1" muster="$2"
        local echt
        echt=$(readlink -f "${ordner}/${3}" 2>/dev/null || true)
        local datei
        find "$ordner" -maxdepth 1 -name "$muster" ! -name "*latest*" \
             -mtime +$RETENTION_DAYS 2>/dev/null | while IFS= read -r datei; do
            if [ "$datei" != "$echt" ]; then
                rm -f "$datei"
            fi
        done
    }

    schuetze_neueste /backups/postgres "*.sql.gz" arasul_db_latest.sql.gz
    # Je App-Datenbank ein eigenes `*_latest` (Phase H7): `schuetze_neueste`
    # kennt genau eines je Ordner, also wird je Datenbank einmal aufgerufen.
    # Sonst schuetzte der Aufruf die neueste EINER App und liesse die letzte
    # Sicherung jeder anderen ueber die Frist altern.
    if [ -d /backups/postgres/apps ]; then
        for zeiger in /backups/postgres/apps/*_latest.sql.gz; do
            [ -e "$zeiger" ] || continue
            schuetze_neueste /backups/postgres/apps \
                "$(basename "${zeiger%_latest.sql.gz}")_*.sql.gz" "$(basename "$zeiger")"
        done
    fi
    for name in apps flows config firmenordner; do
        [ -d "/backups/${name}" ] && schuetze_neueste "/backups/${name}" "*.tar.gz" "${name}_latest.tar.gz"
    done

    # WAL archive cleanup: keep only retention period worth
    WAL_ARCHIVE_DELETED=$(find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    # Plan 023 S5: die Segmente selbst wurden bisher NIE geloescht. Solange
    # archive_mode aus war, fiel das nicht auf, weil nichts ankam. Mit
    # eingeschalteter Archivierung waere /backups/wal unbegrenzt gewachsen —
    # auf einem Geraet, das fuenf Jahre unbeaufsichtigt laufen soll, ist das
    # eine Zeitbombe. Geloescht wird nur, was aelter als die Aufbewahrungsfrist
    # der taeglichen Sicherungen ist: aelter zurueck als die aelteste
    # Basissicherung braucht niemand.
    WAL_DELETED=$(find /backups/wal -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    if [ "$WAL_DELETED" -gt 0 ] 2>/dev/null; then
        echo "[$TIMESTAMP] WAL-Segmente aufgeraeumt: $WAL_DELETED aelter als ${RETENTION_DAYS} Tage"
    fi
    [ "$WAL_ARCHIVE_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL archive cleanup: removed $WAL_ARCHIVE_DELETED archive(s) older than ${RETENTION_DAYS}d"

    # Cleanup: weekly backups (longer retention)
    find /backups/postgres/weekly -name "*.sql.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/postgres/monthly -name "*.sql.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    for name in apps flows config firmenordner; do
        find "/backups/${name}/weekly" -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
        find "/backups/${name}/monthly" -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    done
    echo "[$TIMESTAMP] Cleanup completed (daily: ${RETENTION_DAYS}d, weekly: ${WEEKLY_RETENTION_WEEKS}w, monthly: ${MONTHLY_RETENTION_MONTHS}mo)"
else
    echo "[$TIMESTAMP] [WARNING] Skipping cleanup — backup had errors (WAL files preserved for recovery)"
fi

# Calculate backup sizes
PG_SIZE=$(du -sh /backups/postgres/ 2>/dev/null | cut -f1 || echo "0")
WAL_SIZE=$(du -sh /backups/wal/ 2>/dev/null | cut -f1 || echo "0")
TOTAL_SIZE=$(du -sh /backups/ 2>/dev/null | cut -f1 || echo "0")

# Disk usage warning (>10% of total disk)
DISK_TOTAL_KB=$(df /backups | awk 'NR==2 {print $2}')
BACKUP_KB=$(du -sk /backups/ 2>/dev/null | cut -f1 || echo "0")
if [ "$DISK_TOTAL_KB" -gt 0 ] 2>/dev/null; then
    BACKUP_PERCENT=$((BACKUP_KB * 100 / DISK_TOTAL_KB))
    if [ "$BACKUP_PERCENT" -gt 10 ]; then
        echo "[WARNING] Backups use ${BACKUP_PERCENT}% of disk (${TOTAL_SIZE}). Consider reducing retention."
    fi
fi

zaehle() { find "$1" -maxdepth 1 -name "$2" ! -name '*latest*' 2>/dev/null | wc -l; }

# Generate report
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$([ "$BACKUP_OK" = true ] && echo completed || echo partial_failure)",
  "postgres_backups": $(ls /backups/postgres/*.sql.gz 2>/dev/null | grep -v latest | wc -l),
  "postgres_weekly": $(ls /backups/postgres/weekly/*.sql.gz 2>/dev/null | wc -l),
  "postgres_monthly": $(ls /backups/postgres/monthly/*.sql.gz 2>/dev/null | wc -l),
  "apps_status": "$APPS_OK",
  "apps_backups": $(zaehle /backups/apps '*.tar.gz'),
  "flows_status": "$FLOWS_OK",
  "flows_backups": $(zaehle /backups/flows '*.tar.gz'),
  "firmenordner_status": "$FIRMENORDNER_OK",
  "firmenordner_backups": $(zaehle /backups/firmenordner '*.tar.gz'),
  "firmenordner_geaendert": $FIRMENORDNER_GEAENDERT,
  "firmenordner_geaendert_dateien": $FIRMENORDNER_GEAENDERT_DATEIEN,
  "config_status": "$CONFIG_OK",
  "config_backups": $(zaehle /backups/config '*.tar.gz'),
  "extern_status": "$EXTERN_STATUS",
  "extern_dateien": $EXTERN_KOPIERT,
  "extern_bytes": $EXTERN_BYTES,
  "extern_klartext": $EXTERN_KLARTEXT,
  "extern_frei_bytes": $EXTERN_FREI,
  "schluessel_passt": $SCHLUESSEL_PASST,
  "retention_days": $RETENTION_DAYS,
  "weekly_retention_weeks": $WEEKLY_RETENTION_WEEKS,
  "monthly_retention_months": $MONTHLY_RETENTION_MONTHS,
  "encrypted": "$([ "$BACKUP_ENCRYPT" = "true" ] && [ "$VERSCHLUESSELUNG_ERFOLGT" = true ] && echo true || echo false)",
  "encryption_requested": "$BACKUP_ENCRYPT",
  "postgres_size": "$PG_SIZE",
  "wal_size": "$WAL_SIZE",
  "wal_segments": $WAL_COUNT,
  "total_size": "$TOTAL_SIZE"
}
EOF
# DIE SICHERUNGEN GEHOEREN DEM, DEM `data/backups` GEHOERT (J35). Dieser
# Dienst laeuft als root, und alles, was er anlegt, gehoerte bis dahin root --
# auch die Sicherung, die er beim Start zieht, also mitten im Bootstrap einer
# Aktualisierung, NACH `gib_data_dem_benutzer` in `arasul`. Der Mensch, der das
# Geraet installiert hat, konnte seine eigenen Sicherungen danach nicht
# wegraeumen oder mitnehmen. Gefragt wird der Eigentuemer des Ordners selbst:
# gehoert er root (ein Geraet ohne Menschen dahinter), aendert sich nichts.
# `/backups/wal` bleibt draussen -- das ist das Volume von Postgres, und dessen
# Dateien gehoeren Postgres.
BACKUP_EIGNER=$(stat -c '%u:%g' /backups 2>/dev/null || echo "0:0")
if [ "$BACKUP_EIGNER" != "0:0" ]; then
    find /backups -path /backups/wal -prune -o ! -user "${BACKUP_EIGNER%%:*}" \
        -exec chown -h "$BACKUP_EIGNER" {} + 2>/dev/null || true
fi

if [ "$BACKUP_OK" = true ]; then
    echo "[$TIMESTAMP] Backup completed successfully (total: ${TOTAL_SIZE})"
else
    echo "[$TIMESTAMP] Backup completed with errors (total: ${TOTAL_SIZE})"
fi
