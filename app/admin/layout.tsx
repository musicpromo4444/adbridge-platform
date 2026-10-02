"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) { router.replace("/login?next=" + encodeURIComponent(pathname)); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login?next=" + encodeURIComponent(pathname)); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || profile.role !== "admin") { router.replace("/"); return; }
      if (active) setChecking(false);
    })();
    return () => { active = false; };
  }, [pathname, router]);

  if (checking) return <main className="formPage"><div className="formCard"><div className="successBox">Checking admin access…</div></div></main>;
  return <>{children}</>;
}
