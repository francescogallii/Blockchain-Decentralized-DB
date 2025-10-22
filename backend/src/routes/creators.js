const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils'); // Percorso corretto
const logger = require('../utils/logger');
const { asyncHandler, ConflictError, ValidationError } = require('../utils/errors');

const router = express.Router();

const validateCreator = [
	body('display_name').isLength({ min: 3, max: 255 }).matches(/^[a-zA-Z0-9_-]+$/),
	body('public_key_pem').contains('-----BEGIN PUBLIC KEY-----'),
];

router.get('/', asyncHandler(async (req, res) => {
	const { rows } = await pool.query(`
		SELECT 
			creator_id, 
			display_name, 
			key_size, 
			key_algorithm,
			created_at, 
			(SELECT COUNT(*) FROM blockchain.blocks WHERE creator_id = c.creator_id) as block_count 
		FROM blockchain.creators c 
		WHERE is_active = true 
		ORDER BY created_at DESC
	`);
	res.json({ creators: rows });
}));

router.post('/', validateCreator, asyncHandler(async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ error: 'Validation failed', details: errors.array() });
	}

	const { display_name, public_key_pem } = req.body;
	
	// Validazione avanzata della chiave pubblica
	const keyValidation = CryptoUtils.validatePublicKeyPem(public_key_pem);
	if (!keyValidation.valid) {
		return res.status(400).json({ error: 'Invalid RSA public key', details: keyValidation.error });
	}

	try {
		const insertQuery = `
			INSERT INTO blockchain.creators (display_name, public_key_pem, key_algorithm, key_size) 
			VALUES ($1, $2, $3, $4) 
			RETURNING creator_id, display_name, key_algorithm, key_size, created_at`;
		
		const { rows } = await pool.query(insertQuery, [
			display_name,
			public_key_pem,
			keyValidation.keyType || 'RSA-OAEP',
			keyValidation.keySize
		]);

		res.status(201).json({ message: 'Creator registered successfully', creator: rows[0] });
	} catch (e) {
		if (e.code === '23505') { // PostgreSQL unique violation for display_name
			throw new ConflictError('Display name already taken');
		}
		throw e;
	}
}));

// Aggiunto per ottenere statistiche per la dashboard
router.get('/stats/summary', asyncHandler(async (req, res) => {
	const statsQuery = `
		SELECT
			COUNT(*) as total_creators,
			SUM(key_size) as total_key_size,
			AVG(key_size) as avg_key_size
		FROM blockchain.creators
		WHERE is_active = TRUE;
	`;

	const { rows } = await pool.query(statsQuery);

	res.json({ stats: rows[0] });
}));

module.exports = router;