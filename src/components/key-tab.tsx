
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { generateSigningKeyPair, generateEncryptionKeyPair, exportKeyJwk, downloadJson } from '@/lib/crypto';
import { KeyRound, Download, Loader2, PartyPopper } from 'lucide-react';

export default function KeyTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<object | null>(null);
  const [error, setError] = useState('');

  const handleGenerateKeys = async () => {
    setIsLoading(true);
    setError('');
    setGeneratedKeys(null);
    try {
      // Generate both key pairs in parallel
      const [signingKeyPair, encryptionKeyPair] = await Promise.all([
        generateSigningKeyPair(),
        generateEncryptionKeyPair(),
      ]);

      // Export all keys to JWK format in parallel
      const [
        publicSigningKey,
        privateSigningKey,
        publicEncryptionKey,
        privateEncryptionKey
      ] = await Promise.all([
        exportKeyJwk(signingKeyPair.publicKey),
        exportKeyJwk(signingKeyPair.privateKey),
        exportKeyJwk(encryptionKeyPair.publicKey),
        exportKeyJwk(encryptionKeyPair.privateKey)
      ]);

      const keys = {
        name: `SteganoGuard Key Pair - ${new Date().toISOString()}`,
        description: "Contains one key pair for signing/verification (Ed25519) and one for encryption/decryption (ECDH). KEEP THE PRIVATE KEYS SECRET.",
        signing: {
          publicKey: publicSigningKey,
          privateKey: privateSigningKey,
        },
        encryption: {
          publicKey: publicEncryptionKey,
          privateKey: privateEncryptionKey,
        }
      };
      setGeneratedKeys(keys);
    } catch (err) {
      console.error(err);
      setError('Failed to generate keys. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadKeys = () => {
    if (generatedKeys) {
      downloadJson(generatedKeys, 'steganoguard_keys.json');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Management</CardTitle>
        <CardDescription>Generate your cryptographic key pairs for signing and encryption.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          Click the button below to generate a new set of keys. You will get one pair for signing messages (to prove it's you) and another for encrypting messages (so only the intended recipient can read them).
        </p>
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Important!</AlertTitle>
          <AlertDescription>
            Once generated, you must download your keys and store them in a safe place. The private keys are sensitive and should never be shared.
          </AlertDescription>
        </Alert>

        {generatedKeys && (
          <Alert variant="default" className="bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700">
            <PartyPopper className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-800 dark:text-green-300">Keys Generated Successfully!</AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-400">
              Your keys are ready. Download them now and keep them secure.
            </AlertDescription>
          </Alert>
        )}

         {error && (
            <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-4">
        <Button onClick={handleGenerateKeys} disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Generate New Keys
        </Button>
        {generatedKeys && (
          <Button onClick={handleDownloadKeys} variant="secondary" className="w-full sm:w-auto">
            <Download />
            Download Keys (.json)
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
