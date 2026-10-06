# Das Backend der Proben-App fuer die Abnahme „Original lesen" (M5, 06.10.2026,
# Kontrakt 14). Ohne Abhaengigkeit: es liefert den Beispielbeleg als PNG und
# als PDF und reicht Aufrufe an das Geraet durch.
FROM node:22-alpine

WORKDIR /app
COPY server.js beleg.png ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
