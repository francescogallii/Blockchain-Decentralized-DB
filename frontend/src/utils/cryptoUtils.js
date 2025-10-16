// RSA Key Generation
export const generateRSAKeyPair = async () => {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    return keyPair;
  } catch (error) {
    console.error('RSA key generation failed:', error);
    throw new Error('Failed to generate RSA key pair');
  }
};

// Export key to PEM format
export const exportKey = async (key, format = 'spki') => {
  try {
    const exported = await crypto.subtle.exportKey(format, key);
    const exportedAsString = ab2str(exported);
    const exportedAsBase64 = btoa(exportedAsString);
    
    const pemHeader = format === 'spki' ? 'PUBLIC KEY' : 'PRIVATE KEY';
    const pemContents = exportedAsBase64.match(/.{1,64}/g).join('\n');
    
    return `-----BEGIN ${pemHeader}-----\n${pemContents}\n-----END ${pemHeader}-----`;
  } catch (error) {
    console.error('Key export failed:', error);
    throw new Error('Failed to export key');
  }
};

// Import key from PEM format
export const importKey = async (pemString, format = 'spki', keyUsages = ['encrypt']) => {
  try {
    // Remove PEM headers and decode base64
    const pemHeader = format === 'spki' ? 'PUBLIC KEY' : 'PRIVATE KEY';
    const pemContents = pemString
      .replace(`-----BEGIN ${pemHeader}-----`, '')
      .replace(`-----END ${pemHeader}-----`, '')
      .replace(/\s/g, '');
    
    const binaryDerString = atob(pemContents);
    const binaryDer = str2ab(binaryDerString);
    
    const key = await crypto.subtle.importKey(
      format,
      binaryDer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      true,
      keyUsages
    );

    return key;
  } catch (error) {
    console.error('Key import failed:', error);
    throw new Error('Failed to import key');
  }
};

// Validate RSA private key PEM format
export const validatePrivateKeyPem = async (privateKeyPem) => {
  try {
    if (!privateKeyPem || typeof privateKeyPem !== 'string') {
      return false;
    }

    // Check PEM format
    if (!privateKeyPem.includes('-----BEGIN PRIVATE KEY-----') || 
        !privateKeyPem.includes('-----END PRIVATE KEY-----')) {
      return false;
    }

    // Try to import the key
    const key = await importKey(privateKeyPem, 'pkcs8', ['decrypt']);
    
    // Check key properties
    const keyInfo = await crypto.subtle.exportKey('jwk', key);
    
    // Validate key size (should be at least 2048 bits)
    if (keyInfo.n && atob(keyInfo.n.replace(/-/g, '+').replace(/_/g, '/')).length * 8 < 2048) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Private key validation failed:', error);
    return false;
  }
};

// Validate RSA public key PEM format
export const validatePublicKeyPem = async (publicKeyPem) => {
  try {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') {
      return false;
    }

    // Check PEM format
    if (!publicKeyPem.includes('-----BEGIN PUBLIC KEY-----') || 
        !publicKeyPem.includes('-----END PUBLIC KEY-----')) {
      return false;
    }

    // Try to import the key
    const key = await importKey(publicKeyPem, 'spki', ['encrypt']);
    
    // Check key properties
    const keyInfo = await crypto.subtle.exportKey('jwk', key);
    
    // Validate key size (should be at least 2048 bits)
    if (keyInfo.n && atob(keyInfo.n.replace(/-/g, '+').replace(/_/g, '/')).length * 8 < 2048) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Public key validation failed:', error);
    return false;
  }
};

// Test key pair compatibility
export const testKeyPairCompatibility = async (publicKeyPem, privateKeyPem) => {
  try {
    const publicKey = await importKey(publicKeyPem, 'spki', ['encrypt']);
    const privateKey = await importKey(privateKeyPem, 'pkcs8', ['decrypt']);
    
    // Test encryption/decryption
    const testMessage = 'test-key-compatibility';
    const testData = new TextEncoder().encode(testMessage);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      testData
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encrypted
    );
    
    const decryptedMessage = new TextDecoder().decode(decrypted);
    
    return decryptedMessage === testMessage;
  } catch (error) {
    console.error('Key pair compatibility test failed:', error);
    return false;
  }
};

// Generate secure random data
export const generateSecureRandom = (length) => {
  return crypto.getRandomValues(new Uint8Array(length));
};

// Hash data with SHA-256
export const hashData = async (data) => {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Hashing failed:', error);
    throw new Error('Failed to hash data');
  }
};

// Utility functions for ArrayBuffer/String conversion
function ab2str(buf) {
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

// Format bytes for display
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format duration for display
export const formatDuration = (milliseconds) => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

// Check browser crypto support
export const checkCryptoSupport = () => {
  const support = {
    subtle: !!crypto?.subtle,
    rsa: false,
    aes: false,
    sha256: false,
  };

  if (support.subtle) {
    // Test for specific algorithm support
    try {
      support.rsa = 'RSA-OAEP' in crypto.subtle;
      support.aes = 'AES-GCM' in crypto.subtle;
      support.sha256 = 'SHA-256' in crypto.subtle;
    } catch (error) {
      console.warn('Error checking crypto algorithm support:', error);
    }
  }

  return support;
};

// Initialize crypto utilities
export const initCrypto = () => {
  const support = checkCryptoSupport();
  
  if (!support.subtle) {
    throw new Error('Web Crypto API not supported in this browser');
  }
  
  if (!support.rsa) {
    throw new Error('RSA-OAEP not supported in this browser');
  }
  
  if (!support.aes) {
    throw new Error('AES-GCM not supported in this browser');
  }
  
  if (!support.sha256) {
    throw new Error('SHA-256 not supported in this browser');
  }
  
  console.log('✅ Crypto utilities initialized successfully');
  return support;
};

export default {
  generateRSAKeyPair,
  exportKey,
  importKey,
  validatePrivateKeyPem,
  validatePublicKeyPem,
  testKeyPairCompatibility,
  generateSecureRandom,
  hashData,
  formatBytes,
  formatDuration,
  checkCryptoSupport,
  initCrypto
};
