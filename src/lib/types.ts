
/**
 * @fileoverview This file contains all the core TypeScript types and interfaces used throughout the SteganoGuard application.
 * It defines the data structures for cryptographic keys, user identities, contacts, and the payload for hidden messages.
 */

/**
 * Represents a JWK (JSON Web Key) key pair for digital signatures (e.g., Ed25519).
 * Contains both the public and private key components.
 */
export type SigningKeyPairJwk = {
  publicKey: Record<string, any>;
  privateKey: Record<string, any>;
};

/**
 * Represents a JWK (JSON Web Key) key pair for encryption (e.g., ECDH).
 * Contains both the public and private key components.
 */
export type EncryptionKeyPairJwk = {
  publicKey: Record<string, any>;
  privateKey: Record<string, any>;
};

/**
 * Represents a user's complete cryptographic identity.
 * It includes their unique ID, a user-friendly name, key pairs for both signing and encryption,
 * and a list of their trusted contacts. This is the primary object stored for each user identity.
 */
export type IdentityKeyPair = {
  id: string;
  name: string;
  description: string;
  signing: SigningKeyPairJwk;
  encryption: EncryptionKeyPairJwk;
  contacts: Contact[];
};

/**
 * Represents a contact's public key information.
 * This is used to encrypt messages for the contact and verify their signatures.
 * Only public keys are stored to ensure security.
 */
export type Contact = {
  id: string;
  name: string;
  // We only store the public part of the contact's keys
  signingPublicKey: Record<string, any>;
  encryptionPublicKey: Record<string, any>;
};

/**
 * Defines the structure of the data payload that is hidden within a file.
 * This object is serialized to JSON before being embedded.
 */
export type SteganoPayload = {
    /** The sender's public signing key, included if the message is signed. */
    senderPublicKey?: Record<string, any>;
    /** The publicly decryptable "decoy" message. */
    decoy: { iv: string; ciphertext: string; };
    /** An array of encrypted messages, one for each recipient. */
    messages: { 
        /** A hash of the recipient's public key to identify the intended recipient. */
        recipientPublicKeyHash: string; 
        /** The ephemeral public key used for this specific encryption, enabling Perfect Forward Secrecy. */
        ephemeralPublicKey: Record<string, any>; 
        /** The initialization vector used for AES-GCM encryption. */
        iv: string; 
        /** The encrypted secret message ciphertext. */
        ciphertext:string; 
    }[];
}
