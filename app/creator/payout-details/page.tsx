"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Method="bank_transfer"|"mobile_money";
type Details={payout_method?:Method;country_code?:string;currency_code?:string;account_holder?:string;bank_name?:string;account_number?:string;routing_code?:string;swift_bic?:string;iban?:string;mobile_money_provider?:string;mobile_number?:string};
export default function PayoutDetails(){
 const[d,setD]=useState<Details>({payout_method:"bank_transfer",country_code:"NG",currency_code:"NGN"}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{async function load(){if(!supabase){setError("Database connection is not ready.");setLoading(false);return}const{data:{user}}=await supabase.auth.getUser();if(!user){location.href="/login";return}const{data,error:e}=await supabase.rpc("get_creator_payout_method");if(e)setError(e.message);else if(data&&Object.keys(data).length)setD({...d,...data});setLoading(false)}void load()},[]);
 function set<K extends keyof Details>(key:K,value:Details[K]){setD(old=>({...old,[key]:value}))}
 async function save(){if(!supabase)return;setSaving(true);setError("");setMessage("");const{error:e}=await supabase.rpc("save_creator_payout_method",{
  p_payout_method:d.payout_method,p_country_code:d.country_code,p_currency_code:d.currency_code,
  p_account_holder:d.account_holder||null,p_bank_name:d.bank_name||null,p_account_number:d.account_number||null,
  p_routing_code:d.routing_code||null,p_swift_bic:d.swift_bic||null,p_iban:d.iban||null,
  p_mobile_money_provider:d.mobile_money_provider||null,p_mobile_number:d.mobile_number||null
 });if(e)setError(e.message||"Could not save payout details.");else setMessage("Your payout details were saved securely. Only you and authorised AdBridge administrators can access them.");setSaving(false)}
 return <main className="formPage"><Link href="/creator/earnings" className="back">← Earnings</Link><div className="formCard wide"><span className="eyebrow">CREATOR & PUBLISHER · PAYOUT PROFILE</span><h1>Where should we <em>pay you?</em></h1><p>Add the bank or mobile-money destination AdBridge should use when processing an approved withdrawal. Check every detail carefully.</p>
 {loading?<div className="successBox">Loading payout details…</div>:<>
 <label>Payout method</label><div className="choices compact"><button type="button" className={d.payout_method==="bank_transfer"?"selected":""} onClick={()=>set("payout_method","bank_transfer")}>Bank transfer</button><button type="button" className={d.payout_method==="mobile_money"?"selected":""} onClick={()=>set("payout_method","mobile_money")}>Mobile money</button></div>
 <div className="statsGrid"><div><label>Country code (2 letters)</label><input className="textInput" maxLength={2} value={d.country_code||""} onChange={e=>set("country_code",e.target.value.toUpperCase())} placeholder="NG"/></div><div><label>Payout currency (3 letters)</label><input className="textInput" maxLength={3} value={d.currency_code||""} onChange={e=>set("currency_code",e.target.value.toUpperCase())} placeholder="NGN"/></div></div>
 {d.payout_method==="bank_transfer"?<>
 <label>Account holder's full name</label><input className="textInput" autoComplete="name" value={d.account_holder||""} onChange={e=>set("account_holder",e.target.value)} placeholder="Name on bank account"/>
 <label>Bank name</label><input className="textInput" value={d.bank_name||""} onChange={e=>set("bank_name",e.target.value)} placeholder="Your bank"/>
 <label>Account number</label><input className="textInput" inputMode="numeric" autoComplete="off" value={d.account_number||""} onChange={e=>set("account_number",e.target.value)} placeholder="Bank account number"/>
 <label>Routing / sort code (if required)</label><input className="textInput" value={d.routing_code||""} onChange={e=>set("routing_code",e.target.value)} placeholder="Optional"/>
 <label>SWIFT / BIC (international transfers)</label><input className="textInput" value={d.swift_bic||""} onChange={e=>set("swift_bic",e.target.value)} placeholder="Optional"/>
 <label>IBAN (if your bank uses one)</label><input className="textInput" value={d.iban||""} onChange={e=>set("iban",e.target.value)} placeholder="Optional"/>
 </>:<>
 <label>Mobile money provider</label><input className="textInput" value={d.mobile_money_provider||""} onChange={e=>set("mobile_money_provider",e.target.value)} placeholder="Provider name"/>
 <label>Mobile money number</label><input className="textInput" value={d.mobile_number||""} onChange={e=>set("mobile_number",e.target.value)} placeholder="Include country code"/>
 </>}
 <div className="infoBox"><b>Privacy and payment handling</b><p>Your payout destination is private and is not displayed publicly. AdBridge administrators can access it only to process and verify withdrawals. Saving details does not itself initiate a transfer.</p></div>
 {error&&<div className="successBox">{error}</div>}{message&&<div className="successBox">✓ {message}</div>}
 <button className="primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save payout details →"}</button>
 </>}
 </div></main>
}
