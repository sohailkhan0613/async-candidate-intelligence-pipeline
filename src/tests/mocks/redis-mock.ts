import { vi } from "vitest";

const store = new Map<string, string>();
const lists = new Map<string, string[]>();

export const redisMock = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (...keys: string[]) => {
    for (const key of keys) {
      store.delete(key);
      lists.delete(key);
    }
    return keys.length;
  }),
  rpush: vi.fn(async (key: string, ...values: string[]) => {
    const list = lists.get(key) ?? [];
    list.push(...values);
    lists.set(key, list);
    return list.length;
  }),
  lrange: vi.fn(async (key: string, start: number, end: number) => {
    const list = lists.get(key) ?? [];
    if (end === -1) {
      return list.slice(start);
    }
    return list.slice(start, end + 1);
  }),
  multi: vi.fn(() => {
    const commands: Array<() => void> = [];
    const chain = {
      set: (key: string, value: string) => {
        commands.push(() => store.set(key, value));
        return chain;
      },
      del: (...keys: string[]) => {
        commands.push(() => keys.forEach((key) => store.delete(key)));
        return chain;
      },
      exec: async () => {
        commands.forEach((command) => command());
        return [];
      }
    };
    return chain;
  }),
  reset: () => {
    store.clear();
    lists.clear();
    redisMock.get.mockClear();
    redisMock.set.mockClear();
    redisMock.del.mockClear();
    redisMock.rpush.mockClear();
    redisMock.lrange.mockClear();
    redisMock.multi.mockClear();
  }
};
