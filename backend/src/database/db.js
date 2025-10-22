const { Pool } = require('pg');
const { DATABASE_URL } = require('../config');
const logger = require('../utils/logger');

class DatabaseManager {
	constructor() {
	    this.pool = new Pool({
	      connectionString: DATABASE_URL,
	      max: 20,
	      idleTimeoutMillis: 30000,
	      connectionTimeoutMillis: 10000,
	      statement_timeout: 30000,
	    });
	
	    this.pool.on('error', (err) => {
	      logger.error('Unexpected database error on idle client', { error: err.message });
	    });
	}

	async connect() {
	    let retries = 5;
	    while (retries > 0) {
	      try {
	        const client = await this.pool.connect();
	        await client.query('SELECT 1');
	        client.release();
	        logger.info('Database connection established successfully.');
	        return;
	      } catch (error) {
	        retries--;
	        logger.warn(`Database connection failed. Retries left: ${retries}`, {
	          error: error.message,
	        });
	        if (retries === 0) throw new Error('Unable to connect to database after multiple retries.');
	        await new Promise(resolve => setTimeout(resolve, 5000));
	      }
	    }
	}

	async query(text, params) {
	    const start = Date.now();
	    try {
	      const result = await this.pool.query(text, params);
	      const duration = Date.now() - start;
	      logger.performance.logDatabaseQuery(text, duration, result.rowCount);
	      return result;
	    } catch (error) {
	      const duration = Date.now() - start;
	      logger.error('Database query failed', {
	        error: error.message,
	        duration: `${duration}ms`,
	        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
	      });
	      throw error;
	    }
	}

	async end() {
	    await this.pool.end();
	    logger.info('Database pool has been closed.');
	}
}

const dbManager = new DatabaseManager();

async function createSchema() {
	const client = await dbManager.pool.connect();
	try {
		logger.info('Initializing database schema...');

		// Abilita le estensioni
		await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
		await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

		// Schemi
		await client.query('CREATE SCHEMA IF NOT EXISTS blockchain;');
		await client.query('CREATE SCHEMA IF NOT EXISTS audit;');

		// Tabella Creators
		await client.query(`
			CREATE TABLE IF NOT EXISTS blockchain.creators (
				creator_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
				display_name VARCHAR(255) UNIQUE NOT NULL CHECK (length(display_name) >= 3),
				public_key_pem TEXT NOT NULL,
				key_algorithm VARCHAR(50) NOT NULL DEFAULT 'RSA-OAEP',
				key_size INTEGER NOT NULL DEFAULT 2048 CHECK (key_size >= 2048),
				is_active BOOLEAN DEFAULT TRUE,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);
		`);

		// Tabella Blocks (Blockchain Core)
		await client.query(`
			CREATE TABLE IF NOT EXISTS blockchain.blocks (
				block_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
				block_number BIGSERIAL UNIQUE, -- NUOVA COLONNA PER ORDINAMENTO E INTEGRITÀ
				creator_id UUID REFERENCES blockchain.creators(creator_id) ON DELETE SET NULL,
				previous_hash VARCHAR(64),
				block_hash VARCHAR(64) UNIQUE NOT NULL,
				nonce BIGINT NOT NULL,
				difficulty INTEGER NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
				
				-- Dati crittografati
				encrypted_data BYTEA NOT NULL,
				data_iv BYTEA NOT NULL,
				encrypted_data_key BYTEA NOT NULL,
				data_size INTEGER NOT NULL CHECK (data_size > 0),
				
				-- Firma e verifica
				signature BYTEA NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				verified BOOLEAN DEFAULT FALSE,
				verified_at TIMESTAMPTZ,
				
				mining_duration_ms INTEGER,
				
				-- Controlla che il blocco genesi abbia previous_hash NULL o GENESIS_HASH e block_number = 1
				-- Se block_number > 1, previous_hash non deve essere NULL
				CONSTRAINT valid_genesis_block CHECK (
					(previous_hash IS NULL AND block_number = 1) OR
					(previous_hash IS NOT NULL AND block_number > 1)
				)
			);
		`);
		
		// Trigger per l'immutabilità (migliorato)
		// Funzione Trigger (Logica Immutabilità) - CORRETTA
    await client.query(`
        CREATE OR REPLACE FUNCTION prevent_blockchain_tampering()
        RETURNS trigger AS $$
        BEGIN
            -- Logica corretta: permette UPDATE SOLO sul campo 'verified'
            IF TG_OP = 'UPDATE' THEN
                IF (OLD.verified IS DISTINCT FROM NEW.verified) THEN
                    -- Permette l'aggiornamento solo se solo 'verified' cambia
                    RETURN NEW;
                ELSE
                    -- Proibisce qualsiasi altro UPDATE sui dati del blocco (hash, nonce, dati, ecc.)
                    RAISE EXCEPTION 'block_chain is append-only: UPDATE prohibited, except for "verified" status.';
                END IF;
            ELSIF TG_OP = 'DELETE' THEN
                -- Proibisce DELETE
                RAISE EXCEPTION 'block_chain is append-only: DELETE prohibited.';
            END IF;
            -- Dovrebbe essere irraggiungibile per INSERT/TRUNCATE se non gestiti esplicitamente
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    // Chiamata Trigger (Sintassi corretta per PostgreSQL) - CORRETTA
    await client.query('DROP TRIGGER IF EXISTS block_chain_protect ON blockchain.blocks;');
    await client.query(`
        CREATE TRIGGER block_chain_protect
        BEFORE UPDATE OR DELETE ON blockchain.blocks
        FOR EACH ROW 
        -- RIMOSSA la clausola WHEN che causava l'errore "column tg_op does not exist"
        EXECUTE FUNCTION prevent_blockchain_tampering();
    `);
		
		// Tabella Audit Events
		await client.query(`
			CREATE TABLE IF NOT EXISTS audit.events (
				event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
				block_id UUID REFERENCES blockchain.blocks(block_id) ON DELETE SET NULL,
				event_type VARCHAR(50) NOT NULL,
				creator_id UUID REFERENCES blockchain.creators(creator_id) ON DELETE SET NULL,
				client_ip INET,
				event_data JSONB,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);
		`);

		// Indici per performance
		await client.query('CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blockchain.blocks(created_at DESC);');
		await client.query('CREATE INDEX IF NOT EXISTS idx_blocks_creator_id ON blockchain.blocks(creator_id);');
		await client.query('CREATE INDEX IF NOT EXISTS idx_blocks_previous_hash ON blockchain.blocks(previous_hash);');
		await client.query('CREATE INDEX IF NOT EXISTS idx_blocks_unverified ON blockchain.blocks(verified) WHERE verified = FALSE;');
		await client.query('CREATE INDEX IF NOT EXISTS idx_creators_display_name ON blockchain.creators(display_name);');
		await client.query('CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit.events(event_type);');
		await client.query('CREATE INDEX IF NOT EXISTS idx_audit_events_creator_id ON audit.events(creator_id);');
		
		// Funzione hash in DB (di riferimento, ma l'hash deve essere calcolato nel nodo per il PoW)
		await client.query(`
			CREATE OR REPLACE FUNCTION blockchain.block_hash_fn(
				previous_hash VARCHAR,
				encrypted_data BYTEA,
				data_iv BYTEA,
				encrypted_data_key BYTEA,
				created_at TIMESTAMPTZ,
				nonce BIGINT,
				creator_id UUID,
				difficulty INTEGER
			) RETURNS VARCHAR AS $$
				SELECT encode(
					digest(
						coalesce(previous_hash, '') ||
						encode(encrypted_data, 'hex') ||
						encode(data_iv, 'hex') ||
						encode(encrypted_data_key, 'hex') ||
						created_at::TEXT ||
						nonce::TEXT ||
						coalesce(creator_id::TEXT, '') ||
						difficulty::TEXT,
						'sha256'
					),
					'hex'
				);
			$$ LANGUAGE SQL IMMUTABLE;
		`);

		logger.info('Database schema initialized successfully.');
	} catch (error) {
		logger.error('Schema creation failed', { error: error.message, stack: error.stack });
		throw error;
	} finally {
		client.release();
	}
}

async function initDb() {
	try {
		await dbManager.connect();
		await createSchema();
	} catch (error) {
		logger.error('FATAL: Database initialization failed. Exiting.', { error: error.message });
		process.exit(1);
	}
}

module.exports = {
	pool: dbManager.pool,
	query: dbManager.query.bind(dbManager),
	initDb,
};