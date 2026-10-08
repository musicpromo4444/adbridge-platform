"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Draft = {
  id: string;
  title: string | null;
  hook: string | null;
  caption: string | null;
  call_to_action: string | null;
  hashtags: string[] | null;
  platform: string | null;
};

export default function PostStudio() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [id, setId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data } = await supabase
      .from("creator_post_drafts")
      .select("*")
      .eq("creator_id", user.id)
      .order("updated_at", { ascending: false });

    const rows = (data || []) as Draft[];
    setDrafts(rows);

    if (rows[0]) {
      setId(rows[0].id);
      setDraft(rows[0]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function pick(value: string) {
    setId(value);
    setDraft(drafts.find((item) => item.id === value) || null);
    setMsg("");
  }

  async function save() {
    if (!supabase || !draft) return;

    const hashtags = Array.isArray(draft.hashtags)
      ? draft.hashtags
      : String(draft.hashtags || "")
          .split(/\s+/)
          .filter(Boolean);

    const { error } = await supabase
      .from("creator_post_drafts")
      .update({
        title: draft.title,
        hook: draft.hook,
        caption: draft.caption,
        call_to_action: draft.call_to_action,
        hashtags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    setMsg(error?.message || "Draft saved.");

    if (!error) {
      await load();
    }
  }

  return (
    <main className="formPage">
      <Link href="/creator" className="back">
        ← Creator Dashboard
      </Link>

      <div className="formCard wide">
        <span className="eyebrow">POST STUDIO</span>
        <h1>
          Finish your <em>post.</em>
        </h1>
        <p>
          Edit the AI draft, add your real media, then submit the published
          link from your campaign workspace.
        </p>

        {drafts.length > 0 ? (
          <>
            <label htmlFor="draft">Draft</label>
            <select id="draft" value={id} onChange={(e) => pick(e.target.value)}>
              {drafts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title || "Untitled"} · {item.platform || "Platform"}
                </option>
              ))}
            </select>

            {draft && (
              <>
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  className="textInput"
                  value={draft.title || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />

                <label htmlFor="hook">Hook</label>
                <textarea
                  id="hook"
                  value={draft.hook || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, hook: e.target.value })
                  }
                />

                <label htmlFor="caption">Caption</label>
                <textarea
                  id="caption"
                  value={draft.caption || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, caption: e.target.value })
                  }
                />

                <label htmlFor="cta">Call to action</label>
                <input
                  id="cta"
                  className="textInput"
                  value={draft.call_to_action || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, call_to_action: e.target.value })
                  }
                />

                <label htmlFor="hashtags">Hashtags</label>
                <input
                  id="hashtags"
                  className="textInput"
                  value={Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hashtags: e.target.value.split(/\s+/).filter(Boolean),
                    })
                  }
                />

                <button className="primary" onClick={save}>
                  Save changes
                </button>

                {msg && <div className="successBox">{msg}</div>}

                <div className="infoBox">
                  <b>Next step</b>
                  <p>
                    Publish on the selected platform, copy the public post URL,
                    then use Submit Work to send it to the advertiser.
                  </p>
                  <Link href="/creator/work">Open My Work →</Link>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="successBox">
            No drafts yet. <Link href="/creator/ai">Create one with AI →</Link>
          </div>
        )}
      </div>
    </main>
  );
}
