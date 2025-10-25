// File: frontend/src/utils/cryptoUtils.js

// --- Helper Functions (ab2str, str2ab, base64ToAb, abToBase64, abToHex) --- Remain the same ---

function ab2str(buf) {
    // Ensure correct handling of binary data, not necessarily UTF-8 text
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

function base64ToAb(base64) {
    try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (e) {
        console.error("Failed to decode base64 string:", e);
        throw new Error("Invalid Base64 string provided.");
    }
}

function abToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function abToHex(buffer) {
     if (!buffer) return '';
     const byteArray = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
      if (!(byteArray instanceof Uint8Array)) {
        console.error("Invalid buffer type passed to abToHex:", buffer);
        return ''; // Or throw an error
      }
     return Array.from(byteArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}


// --- Generate RSA Key Pair ---
export const generateRSAKeyPair = async () => {
    try {
        // ** CORRECTED: Generate using RSA-OAEP name and ONLY its valid usages **
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP', // Algorithm for encryption/decryption
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256', // Hash used with OAEP
            },
            true, // extractable
            // Request ONLY usages valid for RSA-OAEP during generation
            ['encrypt', 'decrypt']
        );
        // We will import this key pair with different algorithm objects (e.g., RSASSA-PKCS1-v1_5)
        // and appropriate usages ('sign', 'verify') when needed for those operations.
        return keyPair;
    } catch (error) {
        console.error('RSA key generation failed:', error);
         if (error instanceof DOMException) {
             console.error(`DOMException details: name=${error.name}, message=${error.message}`);
         }
        throw new Error('Failed to generate RSA key pair. Check browser compatibility or algorithm parameters.');
    }
};

// --- Export/Import Keys --- (No changes needed here from last version)

export const exportKey = async (key, format = 'spki') => {
    try {
        const exported = await crypto.subtle.exportKey(format, key);
        const exportedAsString = ab2str(exported);
        const exportedAsBase64 = btoa(exportedAsString);
        const pemHeader = format === 'spki' ? 'PUBLIC KEY' : 'PRIVATE KEY';
        const pemContents = exportedAsBase64.match(/.{1,64}/g)?.join('\n') || '';
        return `-----BEGIN ${pemHeader}-----\n${pemContents}\n-----END ${pemHeader}-----`;
    } catch (error) {
        console.error(`Key export failed (format: ${format}):`, error);
        throw new Error(`Failed to export ${format === 'spki' ? 'public' : 'private'} key`);
    }
};

export const importKey = async (pemString, format = 'spki', keyAlgorithmName = 'RSA-OAEP', keyUsages = ['encrypt']) => {
    try {
        const pemHeader = format === 'spki' ? 'PUBLIC KEY' : 'PRIVATE KEY';
        const pemContents = pemString
            .replace(`-----BEGIN ${pemHeader}-----`, '')
            .replace(`-----END ${pemHeader}-----`, '')
            .replace(/\s/g, '');

        if (!pemContents) throw new Error('Invalid PEM content.');

        const binaryDerString = atob(pemContents);
        const binaryDer = str2ab(binaryDerString);

        let algorithm;
        if (keyAlgorithmName === 'RSA-OAEP') {
            algorithm = { name: 'RSA-OAEP', hash: 'SHA-256' };
        } else if (keyAlgorithmName === 'RSA-PSS') {
             algorithm = { name: 'RSA-PSS', hash: 'SHA-256' };
        } else if (keyAlgorithmName === 'RSASSA-PKCS1-v1_5') { // Added this one
            algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
        } else {
             console.warn(`Unsupported keyAlgorithmName '${keyAlgorithmName}' during import, falling back to RSA-OAEP.`);
             algorithm = { name: 'RSA-OAEP', hash: 'SHA-256' };
        }

        const key = await crypto.subtle.importKey(format, binaryDer, algorithm, true, keyUsages);
        return key;
    } catch (error) {
        console.error(`Key import failed (format: ${format}, usage: ${keyUsages}, algo: ${keyAlgorithmName}):`, error);
        if (error.message.includes('KeyDataError') || error instanceof DOMException) {
             throw new Error('Failed to import key: Invalid key data or format.');
        }
        throw new Error(`Failed to import key: ${error.message}`);
    }
};


// --- Key Validation & Verification --- (No changes needed here from last version)

export const validatePrivateKeyPem = async (privateKeyPem) => {
    try {
        if (!privateKeyPem || typeof privateKeyPem !== 'string' ||
            !privateKeyPem.includes('-----BEGIN PRIVATE KEY-----') ||
            !privateKeyPem.includes('-----END PRIVATE KEY-----')) {
            return false;
        }
        // Attempt imports for common usages
        await importKey(privateKeyPem, 'pkcs8', 'RSA-OAEP', ['decrypt']);
        await importKey(privateKeyPem, 'pkcs8', 'RSASSA-PKCS1-v1_5', ['sign']);
        return true;
    } catch (error) {
        return false;
    }
};

export const validatePublicKeyPem = async (publicKeyPem) => {
     try {
         if (!publicKeyPem || typeof publicKeyPem !== 'string' ||
            !publicKeyPem.includes('-----BEGIN PUBLIC KEY-----') ||
            !publicKeyPem.includes('-----END PUBLIC KEY-----')) {
             return false;
         }
        // Attempt imports for common usages
        await importKey(publicKeyPem, 'spki', 'RSA-OAEP', ['encrypt']);
        await importKey(publicKeyPem, 'spki', 'RSASSA-PKCS1-v1_5', ['verify']);
         return true;
     } catch (error) {
         return false;
     }
 };

export const verifyKeyPair = async (publicKeyPem, privateKeyPem) => {
    try {
        const testMessage = `key-verification-${Date.now()}`;
        const testData = new TextEncoder().encode(testMessage);
        const publicKey = await importKey(publicKeyPem, 'spki', 'RSA-OAEP', ['encrypt']);
        const privateKey = await importKey(privateKeyPem, 'pkcs8', 'RSA-OAEP', ['decrypt']);
        const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, testData);
        const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encrypted);
        const decryptedMessage = new TextDecoder().decode(decrypted);
        return decryptedMessage === testMessage;
    } catch (error) {
        console.error('Key pair verification failed:', error);
        return false;
    }
};

// --- Symmetric Encryption (AES-GCM) --- (No changes needed here from last version)

export const generateAESKey = () => crypto.getRandomValues(new Uint8Array(32));
export const generateIV = () => crypto.getRandomValues(new Uint8Array(16));

export const encryptAESData = async (plaintext, key /* Uint8Array */, iv /* Uint8Array */) => {
    try {
        const encodedData = new TextEncoder().encode(plaintext);
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
        const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, cryptoKey, encodedData);
        return new Uint8Array(ciphertextBuffer);
    } catch (error) {
        console.error('AES encryption failed:', error);
        throw new Error('AES Encryption failed');
    }
};

export const decryptAESData = async (ciphertext /* Uint8Array or ArrayBuffer */, key /* Uint8Array */, iv /* Uint8Array */) => {
    try {
        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
        // Ensure inputs are ArrayBuffer or TypedArray
        const ivBuffer = iv instanceof Uint8Array ? iv : new Uint8Array(iv);
        const cipherBuffer = ciphertext instanceof ArrayBuffer ? ciphertext : ciphertext.buffer;
        const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, cryptoKey, cipherBuffer);
        return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
        console.error('AES decryption failed:', error);
        if (error.name === 'OperationError') {
             throw new Error('AES Decryption failed: Data integrity check failed (authentication tag mismatch or invalid key/IV).');
        }
        throw new Error(`AES Decryption failed: ${error.message}`);
    }
};


// --- Asymmetric Encryption (RSA-OAEP for AES Key) --- (No changes needed here from last version)

export const encryptAESKeyWithPublicKey = async (aesKey /* Uint8Array */, publicKeyPem) => {
    try {
        const publicKey = await importKey(publicKeyPem, 'spki', 'RSA-OAEP', ['encrypt']);
        const encryptedKeyBuffer = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, aesKey);
        return new Uint8Array(encryptedKeyBuffer);
    } catch (error) {
        console.error('AES key encryption failed:', error);
        throw new Error('Failed to encrypt AES key with public key');
    }
};

export const decryptAESKeyWithPrivateKey = async (encryptedAesKey /* Uint8Array or ArrayBuffer */, privateKeyPem) => {
    try {
        const privateKey = await importKey(privateKeyPem, 'pkcs8', 'RSA-OAEP', ['decrypt']);
        // Ensure input is ArrayBuffer or TypedArray
        const encryptedBuffer = encryptedAesKey instanceof ArrayBuffer ? encryptedAesKey : encryptedAesKey.buffer;
        const decryptedKeyBuffer = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedBuffer);
        return new Uint8Array(decryptedKeyBuffer);
    } catch (error) {
        console.error('AES key decryption failed:', error);
        throw new Error('Failed to decrypt AES key. Ensure the correct private key is used.');
    }
};


// --- Hashing & Hash Input --- (No changes needed here from last version)

export const hashData = async (data) => {
    try {
        const encoder = new TextEncoder();
        const dataBuffer = typeof data === 'string' ? encoder.encode(data) : (data instanceof ArrayBuffer ? data : data.buffer);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return abToHex(hashBuffer);
    } catch (error) {
        console.error('Hashing failed:', error);
        throw new Error('Failed to hash data');
    }
};

export const buildHashInput = (blockData) => {
    const createdAtISO = blockData.created_at instanceof Date
        ? blockData.created_at.toISOString()
        : (typeof blockData.created_at === 'string' ? blockData.created_at : new Date().toISOString());
    const encryptedDataHex = abToHex(blockData.encrypted_data);
    const ivHex = abToHex(blockData.data_iv);
    const encryptedKeyHex = abToHex(blockData.encrypted_data_key);

    return [
        blockData.previous_hash || '0'.repeat(64),
        encryptedDataHex,
        ivHex,
        encryptedKeyHex,
        blockData.nonce.toString(),
        createdAtISO,
        blockData.creator_id || '',
        blockData.difficulty.toString(),
    ].join('|');
};

// --- Mining (Proof-of-Work) --- (No changes needed here from last version)

export const mineBlock = async (blockData, difficulty, timeoutMs) => {
    let nonce = 0n;
    let hash = '';
    const requiredPrefix = '0'.repeat(difficulty);
    const startTime = Date.now();
    const MAX_NONCE_CHECKS_BEFORE_YIELD = 10000;

    console.log(`⛏️ Starting client-side mining (difficulty: ${difficulty})...`);
    try {
        while (true) {
            nonce++;
            const currentBlockData = { ...blockData, nonce: nonce };
            const hashInput = buildHashInput(currentBlockData);
            hash = await hashData(hashInput);

            if (hash.startsWith(requiredPrefix)) {
                const duration = Date.now() - startTime;
                console.log(`✅ Mining successful! Nonce: ${nonce}, Hash: ${hash.substring(0, 10)}..., Duration: ${formatDuration(duration)}`);
                return { nonce: nonce.toString(), hash, duration };
            }

            if (Date.now() - startTime > timeoutMs) {
                console.warn(`Mining timeout exceeded after ${formatDuration(Date.now() - startTime)}`);
                throw new Error('Mining timeout exceeded');
            }

            if (Number(nonce) % MAX_NONCE_CHECKS_BEFORE_YIELD === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    } catch (error) {
         console.error("Mining failed:", error);
         throw error;
    }
};

// --- Signing --- (No changes needed here from last version)

export const signData = async (privateKeyPem, dataToSign) => {
     try {
         // Import specifically for signing using RSASSA-PKCS1-v1_5
         const privateKey = await importKey(privateKeyPem, 'pkcs8', 'RSASSA-PKCS1-v1_5', ['sign']);
         const dataBuffer = typeof dataToSign === 'string' ? new TextEncoder().encode(dataToSign) : dataToSign;
        const signatureBuffer = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, dataBuffer);
        return new Uint8Array(signatureBuffer);
     } catch (error) {
         console.error('Signing failed:', error);
         throw new Error(`Failed to sign data: ${error.message}`);
     }
 };


// --- Utility & Init Functions --- (No changes needed here from last version)

export const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const formatDuration = (milliseconds) => {
    if (milliseconds == null || milliseconds < 0) return 'N/A';
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
};

export const checkCryptoSupport = () => {
    const support = {
        subtle: !!(window.crypto && window.crypto.subtle),
        rsaOaep: false,
        rsaSsaPkcs1v1_5: false,
        aesGcm: false,
        sha256: false,
    };
    if (support.subtle) {
        try {
            // Basic checks based on function existence
            support.rsaOaep = typeof crypto.subtle.encrypt === 'function' && typeof crypto.subtle.decrypt === 'function';
            support.rsaSsaPkcs1v1_5 = typeof crypto.subtle.sign === 'function' && typeof crypto.subtle.verify === 'function';
            support.aesGcm = typeof crypto.subtle.encrypt === 'function'; // Assume AES support if encrypt exists
            support.sha256 = typeof crypto.subtle.digest === 'function';
        } catch (e) { console.warn("Error checking crypto support details", e)}
    }
    return support;
};

export const initCrypto = () => {
    const support = checkCryptoSupport();
    if (!support.subtle || !support.rsaOaep || !support.aesGcm || !support.sha256 || !support.rsaSsaPkcs1v1_5) {
         console.error("Crypto Support Check:", support);
        throw new Error('Browser lacks required Web Crypto API features (RSA-OAEP, RSASSA-PKCS1-v1_5, AES-GCM, SHA-256).');
    }
    console.log('✅ Crypto utilities initialized successfully.');
    return support;
};

// Default export
export default {
    generateRSAKeyPair, exportKey, importKey,
    validatePrivateKeyPem, validatePublicKeyPem, verifyKeyPair,
    generateAESKey, generateIV, encryptAESData, decryptAESData,
    encryptAESKeyWithPublicKey, decryptAESKeyWithPrivateKey,
    hashData, buildHashInput, mineBlock, signData,
    formatBytes, formatDuration, checkCryptoSupport, initCrypto,
    abToBase64, base64ToAb, abToHex,
};