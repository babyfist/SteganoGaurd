
"use client";

import React, { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from '@/hooks/use-local-storage';
import { IdentityKeyPair, Contact } from '@/lib/types';
import { generateSigningKeyPair, generateEncryptionKeyPair, exportKeyJwk, downloadJson } from '@/lib/crypto';
import { KeyRound, Download, Loader2, UserPlus, Trash2, Upload, CheckCircle2, User, Users, ShieldCheck, MoreHorizontal, Share2 } from 'lucide-react';

export default function KeyTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [identities, setIdentities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId, setActiveIdentityId] = useLocalStorage<string | null>('activeKeyId', null);
  const [contacts, setContacts] = useLocalStorage<Contact[]>('contacts', []);

  const [contactName, setContactName] = useState('');
  const [pendingContactKeyFile, setPendingContactKeyFile] = useState<File | null>(null);

  const importIdentityRef = useRef<HTMLInputElement>(null);
  const addContactRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleGenerateIdentity = async () => {
    setIsLoading(true);
    try {
      const [signingKeyPair, encryptionKeyPair] = await Promise.all([
        generateSigningKeyPair(),
        generateEncryptionKeyPair(),
      ]);

      const [publicSigningKey, privateSigningKey, publicEncryptionKey, privateEncryptionKey] = await Promise.all([
        exportKeyJwk(signingKeyPair.publicKey),
        exportKeyJwk(signingKeyPair.privateKey),
        exportKeyJwk(encryptionKeyPair.publicKey),
        exportKeyJwk(encryptionKeyPair.privateKey),
      ]);
      
      const newIdentity: IdentityKeyPair = {
        id: uuidv4(),
        name: `Identity - ${new Date().toLocaleDateString()}`,
        description: "SteganoGuard Identity Key Pair",
        signing: { publicKey: publicSigningKey, privateKey: privateSigningKey },
        encryption: { publicKey: publicEncryptionKey, privateKey: privateEncryptionKey },
      };

      const updatedIdentities = [...identities, newIdentity];
      setIdentities(updatedIdentities);
      if (identities.length === 0) {
        setActiveIdentityId(newIdentity.id);
      }
      toast({ title: "Success", description: "New identity generated and saved." });
    } catch (err) {
      toast({ variant: 'destructive', title: "Error", description: "Failed to generate identity." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportIdentity = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const fileContent = await file.text();
      const keyData = JSON.parse(fileContent);

      // Basic validation
      if (!keyData.signing?.privateKey || !keyData.encryption?.privateKey) {
        throw new Error("Invalid identity file. Missing private keys.");
      }

      const newIdentity: IdentityKeyPair = {
        id: uuidv4(),
        name: keyData.name || `Imported Identity - ${file.name}`,
        ...keyData
      };
      setIdentities([...identities, newIdentity]);
      toast({ title: "Success", description: "Identity imported." });
    } catch (err) {
      toast({ variant: 'destructive', title: "Import Error", description: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContact = async () => {
    if (!pendingContactKeyFile || !contactName.trim()) {
        toast({ variant: 'destructive', title: "Error", description: "Please provide a name for the contact." });
        return;
    }
    setIsLoading(true);
    try {
        const fileContent = await pendingContactKeyFile.text();
        const keyData = JSON.parse(fileContent);

        if (!keyData.signing?.publicKey || !keyData.encryption?.publicKey) {
            throw new Error("Invalid key file. Must contain public signing and encryption keys.");
        }

        const newContact: Contact = {
            id: uuidv4(),
            name: contactName.trim(),
            signingPublicKey: keyData.signing.publicKey,
            encryptionPublicKey: keyData.encryption.publicKey,
        };

        setContacts([...contacts, newContact]);
        toast({ title: "Success", description: `Contact "${contactName.trim()}" added.` });
        setContactName('');
        setPendingContactKeyFile(null);
    } catch(err) {
        toast({ variant: 'destructive', title: "Error Adding Contact", description: (err as Error).message });
    } finally {
        setIsLoading(false);
    }
  };

  const deleteIdentity = (id: string) => {
    setIdentities(identities.filter(idKey => idKey.id !== id));
    if (activeIdentityId === id) {
      setActiveIdentityId(null);
    }
    toast({ title: "Identity Deleted" });
  };

  const deleteContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
    toast({ title: "Contact Deleted" });
  };

  const exportIdentity = (id: string) => {
      const identity = identities.find(i => i.id === id);
      if (identity) {
          downloadJson(identity, `steganoguard_identity-backup_${identity.name.replace(/\s/g, '_')}.json`);
      }
  };
  
  const exportPublicKeys = (id: string) => {
      const identity = identities.find(i => i.id === id);
      if (identity) {
          const publicData = {
              name: identity.name,
              description: "SteganoGuard Public Keys for Sharing",
              signing: { publicKey: identity.signing.publicKey },
              encryption: { publicKey: identity.encryption.publicKey },
          };
          downloadJson(publicData, `steganoguard_public-keys_${identity.name.replace(/\s/g, '_')}.json`);
          toast({title: "Public Key Exported", description: "The file can now be shared with your contacts."})
      }
  };

  const exportContactPublicKey = (id: string) => {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
          const publicData = {
              name: contact.name,
              signing: { publicKey: contact.signingPublicKey },
              encryption: { publicKey: contact.encryptionPublicKey },
          };
          downloadJson(publicData, `contact_publickey_${contact.name.replace(/\s/g, '_')}.json`);
      }
  };


  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User /> Your Identities</CardTitle>
          <CardDescription>Manage your key pairs. The active identity is used to sign messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!activeIdentityId && identities.length > 0 && (
            <Alert variant="destructive">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>No Active Identity!</AlertTitle>
              <AlertDescription>Please set an active identity to be able to sign and send messages.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {identities.length === 0 && <p className="text-sm text-muted-foreground">No identities found. Generate or import one to get started.</p>}
            {identities.map(idKey => (
              <div key={idKey.id} className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50">
                <div className="flex items-center gap-3">
                    {activeIdentityId === idKey.id ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <div className="w-5 h-5"/>}
                    <span className="font-medium">{idKey.name}</span>
                </div>
                <div className="flex items-center gap-2">
                    {activeIdentityId !== idKey.id && <Button variant="outline" size="sm" onClick={() => setActiveIdentityId(idKey.id)}>Set Active</Button>}
                    <AlertDialog>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem onClick={() => exportPublicKeys(idKey.id)}>
                            <Share2 className="mr-2 h-4 w-4" />
                            <span>Share Public Key</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportIdentity(idKey.id)}>
                            <Download className="mr-2 h-4 w-4" />
                            <span>Backup Full Identity</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete...</span>
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the identity "{idKey.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteIdentity(idKey.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={handleGenerateIdentity} disabled={isLoading}><KeyRound /> {isLoading ? <Loader2 className="animate-spin" /> : 'Generate New Identity'}</Button>
          <Input type="file" accept=".json" className="hidden" ref={importIdentityRef} onChange={e => handleImportIdentity(e.target.files?.[0] || null)} />
          <Button variant="secondary" onClick={() => importIdentityRef.current?.click()}><Upload /> Import Identity</Button>
        </CardFooter>
      </Card>

      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users /> Contacts</CardTitle>
            <CardDescription>Manage your contacts' public keys to send them encrypted messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
             {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts found. Add a contact to send them secret messages.</p>}
             {contacts.map(contact => (
                <div key={contact.id} className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50">
                    <span className="font-medium">{contact.name}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => exportContactPublicKey(contact.id)}><Download className="h-4 w-4 mr-1"/> Export Public Key</Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will delete "{contact.name}" from your contacts.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteContact(contact.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
             ))}
          </CardContent>
          <CardFooter>
            <Dialog onOpenChange={(open) => { if(!open) { setContactName(''); setPendingContactKeyFile(null); }}}>
              <DialogTrigger asChild>
                <Button onClick={() => addContactRef.current?.click()}><UserPlus /> Add Contact</Button>
              </DialogTrigger>
              <Input type="file" accept=".json" className="hidden" ref={addContactRef} onChange={e => setPendingContactKeyFile(e.target.files?.[0] || null)} />
              {pendingContactKeyFile && (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Contact</DialogTitle>
                    <DialogDescription>Enter a name for this contact. They will receive messages encrypted with the key from '{pendingContactKeyFile.name}'.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Label htmlFor="contact-name">Contact Name</Label>
                    <Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g., Alice" />
                  </div>
                  <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" onClick={handleAddContact} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin"/> : 'Save Contact'}</Button>
                      </DialogClose>
                  </DialogFooter>
                </DialogContent>
              )}
            </Dialog>
          </CardFooter>
      </Card>
    </div>
  );
}
