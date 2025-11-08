const { pool } = require('../database/db');
const logger = require('../utils/logger');

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
        // Logica per convertire i campi necessari in Buffer
        // Gestisce i casi in cui il blocco proviene da API (già Buffer) vs P2P (oggetto { type: 'Buffer', data: [...] })
        const blockToInsert = {
            ...block,
            block_number: block.block_number?.toString(), 
            nonce: block.nonce?.toString(),             
            encrypted_data: block.encrypted_data?.data ? Buffer.from(block.encrypted_data.data) : Buffer.from(block.encrypted_data || []),
            data_iv: block.data_iv?.data ? Buffer.from(block.data_iv.data) : Buffer.from(block.data_iv || []),
            encrypted_data_key: block.encrypted_data_key?.data ? Buffer.from(block.encrypted_data_key.data) : Buffer.from(block.encrypted_data_key || []),
            signature: block.signature?.data ? Buffer.from(block.signature.data) : Buffer.from(block.signature || []),
            // Gestione di campi opzionali con default
            previous_hash: block.previous_hash || null, // Permetti null per genesis o mancante
            data_size: block.data_size || 0,
            mining_duration_ms: block.mining_duration_ms || null,
            created_at: block.created_at || new Date(), // Usa data corrente se manca
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
                // Ricarica la chain FROM DB SOLO dopo un inserimento riuscito
                await this.loadChainFromDB();
                logger.info(`Local chain state updated. New length: ${this.chain.length}`);
                return true; // Blocco inserito con successo
            } else {
                logger.info(`Block #${blockToInsert.block_number} (Hash: ...${blockToInsert.block_hash.slice(-6)}) already exists in DB (ON CONFLICT). No action taken.`);
                // Optional: Se il blocco non è in memoria ma è nel DB, ricarica per coerenza
                const existsInMemory = this.chain.some(b => b.block_hash === blockToInsert.block_hash);
                if (!existsInMemory) {
                    logger.warn(`Block #${blockToInsert.block_number} exists in DB but not in memory. Reloading chain.`);
                    await this.loadChainFromDB(); // Ricarica la catena se necessario
                }
                return false; // Blocco già esistente
            }
        } catch (error) {
            // Migliora il log degli errori DB
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

                await client.query(
                    `INSERT INTO blockchain.blocks (
                        block_id, block_number, creator_id, previous_hash, block_hash,
                        nonce, difficulty, encrypted_data, data_iv, encrypted_data_key,
                        data_size, signature, created_at, mining_duration_ms, verified, verified_at
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                     )`, 
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