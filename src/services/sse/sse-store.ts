import type { Response } from "express";

const listeners = new Map<string, Set<Response>>();

export function addSseClient(batchId: string, res: Response): void {
  const set = listeners.get(batchId) ?? new Set<Response>();
  set.add(res);
  listeners.set(batchId, set);
  res.write(": connected\n\n");
}

export function removeSseClient(batchId: string, res: Response): void {
  const set = listeners.get(batchId);
  if (!set) {
    return;
  }
  set.delete(res);
  if (set.size === 0) {
    listeners.delete(batchId);
  }
}

export function emitSse(batchId: string, event: string, payload: unknown): void {
  const set = listeners.get(batchId);
  if (!set) {
    return;
  }
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    res.write(data);
  }
}

export function emitHeartbeat(batchId: string): void {
  const set = listeners.get(batchId);
  if (!set) {
    return;
  }
  for (const res of set) {
    res.write(": heartbeat\n\n");
  }
}
