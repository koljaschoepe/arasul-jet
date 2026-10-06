# Das Backend der Proben-App fuer die Abnahme „Protokoll des Containers" (M5).
# Ohne Abhaengigkeiten: nur `http` aus Node.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
