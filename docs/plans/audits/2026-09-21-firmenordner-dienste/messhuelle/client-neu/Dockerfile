# Zweites Klienten-Abbild der Messung J33: der ownCloud-Klient aus Debian
# bookworm (2.11) kennt die Raeume von OpenCloud/oCIS nicht; trixie bringt 5.x.
FROM debian:trixie-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      owncloud-client-cmd ca-certificates curl python3 procps \
    && apt-get clean
WORKDIR /arbeit
CMD ["sleep", "infinity"]
