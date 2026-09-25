# Das Backend der Proben-App fuer die Abnahme „KI-Aufrufe im Protokoll" (J35).
# Ohne Abhaengigkeit: Node bringt fetch, FormData und Blob selbst mit.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
