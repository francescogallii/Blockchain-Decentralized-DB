const winston = require('winston');
const path = require('path');
const { LOG_LEVEL, NODE_ENV } = require('../config');

// Define custom log levels (mantenuto)
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
};

// Define colors for each log level (mantenuto)
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'magenta'
};

// Custom format function (mantenuto)
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

// Create transports array (mantenuto)
const transports = [];

// Console transport for development (mantenuto)
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

// File transports for production (mantenuto)
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
const mainLogger = winston.createLogger({ 
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

// Add colors to winston (mantenuto)
winston.addColors(logColors);

// Create specialized loggers for different contexts (mantenuto)
const createContextLogger = (context) => {
    return {
        error: (message, meta = {}) => mainLogger.error(message, { context, ...meta }),
        warn: (message, meta = {}) => mainLogger.warn(message, { context, ...meta }),
        info: (message, meta = {}) => mainLogger.info(message, { context, ...meta }),
        debug: (message, meta = {}) => mainLogger.debug(message, { context, ...meta }),
        trace: (message, meta = {}) => mainLogger.log('trace', message, { context, ...meta })
    };
};

// Security logger for sensitive operations (mantenuto)
const securityLogger = {
    logSecurityEvent: (event, details = {}) => {
        mainLogger.warn(`SECURITY: ${event}`, {
            context: 'SECURITY',
            event,
            timestamp: new Date().toISOString(),
            ...details
        });
    },

    logFailedAuth: (attempt, details = {}) => {
        mainLogger.warn(`FAILED_AUTH: ${attempt}`, {
            context: 'SECURITY',
            event: 'FAILED_AUTH',
            attempt,
            timestamp: new Date().toISOString(),
            ...details
        });
    },

    logCryptoOperation: (operation, success, details = {}) => {
        mainLogger.info(`CRYPTO: ${operation} - ${success ? 'SUCCESS' : 'FAILURE'}`, {
            context: 'CRYPTO',
            operation,
            success,
            timestamp: new Date().toISOString(),
            ...details
        });
    }
};

// Performance logger (mantenuto)
const performanceLogger = {
    logDatabaseQuery: (query, duration, rowCount) => {
        mainLogger.debug('DATABASE_QUERY', {
            context: 'PERFORMANCE',
            query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
            duration_ms: duration,
            rows: rowCount
        });
    },

    logApiRequest: (method, path, duration, statusCode) => {
        mainLogger.info('API_REQUEST', {
            context: 'PERFORMANCE',
            method,
            path,
            duration_ms: duration,
            status: statusCode
        });
    },

    logMiningOperation: (creator, duration, attempts, success) => {
        mainLogger.info('MINING_OPERATION', {
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

// ESPOSTO mainLogger direttamente come punto d'ingresso principale
// Questa esportazione corregge il TypeError nel file index.js
module.exports = {
    // Espone i metodi del logger principale come metodi diretti
    error: mainLogger.error.bind(mainLogger),
    warn: mainLogger.warn.bind(mainLogger),
    info: mainLogger.info.bind(mainLogger),
    debug: mainLogger.debug.bind(mainLogger),
    
    // Espone i logger specializzati
    security: securityLogger,
    performance: performanceLogger,
    blockchain: blockchainLogger,
    database: dbLogger,

    // Factory function for context loggers
    createContext: createContextLogger
};