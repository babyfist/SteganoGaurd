
export type SigningKeyPairJwk = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

export type EncryptionKeyPairJwk = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

// Represents the user's own key pairs, including private keys, as an "identity"
export type IdentityKeyPair = {
  id: string;
  name: string;
  description: string;
  signing: SigningKeyPairJwk;
  encryption: EncryptionKeyPairJwk;
};

// Represents a contact's public information for sending messages
export type Contact = {
  id: string;
  name: string;
  // We only store the public part of the contact's keys
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
};
