
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { extractDataFromPng, extractDataFromGenericFile } from '@/lib/steganography';
import { decryptSymmetric, decryptHybrid, importSigningKey, importEncryptionKey, verifySignature, arrayBufferToText, getPublicKeyHash, exportKeyJwk } from '@/lib/crypto';
import { IdentityKeyPair } from '@/lib/types';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Upload, KeyRound, Lock, ShieldCheck, FileWarning, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const SIGNATURE_LENGTH_BYTES = 64;

type DecodedData = {
  senderPublicKey: JsonWebKey;
  decoy: { iv: string; ciphertext: string; };
  messages: { recipientPublicKeyHash: string; ephemeralPublicKey: JsonWebKey; iv: string; ciphertext:string; }[];
};

export default function DecodeTab() {
  const [stegoFile, setStegoFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [decryptedDecoy, setDecryptedDecoy] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [decodedData, setDecodedData] = useState<DecodedData | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
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
      setIsVerified(null);
      setPassword('');

      try {
        let extractedBuffer: ArrayBuffer;
        if (stegoFile.type === 'image/png') {
            extractedBuffer = await extractDataFromPng(stegoFile);
        } else {
            extractedBuffer = await extractDataFromGenericFile(stegoFile);
        }
        
        if (extractedBuffer.byteLength <= SIGNATURE_LENGTH_BYTES) {
            throw new Error("Extracted data is too small to contain a signature.");
        }

        const payloadLength = extractedBuffer.byteLength - SIGNATURE_LENGTH_BYTES;
        const payloadBuffer = extractedBuffer.slice(0, payloadLength);
        const signatureBuffer = extractedBuffer.slice(payloadLength);
        
        const dataJson = arrayBufferToText(payloadBuffer);
        const data: DecodedData = JSON.parse(dataJson);

        const senderSigningKey = await importSigningKey(data.senderPublicKey, 'verify');
        const verified = await verifySignature(senderSigningKey, signatureBuffer, payloadBuffer);
        setIsVerified(verified);
        
        if (verified) {
            setDecodedData(data);
            toast({ title: "Success", description: "File data extracted and signature verified." });
        } else {
            setError("Signature verification failed! The data may have been tampered with.");
            toast({ variant: "destructive", title: "Verification Failed", description: "The file signature is invalid."})
        }
      } catch (err) {
        console.error(err);
        const errorMessage = (err as Error).message;
        setError(`Failed to process file. Is this a valid SteganoGuard file? Error: ${errorMessage}`);
        toast({ variant: "destructive", title: "Processing Error", description: errorMessage });
        setIsVerified(false);
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
      setError("Please upload and process an image first.");
      return;
    }
     if (isVerified === false) {
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

    try {
        let foundMessage = false;
        let decryptionError = '';

        for (const identity of identities) {
            const myKeyHash = await getPublicKeyHash(identity.encryption.publicKey);
            const myMessageData = decodedData.messages.find(m => m.recipientPublicKeyHash === myKeyHash);

            if (myMessageData) {
                try {
                    const myPrivateKey = await importEncryptionKey(identity.encryption.privateKey, ['deriveKey']);
                    const ephemeralPublicKey = await importEncryptionKey(myMessageData.ephemeralPublicKey, []);
                    const decrypted = await decryptHybrid(myMessageData, myPrivateKey);
                    setDecryptedMessage(decrypted);
                    toast({ title: "Message Decrypted", description: `Your secret message was decrypted with identity: ${identity.name}.` });
                    foundMessage = true;
                    decryptionError = ''; // Clear error on success
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

        {isLoading && !decodedData && (
            <div className="flex items-center justify-center space-x-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" /> 
                <span>Processing File...</span>
            </div>
        )}

        {isVerified !== null && (
            <Alert variant={isVerified ? 'default' : 'destructive'}>
                {isVerified ? <ShieldCheck className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
                <AlertTitle>{isVerified ? 'Signature Verified' : 'Signature Invalid!'}</AlertTitle>
                <AlertDescription>
                    {isVerified ? 'The integrity of the hidden data is confirmed.' : 'The data may be corrupted or tampered with.'}
                </AlertDescription>
            </Alert>
        )}

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
                <Button onClick={handleMessageDecrypt} disabled={isLoading || isVerified === false || !isMounted || identities.length === 0} className="w-full">
                   {isLoading && !decryptedMessage ? <Loader2 className="animate-spin" /> : <Lock />}
                  Decrypt Message
                </Button>
                 {!isMounted ? (
                     <Alert><Loader2 className="h-4 w-4 animate-spin" /> <AlertDescription>Loading identities...</AlertDescription></Alert>
                 ) : identities.length === 0 && <Alert variant="destructive"><AlertDescription>No identities found. Add one in the Key Management tab.</AlertDescription></Alert>}
                {decryptedMessage && (
                  <Alert>
                    <AlertTitle>Decrypted Secret Message</AlertTitle>
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
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
      </CardContent>
    </Card>
  );
}
