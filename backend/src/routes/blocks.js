const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const { DIFFICULTY, MINING_TIMEOUT_MS, MAX_DATA_SIZE, GENESIS_HASH } = require('../config');
const logger = require('../utils/logger');
const { asyncHandler, MiningError, BlockchainError } = require('../utils/errors'); // Aggiunto BlockchainError

const router = express.Router();

const validateBlock = [
	body('display_name').isLength({ min: 3, max: 255 }),
	body('data_text').isLength({ min: 1, max: MAX_DATA_SIZE }),
	body('private_key_pem').contains('-----BEGIN PRIVATE KEY-----'),
];

// Riscritto per usare la catena in memoria
router.get('/', asyncHandler(async (req, res) => {
	const { page = 1, limit = 10, verified = 'all', sortBy = 'newest' } = req.query;
	const pageSize = parseInt(limit);
	const pageNum = parseInt(page);
	
	let filteredChain = req.blockchain.chain;
	
	if (verified !== 'all') {
		const verifiedBool = verified === 'true';
		filteredChain = filteredChain.filter(b => b.verified === verifiedBool);
	}
	
	// Ordinamento
	const sortedChain = [...filteredChain];
	if (sortBy === 'oldest') {
		sortedChain.sort((a, b) => a.block_number - b.block_number);
	} else { // 'newest' (default)
		sortedChain.sort((a, b) => b.block_number - a.block_number);
	}

	const totalCount = sortedChain.length;
	const totalPages = Math.ceil(totalCount / pageSize);
	const start = (pageNum - 1) * pageSize;
	const end = start + pageSize;
	const blocks = sortedChain.slice(start, end);

	res.json({
		blocks: blocks,
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


router.post('/', validateBlock, asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ error: 'Validation failed', details: errors.array() });
	}

	const { display_name, data_text, private_key_pem } = req.body;
	const miningStartTime = Date.now();

	const creatorResult = await pool.query('SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1 AND is_active = true', [display_name]);
	if (creatorResult.rows.length === 0) {
		return res.status(404).json({ error: 'Creator not found or inactive' });
	}
	const { creator_id, public_key_pem } = creatorResult.rows[0];
	
	// 1. Dati del blocco
	const lastBlock = await req.blockchain.getLatestBlock();
	const previousHash = lastBlock ? lastBlock.block_hash : GENESIS_HASH;
	const newBlockNumber = lastBlock ? BigInt(lastBlock.block_number) + 1n : 1n; // Usa BigInt per sicurezza

	// 2. Crittografia
	// NB: L'algoritmo AES-256-GCM è sicuro, ma la chiave AES deve essere gestita in Buffer prima
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

	// 3. Proof-of-Work (Mining)
	logger.info(`Starting mining for new block #${newBlockNumber}...`);
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
		// Ricalcola l'hash con il nuovo nonce
		blockHash = CryptoUtils.calculateHash(CryptoUtils.buildHashInput(hashInputData)); 
		
		if ((Date.now() - miningStartTime) > MINING_TIMEOUT_MS) {
			logger.warn(`Mining timeout exceeded after ${attempts} attempts.`);
			throw new MiningError('Mining timeout exceeded');
		}
	} while (!blockHash.startsWith('0'.repeat(DIFFICULTY)));

	const miningDuration = Date.now() - miningStartTime;

	// 4. Firma Digitale
	const signature = CryptoUtils.signData(private_key_pem, blockHash);

	// 5. Salva blocco nel DB
	const insertQuery = `
		INSERT INTO blockchain.blocks (block_number, creator_id, previous_hash, block_hash, nonce, difficulty, encrypted_data, data_iv, encrypted_data_key, data_size, signature, mining_duration_ms, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING *`;

	const insertResult = await pool.query(insertQuery, [
		newBlockNumber.toString(), creator_id, previousHash, blockHash, nonce.toString(), DIFFICULTY, encryptedData,
		iv, encryptedAesKey, dataSize, signature, miningDuration, createdAt
	]);

	const newBlock = insertResult.rows[0];
	
	// 6. Aggiungi alla chain locale e trasmetti agli altri nodi
	const added = await req.blockchain.addBlock(newBlock);
	if (!added) {
		throw new BlockchainError('Block was mined but could not be added to the local chain or already exists.');
	}

	req.p2pServer.broadcastBlock(newBlock);
	logger.info(`Block #${newBlock.block_number} mined successfully in ${miningDuration}ms. Broadcasting to network...`);

	res.status(201).json({ 
		message: 'Block created and broadcasted', 
		block: { 
			...newBlock, 
			block_number: newBlockNumber.toString(), // Per il frontend 
			attempts,
			difficulty: DIFFICULTY
		} 
	});
}));

// Aggiunto per ottenere statistiche per la dashboard
router.get('/stats/summary', asyncHandler(async (req, res) => {
	const statsQuery = `
		SELECT
			COUNT(*) as total_blocks,
			COUNT(*) FILTER (WHERE verified = TRUE) as verified_blocks,
			COUNT(*) FILTER (WHERE verified = FALSE) as pending_blocks,
			AVG(mining_duration_ms) as avg_mining_time_ms,
			MAX(mining_duration_ms) as max_mining_time_ms,
			AVG(data_size) as avg_data_size
		FROM blockchain.blocks;
	`;

	const { rows } = await pool.query(statsQuery);

	res.json({ stats: rows[0] });
}));


module.exports = router;