
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from '@/hooks/use-local-storage';
import { IdentityKeyPair, Contact } from '@/lib/types';
import { generateSigningKeyPair, generateEncryptionKeyPair, exportKeyJwk, downloadJson, importSigningKey, importEncryptionKey, validatePublicKeys } from '@/lib/crypto';
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
    setIsMounted(true);
  }, []);

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
      if (identities.length === 0 || !activeIdentityId) {
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
      const importedData = JSON.parse(fileContent);

      const identitiesToImport: IdentityKeyPair[] = Array.isArray(importedData) ? importedData : [importedData];
      
      const existingIds = new Set(identities.map(i => i.id));
      const validNewIdentities: IdentityKeyPair[] = [];
      let skippedCount = 0;

      for (const keyData of identitiesToImport) {
          if (existingIds.has(keyData.id)) {
            skippedCount++;
            continue;
          }

          if (!keyData.signing?.privateKey || !keyData.encryption?.privateKey) {
            toast({ variant: 'destructive', title: "Skipping Invalid Identity", description: `Identity "${keyData.name || 'Unknown'}" is missing private keys.` });
            continue;
          }
          
          try {
            await importSigningKey(keyData.signing.privateKey, 'sign');
            await importEncryptionKey(keyData.encryption.privateKey, ['deriveKey']);
          } catch (validationError) {
             toast({ variant: 'destructive', title: "Skipping Invalid Key", description: `Could not validate keys for identity "${keyData.name || 'Unknown'}". It may be corrupted.` });
            continue;
          }
        
          const newIdentity: IdentityKeyPair = {
            id: keyData.id || uuidv4(),
            name: keyData.name || `Imported Identity - ${file.name}`,
            description: keyData.description || "Imported SteganoGuard Identity",
            signing: keyData.signing,
            encryption: keyData.encryption,
            contacts: keyData.contacts || [],
          };
          validNewIdentities.push(newIdentity);
      }
      
      if (validNewIdentities.length > 0) {
        setIdentities([...identities, ...validNewIdentities]);
        toast({ title: "Success", description: `${validNewIdentities.length} new identity/identities imported.` });
      }
      
      if (skippedCount > 0) {
        toast({ title: "Import Notice", description: `${skippedCount} identity/identities were skipped as they already exist.` });
      }
      
      if (validNewIdentities.length === 0 && skippedCount === 0) {
        toast({ variant: 'destructive', title: "Import Failed", description: "No valid new identities found in the file." });
      }
      
    } catch (err) {
      toast({ variant: 'destructive', title: "Import Error", description: `Could not read or parse the file. ${(err as Error).message}` });
    } finally {
      setIsLoading(false);
      if (importIdentityRef.current) {
        importIdentityRef.current.value = "";
      }
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
    if (!pendingContactKeyFile || !addingContactTo) {
        toast({ variant: 'destructive', title: "Error", description: "Please select a key file." });
        return;
    }

    setIsLoading(true);

    try {
        const fileContent = await pendingContactKeyFile.text();
        const importedData = JSON.parse(fileContent);
        
        const contactsToAdd: Contact[] = [];
        let skippedCount = 0;

        const identityToUpdate = identities.find(i => i.id === addingContactTo);
        if (!identityToUpdate) {
            throw new Error("Target identity not found.");
        }
        const existingContactNames = new Set(identityToUpdate.contacts.map(c => c.name.toLowerCase()));

        if (Array.isArray(importedData)) { // Case 1: It's a contact list
            for (const contactData of importedData) {
                // Basic validation of the contact object from the list
                if (!contactData.name || !contactData.signingPublicKey || !contactData.encryptionPublicKey) {
                    continue; // Skip malformed entries
                }
                if (existingContactNames.has(contactData.name.toLowerCase())) {
                    skippedCount++;
                    continue;
                }
                
                // Validate the keys before adding
                await validatePublicKeys({
                    signing: { publicKey: contactData.signingPublicKey },
                    encryption: { publicKey: contactData.encryptionPublicKey },
                });

                contactsToAdd.push({
                    id: contactData.id || uuidv4(),
                    name: contactData.name,
                    signingPublicKey: contactData.signingPublicKey,
                    encryptionPublicKey: contactData.encryptionPublicKey,
                });
                existingContactNames.add(contactData.name.toLowerCase()); // Avoid duplicates within the same file
            }
        } else if (typeof importedData === 'object' && importedData !== null) { // Case 2: It's a single key file
            if (!contactName.trim()) {
                 toast({ variant: 'destructive', title: "Error", description: "Please provide a name for the new contact when importing a single key file." });
                 setIsLoading(false);
                 return;
            }
            if (existingContactNames.has(contactName.trim().toLowerCase())) {
                toast({ variant: 'destructive', title: "Contact Exists", description: `A contact named "${contactName.trim()}" already exists.` });
                setIsLoading(false);
                return;
            }

            const publicKeys = await validatePublicKeys(importedData);
            contactsToAdd.push({
                id: uuidv4(),
                name: contactName.trim(),
                ...publicKeys,
            });
        } else {
             throw new Error("Invalid or unrecognized file format. Please upload a valid public key file or a contact list file.");
        }

        if (contactsToAdd.length > 0) {
            setIdentities(identities.map(id => {
                if (id.id === addingContactTo) {
                    return { ...id, contacts: [...(id.contacts || []), ...contactsToAdd] };
                }
                return id;
            }));
        }
        
        const addedCount = contactsToAdd.length;

        if (addedCount > 0) {
            toast({ title: "Success", description: `${addedCount} contact(s) added successfully.` });
        }
        if (skippedCount > 0) {
            toast({ title: "Import Notice", description: `${skippedCount} contact(s) were skipped because a contact with the same name already exists.` });
        }
        if (addedCount === 0 && skippedCount === 0) {
            toast({ title: "No Contacts Added", description: "The file did not contain any valid new contacts." });
        }

    } catch (err) {
        const errorMessage = (err as Error).message;
        toast({ variant: 'destructive', title: "Error Adding Contact", description: errorMessage });
    } finally {
        setIsLoading(false);
        setAddingContactTo(null);
        setContactName('');
        setPendingContactKeyFile(null);
        if (addContactRef.current) {
          addContactRef.current.value = "";
        }
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

  const handleExportContacts = (identityId: string) => {
      const identity = identities.find(i => i.id === identityId);
      if (identity && identity.contacts && identity.contacts.length > 0) {
          downloadJson(identity.contacts, `steganoguard_contacts_${identity.name.replace(/\s/g, '_')}.json`);
      }
  };

  const handleExportAllIdentities = () => {
      if (identities.length > 0) {
          const date = new Date().toISOString().split('T')[0];
          downloadJson(identities, `steganoguard_all-identities-backup_${date}.json`);
          toast({ title: "All Identities Exported", description: "A backup file with all your identities has been downloaded." });
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
                    <div className="flex items-center justify-between p-4 hover:no-underline">
                        <AccordionTrigger className="p-0 flex-1">
                            <div className="flex items-center gap-3">
                                {activeIdentityId === identity.id ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <div className="w-5 h-5"/>}
                                <span className="font-medium text-left">{identity.name}</span>
                            </div>
                        </AccordionTrigger>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {activeIdentityId !== identity.id && (
                                    <DropdownMenuItem onClick={() => setActiveIdentityId(identity.id)}>
                                        <CheckCircle2 className="mr-2" /> Set Active
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => { setEditingIdentity(identity); setNewIdentityName(identity.name); }}>
                                    <Pencil className="mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => exportPublicKeys(identity.id)}>
                                    <Share2 className="mr-2" /> Share Public Key
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportIdentity(identity.id)}>
                                    <Download className="mr-2" /> Backup Full Identity
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    onClick={() => handleExportContacts(identity.id)}
                                    disabled={!identity.contacts || identity.contacts.length === 0}>
                                    <Users className="mr-2" /> Export Contacts
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-500">
                                            <Trash2 className="mr-2"/> Delete...
                                        </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the identity "{identity.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteIdentity(identity.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <AccordionContent className="p-4 pt-0">
                      <div className="space-y-4 pl-8">
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
                                          <AlertDialogAction onClick={() => deleteContact(identity.id, contact.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            </div>
                          ))}
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => { setAddingContactTo(identity.id); }}>
                          <UserPlus className="mr-2 h-4 w-4" /> Add Contact
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Button onClick={handleGenerateIdentity} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />} Generate New Identity</Button>
                <Input type="file" accept=".json" className="hidden" ref={importIdentityRef} onChange={e => handleImportIdentity(e.target.files?.[0] || null)} />
                <Button variant="secondary" onClick={() => importIdentityRef.current?.click()}><Upload className="mr-2" /> Import Identity</Button>
                <Button variant="secondary" onClick={handleExportAllIdentities} disabled={!isMounted || identities.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export All
                </Button>
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
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleRenameIdentity}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Contact Dialog */}
       <Dialog open={!!addingContactTo} onOpenChange={(isOpen) => { if(!isOpen) { setAddingContactTo(null); setContactName(''); setPendingContactKeyFile(null); if (addContactRef.current) addContactRef.current.value = ""; }}}>
        <DialogContent>
            <DialogHeader>
            <DialogTitle className="text-primary">Add New Contact</DialogTitle>
            <DialogDescription>
                Enter a name for a new contact and upload their public key file. You can also upload a contact list file to add multiple contacts at once.
            </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-primary">Contact Name</Label>
                <Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g., Alice (required for single key files)" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-key-file" className="text-primary">Contact Public Key / List File</Label>
                <Input type="file" accept=".json" className="hidden" ref={addContactRef} onChange={e => setPendingContactKeyFile(e.target.files?.[0] || null)} />
                 <Button variant="outline" className="w-full" onClick={() => addContactRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    {pendingContactKeyFile ? pendingContactKeyFile.name : "Select key file..."}
                 </Button>
              </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button type="button" onClick={handleAddContact} disabled={isLoading || !pendingContactKeyFile}>{isLoading ? <Loader2 className="animate-spin"/> : 'Save Contact(s)'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
