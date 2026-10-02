# Ausgangs-Proxy der Apps (J38). Keine Abhaengigkeiten: nur Node.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine
WORKDIR /app
COPY proxy.js server.js ./
USER node
EXPOSE 3128
CMD ["node", "server.js"]
