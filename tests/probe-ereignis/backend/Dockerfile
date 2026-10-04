# Das Backend der Proben-Apps fuer die Abnahme „Ereignis und Routen"
# (M5, 04.10.2026). Ohne Abhaengigkeit: beide Apps (a und b) laufen mit
# derselben Datei, `PROBE_APP` sagt, welche sie ist.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
