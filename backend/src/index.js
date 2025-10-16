const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { PORT, NODE_ENV, DIFFICULTY } = require('./config');
const { initDb, pool } = require('./database/db');

// Servizi decentralizzati
const P2pServer = require('./services/p2p');
const Blockchain = require('./services/blockchain');

const creatorsRoutes = require('./routes/creators');
const blocksRoutes = require('./routes/blocks');
const decryptRoutes = require('./routes/decrypt');
const logger = require('./utils/logger');
const { globalErrorHandler } = require('./utils/errors');

const app = express();

const blockchain = new Blockchain();
const p2pServer = new P2pServer(blockchain, pool);

// Middleware
app.use(helmet());
app.use(compression());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

const miningLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use(bodyParser.json({ limit: '2mb' }));
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));

app.use((req, res, next) => {
  req.blockchain = blockchain;
  req.p2pServer = p2pServer;
  next();
});

// API routes
app.use('/api/creators', creatorsRoutes);
app.use('/api/blocks', miningLimiter, blocksRoutes);
app.use('/api/decrypt', decryptRoutes);

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'healthy', database: 'connected', blocks: blockchain.chain.length });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.use(globalErrorHandler);

// Main startup
let server;
async function main() {
  try {
    logger.info('Starting Blockchain Node...');
    await initDb();
    logger.info('Database schema is ready.');
    await blockchain.loadChainFromDB();

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`API server for node running on http://localhost:${PORT}`);
    });

    p2pServer.listen();
  } catch (err) {
    logger.error('Failed to start node', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

main();
