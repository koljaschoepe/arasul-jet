# Das Backend der Proben-App fuer die Abnahme „Modell je Schritt"
# (M5, 04.10.2026). Es antwortet nur auf /gesund; ohne Backend bekaeme die App
# keinen Schluessel, und der Zeitplaner startet den Lauf im Namen des ersten Admin.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
