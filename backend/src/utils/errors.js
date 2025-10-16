class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class CryptoError extends AppError {
  constructor(message = 'Cryptographic operation failed') {
    super(message, 400, 'CRYPTO_ERROR');
  }
}

class MiningError extends AppError {
  constructor(message = 'Mining operation failed') {
    super(message, 408, 'MINING_ERROR');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

class BlockchainError extends AppError {
  constructor(message = 'Blockchain operation failed') {
    super(message, 400, 'BLOCKCHAIN_ERROR');
  }
}

// Error response formatter
const formatErrorResponse = (error) => {
  const response = {
    status: error.status || 'error',
    message: error.message,
    timestamp: error.timestamp || new Date().toISOString()
  };

  if (error.code) {
    response.code = error.code;
  }

  if (error.details) {
    response.details = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  return response;
};

// Async error handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handler middleware
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  const logger = require('./logger');
  logger.error('Global error handler', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle specific error types
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = new ValidationError(message);
  }

  if (err.code === 11000) {
    const message = 'Duplicate field value';
    error = new ConflictError(message);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ValidationError(message.join(', '), message);
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AuthenticationError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AuthenticationError(message);
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    const message = 'Duplicate entry';
    error = new ConflictError(message);
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    const message = 'Referenced resource not found';
    error = new ValidationError(message);
  }

  if (err.code === '23502') { // PostgreSQL not null violation
    const message = 'Required field missing';
    error = new ValidationError(message);
  }

  res.status(error.statusCode || 500).json(formatErrorResponse(error));
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  CryptoError,
  MiningError,
  DatabaseError,
  BlockchainError,
  formatErrorResponse,
  asyncHandler,
  globalErrorHandler
};
