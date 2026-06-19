# Clinical Twin — AI clinical documentation + digital twin demo

## What this is
Solo-dev demo (NOT production healthcare software). Two modules:
- Module A: browser audio → Whisper transcription → Claude generates SOAP note + ICD-10/CPT codes → clinician review/sign-off → Postgres
- Module B: discrete-event simulation of patient flow fed by encounter metadata, with what-if controls

## Stack & commands
- Next.js 15 App Router, TypeScript strict, Tailwind, Prisma + Postgres (Neon)
- Dev: `npm run dev` · Typecheck: `npx tsc --noEmit` · Lint: `npm run lint`
- DB: `npx prisma migrate dev`, `npx prisma studio`, seed with `npx prisma db seed`

## Architecture rules
- All DB access through `src/lib/db.ts` Prisma singleton. Never instantiate PrismaClient elsewhere.
- AI calls live in `src/lib/ai/`. The SOAP prompt is in `src/lib/ai/soap-prompt.ts` — treat it as critical code.
- Claude API responses for notes MUST be strict JSON validated with Zod before touching the DB.
- Simulation engine (`src/lib/simulation/engine.ts`) is a PURE function: (events, config) → metrics. No DB, no fetch, no Date.now() inside it — testable and rerunnable from UI sliders.
- API routes return typed JSON: { ok: true, data } | { ok: false, error }.
- Server components by default; "use client" only for interactivity (recorder, sliders, charts).

## Authentication
Real auth via Auth.js (NextAuth v5) — there is NO role switcher / cookie-based "active user"; do not reintroduce one.
- Credentials provider (email + password, hashed with bcrypt) backed by the Prisma adapter; users/accounts/sessions live in Postgres.
- JWT session strategy. The session carries `user.id` and `user.role` (callbacks in `auth.config.ts`, types in `src/types/next-auth.d.ts`).
- Split config: `auth.config.ts` is edge-safe (no adapter/bcrypt) and shared by `auth.ts` (full Node config: Prisma adapter + Credentials) and `src/middleware.ts`.
- The current user comes from `auth()` in server components/route handlers — never from a cookie.
- Route protection lives in `src/middleware.ts`: `/login` + `/signup` are public; everything else requires a session and redirects to `/login`. `/twin` is OPS_DIRECTOR + CMIO, `/settings` (seed-reset) is CMIO only — a logged-in user lacking the role is rewritten to `/not-authorized` (not bounced to login).
- Data-mutating API routes (generate-note, sign-off, ehr-sync, simulate) reject unauthenticated requests with 401 and take the acting user from the session.
- Persona UI (Clinician vs Ops Director vs CMIO) is driven by `session.user.role`.
- Auth pages are in `src/app/(auth)/` (login, signup); signup posts to `POST /api/auth/signup`. Seeded demo users share the password `password123` (see `src/lib/seed.ts`).
- `AUTH_SECRET` must be set in `.env` (generate with `openssl rand -base64 32`).

## Domain rules
- Synthetic data ONLY. Never suggest using real patient data.
- Audio is deleted after transcription (set Transcript.audioDeleted = true).
- A note must be SIGNED before encounter metadata feeds the simulation or EHR sync.
- ICD-10/CPT suggestions always carry a confidence score; clinician can reject each.

## Local development without API keys

Set `MOCK_AI=true` in `.env` to bypass all external AI calls:
- `generateNote()` returns a hardcoded sinusitis SOAP note (2 ICD-10 + 1 CPT code) after a 1-second simulated delay.
- `transcribeAudio()` returns a canned clinician-patient transcript after ~800 ms.

This lets the full UI flow run locally without `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Remove or set `MOCK_AI=false` when you're ready to use real API keys.

## Style
- Zod schemas for every external boundary (API input, Claude output, form data).
- Small components; colocate per feature in src/components/{encounters,twin,ui}.
- After non-trivial changes, run `npx tsc --noEmit` before considering the task done.
- Do not add new dependencies without asking.