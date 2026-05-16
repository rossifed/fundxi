// Tiny fetch helper for the BFF. The base URL comes from VITE_API_URL with a
// localhost default for dev. All repositories funnel through here so we have
// one place to add interceptors (auth, retries, timing) later.
//
// ``credentials: "include"`` is always set so the HTTP-only session cookie
// rides on every request (BFF auth pattern — the JWT never touches JS).

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly path: string, message: string) {
    super(message);
  }
}

function _qs(params?: Record<string, string | number | string[]>): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, String(item));
    } else if (v !== undefined && v !== null) {
      qs.append(k, String(v));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function api_get<T>(path: string, params?: Record<string, string | number | string[]>): Promise<T> {
  const url = `${API_BASE}${path}${_qs(params)}`;
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new ApiError(r.status, path, `GET ${url} → ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export async function api_post<T>(path: string, body?: unknown): Promise<T> {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    let detail: string = r.statusText;
    try {
      const data = await r.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data?.detail)) {
        // FastAPI / Pydantic 422 validation shape: list of {loc, msg, type}.
        const msgs = (data.detail as Array<{ msg?: string; loc?: unknown[] }>)
          .map(e => e?.msg ?? "validation error")
          .filter(Boolean);
        if (msgs.length > 0) detail = msgs.join(", ");
      }
    } catch {
      /* body was not JSON — keep statusText */
    }
    throw new ApiError(r.status, path, detail);
  }
  return (await r.json()) as T;
}
