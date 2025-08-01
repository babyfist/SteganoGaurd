
'use client';

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
 *   user's password using PBKDF2 with a random salt for each encryption.
 */

// --- ALGORITHM DEFINITIONS ---

const SIGN_ALGO = { name: 'Ed25519' };
const ENCRYPT_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const AES_ALGO = { name: 'AES-GCM', length: 256 };
const PBKDF2_PARAMS_BASE = {
  name: 'PBKDF2',
  iterations: 100000,
  hash: 'SHA-256',
};


// --- KEY GENERATION ---

/**
 * Generates a new Ed25519 key pair for digital signatures.
 * @returns {Promise<CryptoKeyPair>} A promise that resolves to a CryptoKeyPair containing a publicKey and privateKey.
 */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(SIGN_ALGO, true, ['sign', 'verify']) as CryptoKeyPair;
}

/**
 * Generates a new ECDH P-256 key pair for encryption key agreement.
 * @returns {Promise<CryptoKeyPair>} A promise that resolves to a CryptoKeyPair.
 */
export async function generateEncryptionKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(ENCRYPT_ALGO, true, ['deriveKey']) as CryptoKeyPair;
}


// --- KEY IMPORT/EXPORT ---

/**
 * Imports a signing key from JWK format.
 * @param {Record<string, any>} keyData - The key in JSON Web Key format.
 * @param {'sign' | 'verify'} [usage='verify'] - The intended use of the key.
 * @returns {Promise<CryptoKey>} A promise that resolves to an importable CryptoKey.
 */
export async function importSigningKey(keyData: Record<string, any>, usage: 'sign' | 'verify' = 'verify'): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey('jwk', keyData, SIGN_ALGO, true, [usage]);
}

/**
 * Imports an encryption key from JWK format.
 * @param {Record<string, any>} keyData - The key in JSON Web Key format.
 * @param {KeyUsage[]} [usages=['deriveKey']] - The intended uses of the key.
 * @returns {Promise<CryptoKey>} A promise that resolves to an importable CryptoKey.
 */
export async function importEncryptionKey(keyData: Record<string, any>, usages: KeyUsage[] = ['deriveKey']): Promise<CryptoKey> {
    return await window.crypto.subtle.importKey('jwk', keyData, ENCRYPT_ALGO, true, usages);
}

/**
 * Exports a CryptoKey to its JSON Web Key (JWK) representation.
 * @param {CryptoKey} key - The CryptoKey to export.
 * @returns {Promise<Record<string, any>>} A promise that resolves to the JWK object.
 */
export async function exportKeyJwk(key: CryptoKey): Promise<Record<string, any>> {
  return await window.crypto.subtle.exportKey('jwk', key);
}


// --- HASHING ---

/**
 * Creates a SHA-256 hash of a public key's essential components.
 * This provides a consistent, unique identifier for a given public key.
 * It handles both EC (encryption) and OKP (signing) key types.
 * @param {Record<string, any>} publicKeyJwk - The public key to hash.
 * @returns {Promise<string>} A promise that resolves to the hex-encoded hash string.
 * @throws {Error} if the key is not a supported format or is missing required properties.
 */
export async function getPublicKeyHash(publicKeyJwk: Record<string, any>): Promise<string> {
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
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', keyBuffer);
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
  return await window.crypto.subtle.sign(SIGN_ALGO, privateSigningKey, data);
}

/**
 * Verifies a signature against the original data and a public key.
 * @param {CryptoKey} publicSigningKey - The public Ed25519 key to verify with.
 * @param {ArrayBuffer} signature - The signature to verify.
 * @param {ArrayBuffer} data - The data that was originally signed.
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise.
 */
export async function verifySignature(publicSigningKey: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer): Promise<boolean> {
  return await window.crypto.subtle.verify(SIGN_ALGO, publicSigningKey, signature, data);
}


// --- SYMMETRIC ENCRYPTION (Password-based) ---

/**
 * Derives an AES-GCM encryption key from a user-provided password and a salt using PBKDF2.
 * @param {string} password - The user's password.
 * @param {Uint8Array} salt - A random salt.
 * @returns {Promise<CryptoKey>} A promise that resolves to the derived AES-256 key.
 */
async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBuffer = textToArrayBuffer(password);
  const masterKey = await window.crypto.subtle.importKey('raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveKey']);
  const pbkdf2Params = { ...PBKDF2_PARAMS_BASE, salt };
  return await window.crypto.subtle.deriveKey(pbkdf2Params, masterKey, AES_ALGO, true, ['encrypt', 'decrypt']);
}

/**
 * Encrypts a plaintext string using a password. Generates a random salt for each encryption.
 * @param {string} plaintext - The text to encrypt.
 * @param {string} password - The password to use for encryption.
 * @returns {Promise<{ salt: string, iv: string, ciphertext: string }>} A promise that resolves to an object with the base64-encoded salt, IV, and ciphertext.
 */
export async function encryptSymmetric(plaintext: string, password: string): Promise<{ salt: string, iv: string, ciphertext: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassword(password, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is recommended for AES-GCM.
  const plaintextBuffer = textToArrayBuffer(plaintext);
  const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBuffer);

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypts a ciphertext string using a password and the associated salt.
 * @param {{ salt: string, iv: string, ciphertext: string }} encrypted - The encrypted data object.
 * @param {string} password - The password to use for decryption.
 * @returns {Promise<string>} A promise that resolves to the decrypted plaintext string.
 * @throws {DOMException} if decryption fails (e.g., wrong password).
 */
export async function decryptSymmetric(encrypted: { salt: string, iv: string, ciphertext: string }, password: string): Promise<string> {
  const salt = base64ToBuffer(encrypted.salt);
  const key = await deriveKeyFromPassword(password, salt);
  const iv = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.ciphertext);
  const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return arrayBufferToText(decryptedBuffer);
}


// --- HYBRID ENCRYPTION (Asymmetric) ---

/**
 * Encrypts a plaintext string for a recipient using their public encryption key.
 * This is a hybrid method: ECDH is used to create a shared secret, which then encrypts the data with AES-GCM.
 * @param {string} plaintext - The secret message to encrypt.
 * @param {CryptoKey} recipientPublicKey - The recipient's public ECDH key.
 * @returns {Promise<{ ephemeralPublicKey: Record<string, any>, iv: string, ciphertext: string }>} A promise that resolves to the encrypted payload.
 */
export async function encryptHybrid(plaintext: string, recipientPublicKey: CryptoKey): Promise<{ ephemeralPublicKey: Record<string, any>, iv: string, ciphertext: string }> {
    const ephemeralKeyPair = await generateEncryptionKeyPair();
    const sharedSecret = await window.crypto.subtle.deriveKey(
        { name: 'ECDH', public: recipientPublicKey },
        ephemeralKeyPair.privateKey,
        AES_ALGO,
        true,
        ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintextBuffer = textToArrayBuffer(plaintext);
    const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedSecret, plaintextBuffer);
    
    const ephemeralPublicKeyJwk = await exportKeyJwk(ephemeralKeyPair.publicKey);

    return {
        ephemeralPublicKey: ephemeralPublicKeyJwk,
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertextBuffer)
    };
}

/**
 * Decrypts a hybrid-encrypted message using the recipient's private key.
 * @param {{ ephemeralPublicKey: Record<string, any>, iv: string, ciphertext: string }} encrypted - The encrypted payload.
 * @param {CryptoKey} myPrivateKey - The recipient's private ECDH key.
 * @returns {Promise<string>} A promise that resolves to the decrypted plaintext.
 */
export async function decryptHybrid(encrypted: { ephemeralPublicKey: Record<string, any>, iv: string, ciphertext: string }, myPrivateKey: CryptoKey): Promise<string> {
    const ephemeralPublicKey = await importEncryptionKey(encrypted.ephemeralPublicKey, []);
    const sharedSecret = await window.crypto.subtle.deriveKey(
        { name: 'ECDH', public: ephemeralPublicKey },
        myPrivateKey,
        AES_ALGO,
        true,
        ['decrypt']
    );

    const iv = base64ToBuffer(encrypted.iv);
    const ciphertext = base64ToBuffer(encrypted.ciphertext);

    const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedSecret, ciphertext);
    return arrayBufferToText(decryptedBuffer);
}


// --- UTILITY FUNCTIONS ---

/**
 * Converts an ArrayBuffer to a UTF-8 string.
 * @param {ArrayBuffer} buffer - The buffer to convert.
 * @returns {string} The resulting string.
 */
export function arrayBufferToText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/**
 * Converts a UTF-8 string to an ArrayBuffer.
 * @param {string} text - The string to convert.
 * @returns {ArrayBuffer} The resulting buffer.
 */
export function textToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text);
}

/**
 * Converts an ArrayBuffer to a Base64 string using a browser-safe method.
 * @param {ArrayBuffer} buffer - The buffer to convert.
 * @returns {string} The Base64-encoded string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Converts a Base64 string to a Uint8Array using a browser-safe method.
 * @param {string} base64 - The Base64 string to convert.
 * @returns {Uint8Array} The resulting byte array.
 */
function base64ToBuffer(base64: string): Uint8Array {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}


/**
 * Converts an ArrayBuffer to a hexadecimal string.
 * @param {ArrayBuffer} buffer The buffer to convert.
 * @returns {string} The hex-encoded string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates that a given object contains valid public signing and encryption keys.
 * This is used when importing contacts to ensure the key data is well-formed.
 * @param {any} keyData - The object to validate, typically from a parsed JSON file.
 * @returns {Promise<{ signingPublicKey: Record<string, any>, encryptionPublicKey: Record<string, any> }>} An object with the validated public keys.
 * @throws {Error} if the keys are missing or fail to import.
 */
export async function validatePublicKeys(keyData: any): Promise<{ signingPublicKey: Record<string, any>, encryptionPublicKey: Record<string, any> }> {
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
