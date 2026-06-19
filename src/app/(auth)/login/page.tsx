'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

type FieldErrors = Partial<Record<'email' | 'password', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError]     = useState<string | null>(null)
  const [submitting, setSubmitting]   = useState(false)

  function validate(): FieldErrors {
    const errs: FieldErrors = {}
    if (!email.trim()) errs.email = 'Email is required'
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Password is required'
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
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })

      if (!result || result.error) {
        setFormError('Invalid email or password.')
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
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome back to the Clinical Twin demo workspace.
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
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className={`${inputClass} ${borderFor('password')}`}
            placeholder="Your password"
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
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
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="font-medium text-slate-700 hover:text-slate-900">
          Sign up
        </a>
      </p>
    </div>
  )
}
