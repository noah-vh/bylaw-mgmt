// Simple in-memory cache implementation
const memoryCache = new Map<string, { value: any; expiry: number }>()

const CACHE_TTL = {
  SHORT: 60 * 1000,        // 1 minute
  MEDIUM: 5 * 60 * 1000,   // 5 minutes  
  LONG: 30 * 60 * 1000,    // 30 minutes
  VERY_LONG: 60 * 60 * 1000 // 1 hour
}

export class CacheManager {
  static async get(key: string): Promise<any> {
    const item = memoryCache.get(key)
    if (!item || Date.now() > item.expiry) {
      memoryCache.delete(key)
      return null
    }
    return item.value
  }

  static async set(key: string, value: any, ttlMs: number = CACHE_TTL.MEDIUM): Promise<void> {
    memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    })
  }

  static async del(key: string): Promise<void> {
    memoryCache.delete(key)
  }

  static async delPattern(pattern: string): Promise<void> {
    const keys = Array.from(memoryCache.keys())
    const regex = new RegExp(pattern.replace('*', '.*'))
    keys.forEach(key => {
      if (regex.test(key)) {
        memoryCache.delete(key)
      }
    })
  }

  static async invalidateMunicipality(id: number): Promise<void> {
    await this.delPattern(`municipality:${id}:*`)
    await this.delPattern('municipalities:list:*')
  }
}

export { CACHE_TTL }