
"use client";

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from '@/hooks/use-local-storage';
import { IdentityKeyPair, Contact } from '@/lib/types';
import { Upload, KeyRound, Lock, Image as ImageIcon, Download, Loader2, FileWarning, Users, ShieldCheck } from 'lucide-react';
import { encryptSymmetric, encryptHybrid, importSigningKey, signData, textToArrayBuffer, getPublicKeyHash, importEncryptionKey } from '@/lib/crypto';
import { embedDataInImage } from '@/lib/steganography';

export default function EncodeTab() {
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [decoyMessage, setDecoyMessage] = useState('');
  const [password, setPassword] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  const [identities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId] = useLocalStorage<string | null>('activeKeyId', null);
  const [contacts] = useLocalStorage<Contact[]>('contacts', []);
  
  const activeIdentity = identities.find(id => id.id === activeIdentityId);

  const coverImageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleToggleRecipient = (contactId: string) => {
    const newSelection = new Set(selectedContactIds);
    if (newSelection.has(contactId)) {
      newSelection.delete(contactId);
    } else {
      newSelection.add(contactId);
    }
    setSelectedContactIds(newSelection);
  };
  
  const handleEncode = async () => {
    const selectedRecipients = contacts.filter(c => selectedContactIds.has(c.id));

    if (!coverImage || !decoyMessage || !password || !secretMessage || selectedRecipients.length === 0 || !activeIdentity) {
        let errorMsg = "Please complete all fields. Missing: ";
        const missing = [];
        if (!coverImage) missing.push("cover image");
        if (!decoyMessage) missing.push("decoy message");
        if (!password) missing.push("password");
        if (!secretMessage) missing.push("secret message");
        if (!activeIdentity) missing.push("an active identity (set in Key Mgmt)");
        if (selectedRecipients.length === 0) missing.push("at least one recipient");
        setError(errorMsg + missing.join(', ') + '.');
        return;
    }
    setIsLoading(true);
    setError('');
    setResultImage(null);

    try {
        // 1. Get keys from stored identity
        const privateSigningKey = await importSigningKey(activeIdentity.signing.privateKey, 'sign');
        const publicSigningKeyJwk = activeIdentity.signing.publicKey;

        // 2. Encrypt decoy message
        const encryptedDecoy = await encryptSymmetric(decoyMessage, password);

        // 3. Encrypt secret message for each recipient
        const encryptedMessages = await Promise.all(selectedRecipients.map(async (recipient) => {
            const recipientPublicKey = await importEncryptionKey(recipient.encryptionPublicKey, []);
            const recipientKeyHash = await getPublicKeyHash(recipient.encryptionPublicKey);
            const encrypted = await encryptHybrid(secretMessage, recipientPublicKey);
            return {
                recipientPublicKeyHash: recipientKeyHash,
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
        const errorMessage = (err as Error).message;
        setError(`Encoding failed: ${errorMessage}`);
        toast({
            variant: "destructive",
            title: "Encoding Error",
            description: `An error occurred: ${errorMessage}`,
        });
    } finally {
        setIsLoading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Encode & Sign</CardTitle>
        <CardDescription>Embed a secret message into an image, signed with your active identity.</CardDescription>
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
                <h3 className="font-semibold text-lg">2. Identity & Recipients</h3>
                <div className="space-y-2">
                    <Label>Signing Identity</Label>
                    {activeIdentity ? (
                        <Alert>
                            <ShieldCheck className="h-4 w-4" />
                            <AlertTitle>Active Identity</AlertTitle>
                            <AlertDescription>{activeIdentity.name}</AlertDescription>
                        </Alert>
                    ) : (
                        <Alert variant="destructive">
                            <AlertTitle>No Active Identity</AlertTitle>
                            <AlertDescription>Go to Key Management to set an active identity.</AlertDescription>
                        </Alert>
                    )}
                </div>
                 <div className="space-y-2">
                    <Label>Recipients</Label>
                     {contacts.length === 0 ? (
                        <Alert>
                            <Users className="h-4 w-4" />
                            <AlertTitle>No Contacts Found</AlertTitle>
                            <AlertDescription>Go to Key Management to add contacts.</AlertDescription>
                        </Alert>
                     ) : (
                        <div className="space-y-2 pt-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                            {contacts.map((contact) => (
                                <div key={contact.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`contact-${contact.id}`}
                                        checked={selectedContactIds.has(contact.id)}
                                        onCheckedChange={() => handleToggleRecipient(contact.id)}
                                    />
                                    <Label htmlFor={`contact-${contact.id}`} className="font-normal cursor-pointer">{contact.name}</Label>
                                </div>
                            ))}
                        </div>
                     )}
                </div>
            </div>
        </div>

        {error && (
            <Alert variant="destructive" className="mt-4">
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
        <Button onClick={handleEncode} disabled={isLoading || !activeIdentity} className="w-full">
            {isLoading ? <Loader2 className="animate-spin" /> : <Lock />}
            Encode, Sign, and Embed
        </Button>
      </CardFooter>
    </Card>
  );
}
