
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { extractDataFromImage } from '@/lib/steganography';
import { decryptSymmetric, decryptHybrid, importSigningKey, importEncryptionKey, verifySignature, arrayBufferToText, getPublicKeyHash, exportKeyJwk } from '@/lib/crypto';
import { IdentityKeyPair } from '@/lib/types';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Upload, KeyRound, Lock, ShieldCheck, FileWarning, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type DecodedData = {
  senderPublicKey: JsonWebKey;
  decoy: { iv: string; ciphertext: string; };
  messages: { recipientPublicKeyHash: string; ephemeralPublicKey: JsonWebKey; iv: string; ciphertext:string; }[];
  signature: ArrayBuffer;
};

export default function DecodeTab() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [decryptedDecoy, setDecryptedDecoy] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [decodedData, setDecodedData] = useState<DecodedData | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  const [identities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const processImage = async () => {
      if (!imageFile) return;

      setIsLoading(true);
      setError('');
      setDecodedData(null);
      setDecryptedDecoy('');
      setDecryptedMessage('');
      setIsVerified(null);
      setPassword('');

      try {
        const { data: extractedData, signature } = await extractDataFromImage(imageFile);
        const dataJson = arrayBufferToText(extractedData);
        const data = JSON.parse(dataJson);

        const senderSigningKey = await importSigningKey(data.senderPublicKey, 'verify');
        const verified = await verifySignature(senderSigningKey, signature, extractedData);
        setIsVerified(verified);
        
        if (verified) {
            setDecodedData({ ...data, signature });
            toast({ title: "Success", description: "Image data extracted and signature verified." });
        } else {
            setError("Signature verification failed! The data may have been tampered with.");
            toast({ variant: "destructive", title: "Verification Failed", description: "The image signature is invalid."})
        }
      } catch (err) {
        console.error(err);
        const errorMessage = (err as Error).message;
        setError(`Failed to process image. Is this a valid steganographic image? Error: ${errorMessage}`);
        toast({ variant: "destructive", title: "Processing Error", description: errorMessage });
        setIsVerified(false);
      } finally {
        setIsLoading(false);
      }
    };
    processImage();
  }, [imageFile, toast]);

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
    if (identities.length === 0) {
        setError("No identities found. Please add or import an identity in the Key Management tab.");
        return;
    }
    setIsLoading(true);
    setError('');
    try {
        let foundMessage = false;
        for (const identity of identities) {
            try {
                const myPublicKey = await importEncryptionKey(identity.encryption.publicKey, []);
                const myKeyHash = await getPublicKeyHash(await exportKeyJwk(myPublicKey));
                const myMessageData = decodedData.messages.find(m => m.recipientPublicKeyHash === myKeyHash);

                if (myMessageData) {
                    const myPrivateKey = await importEncryptionKey(identity.encryption.privateKey, ['deriveKey']);
                    const decrypted = await decryptHybrid(myMessageData, myPrivateKey);
                    setDecryptedMessage(decrypted);
                    toast({ title: "Message Decrypted", description: `Your secret message was decrypted with identity: ${identity.name}.` });
                    foundMessage = true;
                    break; // Exit loop once message is found and decrypted
                }
            } catch (e) {
                // Ignore errors for non-matching keys and continue trying others.
                console.log(`Could not decrypt with key ${identity.name}, trying next one.`);
            }
        }

        if (!foundMessage) {
            setError("No message found for any of your identities in this image.");
            toast({ variant: "destructive", title: "Not Found", description: "No message for your keys was found." });
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
        <CardDescription>Upload an image to extract and decrypt hidden messages using your stored identities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="image-upload">1. Upload Steganographic Image</Label>
          <Input id="image-upload" type="file" accept="image/png" ref={imageInputRef} onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="hidden" />
          <Button variant="outline" onClick={() => imageInputRef.current?.click()} className="w-full">
            <Upload className="w-4 h-4 mr-2" />
            {imageFile ? imageFile.name : 'Select Image'}
          </Button>
        </div>

        {isLoading && !decodedData && (
            <div className="flex items-center justify-center space-x-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" /> 
                <span>Processing Image...</span>
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
                <Button onClick={handleMessageDecrypt} disabled={isLoading || isVerified === false || identities.length === 0} className="w-full">
                   {isLoading && !decryptedMessage ? <Loader2 className="animate-spin" /> : <Lock />}
                  Decrypt Message
                </Button>
                 {identities.length === 0 && <Alert variant="destructive"><AlertDescription>No identities found. Add one in the Key Management tab.</AlertDescription></Alert>}
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
