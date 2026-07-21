FROM alpine:3.19

RUN apk add --no-cache \
    docker-cli \
    postgresql16-client \
    gzip \
    tar \
    curl \
    bash \
    # S3-Client fuer die MinIO-Sicherung. Der Backup-Dienst spricht MinIO damit
    # direkt ueber das Backend-Netz an, statt sich per `docker exec` in den
    # MinIO-Container zu haengen und das Ergebnis per `docker cp` herauszuholen
    # — letzteres blockiert der Socket-Proxy, weshalb die Dokument-Sicherung
    # ueber einen Monat lang still leere Archive erzeugt hat.
    minio-client

# Backup volume mount inside the container — keep in sync with the volume
# mount target in compose/compose.monitoring.yaml. The drill scripts default
# to ${PROJECT_DIR}/data/backups (which only resolves correctly in a host
# repo checkout), so we set the canonical container path here so cron-driven
# drill runs find backups without needing an env prefix in the cron line.
ENV BACKUP_DIR=/backups

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

COPY restore-drill.sh /usr/local/bin/restore-drill.sh
RUN chmod +x /usr/local/bin/restore-drill.sh

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
