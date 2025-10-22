const crypto = require('crypto');
const logger = require('./logger');
const { CryptoError } = require('./errors');

class CryptoUtils {
	// Generate AES-256-GCM key and IV
	static generateAESKey = () => crypto.randomBytes(32);
	static generateIV = () => crypto.randomBytes(16);

	// Encrypt data with AES-256-GCM
	static encryptData(plaintext, key, iv) {
		try {
			const aad = Buffer.from('blockchain-v1-authenticated-data');
			const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
			cipher.setAAD(aad);
			const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
			const authTag = cipher.getAuthTag();
			return { ciphertext, authTag };
		} catch (error) {
			logger.security.logCryptoOperation('AES_ENCRYPT', false, { error: error.message });
			throw new CryptoError(`Encryption failed: ${error.message}`);
		}
	}

	// Decrypt data with AES-256-GCM
	static decryptData(ciphertext, key, iv, authTag) {
		try {
			const aad = Buffer.from('blockchain-v1-authenticated-data');
			const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
			decipher.setAAD(aad);
			decipher.setAuthTag(authTag);
			const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
			return decrypted.toString('utf8');
		} catch (error) {
			logger.security.logCryptoOperation('AES_DECRYPT', false, { error: error.message });
			throw new CryptoError(`Decryption failed: Authentication tag mismatch or invalid key.`);
		}
	}

	// Encrypt AES key with RSA-OAEP public key
	static encryptAESKeyWithPublicKey(aesKey, publicKeyPem) {
		try {
			return crypto.publicEncrypt({
				key: publicKeyPem,
				padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
				oaepHash: 'sha256'
			}, aesKey);
		} catch (error) {
			logger.security.logCryptoOperation('RSA_ENCRYPT', false, { error: error.message });
			throw new CryptoError(`AES key encryption failed: ${error.message}`);
		}
	}

	// Decrypt AES key with RSA-OAEP private key
	static decryptAESKeyWithPrivateKey(encryptedAesKey, privateKeyPem) {
		try {
			return crypto.privateDecrypt({
				key: privateKeyPem,
				padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
				oaepHash: 'sha256'
			}, encryptedAesKey);
		} catch (error) {
			logger.security.logCryptoOperation('RSA_DECRYPT', false, { error: error.message });
			throw new CryptoError(`AES key decryption failed: ${error.message}`);
		}
	}

	// Create digital signature with RSA-SHA256
	static signData(privateKeyPem, data) {
		try {
			const sign = crypto.createSign('SHA256');
			sign.update(data);
			return sign.sign(privateKeyPem);
		} catch (error) {
			logger.security.logCryptoOperation('SIGN', false, { error: error.message });
			throw new CryptoError(`Signature creation failed: ${error.message}`);
		}
	}

	// Verify digital signature
	static verifySignature(publicKeyPem, data, signature) {
		try {
			const verify = crypto.createVerify('SHA256');
			verify.update(data);
			return verify.verify(publicKeyPem, signature);
		} catch (error) {
			logger.security.logCryptoOperation('VERIFY_SIGNATURE', false, { error: error.message });
			return false;
		}
	}

	// Calculate SHA-256 hash
	static calculateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

	// Build the consistent input string for block hashing (fondamentale per l'integrità)
	static buildHashInput(blockData) {
		const createdAtISO = blockData.created_at instanceof Date ? blockData.created_at.toISOString() : blockData.created_at;

		return [
			blockData.previous_hash || '0'.repeat(64),
			Buffer.from(blockData.encrypted_data).toString('hex'),
			Buffer.from(blockData.data_iv).toString('hex'),
			Buffer.from(blockData.encrypted_data_key).toString('hex'),
			blockData.nonce.toString(),
			createdAtISO, // Usa ISO stringa consistente
			blockData.creator_id,
			blockData.difficulty.toString(),
		].join('|');
	}

	// Validate RSA public key (per la registrazione)
	static validatePublicKeyPem(publicKeyPem) {
		try {
			const key = crypto.createPublicKey(publicKeyPem);
			const keyDetails = key.asymmetricKeyDetails;
			if (!keyDetails || key.asymmetricKeyType !== 'rsa') {
				throw new Error('Key is not a valid RSA key.');
			}
			if (keyDetails.modulusLength < 2048) {
				throw new Error(`Key size is ${keyDetails.modulusLength}, but must be at least 2048 bits.`);
			}
			return { valid: true, keySize: keyDetails.modulusLength, keyType: 'RSA-OAEP' };
		} catch (error) {
			return { valid: false, error: error.message };
		}
	}

	// Validate RSA private key (per il mining/decifratura)
	static validatePrivateKeyPem(privateKeyPem) {
		try {
			const key = crypto.createPrivateKey(privateKeyPem);
			const keyDetails = key.asymmetricKeyDetails;
			if (!keyDetails || key.asymmetricKeyType !== 'rsa') {
				throw new Error('Key is not a valid RSA key.');
			}
			if (keyDetails.modulusLength < 2048) {
				throw new Error(`Key size is ${keyDetails.modulusLength}, but must be at least 2048 bits.`);
			}
			return { valid: true, keySize: keyDetails.modulusLength, keyType: 'RSA-OAEP' };
		} catch (error) {
			return { valid: false, error: error.message };
		}
	}

	// Time-safe string comparison for security
	static timeSafeEqual(a, b) {
		try {
			const bufferA = Buffer.from(a, 'utf8');
			const bufferB = Buffer.from(b, 'utf8');
			if (bufferA.length !== bufferB.length) return false;
			return crypto.timingSafeEqual(bufferA, bufferB);
		} catch (error) {
			return false;
		}
	}
}

module.exports = CryptoUtils;