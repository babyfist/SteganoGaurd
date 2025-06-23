
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { extractDataFromPng, extractDataFromGenericFile } from '@/lib/steganography';
import { decryptSymmetric, decryptHybrid, importSigningKey, importEncryptionKey, verifySignature, arrayBufferToText, getPublicKeyHash } from '@/lib/crypto';
import { IdentityKeyPair } from '@/lib/types';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Upload, KeyRound, Lock, ShieldCheck, FileWarning, Loader2, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const SIGNATURE_LENGTH_BYTES = 64;

type DecodedData = {
  senderPublicKey?: JsonWebKey;
  decoy: { iv: string; ciphertext: string; };
  messages: { recipientPublicKeyHash: string; ephemeralPublicKey: JsonWebKey; iv: string; ciphertext:string; }[];
};

export default function DecodeTab() {
  const [stegoFile, setStegoFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [decryptedDecoy, setDecryptedDecoy] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [decryptionIdentityName, setDecryptionIdentityName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [decodedData, setDecodedData] = useState<DecodedData | null>(null);
  const [signatureState, setSignatureState] = useState<'valid' | 'invalid' | 'unsigned' | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [identities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const processFile = async () => {
      if (!stegoFile) return;

      setIsLoading(true);
      setError('');
      setDecodedData(null);
      setDecryptedDecoy('');
      setDecryptedMessage('');
      setDecryptionIdentityName('');
      setSignatureState(null);
      setPassword('');

      try {
        let extractedBuffer: ArrayBuffer;
        if (stegoFile.type === 'image/png') {
            extractedBuffer = await extractDataFromPng(stegoFile);
        } else {
            extractedBuffer = await extractDataFromGenericFile(stegoFile);
        }

        // Try to parse the whole buffer as JSON. If it works, it's an unsigned message.
        try {
            const potentialUnsignedJson = arrayBufferToText(extractedBuffer);
            const potentialUnsignedData: DecodedData = JSON.parse(potentialUnsignedJson);

            if (potentialUnsignedData.decoy && potentialUnsignedData.messages && !potentialUnsignedData.senderPublicKey) {
                setDecodedData(potentialUnsignedData);
                setSignatureState('unsigned');
                toast({ title: "Success", description: "Unsigned file data extracted." });
                return;
            }
        } catch (e) {
            // This is expected for signed files, so we continue.
        }
        
        // If we're here, it must be a signed payload.
        if (extractedBuffer.byteLength <= SIGNATURE_LENGTH_BYTES) {
            throw new Error("Extracted data is too small to contain a signature.");
        }

        const payloadLength = extractedBuffer.byteLength - SIGNATURE_LENGTH_BYTES;
        const payloadBuffer = extractedBuffer.slice(0, payloadLength);
        const signatureBuffer = extractedBuffer.slice(payloadLength);
        
        const dataJson = arrayBufferToText(payloadBuffer);
        const data: DecodedData = JSON.parse(dataJson);

        if (!data.senderPublicKey) {
            throw new Error("Data appears to be signed but is missing sender's public key.");
        }

        const senderSigningKey = await importSigningKey(data.senderPublicKey, 'verify');
        const verified = await verifySignature(senderSigningKey, signatureBuffer, payloadBuffer);
        
        if (verified) {
            setDecodedData(data);
            setSignatureState('valid');
            toast({ title: "Success", description: "File data extracted and signature verified." });
        } else {
            setDecodedData(null); // Don't process data with an invalid signature
            setSignatureState('invalid');
            toast({ variant: "destructive", title: "Verification Failed", description: "The file signature is invalid."})
        }
      } catch (err) {
        console.error(err);
        setError("Could not read hidden data from this file. Please ensure it's a valid SteganoGuard file that hasn't been modified.");
        toast({ variant: "destructive", title: "File Error", description: "Could not process the selected file." });
        setSignatureState(null);
      } finally {
        setIsLoading(false);
      }
    };
    if (isMounted) {
      processFile();
    }
  }, [stegoFile, isMounted, toast]);

  const handleDecoyDecrypt = async () => {
    if (!decodedData || !password) {
      setError("Please enter the password.");
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const decrypted = await decryptSymmetric(decodedData.decoy, password);
      setDecryptedDecoy(decrypted);
      toast({ title: "Decoy Decrypted", description: "The decoy message has been revealed." });
    } catch (err) {
      console.error(err);
      setError("Failed to decrypt decoy message. Incorrect password?");
       toast({ variant: "destructive", title: "Decryption Failed", description: "Could not decrypt the decoy message. Check the password and try again." });
    } finally {
      setIsLoading(false);
    }
  };

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
    setDecryptedMessage('');
    setDecryptionIdentityName('');

    try {
        let foundMessage = false;
        let decryptionError = '';

        for (const identity of identities) {
            const myPublicKeyJwk = identity.encryption.publicKey;
            const myKeyHash = await getPublicKeyHash(myPublicKeyJwk);
            
            const myMessageData = decodedData.messages.find(m => m.recipientPublicKeyHash === myKeyHash);

            if (myMessageData) {
                try {
                    const myPrivateKey = await importEncryptionKey(identity.encryption.privateKey, ['deriveKey']);
                    const decrypted = await decryptHybrid(myMessageData, myPrivateKey);
                    setDecryptedMessage(decrypted);
                    setDecryptionIdentityName(identity.name);
                    toast({ title: "Message Decrypted", description: `Your secret message was decrypted with identity: ${identity.name}.` });
                    foundMessage = true;
                    decryptionError = '';
                    break;
                } catch (e) {
                    console.error(`Decryption failed for identity "${identity.name}":`, e);
                    decryptionError = `Found a message for identity "${identity.name}", but it could not be decrypted. The key may be incorrect or the data corrupted.`;
                }
            }
        }

        if (!foundMessage) {
            const finalError = decryptionError || "No message found for any of your identities in this file.";
            setError(finalError);
            if(finalError) {
              toast({ variant: "destructive", title: "Decryption Failed", description: finalError });
            }
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


  return (
    <Card>
      <CardHeader>
        <CardTitle>Decode & Verify</CardTitle>
        <CardDescription>Upload a file to extract and decrypt hidden messages using your stored identities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="stego-file-upload">1. Upload Steganographic File</Label>
          <Input id="stego-file-upload" type="file" accept="image/png,audio/*,video/*,.pdf,.doc,.docx" ref={fileInputRef} onChange={(e) => setStegoFile(e.target.files?.[0] || null)} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
            <Upload className="w-4 h-4 mr-2" />
            {stegoFile ? stegoFile.name : 'Select File'}
          </Button>
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

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">3. Decrypt Your Message</h3>
                 <p className="text-sm text-muted-foreground">The app will automatically try all of your saved identities to find and decrypt your message.</p>
                <Button onClick={handleMessageDecrypt} disabled={isLoading || signatureState === 'invalid' || !isMounted || identities.length === 0} className="w-full">
                   {isLoading && !decryptedMessage ? <Loader2 className="animate-spin" /> : <Lock />}
                  Decrypt Message
                </Button>
                 {!isMounted ? (
                     <Alert><Loader2 className="h-4 w-4 animate-spin" /> <AlertDescription>Loading identities...</AlertDescription></Alert>
                 ) : identities.length === 0 && <Alert variant="destructive"><AlertDescription>No identities found. Add one in the Key Management tab.</AlertDescription></Alert>}
                {decryptedMessage && (
                  <Alert>
                    <AlertTitle>Decrypted Secret Message</AlertTitle>
                     {decryptionIdentityName && (
                        <p className="text-sm text-muted-foreground mb-2">
                            Decrypted using identity: <span className="font-semibold text-primary">{decryptionIdentityName}</span>
                        </p>
                    )}
                    <AlertDescription className="break-words select-all">{decryptedMessage}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
            <Alert variant="destructive" className="mt-4">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>File Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
      </CardContent>
    </Card>
  );
}

    