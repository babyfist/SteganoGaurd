
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { KeyRound, Download, Loader2, UserPlus, Trash2, Upload, CheckCircle2, User, Users, ShieldCheck, MoreHorizontal, Share2, Pencil } from 'lucide-react';

export default function KeyTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [identities, setIdentities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId, setActiveIdentityId] = useLocalStorage<string | null>('activeKeyId', null);

  const [editingIdentity, setEditingIdentity] = useState<IdentityKeyPair | null>(null);
  const [newIdentityName, setNewIdentityName] = useState('');
  
  const [addingContactTo, setAddingContactTo] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [pendingContactKeyFile, setPendingContactKeyFile] = useState<File | null>(null);

  const importIdentityRef = useRef<HTMLInputElement>(null);
  const addContactRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
     // One-time data migration for users from the old version
    if (isMounted) return;
    const needsMigration = identities.some(id => !id.contacts);
    if(needsMigration) {
      setIdentities(identities.map(id => ({ ...id, contacts: id.contacts || [] })));
    }
    setIsMounted(true);
  }, [identities, isMounted, setIdentities]);

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
        name: `Identity - ${new Date().toLocaleString()}`,
        description: "SteganoGuard Identity Key Pair",
        signing: { publicKey: publicSigningKey, privateKey: privateSigningKey },
        encryption: { publicKey: publicEncryptionKey, privateKey: privateEncryptionKey },
        contacts: [],
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

      if (!keyData.signing?.privateKey || !keyData.encryption?.privateKey) {
        throw new Error("Invalid identity file. Missing private keys.");
      }

      const newIdentity: IdentityKeyPair = {
        id: uuidv4(),
        name: keyData.name || `Imported Identity - ${file.name}`,
        description: keyData.description || "Imported SteganoGuard Identity",
        signing: keyData.signing,
        encryption: keyData.encryption,
        contacts: keyData.contacts || [],
      };
      setIdentities([...identities, newIdentity]);
      toast({ title: "Success", description: "Identity imported." });
    } catch (err) {
      toast({ variant: 'destructive', title: "Import Error", description: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameIdentity = () => {
    if (!editingIdentity || !newIdentityName.trim()) return;
    setIdentities(identities.map(id => 
        id.id === editingIdentity.id ? { ...id, name: newIdentityName.trim() } : id
    ));
    setEditingIdentity(null);
    setNewIdentityName("");
    toast({ title: "Identity Renamed" });
  };


  const handleAddContact = async () => {
    if (!pendingContactKeyFile || !contactName.trim() || !addingContactTo) {
        toast({ variant: 'destructive', title: "Error", description: "Please provide a name and key file for the contact." });
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

        setIdentities(identities.map(id => {
            if (id.id === addingContactTo) {
                return { ...id, contacts: [...id.contacts, newContact] };
            }
            return id;
        }));
        
        toast({ title: "Success", description: `Contact "${contactName.trim()}" added.` });
    } catch(err) {
        toast({ variant: 'destructive', title: "Error Adding Contact", description: (err as Error).message });
    } finally {
        setIsLoading(false);
        setAddingContactTo(null);
        setContactName('');
        setPendingContactKeyFile(null);
    }
  };

  const deleteIdentity = (idToDelete: string) => {
    setIdentities(identities.filter(idKey => idKey.id !== idToDelete));
    if (activeIdentityId === idToDelete) {
      setActiveIdentityId(null);
    }
    toast({ title: "Identity Deleted" });
  };

  const deleteContact = (identityId: string, contactId: string) => {
    setIdentities(identities.map(id => {
        if (id.id === identityId) {
            return { ...id, contacts: id.contacts.filter(c => c.id !== contactId) };
        }
        return id;
    }));
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User /> Identity & Contact Management</CardTitle>
          <CardDescription>Manage your key pairs (identities) and their associated contacts. The active identity is used to sign messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isMounted ? (
            <div className="flex items-center justify-center space-x-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" /> 
                <span>Loading...</span>
            </div>
          ) : (
            <>
              {!activeIdentityId && identities.length > 0 && (
                <Alert variant="destructive">
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>No Active Identity!</AlertTitle>
                  <AlertDescription>Please set an active identity to be able to sign and send messages.</AlertDescription>
                </Alert>
              )}
              {identities.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No identities found. Generate or import one to get started.</p>}
              
              <Accordion type="single" collapsible className="w-full">
                {identities.map(identity => (
                  <AccordionItem value={identity.id} key={identity.id} className="border rounded-lg mb-2 bg-background/50">
                    <AccordionTrigger className="p-4 hover:no-underline">
                        <div className="flex items-center gap-3">
                            {activeIdentityId === identity.id ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <div className="w-5 h-5"/>}
                            <span className="font-medium text-left">{identity.name}</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 pt-0">
                      <div className="space-y-4 pl-8">
                        <div className="flex items-center gap-2 flex-wrap">
                            {activeIdentityId !== identity.id && <Button variant="outline" size="sm" onClick={() => setActiveIdentityId(identity.id)}>Set Active</Button>}
                             <Button variant="secondary" size="sm" onClick={() => { setEditingIdentity(identity); setNewIdentityName(identity.name); }}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Rename
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => exportPublicKeys(identity.id)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Share Public Key
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => exportIdentity(identity.id)}>
                                <Download className="mr-2 h-4 w-4" />
                                Backup Full Identity
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete...
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the identity "{identity.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteIdentity(identity.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        <h4 className="font-semibold flex items-center gap-2 pt-4 border-t"><Users className="h-4 w-4" /> Contacts for this Identity</h4>
                        <div className="space-y-2">
                          {identity.contacts?.length === 0 && <p className="text-sm text-muted-foreground">No contacts found for this identity.</p>}
                          {identity.contacts?.map(contact => (
                            <div key={contact.id} className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50">
                                <span className="font-medium">{contact.name}</span>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will delete "{contact.name}" from your contacts for this identity.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteContact(identity.id, contact.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            </div>
                          ))}
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => { setAddingContactTo(identity.id); addContactRef.current?.click(); }}>
                          <UserPlus className="mr-2 h-4 w-4" /> Add Contact
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="flex items-center gap-2 mt-4">
                <Button onClick={handleGenerateIdentity} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />} Generate New Identity</Button>
                <Input type="file" accept=".json" className="hidden" ref={importIdentityRef} onChange={e => handleImportIdentity(e.target.files?.[0] || null)} />
                <Button variant="secondary" onClick={() => importIdentityRef.current?.click()}><Upload className="mr-2" /> Import Identity</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Rename Identity Dialog */}
      <Dialog open={!!editingIdentity} onOpenChange={(isOpen) => !isOpen && setEditingIdentity(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Rename Identity</DialogTitle>
                <DialogDescription>Choose a new name for the identity "{editingIdentity?.name}".</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <Label htmlFor="identity-name">Identity Name</Label>
                <Input id="identity-name" value={newIdentityName} onChange={(e) => setNewIdentityName(e.target.value)} />
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button onClick={handleRenameIdentity}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Contact Dialog */}
       <Dialog open={!!addingContactTo && !!pendingContactKeyFile} onOpenChange={(isOpen) => { if(!isOpen) { setAddingContactTo(null); setContactName(''); setPendingContactKeyFile(null); }}}>
        <Input type="file" accept=".json" className="hidden" ref={addContactRef} onChange={e => setPendingContactKeyFile(e.target.files?.[0] || null)} />
        <DialogContent>
            <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>Enter a name for this contact. They will receive messages encrypted with the key from '{pendingContactKeyFile?.name}'.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
            <Label htmlFor="contact-name">Contact Name</Label>
            <Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g., Alice" />
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button type="button" onClick={handleAddContact} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin"/> : 'Save Contact'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
