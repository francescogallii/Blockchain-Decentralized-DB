
Blockchain Database System ⛓️🔐

Un sistema avanzato per il trattamento sicuro di dati sensibili utilizzando una blockchain privata basata su PostgreSQL, con crittografia end-to-end RSA/AES e un'interfaccia web moderna.

🎯 Caratteristiche Principali

    🔐 Crittografia Ibrida: Sicurezza end-to-end con RSA-OAEP 2048-bit per la gestione delle chiavi e AES-256-GCM per la cifratura dei dati.

    ⛓️ Blockchain Immutabile: Catena di blocchi con Proof-of-Work (SHA-256), firme digitali e collegamento tramite hash per garantire integrità e non ripudio.

    🔑 Gestione Chiavi Sicura: Le chiavi private RSA non lasciano mai il browser del client, garantendo la massima privacy.

    🚀 Architettura Containerizzata: L'intero stack applicativo è orchestrato tramite Docker Compose per un setup semplice, replicabile e isolato.

    📊 Dashboard Intuitiva: Un'interfaccia utente costruita in React per registrare utenti (creator), creare blocchi, esplorare la catena e decifrare i dati in modo sicuro.

Prerequisites 🛠️

Prima di iniziare, assicurati di avere installato i seguenti strumenti sul tuo sistema:

    Git

    Docker

    Docker Compose (solitamente incluso in Docker Desktop)

🚀 Guida all'Installazione e Avvio

Segui questi passaggi per mettere in funzione l'intero sistema in pochi minuti.

Passo 1: Clona il Repository

Apri un terminale e clona il progetto sulla tua macchina locale.
Bash

git clone <URL_DEL_TUO_REPOSITORY>
cd <NOME_DELLA_CARTELLA_PROGETTO>

Passo 2: Configura le Variabili d'Ambiente

Il progetto utilizza un file .env per gestire le configurazioni. È già fornito un file di esempio pronto per l'uso in sviluppo.

Non è necessario modificare nulla per il primo avvio in locale.

Se il file .env non fosse presente, puoi crearlo copiando l'esempio:
Bash

# Esegui questo comando solo se il file .env non esiste
cp .env.example .env

Passo 3: Avvia l'Intero Sistema con Docker Compose

Questo è il comando principale che si occuperà di tutto: scaricherà le immagini necessarie, costruirà le immagini personalizzate per il backend e il frontend e avvierà tutti i container in modo orchestrato.
Bash

docker-compose up --build

    up: Crea e avvia i container.

    --build: Forza la ricostruzione delle immagini del backend e del frontend se sono stati modificati i file sorgente o il Dockerfile.

💡 Consiglio: Per avviare i servizi in background (detached mode), aggiungi il flag -d:
Bash

docker-compose up --build -d

Il primo avvio potrebbe richiedere alcuni minuti, poiché Docker deve scaricare le immagini di base e installare tutte le dipendenze.

Passo 4: Verifica che Tutto sia in Funzione

Attendi un paio di minuti affinché tutti i servizi si inizializzino (in particolare il database e il backend). Puoi controllare lo stato dei container con il comando:
Bash

docker-compose ps

Dovresti vedere tutti i servizi (postgres-primary, redis, backend, frontend, nginx) con lo stato running o healthy.

Passo 5: Accedi all'Applicazione! 🎉

Una volta che tutti i servizi sono attivi, l'applicazione è pronta!

    Frontend (Applicazione Web): Apri il browser e vai a http://localhost:5173

    API Backend (tramite Nginx): Disponibile su http://localhost/api

Ora puoi iniziare a usare l'applicazione per registrare creator, creare blocchi e molto altro!

⚙️ Comandi Utili per la Gestione

Ecco alcuni comandi utili per gestire l'ambiente Docker:

    Visualizzare i log in tempo reale (utilissimo per il debug):
    Bash

docker-compose logs -f

Visualizzare i log di un servizio specifico (es. il backend):
Bash

docker-compose logs -f backend

Arrestare tutti i servizi:
Bash

docker-compose down

Riavviare tutti i servizi:
Bash

    docker-compose restart

🧹 Guida alla Pulizia Completa (Reset da Zero)

Se vuoi eliminare completamente l'ambiente per ricominciare da capo (ad esempio per testare il processo di inizializzazione o liberare spazio), segui questi passaggi.

⚠️ Attenzione: Questi comandi elimineranno in modo permanente tutti i dati salvati nel database (creator, blocchi, ecc.).

Passo 1: Arresta e Rimuovi i Container

Questo comando ferma tutti i container in esecuzione e rimuove le reti create da Docker Compose.
Bash

docker-compose down

Passo 2: Rimuovi i Volumi dei Dati

Il passo precedente non elimina i dati persistenti (il database PostgreSQL e i dati di Redis). Per rimuovere anche quelli, usa il flag -v.
Bash

docker-compose down -v

Questo comando è fondamentale per un reset completo. Eseguendolo, alla successiva esecuzione di docker-compose up, il database verrà ricreato da zero come al primo avvio.

Passo 3 (Opzionale): Rimuovi le Immagini Docker

Se vuoi liberare ancora più spazio, puoi rimuovere le immagini Docker che sono state costruite per il progetto.
Bash

docker rmi blockchain-backend blockchain-frontend

In alternativa, per una pulizia più aggressiva di tutte le immagini non utilizzate:
Bash

docker image prune -a

A questo punto, il tuo sistema è tornato allo stato iniziale, come se non avessi mai eseguito il progetto. Puoi ripartire dal Passo 3 della guida all'installazione per ricreare tutto da zero.
