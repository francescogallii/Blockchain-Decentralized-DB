const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const { DIFFICULTY, MINING_TIMEOUT_MS, MAX_DATA_SIZE, GENESIS_HASH } = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

const validateBlock = [
  body('display_name').isLength({ min: 3, max: 255 }),
  body('data_text').isLength({ min: 1, max: MAX_DATA_SIZE }),
  body('private_key_pem').contains('-----BEGIN PRIVATE KEY-----'),
];

// GET /api/blocks - Legge la catena locale
router.get('/', async (req, res, next) => {
  try {
    // Ora legge dalla chain in memoria che è sincronizzata con il DB
    res.json({
      blocks: req.blockchain.chain,
      pagination: { totalCount: req.blockchain.chain.length }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/blocks - Crea e trasmette un nuovo blocco
router.post('/', validateBlock, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { display_name, data_text, private_key_pem } = req.body;
  const miningStartTime = Date.now();

  try {
    const creatorResult = await pool.query('SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1 AND is_active = true', [display_name]);
    if (creatorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Creator not found or inactive' });
    }
    const { creator_id, public_key_pem } = creatorResult.rows[0];
    
    const lastBlock = await req.blockchain.getLatestBlock();
    const previousHash = lastBlock ? lastBlock.block_hash : GENESIS_HASH;

    const aesKey = CryptoUtils.generateAESKey();
    const iv = CryptoUtils.generateIV();
    const { ciphertext, authTag } = CryptoUtils.encryptData(data_text, aesKey, iv);
    const encryptedAesKey = CryptoUtils.encryptAESKeyWithPublicKey(aesKey, public_key_pem);
    const encryptedData = Buffer.concat([ciphertext, authTag]);
    const dataSize = encryptedData.length + iv.length + encryptedAesKey.length;

    const createdAt = new Date();
    let nonce = 0n;
    let blockHash;
    let attempts = 0;

    logger.info(`Starting mining for creator ${display_name}...`);
    do {
      attempts++;
      nonce++;
      const hashInputData = {
        previous_hash: previousHash,
        encrypted_data: encryptedData,
        data_iv: iv,
        encrypted_data_key: encryptedAesKey,
        nonce,
        created_at: createdAt,
        creator_id,
        difficulty: DIFFICULTY,
      };
      blockHash = CryptoUtils.calculateHash(CryptoUtils.buildHashInput(hashInputData));
      
      if (Date.now() - miningStartTime > MINING_TIMEOUT_MS) {
        throw new Error('Mining timeout');
      }
    } while (!blockHash.startsWith('0'.repeat(DIFFICULTY)));

    const miningDuration = Date.now() - miningStartTime;
    const signature = CryptoUtils.signData(private_key_pem, blockHash);

    const insertQuery = `
      INSERT INTO blockchain.blocks (creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, mining_duration_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`;

    const insertResult = await pool.query(insertQuery, [
      creator_id, previousHash, blockHash, nonce.toString(), DIFFICULTY, encryptedData,
      iv, encryptedAesKey, dataSize, signature, miningDuration, createdAt
    ]);

    const newBlock = insertResult.rows[0];
    logger.info(`Block #${newBlock.block_number} mined successfully. Broadcasting...`);

    // Aggiungi alla chain locale e trasmetti agli altri nodi
    await req.blockchain.addBlock(newBlock);
    req.p2pServer.broadcastBlock(newBlock);

    res.status(201).json({ message: 'Block created and broadcasted', block: newBlock });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
