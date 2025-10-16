const winston = require('winston');
const path = require('path');
const { LOG_LEVEL, NODE_ENV } = require('../config');

// Define custom log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'magenta'
};

// Custom format function
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create transports array
const transports = [];

// Console transport for development
if (NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      level: LOG_LEVEL,
      format: winston.format.combine(
        winston.format.colorize({ colors: logColors }),
        winston.format.simple(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let logMessage = `${timestamp} ${level}: ${message}`;
          
          if (Object.keys(meta).length > 0) {
            logMessage += ` ${JSON.stringify(meta, null, 2)}`;
          }
          
          return logMessage;
        })
      )
    })
  );
}

// File transports for production
if (NODE_ENV === 'production') {
  // General log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/app.log'),
      level: 'info',
      format: customFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  // Security log file for audit events
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/security.log'),
      level: 'warn',
      format: customFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: LOG_LEVEL,
  format: customFormat,
  transports,
  exitOnError: false,
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/exceptions.log')
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/rejections.log')
    })
  ]
});

// Add colors to winston
winston.addColors(logColors);

// Create specialized loggers for different contexts
const createContextLogger = (context) => {
  return {
    error: (message, meta = {}) => logger.error(message, { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
    trace: (message, meta = {}) => logger.log('trace', message, { context, ...meta })
  };
};

// Security logger for sensitive operations
const securityLogger = {
  logSecurityEvent: (event, details = {}) => {
    logger.warn(`SECURITY: ${event}`, {
      context: 'SECURITY',
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  },
  
  logFailedAuth: (attempt, details = {}) => {
    logger.warn(`FAILED_AUTH: ${attempt}`, {
      context: 'SECURITY',
      event: 'FAILED_AUTH',
      attempt,
      timestamp: new Date().toISOString(),
      ...details
    });
  },
  
  logCryptoOperation: (operation, success, details = {}) => {
    logger.info(`CRYPTO: ${operation} - ${success ? 'SUCCESS' : 'FAILURE'}`, {
      context: 'CRYPTO',
      operation,
      success,
      timestamp: new Date().toISOString(),
      ...details
    });
  }
};

// Performance logger
const performanceLogger = {
  logDatabaseQuery: (query, duration, rowCount) => {
    logger.debug('DATABASE_QUERY', {
      context: 'PERFORMANCE',
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      duration_ms: duration,
      rows: rowCount
    });
  },
  
  logApiRequest: (method, path, duration, statusCode) => {
    logger.info('API_REQUEST', {
      context: 'PERFORMANCE',
      method,
      path,
      duration_ms: duration,
      status: statusCode
    });
  },
  
  logMiningOperation: (creator, duration, attempts, success) => {
    logger.info('MINING_OPERATION', {
      context: 'MINING',
      creator,
      duration_ms: duration,
      attempts,
      success
    });
  }
};

// Blockchain logger
const blockchainLogger = createContextLogger('BLOCKCHAIN');

// Database logger
const dbLogger = createContextLogger('DATABASE');

// Export loggers
module.exports = {
  // Main logger
  ...logger,
  
  // Specialized loggers
  security: securityLogger,
  performance: performanceLogger,
  blockchain: blockchainLogger,
  database: dbLogger,
  
  // Factory function for context loggers
  createContext: createContextLogger
};
