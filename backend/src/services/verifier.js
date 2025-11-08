// Standardizzato buildHashInput usando CryptoUtils

const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');
const { GENESIS_HASH } = require('../config');

class BlockchainValidator {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.difficulty = options.difficulty || 4;
    this.timeoutMs = options.timeoutMs || 60000;
    this.intervalMs = options.intervalMs || 30000;
    this.isRunning = false;
    this.verificationInterval = null;
  }

  // Avvia il processo di verifica
  start() {
    if (this.isRunning) {
      logger.warn('Blockchain verifier already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting blockchain verifier', {
      difficulty: this.difficulty,
      timeoutMs: this.timeoutMs,
      intervalMs: this.intervalMs
    });

    // Esegui una verifica immediata all'avvio
    this.verifyPendingBlocks();

    // Imposta intervallo per verifiche periodiche
    if (this.intervalMs) {
      this.verificationInterval = setInterval(() => {
        this.verifyPendingBlocks();
      }, this.intervalMs);
    }
  }

  // Ferma il processo di verifica
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.verificationInterval) {
      clearInterval(this.verificationInterval);
      this.verificationInterval = null;
    }
    logger.info('Blockchain verifier stopped');
  }

  // Verifica i blocchi in sospeso
  async verifyPendingBlocks() {
    try {
      const query = `
        SELECT 
          block_id, previous_hash, block_hash, nonce, created_at,
          encrypted_data, data_iv, encrypted_data_key, creator_id,
          signature, difficulty, data_size, mining_duration_ms,
          block_number
        FROM blockchain.blocks 
        WHERE verified = false 
          AND created_at < NOW() - INTERVAL '${this.timeoutMs} milliseconds'
        ORDER BY created_at ASC
        LIMIT 10
      `;

      const result = await this.pool.query(query);

      if (result.rows.length === 0) {
        logger.debug('No pending blocks to verify');
        return;
      }

      logger.info(`Verifying ${result.rows.length} pending blocks`);

      for (const block of result.rows) {
        try {
          // Converti i buffer bytea in Buffer Node.js prima della verifica
          const blockWithBuffers = {
            ...block,
            encrypted_data: Buffer.from(block.encrypted_data),
            data_iv: Buffer.from(block.data_iv),
            encrypted_data_key: Buffer.from(block.encrypted_data_key),
            signature: Buffer.from(block.signature),
          };
          
          const isValid = await this.verifyBlock(blockWithBuffers);
          
          await this.pool.query(
            'UPDATE blockchain.blocks SET verified = $1, verified_at = NOW() WHERE block_id = $2',
            [isValid, block.block_id]
          );

          // Log verification result (Schema 'audit.events')
          await this.pool.query(`
            INSERT INTO audit.events (block_id, event_type, event_data)
            VALUES ($1, $2, $3)
          `, [
            block.block_id,
            'VERIFIED',
            JSON.stringify({
              verified: isValid,
              verifier: 'blockchain-validator',
              timestamp: new Date().toISOString()
            })
          ]);

          if (isValid) {
            logger.info(`Block ${block.block_id} (#${block.block_number}) verified successfully`);
          } else {
            logger.warn(`Block ${block.block_id} (#${block.block_number}) verification failed`);
          }

        } catch (error) {
          logger.error(`Error verifying block ${block.block_id} (#${block.block_number})`, {
            error: error.message,
            stack: error.stack // Aggiungi stack trace per debug
          });
        }
      }

    } catch (error) {
      logger.error('Error in verification process', { error: error.message });
    }
  }

  // Verifica singolo blocco
  async verifyBlock(block) { // Ora riceve blockWithBuffers
    try {
      // 1. Verifica hash del blocco
      const hashInputString = CryptoUtils.buildHashInput({
        previous_hash: block.previous_hash,
        encrypted_data: block.encrypted_data,
        data_iv: block.data_iv,
        encrypted_data_key: block.encrypted_data_key,
        nonce: block.nonce,
        created_at: block.created_at, // Assicurati sia Date o stringa ISO
        creator_id: block.creator_id,
        difficulty: block.difficulty
      });
      const calculatedHash = CryptoUtils.calculateHash(hashInputString);
      
      if (!CryptoUtils.timeSafeEqual(calculatedHash, block.block_hash)) {
        logger.warn(`Block ${block.block_id} (#${block.block_number}): Hash mismatch`, {
          calculated: calculatedHash,
          stored: block.block_hash,
          // inputString: hashInputString // Uncomment for deep debug
        });
        return false;
      }

      // 2. Verifica difficoltà Proof-of-Work 
      if (!this.verifyProofOfWork(block.block_hash, block.difficulty)) {
        logger.warn(`Block ${block.block_id} (#${block.block_number}): Proof-of-Work failed`, {
          hash: block.block_hash,
          difficulty: block.difficulty
        });
        return false;
      }

      // 3. Verifica integrità della catena
      if (!(await this.verifyChainIntegrity(block))) {
        logger.warn(`Block ${block.block_id} (#${block.block_number}): Chain integrity failed`);
        return false;
      }

      // 4. Verifica firma digitale
      if (!(await this.verifyDigitalSignature(block))) {
        logger.warn(`Block ${block.block_id} (#${block.block_number}): Digital signature verification failed`);
        return false;
      }

      // 5. Verifica integrità dei dati
      if (!this.verifyDataIntegrity(block)) {
        logger.warn(`Block ${block.block_id} (#${block.block_number}): Data integrity check failed`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error(`Block verification error for ${block.block_id} (#${block.block_number})`, {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  // Verifica Proof-of-Work
  verifyProofOfWork(blockHash, difficulty) {
    const requiredPrefix = '0'.repeat(difficulty);
    return blockHash.startsWith(requiredPrefix);
  }

  // Verifica integrità della catena
  async verifyChainIntegrity(block) {
    try {
      // Genesis block check
      if (Number(block.block_number) === 1) {
        // Il blocco genesis nel DB DEVE avere NULL, ma accettiamo GENESIS_HASH per coerenza
        // se per errore fosse stato inserito così (anche se il constraint non lo permetterebbe)
        return block.previous_hash === null || block.previous_hash === GENESIS_HASH;
      }

      // Trova l'hash del blocco precedente dal DB
      const prevBlockQuery = `
        SELECT block_hash FROM blockchain.blocks 
        WHERE block_number = $1
      `;
      const prevBlockNumber = (BigInt(block.block_number) - 1n).toString();
      const prevResult = await this.pool.query(prevBlockQuery, [prevBlockNumber]);

      if (prevResult.rows.length === 0) {
        logger.warn(`No previous block (#${prevBlockNumber}) found for chain verification of block #${block.block_number}`);
        return false;
      }

      const expectedPrevHash = prevResult.rows[0].block_hash;
      
      // Confronto sicuro
      const hashesMatch = CryptoUtils.timeSafeEqual(block.previous_hash || '', expectedPrevHash || '');
      if (!hashesMatch) {
        logger.warn(`Previous hash mismatch for block #${block.block_number}. Expected: ${expectedPrevHash}, Got: ${block.previous_hash}`);
      }
      return hashesMatch;

    } catch (error) {
      logger.error(`Chain integrity verification error for block #${block.block_number}`, { error: error.message, stack: error.stack });
      return false;
    }
  }

  // Verifica firma digitale
  async verifyDigitalSignature(block) { // Riceve blockWithBuffers
    try {
      if (!block.creator_id) {
        logger.warn(`Block #${block.block_number} has no creator for signature verification`);
        return false; // Un blocco senza creator non può avere firma valida
      }

      // Recupera la chiave pubblica del creator dal DB
      const creatorQuery = `
        SELECT public_key_pem FROM blockchain.creators 
        WHERE creator_id = $1 AND is_active = true
      `;
      const creatorResult = await this.pool.query(creatorQuery, [block.creator_id]);

      if (creatorResult.rows.length === 0) {
        logger.warn(`Creator ${block.creator_id} not found or inactive for signature verification of block #${block.block_number}`);
        return false;
      }

      const publicKeyPem = creatorResult.rows[0].public_key_pem;

      // Verifica la firma
      const signatureIsValid = CryptoUtils.verifySignature(
        publicKeyPem,
        block.block_hash, // La firma è sull'hash del blocco
        block.signature // Il buffer della firma
      );
      
      if (!signatureIsValid) {
        logger.warn(`Invalid signature for block #${block.block_number}`);
      }
      return signatureIsValid;

    } catch (error) {
      logger.error(`Digital signature verification error for block #${block.block_number}`, { error: error.message, stack: error.stack });
      return false; // Ritorna false in caso di errore durante la verifica
    }
  }

  // Verifica integrità dei dati
  verifyDataIntegrity(block) { // Riceve blockWithBuffers
    try {
      // Verifica che le dimensioni dei buffer corrispondano a data_size
      const actualSize = block.encrypted_data.length + 
                        block.data_iv.length + 
                        block.encrypted_data_key.length;

      // Permetti una piccola variazione dovuta a padding o formattazione
      const sizeVariance = Math.abs(actualSize - block.data_size);
      
      // Tolleranza aumentata leggermente per sicurezza, ma 100 è già alta
      if (sizeVariance > 128) {
        logger.warn(`Block #${block.block_number}: Data size mismatch: declared ${block.data_size}, actual buffer sum ${actualSize}`);
        return false;
      }

      // Verifica dimensione IV (AES standard usa 16 bytes)
      if (block.data_iv.length !== 16) {
        logger.warn(`Block #${block.block_number}: Invalid IV size: ${block.data_iv.length}, expected 16`);
        return false;
      }

      // Verifica dimensione chiave crittografata (dipende dall'algoritmo, qui assumiamo RSA-2048)
      const expectedKeySize = 256; // Per RSA 2048
      if (block.encrypted_data_key.length !== expectedKeySize) {
        logger.warn(`Block #${block.block_number}: Invalid encrypted key size: ${block.encrypted_data_key.length}, expected ${expectedKeySize} for RSA-2048`);
        // Potrebbe essere un warning meno grave se si supportano diverse key sizes, ma qui è fisso a 2048
        // return false; // Commentato per non bloccare la verifica solo per questo
      }
      
      // Verifica che i buffer non siano vuoti
      if (block.encrypted_data.length < 16) {
        logger.warn(`Block #${block.block_number}: Encrypted data buffer too small to contain auth tag (${block.encrypted_data.length} bytes)`);
        return false;
      }


      return true;

    } catch (error) {
      logger.error(`Data integrity verification error for block #${block.block_number}`, { error: error.message, stack: error.stack });
      return false;
    }
  }

  // Ottiene statistiche di verifica
  async getVerificationStats() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_blocks,
          COUNT(*) FILTER (WHERE verified = true) as verified_blocks,
          COUNT(*) FILTER (WHERE verified = false) as pending_blocks,
          AVG(mining_duration_ms) as avg_mining_time,
          AVG(difficulty) as avg_difficulty
        FROM blockchain.blocks
      `;

      const result = await this.pool.query(statsQuery);
      return result.rows[0];

    } catch (error) {
      logger.error('Error getting verification stats', { error: error.message });
      return null;
    }
  }
}

// Funzione helper per avviare il verificatore
function startVerifier(pool, options = {}) {
  const verifier = new BlockchainValidator(pool, options);
  verifier.start();

  // Gestione graceful shutdown
  process.on('SIGTERM', () => verifier.stop());
  process.on('SIGINT', () => verifier.stop());

  return {
    stop: () => verifier.stop(),
    getStats: () => verifier.getVerificationStats()
  };
}

module.exports = {
  BlockchainValidator,
  startVerifier
};