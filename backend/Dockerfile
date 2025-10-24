# Percorso: ./backend/Dockerfile

# Usa un'immagine Node.js coerente con il frontend
FROM node:20-alpine

# Imposta la directory di lavoro
WORKDIR /app

# Copia i file package.json e package-lock.json
COPY package*.json ./

# Installazione delle dipendenze di produzione (più robusta del ci in ambienti instabili)
RUN npm install --omit=dev

# Copia il resto del codice sorgente del backend
# Nota: La cartella 'src' viene montata da docker-compose.yml per lo sviluppo
COPY . .

# Esponi le porte definite nel docker-compose.yml
EXPOSE 4001
EXPOSE 6001

# Comando per avviare l'applicazione
CMD ["npm", "start"]