# Das Backend der Proben-App fuer die Abnahme „Auslesen und Flows im
# Protokoll" (J35, 26.09.2026). Ohne Abhaengigkeit: es reicht Aufrufe
# an das Geraet durch.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
