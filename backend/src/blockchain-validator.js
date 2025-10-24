const CryptoUtils = require('./crypto-utils');
const logger = require('../utils/logger');

class BlockchainValidator {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.difficulty = options.difficulty || 4;
    this.timeoutMs = options.timeoutMs || 60000;
    this.intervalMs = options.intervalMs || 30000;
    this.isRunning = false;
    this.verificationInterval = null;
  }

  // Start the verification process
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

    // Run immediate verification
    this.verifyPendingBlocks();

    // Set up periodic verification if interval is specified
    if (this.intervalMs) {
      this.verificationInterval = setInterval(() => {
        this.verifyPendingBlocks();
      }, this.intervalMs);
    }
  }

  // Stop the verification process
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

  // Verify pending blocks
  async verifyPendingBlocks() {
    try {
      const query = `
        SELECT 
          block_id, previous_hash, block_hash, nonce, created_at,
          encrypted_data, data_iv, encrypted_data_key, creator_id,
          signature, difficulty, data_size, mining_duration_ms
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
          const isValid = await this.verifyBlock(block);
          
          await this.pool.query(
            'UPDATE blockchain.blocks SET verified = $1, verified_at = NOW() WHERE block_id = $2',
            [isValid, block.block_id]
          );

          // Log verification result
          await this.pool.query(`
            INSERT INTO audit.block_events (block_id, event_type, event_data)
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
            logger.info(`Block ${block.block_id} verified successfully`);
          } else {
            logger.warn(`Block ${block.block_id} verification failed`);
          }

        } catch (error) {
          logger.error(`Error verifying block ${block.block_id}`, {
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Error in verification process', { error: error.message });
    }
  }

  // Verify individual block
  async verifyBlock(block) {
    try {
      // 1. Verify hash calculation
      const hashInput = this.buildHashInput(block);
      const calculatedHash = CryptoUtils.calculateBlockHash(hashInput);
      
      if (!CryptoUtils.timeSafeEqual(calculatedHash, block.block_hash)) {
        logger.warn(`Block ${block.block_id}: Hash mismatch`, {
          calculated: calculatedHash,
          stored: block.block_hash
        });
        return false;
      }

      // 2. Verify Proof-of-Work difficulty
      if (!this.verifyProofOfWork(block.block_hash, block.difficulty)) {
        logger.warn(`Block ${block.block_id}: Proof-of-Work failed`, {
          hash: block.block_hash,
          difficulty: block.difficulty
        });
        return false;
      }

      // 3. Verify previous hash chain integrity
      if (!(await this.verifyChainIntegrity(block))) {
        logger.warn(`Block ${block.block_id}: Chain integrity failed`);
        return false;
      }

      // 4. Verify digital signature
      if (!(await this.verifyDigitalSignature(block))) {
        logger.warn(`Block ${block.block_id}: Digital signature verification failed`);
        return false;
      }

      // 5. Verify data integrity
      if (!this.verifyDataIntegrity(block)) {
        logger.warn(`Block ${block.block_id}: Data integrity check failed`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error(`Block verification error for ${block.block_id}`, {
        error: error.message
      });
      return false;
    }
  }

  // Build hash input string for verification
  buildHashInput(block) {
    return [
      block.previous_hash || '',
      block.encrypted_data.toString('hex'),
      block.data_iv.toString('hex'),
      block.encrypted_data_key.toString('hex'),
      block.nonce.toString(),
      new Date(block.created_at).toISOString(),
      block.creator_id || '',
      block.difficulty.toString()
    ].join('');
  }

  // Verify Proof-of-Work
  verifyProofOfWork(blockHash, difficulty) {
    const requiredPrefix = '0'.repeat(difficulty);
    return blockHash.startsWith(requiredPrefix);
  }

  // Verify chain integrity
  async verifyChainIntegrity(block) {
    try {
      // Genesis block has no previous hash
      if (block.block_number === 1) {
        return block.previous_hash === null || 
               block.previous_hash === '0'.repeat(64);
      }

      // Find the actual previous block
      const prevBlockQuery = `
        SELECT block_hash FROM blockchain.blocks 
        WHERE created_at < $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const prevResult = await this.pool.query(prevBlockQuery, [block.created_at]);

      if (prevResult.rows.length === 0) {
        logger.warn('No previous block found for chain verification');
        return false;
      }

      const expectedPrevHash = prevResult.rows[0].block_hash;
      return CryptoUtils.timeSafeEqual(block.previous_hash, expectedPrevHash);

    } catch (error) {
      logger.error('Chain integrity verification error', { error: error.message });
      return false;
    }
  }

  // Verify digital signature
  async verifyDigitalSignature(block) {
    try {
      if (!block.creator_id) {
        logger.warn('Block has no creator for signature verification');
        return false;
      }

      // Get creator's public key
      const creatorQuery = `
        SELECT public_key_pem FROM blockchain.creators 
        WHERE creator_id = $1 AND is_active = true
      `;

      const creatorResult = await this.pool.query(creatorQuery, [block.creator_id]);

      if (creatorResult.rows.length === 0) {
        logger.warn('Creator not found or inactive for signature verification');
        return false;
      }

      const publicKeyPem = creatorResult.rows[0].public_key_pem;

      // Verify signature against block hash
      return CryptoUtils.verifySignature(
        publicKeyPem,
        block.block_hash,
        block.signature
      );

    } catch (error) {
      logger.error('Digital signature verification error', { error: error.message });
      return false;
    }
  }

  // Verify data integrity
  verifyDataIntegrity(block) {
    try {
      // Check that encrypted data size matches declared size
      const actualSize = block.encrypted_data.length + 
                        block.data_iv.length + 
                        block.encrypted_data_key.length;

      // Allow for reasonable variance due to padding
      const sizeVariance = Math.abs(actualSize - block.data_size);
      
      if (sizeVariance > 100) { // 100 bytes tolerance for padding
        logger.warn(`Data size mismatch: expected ${block.data_size}, got ${actualSize}`);
        return false;
      }

      // Verify IV and key sizes
      if (block.data_iv.length !== 16) { // AES-GCM IV should be 16 bytes
        logger.warn(`Invalid IV size: ${block.data_iv.length}`);
        return false;
      }

      if (block.encrypted_data_key.length < 256) { // RSA-2048 encrypted key minimum
        logger.warn(`Invalid encrypted key size: ${block.encrypted_data_key.length}`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error('Data integrity verification error', { error: error.message });
      return false;
    }
  }

  // Get verification statistics
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

// Factory function to start verifier
function startVerifier(pool, options = {}) {
  const verifier = new BlockchainValidator(pool, options);
  verifier.start();

  // Graceful shutdown
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
