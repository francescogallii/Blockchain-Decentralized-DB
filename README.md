Blockchain Database System ⛓️🔐

Un sistema avanzato per il trattamento sicuro di dati sensibili utilizzando una blockchain privata basata su PostgreSQL, con crittografia end-to-end RSA/AES e un'interfaccia web moderna.

🎯 Caratteristiche Principali

    🔐 Crittografia Ibrida: Sicurezza end-to-end con RSA-OAEP 2048-bit per la gestione delle chiavi e AES-256-GCM per la cifratura dei dati.

    ⛓️ Blockchain Immutabile: Catena di blocchi con Proof-of-Work (SHA-256), firme digitali e collegamento tramite hash per garantire integrità e non ripudio.

    🔑 Gestione Chiavi Sicura: Le chiavi private RSA non lasciano mai il browser del client, garantendo la massima privacy.

    🚀 Architettura Containerizzata: L'intero stack applicativo è orchestrato tramite Docker Compose per un setup semplice, replicabile e isolato.

    📊 Dashboard Intuitiva: Un'interfaccia utente costruita in React per registrare utenti (creator), creare blocchi, esplorare la catena e decifrare i dati in modo sicuro.
    
    🌐 Accesso Unificato: Tramite Nginx, che funge da reverse proxy per routing, sicurezza e bilanciamento del carico.

Prerequisites 🛠️

Prima di iniziare, assicurati di avere installato i seguenti strumenti sul tuo sistema:

    Git
    Docker
    Docker Compose (solitamente incluso in Docker Desktop)
    **Importante:** Esegui 'npm install' nelle cartelle 'backend' e 'frontend' per generare i file package-lock.json prima del build.

🚀 Guida all'Installazione e Avvio

Segui questi passaggi per mettere in funzione l'intero sistema in pochi minuti.

Passo 1: Clona il Repository e Prepara i Moduli

Apri un terminale e clona il progetto sulla tua macchina locale.

Bash
git clone <URL_DEL_TUO_REPOSITORY>
cd <NOME_DELLA_CARTELLA_PROGETTO>

# Entra nelle sottocartelle e genera i file di lock necessari per Docker
cd backend && npm install && cd ..
cd frontend && npm install && cd ..


Passo 2: Configura le Variabili d'Ambiente

Il progetto utilizza un file .env per gestire le configurazioni. È già fornito un file di esempio pronto per l'uso in sviluppo.

**Importante:** Assicurati che il file `.env` si trovi nella cartella principale (root) del progetto, allo stesso livello del file `docker-compose.yml`.

Se il file .env non fosse presente, puoi crearlo copiando l'esempio:
Bash

# Esegui questo comando solo se il file .env non esiste
cp .env.example .env

Passo 3: Avvia l'Intero Sistema con Docker Compose

Questo comando si occuperà di tutto: scaricherà le immagini, costruirà quelle personalizzate e avvierà tutti i container.

Bash
docker-compose up --build -d

    up: Crea e avvia i container.
    --build: Forza la ricostruzione delle immagini (necessario dopo modifiche al codice).
    -d: Avvia i servizi in background (detached mode).

Passo 4: Verifica che Tutto sia in Funzione

Controlla lo stato dei container. Attendere che tutti i servizi PostgreSQL siano "healthy" e che i nodi Node.js siano "Up".

Bash
docker-compose ps

# Visualizza i log in tempo reale (utilissimo per il debug)
docker-compose logs -f

Passo 5: Accedi all'Applicazione! 🎉

Una volta che tutti i servizi sono attivi, l'applicazione è pronta!

    **Frontend (Applicazione Web):** Apri il browser e vai a **http://localhost:80** (servito da Nginx)
    **API Backend (Nginx Proxy):** Disponibile su **http://localhost:80/api**

Ora puoi iniziare a usare l'applicazione per registrare creator, creare blocchi e molto altro!

⚙️ Comandi Utili per la Gestione

Ecco alcuni comandi utili per gestire l'ambiente Docker:

    Arrestare tutti i servizi:
    Bash
docker-compose down

    Riavviare tutti i servizi (carica il nuovo codice se il volume è montato):
    Bash
docker-compose restart

🧹 Guida alla Pulizia Completa (Reset da Zero)

⚠️ Attenzione: Questi comandi elimineranno in modo permanente tutti i dati salvati nei database (creator, blocchi, ecc.).

Passo 1: Arresta e Rimuovi i Container e i Volumi

Bash
docker-compose down -v

Questo comando elimina tutti i container, le reti e i dati persistenti (volumi).


Azione,Comando
Avvia in background,docker-compose up -d
Arresta tutti i servizi,docker-compose down
Rimuovi TUTTO (dati inclusi),docker-compose down -v
Riavvia tutti i servizi,docker-compose restart
Controlla lo stato,docker-compose ps