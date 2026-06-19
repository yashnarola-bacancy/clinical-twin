# Handover — Clinical Twin

This document is for the team taking over the project. It covers what you need to
run it, what it is (and isn't), and the few things worth knowing before a demo.

> For full developer/architecture detail, see [`README.md`](./README.md). This page
> is the short, management-facing version.

---

## What this is

**Clinical Twin** is a demo of two ideas working off the same data:

1. **AI clinical documentation** — record a visit → transcribe → draft a structured
   SOAP note with suggested ICD-10/CPT codes → clinician reviews & signs → (mock) EHR sync.
2. **Operational digital twin** — signed encounters calibrate a patient-flow simulation
   so an operations team can test staffing "what-ifs."

> ⚠️ **This is a demo, not production healthcare software.** All patients and clinical
> content are synthetic. See the "Production roadmap / what's mocked" table in `README.md`
> for an honest accounting of what's stubbed (EHR/FHIR, HIPAA/audit). Authentication is
> real — login/signup via Auth.js (NextAuth v5) with credentials stored in Postgres.

---

## What you need

- **Node.js 20+**
- A **PostgreSQL database** (the demo uses [Neon](https://neon.tech) — free tier is fine).
  You will need your **own** connection string; the original developer's database is private.
- **No AI API keys required** to run the demo — see Mock Mode below.

---

## Setup (first run)

```powershell
cd clinical-twin

# 1. Create your environment file from the template
Copy-Item .env.example .env
#    Then edit .env and set:
#      DATABASE_URL  -> your PostgreSQL connection string
#      AUTH_SECRET   -> a random string (generate with: openssl rand -base64 32)
#    Leave MOCK_AI="true" to run without any AI keys.

# 2. Install dependencies
npm install

# 3. Create the database tables, then load demo data
npx prisma migrate dev      # creates all tables from the schema
npx prisma db seed          # clears & loads fresh synthetic data

# 4. Run it
npm run dev                 # http://localhost:3000
```

> On macOS/Linux use `cp .env.example .env` instead of `Copy-Item`.

> The app requires login: the first load redirects to **`/login`**. Sign in with a seeded
> demo account (all share the password `password123`) or create a new one at **`/signup`**.

---

## Environment variables (`.env`)

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (Neon or any PG 14+). |
| `MOCK_AI` | Recommended | `"true"` = no AI keys needed (canned responses). `"false"` = use real Whisper + Claude. |
| `ANTHROPIC_API_KEY` | Only if `MOCK_AI="false"` | For live SOAP-note generation (Claude). |
| `OPENAI_API_KEY` | Only if `MOCK_AI="false"` | For live transcription (Whisper). |
| `AUTH_SECRET` | **Yes** | Auth.js session secret. Generate with `openssl rand -base64 32`. |

---

## Mock mode (no API keys)

With `MOCK_AI="true"` the **entire UI flow runs without any AI keys**:

- Transcription returns a canned clinician–patient transcript after ~800 ms.
- Note generation returns a hardcoded SOAP note (2 ICD-10 + 1 CPT code) after ~1 s.

This is the recommended way to develop and to demo. Set `MOCK_AI="false"` and supply the
two API keys to exercise the real models.

---

## Re-seeding the demo data

The seed is **idempotent** — it wipes and reloads ~30 patients, ~60 encounters over 14
days, 3 login users (one per role), plus signed "showcase" encounters so the dashboard and
twin have data immediately.

The three seeded users all share the password **`password123`**:

| Email | Role |
|---|---|
| `sarah.chen@clinicaltwin.dev` | Clinician |
| `marcus.williams@clinicaltwin.dev` | Operations Director |
| `priya.patel@clinicaltwin.dev` | CMIO |

- From the command line: `npx prisma db seed` (prints the login emails + password at the end)
- From inside the app: open **`/settings`** and use the reset & re-seed control (CMIO only).

---

## Command reference

| Purpose | Command |
|---|---|
| Install dependencies | `npm install` |
| Create / migrate DB tables | `npx prisma migrate dev` |
| Seed demo data (clear + load) | `npx prisma db seed` |
| Run dev server (localhost:3000) | `npm run dev` |
| Production build | `npm run build` |
| Serve production build | `npm run start` |
| Browse the database | `npx prisma studio` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |

---

## Good to know for a demo

- **Real authentication** (Auth.js / NextAuth v5). You log in as one of the three seeded
  users; the **role comes from the account**, and you sign out from the header. To switch
  personas (Clinician, Operations Director, CMIO), sign out and sign back in as that user.
- **Role-based access** is enforced by middleware: `/twin` is Operations Director + CMIO,
  and `/settings` (re-seed) is CMIO only — other logged-in users see a "not authorized" page.
- There's an internal **presenter walkthrough at `/demo-guide`** (not shown in the product
  nav) that's handy for running a demo.
- A note must be **signed** before it can sync to the EHR or feed the simulation.
- Everything is synthetic data — safe to click through freely and re-seed anytime.

---

_Synthetic data only · demo environment · not for clinical use._
