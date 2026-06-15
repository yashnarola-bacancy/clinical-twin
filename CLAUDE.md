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

## Domain rules
- Synthetic data ONLY. Never suggest using real patient data.
- Audio is deleted after transcription (set Transcript.audioDeleted = true).
- A note must be SIGNED before encounter metadata feeds the simulation or EHR sync.
- ICD-10/CPT suggestions always carry a confidence score; clinician can reject each.

## Style
- Zod schemas for every external boundary (API input, Claude output, form data).
- Small components; colocate per feature in src/components/{encounters,twin,ui}.
- After non-trivial changes, run `npx tsc --noEmit` before considering the task done.
- Do not add new dependencies without asking.