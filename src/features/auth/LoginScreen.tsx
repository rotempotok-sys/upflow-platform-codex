import { useEffect, useRef, useState } from 'react'

interface LoginResponseApproved {
  authState: 'approved'
}

interface LoginResponsePending {
  authState: 'pending'
}

interface LoginErrorResponse {
  error?: {
    code?: string
    message?: string
    authState?: 'blocked' | 'not_authorized'
  }
}

export type LoginOutcome =
  | { type: 'approved' }
  | { type: 'pending' }
  | { type: 'blocked'; message?: string }
  | { type: 'not_authorized'; message?: string }
  | { type: 'error'; message: string }

interface LoginScreenProps {
  onOutcome: (outcome: LoginOutcome) => void
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi="1"]')
    if (existing) {
      if (window.google?.accounts?.id) resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity script'))
    document.head.appendChild(script)
  })
}

export function LoginScreen({ onOutcome }: LoginScreenProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let canceled = false

    const setup = async () => {
      if (!GOOGLE_CLIENT_ID) {
        setError('Google Client ID חסר בקונפיגורציה (VITE_GOOGLE_CLIENT_ID).')
        setIsLoading(false)
        return
      }

      try {
        await loadGoogleIdentityScript()
        if (canceled) return

        const googleId = window.google?.accounts?.id
        if (!googleId || !buttonRef.current) {
          throw new Error('Google Sign-In API not available')
        }

        googleId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            const credential = String(response.credential ?? '').trim()
            if (!credential) {
              onOutcome({ type: 'error', message: 'לא התקבל Google ID token' })
              return
            }

            try {
              const res = await fetch('/api/auth/google/login', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idToken: credential }),
              })

              const payload = (await res.json()) as (LoginResponseApproved | LoginResponsePending | LoginErrorResponse)

              if (res.ok && (payload as { authState?: string }).authState === 'approved') {
                onOutcome({ type: 'approved' })
                return
              }

              if (res.ok && (payload as { authState?: string }).authState === 'pending') {
                onOutcome({ type: 'pending' })
                return
              }

              const errorPayload = payload as LoginErrorResponse
              const code = errorPayload.error?.code || 'AUTH_LOGIN_FAILED'
              const message = errorPayload.error?.message || 'Authentication failed'
              const authState = errorPayload.error?.authState

              if (code === 'AUTH_BLOCKED' || authState === 'blocked') {
                onOutcome({ type: 'blocked', message })
                return
              }

              if (code === 'AUTH_NOT_ELIGIBLE' || authState === 'not_authorized') {
                onOutcome({ type: 'not_authorized', message })
                return
              }

              onOutcome({ type: 'error', message })
            } catch (requestError) {
              onOutcome({
                type: 'error',
                message: requestError instanceof Error ? requestError.message : 'Authentication request failed',
              })
            }
          },
          ux_mode: 'popup',
          auto_select: false,
        })

        googleId.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280,
        })

        setError('')
      } catch (setupError) {
        setError(setupError instanceof Error ? setupError.message : 'Google Sign-In setup failed')
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }

    void setup()

    return () => {
      canceled = true
    }
  }, [onOutcome])

  return (
    <main className="app-shell" dir="rtl">
      <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
        <h1>התחברות ל-Upflow Platform</h1>
        <p>הגישה מיועדת לעובדים שמוגדרים בלוח ההרשאות של Monday.</p>
        <div ref={buttonRef} style={{ minHeight: 44, marginTop: '1rem' }} />
        {isLoading ? <p>טוען Google Sign-In...</p> : null}
        {error ? <p className="calendar-error">{error}</p> : null}
      </section>
    </main>
  )
}

