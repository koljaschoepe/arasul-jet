# Das Backend der Beispielapp. Keine Abhaengigkeiten, kein npm install:
# `server.js` kommt mit dem eingebauten `http`-Modul aus.
#
# `wget` braucht der Healthcheck, den `services/app/appContainer.js` aus dem
# Feld `backend.gesundheit` des Manifests baut; in `node:22-alpine` ist es
# ueber BusyBox schon da.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
