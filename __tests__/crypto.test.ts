import {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  importSigningKey,
  importEncryptionKey,
  exportKeyJwk,
  getPublicKeyHash,
  signData,
  verifySignature,
  encryptSymmetric,
  decryptSymmetric,
  encryptHybrid,
  decryptHybrid,
  validatePublicKeys,
  textToArrayBuffer,
} from '@/lib/crypto';

describe('SteganoGuard Crypto Library', () => {
  describe('Key Generation', () => {
    it('should generate a valid Ed25519 signing key pair', async () => {
      const keyPair = await generateSigningKeyPair();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm.name).toBe('Ed25519');
      expect(keyPair.privateKey.algorithm.name).toBe('Ed25519');
      expect(keyPair.publicKey.usages).toContain('verify');
      expect(keyPair.privateKey.usages).toContain('sign');
    });

    it('should generate a valid ECDH P-256 encryption key pair', async () => {
      const keyPair = await generateEncryptionKeyPair();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.algorithm.name).toBe('ECDH');
      expect((keyPair.publicKey.algorithm as EcKeyGenParams).namedCurve).toBe('P-256');
      expect(keyPair.privateKey.algorithm.name).toBe('ECDH');
      expect((keyPair.privateKey.algorithm as EcKeyGenParams).namedCurve).toBe('P-256');
      expect(keyPair.publicKey.usages).toEqual([]); // ECDH public keys have no specific usages
      expect(keyPair.privateKey.usages).toContain('deriveKey');
    });
  });

  describe('Key Import/Export and Hashing', () => {
    it('should export and import signing keys correctly', async () => {
      const { publicKey, privateKey } = await generateSigningKeyPair();
      const publicJwk = await exportKeyJwk(publicKey);
      const privateJwk = await exportKeyJwk(privateKey);

      const importedPublic = await importSigningKey(publicJwk, 'verify');
      const importedPrivate = await importSigningKey(privateJwk, 'sign');

      expect(importedPublic.type).toBe('public');
      expect(importedPrivate.type).toBe('private');
      expect(importedPublic.algorithm.name).toBe('Ed25519');
    });

    it('should export and import encryption keys correctly', async () => {
      const { publicKey, privateKey } = await generateEncryptionKeyPair();
      const publicJwk = await exportKeyJwk(publicKey);
      const privateJwk = await exportKeyJwk(privateKey);

      const importedPublic = await importEncryptionKey(publicJwk, []);
      const importedPrivate = await importEncryptionKey(privateJwk, ['deriveKey']);

      expect(importedPublic.type).toBe('public');
      expect(importedPrivate.type).toBe('private');
      expect(importedPublic.algorithm.name).toBe('ECDH');
    });

    it('should generate a consistent hash for a given public key', async () => {
      const { publicKey: signingKey } = await generateSigningKeyPair();
      const signingJwk = await exportKeyJwk(signingKey);
      const hash1 = await getPublicKeyHash(signingJwk);
      const hash2 = await getPublicKeyHash(signingJwk);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash format

      const { publicKey: encKey } = await generateEncryptionKeyPair();
      const encJwk = await exportKeyJwk(encKey);
      const hash3 = await getPublicKeyHash(encJwk);
      expect(hash3).not.toBe(hash1);
      expect(hash3).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Digital Signatures', () => {
    it('should sign data and verify the signature successfully', async () => {
      const { publicKey, privateKey } = await generateSigningKeyPair();
      const data = textToArrayBuffer('This is a test message');
      const signature = await signData(privateKey, data);
      const isValid = await verifySignature(publicKey, signature, data);
      expect(isValid).toBe(true);
    });

    it('should fail to verify a signature with incorrect data', async () => {
      const { publicKey, privateKey } = await generateSigningKeyPair();
      const data = textToArrayBuffer('This is a test message');
      const wrongData = textToArrayBuffer('This is the wrong message');
      const signature = await signData(privateKey, data);
      const isValid = await verifySignature(publicKey, signature, wrongData);
      expect(isValid).toBe(false);
    });

    it('should fail to verify a signature with a different public key', async () => {
        const { privateKey } = await generateSigningKeyPair();
        const { publicKey: wrongPublicKey } = await generateSigningKeyPair();
        const data = textToArrayBuffer('This is a test message');
        const signature = await signData(privateKey, data);
        const isValid = await verifySignature(wrongPublicKey, signature, data);
        expect(isValid).toBe(false);
      });
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt a message with the correct password', async () => {
      const plaintext = 'Secret symmetric message';
      const password = 'strong-password-123';
      const encrypted = await encryptSymmetric(plaintext, password);
      const decrypted = await decryptSymmetric(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt a message with the wrong password', async () => {
      const plaintext = 'Secret symmetric message';
      const password = 'strong-password-123';
      const wrongPassword = 'wrong-password';
      const encrypted = await encryptSymmetric(plaintext, password);
      await expect(decryptSymmetric(encrypted, wrongPassword)).rejects.toThrow();
    });
  });

  describe('Hybrid Encryption', () => {
    it('should encrypt and decrypt a message successfully between two parties', async () => {
      const recipientKeys = await generateEncryptionKeyPair();
      const plaintext = 'Super secret hybrid message';

      const encrypted = await encryptHybrid(plaintext, recipientKeys.publicKey);
      const decrypted = await decryptHybrid(encrypted, recipientKeys.privateKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt if a different private key is used', async () => {
        const recipientKeys = await generateEncryptionKeyPair();
        const attackerKeys = await generateEncryptionKeyPair();
        const plaintext = 'Super secret hybrid message';
  
        const encrypted = await encryptHybrid(plaintext, recipientKeys.publicKey);
        
        await expect(decryptHybrid(encrypted, attackerKeys.privateKey)).rejects.toThrow();
    });
  });

  describe('Public Key Validation', () => {
    it('should successfully validate a correct public key object', async () => {
        const signing = await generateSigningKeyPair();
        const encryption = await generateEncryptionKeyPair();
        const keyData = {
            signing: { publicKey: await exportKeyJwk(signing.publicKey) },
            encryption: { publicKey: await exportKeyJwk(encryption.publicKey) },
        };
        await expect(validatePublicKeys(keyData)).resolves.toBeDefined();
    });

    it('should throw an error for missing keys', async () => {
        const keyData = { signing: {} }; // Missing encryption key
        await expect(validatePublicKeys(keyData)).rejects.toThrow('Invalid key file. Must contain public signing and encryption keys.');
    });

    it('should throw an error for corrupted/invalid key data', async () => {
        const keyData = {
            signing: { publicKey: { kty: 'invalid' } },
            encryption: { publicKey: { kty: 'invalid' } },
        };
        await expect(validatePublicKeys(keyData)).rejects.toThrow();
    });
  });
});
