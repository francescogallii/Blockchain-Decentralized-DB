// Percorso: backend/src/services/blockchain.js
const { pool } = require('../database/db');
const logger = require('../utils/logger');
const { GENESIS_HASH } = require('../config');

class Blockchain {
    constructor() {
        this.chain = [];
    }

    async loadChainFromDB() {
        try {
            // Ordinamento esplicito per block_number per garantire l'ordine della catena
            const { rows } = await pool.query('SELECT * FROM blockchain.blocks ORDER BY block_number ASC');

            // Converte i campi Buffer da bytea a Buffer in memoria
            this.chain = rows.map(block => ({
                ...block,
                // Assicurati che questi campi esistano prima di chiamare Buffer.from
                encrypted_data: block.encrypted_data ? Buffer.from(block.encrypted_data) : Buffer.alloc(0),
                data_iv: block.data_iv ? Buffer.from(block.data_iv) : Buffer.alloc(0),
                encrypted_data_key: block.encrypted_data_key ? Buffer.from(block.encrypted_data_key) : Buffer.alloc(0),
                signature: block.signature ? Buffer.from(block.signature) : Buffer.alloc(0),
                // Rende il block_number una stringa per coerenza con BigInt JS
                block_number: block.block_number?.toString() ?? '0', // Usa ?? per fornire un default
                nonce: block.nonce?.toString() ?? '0' // Gestisce anche nonce null/undefined
            }));

            logger.info(`Blockchain loaded from local DB with ${this.chain.length} blocks.`);
        } catch (error) {
            logger.error('Could not load chain from DB.', { error: error.message, stack: error.stack }); // Logga come errore
            this.chain = []; // Resetta la catena in caso di errore di caricamento
        }
    }

    async getLatestBlock() {
        // Usa la chain in memoria che viene aggiornata da loadChainFromDB
        if (this.chain.length > 0) {
            return this.chain[this.chain.length - 1];
        }
        return null;
    }

    // Funzione per aggiungere un blocco, sia esso creato localmente o ricevuto da P2P
    async addBlock(block) {
        // Controllo di sequenza RIMOSSO - Ci affidiamo a ON CONFLICT e logica P2P/Forking
        // const latestBlock = await this.getLatestBlock();
        // if (latestBlock && block.previous_hash !== latestBlock.block_hash) { ... }

        // Ensure block data is in Buffer format for DB insertion
        // Handle cases where block comes from API (already Buffer) vs P2P (object { type: 'Buffer', data: [...] })
        const blockToInsert = {
            ...block,
            block_number: block.block_number?.toString(), // Ensure string for DB BigInt/Serial
            nonce: block.nonce?.toString(),             // Ensure string for DB BigInt
            encrypted_data: block.encrypted_data?.data ? Buffer.from(block.encrypted_data.data) : Buffer.from(block.encrypted_data || []),
            data_iv: block.data_iv?.data ? Buffer.from(block.data_iv.data) : Buffer.from(block.data_iv || []),
            encrypted_data_key: block.encrypted_data_key?.data ? Buffer.from(block.encrypted_data_key.data) : Buffer.from(block.encrypted_data_key || []),
            signature: block.signature?.data ? Buffer.from(block.signature.data) : Buffer.from(block.signature || []),
            // Ensure required fields have defaults or handle potential undefined values gracefully
            previous_hash: block.previous_hash || null, // Allow null for genesis
            data_size: block.data_size || 0,
            mining_duration_ms: block.mining_duration_ms || null,
            created_at: block.created_at || new Date(), // Use current time if missing
            difficulty: block.difficulty || 0, // Aggiungi un default se manca
            creator_id: block.creator_id || null // Permetti null se manca
        };

        // Validate essential fields before DB call
        if (!blockToInsert.block_hash || !blockToInsert.block_number || !blockToInsert.nonce) {
            logger.error('Attempted to add block with missing essential fields (hash, number, nonce)', { blockId: blockToInsert.block_id });
            return false;
        }
        if (blockToInsert.block_id === undefined) blockToInsert.block_id = crypto.randomUUID(); // Genera UUID se manca


        try {
            const { rowCount } = await pool.query(
                `INSERT INTO blockchain.blocks (
                    block_id, block_number, creator_id, previous_hash, block_hash,
                    nonce, difficulty, encrypted_data, data_iv, encrypted_data_key,
                    data_size, signature, created_at, mining_duration_ms
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                 ) ON CONFLICT (block_hash) DO NOTHING`,
                [
                    blockToInsert.block_id, blockToInsert.block_number, blockToInsert.creator_id,
                    blockToInsert.previous_hash, blockToInsert.block_hash, blockToInsert.nonce,
                    blockToInsert.difficulty, blockToInsert.encrypted_data, blockToInsert.data_iv,
                    blockToInsert.encrypted_data_key, blockToInsert.data_size, blockToInsert.signature,
                    blockToInsert.created_at, blockToInsert.mining_duration_ms
                ]
            );

            if (rowCount > 0) {
                logger.info(`Block #${blockToInsert.block_number} (Hash: ...${blockToInsert.block_hash.slice(-6)}) inserted into DB.`);
                // Ricarica la chain FROM DB *SOLO* dopo un inserimento riuscito
                await this.loadChainFromDB();
                logger.info(`Local chain state updated. New length: ${this.chain.length}`);
                return true; // Block successfully added
            } else {
                logger.info(`Block #${blockToInsert.block_number} (Hash: ...${blockToInsert.block_hash.slice(-6)}) already exists in DB (ON CONFLICT). No action taken.`);
                // Optional: Se il blocco non è in memoria ma è nel DB, ricarica per coerenza
                const existsInMemory = this.chain.some(b => b.block_hash === blockToInsert.block_hash);
                if (!existsInMemory) {
                    logger.warn(`Block #${blockToInsert.block_number} exists in DB but not in memory. Reloading chain.`);
                    await this.loadChainFromDB(); // Reload if DB and memory are inconsistent
                }
                return false; // Block already existed
            }
        } catch (error) {
            // Log detailed error, including potential constraint violations
            logger.error(`Failed to add block #${blockToInsert.block_number} to DB`, {
                 error: error.message,
                 code: error.code, // PostgreSQL error code (e.g., '23505' for unique violation if ON CONFLICT fails)
                 detail: error.detail, // More specific details if available
                 constraint: error.constraint, // Nome del vincolo violato (es. valid_genesis_block)
                 stack: error.stack
                });
            return false; // DB error occurred
        }
    }

    // Funzione per sostituire l'intera catena (necessaria per la sincronizzazione iniziale o in caso di forking)
    async replaceChain(newChain) {
        if (!Array.isArray(newChain) || newChain.length <= this.chain.length) {
            logger.debug('Received chain is not longer than current chain or is invalid. Ignoring.');
            return; // Non fare nulla se la catena ricevuta non è valida o non è più lunga
        }

        logger.info(`Received a longer chain with ${newChain.length} blocks. Verifying and replacing local chain...`);

        // VALIDAZIONE BASE (In produzione servirebbe validazione completa di ogni blocco)
        // Qui si potrebbe aggiungere un ciclo per validare hash, PoW, firme di newChain
        // Ad esempio:
        // for (const block of newChain) {
        //    const isValid = await someValidationFunction(block);
        //    if (!isValid) {
        //       logger.error('Received chain is invalid. Aborting replacement.');
        //       return;
        //    }
        // }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Usare DELETE invece di TRUNCATE per evitare problemi con RESTART IDENTITY in alcuni casi
            await client.query('DELETE FROM blockchain.blocks');
            logger.info('Local blockchain table cleared for chain replacement.');

            for (const block of newChain) {
                // Conversione da oggetto JSON P2P a Buffer/tipi corretti per il DB
                 const blockBuffer = {
                    ...block,
                    block_number: block.block_number?.toString(),
                    nonce: block.nonce?.toString(),
                    encrypted_data: Buffer.from(block.encrypted_data?.data || []), // Gestisce P2P format
                    data_iv: Buffer.from(block.data_iv?.data || []),
                    encrypted_data_key: Buffer.from(block.encrypted_data_key?.data || []),
                    signature: Buffer.from(block.signature?.data || []),
                    previous_hash: block.previous_hash || null,
                    data_size: block.data_size || 0,
                    mining_duration_ms: block.mining_duration_ms || null,
                    created_at: block.created_at || new Date(),
                    difficulty: block.difficulty || 0,
                    creator_id: block.creator_id || null,
                    block_id: block.block_id || crypto.randomUUID() // Assicura un block_id
                };

                 // Aggiungi un log dettagliato prima dell'inserimento
                // logger.debug(`Inserting block #${blockBuffer.block_number} during replaceChain`, { hash: blockBuffer.block_hash, prevHash: blockBuffer.previous_hash });


                await client.query(
                    `INSERT INTO blockchain.blocks (
                        block_id, block_number, creator_id, previous_hash, block_hash,
                        nonce, difficulty, encrypted_data, data_iv, encrypted_data_key,
                        data_size, signature, created_at, mining_duration_ms, verified, verified_at
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                     )`, // Aggiunti verified e verified_at se presenti nel blocco ricevuto
                    [
                        blockBuffer.block_id, blockBuffer.block_number, blockBuffer.creator_id,
                        blockBuffer.previous_hash, blockBuffer.block_hash, blockBuffer.nonce,
                        blockBuffer.difficulty, blockBuffer.encrypted_data, blockBuffer.data_iv,
                        blockBuffer.encrypted_data_key, blockBuffer.data_size, blockBuffer.signature,
                        blockBuffer.created_at, blockBuffer.mining_duration_ms,
                        blockBuffer.verified || false, // Default a false se non specificato
                        blockBuffer.verified_at || null // Default a null
                    ]
                );
            }
            await client.query('COMMIT');
            logger.info('Transaction committed. Reloading chain from DB after replacement.');
            // Ricarica la catena dal DB dopo la sostituzione riuscita
            await this.loadChainFromDB();
            logger.info(`Local chain successfully replaced with ${this.chain.length} blocks.`);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to replace chain in DB, transaction rolled back.', { error: error.message, stack: error.stack });
            // Potrebbe essere necessario ricaricare lo stato precedente della catena se il rollback ha successo
            // await this.loadChainFromDB(); // Ricarica lo stato attuale (potenzialmente vuoto o parziale se TRUNCATE è stato usato)
        } finally {
            client.release();
        }
    }
}

module.exports = Blockchain;