const { pool } = require('../database/db');
const logger = require('../utils/logger');
const CryptoUtils = require('../utils/cryptoUtils');
const { GENESIS_HASH } = require('../config');

class Blockchain {
  constructor() {
    this.chain = [];
  }

  async loadChainFromDB() {
    try {
      const { rows } = await pool.query('SELECT * FROM blockchain.blocks ORDER BY block_number ASC');
      this.chain = rows;
      logger.info(`Blockchain loaded from local DB with ${this.chain.length} blocks.`);
    } catch (error) {
      logger.warn('Could not load chain from DB, maybe it is empty.', { error: error.message });
      this.chain = [];
    }
  }

  async getLatestBlock() {
    if (this.chain.length > 0) {
      return this.chain[this.chain.length - 1];
    }
    return null;
  }

  async addBlock(block) {
    // Semplice validazione: il blocco è quello successivo?
    const latestBlock = await this.getLatestBlock();
    if (latestBlock && block.previous_hash !== latestBlock.block_hash) {
      logger.warn('Received block is not the next block in the chain. Ignoring.', { blockNumber: block.block_number });
      return false;
    }
    
    // TODO: Implementare una validazione completa del blocco ricevuto (PoW, firma, etc.)

    try {
      // Inserisci il blocco nel DB locale se non esiste già
      await pool.query(
        `INSERT INTO blockchain.blocks (block_id, block_number, creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, created_at, mining_duration_ms) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (block_hash) DO NOTHING`,
        [
          block.block_id, block.block_number, block.creator_id, block.previous_hash, block.block_hash, block.nonce, block.difficulty,
          block.encrypted_data, block.data_iv, block.encrypted_data_key, block.data_size, block.signature, block.created_at, block.mining_duration_ms
        ]
      );
      // Ricarica la catena dal DB per essere sicuri
      await this.loadChainFromDB();
      logger.info(`Block #${block.block_number} added to local chain.`);
      return true;
    } catch (error) {
      logger.error('Failed to add received block to DB', { error: error.message });
      return false;
    }
  }
  
  async replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      logger.info('Received chain is not longer than the current chain. No action taken.');
      return;
    }
    
    // TODO: Qui andrebbe una validazione completa della nuova catena
    // if (!this.isValidChain(newChain)) { ... }

    logger.info('Received a longer valid chain. Replacing local chain.');
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE blockchain.blocks RESTART IDENTITY CASCADE'); // Svuota la tabella locale
      for (const block of newChain) {
        await client.query(
          `INSERT INTO blockchain.blocks (block_id, block_number, creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, created_at, mining_duration_ms) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            block.block_id, block.block_number, block.creator_id, block.previous_hash, block.block_hash, block.nonce, block.difficulty,
            block.encrypted_data, block.data_iv, block.encrypted_data_key, block.data_size, block.signature, block.created_at, block.mining_duration_ms
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
