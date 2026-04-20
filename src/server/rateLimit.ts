type Bucket = { count: number; resetAt: number };

export class MemoryRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  hit(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
}