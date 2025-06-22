
"use client";

import React, { useState, useRef, useEffect } from 'react';
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
import { Upload, KeyRound, Lock, Image as ImageIcon, Download, Loader2, FileWarning, Users, ShieldCheck, FileDown } from 'lucide-react';
import { encryptSymmetric, encryptHybrid, importSigningKey, signData, textToArrayBuffer, getPublicKeyHash, importEncryptionKey } from '@/lib/crypto';
import { embedDataInPng, embedDataInGenericFile } from '@/lib/steganography';

const SIGNATURE_LENGTH_BYTES = 64;

export default function EncodeTab() {
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [decoyMessage, setDecoyMessage] = useState('');
  const [password, setPassword] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; fileName: string; isImage: boolean } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const [identities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId] = useLocalStorage<string | null>('activeKeyId', null);
  
  const activeIdentity = identities.find(id => id.id === activeIdentityId);
  const contacts = activeIdentity?.contacts || [];

  const coverImageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let currentUrl: string | null = result?.url || null;
    let isObjectUrl = currentUrl?.startsWith('blob:') || false;
    
    return () => {
        if (currentUrl && isObjectUrl) {
            URL.revokeObjectURL(currentUrl);
        }
    };
  }, [result]);

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
    if (!activeIdentity) {
      setError("Please set an active identity in Key Management.");
      return;
    }
    const selectedRecipients = contacts.filter(c => selectedContactIds.has(c.id));

    if (!coverImage || !decoyMessage || !password || !secretMessage || selectedRecipients.length === 0) {
        let errorMsg = "Please complete all fields. Missing: ";
        const missing = [];
        if (!coverImage) missing.push("cover file");
        if (!decoyMessage) missing.push("decoy message");
        if (!password) missing.push("password");
        if (!secretMessage) missing.push("secret message");
        if (selectedRecipients.length === 0) missing.push("at least one recipient");
        setError(errorMsg + missing.join(', ') + '.');
        return;
    }
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
        const privateSigningKey = await importSigningKey(activeIdentity.signing.privateKey, 'sign');
        const publicSigningKeyJwk = activeIdentity.signing.publicKey;
        const encryptedDecoy = await encryptSymmetric(decoyMessage, password);

        const encryptedMessages = await Promise.all(selectedRecipients.map(async (recipient) => {
            const recipientPublicKey = await importEncryptionKey(recipient.encryptionPublicKey, []);
            const recipientKeyHash = await getPublicKeyHash(recipient.encryptionPublicKey);
            const encrypted = await encryptHybrid(secretMessage, recipientPublicKey);
            return {
                recipientPublicKeyHash: recipientKeyHash,
                ...encrypted
            };
        }));
        
        const payload = {
            senderPublicKey: publicSigningKeyJwk,
            decoy: encryptedDecoy,
            messages: encryptedMessages,
        };
        const payloadBuffer = textToArrayBuffer(JSON.stringify(payload));

        const signature = await signData(privateSigningKey, payloadBuffer);

        const combinedBuffer = new Uint8Array(payloadBuffer.byteLength + signature.byteLength);
        combinedBuffer.set(new Uint8Array(payloadBuffer), 0);
        combinedBuffer.set(new Uint8Array(signature), payloadBuffer.byteLength);

        if (coverImage.type === 'image/png') {
            const stegoImageUrl = await embedDataInPng(coverImage, combinedBuffer.buffer);
            setResult({
                url: stegoImageUrl,
                fileName: 'steganographic-image.png',
                isImage: true,
            });
        } else {
            const stegoBlob = await embedDataInGenericFile(coverImage, combinedBuffer.buffer);
            const objectUrl = URL.createObjectURL(stegoBlob);
            setResult({
                url: objectUrl,
                fileName: `stego-${coverImage.name}`,
                isImage: false,
            });
        }

        toast({
            title: "Success!",
            description: "Your message has been securely embedded in the file.",
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
        <CardDescription>Embed a secret message into a file, signed with your active identity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h3 className="font-semibold text-lg">1. Inputs</h3>
                <div className="space-y-2">
                    <Label htmlFor="cover-image">Cover File</Label>
                    <Input id="cover-image" type="file" accept="image/png,audio/*,video/*,.pdf,.doc,.docx" ref={coverImageRef} onChange={(e) => setCoverImage(e.target.files?.[0] || null)} className="hidden"/>
                    <Button variant="outline" onClick={() => coverImageRef.current?.click()} className="w-full">
                        <ImageIcon /> {coverImage ? coverImage.name : "Select Cover File"}
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
                    {!isMounted ? (
                        <Alert>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <AlertTitle>Loading Identity...</AlertTitle>
                        </Alert>
                    ) : activeIdentity ? (
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
                     {!isMounted ? (
                         <Alert>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <AlertTitle>Loading Contacts...</AlertTitle>
                         </Alert>
                     ) : !activeIdentity ? (
                        <Alert variant="destructive">
                            <Users className="h-4 w-4" />
                            <AlertTitle>Set Active Identity</AlertTitle>
                            <AlertDescription>Select an active identity to see its contacts.</AlertDescription>
                        </Alert>
                     ) : contacts.length === 0 ? (
                        <Alert>
                            <Users className="h-4 w-4" />
                            <AlertTitle>No Contacts Found</AlertTitle>
                            <AlertDescription>Go to Key Management to add contacts to your active identity.</AlertDescription>
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
        
        {result && (
            <div className="space-y-4 pt-4">
                <h3 className="font-semibold text-lg">Result</h3>
                <div className="border rounded-md p-4 flex flex-col items-center gap-4">
                    {result.isImage ? (
                        <img src={result.url} alt="Steganographic Result" className="max-w-full md:max-w-md rounded-md shadow-md"/>
                    ) : (
                        <div className="text-center p-4 bg-muted rounded-lg w-full max-w-md">
                            <FileDown className="w-12 h-12 mx-auto text-primary" />
                            <p className="mt-2 font-semibold">File Ready for Download</p>
                            <p className="text-sm text-muted-foreground truncate">{result.fileName}</p>
                        </div>
                    )}
                    <Button onClick={() => {
                        const a = document.createElement('a');
                        a.href = result.url;
                        a.download = result.fileName;
                        a.click();
                    }}>
                        <Download /> Download File
                    </Button>
                </div>
            </div>
        )}

      </CardContent>
      <CardFooter>
        <Button onClick={handleEncode} disabled={isLoading || !isMounted || !activeIdentity} className="w-full">
            {isLoading ? <Loader2 className="animate-spin" /> : <Lock />}
            Encode, Sign, and Embed
        </Button>
      </CardFooter>
    </Card>
  );
}
