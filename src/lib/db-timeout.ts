import { AsyncLocalStorage } from "node:async_hooks";

// The store is scoped to the current async call chain; different Vercel
// invocations never share their deadline even with a shared Supabase client.
const requestDeadline = new AsyncLocalStorage<AbortSignal>();

/** All Supabase HTTP calls started by `operation` share one deadline. */
export function withDbDeadline<T>(milliseconds: number, operation: () => Promise<T>): Promise<T> {
  return requestDeadline.run(AbortSignal.timeout(milliseconds), operation);
}

/** Stable fetch API supported by @supabase/supabase-js 2.x. */
export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const perCallTimeout = AbortSignal.timeout(method === "GET" ? 18_000 : 45_000);
  const signals: AbortSignal[] = [perCallTimeout];
  const requestSignal = requestDeadline.getStore();
  if (requestSignal) signals.push(requestSignal);
  if (init?.signal) signals.push(init.signal);
  return fetch(input, { ...init, signal: AbortSignal.any(signals) });
}
