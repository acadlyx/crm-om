"use client";
import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
export function LoginForm() {
  const [error,setError]=useState(""),[pending,setPending]=useState(false),router=useRouter(),search=useSearchParams();
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setError("");setPending(true);
    const form=new FormData(e.currentTarget);
    const result=await signIn("credentials",{email:form.get("email"),password:form.get("password"),redirect:false});
    setPending(false);
    if(result?.error){setError("Unable to sign in with those credentials.");return;}
    router.push(search.get("callbackUrl")||"/dashboard");router.refresh();
  }
  return <form onSubmit={submit}><label className="field">Email<input name="email" type="email" autoComplete="username" required/></label><label className="field">Password<input name="password" type="password" autoComplete="current-password" required/></label>{error&&<p role="alert" style={{color:"#B42318"}}>{error}</p>}<button className="brand-button" style={{width:"100%"}} disabled={pending}>{pending?"Signing in…":"Sign in"}</button></form>;
}
