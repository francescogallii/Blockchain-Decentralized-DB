const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');
const { GENESIS_HASH } = require('../config');

class BlockchainVerifier {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.difficulty = options.difficulty;
    this.intervalMs = options.intervalMs || 60000;
    this.isRunning = false;
    this.verificationInterval = null;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Blockchain verifier is already running.');
      return;
    }
    this.isRunning = true;
    logger.info('Starting blockchain verifier service...', { interval: `${this.intervalMs}ms` });
    this.verifyPendingBlocks(); // Run once on start
    this.verificationInterval = setInterval(() => this.verifyPendingBlocks(), this.intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.verificationInterval);
    this.verificationInterval = null;
    logger.info('Blockchain verifier service stopped.');
  }

  async verifyPendingBlocks() {
    logger.debug('Running periodic verification of pending blocks...');
    try {
      const { rows: pendingBlocks } = await this.pool.query(`
        SELECT * FROM blockchain.blocks
        WHERE verified = FALSE
        ORDER BY block_number ASC
        LIMIT 20;
      `);

      if (pendingBlocks.length === 0) {
        logger.debug('No pending blocks to verify.');
        return;
      }

      logger.info(`Found ${pendingBlocks.length} pending blocks to verify.`);

      for (const block of pendingBlocks) {
        try {
          const isValid = await this.verifyBlock(block);
          await this.pool.query(
            'UPDATE blockchain.blocks SET verified = $1, verified_at = NOW() WHERE block_id = $2;',
            [isValid, block.block_id]
          );

          await this.pool.query(
            `INSERT INTO audit.events (block_id, event_type, creator_id, event_data) VALUES ($1, $2, $3, $4)`,
            [block.block_id, isValid ? 'BLOCK_VERIFIED_OK' : 'BLOCK_VERIFIED_FAIL', block.creator_id, { reason: isValid ? 'OK' : 'Verification failed' }]
          );

          if (isValid) {
            logger.info(`Block #${block.block_number} (${block.block_id}) verified successfully.`);
          } else {
            logger.warn(`Block #${block.block_number} (${block.block_id}) verification FAILED.`);
          }
        } catch (error) {
          logger.error(`Error during verification of block #${block.block_number}`, { error: error.message, stack: error.stack });
        }
      }
    } catch (error) {
      logger.error('Error in verifier main loop', { error: error.message });
    }
  }

  async verifyBlock(block) {
    // 1. Verify hash calculation consistency
    const hashInput = CryptoUtils.buildHashInput(block);
    const calculatedHash = CryptoUtils.calculateHash(hashInput);
    if (!CryptoUtils.timeSafeEqual(calculatedHash, block.block_hash)) {
      logger.warn(`Block #${block.block_number}: Hash mismatch.`, { calculated: calculatedHash, stored: block.block_hash });
      return false;
    }

    // 2. Verify Proof-of-Work difficulty
    const requiredPrefix = '0'.repeat(block.difficulty);
    if (!block.block_hash.startsWith(requiredPrefix)) {
      logger.warn(`Block #${block.block_number}: Proof-of-Work not satisfied.`);
      return false;
    }

    // 3. Verify previous hash chain integrity
    const expectedPrevHash = await this.getExpectedPreviousHash(block);
    if (!CryptoUtils.timeSafeEqual(block.previous_hash || GENESIS_HASH, expectedPrevHash)) {
      logger.warn(`Block #${block.block_number}: Chain integrity broken. Expected prev_hash: ${expectedPrevHash}, got: ${block.previous_hash}`);
      return false;
    }

    // 4. Verify digital signature
    if (!(await this.verifyDigitalSignature(block))) {
      logger.warn(`Block #${block.block_number}: Digital signature is invalid.`);
      return false;
    }

    return true;
  }

  async getExpectedPreviousHash(block) {
    if (block.block_number === 1) {
      return GENESIS_HASH;
    }
    const { rows } = await this.pool.query(
      'SELECT block_hash FROM blockchain.blocks WHERE block_number = $1',
      [BigInt(block.block_number) - 1n]
    );
    if (rows.length === 0) {
      throw new Error(`Could not find previous block for block #${block.block_number}`);
    }
    return rows[0].block_hash;
  }

  async verifyDigitalSignature(block) {
    if (!block.creator_id) {
      logger.warn(`Block #${block.block_number} has no creator_id for signature verification.`);
      return false;
    }
    const { rows } = await this.pool.query(
      'SELECT public_key_pem FROM blockchain.creators WHERE creator_id = $1',
      [block.creator_id]
    );
    if (rows.length === 0) {
      logger.warn(`Creator ${block.creator_id} not found for signature verification.`);
      return false;
    }
    return CryptoUtils.verifySignature(rows[0].public_key_pem, block.block_hash, block.signature);
  }
}

function startVerifier(pool, options) {
  const verifier = new BlockchainVerifier(pool, options);
  verifier.start();
  return verifier;
}

module.exports = { BlockchainVerifier, startVerifier };