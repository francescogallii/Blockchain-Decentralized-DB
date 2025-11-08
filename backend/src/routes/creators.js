const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');
const { asyncHandler, ConflictError, ValidationError, NotFoundError } = require('../utils/errors');

const router = express.Router();

const validateCreator = [
    body('display_name').isLength({ min: 3, max: 255 }).matches(/^[a-zA-Z0-9_-]+$/).withMessage('Display name must be between 3 and 255 characters and contain only letters, numbers, underscores, or hyphens'),
    body('public_key_pem').contains('-----BEGIN PUBLIC KEY-----').withMessage('Invalid public key format'),
];

// GET /creators - Lista creators attivi
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT
            c.creator_id,
            c.display_name,
            c.key_size,
            c.key_algorithm,
            c.created_at,
            (SELECT COUNT(*) FROM blockchain.blocks b WHERE b.creator_id = c.creator_id) as block_count
        FROM blockchain.creators c
        WHERE c.is_active = true
        ORDER BY c.created_at DESC
    `);
    res.json({ creators: rows });
}));

// POST /creators - Registra nuovo creator
router.post('/', validateCreator, asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
    }

    const { display_name, public_key_pem } = req.body;

    // Validazione avanzata della chiave pubblica
    const keyValidation = CryptoUtils.validatePublicKeyPem(public_key_pem);
    if (!keyValidation.valid) {
        throw new ValidationError('Invalid RSA public key', keyValidation.error);
    }

    try {
        const insertQuery = `
            INSERT INTO blockchain.creators (display_name, public_key_pem, key_algorithm, key_size)
            VALUES ($1, $2, $3, $4)
            RETURNING creator_id, display_name, key_algorithm, key_size, created_at`;

        const { rows } = await pool.query(insertQuery, [
            display_name,
            public_key_pem,
            keyValidation.keyType || 'RSA-OAEP', // Usa il tipo validato
            keyValidation.keySize // Usa la dimensione validata
        ]);

        logger.info('New creator registered', { creatorId: rows[0].creator_id, displayName: display_name });
        res.status(201).json({ message: 'Creator registered successfully', creator: rows[0] });
    } catch (e) {
        if (e.code === '23505') { // PostgreSQL unique violation for display_name
            logger.warn('Attempted to register duplicate creator display name', { displayName: display_name });
            throw new ConflictError('Display name already taken');
        }
        logger.error('Error registering creator', { error: e.message, stack: e.stack });
        throw e; // Rilancia l'errore per il gestore globale
    }
}));

// GET /creators/:display_name/public-key - Recupera chiave pubblica per verifica frontend
router.get(
    '/:display_name/public-key',
    [
        param('display_name').isLength({ min: 3, max: 255 }).matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid display name format')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ValidationError('Invalid display name parameter', errors.array());
        }

        const { display_name } = req.params;

        const { rows } = await pool.query(
            'SELECT creator_id, public_key_pem FROM blockchain.creators WHERE display_name = $1 AND is_active = true',
            [display_name]
        );

        if (rows.length === 0) {
            throw new NotFoundError('Creator not found or inactive');
        }

        res.json({
            creator_id: rows[0].creator_id,
            public_key_pem: rows[0].public_key_pem
        });
    })
);


// GET /creators/stats/summary - Statistiche sui creators
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

    const stats = {
        total_creators: parseInt(rows[0].total_creators || 0, 10),
        // Converti total_key_size da stringa (potenziale BigInt) a numero
        total_key_size: Number(rows[0].total_key_size || 0),
        avg_key_size: parseFloat(rows[0].avg_key_size || 0)
    };

    res.json({ stats });
}));

module.exports = router;