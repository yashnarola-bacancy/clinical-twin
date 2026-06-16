'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { HourlyTimelinePoint } from '@/lib/simulation/types'

// ---------------------------------------------------------------------------
// Lightweight animated "floor" view.
//
// Small dots = patients. They travel left→right through five labelled stage
// columns (Waiting → Triage → Exam → Labs → Done). The population and queue
// length are driven by the simulation's hourly timeline; motion is produced by
// a tiny requestAnimationFrame stepper plus CSS transforms (no libraries).
// ---------------------------------------------------------------------------

const STAGES = [
  { key: 'waiting', label: 'Waiting', color: '#cbd5e1' }, // slate-300
  { key: 'triage', label: 'Triage', color: '#38bdf8' }, // sky-400
  { key: 'exam', label: 'Exam', color: '#0d9488' }, // teal-600 (brand)
  { key: 'labs', label: 'Labs', color: '#f59e0b' }, // amber-500
  { key: 'done', label: 'Done', color: '#10b981' }, // emerald-500
] as const

const STEP_MS = 1700 // simulated time advances one hour per step
const FLOW_P = 0.5 // per-step chance a treated patient advances a stage
const CANVAS_H = 300
const DOT_GAP = 20
const TOP_PAD = 14

type Dot = { id: number; stage: number }

/** Split a treatment population across triage / exam / labs columns. */
function splitTreatment(beds: number) {
  const triage = Math.round(beds * 0.2)
  const exam = Math.round(beds * 0.5)
  const labs = Math.max(0, beds - triage - exam)
  return { triage, exam, labs }
}

/** Initial population for hour 0, so the floor isn't empty on first paint. */
function seedDots(pt: HourlyTimelinePoint): Dot[] {
  const dots: Dot[] = []
  let id = 0
  const { triage, exam, labs } = splitTreatment(Math.round(pt.bedsInUse))
  const counts = [Math.max(0, Math.round(pt.queueLength)), triage, exam, labs]
  counts.forEach((n, stage) => {
    for (let k = 0; k < n; k++) dots.push({ id: id++, stage })
  })
  return dots
}

/**
 * Advance the floor one simulated hour. Treated patients flow forward; intake
 * from the waiting room is gated by free bed capacity; the waiting column is
 * corrected to track the hour's queue length (arrivals appear, or — when beds
 * free up — waiting patients move into triage).
 */
function advance(dots: Dot[], pt: HourlyTimelinePoint): Dot[] {
  // Monotonic id for any new arrivals this step (ids never collide with existing).
  let nextId = dots.reduce((m, d) => Math.max(m, d.id), -1) + 1

  // Drop last step's "done" patients (they leave the floor); copy the rest so
  // we never mutate React state in place.
  const next: Dot[] = dots.filter((d) => d.stage < 4).map((d) => ({ id: d.id, stage: d.stage }))

  // Forward flow inside treatment: Triage→Exam→Labs→Done.
  for (const d of next) {
    if (d.stage >= 1 && d.stage <= 3 && Math.random() < FLOW_P) d.stage++
  }

  // Intake: Waiting→Triage, limited by free beds.
  const beds = Math.max(0, Math.round(pt.bedsInUse))
  const inTreatment = next.filter((d) => d.stage >= 1 && d.stage <= 3).length
  let free = Math.max(0, beds - inTreatment)
  for (const d of next) {
    if (free <= 0) break
    if (d.stage === 0 && Math.random() < 0.8) {
      d.stage = 1
      free--
    }
  }

  // Track the hour's queue length.
  const targetWaiting = Math.max(0, Math.round(pt.queueLength))
  const waiting = next.filter((d) => d.stage === 0)
  if (waiting.length < targetWaiting) {
    for (let k = waiting.length; k < targetWaiting; k++) {
      next.push({ id: nextId++, stage: 0 })
    }
  } else if (waiting.length > targetWaiting) {
    // Beds opened up — move the overflow forward rather than vanishing it.
    let excess = waiting.length - targetWaiting
    for (const d of waiting) {
      if (excess <= 0) break
      d.stage = 1
      excess--
    }
  }

  return next
}

export default function FloorView({ timeline }: { timeline: HourlyTimelinePoint[] }) {
  const [dots, setDots] = useState<Dot[]>(() => seedDots(timeline[0]))
  const hourRef = useRef(0)
  const [hour, setHour] = useState(0)

  // Measure the canvas width so dots can be positioned absolutely and animate
  // across columns via CSS transforms.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The stepper: advance one hour every STEP_MS, looping the simulated day.
  useEffect(() => {
    let raf = 0
    let last = 0
    let acc = 0
    const tick = (t: number) => {
      if (!last) last = t
      acc += t - last
      last = t
      if (acc >= STEP_MS) {
        acc -= STEP_MS
        hourRef.current = (hourRef.current + 1) % timeline.length
        setHour(hourRef.current)
        setDots((prev) => advance(prev, timeline[hourRef.current]))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [timeline])

  // Group dots by stage for stable within-column ordering + live counts.
  const byStage: Dot[][] = [[], [], [], [], []]
  for (const d of dots) byStage[d.stage].push(d)
  byStage.forEach((col) => col.sort((a, b) => a.id - b.id))

  const colW = width / STAGES.length
  const perRow = Math.max(1, Math.floor((colW - 24) / DOT_GAP))

  return (
    <div>
      {/* Column headers + live counts */}
      <div className="mb-3 grid grid-cols-5">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-slate-700">
                {byStage[i].length}
              </span>
              {i < STAGES.length - 1 && <span className="text-slate-300">›</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Canvas with absolutely-positioned, transitioning dots */}
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-lg bg-slate-50/60"
        style={{ height: CANVAS_H }}
      >
        {/* Column separators */}
        {STAGES.slice(1).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-slate-100"
            style={{ left: `${((i + 1) / STAGES.length) * 100}%` }}
          />
        ))}

        {width > 0 &&
          dots.map((d) => {
            const idx = byStage[d.stage].indexOf(d)
            const row = Math.floor(idx / perRow)
            const col = idx % perRow
            const x = d.stage * colW + 12 + col * DOT_GAP
            const y = TOP_PAD + row * DOT_GAP
            return (
              <div
                key={d.id}
                className="absolute h-2.5 w-2.5 rounded-full shadow-sm"
                style={{
                  background: STAGES[d.stage].color,
                  transform: `translate(${x}px, ${y}px)`,
                  transition: 'transform 650ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            )
          })}
      </div>

      {/* Simulated-clock progress */}
      <div className="mt-4 flex items-center gap-3">
        <span className="shrink-0 text-xs tabular-nums text-slate-400">
          Hour {hour + 1} / {timeline.length}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-700 ease-linear"
            style={{ width: `${((hour + 1) / timeline.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
