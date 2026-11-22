"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authMessage, cloudEnabled, refreshUser, resendVerification, resetPassword, setCloudUid, signIn, signOut, signUp, watchUser } from "@/lib/cloud";
import { useStore } from "@/lib/store";
import { Logo } from "./shell";

type Auth = { state: "checking" } | { state: "out" } | { state: "verify"; email: string } | { state: "in"; uid: string; email: string };

/** Who is signed in, or "in" with no account when cloud sync is off. */
let current: Auth = { state: "checking" };
export const signedInEmail = () => (current.state === "in" ? current.email : null);

/**
 * Holds the app back until we know whose data to load. Without Firebase keys it does nothing,
 * so LifeOS still starts straight from the file on this Mac.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const [auth, setAuth] = useState<Auth>(cloudEnabled ? { state: "checking" } : { state: "in", uid: "", email: "" });

  useEffect(() => {
    if (!cloudEnabled) {
      void hydrate();
      return;
    }
    return watchUser((user) => {
      if (!user) {
        current = { state: "out" };
        setAuth(current);
        return;
      }
      if (!user.emailVerified) {
        current = { state: "verify", email: user.email ?? "" };
        setAuth(current);
        return;
      }
      setCloudUid(user.uid);
      current = { state: "in", uid: user.uid, email: user.email ?? "" };
      setAuth(current);
      void hydrate();
    });
  }, [hydrate]);

  if (auth.state === "checking") return <Splash />;
  if (auth.state === "out") return <Login />;
  if (auth.state === "verify") return <Verify email={auth.email} />;
  return <>{children}</>;
}

const Splash = () => (
  <div className="grid min-h-dvh place-items-center">
    <Logo size={32} />
  </div>
);

function Verify({ email }: { email: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      // Verified: reloading starts the app with the account's data.
      if (await refreshUser()) location.reload();
      else setNote("Not verified yet. Open the link in the email, then tap this again.");
    } catch {
      setNote("Couldn't check. Try again in a moment.");
    }
    setBusy(false);
  };
  const resend = async () => {
    try {
      await resendVerification();
      setNote("Sent. Check your inbox and spam folder.");
    } catch (err) {
      setNote(authMessage(err));
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={40} />
          <h1 className="text-xl font-semibold">Verify your email</h1>
          <p className="text-sm text-muted-foreground">We sent a link to {email}. Your data opens once it is verified.</p>
        </div>
        {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
        <Button className="w-full" disabled={busy} onClick={check}>I&apos;ve verified</Button>
        <div className="flex justify-between text-[13px] text-muted-foreground">
          <button type="button" className="underline-offset-2 hover:underline" onClick={resend}>Send the email again</button>
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await (mode === "in" ? signIn : signUp)(email.trim(), password);
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError("Type your email first, then tap this again.");
    try {
      await resetPassword(email.trim());
      toast("Check your email for a reset link.");
    } catch (err) {
      setError(authMessage(err));
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={40} />
          <h1 className="text-xl font-semibold">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        </div>
        <Input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
        <div className="flex justify-between text-[13px] text-muted-foreground">
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
          {mode === "in" && <button type="button" className="underline-offset-2 hover:underline" onClick={forgot}>Forgot password</button>}
        </div>
      </form>
    </div>
  );
}
