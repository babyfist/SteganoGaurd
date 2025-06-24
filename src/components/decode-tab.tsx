
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { decryptSymmetric, decryptHybrid, importSigningKey, importEncryptionKey, verifySignature, arrayBufferToText, getPublicKeyHash } from '@/lib/crypto';
import { IdentityKeyPair } from '@/lib/types';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Upload, KeyRound, Lock, ShieldCheck, FileWarning, Loader2, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

/** The fixed length of an Ed25519 signature in bytes. */
const SIGNATURE_LENGTH_BYTES = 64; 

/** Defines the structure of the decoded, but not yet decrypted, data from a file. */
type DecodedData = {
  senderPublicKey?: JsonWebKey;
  decoy: { iv: string; ciphertext: string; };
  messages: { recipientPublicKeyHash: string; ephemeralPublicKey: JsonWebKey; iv: string; ciphertext:string; }[];
};

/** Defines the structure for storing a successfully decrypted message along with the identity used. */
type DecryptionResult = {
  identityName: string;
  message: string;
};

/**
 * The DecodeTab component handles the logic for decoding and decrypting messages from steganographic files.
 * It allows users to upload a file, verifies its signature (if present), and decrypts both the decoy
 * and the secret message using the user's stored identities.
 */
export default function DecodeTab() {
  // --- STATE MANAGEMENT ---
  const [stegoFile, setStegoFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [decryptedDecoy, setDecryptedDecoy] = useState('');
  const [decryptionResults, setDecryptionResults] = useState<DecryptionResult[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [decodedData, setDecodedData] = useState<DecodedData | null>(null);
  const [signatureState, setSignatureState] = useState<'valid' | 'invalid' | 'unsigned' | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Load user identities from local storage.
  const [identities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);

  // Refs for file input and toast notifications.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Effect to ensure component is mounted before accessing client-side APIs like localStorage.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * Main effect to process the uploaded file. It triggers whenever `stegoFile` changes.
   * This function extracts the hidden data, verifies the signature, and updates the component's state.
   */
  useEffect(() => {
    const processFile = async () => {
      if (!stegoFile) return;

      // Reset state for the new file processing.
      setIsLoading(true);
      setError('');
      setDecodedData(null);
      setDecryptedDecoy('');
      setDecryptionResults([]);
      setSignatureState(null);
      setPassword('');

      try {
        // Dynamically import steganography functions to avoid server-side execution.
        const { extractDataFromPng, extractDataFromGenericFile } = await import('@/lib/steganography');
        
        // Extract the hidden ArrayBuffer from the file.
        let extractedBuffer: ArrayBuffer;
        if (stegoFile.type.startsWith('image/')) {
            extractedBuffer = await extractDataFromPng(stegoFile);
        } else {
            extractedBuffer = await extractDataFromGenericFile(stegoFile);
        }

        // First, try to parse the buffer as an unsigned message.
        // This is a quick check to see if it's a JSON object without a signature.
        try {
            const potentialUnsignedJson = arrayBufferToText(extractedBuffer);
            const potentialUnsignedData: DecodedData = JSON.parse(potentialUnsignedJson);
            if (potentialUnsignedData.decoy && potentialUnsignedData.messages && !potentialUnsignedData.senderPublicKey) {
                setDecodedData(potentialUnsignedData);
                setSignatureState('unsigned');
                toast({ title: "Success", description: "Unsigned file data extracted." });
                setIsLoading(false);
                return;
            }
        } catch (e) {
            // This is expected for signed files, so we can ignore this error and continue.
        }
        
        // If it's not a simple unsigned message, assume it's signed.
        // The signature is appended to the JSON payload.
        const payloadLength = extractedBuffer.byteLength - SIGNATURE_LENGTH_BYTES;
        if (payloadLength <= 0) {
            throw new Error("Extracted data is too small to contain a signature.");
        }
        
        // Separate the payload and the signature.
        const payloadBuffer = extractedBuffer.slice(0, payloadLength);
        const signatureBuffer = extractedBuffer.slice(payloadLength);
        
        const dataJson = arrayBufferToText(payloadBuffer);
        const data: DecodedData = JSON.parse(dataJson);

        if (!data.senderPublicKey) {
            throw new Error("Data appears to be signed but is missing sender's public key.");
        }

        // Verify the signature.
        const senderSigningKey = await importSigningKey(data.senderPublicKey, 'verify');
        const verified = await verifySignature(senderSigningKey, signatureBuffer, payloadBuffer);
        
        if (verified) {
            setDecodedData(data);
            setSignatureState('valid');
            toast({ title: "Success", description: "File data extracted and signature verified." });
        } else {
            setDecodedData(null); // Don't process data with an invalid signature.
            setSignatureState('invalid');
            toast({ variant: "destructive", title: "Verification Failed", description: "The file signature is invalid."})
        }
      } catch (err) {
        // This catch block handles expected errors from file processing (e.g., not a valid SteganoGuard file).
        // It displays an error in the UI instead of logging to the console or showing a toast.
        setError("This file cannot be decoded. Please select a valid SteganoGuard file that has not been modified.");
        setSignatureState(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (isMounted) {
      processFile();
    }
  }, [stegoFile, isMounted, toast]);

  /**
   * Handles the decryption of the public "decoy" message using the provided password.
   */
  const handleDecoyDecrypt = async () => {
    if (!decodedData || !password) {
      setError("Please enter the password.");
      return;
    }
    setIsLoading(true);
    setError('');
    setDecryptedDecoy('');

    try {
      const decrypted = await decryptSymmetric(decodedData.decoy, password);
      setDecryptedDecoy(decrypted);
      toast({ title: "Decoy Decrypted", description: "The decoy message has been revealed." });
    } catch (err) {
        // Decryption errors (like wrong password) throw a DOMException with name 'OperationError'.
        // We can treat this as an expected failure and give a specific message.
        if (err instanceof DOMException && err.name === 'OperationError') {
            setError("Failed to decrypt decoy message. The password appears to be incorrect.");
            toast({ variant: "destructive", title: "Decryption Failed", description: "Incorrect password. Please try again." });
        } else {
            // For any other unexpected errors, log them and show a generic message.
            console.error("Decryption error:", err);
            setError("An unexpected error occurred while decrypting the decoy message.");
            toast({ variant: "destructive", title: "Decryption Error", description: "An unexpected error occurred." });
        }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles the decryption of the secret message. It iterates through all of the user's stored
   * identities and tries to decrypt any message intended for them.
   */
  const handleMessageDecrypt = async () => {
    if (!decodedData) {
      setError("Please upload and process a file first.");
      return;
    }
     if (signatureState === 'invalid') {
        setError("Cannot decrypt message, signature is invalid.");
        return;
    }
    if (isMounted && identities.length === 0) {
        setError("No identities found. Please add or import an identity in the Key Management tab.");
        return;
    }
    setIsLoading(true);
    setError('');
    setDecryptionResults([]);

    try {
        let foundAnyMessage = false;
        let localDecryptionError = '';
        const successfulDecryptions: DecryptionResult[] = [];

        // Iterate through each of the user's identities.
        for (const identity of identities) {
            const myPublicKeyJwk = identity.encryption.publicKey;
            const myKeyHash = await getPublicKeyHash(myPublicKeyJwk);
            
            // Find if there's a message in the payload for this identity.
            const myMessageData = decodedData.messages.find(m => m.recipientPublicKeyHash === myKeyHash);

            if (myMessageData) {
                foundAnyMessage = true;
                try {
                    // If a message is found, attempt to decrypt it with the identity's private key.
                    const myPrivateKey = await importEncryptionKey(identity.encryption.privateKey, ['deriveKey']);
                    const decrypted = await decryptHybrid(myMessageData, myPrivateKey);
                    successfulDecryptions.push({ identityName: identity.name, message: decrypted });
                } catch (e) {
                    console.error(`Decryption failed for identity "${identity.name}":`, e);
                    localDecryptionError = `Found a message for identity "${identity.name}", but it could not be decrypted. The key may be incorrect or the data corrupted.`;
                }
            }
        }
        
        setDecryptionResults(successfulDecryptions);

        if (successfulDecryptions.length > 0) {
            toast({ title: "Decryption Complete", description: `Successfully decrypted ${successfulDecryptions.length} message(s).` });
        }
        
        if (!foundAnyMessage) {
            setError("No message found for any of your identities in this file.");
        } else if (successfulDecryptions.length === 0 && localDecryptionError) {
             // If a message was found but couldn't be decrypted, show an error.
            setError(localDecryptionError);
            toast({ variant: "destructive", title: "Decryption Issue", description: localDecryptionError });
        }

    } catch (err) {
      console.error(err);
      const errorMessage = (err as Error).message;
      setError(`Failed to decrypt message. Error: ${errorMessage}`);
      toast({ variant: "destructive", title: "Decryption Failed", description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Renders a status alert based on the signature verification result.
   * @returns {React.ReactNode | null} The alert component or null.
   */
  const renderSignatureAlert = () => {
    if (!signatureState) return null;

    switch (signatureState) {
        case 'valid':
            return (
                <Alert>
                    <ShieldCheck className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">Signature Verified</AlertTitle>
                    <AlertDescription>The integrity of the hidden data is confirmed.</AlertDescription>
                </Alert>
            );
        case 'invalid':
            return (
                <Alert variant="destructive">
                    <FileWarning className="h-4 w-4" />
                    <AlertTitle>Signature Invalid!</AlertTitle>
                    <AlertDescription>The file's digital signature does not match its content. This indicates the data may have been tampered with or corrupted. For security, message decryption is disabled.</AlertDescription>
                </Alert>
            );
        case 'unsigned':
            return (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Unsigned Message</AlertTitle>
                    <AlertDescription>This file contains a hidden message but does not have a digital signature to verify its origin or integrity.</AlertDescription>
                </Alert>
            );
        default:
            return null;
    }
  };

  // --- RENDER LOGIC ---
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decode & Verify</CardTitle>
        <CardDescription>Upload a file to extract and decrypt hidden messages using your stored identities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="stego-file-upload">1. Upload Steganographic File</Label>
          <Input id="stego-file-upload" type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx" ref={fileInputRef} onChange={(e) => setStegoFile(e.target.files?.[0] || null)} className="hidden" />
          <Label htmlFor="stego-file-upload" className={cn(buttonVariants({ variant: 'outline' }), 'w-full cursor-pointer font-normal')}>
            <Upload className="w-4 h-4 mr-2" />
            {stegoFile ? stegoFile.name : 'Select File'}
          </Label>
        </div>

        {isLoading && !decodedData && !error && (
            <div className="flex items-center justify-center space-x-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" /> 
                <span>Processing File...</span>
            </div>
        )}

        {renderSignatureAlert()}

        {decodedData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              {/* Decoy Message Section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">2. Decrypt Decoy Message</h3>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="Enter password for decoy" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button onClick={handleDecoyDecrypt} disabled={isLoading || !password} className="w-full">
                  {isLoading && !decryptedDecoy ? <Loader2 className="animate-spin" /> : <Lock />}
                  Decrypt Decoy
                </Button>
                {decryptedDecoy && (
                  <Alert>
                    <AlertTitle>Decrypted Decoy Message</AlertTitle>
                    <AlertDescription className="break-words select-all">{decryptedDecoy}</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Secret Message Section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">3. Decrypt Your Message</h3>
                 <p className="text-sm text-muted-foreground">The app will automatically try all of your saved identities to find and decrypt your message.</p>
                <Button onClick={handleMessageDecrypt} disabled={isLoading || signatureState === 'invalid' || !isMounted || identities.length === 0} className="w-full">
                   {isLoading && decryptionResults.length === 0 ? <Loader2 className="animate-spin" /> : <Lock />}
                  Decrypt Message
                </Button>
                 {!isMounted ? (
                     <Alert><Loader2 className="h-4 w-4 animate-spin" /> <AlertDescription>Loading identities...</AlertDescription></Alert>
                 ) : identities.length === 0 && <Alert variant="destructive"><AlertDescription>No identities found. Add one in the Key Management tab.</AlertDescription></Alert>}
                
                {/* Render multiple decryption results if found */}
                {decryptionResults.length > 0 && (
                  <Alert>
                    <AlertTitle>Decrypted Secret Message(s)</AlertTitle>
                    <AlertDescription asChild>
                       <div className="space-y-3 mt-2">
                        {decryptionResults.map((result, index) => (
                            <div key={index} className="border-t pt-3 first:border-t-0 first:pt-0">
                                <p className="text-sm text-muted-foreground mb-1">
                                    Decrypted using identity: <span className="font-semibold text-primary">{result.identityName}</span>
                                </p>
                                <p className="break-words select-all text-foreground">{result.message}</p>
                            </div>
                        ))}
                       </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
            <Alert variant="destructive" className="mt-4">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
      </CardContent>
    </Card>
  );
}
