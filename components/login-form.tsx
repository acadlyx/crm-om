"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/password-input";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const search = useSearchParams();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);

    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setPending(false);
    if (result?.error) {
      setError("Unable to sign in with those credentials.");
      return;
    }

    router.push(search.get("callbackUrl") || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        <span>Password</span>
        <PasswordInput name="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert" style={{ color: "#B42318" }}>{error}</p>}
      <button className="brand-button" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
