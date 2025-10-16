require('dotenv').config();

const config = {
  PORT: parseInt(process.env.PORT, 10) || 4001,
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres-primary:5432/blockchain_db',
  DIFFICULTY: parseInt(process.env.DIFFICULTY, 10) || 4,
  MINING_TIMEOUT_MS: parseInt(process.env.MINING_TIMEOUT_MS, 10) || 120000,
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Security settings
  BCRYPT_ROUNDS: 12,
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Mining settings
  MAX_NONCE: Number.MAX_SAFE_INTEGER,
  GENESIS_HASH: '0'.repeat(64),
  
  // Logging settings
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Validation settings
  MAX_DATA_SIZE: 1024 * 1024, // 1MB
  MIN_NICKNAME_LENGTH: 3,
  MAX_NICKNAME_LENGTH: 255
};

// Validate configuration
if (config.DIFFICULTY < 1 || config.DIFFICULTY > 8) {
  throw new Error('DIFFICULTY must be between 1 and 8');
}

if (config.MINING_TIMEOUT_MS < 10000) {
  throw new Error('MINING_TIMEOUT_MS must be at least 10000ms (10 seconds)');
}

module.exports = config;
