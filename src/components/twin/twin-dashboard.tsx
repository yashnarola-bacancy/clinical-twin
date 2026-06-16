'use client'

import { useEffect, useState } from 'react'
import { Clock, Hourglass, Gauge, Users } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import TimelineChart from '@/components/twin/timeline-chart'
import FloorView from '@/components/twin/floor-view'
import WhatIfPanel from '@/components/twin/whatif-panel'
import type { SimConfig, SimResults } from '@/lib/simulation/types'

// Baseline scenario the Operations Director lands on. The ED runs on a single
// triage nurse and backs up through the day, while the outpatient line has
// spare nursing — the exact setup the PRD's "move 3 nurses to ED" preset is
// meant to fix. Doctors and beds are deliberately ample so the bottleneck is
// nursing, not capacity.
const DEFAULT_CONFIG: SimConfig = {
  edNurses: 1,
  outpatientNurses: 5,
  doctors: 24,
  beds: 60,
  arrivalRatePerHour: 30,
  simDurationHours: 12,
}

type ApiResponse = { ok: true; data: SimResults } | { ok: false; error: string }
type Status = 'loading' | 'ready' | 'error'

export default function TwinDashboard() {
  const [status, setStatus] = useState<Status>('loading')
  const [results, setResults] = useState<SimResults | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    async function run() {
      setStatus('loading')
      try {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(DEFAULT_CONFIG),
        })
        const json: ApiResponse = await res.json()
        if (cancelled) return
        if (!res.ok || !json.ok) {
          setError(json.ok === false ? json.error : `Request failed (${res.status})`)
          setStatus('error')
          return
        }
        setResults(json.data)
        setStatus('ready')
      } catch {
        if (cancelled) return
        setError('Could not reach the simulation service.')
        setStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') return <LoadingState />
  if (status === 'error') return <ErrorState message={error} />
  if (!results) return null

  return (
    <div className="space-y-6">
      {/* Scenario summary */}
      <p className="text-xs text-slate-400">
        Baseline scenario · {DEFAULT_CONFIG.edNurses} ED + {DEFAULT_CONFIG.outpatientNurses}{' '}
        outpatient nurses · {DEFAULT_CONFIG.doctors} doctors · {DEFAULT_CONFIG.beds} beds ·{' '}
        {DEFAULT_CONFIG.arrivalRatePerHour} arrivals/hr · {DEFAULT_CONFIG.simDurationHours}h day
      </p>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Avg wait"
          value={`${results.avgWaitMin} min`}
          target="Mean wait per patient"
          Icon={Clock}
        />
        <StatCard
          label="P90 wait"
          value={`${results.p90WaitMin} min`}
          target="90th-percentile wait"
          Icon={Hourglass}
        />
        <StatCard
          label="Bed utilization"
          value={`${results.bedUtilizationPct}%`}
          target="Beds occupied over the day"
          Icon={Gauge}
        />
        <StatCard
          label="Throughput"
          value={String(results.throughput)}
          target="Patients seen"
          Icon={Users}
        />
      </div>

      {/* Hourly timeline chart */}
      <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-slate-900">Flow over the day</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Queue length and beds in use, by simulated hour
          </p>
        </div>
        <TimelineChart timeline={results.hourlyTimeline} />
      </section>

      {/* Animated floor view */}
      <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-slate-900">Floor view</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Patients moving through care stages, animated across the modeled day
          </p>
        </div>
        <FloorView timeline={results.hourlyTimeline} />
      </section>

      {/* What-if analysis */}
      <WhatIfPanel baselineConfig={DEFAULT_CONFIG} baselineResults={results} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
        Running simulation…
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 h-4 w-32 animate-pulse rounded bg-slate-100" />
        <div className="h-72 w-full animate-pulse rounded-lg bg-slate-50" />
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-5 h-4 w-28 animate-pulse rounded bg-slate-100" />
        <div className="h-[300px] w-full animate-pulse rounded-lg bg-slate-50" />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
      <p className="text-sm font-medium text-slate-700">Simulation failed to run</p>
      <p className="mt-1 max-w-sm text-xs text-slate-400">{message}</p>
    </div>
  )
}
