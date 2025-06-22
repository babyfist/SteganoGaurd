
const SIGN_ALGO = { name: 'Ed25519' };
const ENCRYPT_ALGO = { name: 'ECDH', namedCurve: 'P-256' };
const AES_ALGO = { name: 'AES-GCM', length: 256 };
const PBKDF2_PARAMS = {
  name: 'PBKDF2',
  salt: new Uint8Array(16), // NOTE: A fixed salt is not secure. In a real app, generate and store a unique salt for each password.
  iterations: 100000,
  hash: 'SHA-256',
};

// Key Generation
export async function generateSigningKeyPair() {
  return await crypto.subtle.generateKey(SIGN_ALGO, true, ['sign', 'verify']);
}

export async function generateEncryptionKeyPair() {
  return await crypto.subtle.generateKey(ENCRYPT_ALGO, true, ['deriveKey']);
}

// Key Import/Export
export async function importSigningKey(keyData: JsonWebKey, usage: 'sign' | 'verify' = 'verify') {
  return await crypto.subtle.importKey('jwk', keyData, SIGN_ALGO, true, [usage]);
}

export async function importEncryptionKey(keyData: JsonWebKey, usages: KeyUsage[] = ['deriveKey']) {
    return await crypto.subtle.importKey('jwk', keyData, ENCRYPT_ALGO, true, usages);
}

export async function exportKeyJwk(key: CryptoKey) {
  return await crypto.subtle.exportKey('jwk', key);
}

// Hashing
export async function getPublicKeyHash(publicKeyJwk: JsonWebKey): Promise<string> {
    // Manually construct a string from the essential components in a fixed order.
    // This avoids any ambiguity from JSON.stringify's property ordering.
    if (!publicKeyJwk.crv || !publicKeyJwk.kty || !publicKeyJwk.x || !publicKeyJwk.y) {
        throw new Error("Cannot hash JWK: missing one or more required properties (crv, kty, x, y).");
    }
    const keyString = `${publicKeyJwk.crv}|${publicKeyJwk.kty}|${publicKeyJwk.x}|${publicKeyJwk.y}`;
    const keyBuffer = textToArrayBuffer(keyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    return bufferToHex(hashBuffer);
}

// Signature
export async function signData(privateSigningKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  return await crypto.subtle.sign(SIGN_ALGO, privateSigningKey, data);
}

export async function verifySignature(publicSigningKey: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer): Promise<boolean> {
  return await crypto.subtle.verify(SIGN_ALGO, publicSigningKey, signature, data);
}

// Symmetric Encryption (Password-based)
async function deriveKeyFromPassword(password: string): Promise<CryptoKey> {
  const passwordBuffer = textToArrayBuffer(password);
  const masterKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    PBKDF2_PARAMS,
    masterKey,
    AES_ALGO,
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSymmetric(plaintext: string, password: string): Promise<{ iv: string, ciphertext: string }> {
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBuffer = textToArrayBuffer(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBuffer);

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

export async function decryptSymmetric(encrypted: { iv: string, ciphertext: string }, password: string): Promise<string> {
  const key = await deriveKeyFromPassword(password);
  const iv = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.ciphertext);
  const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return arrayBufferToText(decryptedBuffer);
}

// Hybrid Encryption (Asymmetric)
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

// Utils
export function arrayBufferToText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

export function textToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const buf = Buffer.from(base64, 'base64');
  // The buffer may be a view on a larger ArrayBuffer, so we need to slice it
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function downloadJson(data: object, filename: string) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

export async function validatePublicKeys(keyData: any): Promise<{ signingPublicKey: JsonWebKey, encryptionPublicKey: JsonWebKey }> {
    if (!keyData.signing?.publicKey || !keyData.encryption?.publicKey) {
        throw new Error("Invalid key file. Must contain public signing and encryption keys.");
    }
    // These will throw if keys are invalid/malformed
    await importSigningKey(keyData.signing.publicKey, 'verify');
    await importEncryptionKey(keyData.encryption.publicKey, []);

    return {
        signingPublicKey: keyData.signing.publicKey,
        encryptionPublicKey: keyData.encryption.publicKey,
    };
}
