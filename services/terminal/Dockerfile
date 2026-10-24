# Das Terminal in der Oberflaeche (Karte terminal-im-frontend, M5, 21.10.2026).
#
# ttyd zeigt eine Shell im Browser; die Shell ist aber NICHT dieser Container,
# sondern ein `ssh` als der eigene Linux-Nutzer des Entwicklers am Geraet
# (`verbinde.sh`). Dieser Container haelt nur den Schluessel dafuer und das
# Geheimnis, mit dem er die Kopfzeile der Tuer prueft. Warum so:
# docs/features/TERMINAL.md.

# --- ttyd holen, fest auf 1.7.7 mit Pruefsumme -------------------------------
# Ein statisches Programm aus der Veroeffentlichung, nicht aus Debian: bookworm
# bringt 1.7.3, und erst 1.7.4 reicht den Nutzer der Kopfzeile (`--auth-header`)
# als TTYD_USER an den Befehl weiter (src/protocol.c). Ohne das wuesste
# `verbinde.sh` nicht, wer da ist.
FROM debian:bookworm-slim AS holen
ARG TTYD_VERSION=1.7.7
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && apt-get clean
RUN set -eu; \
    case "${TARGETARCH:-arm64}" in \
      arm64) datei=ttyd.aarch64; summe=b38acadd89d1d396a0f5649aa52c539edbad07f4bc7348b27b4f4b7219dd4165 ;; \
      amd64) datei=ttyd.x86_64;  summe=8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55 ;; \
      *) echo "ttyd gibt es fuer ${TARGETARCH} hier nicht"; exit 1 ;; \
    esac; \
    curl -fsSL -o /ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/${datei}"; \
    echo "${summe}  /ttyd" | sha256sum -c -; \
    chmod 0755 /ttyd

# --- Laufzeit -----------------------------------------------------------------
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client openssl tini \
 && apt-get clean \
 && find /var/lib/apt/lists -type f -delete
COPY --from=holen /ttyd /usr/local/bin/ttyd
COPY start.sh verbinde.sh siegel.sh healthcheck.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/start.sh /usr/local/bin/verbinde.sh /usr/local/bin/siegel.sh /usr/local/bin/healthcheck.sh \
 # ssh verlangt einen Eintrag in /etc/passwd fuer die eigene Kennung
 # („No user exists for uid 1000", Startprobe im CI am 21.10.2026).
 && groupadd --gid 1000 tor \
 && useradd --uid 1000 --gid 1000 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin tor

# Dieselbe Kennung wie der Nutzer, dem das Geraet gehoert (das Backend laeuft
# als `node`, ebenfalls 1000): `config/secrets/terminal/` gehoert ihm und hat
# 0700, und nur so liest dieser Container sie, ohne dass die Dateien weiter
# offen stehen muessten.
USER 1000:1000
ENV HOME=/tmp
EXPOSE 7681
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s CMD ["/usr/local/bin/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start.sh"]
