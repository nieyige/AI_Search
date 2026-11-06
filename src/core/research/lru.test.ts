import { describe, expect, it } from "vitest";
import { LRUCache } from "./lru";

describe("LRUCache", () => {
  it("evicts the least recently used entry beyond max size", () => {
    const cache = new LRUCache<string, string>(3);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.get("a")).toBe("1"); // touch a, so b becomes oldest
    cache.set("d", "4");

    expect(cache.size).toBe(3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1");
    expect(cache.get("d")).toBe("4");
  });
});
