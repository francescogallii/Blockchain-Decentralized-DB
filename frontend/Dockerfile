# Percorso: ./frontend/Dockerfile (CORRETTO)

FROM node:20-alpine
WORKDIR /app

# --- CORREZIONE ---
# Aggiunge curl per permettere il funzionamento dell'healthcheck in docker-compose
#RUN apk update && apk add --no-cache curl

# Configurazione NPM ottimizzata
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 3 && \
    npm config set fetch-timeout 60000 && \
    npm config set loglevel warn && \
    npm config set progress false

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --no-optional --no-audit --no-fund

# Copy source code
COPY . .

EXPOSE 5173

# Il comando di avvio è gestito in docker-compose.yml per flessibilità
# CMD ["npm", "run", "dev"]
