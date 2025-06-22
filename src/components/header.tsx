
import { ShieldCheck } from 'lucide-react';

export default function Header() {
  return (
    <header className="text-center">
      <div className="flex items-center justify-center gap-4 mb-2">
        <ShieldCheck className="w-12 h-12 text-primary" />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          SteganoGuard
        </h1>
      </div>
      <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
        A steganography and cryptography tool to hide and sign secret messages within images, ensuring confidentiality and authenticity.
      </p>
    </header>
  );
}
