# Held change-safety rules

Before publishing any change to Held:

1. Run `node --test tests/held-smoke.test.mjs`.
2. Confirm the build number in `index.html` matches the cache number in `service-worker.js`.
3. For every spouse-facing feature, verify both perspectives separately:
   - Patricia as sender and recipient.
   - Alec as sender and recipient.
4. Never display private conversation-answer text until two distinct users have answered the same round.
5. A conversation invitation must be visible only to the spouse who still needs to answer.
6. Disable submit buttons while requests are in flight and handle duplicate database writes safely.
7. Verify every notification has the intended recipient, neutral private wording, and a working deep link.
8. Do not report a push as delivered unless the backend response succeeds and at least one recipient subscription was targeted.
9. After changing `index.html`, bump both the Held build version and service-worker cache version.
10. Do not promote a deployment until the Held QA workflow passes.
