/** Small insertion-ordered LRU used for the page URL -> title cache. */
export class LRUCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly max = 100) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Re-insert so the most recently used entry is last.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

/** Shared by every web_search card so crawl_tool can resolve a page title. */
export const pageTitleCache = new LRUCache<string, string>(100);
