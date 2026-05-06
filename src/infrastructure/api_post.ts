// Tiny POST helper for the BFF. JSON-encoded body, JSON response. Errors
// surface the backend's 400-level `detail` message when present so the UI
// can display them.

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export async function api_post<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try {
      const json = (await r.json()) as { detail?: string };
      if (json.detail) detail = json.detail;
    } catch {
      /* fallthrough */
    }
    throw new Error(detail);
  }
  return (await r.json()) as TResponse;
}
