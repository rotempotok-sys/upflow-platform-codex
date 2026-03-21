function maskSecret(value: string): string {
  if (value.length <= 8) return '[REDACTED]'
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`
}

export function sanitizeRuntimeErrorMessage(message: string, knownSecrets: string[] = []): string {
  let sanitized = String(message || '')

  for (const secret of knownSecrets) {
    const trimmed = String(secret || '').trim()
    if (!trimmed) continue
    sanitized = sanitized.split(trimmed).join(maskSecret(trimmed))
  }

  sanitized = sanitized.replace(
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    '[REDACTED_JWT]',
  )

  sanitized = sanitized.replace(/(service_role|apikey|api_key|token|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
  sanitized = sanitized.replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')

  return sanitized
}
