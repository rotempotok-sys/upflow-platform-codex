/// <reference types="vite/client" />

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: '' | 'none' | 'consent' | 'select_account' }) => void
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (response: { access_token?: string; error?: string }) => void
  }) => GoogleTokenClient
  revoke: (token: string, done?: () => void) => void
}

interface GoogleAccounts {
  oauth2: GoogleOAuth2
}

interface GoogleIdentity {
  accounts: GoogleAccounts
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

export {}
