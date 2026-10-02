"use client";
import Link from "next/link";
import {useState} from "react";
import {supabase} from "@/lib/supabase";

export default function Login(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e:React.FormEvent){e.preventDefault();if(!supabase)return setError("Database connection is not configured.");setBusy(true);setError("");const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error||!data.user){setError(error?.message||"Sign in failed.");setBusy(false);return}const {data:p}=await supabase.from("profiles").select("role").eq("id",data.user.id).maybeSingle();localStorage.setItem("adbridge-user-id",data.user.id);if(p?.role==="creator")localStorage.setItem("adbridge-creator-id",data.user.id);window.location.href=p?.role==="admin"?"/admin":p?.role==="advertiser"?"/advertiser":"/creator"; }
 return <main className="formPage"><div className="formCard"><span className="eyebrow">ADBRIDGE ACCOUNT</span><h1>Welcome <em>back.</em></h1><p>Sign in to manage campaigns, creator work and verified results.</p><form onSubmit={submit}><label>Email</label><input className="textInput" type="email" required value={email} onChange={e=>setEmail(e.target.value)} /><label>Password</label><input className="textInput" type="password" required value={password} onChange={e=>setPassword(e.target.value)} />{error&&<div className="successBox">{error}</div>}<button className="primary fullButton" disabled={busy}>{busy?"Signing in…":"Sign in →"}</button></form><p>New to AdBridge? <Link href="/signup">Create an account</Link></p><Link className="secondary fullButton" href="/">← Back home</Link></div></main>
}