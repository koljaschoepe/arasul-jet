# Das Backend der Proben-App fuer die Abnahme „Korrektur (Korrekturfelder in der Freigabe)"
# (M5, 04.10.2026). Ohne Abhaengigkeit: es reicht Aufrufe an das
# Geraet durch, liefert das Original und antwortet als festes Modell.
FROM node:22-alpine

WORKDIR /app
COPY server.js beleg.png ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
