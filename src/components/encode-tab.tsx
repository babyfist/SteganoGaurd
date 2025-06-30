
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from '@/hooks/use-local-storage';
import { IdentityKeyPair, Contact } from '@/lib/types';
import { Upload, KeyRound, Lock, Image as ImageIcon, Download, Loader2, FileWarning, Users, ShieldCheck, FileDown, UserPlus, CheckCircle2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

/**
 * The EncodeTab component provides the UI and logic for embedding a secret message into a file.
 * It handles file selection, message inputs, recipient selection, digital signing, and the
 * final encoding and embedding process.
 */
export default function EncodeTab() {
  // --- STATE MANAGEMENT ---
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [decoyMessage, setDecoyMessage] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [secretMessage, setSecretMessage] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [includeSignature, setIncludeSignature] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; fileName: string; isImage: boolean } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);
  
  // Identities and active identity from local storage.
  const [identities, setIdentities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId] = useLocalStorage<string | null>('activeKeyId', null);

  // State for sending to a new recipient not in contacts.
  const [sendToNew, setSendToNew] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newRecipientKeyInput, setNewRecipientKeyInput] = useState('');
  const [validatedNewRecipient, setValidatedNewRecipient] = useState<Contact | null>(null);
  const [newRecipientError, setNewRecipientError] = useState('');
  const [promptSaveContact, setPromptSaveContact] = useState<Contact | null>(null);

  // State for the visible watermark/stamp.
  const [includeStamp, setIncludeStamp] = useState(true);
  const [stampText, setStampText] = useState('');
  const [stampFont, setStampFont] = useState('Arial');
  const [stampSize, setStampSize] = useState(16);
  
  // Computed values.
  const activeIdentity = identities.find(id => id.id === activeIdentityId);
  const contacts = activeIdentity?.contacts || [];

  // Refs for file inputs and toast notifications.
  const coverImageRef = useRef<HTMLInputElement>(null);
  const newRecipientKeyFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // --- EFFECTS ---
  
  // Effect to ensure component is mounted before using client-side features.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effect to clean up object URLs when the component unmounts or the result changes.
  useEffect(() => {
    let currentUrl: string | null = result?.url || null;
    let isObjectUrl = currentUrl?.startsWith('blob:') || false;
    
    return () => {
        if (currentUrl && isObjectUrl) {
            URL.revokeObjectURL(currentUrl);
        }
    };
  }, [result]);
  
  // Effect to auto-validate a new recipient's public key when the input changes.
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
                const { validatePublicKeys } = await import('@/lib/crypto');
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
    }, 500); // Debounce validation to avoid running on every keystroke.

    return () => clearTimeout(timer);
  }, [newRecipientKeyInput, newRecipientName, sendToNew]);

  // --- HANDLERS ---

  /** Toggles the selection of a contact from the list. */
  const handleToggleRecipient = (contactId: string) => {
    const newSelection = new Set(selectedContactIds);
    if (newSelection.has(contactId)) {
      newSelection.delete(contactId);
    } else {
      newSelection.add(contactId);
    }
    setSelectedContactIds(newSelection);
  };

  /** Reads a new recipient's public key from an uploaded file. */
  const handleNewRecipientFile = async (file: File | null) => {
    if (!file) return;
    try {
        const text = await file.text();
        setNewRecipientKeyInput(text);
    } catch (err) {
        setNewRecipientError(`Error reading file: ${(err as Error).message}`);
    }
  };

  /** Saves a newly used recipient to the active identity's contact list. */
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

  /** Resets the entire form to its initial state. */
  const handleReset = () => {
    setCoverImage(null);
    setDecoyMessage('');
    setPassword('');
    setSecretMessage('');
    setSelectedContactIds(new Set());
    setError('');
    setResult(null);
    setSendToNew(false);
    setNewRecipientName('');
    setNewRecipientKeyInput('');
    setValidatedNewRecipient(null);
    setNewRecipientError('');
    setStampText('');
    setIsFormCollapsed(false);
    if (coverImageRef.current) {
      coverImageRef.current.value = '';
    }
  };
  
  /**
   * The main handler for the encoding process. It gathers all inputs, performs the necessary
   * cryptographic operations, and embeds the final data into the chosen cover file.
   */
  const handleEncode = async () => {
    if (includeSignature && !activeIdentity) {
      setError("Please set an active identity to sign the message.");
      return;
    }

    // Determine the list of recipients.
    let recipientsToEncrypt: Contact[] = [];
    if (sendToNew) {
      if (validatedNewRecipient) {
        recipientsToEncrypt = [validatedNewRecipient];
      }
    } else {
      recipientsToEncrypt = contacts.filter(c => selectedContactIds.has(c.id));
    }
    
    // Validate that all required fields are filled.
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
        // Dynamically import libraries to avoid server-side execution.
        const { embedDataInPng, embedDataInGenericFile } = await import('@/lib/steganography');
        const { getPublicKeyHash, encryptSymmetric, encryptHybrid, importEncryptionKey, textToArrayBuffer, importSigningKey, signData } = await import('@/lib/crypto');
        
        // Prepare watermark options if enabled.
        let stampOptions: any = null;
        if (includeStamp && coverImage?.type.startsWith('image/')) {
            let textToStamp = stampText.trim();
            // Default stamp text to the public key hash if not provided.
            if (!textToStamp && activeIdentity) {
                const hash = await getPublicKeyHash(activeIdentity.signing.publicKey);
                textToStamp = `SGID:${hash.substring(0, 16)}...`;
            }
            if(textToStamp) {
                stampOptions = { text: textToStamp, font: stampFont, size: stampSize };
            }
        }

        // 1. Encrypt the decoy message symmetrically with the password.
        const encryptedDecoy = await encryptSymmetric(decoyMessage, password);

        // 2. Encrypt the secret message for each recipient using hybrid encryption.
        const encryptedMessages = await Promise.all(recipientsToEncrypt.map(async (recipient) => {
            const recipientPublicKey = await importEncryptionKey(recipient.encryptionPublicKey, []);
            const recipientKeyHash = await getPublicKeyHash(recipient.encryptionPublicKey);
            const encrypted = await encryptHybrid(secretMessage, recipientPublicKey);
            return { recipientPublicKeyHash: recipientKeyHash, ...encrypted };
        }));
        
        // 3. Assemble the full data payload.
        const payload: {
            senderPublicKey?: JsonWebKey; 
            decoy: { salt: string; iv: string; ciphertext: string }; 
            messages: any[];
        } = {
            decoy: encryptedDecoy,
            messages: encryptedMessages,
        };

        let dataToEmbed: ArrayBuffer;

        // 4. Sign the payload if requested.
        if (includeSignature && activeIdentity) {
            payload.senderPublicKey = activeIdentity.signing.publicKey;
            const privateSigningKey = await importSigningKey(activeIdentity.signing.privateKey, 'sign');
            const payloadBuffer = textToArrayBuffer(JSON.stringify(payload));
            const signature = await signData(privateSigningKey, payloadBuffer);
            
            // Append the signature to the payload buffer.
            const combinedBuffer = new Uint8Array(payloadBuffer.byteLength + signature.byteLength);
            combinedBuffer.set(new Uint8Array(payloadBuffer), 0);
            combinedBuffer.set(new Uint8Array(signature), payloadBuffer.byteLength);
            dataToEmbed = combinedBuffer.buffer;
        } else {
            // If not signing, the data to embed is just the serialized payload.
            dataToEmbed = textToArrayBuffer(JSON.stringify(payload));
        }
        
        // 5. Embed the final data buffer into the cover file.
        if (coverImage.type.startsWith('image/')) {
            const stegoImageUrl = await embedDataInPng(coverImage, dataToEmbed, stampOptions);
            setResult({ url: stegoImageUrl, fileName: 'steganographic-image.png', isImage: true });
        } else {
            const stegoBlob = await embedDataInGenericFile(coverImage, dataToEmbed);
            const objectUrl = URL.createObjectURL(stegoBlob);
            setResult({ url: objectUrl, fileName: `stego-${coverImage.name}`, isImage: false });
        }

        toast({ title: "Success!", description: "Your message has been securely embedded in the file." });
        setIsFormCollapsed(true);
        
        // Prompt to save the new contact if one was used.
        if (sendToNew && validatedNewRecipient) {
          setPromptSaveContact(validatedNewRecipient);
        }

    } catch (err) {
        console.error(err);
        const errorMessage = (err as Error).message;
        setError(`Encoding failed: ${errorMessage}`);
        toast({ variant: "destructive", title: "Encoding Error", description: `An error occurred: ${errorMessage}` });
    } finally {
        setIsLoading(false);
    }
  };


  // --- RENDER LOGIC ---
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Encode &amp; Sign</CardTitle>
          <CardDescription>Embed a secret message into a file, optionally signed with your active identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isFormCollapsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Inputs */}
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">1. Inputs</h3>
                    <div className="space-y-2">
                        <Label htmlFor="cover-image">Cover File (Images are converted to PNG)</Label>
                        <Input id="cover-image" type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx" ref={coverImageRef} onChange={(e) => setCoverImage(e.target.files?.[0] || null)} className="hidden"/>
                        <Label htmlFor="cover-image" className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-pointer font-normal")}>
                            <ImageIcon className="w-4 h-4 mr-2" /> {coverImage ? coverImage.name : "Select Cover File"}
                        </Label>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="decoy-message">Password Protected Message (Public)</Label>
                        <Textarea id="decoy-message" placeholder="A plausible, non-secret message." value={decoyMessage} onChange={e => setDecoyMessage(e.target.value)} />
                    </div>
                     <div className="space-y-2">
                          <Label htmlFor="password">Password for Message</Label>
                          <div className="relative">
                              <Input
                                  id="password"
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder="Password to reveal message"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  className="pr-10"
                              />
                              <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                                  onClick={() => setShowPassword(!showPassword)}
                                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                              >
                                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                              </Button>
                          </div>
                      </div>
                     <div className="space-y-2">
                        <Label htmlFor="secret-message">Encrypted Message (Private to Selected Contacts)</Label>
                        <Textarea id="secret-message" placeholder="Your true hidden message." value={secretMessage} onChange={e => setSecretMessage(e.target.value)} />
                    </div>
                </div>
                {/* Right Column: Identity, Watermark, Recipients */}
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
                                <div className="flex items-center space-x-4 pr-2">
                                  {coverImage?.type.startsWith('image/') && (
                                      <div className="flex items-center space-x-2">
                                          <Checkbox id="stamp-checkbox" checked={includeStamp} onCheckedChange={(checked) => setIncludeStamp(Boolean(checked))} />
                                          <Label htmlFor="stamp-checkbox" className="font-normal cursor-pointer">Watermark</Label>
                                      </div>
                                  )}
                                  <div className="flex items-center space-x-2">
                                      <Checkbox id="sign-checkbox" checked={includeSignature} onCheckedChange={(checked) => setIncludeSignature(Boolean(checked))} />
                                      <Label htmlFor="sign-checkbox" className="font-bold cursor-pointer">Sign</Label>
                                  </div>
                                </div>
                             </div>
                          </Alert>
                        ) : (
                            <Alert variant="destructive"><AlertTitle>No Active Identity</AlertTitle><AlertDescription>Go to Key Management to set an active identity.</AlertDescription></Alert>
                        )}
                    </div>

                    {/* Watermark Options Section */}
                    {coverImage?.type.startsWith('image/') && includeStamp && (
                      <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                          <h4 className="font-semibold">Visible Watermark Options</h4>
                          <div className="space-y-2">
                              <Label htmlFor="stamp-text">Watermark Text</Label>
                              <Input id="stamp-text" value={stampText} onChange={e => setStampText(e.target.value)} placeholder="Defaults to public key hash" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <Label htmlFor="stamp-font">Font</Label>
                                  <Select value={stampFont} onValueChange={setStampFont}>
                                      <SelectTrigger id="stamp-font"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="Arial">Arial</SelectItem>
                                          <SelectItem value="Verdana">Verdana</SelectItem>
                                          <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                                          <SelectItem value="Courier New">Courier New</SelectItem>
                                      </SelectContent>
                                  </Select>
                              </div>
                              <div className="space-y-2">
                                  <Label htmlFor="stamp-size">Font Size</Label>
                                  <Select value={String(stampSize)} onValueChange={(val) => setStampSize(Number(val))}>
                                      <SelectTrigger id="stamp-size"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="12">12px</SelectItem>
                                          <SelectItem value="16">16px</SelectItem>
                                          <SelectItem value="24">24px</SelectItem>
                                          <SelectItem value="32">32px</SelectItem>
                                      </SelectContent>
                                  </Select>
                              </div>
                          </div>
                      </div>
                    )}

                    {/* Recipient Selection */}
                    {sendToNew ? (
                      // Form for a new recipient.
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
                              <Input id="new-recipient-file" type="file" ref={newRecipientKeyFileRef} onChange={(e) => handleNewRecipientFile(e.target.files?.[0] || null)} className="hidden"/>
                              <Label htmlFor="new-recipient-file" className={cn(buttonVariants({ variant: "link" }), "p-0 h-auto cursor-pointer")}>
                                Or upload a key file
                              </Label>
                          </div>
                          {newRecipientError && <Alert variant="destructive" className="text-xs"><FileWarning className="h-3 w-3" /><AlertDescription>{newRecipientError}</AlertDescription></Alert>}
                      </div>
                    ) : (
                      // List of existing contacts.
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
                     <div className="space-y-2 pt-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="send-to-new" checked={sendToNew} onCheckedChange={(checked) => setSendToNew(Boolean(checked))} />
                            <Label htmlFor="send-to-new" className="cursor-pointer">Send to a new recipient (not in contacts)</Label>
                        </div>
                    </div>
                </div>
            </div>
          )}

          {error && (
              <Alert variant="destructive" className="mt-4"><FileWarning className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
          )}
          
          {/* Result Display Section */}
          {result && (
              <div className="space-y-4 pt-4">
                  <h3 className="font-semibold text-lg text-center">Result: File Ready</h3>
                  <div className="border rounded-md p-4 flex flex-col items-center gap-4 bg-muted/20">
                      {result.isImage ? (
                          <img src={result.url} alt="Steganographic Result" className="max-w-full md:max-w-md rounded-md shadow-md"/>
                      ) : (
                          <div className="text-center p-4 bg-muted rounded-lg w-full max-w-md">
                              <FileDown className="w-12 h-12 mx-auto text-primary" />
                              <p className="mt-2 font-semibold">File Ready for Download</p>
                              <p className="text-sm text-muted-foreground truncate">{result.fileName}</p>
                          </div>
                      )}
                      <div className="flex items-center gap-4">
                        <Button onClick={() => {
                            const a = document.createElement('a');
                            a.href = result.url;
                            a.download = result.fileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }}>
                            <Download className="w-4 h-4 mr-2" /> Download File
                        </Button>
                        <Button variant="secondary" onClick={handleReset}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Start Over
                        </Button>
                      </div>
                  </div>
              </div>
          )}

        </CardContent>

        {!isFormCollapsed && (
          <CardFooter>
            <Button onClick={handleEncode} disabled={isLoading || !isMounted || (includeSignature && !activeIdentity)} className="w-full">
                {isLoading ? <Loader2 className="animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                {includeSignature ? 'Encode, Sign, and Embed' : 'Encode and Embed'}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Dialog to prompt saving a new contact. */}
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

    