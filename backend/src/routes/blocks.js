const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const { DIFFICULTY, MINING_TIMEOUT_MS, MAX_DATA_SIZE, GENESIS_HASH } = require('../config');
const logger = require('../utils/logger');
const { asyncHandler, MiningError, BlockchainError, NotFoundError, ValidationError } = require('../utils/errors'); // Aggiunti NotFoundError, ValidationError

const router = express.Router();

const validateBlock = [
    body('display_name').isLength({ min: 3, max: 255 }).withMessage('Display name must be between 3 and 255 characters'),
    body('data_text').isLength({ min: 1, max: MAX_DATA_SIZE }).withMessage(`Data text must be between 1 and ${MAX_DATA_SIZE} bytes`),
    body('private_key_pem').contains('-----BEGIN PRIVATE KEY-----').withMessage('Invalid private key format'),
];

// GET /blocks - Recupera blocchi con paginazione e filtri
router.get('/', asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, verified = 'all', sortBy = 'newest' } = req.query;
    const pageSize = parseInt(limit, 10);
    const pageNum = parseInt(page, 10);
    const offset = (pageNum - 1) * pageSize;

    if (isNaN(pageSize) || pageSize <= 0 || isNaN(pageNum) || pageNum <= 0) {
        throw new ValidationError('Invalid pagination parameters');
    }

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (verified !== 'all') {
        whereClause += ` AND verified = $${queryParams.length + 1}`;
        queryParams.push(verified === 'true');
    }

    let orderByClause = 'ORDER BY created_at DESC'; // Default: newest
    if (sortBy === 'oldest') {
        orderByClause = 'ORDER BY created_at ASC';
    } else if (sortBy === 'block_number') {
        orderByClause = 'ORDER BY block_number DESC'; // o ASC a seconda delle preferenze
    }

    // Query per contare il totale
    const totalCountQuery = `SELECT COUNT(*) FROM blockchain.blocks ${whereClause}`;
    const totalResult = await pool.query(totalCountQuery, queryParams);
    const totalCount = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Query per recuperare i blocchi della pagina corrente
    // Aggiunto LEFT JOIN per ottenere creator_name direttamente
    const blocksQuery = `
        SELECT b.*, c.display_name as creator_name
        FROM blockchain.blocks b
        LEFT JOIN blockchain.creators c ON b.creator_id = c.creator_id
        ${whereClause}
        ${orderByClause}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    queryParams.push(pageSize, offset);

    const blocksResult = await pool.query(blocksQuery, queryParams);

     // Converti i buffer e i BigInt in stringhe per JSON
    const blocksForJson = blocksResult.rows.map(block => ({
        ...block,
        // Converte i buffer in esadecimale (o base64 se preferito)
        encrypted_data: block.encrypted_data?.toString('hex'),
        data_iv: block.data_iv?.toString('hex'),
        encrypted_data_key: block.encrypted_data_key?.toString('hex'),
        signature: block.signature?.toString('hex'),
        // Assicura che BigInts siano stringhe
        block_number: block.block_number.toString(),
        nonce: block.nonce.toString()
    }));

    res.json({
        blocks: blocksForJson,
        pagination: {
            totalCount,
            totalPages,
            page: pageNum,
            limit: pageSize,
            hasPrev: pageNum > 1,
            hasNext: pageNum < totalPages
        }
    });
}));


// POST /blocks - Crea e mina un nuovo blocco
router.post('/', validateBlock, asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
    }

    const { display_name, data_text, private_key_pem } = req.body;
    const miningStartTime = Date.now();

    // 1. Trova il Creator
    const creatorResult = await pool.query('SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1 AND is_active = true', [display_name]);
    if (creatorResult.rows.length === 0) {
        throw new NotFoundError('Creator not found or inactive');
    }
    const { creator_id, public_key_pem } = creatorResult.rows[0];

    // 2. Determina previousHash e blockNumber
    const lastBlock = await req.blockchain.getLatestBlock();
    const previousHashForDb = lastBlock ? lastBlock.block_hash : null;
    const previousHashForCalc = lastBlock ? lastBlock.block_hash : GENESIS_HASH;
    const newBlockNumber = lastBlock ? BigInt(lastBlock.block_number) + 1n : 1n;

    logger.info(`Preparing to mine block #${newBlockNumber}. Previous hash (for calc): ...${(previousHashForCalc || 'NULL').slice(-6)}`);

    // 3. Crittografia
    let encryptedData, iv, encryptedAesKey, dataSize;
    try {
        const aesKey = CryptoUtils.generateAESKey();
        iv = CryptoUtils.generateIV();
        const { ciphertext, authTag } = CryptoUtils.encryptData(data_text, aesKey, iv);
        encryptedAesKey = CryptoUtils.encryptAESKeyWithPublicKey(aesKey, public_key_pem);
        encryptedData = Buffer.concat([ciphertext, authTag]);
        dataSize = encryptedData.length + iv.length + encryptedAesKey.length;
    } catch (cryptoError) {
        logger.error("Encryption failed during block creation", { error: cryptoError.message });
        throw new BlockchainError(`Encryption error: ${cryptoError.message}`);
    }

    const createdAt = new Date();
    let nonce = 0n;
    let blockHash;
    let attempts = 0;

    // 4. Proof-of-Work (Mining)
    logger.info(`Starting mining for block #${newBlockNumber}...`);
    do {
        attempts++;
        nonce++;
        const hashInputData = {
            previous_hash: previousHashForCalc,
            encrypted_data: encryptedData,
            data_iv: iv,
            encrypted_data_key: encryptedAesKey,
            nonce: nonce,
            created_at: createdAt,
            creator_id,
            difficulty: DIFFICULTY,
        };
        const hashInputString = CryptoUtils.buildHashInput(hashInputData);
        blockHash = CryptoUtils.calculateHash(hashInputString);

        if ((Date.now() - miningStartTime) > MINING_TIMEOUT_MS) {
            logger.warn(`Mining timeout exceeded after ${attempts} attempts for block #${newBlockNumber}.`);
            throw new MiningError('Mining timeout exceeded');
        }
    } while (!blockHash.startsWith('0'.repeat(DIFFICULTY)));

    const miningDuration = Date.now() - miningStartTime;
    logger.info(`Mining successful for block #${newBlockNumber} after ${attempts} attempts (${miningDuration}ms). Hash: ${blockHash}`);

    // 5. Firma Digitale
    let signature;
    try {
        signature = CryptoUtils.signData(private_key_pem, blockHash);
    } catch (signError) {
        logger.error("Signing failed during block creation", { error: signError.message });
        throw new BlockchainError(`Signing error: ${signError.message}`);
    }

    // 6. Prepara il blocco per l'aggiunta
    const newBlockData = {
        block_id: crypto.randomUUID(), // Genera UUID qui nel backend
        block_number: newBlockNumber.toString(),
        creator_id,
        previous_hash: previousHashForDb,
        block_hash: blockHash,
        nonce: nonce.toString(),
        difficulty: DIFFICULTY,
        encrypted_data: encryptedData,
        data_iv: iv,
        encrypted_data_key: encryptedAesKey,
        data_size: dataSize,
        signature: signature,
        mining_duration_ms: miningDuration,
        created_at: createdAt
    };

    // 7. Aggiungi alla chain locale (DB + memoria) e trasmetti
    const added = await req.blockchain.addBlock(newBlockData);

    if (!added) {
        logger.warn(`Block #${newBlockData.block_number} was mined locally but addBlock returned false. It might already exist.`);
        // Tenta di recuperare il blocco esistente dal DB per restituirlo
        const existingBlockResult = await pool.query('SELECT b.*, c.display_name as creator_name FROM blockchain.blocks b LEFT JOIN blockchain.creators c ON b.creator_id = c.creator_id WHERE block_hash = $1', [blockHash]);
        const existingBlock = existingBlockResult.rows[0];

        return res.status(200).json({
            message: 'Block mined, but it likely already existed in the blockchain.',
            // Restituisci il blocco esistente se trovato, altrimenti quello appena minato
            block: existingBlock ? {
                 ...existingBlock,
                 block_number: existingBlock.block_number.toString(),
                 nonce: existingBlock.nonce.toString(),
                 attempts // Aggiungi comunque i tentativi
                 } : { ...newBlockData, attempts }
        });
    }

    // Se added è true
    req.p2pServer.broadcastBlock(newBlockData);
    logger.info(`Block #${newBlockData.block_number} mined successfully locally, added to chain, and broadcasted.`);

    // Recupera il display_name per includerlo nella risposta
     const creatorName = creatorResult.rows[0].display_name;

    res.status(201).json({
        message: 'Block created, mined, and broadcasted successfully',
        block: {
            ...newBlockData,
            // Converti Buffer in hex per la risposta JSON
            encrypted_data: newBlockData.encrypted_data.toString('hex'),
            data_iv: newBlockData.data_iv.toString('hex'),
            encrypted_data_key: newBlockData.encrypted_data_key.toString('hex'),
            signature: newBlockData.signature.toString('hex'),
            creator_name: creatorName, // Aggiungi creator_name
            attempts
        }
    });
}));


// GET /stats/summary - Statistiche sui blocchi
router.get('/stats/summary', asyncHandler(async (req, res) => {
    const statsQuery = `
        SELECT
            COUNT(*) as total_blocks,
            COUNT(*) FILTER (WHERE verified = TRUE) as verified_blocks,
            COUNT(*) FILTER (WHERE verified = FALSE) as pending_blocks,
            AVG(mining_duration_ms) as avg_mining_time_ms,
            MAX(mining_duration_ms) as max_mining_time_ms,
            AVG(data_size) as avg_data_size,
            AVG(difficulty) as avg_difficulty
        FROM blockchain.blocks
    `; 

    const { rows } = await pool.query(statsQuery);

    const stats = {
        total_blocks: parseInt(rows[0].total_blocks || 0, 10),
        verified_blocks: parseInt(rows[0].verified_blocks || 0, 10),
        pending_blocks: parseInt(rows[0].pending_blocks || 0, 10),
        avg_mining_time_ms: parseFloat(rows[0].avg_mining_time_ms || 0),
        max_mining_time_ms: parseInt(rows[0].max_mining_time_ms || 0, 10),
        avg_data_size: parseFloat(rows[0].avg_data_size || 0),
        avg_difficulty: parseFloat(rows[0].avg_difficulty || 0)
    };
    res.json({ stats });
}));

module.exports = router;