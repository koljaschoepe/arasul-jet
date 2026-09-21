# Abgleich-Klienten fuer die Messung J33 (firmenordner-dienst-messen).
# Ein Abbild, drei Kommandozeilen-Klienten aus Debian; zwei Container davon
# sind die "zwei Rechner". Wird nach der Messung wieder entfernt.
FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      nextcloud-desktop-cmd owncloud-client-cmd seafile-cli \
      ca-certificates curl python3 procps time \
    && apt-get clean
WORKDIR /arbeit
CMD ["sleep", "infinity"]
