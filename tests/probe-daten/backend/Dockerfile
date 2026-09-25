# Das Backend der Proben-App fuer die Abnahme „Daten und vier Augen" (J35).
#
# Anders als die Beispielapp braucht sie EINE Abhaengigkeit: `pg`, denn sie
# misst gerade, ob ihre Datenbank ein Einspielen ueberlebt. Installiert wird
# ohne package.json im Repo -- eine zweite Sperrdatei neben der im
# Wurzelverzeichnis waere gegen Regel 7, und dieses Image baut nur das Geraet.
FROM node:22-alpine

WORKDIR /app
RUN npm install --no-save --no-audit --no-fund pg@8.16.3
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
