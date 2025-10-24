const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { PORT, NODE_ENV, DIFFICULTY, MINING_TIMEOUT_MS } = require('./config');
const { initDb, pool } = require('./database/db');

// Servizi decentralizzati
const P2pServer = require('./services/p2p');
const Blockchain = require('./services/blockchain');
const { startVerifier } = require('./services/verifier'); 

const creatorsRoutes = require('./routes/creators');
const blocksRoutes = require('./routes/blocks');
const decryptRoutes = require('./routes/decrypt');
const logger = require('./utils/logger'); // L'importazione ora Ã¨ corretta
const { globalErrorHandler } = require('./utils/errors');

const app = express();

const blockchain = new Blockchain();
const p2pServer = new P2pServer(blockchain);

// Middleware
app.use(helmet());
app.use(compression());

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

const miningLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use(bodyParser.json({ limit: '2mb' }));
app.use(cors({ origin: ['http://localhost', 'http://localhost:5173', 'http://nginx', 'http://node1'], credentials: true }));

// Inietta le istanze di blockchain e p2pServer nella richiesta per le rotte
app.use((req, res, next) => {
  req.blockchain = blockchain;
  req.p2pServer = p2pServer;
  next();
});

// API routes - Nginx inoltra a queste rotte (senza il prefisso /api)
app.use('/creators', creatorsRoutes);
app.use('/blocks', miningLimiter, blocksRoutes);
app.use('/decrypt', decryptRoutes);

// Health Check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'healthy', 
      database: 'connected', 
      blocks: blockchain.chain.length,
      p2p_peers: p2pServer.sockets.length
    });
  } catch (error) {
    logger.error('Health check failed to connect to DB', { dbError: error.message });
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.use(globalErrorHandler);

// Main startup function
let server;
async function main() {
    try {
        logger.info(`Starting Blockchain Node (API Port: ${PORT}, P2P Port: ${process.env.P2P_PORT})...`); 
        
        await initDb();
        logger.info('Database schema is ready.');
        
        await blockchain.loadChainFromDB();

        // Avvia il servizio Verifier su tutti i nodi
        const verifier = startVerifier(pool, { 
            difficulty: DIFFICULTY, 
            intervalMs: 60000 // Verifica ogni minuto
        });

        server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`API server for node listening on http://0.0.0.0:${PORT}`);
        });

        // CORREZIONE: p2pServer.listen() non richiede l'istanza del server
        // Avvia il server P2P separato sulla sua porta (es. 6001)
        p2pServer.listen();
        
    } catch (err) {
        logger.error('Failed to start node', { error: err.message, stack: err.stack }); 
        process.exit(1);
    }
}

main();