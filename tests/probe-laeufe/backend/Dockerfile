# Das Backend der Proben-App fuer die Abnahme „Verwaltung Laeufe"
# (M5, 04.10.2026). Ohne Abhaengigkeit.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
