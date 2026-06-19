'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

type Role = 'CLINICIAN' | 'OPS_DIRECTOR' | 'CMIO'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'CLINICIAN',    label: 'Clinician' },
  { value: 'OPS_DIRECTOR', label: 'Operations director' },
  { value: 'CMIO',         label: 'CMIO' },
]

type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const router = useRouter()

  const [name, setName]                       = useState('')
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole]                       = useState<Role>('CLINICIAN')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError]     = useState<string | null>(null)
  const [submitting, setSubmitting]   = useState(false)

  function validate(): FieldErrors {
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!email.trim()) errs.email = 'Email is required'
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address'
    if (password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (confirmPassword !== password) errs.confirmPassword = 'Passwords do not match'
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          confirmPassword,
          role,
        }),
      })

      const json: { ok: boolean; error?: string } = await res.json().catch(() => ({ ok: false }))

      if (!res.ok || !json.ok) {
        setFormError(json.error ?? 'Something went wrong creating your account.')
        setSubmitting(false)
        return
      }

      // Account created — sign the user in with the same credentials, then go home.
      const signInResult = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })

      if (signInResult?.error) {
        setFormError('Account created, but automatic sign-in failed. Please sign in manually.')
        setSubmitting(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setFormError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
    'shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300'

  function borderFor(field: keyof FieldErrors) {
    return fieldErrors[field] ? 'border-red-300' : 'border-slate-200'
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set up access to the Clinical Twin demo workspace.
        </p>
      </div>

      {formError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs text-red-700">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-700">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className={`${inputClass} ${borderFor('name')}`}
            placeholder="Dr. Jane Doe"
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className={`${inputClass} ${borderFor('email')}`}
            placeholder="jane.doe@clinicaltwin.dev"
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="role" className="mb-1 block text-xs font-medium text-slate-700">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={submitting}
            className={`${inputClass} cursor-pointer border-slate-200`}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className={`${inputClass} ${borderFor('password')}`}
            placeholder="At least 8 characters"
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-xs font-medium text-slate-700"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            className={`${inputClass} ${borderFor('confirmPassword')}`}
            placeholder="Re-enter your password"
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Already have an account?{' '}
        <a href="/login" className="font-medium text-slate-700 hover:text-slate-900">
          Sign in
        </a>
      </p>
    </div>
  )
}
