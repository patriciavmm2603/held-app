import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, worker, conversationSql, pushFunction] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/conversation-hardening.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/send-prayer-push/index.ts", import.meta.url), "utf8"),
]);

test("Held build and service-worker cache versions match", () => {
  const htmlVersion = html.match(/held_cache_reset_\d+_v(\d+)/)?.[1];
  const workerVersion = worker.match(/CACHE_NAME="held-v(\d+)"/)?.[1];
  assert.ok(htmlVersion, "index.html must expose a Held build version");
  assert.ok(workerVersion, "service-worker.js must expose a cache version");
  assert.equal(htmlVersion, workerVersion);
});

test("Conversation mode uses mutual reveal wording", () => {
  assert.match(html, />Submit my answer<\/button>/);
  assert.doesNotMatch(html, /Reveal my answer/);
  assert.match(html, /Private until both respond/);
  assert.match(html, /Respond to reveal both answers/);
  assert.match(html, /Waiting for \$\{spouseName\(\)\} to respond/);
});

test("Conversation submission prevents double taps", () => {
  assert.match(html, /let conversationSubmitPending=false/);
  assert.match(html, /if\(conversationSubmitPending\)return/);
  assert.match(html, /button\.disabled=true/);
  assert.match(html, /error\?\.code==="23505"/);
});

test("Sender never sees their own conversation invitation", () => {
  assert.match(
    html,
    /item\.kind==="conversation_invite"&&item\.user_id===currentUser\?\.id/
  );
});

test("Conversation notification invokes the round-aware backend", () => {
  assert.match(html, /conversation_round_id:roundId/);
  assert.match(html, /notification could not be sent/);
});

test("Push notifications open the Together area", () => {
  assert.match(worker, /\.\/#together/);
  assert.match(worker, /notificationclick/);
});


test("Conversation privacy is enforced in Postgres", () => {
  assert.match(conversationSql, /enforce_conversation_moment_integrity/);
  assert.match(conversationSql, /Conversation answers must begin private/);
  assert.match(conversationSql, /Revealed conversation answers cannot be edited/);
  assert.match(conversationSql, /process_conversation_response/);
  assert.match(conversationSql, /current_user <> 'service_role'/);
  assert.match(conversationSql, /revoke all on function public\.process_conversation_response/);
  assert.match(conversationSql, /pg_advisory_xact_lock/);
  assert.match(conversationSql, /create policy couple_moments_insert/);
  assert.match(conversationSql, /kind<>'conversation_invite'/);
  assert.match(conversationSql, /not \(kind='conversation_answer' and is_shared\)/);
});

test("Conversation reveal is atomic and couple-scoped", () => {
  assert.match(pushFunction, /rpc\("process_conversation_response"/);
  assert.match(pushFunction, /notificationUrl="\/#together\/conversation"/);
  assert.doesNotMatch(pushFunction, /\.update\(\{is_shared:true/);
});

test("Revealed answers lock and notifications open Conversation Mode", () => {
  assert.match(html, /existing\?\.is_shared/);
  assert.match(html, /can no longer be edited/);
  assert.match(html, /id="conversationModeCard"/);
  assert.match(html, /hash==="#together\/conversation"/);
  assert.match(html, /target\.open=true/);
  assert.match(html, /data\?\.sent>0/);
});
