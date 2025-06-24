/**
 * @fileoverview This file contains all cryptographic functions for the SteganoGuard application.
 * It handles key generation, import/export, hashing, digital signatures, and both symmetric and asymmetric encryption.
 * The library uses the browser's native Web Crypto API.
 * 
 * Cryptography Strategy:
 * - Digital Signatures: Ed25519 for fast and secure signing and verification.
 * - Asymmetric Encryption (Hybrid): ECDH (Elliptic-Curve Diffie-Hellman) for key agreement, which then derives a shared
 *   AES-GCM key to encrypt the actual message. This provides Perfect Forward Secrecy for each message.
 * - Symmetric Encryption: AES-GCM for password-based encryption of the "decoy" message. The key is derived from the
 *   user's password using PBKDF2.
 */

// --- ALGORITHM DEFINITIONS ---

const SIGN_ALGO = { name: 'Ed25519' };
const ENCRYPT_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const AES_ALGO = { name: 'AES-GCM', length: 256 };
const PBKDF2_PARAMS = {
  name: 'PBKDF2',
  // In a real-world app, this salt should be unique per password and stored alongside the hash.
  // For simplicity in this tool, a static salt is used.
  salt: new Uint8Array(16), 
  iterations: 100000,
  hash: 'SHA-256',
};


// --- KEY GENERATION ---

/**
 * Generates a new Ed25519 key pair for digital signatures.
 * @returns {Promise<CryptoKeyPair>} A promise that resolves to a CryptoKeyPair containing a publicKey and privateKey.
 */
export async function generateSigningKeyPair() {
  return await crypto.subtle.generateKey(SIGN_ALGO, true, ['sign', 'verify']);
}

/**
 * Generates a new ECDH P-256 key pair for encryption key agreement.
 * @returns {Promise<CryptoKeyPair>} A promise that resolves to a CryptoKeyPair.
 */
export async function generateEncryptionKeyPair() {
  return await crypto.subtle.generateKey(ENCRYPT_ALGO, true, ['deriveKey']);
}


// --- KEY IMPORT/EXPORT ---

/**
 * Imports a signing key from JWK format.
 * @param {JsonWebKey} keyData - The key in JSON Web Key format.
 * @param {'sign' | 'verify'} [usage='verify'] - The intended use of the key.
 * @returns {Promise<CryptoKey>} A promise that resolves to an importable CryptoKey.
 */
export async function importSigningKey(keyData: JsonWebKey, usage: 'sign' | 'verify' = 'verify') {
  return await crypto.subtle.importKey('jwk', keyData, SIGN_ALGO, true, [usage]);
}

/**
 * Imports an encryption key from JWK format.
 * @param {JsonWebKey} keyData - The key in JSON Web Key format.
 * @param {KeyUsage[]} [usages=['deriveKey']] - The intended uses of the key.
 * @returns {Promise<CryptoKey>} A promise that resolves to an importable CryptoKey.
 */
export async function importEncryptionKey(keyData: JsonWebKey, usages: KeyUsage[] = ['deriveKey']) {
    return await crypto.subtle.importKey('jwk', keyData, ENCRYPT_ALGO, true, usages);
}

/**
 * Exports a CryptoKey to its JSON Web Key (JWK) representation.
 * @param {CryptoKey} key - The CryptoKey to export.
 * @returns {Promise<JsonWebKey>} A promise that resolves to the JWK object.
 */
export async function exportKeyJwk(key: CryptoKey) {
  return await crypto.subtle.exportKey('jwk', key);
}


// --- HASHING ---

/**
 * Creates a SHA-256 hash of a public key's essential components.
 * This provides a consistent, unique identifier for a given public key.
 * It handles both EC (encryption) and OKP (signing) key types.
 * @param {JsonWebKey} publicKeyJwk - The public key to hash.
 * @returns {Promise<string>} A promise that resolves to the hex-encoded hash string.
 * @throws {Error} if the key is not a supported format or is missing required properties.
 */
export async function getPublicKeyHash(publicKeyJwk: JsonWebKey): Promise<string> {
    let keyString: string;

    if (publicKeyJwk.kty === 'EC' && publicKeyJwk.crv && publicKeyJwk.x && publicKeyJwk.y) {
        // For Elliptic Curve keys (encryption), use x and y coordinates.
        keyString = `${publicKeyJwk.kty}|${publicKeyJwk.crv}|${publicKeyJwk.x}|${publicKeyJwk.y}`;
    } else if (publicKeyJwk.kty === 'OKP' && publicKeyJwk.crv && publicKeyJwk.x) {
        // For Octet Key Pair keys like Ed25519 (signing), use the x coordinate.
        keyString = `${publicKeyJwk.kty}|${publicKeyJwk.crv}|${publicKeyJwk.x}`;
    } else {
        throw new Error("Cannot hash JWK: key is not a supported format or is missing required properties.");
    }
    
    const keyBuffer = textToArrayBuffer(keyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    return bufferToHex(hashBuffer);
}


// --- SIGNATURES ---

/**
 * Signs a piece of data with a private signing key.
 * @param {CryptoKey} privateSigningKey - The private Ed25519 key to sign with.
 * @param {ArrayBuffer} data - The data to sign.
 * @returns {Promise<ArrayBuffer>} A promise that resolves to the signature as an ArrayBuffer.
 */
export async function signData(privateSigningKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  return await crypto.subtle.sign(SIGN_ALGO, privateSigningKey, data);
}

/**
 * Verifies a signature against the original data and a public key.
 * @param {CryptoKey} publicSigningKey - The public Ed25519 key to verify with.
 * @param {ArrayBuffer} signature - The signature to verify.
 * @param {ArrayBuffer} data - The data that was originally signed.
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise.
 */
export async function verifySignature(publicSigningKey: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer): Promise<boolean> {
  return await crypto.subtle.verify(SIGN_ALGO, publicSigningKey, signature, data);
}


// --- SYMMETRIC ENCRYPTION (Password-based) ---

/**
 * Derives an AES-GCM encryption key from a user-provided password using PBKDF2.
 * @param {string} password - The user's password.
 * @returns {Promise<CryptoKey>} A promise that resolves to the derived AES-256 key.
 */
async function deriveKeyFromPassword(password: string): Promise<CryptoKey> {
  const passwordBuffer = textToArrayBuffer(password);
  const masterKey = await crypto.subtle.importKey('raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveKey']);
  return await crypto.subtle.deriveKey(PBKDF2_PARAMS, masterKey, AES_ALGO, true, ['encrypt', 'decrypt']);
}

/**
 * Encrypts a plaintext string using a password.
 * @param {string} plaintext - The text to encrypt.
 * @param {string} password - The password to use for encryption.
 * @returns {Promise<{ iv: string, ciphertext: string }>} A promise that resolves to an object containing the base64-encoded IV and ciphertext.
 */
export async function encryptSymmetric(plaintext: string, password: string): Promise<{ iv: string, ciphertext: string }> {
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is recommended for AES-GCM.
  const plaintextBuffer = textToArrayBuffer(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBuffer);

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypts a ciphertext string using a password.
 * @param {{ iv: string, ciphertext: string }} encrypted - The encrypted data object.
 * @param {string} password - The password to use for decryption.
 * @returns {Promise<string>} A promise that resolves to the decrypted plaintext string.
 * @throws {DOMException} if decryption fails (e.g., wrong password).
 */
export async function decryptSymmetric(encrypted: { iv: string, ciphertext: string }, password: string): Promise<string> {
  const key = await deriveKeyFromPassword(password);
  const iv = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.ciphertext);
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return arrayBufferToText(decryptedBuffer);
}


// --- HYBRID ENCRYPTION (Asymmetric) ---

/**
 * Encrypts a plaintext string for a recipient using their public encryption key.
 * This is a hybrid method: ECDH is used to create a shared secret, which then encrypts the data with AES-GCM.
 * @param {string} plaintext - The secret message to encrypt.
 * @param {CryptoKey} recipientPublicKey - The recipient's public ECDH key.
 * @returns {Promise<{ ephemeralPublicKey: JsonWebKey, iv: string, ciphertext: string }>} A promise that resolves to the encrypted payload.
 */
export async function encryptHybrid(plaintext: string, recipientPublicKey: CryptoKey): Promise<{ ephemeralPublicKey: JsonWebKey, iv: string, ciphertext: string }> {
    const ephemeralKeyPair = await generateEncryptionKeyPair();
    const sharedSecret = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: recipientPublicKey },
        ephemeralKeyPair.privateKey!,
        AES_ALGO,
        true,
        ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBuffer = textToArrayBuffer(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedSecret, plaintextBuffer);
    
    const ephemeralPublicKeyJwk = await exportKeyJwk(ephemeralKeyPair.publicKey!);

    return {
        ephemeralPublicKey: ephemeralPublicKeyJwk,
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer)
    };
}

/**
 * Decrypts a hybrid-encrypted message using the recipient's private key.
 * @param {{ ephemeralPublicKey: JsonWebKey, iv: string, ciphertext: string }} encrypted - The encrypted payload.
 * @param {CryptoKey} myPrivateKey - The recipient's private ECDH key.
 * @returns {Promise<string>} A promise that resolves to the decrypted plaintext.
 */
export async function decryptHybrid(encrypted: { ephemeralPublicKey: JsonWebKey, iv: string, ciphertext: string }, myPrivateKey: CryptoKey): Promise<string> {
    const ephemeralPublicKey = await importEncryptionKey(encrypted.ephemeralPublicKey, []);
    const sharedSecret = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: ephemeralPublicKey },
        myPrivateKey,
        AES_ALGO,
        true,
        ['decrypt']
    );

    const iv = base64ToBuffer(encrypted.iv);
    const ciphertext = base64ToBuffer(encrypted.ciphertext);

    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedSecret, ciphertext);
    return arrayBufferToText(decryptedBuffer);
}


// --- UTILITY FUNCTIONS ---

/** Converts an ArrayBuffer to a UTF-8 string. */
export function arrayBufferToText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/** Converts a UTF-8 string to an ArrayBuffer. */
export function textToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text);
}

/** Converts an ArrayBuffer to a Base64 string. */
function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Converts a Base64 string to an ArrayBuffer. */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Converts an ArrayBuffer to a hexadecimal string. */
function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates that a given object contains valid public signing and encryption keys.
 * @param {any} keyData - The object to validate, typically from a parsed JSON file.
 * @returns {Promise<{ signingPublicKey: JsonWebKey, encryptionPublicKey: JsonWebKey }>} An object with the validated public keys.
 * @throws {Error} if the keys are missing or fail to import.
 */
export async function validatePublicKeys(keyData: any): Promise<{ signingPublicKey: JsonWebKey, encryptionPublicKey: JsonWebKey }> {
    if (!keyData.signing?.publicKey || !keyData.encryption?.publicKey) {
        throw new Error("Invalid key file. Must contain public signing and encryption keys.");
    }
    // These `importKey` calls will throw an error if the keys are malformed or invalid.
    await importSigningKey(keyData.signing.publicKey, 'verify');
    await importEncryptionKey(keyData.encryption.publicKey, []);

    return {
        signingPublicKey: keyData.signing.publicKey,
        encryptionPublicKey: keyData.encryption.publicKey,
    };
}
