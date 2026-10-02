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

test("Sender and completed rounds never show a conversation invitation", () => {
  assert.match(
    html,
    /item\.kind==="conversation_invite"&&\(item\.user_id===currentUser\?\.id\|\|item\.details\?\.unlocked\)/
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

test("Revealed conversations keep the question and both answers together", () => {
  assert.match(html, /Conversation revealed/);
  assert.match(html, /const prompt=item\.details\?\.prompt/);
  assert.match(html, />You said<\/b>/);
  assert.match(html, /escapeHtml\(spouseName\(\)\).* said/);
  assert.match(html, /renderedConversationRounds/);
});

test("Held visual polish keeps mobile and conversation hierarchy", () => {
  assert.match(html, /Held visual polish v36/);
  assert.match(html, /\.conversation-reveal/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /details\.connection-card/);
});

test("Phone layout cannot reserve the hidden desktop sidebar column", () => {
  assert.match(html, /@media\(max-width:900px\)[\s\S]*?\.layout\{display:block;width:100%;grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(html, /\.layout>main,\.view,\.hero\{width:100%;max-width:none;min-width:0\}/);
  assert.match(html, /\.signout-btn\{white-space:nowrap/);
});


test("Completed conversations automatically advance to a fresh private round", () => {
  assert.match(html, /const HELD_CONVERSATION_PROMPTS=\[/);
  assert.match(html, /function heldConversationWeekId\(\)/);
  assert.match(html, /function heldConversationRoundNumber\(/);
  assert.match(html, /function heldConversationRoundId\(\)/);
  assert.match(html, /const pending=weekly\.find/);
  assert.match(html, /latest===0\?weekId:/);
  assert.match(html, /heldConversationPrompt\(roundId\)/);
  assert.match(html, /prompt\.textContent=heldConversationPrompt\(roundId\)/);
  assert.match(html, /field\.disabled=false/);
  assert.doesNotMatch(html, /field\.disabled=bothRevealed/);
});

test("Conversation round suffixes are recognized as numbers", () => {
  assert.match(html, /\^\\d\+\$\/\.test\(suffix\)/);
});


test("Reading navigation opens the requested study step at its top", () => {
  assert.match(html, /function setDevTab\(name,scrollToTop=false\)/);
  assert.match(html, /setDevTab\(control\.dataset\.devTab,true\)/);
  assert.match(html, /getElementById\(name \+ "Tab"\)\?\.scrollIntoView/);
  assert.match(html, /data-dev-tab="understand">I finished reading · Help me understand/);
  assert.match(html, /data-dev-tab="reflect">I understand the passage · Help me respond/);
});


test("Luke 8 Understand content is passage-specific and plain", () => {
  assert.match(html, /match: p => p\.includes\("Luke 8:4–15"\)/);
  assert.match(html, /The focus is not farming technique; it is what happens after the word is heard/);
  assert.match(html, /good soil as people who hear the word, hold firmly to it/);
  assert.match(html, /const daily=j\.id==="money"\?moneyJourneyDaily\[passage\]:\(heldCuratedDaily\[j\.id\]\|\|\{\}\)\[passage\];/);
  assert.match(html, /if\(j\.id==="money"\|\|daily\)/);
  assert.match(html, /generated\.main=specific\.main\|\|generated\.main/);
});

function extractCuratedDaily(source) {
  const marker = "const heldCuratedDaily = {";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "heldCuratedDaily block must exist");
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
  }
  assert.ok(end > start, "heldCuratedDaily block must close");
  return eval("(" + source.slice(start + marker.length - 1, end) + ")");
}

test("Curated daily studies replace generated boilerplate per journey", () => {
  const curated = extractCuratedDaily(html);
  const fields = ["context","fit","main","notMean","tension","observe","movement",
                  "companions","prayer","practice","boundary"];
  const journeys = Object.keys(curated);
  assert.ok(journeys.length >= 2, "at least two journeys curated");
  for (const jid of journeys) {
    assert.ok(curated[jid], `${jid} must have curated studies`);
    const keys = Object.keys(curated[jid]);
    assert.equal(keys.length, 21, `${jid} must cover 21 days`);
    for (const k of keys) {
      const st = curated[jid][k];
      for (const f of fields) {
        assert.ok(st[f] !== undefined && st[f] !== null, `${jid} ${k} needs ${f}`);
      }
      assert.ok(Array.isArray(st.observe) && st.observe.length >= 2, `${jid} ${k} observe`);
      assert.ok(Array.isArray(st.movement) && st.movement.length >= 2, `${jid} ${k} movement`);
      assert.ok(Array.isArray(st.companions) && st.companions.length >= 3, `${jid} ${k} companions`);
    }
  }
  const flat = JSON.stringify(curated);
  assert.ok(!flat.includes("The passage calls the reader to understand"), "no generated main-point boilerplate");
  assert.ok(!flat.includes("The text offers real direction without promising"), "no generated tension boilerplate");
  assert.ok(!flat.includes("�"), "no mojibake");
});


function extractReflectionQuestions(source) {
  const marker = "const heldReflectionQuestions = {";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "heldReflectionQuestions block must exist");
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
  }
  assert.ok(end > start, "heldReflectionQuestions block must close");
  return {
    block: source.slice(start, end),
    questions: eval("(" + source.slice(start + marker.length - 1, end).replace(/;$/, "") + ") || {}") ,
  };
}

test("Reflection questions cover every journey with 21 curated days", () => {
  const { questions } = extractReflectionQuestions(html);
  const ids = ["survival","anxiety","money","control","identity","grief",
               "redeemed","leader","forgiveness","empathy","father","provision"];
  assert.deepEqual(Object.keys(questions).sort(), ids.slice().sort());
  for (const id of ids) {
    assert.equal(questions[id].length, 21, `${id} must have 21 days`);
    const p1s = new Set();
    for (let d = 0; d < 21; d++) {
      const day = questions[id][d];
      for (const k of ["p1","p2","p3"]) {
        assert.ok(day[k] && day[k].trim().length > 10, `${id} day ${d+1} ${k} must be substantive`);
      }
      p1s.add(day.p1);
    }
    assert.equal(p1s.size, 21, `${id} p1 questions must be unique per day`);
  }
});

test("Reflection questions are not templated and have no mojibake", () => {
  const { block } = extractReflectionQuestions(html);
  const banned = [
    "what are you feeling or believing about it right now",
    "Notice how Jesus responds to the question, need, fear, or conflict",
    "You could ask for help, share one responsibility, or explain what support would feel safe",
    "You could pray honestly, write the fear down",
    "You could review one number, have one honest conversation",
    "You could work, plan, pray, rest, ask for help, or talk honestly with your wife",
  ];
  for (const phrase of banned) {
    assert.ok(!block.includes(phrase), `templated phrase must be gone: ${phrase.slice(0, 40)}…`);
  }
  assert.ok(!block.includes("�"), "no mojibake replacement characters");
});
