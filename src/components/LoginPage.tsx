import { useState } from "react";
import { Wallet } from "lucide-react";
import { useAuth } from "../auth";
import { Button } from "./ui/button";

export function LoginPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    try {
      setError(null);
      await signIn();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Google sign-in failed unexpectedly";
      setError(message);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-2">
        <Wallet className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Dineros</h1>
        <p className="text-sm text-muted-foreground">
          Personal accounting, simplified.
        </p>
      </div>
      <Button size="lg" onClick={handleSignIn}>
        Sign in with Google
      </Button>
      {error != null && (
        <p className="max-w-xs text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
