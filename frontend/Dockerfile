FROM node:20-alpine
WORKDIR /app

# Configura npm per retry e timeout
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set maxsockets 5

COPY package*.json ./

# Installa con retry manuale
RUN npm install --verbose --no-audit --maxsockets 1 || \
    (sleep 10 && npm install --verbose --no-audit --maxsockets 1) || \
    (sleep 20 && npm install --verbose --no-audit)

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]