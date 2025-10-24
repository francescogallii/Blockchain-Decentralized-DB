const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/errors');

const router = express.Router();

const validateDecrypt = [
  body('display_name').isLength({ min: 3, max: 255 }),
  body('private_key_pem').contains('-----BEGIN PRIVATE KEY-----'),
];

router.post('/', validateDecrypt, asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { display_name, private_key_pem } = req.body;

    const creatorResult = await pool.query(`SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1`, [display_name]);
    if (creatorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Creator not found' });
    }
    const { creator_id, public_key_pem } = creatorResult.rows[0];

    // Verifica la corrispondenza delle chiavi
    try {
        const testData = 'key-verification';
        const encrypted = CryptoUtils.encryptAESKeyWithPublicKey(Buffer.from(testData), public_key_pem);
        const decrypted = CryptoUtils.decryptAESKeyWithPrivateKey(encrypted, private_key_pem);
        if (decrypted.toString() !== testData) {
            throw new Error();
        }
    } catch (e) {
        return res.status(400).json({ error: 'Private key does not match the registered public key.' });
    }

    const blocksResult = await pool.query(`SELECT * FROM blockchain.blocks WHERE creator_id = $1 ORDER BY block_number ASC`, [creator_id]);

    const decryptedBlocks = [];
    let successCount = 0;
    let failCount = 0;

    for (const block of blocksResult.rows) {
        try {
            const encryptedDataBuffer = Buffer.from(block.encrypted_data);
            const authTag = encryptedDataBuffer.slice(-16);
            const ciphertext = encryptedDataBuffer.slice(0, -16);

            const aesKey = CryptoUtils.decryptAESKeyWithPrivateKey(Buffer.from(block.encrypted_data_key), private_key_pem);
            const plaintext = CryptoUtils.decryptData(ciphertext, aesKey, Buffer.from(block.data_iv), authTag);
            
            decryptedBlocks.push({ ...block, decrypted_data: plaintext });
            successCount++;
        } catch (error) {
            decryptedBlocks.push({ ...block, error: 'Decryption failed', error_details: error.message });
            failCount++;
        }
    }

    res.json({
        creator: display_name,
        summary: {
            total_blocks: blocksResult.rows.length,
            successfully_decrypted: successCount,
            failed_decryption: failCount
        },
        blocks: decryptedBlocks,
    });
}));

module.exports = router;