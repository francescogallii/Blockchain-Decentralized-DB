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
				encrypted_data: Buffer.from(block.encrypted_data),
				data_iv: Buffer.from(block.data_iv),
				encrypted_data_key: Buffer.from(block.encrypted_data_key),
				signature: Buffer.from(block.signature),
				// Rende il block_number una stringa per coerenza con BigInt JS
				block_number: block.block_number.toString() 
			}));
			
			logger.info(`Blockchain loaded from local DB with ${this.chain.length} blocks.`);
		} catch (error) {
			logger.warn('Could not load chain from DB, assuming it is empty.');
			this.chain = [];
		}
	}

	async getLatestBlock() {
		if (this.chain.length > 0) {
			// Restituisce l'ultimo blocco nella catena in memoria
			return this.chain[this.chain.length - 1]; 
		}
		return null;
	}

	// Funzione per aggiungere un blocco, sia esso creato localmente o ricevuto da P2P
	async addBlock(block) {
		const latestBlock = await this.getLatestBlock();
		
		// Controllo sequenza
		if (latestBlock && block.previous_hash !== latestBlock.block_hash) {
			logger.warn('Received block is not the next in sequence. Ignoring.', { blockNumber: block.block_number });
			return false;
		}
		
		// Conversione Buffer per l'inserimento nel DB (se non è già un Buffer)
		const blockToInsert = {
			...block,
			encrypted_data: block.encrypted_data.data ? Buffer.from(block.encrypted_data.data) : Buffer.from(block.encrypted_data),
			data_iv: block.data_iv.data ? Buffer.from(block.data_iv.data) : Buffer.from(block.data_iv),
			encrypted_data_key: block.encrypted_data_key.data ? Buffer.from(block.encrypted_data_key.data) : Buffer.from(block.encrypted_data_key),
			signature: block.signature.data ? Buffer.from(block.signature.data) : Buffer.from(block.signature),
			block_number: block.block_number.toString()
		}

		try {
			const { rowCount } = await pool.query(
				`INSERT INTO blockchain.blocks (block_id, block_number, creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, created_at, mining_duration_ms) 
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (block_hash) DO NOTHING`,
				[
					blockToInsert.block_id, blockToInsert.block_number, blockToInsert.creator_id, blockToInsert.previous_hash, blockToInsert.block_hash, blockToInsert.nonce, blockToInsert.difficulty,
					blockToInsert.encrypted_data, blockToInsert.data_iv, blockToInsert.encrypted_data_key, 
					blockToInsert.data_size, blockToInsert.signature, blockToInsert.created_at, blockToInsert.mining_duration_ms
				]
			);

			if (rowCount > 0) {
				// Ricarica la catena dopo l'inserimento
				await this.loadChainFromDB(); 
				logger.info(`Block #${blockToInsert.block_number} successfully added to local chain.`);
				return true;
			} else {
				logger.info(`Block #${blockToInsert.block_number} already exists locally. No action taken.`);
				return false;
			}
		} catch (error) {
			logger.error('Failed to add received block to DB', { error: error.message });
			return false;
		}
	}
	
	// Funzione per sostituire l'intera catena (necessaria per la sincronizzazione iniziale o in caso di forking)
	async replaceChain(newChain) {
		if (newChain.length <= this.chain.length) {
			return; // Non fare nulla se la catena ricevuta non è più lunga o uguale
		}

		logger.info('Received a longer chain. Verifying and replacing local chain...');
		
		// In una vera implementazione, qui si dovrebbe fare una validazione completa di ogni blocco della nuova catena
		
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			// Truncate non deve ripristinare l'identità altrimenti block_number non è coerente
			await client.query('TRUNCATE blockchain.blocks RESTART IDENTITY CASCADE'); 
			
			for (const block of newChain) {
				// Conversione da oggetto JSON P2P a Buffer (necessario perché il DB non sa come trattare l'oggetto {type: 'Buffer', data: [..]})
				const blockBuffer = {
					...block,
					encrypted_data: Buffer.from(block.encrypted_data.data),
					data_iv: Buffer.from(block.data_iv.data),
					encrypted_data_key: Buffer.from(block.encrypted_data_key.data),
					signature: Buffer.from(block.signature.data),
					block_number: block.block_number.toString()
				}
				
				await client.query(
					`INSERT INTO blockchain.blocks (block_id, block_number, creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, created_at, mining_duration_ms) 
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
					[
						blockBuffer.block_id, blockBuffer.block_number, blockBuffer.creator_id, blockBuffer.previous_hash, blockBuffer.block_hash, blockBuffer.nonce, blockBuffer.difficulty,
						blockBuffer.encrypted_data, blockBuffer.data_iv, blockBuffer.encrypted_data_key, 
						blockBuffer.data_size, blockBuffer.signature, blockBuffer.created_at, blockBuffer.mining_duration_ms
					]
				);
			}
			await client.query('COMMIT');
			this.chain = newChain;
			logger.info('Local chain successfully replaced.');
		} catch (error) {
			await client.query('ROLLBACK');
			logger.error('Failed to replace chain in DB', { error: error.message });
		} finally {
			client.release();
		}
	}
}

module.exports = Blockchain;