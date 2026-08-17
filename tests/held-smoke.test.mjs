import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, worker] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
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
