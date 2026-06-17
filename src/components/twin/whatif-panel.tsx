'use client'

import { useState } from 'react'
import { Play, ArrowRightLeft, RotateCcw, ArrowDown, ArrowUp } from 'lucide-react'
import TimelineChart from '@/components/twin/timeline-chart'
import type { SimConfig, SimResults, HourlyTimelinePoint } from '@/lib/simulation/types'

type ApiResponse = { ok: true; data: SimResults } | { ok: false; error: string }

// The five levers the Operations Director can dial.
const FIELDS: { key: keyof SimConfig; label: string; min: number; max: number }[] = [
  { key: 'edNurses', label: 'ED nurses', min: 1, max: 15 },
  { key: 'outpatientNurses', label: 'Outpatient nurses', min: 0, max: 15 },
  { key: 'doctors', label: 'Doctors', min: 1, max: 40 },
  { key: 'beds', label: 'Beds', min: 1, max: 100 },
  { key: 'arrivalRatePerHour', label: 'Arrival rate (/hr)', min: 1, max: 60 },
]

// Metric definitions + which direction counts as an improvement.
const METRICS: {
  key: keyof Pick<SimResults, 'avgWaitMin' | 'p90WaitMin' | 'bedUtilizationPct' | 'throughput'>
  label: string
  suffix: string
  better: 'lower' | 'higher' | 'neutral'
}[] = [
  { key: 'avgWaitMin', label: 'Avg wait', suffix: ' min', better: 'lower' },
  { key: 'p90WaitMin', label: 'P90 wait', suffix: ' min', better: 'lower' },
  { key: 'bedUtilizationPct', label: 'Bed utilization', suffix: '%', better: 'neutral' },
  { key: 'throughput', label: 'Throughput', suffix: '', better: 'higher' },
]

export default function WhatIfPanel({
  baselineConfig,
  baselineResults,
}: {
  baselineConfig: SimConfig
  baselineResults: SimResults
}) {
  const [config, setConfig] = useState<SimConfig>(baselineConfig)
  const [scenario, setScenario] = useState<SimResults | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function run(next: SimConfig) {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const json: ApiResponse = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.ok === false ? json.error : `Request failed (${res.status})`)
        return
      }
      setScenario(json.data)
    } catch {
      setError('Could not reach the simulation service.')
    } finally {
      setRunning(false)
    }
  }

  function setField(key: keyof SimConfig, raw: number, min: number, max: number) {
    const value = Math.max(min, Math.min(max, Math.round(raw || 0)))
    setConfig((c) => ({ ...c, [key]: value }))
  }

  // PRD preset: move 3 nurses from outpatient → ED (relative to baseline), then run.
  function applyPreset() {
    const next: SimConfig = {
      ...baselineConfig,
      edNurses: baselineConfig.edNurses + 3,
      outpatientNurses: Math.max(0, baselineConfig.outpatientNurses - 3),
    }
    setConfig(next)
    run(next)
  }

  function reset() {
    setConfig(baselineConfig)
    setScenario(null)
    setError('')
  }

  // Shared y-axis ceiling so the two timeline charts are visually comparable.
  const yMax = scenario
    ? niceCeil(maxOf(baselineResults.hourlyTimeline, scenario.hourlyTimeline))
    : undefined

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-slate-900">What-if analysis</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Adjust staffing and demand, then compare a scenario against the baseline.
        </p>
      </div>

      {/* Levers */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={config[f.key]}
            min={f.min}
            max={f.max}
            onChange={(v) => setField(f.key, v, f.min, f.max)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => run(config)}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {running ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? 'Simulating…' : 'Run scenario'}
        </button>

        <button
          onClick={applyPreset}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
          Move 3 nurses: outpatient → ED
        </button>

        <button
          onClick={reset}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {error && <p className="mt-4 text-xs text-rose-600">{error}</p>}

      {/* Comparison */}
      {scenario && (
        <div className="mt-8 space-y-6 border-t border-slate-100 pt-6">
          {/* Metric deltas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <ComparisonCard
                key={m.key}
                label={m.label}
                suffix={m.suffix}
                better={m.better}
                baseline={baselineResults[m.key]}
                scenario={scenario[m.key]}
              />
            ))}
          </div>

          {/* Side-by-side timelines */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MiniChart title="Baseline" timeline={baselineResults.hourlyTimeline} yMax={yMax} />
            <MiniChart
              title="Scenario"
              timeline={scenario.hourlyTimeline}
              yMax={yMax}
              highlight
            />
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-700 focus:border-teal-500 focus:outline-none"
        />
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600"
      />
    </div>
  )
}

function ComparisonCard({
  label,
  suffix,
  better,
  baseline,
  scenario,
}: {
  label: string
  suffix: string
  better: 'lower' | 'higher' | 'neutral'
  baseline: number
  scenario: number
}) {
  const diff = scenario - baseline
  const pct = baseline !== 0 ? (diff / baseline) * 100 : null

  // Color by whether the change is an improvement for this metric.
  const improved =
    better === 'neutral' || diff === 0 ? null : better === 'lower' ? diff < 0 : diff > 0
  const tone =
    improved === null
      ? 'text-slate-500 bg-slate-100'
      : improved
        ? 'text-emerald-700 bg-emerald-50'
        : 'text-rose-700 bg-rose-50'

  const Arrow = diff === 0 ? null : diff < 0 ? ArrowDown : ArrowUp
  const deltaText =
    diff === 0
      ? 'no change'
      : pct === null
        ? `${diff > 0 ? '+' : ''}${round1(diff)}`
        : `${pct > 0 ? '+' : ''}${round1(pct)}%`

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
        {round1(scenario)}
        <span className="text-lg font-medium text-slate-400">{suffix}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
        >
          {Arrow && <Arrow className="h-3 w-3" />}
          {deltaText}
        </span>
        <span className="text-xs text-slate-400">
          from {round1(baseline)}
          {suffix}
        </span>
      </div>
    </div>
  )
}

function MiniChart({
  title,
  timeline,
  yMax,
  highlight,
}: {
  title: string
  timeline: HourlyTimelinePoint[]
  yMax?: number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? 'border-teal-200 bg-teal-50/30' : 'border-slate-100 bg-white'
      }`}
    >
      <p className="mb-3 text-xs font-semibold text-slate-600">{title}</p>
      <TimelineChart timeline={timeline} yMax={yMax} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function maxOf(...timelines: HourlyTimelinePoint[][]): number {
  let m = 0
  for (const tl of timelines) {
    for (const p of tl) m = Math.max(m, p.queueLength, p.bedsInUse)
  }
  return m
}

/** Round a max value up to a clean axis ceiling. */
function niceCeil(n: number): number {
  if (n <= 10) return Math.ceil(n / 2) * 2
  if (n <= 50) return Math.ceil(n / 5) * 5
  return Math.ceil(n / 10) * 10
}
