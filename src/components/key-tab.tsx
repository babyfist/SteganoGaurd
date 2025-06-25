
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from '@/hooks/use-local-storage';
import { IdentityKeyPair, Contact } from '@/lib/types';
import { cn } from '@/lib/utils';
import { KeyRound, Download, Loader2, UserPlus, Trash2, Upload, CheckCircle2, User, Users, ShieldCheck, MoreHorizontal, Pencil, Copy, ArrowUp, ArrowDown, FileWarning } from 'lucide-react';

/**
 * The KeyTab component is responsible for all identity and contact management.
 * Users can generate, import, export, and delete their cryptographic identities.
 * They can also manage a list of contacts for each identity.
 */
export default function KeyTab() {
  // --- STATE MANAGEMENT ---
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [identities, setIdentities] = useLocalStorage<IdentityKeyPair[]>('myKeys', []);
  const [activeIdentityId, setActiveIdentityId] = useLocalStorage<string | null>('activeKeyId', null);

  // State for the "Rename Identity" dialog.
  const [editingIdentity, setEditingIdentity] = useState<IdentityKeyPair | null>(null);
  const [newIdentityName, setNewIdentityName] = useState('');
  
  // State for the "Add Contact" dialog.
  const [addingContactTo, setAddingContactTo] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [pendingContactKeyFile, setPendingContactKeyFile] = useState<File | null>(null);

  // State for the security warning on identity export.
  const [identityToExport, setIdentityToExport] = useState<IdentityKeyPair | null>(null);

  // Refs for file inputs and toast notifications.
  const importIdentityRef = useRef<HTMLInputElement>(null);
  const addContactRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Effect to ensure component is mounted before accessing client-side APIs.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- HANDLERS ---

  /**
   * Generates a new identity with fresh signing and encryption key pairs.
   */
  const handleGenerateIdentity = async () => {
    setIsLoading(true);
    try {
      const { generateSigningKeyPair, generateEncryptionKeyPair, exportKeyJwk } = await import('@/lib/crypto');
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
      // Set the new identity as active if none is currently active.
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

  /**
   * Imports one or more identities from a JSON file.
   * It skips identities that already exist.
   * @param {File | null} file - The JSON file containing identity data.
   */
  const handleImportIdentity = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const { importSigningKey, importEncryptionKey } = await import('@/lib/crypto');
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

          // Validate that the identity has private keys before importing.
          if (!keyData.signing?.privateKey || !keyData.encryption?.privateKey) {
            toast({ variant: 'destructive', title: "Skipping Invalid Identity", description: `Identity "${keyData.name || 'Unknown'}" is missing private keys.` });
            continue;
          }
          
          // Validate that the keys can be imported by the Web Crypto API.
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
      if (importIdentityRef.current) { importIdentityRef.current.value = ""; }
    }
  };

  /**
   * Saves the new name for an identity being edited.
   */
  const handleRenameIdentity = () => {
    if (!editingIdentity || !newIdentityName.trim()) return;
    setIdentities(identities.map(id => 
        id.id === editingIdentity.id ? { ...id, name: newIdentityName.trim() } : id
    ));
    setEditingIdentity(null);
    setNewIdentityName("");
    toast({ title: "Identity Renamed" });
  };

  /**
   * Imports one or more contacts from a public key file or a contact list file.
   */
  const handleAddContact = async () => {
    if (!pendingContactKeyFile || !addingContactTo) {
      toast({ variant: 'destructive', title: "Error", description: "Please select a key file." });
      return;
    }
    setIsLoading(true);

    try {
      const { validatePublicKeys } = await import('@/lib/crypto');
      const fileContent = await pendingContactKeyFile.text();
      const importedData = JSON.parse(fileContent);
      const identityToUpdate = identities.find(i => i.id === addingContactTo);
      if (!identityToUpdate) throw new Error("Target identity not found.");
      
      const existingContactNames = new Set(identityToUpdate.contacts.map(c => c.name.toLowerCase()));
      const keyObjectsToProcess = Array.isArray(importedData) ? importedData : [importedData];
      const contactsToAdd: Contact[] = [];
      let skippedCount = 0;
      let invalidCount = 0;

      for (const keyData of keyObjectsToProcess) {
        try {
          // If importing a list, use the name from the list. Otherwise, use the name from the input field.
          const name = keyObjectsToProcess.length > 1 ? keyData.name : (contactName.trim() || keyData.name);
          if (!name) { invalidCount++; continue; }
          if (existingContactNames.has(name.toLowerCase())) { skippedCount++; continue; }
          
          const publicKeys = await validatePublicKeys(keyData);
          
          contactsToAdd.push({ id: uuidv4(), name: name, ...publicKeys });
          existingContactNames.add(name.toLowerCase());
        } catch (validationError) {
          invalidCount++;
          console.error("Skipping invalid key data:", validationError);
        }
      }

      if (contactsToAdd.length > 0) {
        setIdentities(identities.map(id => 
            id.id === addingContactTo ? { ...id, contacts: [...(id.contacts || []), ...contactsToAdd] } : id
        ));
        toast({ title: "Success", description: `${contactsToAdd.length} contact(s) added successfully.` });
      }

      if (skippedCount > 0) toast({ title: "Import Notice", description: `${skippedCount} contact(s) were skipped as they already exist.` });
      if (invalidCount > 0) toast({ variant: 'destructive', title: "Import Warning", description: `${invalidCount} record(s) were invalid or corrupted.` });
      if (contactsToAdd.length === 0 && skippedCount === 0 && invalidCount === 0) toast({ title: "No Contacts Added", description: "The file did not contain any valid new contacts." });

    } catch (err) {
      toast({ variant: 'destructive', title: "Error Adding Contact", description: (err as Error).message });
    } finally {
      setIsLoading(false);
      setAddingContactTo(null);
      setContactName('');
      setPendingContactKeyFile(null);
      if (addContactRef.current) { addContactRef.current.value = ""; }
    }
  };

  /** Deletes an identity from local storage. */
  const deleteIdentity = (idToDelete: string) => {
    setIdentities(identities.filter(idKey => idKey.id !== idToDelete));
    if (activeIdentityId === idToDelete) setActiveIdentityId(null);
    toast({ title: "Identity Deleted" });
  };

  /** Deletes a contact from a specific identity. */
  const deleteContact = (identityId: string, contactId: string) => {
    setIdentities(identities.map(id => 
        id.id === identityId ? { ...id, contacts: id.contacts.filter(c => c.id !== contactId) } : id
    ));
    toast({ title: "Contact Deleted" });
  };

  /**
   * Reorders a contact within an identity's contact list.
   * @param {string} identityId - The ID of the identity whose contacts are being reordered.
   * @param {number} contactIndex - The current index of the contact to move.
   * @param {'up' | 'down'} direction - The direction to move the contact.
   */
  const handleReorderContact = (identityId: string, contactIndex: number, direction: 'up' | 'down') => {
    const updatedIdentities = identities.map(identity => {
        // Find the correct identity and ensure it has a contacts array before proceeding.
        // This prevents errors if data from localStorage is malformed.
        if (identity.id === identityId && Array.isArray(identity.contacts)) {
            const reorderedContacts = [...identity.contacts];
            const targetIndex = direction === 'up' ? contactIndex - 1 : contactIndex + 1;

            if (targetIndex >= 0 && targetIndex < reorderedContacts.length) {
                // Simple swap of the elements at the two indices.
                [reorderedContacts[contactIndex], reorderedContacts[targetIndex]] = [reorderedContacts[targetIndex], reorderedContacts[contactIndex]];
                return { ...identity, contacts: reorderedContacts };
            }
        }
        return identity;
    });
    setIdentities(updatedIdentities);
  };

  /** Exports a full identity (including private keys) to a backup JSON file. */
  const exportIdentity = async (id: string) => {
      const identity = identities.find(i => i.id === id);
      if (identity) {
        const { downloadJson } = await import('@/lib/browser-utils');
        downloadJson(identity, `steganoguard_identity-backup_${identity.name.replace(/\s/g, '_')}.json`);
      }
  };
  
  /** A helper function to create a standardized public key data object for sharing. */
  const createPublicData = (name: string, signingKey: JsonWebKey, encryptionKey: JsonWebKey) => ({
    name,
    description: `SteganoGuard Public Keys for ${name}`,
    signing: { publicKey: signingKey },
    encryption: { publicKey: encryptionKey },
  });

  /** Copies an identity's public key data to the clipboard. */
  const handleCopyIdentityPublicKey = (id: string) => {
      const identity = identities.find(i => i.id === id);
      if (identity) {
          const publicData = createPublicData(identity.name, identity.signing.publicKey, identity.encryption.publicKey);
          navigator.clipboard.writeText(JSON.stringify(publicData, null, 2));
          toast({ title: "Copied to Clipboard", description: `Public key for identity "${identity.name}" has been copied.` });
      }
  };

  /** Downloads an identity's public key data as a JSON file. */
  const handleDownloadIdentityPublicKey = async (id: string) => {
      const identity = identities.find(i => i.id === id);
      if (identity) {
          const publicData = createPublicData(identity.name, identity.signing.publicKey, identity.encryption.publicKey);
          const { downloadJson } = await import('@/lib/browser-utils');
          downloadJson(publicData, `steganoguard_public-keys_${identity.name.replace(/\s/g, '_')}.json`);
      }
  };

  /** Copies a contact's public key data to the clipboard. */
  const handleShareContactCopy = (contact: Contact) => {
    const publicData = createPublicData(contact.name, contact.signingPublicKey, contact.encryptionPublicKey);
    navigator.clipboard.writeText(JSON.stringify(publicData, null, 2));
    toast({ title: "Copied to Clipboard", description: `Public key for ${contact.name} has been copied.` });
  };
  
  /** Downloads a contact's public key data as a JSON file. */
  const handleShareContactDownload = async (contact: Contact) => {
      const publicData = createPublicData(contact.name, contact.signingPublicKey, contact.encryptionPublicKey);
      const { downloadJson } = await import('@/lib/browser-utils');
      downloadJson(publicData, `steganoguard_public-keys_${contact.name.replace(/\s/g, '_')}.json`);
  };

  /** Exports all contacts for a given identity to a single JSON file. */
  const handleExportContacts = async (identityId: string) => {
      const identity = identities.find(i => i.id === identityId);
      if (identity && identity.contacts && identity.contacts.length > 0) {
          const contactsToExport = identity.contacts.map(contact => 
            createPublicData(contact.name, contact.signingPublicKey, contact.encryptionPublicKey)
          );
          const { downloadJson } = await import('@/lib/browser-utils');
          downloadJson(contactsToExport, `steganoguard_contacts_${identity.name.replace(/\s/g, '_')}.json`);
      }
  };

  /** Exports all identities to a single backup JSON file. */
  const handleExportAllIdentities = async () => {
      if (identities.length > 0) {
          const date = new Date().toISOString().split('T')[0];
          const { downloadJson } = await import('@/lib/browser-utils');
          downloadJson(identities, `steganoguard_all-identities-backup_${date}.json`);
      }
  };


  // --- RENDER LOGIC ---
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
                <Loader2 className="h-5 w-5 animate-spin" /> <span>Loading...</span>
            </div>
          ) : (
            <>
              {!activeIdentityId && identities.length > 0 && (
                <Alert variant="destructive">
                  <ShieldCheck className="h-4 w-4" /><AlertTitle>No Active Identity!</AlertTitle>
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
                        {/* Identity Actions Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 ml-2"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {activeIdentityId !== identity.id && <DropdownMenuItem onClick={() => setActiveIdentityId(identity.id)}><CheckCircle2 className="mr-2 h-4 w-4" /> Set Active</DropdownMenuItem>}
                                <DropdownMenuItem onClick={() => { setEditingIdentity(identity); setNewIdentityName(identity.name); }}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleCopyIdentityPublicKey(identity.id)}><Copy className="mr-2 h-4 w-4" /> Copy Public Key</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadIdentityPublicKey(identity.id)}><Download className="mr-2 h-4 w-4" /> Download Public Key</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setIdentityToExport(identity)}><Download className="mr-2 h-4 w-4" /> Backup Full Identity</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportContacts(identity.id)} disabled={!identity.contacts || identity.contacts.length === 0}><Users className="mr-2 h-4 w-4" /> Export Contacts</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-500"><Trash2 className="mr-2 h-4 w-4"/> Delete...</DropdownMenuItem></AlertDialogTrigger>
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
                          {identity.contacts?.map((contact, index) => (
                            <div key={contact.id} className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col -my-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                            onClick={() => handleReorderContact(identity.id, index, 'up')}
                                            disabled={index === 0}
                                            aria-label="Move contact up"
                                        >
                                            <ArrowUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                            onClick={() => handleReorderContact(identity.id, index, 'down')}
                                            disabled={!identity.contacts || index === identity.contacts.length - 1}
                                            aria-label="Move contact down"
                                        >
                                            <ArrowDown className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <span className="font-medium">{contact.name}</span>
                                </div>
                                {/* Contact Actions Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleShareContactCopy(contact)}><Copy className="mr-2 h-4 w-4" /> Copy Public Key</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleShareContactDownload(contact)}><Download className="mr-2 h-4 w-4" /> Download Public Key</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-500"><Trash2 className="mr-2 h-4 w-4" /> Delete...</DropdownMenuItem></AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>Delete Contact?</AlertDialogTitle><AlertDialogDescription>This will delete "{contact.name}" from your contacts.</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteContact(identity.id, contact.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                          ))}
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => { setAddingContactTo(identity.id); }}><UserPlus className="mr-2 h-4 w-4" /> Add Contact</Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Button onClick={handleGenerateIdentity} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Generate New Identity</Button>
                <Input id="import-identity-file" type="file" className="hidden" ref={importIdentityRef} onChange={e => handleImportIdentity(e.target.files?.[0] || null)} />
                <Label htmlFor="import-identity-file" className={cn(buttonVariants({ variant: 'secondary' }), 'cursor-pointer')}>
                  <Upload className="mr-2 h-4 w-4" /> Import Identity
                </Label>
                <Button variant="secondary" onClick={handleExportAllIdentities} disabled={!isMounted || identities.length === 0}><Download className="mr-2 h-4 w-4" /> Export All</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Rename Identity Dialog */}
      <Dialog open={!!editingIdentity} onOpenChange={(isOpen) => !isOpen && setEditingIdentity(null)}>
        <DialogContent>
            <DialogHeader><DialogTitle>Rename Identity</DialogTitle><DialogDescription>Choose a new name for the identity "{editingIdentity?.name}".</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
                <Label htmlFor="identity-name">Identity Name</Label>
                <Input id="identity-name" value={newIdentityName} onChange={(e) => setNewIdentityName(e.target.value)} />
            </div>
            <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={handleRenameIdentity}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
       {/* Add Contact Dialog */}
       <Dialog open={!!addingContactTo} onOpenChange={(isOpen) => { if(!isOpen) { setAddingContactTo(null); setContactName(''); setPendingContactKeyFile(null); if (addContactRef.current) addContactRef.current.value = ""; }}}>
        <DialogContent>
            <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>Import a contact by uploading their public key file. You can also import a contact list file to add multiple contacts at once.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-primary">Contact Name</Label>
                <Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g., Alice (only for single key files)" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-key-file" className="text-primary">Contact Public Key / List File</Label>
                <Input id="add-contact-file" type="file" className="hidden" ref={addContactRef} onChange={e => setPendingContactKeyFile(e.target.files?.[0] || null)} />
                 <Label htmlFor="add-contact-file" className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start text-muted-foreground font-normal cursor-pointer')}>
                    <Upload className="mr-2 h-4 w-4" />
                    {pendingContactKeyFile ? pendingContactKeyFile.name : "Select key file..."}
                 </Label>
              </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button type="button" onClick={handleAddContact} disabled={isLoading || !pendingContactKeyFile}>{isLoading ? <Loader2 className="animate-spin"/> : 'Save Contact(s)'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security Warning on Identity Export */}
      <AlertDialog open={!!identityToExport} onOpenChange={(isOpen) => !isOpen && setIdentityToExport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><FileWarning className="text-destructive" /> Security Warning</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export a full backup of the identity "{identityToExport?.name}".
              <br /><br />
              <strong className="text-destructive-foreground">This file will contain your unencrypted private keys.</strong> Anyone with access to this file can impersonate you and decrypt your messages.
              <br /><br />
              Store this file in a secure, encrypted location, like a password manager or an encrypted disk. Do not share it or store it in an insecure location like your Downloads folder or a cloud drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (identityToExport) {
                  exportIdentity(identityToExport.id);
                  toast({ title: "Identity Exported", description: `A backup for "${identityToExport.name}" has been downloaded.` });
                }
                setIdentityToExport(null);
              }}
            >
              I understand, Export Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    