"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/header";
import EncodeTab from "@/components/encode-tab";
import DecodeTab from "@/components/decode-tab";
import KeyTab from "@/components/key-tab";
import { FileLock2, FileKey2, KeyRound } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen p-4 md:p-8">
      <Header />
      <main className="w-full max-w-5xl mt-8">
        <Tabs defaultValue="encode" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto sm:h-12">
            <TabsTrigger value="encode" className="py-2.5">
              <FileLock2 className="w-4 h-4 mr-2" />
              Encode & Sign
            </TabsTrigger>
            <TabsTrigger value="decode" className="py-2.5">
              <FileKey2 className="w-4 h-4 mr-2" />
              Decode & Verify
            </TabsTrigger>
            <TabsTrigger value="keys" className="py-2.5">
              <KeyRound className="w-4 h-4 mr-2" />
              Key Management
            </TabsTrigger>
          </TabsList>
          <TabsContent value="encode" className="mt-6">
            <EncodeTab />
          </TabsContent>
          <TabsContent value="decode" className="mt-6">
            <DecodeTab />
          </TabsContent>
          <TabsContent value="keys" className="mt-6">
            <KeyTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
