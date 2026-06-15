'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react'

export type EncounterOption = {
  id:             string
  patientName:    string
  mrn:            string
  chiefComplaint: string | null
  status:         string
  department:     string
  checkInLabel:   string
}

type Stage = 'idle' | 'recording' | 'transcribing' | 'generating' | 'error'

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// Ordered by quality / broad support
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

export default function RecordPanel({ encounters }: { encounters: EncounterOption[] }) {
  const router = useRouter()

  const [encounterId, setEncounterId] = useState(encounters[0]?.id ?? '')
  const [stage, setStage]             = useState<Stage>('idle')
  const [elapsed, setElapsed]         = useState(0)
  const [errorMsg, setErrorMsg]       = useState('')

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const elapsedRef   = useRef(0)   // mirror of elapsed, readable inside onstop closure
  const mimeRef      = useRef('')

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Timer helpers ────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    elapsedRef.current = 0
    setElapsed(0)
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(s => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // ── Post-recording pipeline ──────────────────────────────────────
  const runPipeline = useCallback(async (blob: Blob, durationSec: number) => {
    // Step 1 — transcribe
    setStage('transcribing')
    let transcriptText: string
    try {
      const fd = new FormData()
      fd.append('encounterId', encounterId)
      fd.append('audio', blob, 'recording.webm')
      fd.append('durationSec', String(durationSec))

      const res  = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const data = await res.json() as { ok: boolean; data?: { text: string }; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Transcription failed')
      transcriptText = data.data!.text
    } catch (err) {
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'Transcription failed')
      return
    }

    // Step 2 — generate note
    setStage('generating')
    try {
      const res  = await fetch('/api/generate-note', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ encounterId, transcript: transcriptText }),
      })
      const data = await res.json() as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Note generation failed')
    } catch (err) {
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'Note generation failed')
      return
    }

    // Navigate to review screen
    router.push(`/encounters/${encounterId}`)
  }, [encounterId, router])

  // ── MediaRecorder ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setErrorMsg('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setStage('error')
      setErrorMsg(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone access and try again.'
          : (err instanceof Error ? err.message : 'Could not access microphone')
      )
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const mime = MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    mimeRef.current = mime

    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
      runPipeline(blob, elapsedRef.current)
    }

    recorder.start()
    setStage('recording')
    startTimer()
  }, [runPipeline, startTimer])

  const stopRecording = useCallback(() => {
    stopTimer()
    recorderRef.current?.stop()
    // stage transitions to 'transcribing' inside onstop → runPipeline
  }, [stopTimer])

  const reset = useCallback(() => {
    setStage('idle')
    setElapsed(0)
    setErrorMsg('')
  }, [])

  const selectedEnc = encounters.find(e => e.id === encounterId)
  const busy = stage === 'transcribing' || stage === 'generating'

  return (
    <div className="mx-auto max-w-lg p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Record visit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture audio, transcribe, and generate a draft SOAP note.
        </p>
      </div>

      {/* Encounter selector */}
      <div className="mb-5">
        <label
          htmlFor="encounter-select"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Encounter
        </label>
        <select
          id="encounter-select"
          value={encounterId}
          onChange={e => setEncounterId(e.target.value)}
          disabled={stage !== 'idle'}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
        >
          {encounters.length === 0 ? (
            <option value="">No active encounters — seed the database first</option>
          ) : (
            encounters.map(enc => (
              <option key={enc.id} value={enc.id}>
                {enc.patientName} · {enc.chiefComplaint ?? 'No complaint'} · {enc.mrn}
              </option>
            ))
          )}
        </select>
        {selectedEnc && (
          <p className="mt-1.5 text-xs text-slate-400">
            {selectedEnc.department} ·{' '}
            {selectedEnc.status.replace(/_/g, ' ').toLowerCase()} ·{' '}
            Check-in {selectedEnc.checkInLabel}
          </p>
        )}
      </div>

      {/* Recording card */}
      <div className="rounded-xl border border-slate-100 bg-white p-10">

        {/* ── Idle ── */}
        {stage === 'idle' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Mic className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">Ready to record</p>
            <button
              onClick={startRecording}
              disabled={!encounterId}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Recording
            </button>
          </div>
        )}

        {/* ── Recording ── */}
        {stage === 'recording' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <span className="h-4 w-4 animate-pulse rounded-full bg-red-500" />
            </div>
            <div className="font-mono text-4xl font-light tabular-nums tracking-tight text-slate-800">
              {fmtElapsed(elapsed)}
            </div>
            <p className="text-xs text-slate-400">Recording in progress</p>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </button>
          </div>
        )}

        {/* ── Transcribing / Generating ── */}
        {busy && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {stage === 'transcribing' ? 'Transcribing audio…' : 'Generating clinical note…'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {stage === 'transcribing'
                  ? 'Converting speech to text'
                  : 'Building SOAP note · ICD-10 · CPT codes'}
              </p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-800">Something went wrong</p>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">{errorMsg}</p>
            </div>
            <button
              onClick={reset}
              className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* AI disclosure */}
      <p className="mt-4 text-center text-xs text-slate-400">
        AI-generated notes are suggestions — requires clinician sign-off · Synthetic data only
      </p>
    </div>
  )
}
