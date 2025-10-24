FROM node:20-alpine
WORKDIR /app

# 1. Configura npm per il timeout e i retry massimi
# Aumentiamo fetch-timeout per gestire le tue connessioni lente
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 30000 && \
    npm config set fetch-retry-maxtimeout 180000 && \
    npm config set maxsockets 5 && \
    # Imposta un timeout per il client (molto alto per la tua situazione)
    npm config set fetch-timeout 360000 

COPY package.json package-lock.json ./

# 2. Uso di npm ci (Clean Install) che è più veloce di install.
# Eseguiamo npm ci e permettiamo 3 tentativi con ritardi maggiori (10s)
RUN set -ex; \
    for i in 1 2 3; do \
        echo "Attempt $i to install dependencies..."; \
        npm ci --prefer-offline --no-audit --progress=false --loglevel error && break || \
        (echo "Installation failed. Waiting 10 seconds before retry..." && sleep 10); \
    done; \
    if [ $i -eq 3 ]; then \
        echo "Final installation attempt failed. Exiting."; \
        exit 1; \
    fi;

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]