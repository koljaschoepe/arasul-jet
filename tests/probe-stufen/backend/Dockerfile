# Das Backend der Proben-App fuer die Abnahme „Stufen mit Standardperson"
# (M5, 04.10.2026). Ohne Abhaengigkeit: es reicht zwei Aufrufe
# an das Geraet durch.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
