// Tiny fetch helper for the BFF. The base URL comes from VITE_API_URL with a
// localhost default for dev. All repositories funnel through here so we have
// one place to add interceptors (auth, retries, timing) later.

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export async function api_get<T>(path: string, params?: Record<string, string | number | string[]>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) qs.append(k, String(item));
      } else if (v !== undefined && v !== null) {
        qs.append(k, String(v));
      }
    }
  }
  const url = `${API_BASE}${path}${qs.toString() ? `?${qs}` : ""}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`GET ${url} → ${r.status} ${r.statusText}`);
  }
  return (await r.json()) as T;
}
