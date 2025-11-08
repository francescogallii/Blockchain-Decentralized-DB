const express = require('express');
const { param, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const logger = require('../utils/logger');
const { asyncHandler, ValidationError, NotFoundError } = require('../utils/errors'); 

const router = express.Router();

// ** ROTTA ORIGINALE POST /decrypt RIMOSSA **
// La verifica della chiave e la decifrazione avvengono ora nel frontend.
// Il frontend userà prima l'endpoint GET /creators/:display_name/public-key per la verifica.

// ** NUOVA ROTTA: GET /decrypt/blocks/:creator_id **
// Restituisce i blocchi crittografati per un creator specificato.
// Il frontend chiamerà questa rotta DOPO aver verificato la corrispondenza
// della chiave privata fornita dall'utente con la chiave pubblica ottenuta
// da GET /creators/:display_name/public-key
router.get(
    '/blocks/:creator_id',
    [
        param('creator_id').isUUID().withMessage('Invalid Creator ID format')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw new ValidationError('Invalid creator ID parameter', errors.array());
        }

        const { creator_id } = req.params;

        // Recupera le informazioni del creator per conferma e per il nome nella risposta
        const creatorResult = await pool.query(
            'SELECT display_name FROM blockchain.creators WHERE creator_id = $1 AND is_active = true',
            [creator_id]
        );

        if (creatorResult.rows.length === 0) {
            throw new NotFoundError('Creator not found or inactive');
        }
        const displayName = creatorResult.rows[0].display_name;

        logger.info(`Fetching encrypted blocks for creator ${displayName} (ID: ${creator_id})`);

        // Recupera tutti i blocchi crittografati per quel creator, ordinati
        // Seleziona i campi necessari per la decifratura frontend
        const blocksResult = await pool.query(
            `SELECT
                block_id,
                block_number,
                block_hash,
                created_at,
                encode(encrypted_data, 'base64') as encrypted_data_b64, -- Invia in base64 per facilitare il frontend
                encode(data_iv, 'base64') as data_iv_b64,
                encode(encrypted_data_key, 'base64') as encrypted_data_key_b64,
                data_size,
                verified
             FROM blockchain.blocks
             WHERE creator_id = $1
             ORDER BY block_number ASC`,
            [creator_id]
        );

        const blocks = blocksResult.rows.map(block => ({
            ...block,
            block_number: block.block_number.toString(), // Assicura stringa
        }));

        logger.info(`Found ${blocks.length} blocks for creator ${displayName}`);

        res.json({
            creator_id: creator_id,
            display_name: displayName,
            blocks: blocks // Invia i blocchi crittografati (con dati in base64)
        });
    })
);

module.exports = router;