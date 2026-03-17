export class CacheService {
  private static instance: CacheService;
  private store = new Map<string, { data: unknown; timestamp: number }>();
  private readonly MAX_SIZE = 100; // Cap cache size to prevent memory leaks

  private constructor() {}

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  get<T>(key: string, ttl: number): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    if (this.store.size >= this.MAX_SIZE) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { data, timestamp: Date.now() });
  }
  
  invalidate(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  size(): number { return this.store.size; }
}

// Convenience singleton export
export const cache = CacheService.getInstance();
