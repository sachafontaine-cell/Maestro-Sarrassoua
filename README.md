# Hablemos

Voice-first Spanish conversation practice for the phone (Pixel, Chrome). Installable, opens offline, 15–20 minutes a day.
Same family as Chef Luc, Travel Sidekick and the Control Center: navy and gold, the fleur-de-lis.

- **Open it:** https://sachafontaine-cell.github.io/Maestro-Sarrassoua/ then Chrome ⋮ → *Install app* (or *Add to Home screen*).
- **Update:** Settings → the version at the bottom checks right away. The app also checks when opened and every 30 minutes, and updates when you leave it (never mid-session).

No personal data or keys live in this public repository. Everything stays on your phone (IndexedDB), with a JSON backup you control.

## One-time setup

### 1. Publish the app (2 min, on github.com)
1. Repository **Settings → General → Danger zone → Change visibility → Public** (free GitHub Pages needs a public repository).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → Deploy web app → Run workflow** (or push any commit). Every push to the default branch tests, builds and publishes.

### 2. Claude API key (2 min, on the phone)
1. Open https://console.anthropic.com/settings/keys → **Create Key** → copy it. (Add a few dollars of credit under *Billing* if the account is new.)
2. In Hablemos: **Home → Add your Claude API key** (it opens Settings → Claude API key) → **Paste key**. It is checked without spending anything.

The key stays on this phone only (IndexedDB). It is sent only to `api.anthropic.com`, never logged, and never written into a backup.

### 3. Install on the Pixel (1 min)
1. Open the link above in **Chrome** → ⋮ → **Install app**. On a work-managed phone this is a web app, not an APK, so it is allowed.
2. Open Hablemos from the home screen and start a session. The first time you tap the mic, Chrome asks for the **microphone**: **Allow**.
   - Said no by mistake? Installed app: long-press the Hablemos icon → **App info → Permissions → Microphone → Allow**. In Chrome: the icon left of the address → **Permissions → Microphone**.
   - If your work profile blocks the microphone for websites, you can still type your answers (keyboard button).
3. Better voices: Android **Settings → System → Languages → Text-to-speech → Google → Install voice data → Spanish (and English)**. Then Settings → Accents in Hablemos picks the best one by itself.

## What's in version 1.0
- **Home**: one big *Start today's session* button, today's scenario (picked for your weakest areas), the streak. *Start hands-free* is right under it.
- **Session** (about 16 min):
  1. **Spaced review (2 min)**: "How do you say…?" spoken; you answer out loud; graded on the phone. Items come back after 1 day, 3 days, 1 week, 2 weeks, 1 month; a miss starts over.
  2. **Role-play (12–15 min)** with Rosa (your housekeeper, Mexico City, usted and polite imperatives) or Catalina (your educated Colombian friend, usted, refined expressions, no street slang). Short tutor turns so you speak at least half the time, slightly above your level, slower when you struggle. Small slips are recast; repeated or important mistakes ask you to fix it yourself first ("¿Cómo se dice…?"). Big mistakes show as a written card with a one-line why (hands-free: saved for the recap). French interference is flagged on its own.
  3. **Recap (1 min)**: your top 3 fixes, written and read aloud, added to the review.
- **Tap-to-talk**: tap the gold mic, speak (pauses are fine), tap again to send. Tap it while the tutor talks to interrupt. Tap a tutor bubble to hear it again.
- **Hands-free** (driving, walking the dog): three big buttons (Pause, Repeat, End), nothing to read, everything spoken, it listens by itself after the tutor. The screen stays on.
- **Voice commands** (any time): **"repite"**, **"más despacio"** (and "más rápido"), **"en inglés"**, **"terminar"**.
- **Progress**: level (and the 5-minute placement test, retake any time), Stage 1 / Stage 2, mistakes by type (verb forms, vocabulary, gender, French interference, listening), words learned, session history.
- **Stage 2 unlocks by itself** at A2, after 8 finished Stage 1 sessions with few big mistakes lately. You can switch stage any time.
- **Settings**: API key, voice speed and test, hands-free default, mic test, accents (Catalina's region: Bogotá, Medellín, Cali, Barranquilla, Bucaramanga) and voices, backup (export/import JSON), cost this session / month.

## Where to change what (one place each)
| Thing | Change it in |
|---|---|
| Claude API key | Settings → Claude API key (Home's button leads there) |
| Speaking speed | Settings → Voice ("más despacio" / "más rápido" change the same setting) |
| Hands-free by default | Settings → Voice (the session's car button switches only the current session) |
| Voices, Catalina's region | Settings → Accents |
| Stage 1 / Stage 2, placement test | Progress → Level and Stage (Home's unlock banner leads there) |
| Today's scenario | Home → Change |
| Backup | Settings → Backup |

## Cost
Claude Sonnet 5.5 (`claude-sonnet-5-5`): $2 per million input tokens, $10 output, **$0.10 cached**. The tutor's instructions and the conversation so far are cached (prompt caching), so each turn pays full price only for what's new. Expect roughly **$0.05–0.15 per session, about $2–4 a month** for daily practice. Settings → Cost shows the running estimate (this session, this month); the real bill is in the Claude Console.

## Choices made (and how to undo them)
| Choice | Why | To change it |
|---|---|---|
| Claude Sonnet 5.5, not Gemini | Better tutoring and corrections; prompt caching keeps it cheap | `src/lib/claude.ts` is the only file that talks to the AI; model id in `src/lib/cost.ts` |
| Light thinking (`effort: low`) on chat turns, `medium` for grading the placement test | Quick replies matter when talking | `effort` in `src/lib/claude.ts` / `placement.ts` |
| Refusal fallback on (`fallbacks: "default"`) | If Claude ever declines a turn, the API retries it on another model by itself | Remove in `src/lib/claude.ts`. If the API rejects this request shape, the app switches to a plain request by itself |
| Rosa (Mexico City), Catalina (Bogotá by default) | Personas for the two stages | `src/lib/prompts.ts`, `src/lib/curriculum.ts` |
| Stage 2 rule: A2 + 8 sessions + ≤0.35 big mistakes per turn | "When the app judges I'm ready" | `UNLOCK` in `src/lib/plan.ts` |
| Starting level A1+, first review items from your placement weak spots | From your placement test | `defaultProfile` in `src/lib/model.ts`, `SEEDS` in `src/lib/srs.ts` |
| Answers graded on the phone (fuzzy match), not by the AI | Instant and free | `src/lib/grade.ts` |
| Review ~2 min, role-play wraps up at 12 min, ends by 15.5 min | Your 15–20 min a day | `REVIEW_MS`, `WRAP_MS`, `END_MS` in `src/lib/session.ts` |
| Each choice lives in one place (this table) | So any one can be walked back alone | Edit that one place; later changes come as one commit each (`git revert <commit>`) |

## How it stays fast
The first screen needs no network: everything is read from the phone at start. The Claude library loads in the background after the first screen. The tutor's answer streams in, and each sentence is spoken as soon as it arrives. Review grading, voice commands, scheduling and today's pick are plain code (milliseconds).

## Develop
`npm install`, `npm run dev`, `npm test` (reply streaming, voice commands, grading, review intervals, cost, level/streak/unlock, voices, backup), `npm run e2e` (builds, then an emulated Pixel 7 in Chromium with a fake microphone, voice and Claude: first run, a whole tap-to-talk session with voice commands, hands-free, blocked microphone, wrong key, placement test, backup, Stage 2 phone call, offline start, dark mode). Icon: `npm run icons` (design in `scripts/icon-designs.mjs`).

Files: `src/lib/session.ts` (the session), `claude.ts` (the AI), `prompts.ts` (what the tutor is told), `reply.ts` (reads the streamed answer), `speech.ts` (mic and voice), `srs.ts` (review), `plan.ts` (today's pick, level, unlock), `data.ts`/`db.ts` (IndexedDB); screens in `src/screens/`.

**Tested here:** all of the above in an emulated Pixel 7. **Not testable here:** the real microphone, Google's speech recognition and your phone's voices. The first session on the phone is the real check (5-minute checklist: allow the mic, tap-to-talk one turn, say "repite", switch to hands-free with the car button, say "terminar").
