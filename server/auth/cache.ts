export interface CacheEntry<T> {
  value: T
  expiresAtMs: number
}

export class TtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: K): V | null {
    const entry = this.store.get(key)
    if (!entry) return null

    if (Date.now() >= entry.expiresAtMs) {
      this.store.delete(key)
      return null
    }

    return entry.value
  }

  set(key: K, value: V): void {
    this.store.set(key, {
      value,
      expiresAtMs: Date.now() + this.ttlMs,
    })
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

