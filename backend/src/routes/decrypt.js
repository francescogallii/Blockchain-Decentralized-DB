const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware for decryption
const validateDecrypt = [
  body('display_name')
    .isLength({ min: 3, max: 255 })
    .withMessage('Display name must be 3-255 characters'),
  body('private_key_pem')
    .isLength({ min: 100 })
    .contains('-----BEGIN PRIVATE KEY-----')
    .contains('-----END PRIVATE KEY-----')
    .withMessage('Invalid RSA private key PEM format')
];

// POST /api/decrypt - Decrypt blocks for a creator
router.post('/', validateDecrypt, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { display_name, private_key_pem } = req.body;
  const decryptionStartTime = Date.now();

  try {
    // Validate private key format
    const keyValidation = CryptoUtils.validatePrivateKeyPem(private_key_pem);
    if (!keyValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid RSA private key',
        details: keyValidation.error 
      });
    }

    // Get creator information
    const creatorQuery = `
      SELECT creator_id, public_key_pem 
      FROM blockchain.creators 
      WHERE display_name = $1 AND is_active = true
    `;
    const creatorResult = await pool.query(creatorQuery, [display_name]);

    if (creatorResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Creator not found or inactive',
        display_name 
      });
    }

    const { creator_id, public_key_pem } = creatorResult.rows[0];

    // Verify key pair match
    try {
      const testData = 'key-pair-verification';
      const encrypted = CryptoUtils.encryptAESKeyWithPublicKey(Buffer.from(testData), public_key_pem);
      const decrypted = CryptoUtils.decryptAESKeyWithPrivateKey(encrypted, private_key_pem);
      
      if (decrypted.toString() !== testData) {
        throw new Error('Key pair mismatch');
      }
    } catch (keyTestError) {
      logger.warn(`Key pair verification failed for creator ${display_name}`, {
        error: keyTestError.message,
        ip: req.ip
      });
      return res.status(400).json({ 
        error: 'Private key does not match registered public key' 
      });
    }

    // Get all blocks for this creator
    const blocksQuery = `
      SELECT 
        block_id,
        block_number,
        block_hash,
        encrypted_data,
        data_iv,
        encrypted_data_key,
        data_size,
        verified,
        created_at,
        mining_duration_ms
      FROM blockchain.blocks 
      WHERE creator_id = $1 
      ORDER BY created_at ASC
    `;

    const blocksResult = await pool.query(blocksQuery, [creator_id]);

    if (blocksResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No blocks found for this creator',
        creator: display_name 
      });
    }

    logger.info(`Starting decryption for creator ${display_name}`, {
      blocks_count: blocksResult.rows.length,
      creator_id
    });

    // Decrypt each block
    const decryptedBlocks = [];
    let successCount = 0;
    let failCount = 0;

    for (const block of blocksResult.rows) {
      try {
        // Extract auth tag from encrypted data (last 16 bytes)
        const encryptedDataBuffer = Buffer.from(block.encrypted_data);
        const dataLength = encryptedDataBuffer.length - 16;
        const ciphertext = encryptedDataBuffer.subarray(0, dataLength);
        const authTag = encryptedDataBuffer.subarray(dataLength);

        // Decrypt AES key with private RSA key
        const aesKey = CryptoUtils.decryptAESKeyWithPrivateKey(
          Buffer.from(block.encrypted_data_key),
          private_key_pem
        );

        // Decrypt data with AES key
        const plaintext = CryptoUtils.decryptData(
          ciphertext,
          aesKey,
          Buffer.from(block.data_iv),
          authTag
        );

        decryptedBlocks.push({
          block_id: block.block_id,
          block_number: parseInt(block.block_number),
          block_hash: block.block_hash,
          decrypted_data: plaintext,
          data_size: parseInt(block.data_size),
          verified: block.verified,
          created_at: block.created_at,
          mining_duration_ms: block.mining_duration_ms ? parseInt(block.mining_duration_ms) : null
        });

        successCount++;

      } catch (decryptError) {
        logger.error(`Failed to decrypt block ${block.block_id} for creator ${display_name}`, {
          error: decryptError.message,
          block_id: block.block_id
        });

        decryptedBlocks.push({
          block_id: block.block_id,
          block_number: parseInt(block.block_number),
          block_hash: block.block_hash,
          error: 'Decryption failed',
          error_details: decryptError.message,
          verified: block.verified,
          created_at: block.created_at
        });

        failCount++;
      }
    }

    const decryptionDuration = Date.now() - decryptionStartTime;

    // Audit log
    await pool.query(`
      INSERT INTO audit.block_events (event_type, creator_id, client_ip, event_data)
      VALUES ($1, $2, $3, $4)
    `, [
      'BLOCKS_DECRYPTED',
      creator_id,
      req.ip,
      JSON.stringify({
        display_name,
        total_blocks: blocksResult.rows.length,
        success_count: successCount,
        fail_count: failCount,
        decryption_duration_ms: decryptionDuration
      })
    ]);

    logger.info(`Decryption completed for creator ${display_name}`, {
      total_blocks: blocksResult.rows.length,
      success_count: successCount,
      fail_count: failCount,
      duration_ms: decryptionDuration
    });

    res.json({
      message: 'Decryption completed',
      creator: display_name,
      summary: {
        total_blocks: blocksResult.rows.length,
        successfully_decrypted: successCount,
        failed_decryption: failCount,
        decryption_duration_ms: decryptionDuration
      },
      blocks: decryptedBlocks
    });

  } catch (error) {
    const decryptionDuration = Date.now() - decryptionStartTime;
    
    logger.error('Error during decryption process', { 
      error: error.message,
      display_name,
      ip: req.ip,
      duration_ms: decryptionDuration
    });

    res.status(500).json({ 
      error: 'Failed to decrypt blocks',
      duration_ms: decryptionDuration,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/decrypt/single - Decrypt single block by ID
router.post('/single', [
  body('block_id')
    .isUUID()
    .withMessage('Block ID must be a valid UUID'),
  body('private_key_pem')
    .isLength({ min: 100 })
    .contains('-----BEGIN PRIVATE KEY-----')
    .contains('-----END PRIVATE KEY-----')
    .withMessage('Invalid RSA private key PEM format')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { block_id, private_key_pem } = req.body;

  try {
    // Get block with creator information
    const blockQuery = `
      SELECT 
        b.block_id,
        b.block_number,
        b.block_hash,
        b.encrypted_data,
        b.data_iv,
        b.encrypted_data_key,
        b.data_size,
        b.verified,
        b.created_at,
        b.creator_id,
        c.display_name,
        c.public_key_pem
      FROM blockchain.blocks b
      LEFT JOIN blockchain.creators c ON b.creator_id = c.creator_id
      WHERE b.block_id = $1
    `;

    const blockResult = await pool.query(blockQuery, [block_id]);

    if (blockResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Block not found',
        block_id 
      });
    }

    const block = blockResult.rows[0];

    if (!block.creator_id) {
      return res.status(400).json({ 
        error: 'Block has no associated creator' 
      });
    }

    // Verify key pair match
    try {
      const testData = 'key-verification-single';
      const encrypted = CryptoUtils.encryptAESKeyWithPublicKey(Buffer.from(testData), block.public_key_pem);
      const decrypted = CryptoUtils.decryptAESKeyWithPrivateKey(encrypted, private_key_pem);
      
      if (decrypted.toString() !== testData) {
        throw new Error('Key pair mismatch');
      }
    } catch (keyTestError) {
      return res.status(400).json({ 
        error: 'Private key does not match block creator\'s public key' 
      });
    }

    // Decrypt block
    try {
      // Extract auth tag from encrypted data (last 16 bytes)
      const encryptedDataBuffer = Buffer.from(block.encrypted_data);
      const dataLength = encryptedDataBuffer.length - 16;
      const ciphertext = encryptedDataBuffer.subarray(0, dataLength);
      const authTag = encryptedDataBuffer.subarray(dataLength);

      // Decrypt AES key with private RSA key
      const aesKey = CryptoUtils.decryptAESKeyWithPrivateKey(
        Buffer.from(block.encrypted_data_key),
        private_key_pem
      );

      // Decrypt data with AES key
      const plaintext = CryptoUtils.decryptData(
        ciphertext,
        aesKey,
        Buffer.from(block.data_iv),
        authTag
      );

      // Audit log
      await pool.query(`
        INSERT INTO audit.block_events (block_id, event_type, creator_id, client_ip, event_data)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        block_id,
        'SINGLE_BLOCK_DECRYPTED',
        block.creator_id,
        req.ip,
        JSON.stringify({
          display_name: block.display_name,
          block_id,
          success: true
        })
      ]);

      logger.info(`Single block decrypted successfully`, {
        block_id,
        creator: block.display_name,
        ip: req.ip
      });

      res.json({
        message: 'Block decrypted successfully',
        block: {
          block_id: block.block_id,
          block_number: parseInt(block.block_number),
          block_hash: block.block_hash,
          decrypted_data: plaintext,
          creator_name: block.display_name,
          data_size: parseInt(block.data_size),
          verified: block.verified,
          created_at: block.created_at
        }
      });

    } catch (decryptError) {
      logger.error(`Failed to decrypt single block ${block_id}`, {
        error: decryptError.message,
        creator: block.display_name,
        ip: req.ip
      });

      res.status(400).json({
        error: 'Failed to decrypt block',
        details: decryptError.message,
        block_id
      });
    }

  } catch (error) {
    logger.error('Error in single block decryption', { 
      error: error.message,
      block_id,
      ip: req.ip
    });

    res.status(500).json({ 
      error: 'Failed to decrypt block',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
