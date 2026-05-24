// Tiny fetch helper for the BFF. The base URL defaults to the local dev port;
// each app (web, mobile) overrides it at boot via `set_api_base`, reading from
// the platform-appropriate env (Vite `import.meta.env.VITE_*` on web,
// `process.env.EXPO_PUBLIC_*` on RN). Keeping the platform read out of `core`
// lets Metro load this module without exploding on `import.meta`.
//
// All repositories funnel through `api_get` / `api_post`, so this is the single
// place to plug in retries, timing, auth headers later.
//
// `credentials: "include"` is set so the HTTP-only session cookie rides on
// every request (BFF auth pattern, web). On RN it's a no-op — mobile auth
// will use a bearer token (see context/MOBILE-MIGRATION-PLAN.md risk R7).

let _api_base = "http://localhost:8000";

export function set_api_base(url: string): void {
  _api_base = url;
}

export function get_api_base(): string {
  return _api_base;
}

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

export async function api_get<T>(
  path: string,
  params?: Record<string, string | number | string[]>,
): Promise<T> {
  const url = `${_api_base}${path}${_qs(params)}`;
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new ApiError(r.status, path, `GET ${url} → ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export async function api_post<T>(path: string, body?: unknown): Promise<T> {
  const url = `${_api_base}${path}`;
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
