const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/db');
const CryptoUtils = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

const router = express.Router();

// Validation middleware for creator registration
const validateCreator = [
  body('display_name')
    .isLength({ min: 3, max: 255 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Display name must be 3-255 characters, alphanumeric with _ and -'),
  body('public_key_pem')
    .isLength({ min: 100 })
    .contains('-----BEGIN PUBLIC KEY-----')
    .contains('-----END PUBLIC KEY-----')
    .withMessage('Invalid RSA public key PEM format')
];

// GET /api/creators - List all active creators
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        creator_id,
        display_name,
        key_algorithm,
        key_size,
        created_at,
        (SELECT COUNT(*) FROM blockchain.blocks WHERE creator_id = c.creator_id) as block_count
      FROM blockchain.creators c
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = 'SELECT COUNT(*) FROM blockchain.creators WHERE is_active = true';

    const [result, countResult] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      creators: result.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

    // Audit log
    await pool.query(`
      INSERT INTO audit.block_events (event_type, client_ip, event_data)
      VALUES ($1, $2, $3)
    `, [
      'CREATORS_LISTED',
      req.ip,
      JSON.stringify({ page, limit, totalCount })
    ]);

  } catch (error) {
    logger.error('Error fetching creators', { 
      error: error.message,
      ip: req.ip 
    });
    res.status(500).json({ 
      error: 'Failed to fetch creators',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/creators - Register new creator
router.post('/', validateCreator, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { display_name, public_key_pem } = req.body;

  try {
    // Validate RSA public key
    const keyValidation = CryptoUtils.validatePublicKeyPem(public_key_pem);
    if (!keyValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid RSA public key',
        details: keyValidation.error 
      });
    }

    if (keyValidation.keySize < 2048) {
      return res.status(400).json({ 
        error: 'RSA key size must be at least 2048 bits',
        provided: keyValidation.keySize 
      });
    }

    // Check for duplicate display name
    const existingCreator = await pool.query(
      'SELECT creator_id FROM blockchain.creators WHERE display_name = $1',
      [display_name]
    );

    if (existingCreator.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Display name already exists',
        display_name 
      });
    }

    // Check for duplicate public key
    const existingKey = await pool.query(
      'SELECT creator_id FROM blockchain.creators WHERE public_key_pem = $1',
      [public_key_pem]
    );

    if (existingKey.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Public key already registered' 
      });
    }

    // Insert new creator
    const insertQuery = `
      INSERT INTO blockchain.creators (
        display_name, 
        public_key_pem, 
        key_algorithm, 
        key_size
      ) VALUES ($1, $2, $3, $4)
      RETURNING creator_id, display_name, key_algorithm, key_size, created_at
    `;

    const result = await pool.query(insertQuery, [
      display_name,
      public_key_pem,
      keyValidation.keyType || 'RSA-OAEP',
      keyValidation.keySize
    ]);

    const newCreator = result.rows[0];

    // Audit log
    await pool.query(`
      INSERT INTO audit.block_events (event_type, creator_id, client_ip, event_data)
      VALUES ($1, $2, $3, $4)
    `, [
      'CREATOR_REGISTERED',
      newCreator.creator_id,
      req.ip,
      JSON.stringify({ 
        display_name,
        key_size: keyValidation.keySize,
        key_algorithm: keyValidation.keyType 
      })
    ]);

    logger.info('New creator registered', {
      creator_id: newCreator.creator_id,
      display_name,
      key_size: keyValidation.keySize,
      ip: req.ip
    });

    res.status(201).json({
      message: 'Creator registered successfully',
      creator: {
        creator_id: newCreator.creator_id,
        display_name: newCreator.display_name,
        key_algorithm: newCreator.key_algorithm,
        key_size: newCreator.key_size,
        created_at: newCreator.created_at
      }
    });

  } catch (error) {
    logger.error('Error registering creator', { 
      error: error.message,
      display_name,
      ip: req.ip 
    });

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ 
        error: 'Creator with this name or key already exists' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to register creator',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/creators/:id - Get specific creator details
router.get('/:id', async (req, res) => {
  try {
    const creatorId = req.params.id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(creatorId)) {
      return res.status(400).json({ error: 'Invalid creator ID format' });
    }

    const query = `
      SELECT 
        c.creator_id,
        c.display_name,
        c.key_algorithm,
        c.key_size,
        c.created_at,
        COUNT(b.block_id) as total_blocks,
        COUNT(b.block_id) FILTER (WHERE b.verified = true) as verified_blocks,
        SUM(b.data_size) as total_data_size,
        AVG(b.mining_duration_ms) as avg_mining_time,
        MAX(b.created_at) as last_block_created
      FROM blockchain.creators c
      LEFT JOIN blockchain.blocks b ON c.creator_id = b.creator_id
      WHERE c.creator_id = $1 AND c.is_active = true
      GROUP BY c.creator_id, c.display_name, c.key_algorithm, c.key_size, c.created_at
    `;

    const result = await pool.query(query, [creatorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const creator = result.rows[0];

    // Convert bigint values to numbers for JSON serialization
    creator.total_blocks = parseInt(creator.total_blocks);
    creator.verified_blocks = parseInt(creator.verified_blocks);
    creator.total_data_size = creator.total_data_size ? parseInt(creator.total_data_size) : 0;
    creator.avg_mining_time = creator.avg_mining_time ? Math.round(creator.avg_mining_time) : null;

    res.json({ creator });

  } catch (error) {
    logger.error('Error fetching creator details', { 
      error: error.message,
      creator_id: req.params.id,
      ip: req.ip 
    });
    res.status(500).json({ 
      error: 'Failed to fetch creator details',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/creators/stats - Get creators statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_creators,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as new_today,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week,
        AVG(key_size) as avg_key_size
      FROM blockchain.creators
      WHERE is_active = true
    `;

    const topCreatorsQuery = `
      SELECT 
        c.display_name,
        COUNT(b.block_id) as block_count,
        SUM(b.data_size) as total_data_size
      FROM blockchain.creators c
      LEFT JOIN blockchain.blocks b ON c.creator_id = b.creator_id
      WHERE c.is_active = true
      GROUP BY c.creator_id, c.display_name
      ORDER BY block_count DESC
      LIMIT 10
    `;

    const [statsResult, topCreatorsResult] = await Promise.all([
      pool.query(query),
      pool.query(topCreatorsQuery)
    ]);

    const stats = statsResult.rows[0];
    stats.total_creators = parseInt(stats.total_creators);
    stats.new_today = parseInt(stats.new_today);
    stats.new_this_week = parseInt(stats.new_this_week);
    stats.avg_key_size = stats.avg_key_size ? Math.round(stats.avg_key_size) : null;

    const topCreators = topCreatorsResult.rows.map(creator => ({
      ...creator,
      block_count: parseInt(creator.block_count),
      total_data_size: creator.total_data_size ? parseInt(creator.total_data_size) : 0
    }));

    res.json({
      stats,
      top_creators: topCreators
    });

  } catch (error) {
    logger.error('Error fetching creator statistics', { 
      error: error.message,
      ip: req.ip 
    });
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
