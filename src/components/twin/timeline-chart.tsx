'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { HourlyTimelinePoint } from '@/lib/simulation/types'

const QUEUE_COLOR = '#f59e0b' // amber-500
const BEDS_COLOR = '#0d9488' // teal-600 (brand)

type ChartDatum = { hour: string; queue: number; beds: number }

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-700">Hour {label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          {p.dataKey === 'queue' ? 'Queue length' : 'Beds in use'}:{' '}
          <span className="font-semibold tabular-nums text-slate-700">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function TimelineChart({
  timeline,
  yMax,
}: {
  timeline: HourlyTimelinePoint[]
  /** Optional shared y-axis ceiling, so two charts can be compared at one scale. */
  yMax?: number
}) {
  const data: ChartDatum[] = timeline.map((p) => ({
    hour: String(p.hour),
    queue: p.queueLength,
    beds: p.bedsInUse,
  }))

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="hour"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            width={32}
            domain={yMax != null ? [0, yMax] : undefined}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#e2e8f0' }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-xs text-slate-500">
                {value === 'queue' ? 'Queue length' : 'Beds in use'}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="beds"
            stroke={BEDS_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="queue"
            stroke={QUEUE_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
