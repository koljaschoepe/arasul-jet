FROM alpine:3.19

RUN apk add --no-cache \
    docker-cli \
    postgresql16-client \
    gzip \
    tar \
    curl \
    bash

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
