# Das Backend der Proben-App fuer die Abnahme „Live schalten mit Sicherung" (M5).
#
# Eine Abhaengigkeit, `pg`, ohne package.json im Repo -- wie bei probe-daten:
# eine zweite Sperrdatei waere gegen Regel 7, und dieses Image baut nur das
# Geraet.
FROM node:22-alpine

WORKDIR /app
RUN npm install --no-save --no-audit --no-fund pg@8.16.3
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
