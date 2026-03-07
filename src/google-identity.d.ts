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

interface GoogleIdPromptResponse {
  credential?: string
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string
    callback: (response: GoogleIdPromptResponse) => void
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'small' | 'medium' | 'large'
      text?: string
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      width?: number
    },
  ) => void
  prompt: () => void
}

interface GoogleAccounts {
  oauth2: GoogleOAuth2
  id: GoogleAccountsId
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
