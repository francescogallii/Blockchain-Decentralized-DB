------------------------------------------------------------------
-- Questo file è stato sostituito da backend/src/database/db.js --
------------------------------------------------------------------




-- Rimuovo la colonna data_content e aggiungo colonne per crittografia
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabella creators (invariata)
CREATE TABLE IF NOT EXISTS chain_creators (
    creator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT UNIQUE NOT NULL,
    public_key_pem TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella blockchain con crittografia
CREATE TABLE IF NOT EXISTS block_chain (
    block_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Dati crittografati
    encrypted_data BYTEA NOT NULL,           -- Dati cifrati AES-256-GCM
    data_iv BYTEA NOT NULL,                  -- Vettore di inizializzazione
    encrypted_data_key BYTEA NOT NULL,       -- Chiave AES cifrata con RSA
    
    -- Metadati blockchain
    previous_hash VARCHAR(64),
    block_hash VARCHAR(64) NOT NULL,
    nonce BIGINT NOT NULL,
    creator_id UUID REFERENCES chain_creators(creator_id) ON DELETE SET NULL,
    signature BYTEA NOT NULL,
    proof_of_work_difficulty INTEGER NOT NULL DEFAULT 4,
    verified BOOLEAN DEFAULT FALSE
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_block_chain_created_at ON block_chain(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_block_chain_previous_hash ON block_chain(previous_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_block_chain_block_hash ON block_chain(block_hash);

-- Funzione hash per la blockchain
CREATE OR REPLACE FUNCTION block_hash_fn(
    previous_hash VARCHAR,
    encrypted_data BYTEA,
    data_iv BYTEA,
    encrypted_data_key BYTEA,
    created_at TIMESTAMPTZ,
    nonce BIGINT
) RETURNS VARCHAR AS $$
    SELECT encode(
        digest(
            coalesce(previous_hash, '') || 
            encode(encrypted_data, 'hex') || 
            encode(data_iv, 'hex') || 
            encode(encrypted_data_key, 'hex') || 
            created_at::TEXT || 
            nonce::TEXT,
            'sha256'
        ),
        'hex'
    );
$$ LANGUAGE SQL IMMUTABLE;

-- Trigger per prevenire modifiche
CREATE OR REPLACE FUNCTION prevent_blockchain_tampering()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'block_chain is append-only: UPDATE/DELETE prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_chain_protect ON block_chain;
CREATE TRIGGER block_chain_protect
BEFORE UPDATE OR DELETE ON block_chain
FOR EACH ROW EXECUTE FUNCTION prevent_blockchain_tampering();