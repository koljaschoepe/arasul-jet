FROM alpine:3.19

RUN apk add --no-cache \
    docker-cli \
    postgresql16-client \
    gzip \
    tar \
    curl \
    bash \
    # Plan 023 S3: encrypt_file und der Wiederherstellungstest arbeiten mit
    # `openssl enc -aes-256-cbc`. Ohne dieses Paket griff encrypt_file still in
    # den Warnzweig und sicherte weiter im Klartext, waehrend der Bericht
    # "encrypted" meldete.
    openssl \
    # J35: `find -cnewer -printf` fuer die Liste der Dateien, die sich waehrend
    # der Sicherung bewegt haben (busybox-find kennt beides nicht), und `jq`,
    # damit ein Dateiname mit Anfuehrungszeichen den Bericht nicht zerbricht.
    findutils \
    jq \
    # M5 (03.10.2026): die Staende der Sicherung. restic verschluesselt immer
    # und schreibt je Nacht nur Geaendertes (Begruendung in staende.sh); es
    # ist ein statisches Go-Programm und in Alpine fuer aarch64 und x86_64 da.
    # `ionice` (util-linux-misc) laesst es nur lesen, wenn die Platte sonst
    # nichts zu tun hat -- busybox bringt keines mit.
    restic \
    util-linux-misc \
    # Einen Bereich des Firmenordners zurueckholen (Auftrag
    # sicherung-zurueckholen, M5): Inhalt vergleichen, an Ort und Stelle
    # schreiben, Ueberzaehliges entfernen, die Verwaltung des Dateidienstes
    # auslassen -- `rsync` kann das in einem Aufruf (wiederherstellen.sh).
    rsync

# Backup volume mount inside the container — keep in sync with the volume
# mount target in compose/compose.monitoring.yaml. The drill scripts default
# to ${PROJECT_DIR}/data/backups (which only resolves correctly in a host
# repo checkout), so we set the canonical container path here so cron-driven
# drill runs find backups without needing an env prefix in the cron line.
ENV BACKUP_DIR=/backups

COPY staende.sh /usr/local/bin/staende.sh
RUN chmod +x /usr/local/bin/staende.sh

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

COPY restore-drill.sh /usr/local/bin/restore-drill.sh
RUN chmod +x /usr/local/bin/restore-drill.sh

# Der Weg zurueck (Phase C9). Er laeuft HIER und nicht auf dem Host, weil hier
# alles liegt, was er braucht: die Archive, der Sicherungsschluessel als
# Docker-Secret, `psql`, `openssl`.
COPY wiederherstellen.sh /usr/local/bin/wiederherstellen.sh
RUN chmod +x /usr/local/bin/wiederherstellen.sh

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
