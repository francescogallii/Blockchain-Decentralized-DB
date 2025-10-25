// File: backend/src/routes/blocks.js
const express = require('express');
const crypto = require('crypto'); // Import crypto module
const { body, validationResult, param } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const { DIFFICULTY, MINING_TIMEOUT_MS, MAX_DATA_SIZE, GENESIS_HASH } = require('../config');
const logger = require('../utils/logger');
const { asyncHandler, MiningError, BlockchainError, NotFoundError, ValidationError } = require('../utils/errors');

const router = express.Router();

// Validazione per la preparazione del mining
const validatePrepareMining = [
    body('display_name').isLength({ min: 3, max: 255 }).withMessage('Display name must be between 3 and 255 characters'),
    body('data_text').isLength({ min: 1, max: MAX_DATA_SIZE }).withMessage(`Data text must be between 1 and ${MAX_DATA_SIZE} bytes`),
];

// Validazione per il commit del blocco (ricevuto dal frontend)
const validateCommitBlock = [
    body('creator_id').isUUID().withMessage('Invalid Creator ID'),
    body('previous_hash').optional({ nullable: true }).isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Invalid Previous Hash format'),
    body('block_hash').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Invalid Block Hash format'),
    body('nonce').isString().withMessage('Nonce must be a string representing a BigInt'), // Nonce is BigInt -> String
    body('difficulty').isInt({ min: 1 }).withMessage('Invalid Difficulty'),
    body('encrypted_data_hex').isHexadecimal().withMessage('Invalid Encrypted Data format'),
    body('data_iv_hex').isHexadecimal().isLength({ min: 32, max: 32 }).withMessage('Invalid IV format'), // AES-GCM IV is 16 bytes (32 hex chars)
    body('encrypted_data_key_hex').isHexadecimal().withMessage('Invalid Encrypted AES Key format'),
    body('data_size').isInt({ min: 1 }).withMessage('Invalid Data Size'),
    body('signature_hex').isHexadecimal().withMessage('Invalid Signature format'),
    body('created_at_iso').isISO8601().withMessage('Invalid Created At timestamp'),
    body('mining_duration_ms').isInt({ min: 0 }).withMessage('Invalid Mining Duration')
];


// GET /blocks - Recupera blocchi con paginazione e filtri (Invariato)
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
    const blocksQuery = `
        SELECT b.block_id, b.block_number, b.creator_id, c.display_name as creator_name,
               b.previous_hash, b.block_hash, b.nonce, b.difficulty,
               b.data_size, b.created_at, b.verified, b.verified_at,
               b.mining_duration_ms,
               encode(b.encrypted_data, 'hex') as encrypted_data_hex,
               encode(b.data_iv, 'hex') as data_iv_hex,
               encode(b.encrypted_data_key, 'hex') as encrypted_data_key_hex,
               encode(b.signature, 'hex') as signature_hex
        FROM blockchain.blocks b
        LEFT JOIN blockchain.creators c ON b.creator_id = c.creator_id
        ${whereClause}
        ${orderByClause}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    queryParams.push(pageSize, offset);

    const blocksResult = await pool.query(blocksQuery, queryParams);

     // Converti i BigInt (block_number, nonce) in stringhe se necessario (pg li restituisce già come stringhe di solito)
     const blocksForJson = blocksResult.rows.map(block => ({
        ...block,
        block_number: block.block_number?.toString(), // Assicura che sia stringa
        nonce: block.nonce?.toString() // Assicura che sia stringa
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


// ** NUOVA ROTTA: Step 1 del Mining - Preparazione **
// POST /blocks/prepare-mining
router.post('/prepare-mining', validatePrepareMining, asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed for mining preparation', errors.array());
    }

    const { display_name, data_text } = req.body; // Solo nome e dati grezzi

    // 1. Trova il Creator e la sua chiave pubblica
    const creatorResult = await pool.query(
        'SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1 AND is_active = true',
        [display_name]
    );
    if (creatorResult.rows.length === 0) {
        throw new NotFoundError('Creator not found or inactive');
    }
    const { creator_id, public_key_pem } = creatorResult.rows[0];

    // 2. Determina previousHash
    const lastBlock = await req.blockchain.getLatestBlock();
    const previousHashForCalc = lastBlock ? lastBlock.block_hash : GENESIS_HASH;

    logger.info(`Preparing mining for creator ${display_name}. Sending public key and previous hash.`);

    // 3. Invia la chiave pubblica e le info necessarie al frontend
    res.json({
        creator_id: creator_id,
        public_key_pem: public_key_pem,
        previous_hash: previousHashForCalc,
        difficulty: DIFFICULTY,
        // data_text non viene rimandato indietro, il frontend ce l'ha già
    });
}));


// ** NUOVA ROTTA: Step 2 del Mining - Commit del Blocco Minato dal Frontend **
// POST /blocks/commit
router.post('/commit', validateCommitBlock, asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed for block commit', errors.array());
    }

    const {
        creator_id,
        previous_hash, // Hash usato per il calcolo (potrebbe essere GENESIS_HASH)
        block_hash,
        nonce,
        difficulty,
        encrypted_data_hex,
        data_iv_hex,
        encrypted_data_key_hex,
        data_size,
        signature_hex,
        created_at_iso,
        mining_duration_ms
    } = req.body;

    logger.info(`Received commit request for block hash: ...${block_hash.slice(-6)}`);

    // 1. Verifica l'esistenza del creator e recupera la chiave pubblica
    const creatorResult = await pool.query(
        'SELECT public_key_pem FROM blockchain.creators WHERE creator_id = $1 AND is_active = true',
        [creator_id]
    );
    if (creatorResult.rows.length === 0) {
        throw new NotFoundError('Creator specified in the block not found or inactive');
    }
    const { public_key_pem } = creatorResult.rows[0];

    // 2. Verifica la firma digitale (Backend verification)
    const signature = Buffer.from(signature_hex, 'hex');
    const isSignatureValid = CryptoUtils.verifySignature(public_key_pem, block_hash, signature);
    if (!isSignatureValid) {
        logger.warn(`Invalid signature received for block hash: ...${block_hash.slice(-6)}`);
        throw new BlockchainError('Invalid digital signature for the submitted block');
    }
    logger.info(`Signature verified successfully for block hash: ...${block_hash.slice(-6)}`);

    // 3. Verifica Proof-of-Work
    const requiredPrefix = '0'.repeat(difficulty);
    if (!block_hash.startsWith(requiredPrefix)) {
        logger.warn(`Proof-of-Work failed for submitted block hash: ...${block_hash.slice(-6)}`);
        throw new BlockchainError('Proof-of-Work validation failed');
    }

    // 4. Determina previousHash per DB (potrebbe essere NULL per il genesis)
    const lastBlock = await req.blockchain.getLatestBlock();
    const previousHashForDb = lastBlock ? lastBlock.block_hash : null;
    const newBlockNumber = lastBlock ? BigInt(lastBlock.block_number) + 1n : 1n;

    // 5. Prepara i dati per l'inserimento nel DB (converti hex in Buffer)
    const newBlockData = {
        block_id: crypto.randomUUID(), // Genera UUID nel backend
        block_number: newBlockNumber.toString(),
        creator_id,
        previous_hash: previousHashForDb, // Usa quello determinato qui
        block_hash,
        nonce: nonce.toString(), // Salva come stringa
        difficulty,
        encrypted_data: Buffer.from(encrypted_data_hex, 'hex'),
        data_iv: Buffer.from(data_iv_hex, 'hex'),
        encrypted_data_key: Buffer.from(encrypted_data_key_hex, 'hex'),
        data_size,
        signature, // Usa il buffer della firma verificata
        mining_duration_ms,
        created_at: new Date(created_at_iso) // Converti ISO string in Date
    };

    // 6. Aggiungi alla chain locale (DB + memoria) e trasmetti
    const added = await req.blockchain.addBlock(newBlockData);

    if (!added) {
        logger.warn(`Block commit failed for hash ...${block_hash.slice(-6)}. It might already exist or DB insertion failed.`);
        // Tenta di recuperare il blocco esistente dal DB per restituirlo
        const existingBlockResult = await pool.query('SELECT b.*, c.display_name as creator_name FROM blockchain.blocks b LEFT JOIN blockchain.creators c ON b.creator_id = c.creator_id WHERE block_hash = $1', [block_hash]);
        const existingBlock = existingBlockResult.rows[0];

        return res.status(200).json({
            message: 'Block mined, but it likely already existed in the blockchain.',
             // Restituisci il blocco esistente se trovato, altrimenti quello appena minato
             block: existingBlock ? {
                ...existingBlock,
                block_number: existingBlock.block_number.toString(),
                nonce: existingBlock.nonce.toString()
                } : { ...newBlockData,
                     // Converti Buffer in hex per la risposta JSON di fallback
                    encrypted_data: newBlockData.encrypted_data.toString('hex'),
                    data_iv: newBlockData.data_iv.toString('hex'),
                    encrypted_data_key: newBlockData.encrypted_data_key.toString('hex'),
                    signature: newBlockData.signature.toString('hex'),
                 }
        });
    }

     // Se added è true
     req.p2pServer.broadcastBlock(newBlockData); // Trasmetti il blocco ai peer
     logger.info(`Block #${newBlockData.block_number} committed successfully, added to chain, and broadcasted.`);

     // Recupera il display_name per includerlo nella risposta
     const committedCreatorResult = await pool.query('SELECT display_name FROM blockchain.creators WHERE creator_id = $1', [creator_id]);
     const creatorName = committedCreatorResult.rows.length > 0 ? committedCreatorResult.rows[0].display_name : 'Unknown';


    res.status(201).json({
        message: 'Block committed and broadcasted successfully',
        block: {
            ...newBlockData,
             // Converti Buffer in hex per la risposta JSON
            encrypted_data: newBlockData.encrypted_data.toString('hex'),
            data_iv: newBlockData.data_iv.toString('hex'),
            encrypted_data_key: newBlockData.encrypted_data_key.toString('hex'),
            signature: newBlockData.signature.toString('hex'),
            creator_name: creatorName, // Aggiungi creator_name
            // attempts: req.body.attempts // Se il frontend invia anche i tentativi
        }
    });
}));


// GET /stats/summary - Statistiche sui blocchi (Invariato)
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