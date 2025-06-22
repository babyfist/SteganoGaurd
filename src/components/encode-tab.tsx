
"use client";

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Upload, KeyRound, Lock, Image as ImageIcon, Send, Download, Loader2, FileWarning, Trash2 } from 'lucide-react';
import { encryptSymmetric, encryptHybrid, importSigningKey, signData, textToArrayBuffer, getPublicKeyHash, importEncryptionKey } from '@/lib/crypto';
import { embedDataInImage } from '@/lib/steganography';

type Recipient = {
    file: File;
    name: string;
    key: CryptoKey;
    keyHash: string;
};

export default function EncodeTab() {
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [decoyMessage, setDecoyMessage] = useState('');
  const [password, setPassword] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [signingKeyFile, setSigningKeyFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);

  const coverImageRef = useRef<HTMLInputElement>(null);
  const signingKeyRef = useRef<HTMLInputElement>(null);
  const recipientKeysRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleAddRecipients = async (files: FileList | null) => {
    if (!files) return;
    setError('');

    const newRecipients: Recipient[] = [...recipients];

    try {
        for (const file of Array.from(files)) {
            if (recipients.some(r => r.name === file.name)) continue; // Skip duplicates

            const keyFileContent = await file.text();
            const { encryption } = JSON.parse(keyFileContent);
            if (!encryption || !encryption.publicKey) {
                throw new Error(`Invalid key file format in ${file.name}.`);
            }
            const publicKey = await importEncryptionKey(encryption.publicKey, []);
            const keyHash = await getPublicKeyHash(encryption.publicKey);
            newRecipients.push({ file, name: file.name, key: publicKey, keyHash });
        }
        setRecipients(newRecipients);
    } catch (err) {
        setError(`Error processing recipient keys: ${(err as Error).message}`);
    }
  };

  const handleEncode = async () => {
    if (!coverImage || !decoyMessage || !password || !secretMessage || recipients.length === 0 || !signingKeyFile) {
        setError("Please fill all fields, select a cover image, and add at least one recipient and your signing key.");
        return;
    }
    setIsLoading(true);
    setError('');
    setResultImage(null);

    try {
        // 1. Process keys
        const signingKeyJson = JSON.parse(await signingKeyFile.text());
        if (!signingKeyJson.signing || !signingKeyJson.signing.privateKey || !signingKeyJson.signing.publicKey) {
            throw new Error("Invalid signing key file format.");
        }
        const privateSigningKey = await importSigningKey(signingKeyJson.signing.privateKey, 'sign');
        const publicSigningKeyJwk = signingKeyJson.signing.publicKey;

        // 2. Encrypt decoy message
        const encryptedDecoy = await encryptSymmetric(decoyMessage, password);

        // 3. Encrypt secret message for each recipient
        const encryptedMessages = await Promise.all(recipients.map(async (recipient) => {
            const encrypted = await encryptHybrid(secretMessage, recipient.key);
            return {
                recipientPublicKeyHash: recipient.keyHash,
                ...encrypted
            };
        }));
        
        // 4. Construct payload
        const payload = {
            senderPublicKey: publicSigningKeyJwk,
            decoy: encryptedDecoy,
            messages: encryptedMessages,
        };
        const payloadBuffer = textToArrayBuffer(JSON.stringify(payload));

        // 5. Sign payload
        const signature = await signData(privateSigningKey, payloadBuffer);

        // 6. Embed in image
        const stegoImageUrl = await embedDataInImage(coverImage, payloadBuffer, signature);
        setResultImage(stegoImageUrl);

        toast({
            title: "Success!",
            description: "Your message has been securely embedded in the image.",
        });

    } catch (err) {
        console.error(err);
        setError(`Encoding failed: ${(err as Error).message}`);
        toast({
            variant: "destructive",
            title: "Encoding Error",
            description: `An error occurred: ${(err as Error).message}`,
        });
    } finally {
        setIsLoading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Encode & Sign</CardTitle>
        <CardDescription>Embed a secret message into an image, signed with your key.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h3 className="font-semibold text-lg">1. Inputs</h3>
                <div className="space-y-2">
                    <Label htmlFor="cover-image">Cover Image (.png)</Label>
                    <Input id="cover-image" type="file" accept="image/png" ref={coverImageRef} onChange={(e) => setCoverImage(e.target.files?.[0] || null)} className="hidden"/>
                    <Button variant="outline" onClick={() => coverImageRef.current?.click()} className="w-full">
                        <ImageIcon /> {coverImage ? coverImage.name : "Select Cover Image"}
                    </Button>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="decoy-message">Decoy Message (Public)</Label>
                    <Textarea id="decoy-message" placeholder="A plausible, non-secret message." value={decoyMessage} onChange={e => setDecoyMessage(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="password">Password for Decoy</Label>
                    <Input id="password" type="password" placeholder="Password to reveal decoy" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="secret-message">Secret Message</Label>
                    <Textarea id="secret-message" placeholder="Your true hidden message." value={secretMessage} onChange={e => setSecretMessage(e.target.value)} />
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="font-semibold text-lg">2. Keys</h3>
                <div className="space-y-2">
                    <Label htmlFor="signing-key">Your Private Key (for signing)</Label>
                    <Input id="signing-key" type="file" accept=".json" ref={signingKeyRef} onChange={(e) => setSigningKeyFile(e.target.files?.[0] || null)} className="hidden"/>
                    <Button variant="outline" onClick={() => signingKeyRef.current?.click()} className="w-full">
                        <KeyRound /> {signingKeyFile ? signingKeyFile.name : "Select Your Signing Key"}
                    </Button>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="recipient-keys">Recipient(s) Public Key(s)</Label>
                    <Input id="recipient-keys" type="file" accept=".json" multiple ref={recipientKeysRef} onChange={(e) => handleAddRecipients(e.target.files)} className="hidden"/>
                    <Button variant="outline" onClick={() => recipientKeysRef.current?.click()} className="w-full">
                        <Send /> Select Recipient Keys
                    </Button>
                    <div className="space-y-2 pt-2">
                        {recipients.map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-muted p-2 rounded-md">
                               <span>{r.name}</span>
                               <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRecipients(recipients.filter(rec => rec.name !== r.name))}>
                                   <Trash2 className="h-4 w-4" />
                               </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {error && (
            <Alert variant="destructive">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
        
        {resultImage && (
            <div className="space-y-4 pt-4">
                <h3 className="font-semibold text-lg">Result</h3>
                <div className="border rounded-md p-4 flex flex-col items-center gap-4">
                    <img src={resultImage} alt="Steganographic Result" className="max-w-full md:max-w-md rounded-md shadow-md"/>
                    <Button onClick={() => {
                        const a = document.createElement('a');
                        a.href = resultImage;
                        a.download = 'steganographic-image.png';
                        a.click();
                    }}>
                        <Download /> Download Image
                    </Button>
                </div>
            </div>
        )}

      </CardContent>
      <CardFooter>
        <Button onClick={handleEncode} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="animate-spin" /> : <Lock />}
            Encode, Sign, and Embed
        </Button>
      </CardFooter>
    </Card>
  );
}
