FROM node:18-alpine
WORKDIR /app

# Configura npm per retry e timeout
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 30000 && \
    npm config set fetch-retry-maxtimeout 120000

COPY package*.json ./

# Installa con retry migliorato
RUN for i in 1 2 3 4 5; do \
      echo "Attempt $i/5: npm install..." && \
      npm install --no-optional && \
      if [ $? -eq 0 ]; then break; else \
        echo "Attempt $i failed, retrying..." && \
        sleep 30; \
      fi; \
    done

COPY . .
EXPOSE 4001

# Aspetta il database e avvia
CMD ["npm", "start"]