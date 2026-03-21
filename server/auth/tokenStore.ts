/**
 * Supabase-backed storage for Google OAuth2 refresh tokens.
 *
 * Uses the service_role key (no RLS policies on google_oauth_tokens).
 * All operations are performed via the existing Supabase admin client pattern.
 */

import type { SupabaseRuntimeConfig } from '../runtime/supabase'
import { createSupabaseAdminClient } from '../runtime/supabase'
import { refreshAccessToken, type GoogleOAuthConfig } from './googleOAuth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredTokenRow {
  email: string
  google_sub: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  scopes: string
  created_at: string
  updated_at: string
}

export interface FreshAccessToken {
  accessToken: string
  expiresAt: string // ISO 8601
}

// ---------------------------------------------------------------------------
// Token Store
// ---------------------------------------------------------------------------

const TABLE = 'google_oauth_tokens'

/** UPSERT tokens after a successful OAuth2 code exchange. */
export async function saveTokens(
  supabaseConfig: SupabaseRuntimeConfig,
  params: {
    email: string
    googleSub: string
    refreshToken: string
    accessToken: string
    expiresInSeconds: number
    scopes: string
  },
): Promise<void> {
  const supabase = createSupabaseAdminClient(supabaseConfig)
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()

  const { error } = await supabase.from(TABLE).upsert(
    {
      email: params.email,
      google_sub: params.googleSub,
      refresh_token: params.refreshToken,
      access_token: params.accessToken,
      access_token_expires_at: expiresAt,
      scopes: params.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )

  if (error) {
    throw new Error(`TOKEN_STORE_SAVE_FAILED: ${error.message}`)
  }
}

/** Get stored tokens for a user. Returns null if not found. */
export async function getTokens(
  supabaseConfig: SupabaseRuntimeConfig,
  email: string,
): Promise<StoredTokenRow | null> {
  const supabase = createSupabaseAdminClient(supabaseConfig)

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email)
    .single()

  if (error) {
    // PGRST116 = no rows found
    if (error.code === 'PGRST116') return null
    throw new Error(`TOKEN_STORE_GET_FAILED: ${error.message}`)
  }

  return data as StoredTokenRow
}

/** Delete tokens for a user (on logout or revocation). */
export async function deleteTokens(
  supabaseConfig: SupabaseRuntimeConfig,
  email: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient(supabaseConfig)

  const { error } = await supabase.from(TABLE).delete().eq('email', email)

  if (error) {
    console.error(`[tokenStore] deleteTokens failed for ${email}:`, error.message)
    // Non-fatal — don't throw
  }
}

/**
 * Get a fresh access token for a user.
 *
 * 1. Fetch stored tokens from Supabase
 * 2. If access_token is still valid (>60s remaining), return it
 * 3. Otherwise, use refresh_token to get a new one from Google
 * 4. Update the stored row with the new access token
 * 5. If refresh token is revoked (invalid_grant), delete the row and return null
 */
export async function getFreshAccessToken(
  supabaseConfig: SupabaseRuntimeConfig,
  email: string,
  oauthConfig: Pick<GoogleOAuthConfig, 'clientId' | 'clientSecret'>,
): Promise<FreshAccessToken | null> {
  const stored = await getTokens(supabaseConfig, email)
  if (!stored) return null

  // Check if current access token is still valid (with 60s buffer)
  if (stored.access_token && stored.access_token_expires_at) {
    const expiresAt = new Date(stored.access_token_expires_at)
    const bufferMs = 60 * 1000
    if (expiresAt.getTime() - Date.now() > bufferMs) {
      return {
        accessToken: stored.access_token,
        expiresAt: stored.access_token_expires_at,
      }
    }
  }

  // Need to refresh
  try {
    const refreshed = await refreshAccessToken(oauthConfig, stored.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

    // Update stored token
    const supabase = createSupabaseAdminClient(supabaseConfig)
    await supabase
      .from(TABLE)
      .update({
        access_token: refreshed.access_token,
        access_token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email)

    return {
      accessToken: refreshed.access_token,
      expiresAt: newExpiresAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : ''

    if (message === 'OAUTH_REFRESH_TOKEN_REVOKED') {
      console.warn(`[tokenStore] Refresh token revoked for ${email}, deleting stored tokens`)
      await deleteTokens(supabaseConfig, email)
      return null
    }

    throw err
  }
}
