import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const creator=read("../app/creator/verification/page.tsx");
const admin=read("../app/admin/verification/page.tsx");
const secureSubmit=read("../supabase/migrations/20261127191000_lock_creator_submission_writes_and_secure_verification.sql");

test("creator verification submissions use a server-validated owner-bound RPC",()=>{
  assert.match(creator,/rpc\("submit_creator_verification"/);
  assert.doesNotMatch(creator,/from\("creator_verification_submissions"\)\.insert/);
  assert.match(secureSubmit,/new.status/);
  assert.match(secureSubmit,/https:\/\//);
  assert.match(secureSubmit,/revoke insert,update,delete on public\.creator_verification_submissions/);
});

test("admin review uses the admin-only verification RPC and records the review decision",()=>{
  assert.match(admin,/rpc\("admin_review_creator_verification"/);
  assert.match(admin,/status/);
  assert.match(admin,/review_note/);
});
