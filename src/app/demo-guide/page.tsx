import Link from 'next/link'
import {
  Mic,
  ShieldCheck,
  UploadCloud,
  LayoutDashboard,
  Activity,
  Lock,
  RefreshCw,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react'

// Internal-only walkthrough. This route lives OUTSIDE the (app) route group, so
// it renders without the product sidebar/header and is not linked anywhere in
// the product nav. noindex keeps it out of crawlers.
export const metadata = {
  title: 'Demo guide (internal)',
  robots: { index: false, follow: false },
}

type Step = {
  n:             number
  Icon:          LucideIcon
  title:         string
  persona:       string
  href:          string
  hrefLabel:     string
  actions:       string[]
  talkingPoints: string[]
  prd:           string
}

const STEPS: Step[] = [
  {
    n:         1,
    Icon:      Mic,
    title:     'Record a visit & show the AI note',
    persona:   'Clinician (Dr. Sarah Chen)',
    href:      '/record',
    hrefLabel: '/record',
    actions: [
      'Pick an active patient from the encounter dropdown (one that is Checked in / In exam).',
      'Click Start Recording and speak a short clinician–patient exchange. (In MOCK_AI mode you can stop after a few seconds — a canned transcript is used.)',
      'Click Stop and watch the pipeline: “Transcribing audio…” → “Generating clinical note…”.',
      'You land on the encounter with a drafted SOAP note and ICD-10 / CPT codes, each carrying a confidence score.',
    ],
    talkingPoints: [
      'Audio is transcribed, then Claude drafts a structured SOAP note in seconds — generation time is measured against a sub-60-second target.',
      'Every diagnosis/procedure code is a suggestion with a confidence score, never an auto-decision.',
      'The note is drawn only from what’s in the transcript — no invented vitals, meds, or allergies.',
      'The recording is discarded after transcription — no audio is stored.',
    ],
    prd: 'Module A — ambient capture → transcription → AI-drafted SOAP note with coded diagnoses. Satisfies the note-generation latency KPI (< 60s) and the “audio deleted post-transcription” privacy rule.',
  },
  {
    n:         2,
    Icon:      ShieldCheck,
    title:     'Edit and sign off',
    persona:   'Clinician (Dr. Sarah Chen)',
    href:      '/encounters',
    hrefLabel: '/encounters → open the encounter',
    actions: [
      'Review the S / O / A / P sections. Edit one field (e.g. tweak the Plan) — note the “edited” indicator appears.',
      'Toggle one ICD-10/CPT code off to show the clinician can reject a suggestion.',
      'Click Sign off → “Signing…” → the note flips to SIGNED.',
    ],
    talkingPoints: [
      'The clinician is always in control — nothing is committed without an explicit sign-off action.',
      'Edits are tracked per field, which is exactly what powers the “signed without edits” accuracy metric.',
      'Rejecting a code reinforces that the AI is assistive, not authoritative.',
      'Sign-off is the gate: only a signed note can sync to the EHR or feed the operational twin.',
    ],
    prd: 'Module A — clinician review & sign-off. Satisfies “AI suggestions require sign-off / no auto-commit to the EHR” and the accuracy KPI (≥ 98%, proxied by signed-without-edits).',
  },
  {
    n:         3,
    Icon:      UploadCloud,
    title:     'Sync to EHR — show the FHIR bundle + latency',
    persona:   'Clinician (Dr. Sarah Chen)',
    href:      '/encounters',
    hrefLabel: '/encounters → the signed encounter',
    actions: [
      'On the signed encounter, click Sync to EHR → “Syncing…”.',
      'Show the “Synced ✓” confirmation with the measured round-trip latency.',
      'Expand the FHIR bundle to reveal the transaction Bundle (Encounter + Patient resources).',
    ],
    talkingPoints: [
      'On sign-off the note is packaged as a standard FHIR transaction bundle and pushed to the (mock) EHR.',
      'Round-trip sync latency is measured and surfaced — it’s a tracked KPI, not a black box.',
      'Because it’s standards-based (FHIR), this drops into a real EHR integration later with no rework to the model.',
      'Status moves SIGNED → SYNCED; the encounter is now part of the operational dataset that feeds the twin.',
    ],
    prd: 'Module A — EHR write-back via FHIR. Satisfies the sync-latency KPI and the rule that only signed notes may sync.',
  },
  {
    n:         4,
    Icon:      LayoutDashboard,
    title:     'Open the KPI dashboard',
    persona:   'CMIO (Dr. Priya Patel)',
    href:      '/',
    hrefLabel: '/ (Quality & compliance)',
    actions: [
      'Open the dashboard and walk the four KPI cards.',
      'Point out avg note-generation time vs the < 60s target (green dot = meets target), % signed-without-edits vs 98%, avg EHR sync latency, and encounters processed by status.',
      'Show the notes-per-day chart for throughput over the last 14 days.',
    ],
    talkingPoints: [
      'These are the PRD success metrics, computed live from the encounters in the system — including the visit you just signed and synced.',
      'Two cards map straight to PRD targets: sub-60-second generation and 98% accuracy.',
      'Close the loop verbally: the work the clinician just did is what moves these numbers.',
    ],
    prd: 'Success-metrics dashboard — note-generation time (< 60s), documentation accuracy (98%), EHR sync latency, and throughput.',
  },
  {
    n:         5,
    Icon:      Activity,
    title:     'Open the twin & run “move 3 nurses to ED”',
    persona:   'Operations Director (Marcus Williams)',
    href:      '/twin',
    hrefLabel: '/twin',
    actions: [
      'Open the twin — the baseline simulation runs automatically (1 ED nurse, outpatient flush).',
      'Walk the baseline metrics: avg wait, P90 wait, bed utilization, throughput; show the hourly flow chart and floor view.',
      'Click the “Move 3 nurses: outpatient → ED” preset → “Simulating…” → compare scenario vs baseline (avg and P90 wait drop).',
    ],
    talkingPoints: [
      'The twin is fed by real encounter metadata — exam durations and admission rate are calibrated from the signed encounters, so Modules A and B connect.',
      'The ED is nurse-bound while outpatient has slack; reallocating 3 nurses cuts wait time — a concrete decision the director can test before committing staff.',
      'It’s a pure, rerunnable model: same patients, different staffing — an apples-to-apples comparison.',
    ],
    prd: 'Module B — operational digital twin fed by encounter data, with what-if staffing controls. Demonstrates the PRD scenario: moving nurses to the constrained line lowers wait time.',
  },
]

export default function DemoGuidePage() {
  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-3xl px-6">
        {/* Internal banner */}
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Internal demo crib sheet — not part of the product, not linked in the app. For the presenter only.
        </div>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Demo walkthrough</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            A five-step path through Clinical Twin: capture a note with AI, sign it off, sync it to
            the EHR, review the KPIs, then run an operational what-if. Each step lists what to click,
            what to say, and the PRD requirement it satisfies. End-to-end runs in about 5 minutes.
          </p>

          {/* Pre-flight */}
          <div className="mt-5 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <RefreshCw className="h-4 w-4 text-slate-400" />
              Before you start
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <li>
                • Go to{' '}
                <Link href="/settings" className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
                  /settings
                </Link>{' '}
                and click <span className="font-medium text-slate-700">Reset &amp; re-seed</span> for a clean state.
                The reseed includes 2–3 pre-signed encounters, so the KPIs and twin already have data on first load.
              </li>
              <li>
                • Switch personas with the <span className="font-medium text-slate-700">role switcher</span> (top-right of the app).
                Each step below names the persona to use.
              </li>
              <li>
                • For a key-free run, set <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700">MOCK_AI=true</code>{' '}
                so transcription and note generation return canned results.
              </li>
            </ul>
          </div>
        </header>

        {/* Steps */}
        <ol className="space-y-5">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm"
            >
              {/* Step header */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <step.Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Step {step.n}
                    </span>
                  </div>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">
                    {step.title}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {step.persona}
                    </span>
                    <span className="text-slate-300">·</span>
                    <Link
                      href={step.href}
                      className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    >
                      {step.hrefLabel}
                    </Link>
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Do this
                  </p>
                  <ol className="space-y-2">
                    {step.actions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold tabular-nums text-slate-500">
                          {i + 1}
                        </span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Talking points
                  </p>
                  <ul className="space-y-2">
                    {step.talkingPoints.map((t, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* PRD footer */}
              <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
                <p className="text-xs leading-relaxed text-slate-500">
                  <span className="font-semibold uppercase tracking-wider text-slate-400">
                    PRD requirement&nbsp;·&nbsp;
                  </span>
                  {step.prd}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* Footer */}
        <footer className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5 text-xs text-slate-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to the app
          </Link>
          <span>Synthetic data only · demo environment</span>
        </footer>
      </div>
    </main>
  )
}
