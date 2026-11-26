"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
export default function NotificationBell(){
 const[count,setCount]=useState(0);
 useEffect(()=>{const client=supabase;if(!client)return;let channel:any;let disposed=false;async function load(){const{data:{user}}=await client.auth.getUser();if(!user||disposed)return;const{count:unread,error}=await client.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("is_read",false);if(!error&&!disposed)setCount(Number(unread||0));if(!channel&&!disposed)channel=client.channel("notification-bell-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq."+user.id},()=>void load()).subscribe()}
 void load();window.addEventListener("focus",load);return()=>{disposed=true;window.removeEventListener("focus",load);if(channel)client.removeChannel(channel)}},[]);
 return <Link href="/notifications" className="secondary" aria-label={count?count+" unread notifications":"Notifications"} style={{display:"inline-flex",alignItems:"center",gap:6,position:"relative"}}><span aria-hidden="true">🔔</span><span>Notifications</span>{count>0&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:20,height:20,padding:"0 5px",borderRadius:999,background:"#b42318",color:"#fff",fontSize:12,fontWeight:700}}>{count>99?"99+":count}</span>}</Link>
}
