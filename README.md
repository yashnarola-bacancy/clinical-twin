# Clinical Twin

AI-assisted clinical documentation **plus** an operational digital twin of patient flow — in one app.

> ⚠️ **This is a demo, not production healthcare software.** All patients, MRNs, and
> clinical content are **synthetic and clearly fictional**. Do not use with real patient
> data. See [Production roadmap / what's mocked in this demo](#production-roadmap--whats-mocked-in-this-demo).

---

## What it is

Clinical Twin shows two ideas working off the same data:

1. **Ambient documentation** — a clinician records a visit; the app transcribes the audio,
   drafts a structured SOAP note with suggested ICD-10/CPT codes, lets the clinician edit
   and sign off, and syncs the signed note to a (mock) EHR as a FHIR bundle.
2. **An operational digital twin** — the encounter metadata produced above (exam durations,
   admission rates) calibrates a discrete-event simulation of patient flow, so an operations
   director can test staffing "what-ifs" before committing real resources.

The point of pairing them: the documentation module isn't just paperwork — it produces the
real-world signal that makes the operational model trustworthy.

---

## The two modules

### Module A — AI clinical documentation

```
browser audio ─▶ Whisper transcription ─▶ Claude SOAP note + ICD-10/CPT codes
            ─▶ clinician review & sign-off ─▶ FHIR sync to (mock) EHR ─▶ Postgres
```

- Records audio in the browser (`MediaRecorder`) and posts it to `/api/transcribe`.
- Transcribes with OpenAI **Whisper** (`whisper-1`).
- Generates a structured note with **Claude** (`claude-sonnet-4-6`): Subjective / Objective /
  Assessment / Plan, a predicted disposition, ordered labs/imaging, and ICD-10/CPT codes.
  Every code carries a **confidence score** and is a *suggestion* — the clinician can reject
  any of them.
- The model output is validated against a **Zod schema** before it touches the database
  (with one corrective retry if Claude returns non-JSON).
- The clinician reviews, edits (edits are tracked per field), and **signs off**. Nothing is
  committed to the EHR without an explicit sign-off.
- On sign-off the note can be **synced to a mock EHR** as a FHIR transaction Bundle; the
  round-trip latency is recorded.

### Module B — Operational digital twin

```
signed encounters ─▶ calibration (exam durations, admit rate)
                 ─▶ discrete-event simulation ─▶ wait times, utilization, throughput
                 ─▶ what-if controls (staffing & demand)
```

- A **pure** discrete-event engine (`src/lib/simulation/engine.ts`): `(config, patients) → metrics`.
  No DB, no fetch, no clock inside it — deterministic and rerunnable from the UI.
- Calibrated from **signed** encounters (real exam durations and admission rates), so the
  model reflects the documented reality rather than guesses.
- What-if controls let you change ED/outpatient nurses, doctors, beds, and arrival rate, then
  compare a scenario against the baseline. The **"move 3 nurses: outpatient → ED"** preset
  demonstrates relieving the constrained service line to cut wait times.

---

## Tech stack

| Area        | Choice |
|-------------|--------|
| Framework   | Next.js 16 (App Router, React 19), TypeScript (strict) |
| Styling     | Tailwind CSS v4 |
| Database    | PostgreSQL (Neon) via Prisma ORM |
| AI          | Anthropic SDK (`claude-sonnet-4-6`) · OpenAI SDK (`whisper-1`) |
| Validation  | Zod (every external boundary) |
| Charts/UI   | Recharts · lucide-react · date-fns |
| Tooling     | `tsx` (seed), ESLint, Playwright |

---

## Running it locally

### Prerequisites
- Node.js 20+
- A PostgreSQL database (the demo uses Neon)

### 1. Install

```bash
npm install
```

### 2. Environment variables

Create a `.env` in the project root:

```bash
# Database (required) — PostgreSQL connection string
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Mock mode (recommended for local dev) — see below
MOCK_AI=true

# AI providers (only needed when MOCK_AI is NOT "true")
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."

# App — Auth.js session secret (generate with: openssl rand -base64 32)
AUTH_SECRET="..."
```

### 3. Mock mode (no API keys required)

Set `MOCK_AI=true` to run the **entire UI flow without any AI keys**:

- `transcribeAudio()` returns a canned clinician–patient transcript after ~800 ms.
- `generateNote()` returns a hardcoded sinusitis SOAP note (2 ICD-10 + 1 CPT code) after ~1 s.

This is the recommended way to develop and to demo when you don't want live API calls. Set
`MOCK_AI=false` (or remove it) and provide `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` to use the
real models.

### 4. Database: migrate & seed

```bash
npx prisma migrate dev      # apply schema / create tables
npx prisma db seed          # clear + load fresh synthetic data
```

The seed **clears all data and reseeds** (idempotent, FK-safe), producing 3 login users (one
per role), ~30 patients, and ~60 encounters across 14 days — including a few hand-written,
fully-signed "showcase" encounters so the KPIs and twin have data immediately. You can also
re-seed from inside the app at **`/settings`** (CMIO only).

The three seeded users all share the password **`password123`**:

| Email | Role |
|---|---|
| `sarah.chen@clinicaltwin.dev` | Clinician |
| `marcus.williams@clinicaltwin.dev` | Operations Director |
| `priya.patel@clinicaltwin.dev` | CMIO |

### 5. Dev server

```bash
npm run dev                 # http://localhost:3000
```

The app requires login — the first load redirects to **`/login`**. Sign in with a seeded
account above, or create a new one at **`/signup`**.

### Other commands

```bash
npm run build               # production build
npm run start               # serve the production build
npm run lint                # ESLint
npx tsc --noEmit            # typecheck
npx prisma studio           # browse the database
```

---

## Architecture overview

```
auth.ts                     # Auth.js full config (Node): Prisma adapter + Credentials provider
auth.config.ts              # edge-safe Auth.js config (shared by auth.ts + middleware)
src/
├─ middleware.ts            # route protection: public /login /signup, else require session; role gates
├─ app/
│  ├─ (auth)/                # unauthenticated pages (no app chrome): login, signup
│  ├─ (app)/                 # product shell (sidebar + header + user menu) — requires a session
│  │  ├─ page.tsx            # "/"            KPI dashboard (Quality & compliance — CMIO)
│  │  ├─ record/             # "/record"      capture a visit (Clinician)
│  │  ├─ encounters/         # "/encounters"  list + [id] detail / review / sign-off / sync
│  │  ├─ twin/               # "/twin"        operational digital twin (Ops Director + CMIO)
│  │  ├─ settings/           # "/settings"    admin: reset & re-seed demo data (CMIO only)
│  │  ├─ loading.tsx · error.tsx · not-found.tsx   # app-wide state fallbacks
│  │  └─ layout.tsx
│  ├─ not-authorized/        # "/not-authorized"  shown when a logged-in user lacks the role
│  ├─ demo-guide/            # "/demo-guide"  INTERNAL presenter walkthrough (not in product nav)
│  └─ api/                   # auth/[...nextauth] · auth/signup · transcribe · generate-note · sign-off · ehr-sync · simulate
├─ components/               # colocated per feature: dashboard / encounters / twin / ui (incl. user-menu)
├─ types/                    # next-auth.d.ts — session/JWT carry user.id + user.role
└─ lib/
   ├─ db.ts                  # Prisma singleton — all DB access goes through here
   ├─ ai/                    # claude.ts · transcribe.ts · soap-prompt.ts (Zod schema + prompt)
   ├─ fhir/bundle.ts         # builds the FHIR transaction Bundle for EHR sync
   ├─ simulation/            # engine.ts (pure) · generatePatients.ts · types.ts · engine.test.ts
   ├─ personas.ts            # role → landing page + nav emphasis
   └─ seed.ts                # shared synthetic-data seeder (used by CLI + /settings)
```

**Conventions**

- **Server components by default**; `"use client"` only for interactivity (recorder, sliders, charts).
- API routes return typed JSON: `{ ok: true, data } | { ok: false, error }`.
- All DB access goes through the **`src/lib/db.ts`** Prisma singleton — never instantiate `PrismaClient` elsewhere.
- AI calls live in **`src/lib/ai/`**; Claude output is **Zod-validated** before persistence.
- The simulation engine is a **pure function** — testable and rerunnable from UI sliders, with
  no DB/fetch/clock inside it.

**Authentication & roles** — real auth via **Auth.js (NextAuth v5)**: a Credentials provider
(email + password, bcrypt-hashed) backed by the Prisma adapter, with a JWT session that
carries `user.id` and `user.role`. The current user comes from `auth()` (never a cookie);
`src/middleware.ts` enforces route protection (public `/login` + `/signup`, everything else
requires a session) and role gating (`/twin` → Ops Director + CMIO, `/settings` → CMIO).
Each of the three personas (Clinician, Operations Director, CMIO) lands on its primary
surface with the relevant nav emphasized, driven by `session.user.role`.

**Key domain rules (enforced in the demo)**

- Synthetic data only.
- Audio is deleted after transcription (`Transcript.audioDeleted = true`).
- A note must be **SIGNED** before it can sync to the EHR or feed the simulation.
- Every ICD-10/CPT suggestion carries a confidence score and can be rejected by the clinician.

---

## Production roadmap / what's mocked in this demo

This is a **demo built to show the product vision end-to-end**. The flows are real and the
data model is real, but several pieces are intentionally simulated or stubbed so the whole
thing runs on a laptop. Here's an honest accounting of what would change for production:

| Area | In this demo | For production |
|------|--------------|----------------|
| **Whisper / Claude calls** | Stubbed behind `MOCK_AI=true` (canned transcript + note). | Flip `MOCK_AI=false` and supply API keys — the real Whisper + Claude code paths already exist (`src/lib/ai/`). Production also needs prompt hardening, output guardrails, model/version pinning, cost controls, retries/timeouts, and a BAA with the model providers. |
| **EHR integration (FHIR)** | A FHIR transaction Bundle is constructed and written to an `EhrSyncLog` with a measured/simulated latency. **No external EHR is contacted.** | Real **Epic / Cerner (Oracle Health) integration** via their FHIR APIs and write-back workflows. This requires a **vendor partnership / app-orchestration agreement**, SMART-on-FHIR launch & OAuth2, sandbox certification, and per-site configuration. |
| **HIPAA compliance & audit logging** | No PHI (synthetic data only) and no audit trail. Access control is basic: real login (Auth.js) with middleware route + role gating, but no immutable audit logging. | Full HIPAA program: encryption in transit and at rest, signed **BAAs** with every subprocessor, immutable **audit logging** of every read/write/sign-off/sync, data retention & breach policies, and likely SOC 2. |
| **Speaker diarization / capture hardware** | Single-channel browser `MediaRecorder`; the transcript is not reliably attributed by speaker. | Clinical-grade **ambient capture hardware** and/or diarization models to separate clinician vs. patient, handle multi-party rooms, noise, and overlapping speech, with consent capture. |
| **Security hardening** | Real login (Auth.js credentials) with JWT sessions and middleware route/role gating, but otherwise demo-grade: no SSO, no rate limiting, no secret rotation, no input fuzzing/abuse protection. | Enterprise **authentication & authorization** (SSO/SAML/OIDC, full RBAC), session management, rate limiting, secrets management, dependency/SAST/DAST scanning, pen testing, and infrastructure hardening. |

**Also out of scope for the demo:** multi-tenant org/clinic separation, billing/coding
compliance review, clinical safety validation and regulatory clearance, real-time EHR
patient context, and production observability (metrics, tracing, alerting).

The takeaway: the **product surface and data flow are real**; the **external integrations,
compliance, and security layers are deliberately stubbed** and are the substance of a
production build.

---

_Synthetic data only · demo environment · not for clinical use._
