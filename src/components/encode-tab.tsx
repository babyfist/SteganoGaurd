
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
import { Upload, KeyRound, Lock, Image as ImageIcon, Download, Loader2, FileWarning, Users, ShieldCheck, FileDown, UserPlus, CheckCircle2 } from 'lucide-react';
import { encryptSymmetric, encryptHybrid, importSigningKey, signData, textToArrayBuffer, getPublicKeyHash, importEncryptionKey, validatePublicKeys } from '@/lib/crypto';
import { embedDataInPng, embedDataInGenericFile } from '@/lib/steganography';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function EncodeTab() {
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [decoyMessage, setDecoyMessage] = useState('');
  const [password, setPassword] = useState('');
  const [secretMessage, setSecretMessage] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [includeSignature, setIncludeSignature] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; fileName: string; isImage: boolean } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  const [identities, setIdentities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId] = useLocalStorage<string | null>('activeKeyId', null);

  const [sendToNew, setSendToNew] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newRecipientKeyInput, setNewRecipientKeyInput] = useState('');
  const [validatedNewRecipient, setValidatedNewRecipient] = useState<Contact | null>(null);
  const [newRecipientError, setNewRecipientError] = useState('');
  const [promptSaveContact, setPromptSaveContact] = useState<Contact | null>(null);
  
  const activeIdentity = identities.find(id => id.id === activeIdentityId);
  const contacts = activeIdentity?.contacts || [];

  const coverImageRef = useRef<HTMLInputElement>(null);
  const newRecipientKeyFileRef = useRef<HTMLInputElement>(null);
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
  
  useEffect(() => {
    if (!sendToNew) {
      setValidatedNewRecipient(null);
      setNewRecipientError('');
      return;
    }
    if (!newRecipientKeyInput || !newRecipientName) {
      setValidatedNewRecipient(null);
      return;
    }

    const timer = setTimeout(() => {
        const parseAndValidate = async () => {
            try {
                const keyData = JSON.parse(newRecipientKeyInput);
                const publicKeys = await validatePublicKeys(keyData);
                setValidatedNewRecipient({
                    id: uuidv4(),
                    name: newRecipientName.trim(),
                    ...publicKeys
                });
                setNewRecipientError('');
            } catch (err) {
                setValidatedNewRecipient(null);
                setNewRecipientError(`Invalid public key: ${(err as Error).message}`);
            }
        };
        parseAndValidate();
    }, 500);

    return () => clearTimeout(timer);
  }, [newRecipientKeyInput, newRecipientName, sendToNew]);

  const handleToggleRecipient = (contactId: string) => {
    const newSelection = new Set(selectedContactIds);
    if (newSelection.has(contactId)) {
      newSelection.delete(contactId);
    } else {
      newSelection.add(contactId);
    }
    setSelectedContactIds(newSelection);
  };

  const handleNewRecipientFile = async (file: File | null) => {
    if (!file) return;
    try {
        const text = await file.text();
        setNewRecipientKeyInput(text);
    } catch (err) {
        setNewRecipientError(`Error reading file: ${(err as Error).message}`);
    }
  };

  const handleSaveNewContact = () => {
    if (!promptSaveContact || !activeIdentityId) return;

    const updatedIdentities = identities.map(identity => {
        if (identity.id === activeIdentityId) {
            const contactExists = identity.contacts?.some(c => c.name.toLowerCase() === promptSaveContact.name.toLowerCase());
            if (contactExists) {
                toast({ variant: "destructive", title: "Contact Exists", description: `A contact named "${promptSaveContact.name}" already exists.` });
                setPromptSaveContact(null);
                return identity;
            }
            const newContacts = [...(identity.contacts || []), promptSaveContact];
            return { ...identity, contacts: newContacts };
        }
        return identity;
    });

    setIdentities(updatedIdentities);
    toast({ title: "Contact Saved", description: `"${promptSaveContact.name}" has been added to your contacts.` });
    setPromptSaveContact(null);
  };
  
  const handleEncode = async () => {
    if (includeSignature && !activeIdentity) {
      setError("Please set an active identity to sign the message.");
      return;
    }

    let recipientsToEncrypt: Contact[] = [];
    if (sendToNew) {
      if (validatedNewRecipient) {
        recipientsToEncrypt = [validatedNewRecipient];
      }
    } else {
      recipientsToEncrypt = contacts.filter(c => selectedContactIds.has(c.id));
    }
    
    if (!coverImage || !decoyMessage || !password || !secretMessage || recipientsToEncrypt.length === 0) {
        let errorMsg = "Please complete all fields. Missing: ";
        const missing = [];
        if (!coverImage) missing.push("cover file");
        if (!decoyMessage) missing.push("decoy message");
        if (!password) missing.push("password");
        if (!secretMessage) missing.push("secret message");
        if (recipientsToEncrypt.length === 0) {
           missing.push(sendToNew ? "a valid new recipient" : "at least one recipient from your contact list");
        }
        setError(errorMsg + missing.join(', ') + '.');
        return;
    }
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
        const encryptedDecoy = await encryptSymmetric(decoyMessage, password);

        const encryptedMessages = await Promise.all(recipientsToEncrypt.map(async (recipient) => {
            const recipientPublicKey = await importEncryptionKey(recipient.encryptionPublicKey, []);
            const recipientKeyHash = await getPublicKeyHash(recipient.encryptionPublicKey);
            const encrypted = await encryptHybrid(secretMessage, recipientPublicKey);
            return {
                recipientPublicKeyHash: recipientKeyHash,
                ...encrypted
            };
        }));
        
        const payload: {
            senderPublicKey?: JsonWebKey;
            decoy: any;
            messages: any[];
        } = {
            decoy: encryptedDecoy,
            messages: encryptedMessages,
        };

        let dataToEmbed: ArrayBuffer;

        if (includeSignature && activeIdentity) {
            payload.senderPublicKey = activeIdentity.signing.publicKey;
            const privateSigningKey = await importSigningKey(activeIdentity.signing.privateKey, 'sign');
            const payloadBuffer = textToArrayBuffer(JSON.stringify(payload));
            const signature = await signData(privateSigningKey, payloadBuffer);
            
            const combinedBuffer = new Uint8Array(payloadBuffer.byteLength + signature.byteLength);
            combinedBuffer.set(new Uint8Array(payloadBuffer), 0);
            combinedBuffer.set(new Uint8Array(signature), payloadBuffer.byteLength);
            dataToEmbed = combinedBuffer.buffer;
        } else {
            const payloadBuffer = textToArrayBuffer(JSON.stringify(payload));
            dataToEmbed = payloadBuffer;
        }
        
        if (coverImage.type === 'image/png') {
            const stegoImageUrl = await embedDataInPng(coverImage, dataToEmbed);
            setResult({ url: stegoImageUrl, fileName: 'steganographic-image.png', isImage: true });
        } else {
            const stegoBlob = await embedDataInGenericFile(coverImage, dataToEmbed);
            const objectUrl = URL.createObjectURL(stegoBlob);
            setResult({ url: objectUrl, fileName: `stego-${coverImage.name}`, isImage: false });
        }

        toast({ title: "Success!", description: "Your message has been securely embedded in the file." });
        
        if (sendToNew && validatedNewRecipient) {
          setPromptSaveContact(validatedNewRecipient);
        }

    } catch (err) {
        console.error(err);
        const errorMessage = (err as Error).message;
        setError(`Encoding failed: ${errorMessage}`);
        toast({ variant: "destructive", title: "Encoding Error", description: `An error occurred: ${errorMessage}` });
    } finally {
        setIsLoading(true);
    }
  };


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Encode & Sign</CardTitle>
          <CardDescription>Embed a secret message into a file, optionally signed with your active identity.</CardDescription>
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
                          <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertTitle>Loading Identity...</AlertTitle></Alert>
                      ) : activeIdentity ? (
                        <Alert>
                           <ShieldCheck className="h-4 w-4" />
                           <div className="flex justify-between items-center">
                              <div>
                                <AlertTitle>Active Identity</AlertTitle>
                                <AlertDescription>{activeIdentity.name}</AlertDescription>
                              </div>
                              <div className="flex items-center space-x-2 pr-2">
                                <Checkbox id="sign-checkbox" checked={includeSignature} onCheckedChange={(checked) => setIncludeSignature(Boolean(checked))} />
                                <Label htmlFor="sign-checkbox" className="font-bold cursor-pointer">Sign</Label>
                              </div>
                           </div>
                        </Alert>
                      ) : (
                          <Alert variant="destructive"><AlertTitle>No Active Identity</AlertTitle><AlertDescription>Go to Key Management to set an active identity.</AlertDescription></Alert>
                      )}
                  </div>
                  
                  <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                          <Checkbox id="send-to-new" checked={sendToNew} onCheckedChange={(checked) => setSendToNew(Boolean(checked))} />
                          <Label htmlFor="send-to-new" className="cursor-pointer">Send to a new recipient (not in contacts)</Label>
                      </div>
                  </div>

                  {sendToNew ? (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                        <h4 className="font-semibold flex items-center justify-between">
                          New Recipient Details
                          {validatedNewRecipient && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        </h4>
                        <div className="space-y-2">
                            <Label htmlFor="new-recipient-name">Recipient Name</Label>
                            <Input id="new-recipient-name" value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)} placeholder="e.g., Bob" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-recipient-key">Recipient Public Key</Label>
                            <Textarea id="new-recipient-key" value={newRecipientKeyInput} onChange={e => setNewRecipientKeyInput(e.target.value)} placeholder="Paste the recipient's public key JSON here" rows={3} />
                            <Input id="new-recipient-file" type="file" accept=".json" ref={newRecipientKeyFileRef} onChange={(e) => handleNewRecipientFile(e.target.files?.[0] || null)} className="hidden"/>
                            <Button variant="link" className="p-0 h-auto" onClick={() => newRecipientKeyFileRef.current?.click()}>Or upload a key file</Button>
                        </div>
                        {newRecipientError && <Alert variant="destructive" className="text-xs"><FileWarning className="h-3 w-3" /><AlertDescription>{newRecipientError}</AlertDescription></Alert>}
                    </div>
                  ) : (
                    <fieldset disabled={!isMounted || !activeIdentity} className="space-y-2 disabled:opacity-50">
                        <Label>Recipients from Contacts</Label>
                         {!isMounted ? (
                             <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertTitle>Loading Contacts...</AlertTitle></Alert>
                         ) : !activeIdentity ? (
                            <Alert variant="destructive"><Users className="h-4 w-4" /><AlertTitle>Set Active Identity</AlertTitle><AlertDescription>Select an active identity to see its contacts.</AlertDescription></Alert>
                         ) : contacts.length === 0 ? (
                            <Alert><Users className="h-4 w-4" /><AlertTitle>No Contacts Found</AlertTitle><AlertDescription>Go to Key Management to add contacts to your active identity.</AlertDescription></Alert>
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
                    </fieldset>
                  )}
              </div>
          </div>

          {error && (
              <Alert variant="destructive" className="mt-4"><FileWarning className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
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
          <Button onClick={handleEncode} disabled={isLoading || !isMounted || (includeSignature && !activeIdentity)} className="w-full">
              {isLoading ? <Loader2 className="animate-spin" /> : <Lock />}
              {includeSignature ? 'Encode, Sign, and Embed' : 'Encode and Embed'}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={!!promptSaveContact} onOpenChange={(isOpen) => !isOpen && setPromptSaveContact(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Save New Contact?</AlertDialogTitle>
                <AlertDialogDescription>
                    Would you like to save "{promptSaveContact?.name}" to the contact list for identity "{activeIdentity?.name}"?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPromptSaveContact(null)}>Don't Save</AlertDialogCancel>
                <AlertDialogAction onClick={handleSaveNewContact}>Save Contact</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    