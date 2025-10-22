# Percorso: ./backend/Dockerfile (FINALE)

FROM node:20-alpine
WORKDIR /app

# Variabile d'ambiente per la porta
ENV PORT=4001
EXPOSE $PORT

# --- RIMOZIONE ---
# La riga "apk add curl" è stata rimossa.
# L'healthcheck userà wget, che è già incluso nell'immagine base.

# Configurazione NPM ottimizzata
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 3 && \
    npm config set fetch-timeout 60000 && \
    npm config set loglevel warn

# Copia solo i file necessari per l'installazione
COPY package.json package-lock.json* ./

# Installa le dipendenze in modo ottimizzato per Docker
RUN if [ -f package-lock.json ]; then \
      npm ci --no-optional --no-audit --no-fund; \
    else \
      npm install --no-optional --no-audit --no-fund; \
    fi

# Copia il resto del codice sorgente
COPY . .

# Comando per avviare il server backend
CMD ["npm", "start"]

