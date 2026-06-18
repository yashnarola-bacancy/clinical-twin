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
> for an honest accounting of what's stubbed (EHR/FHIR, HIPAA/audit, authentication).

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
#    Then edit .env and set DATABASE_URL to your PostgreSQL connection string.
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

---

## Environment variables (`.env`)

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (Neon or any PG 14+). |
| `MOCK_AI` | Recommended | `"true"` = no AI keys needed (canned responses). `"false"` = use real Whisper + Claude. |
| `ANTHROPIC_API_KEY` | Only if `MOCK_AI="false"` | For live SOAP-note generation (Claude). |
| `OPENAI_API_KEY` | Only if `MOCK_AI="false"` | For live transcription (Whisper). |
| `NEXTAUTH_SECRET` | Yes | Any random string. |

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
days, 3 users (one per role), plus signed "showcase" encounters so the dashboard and twin
have data immediately.

- From the command line: `npx prisma db seed`
- From inside the app: open **`/settings`** and use the reset & re-seed control.

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

- **Three roles** (Clinician, Operations Director, CMIO) switch via the header dropdown.
  This is a demo cookie, **not real authentication**.
- There's an internal **presenter walkthrough at `/demo-guide`** (not shown in the product
  nav) that's handy for running a demo.
- A note must be **signed** before it can sync to the EHR or feed the simulation.
- Everything is synthetic data — safe to click through freely and re-seed anytime.

---

_Synthetic data only · demo environment · not for clinical use._
