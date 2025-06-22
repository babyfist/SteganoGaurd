# **App Name**: SteganoGuard

## Core Features:

- Keypair Generation: Generate a cryptographic keypair locally and allow users to save it.
- Keypair Loading: Load an existing keypair from a file for signing and decryption.
- Message Encryption: Encrypt a message using a password and the sender's private key.
- Multiple Messages Embedding: Embed multiple messages, each targeted to a specific receiver using their public key.
- Password Fallback Decryption: Extract a default plaintext message from the image using a password.
- Steganographic Embedding: Embed the encrypted message, receiver's public keys, and a signature into an image using LSB steganography; also visibly overlay the sender’s public key on the image.
- Message Decoding and Verification: Extract default text, decrypt specific messages using the receiver’s private key, and verify signatures with the sender’s public key, all performed locally in the browser.

## Style Guidelines:

- Primary color: Deep violet (#7957D6), offering a sense of sophistication and security relevant to encryption.
- Background color: Light lavender (#F0EFFF), subtly tinted towards violet for consistency but light enough for comfortable contrast.
- Accent color: Soft periwinkle (#9CA1D6), providing gentle visual cues without overwhelming the main elements.
- Body and headline font: 'Inter', a grotesque-style sans-serif, to maintain a clean, modern, and neutral aesthetic, ideal for both headlines and body text.
- Use minimalist, geometric icons to represent encoding, decoding, and key management functions.
- A clean and intuitive layout with a clear separation of encoding and decoding functions, using a step-by-step workflow.
- Subtle animations to indicate the progress of encoding and decoding processes.