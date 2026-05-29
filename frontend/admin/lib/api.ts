const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiFetch<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = (await res.json()).detail; } catch { /* ignore parse errors */ }
    throw new Error(detail ?? `API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export interface Patient {
  id: string;
  name: string;
  ic_number: string;
  ward: string;
  age: number;
  gender: string;
  assigned_doctor: string;
  created_at: string;
}

export interface Session {
  id: string;
  patient_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface Alert {
  id: string;
  patient_id: string;
  metric: string;
  value: number;
  triggered_at: string;
  resolved_at: string | null;
  patients?: {
    name: string;
    ic_number: string;
    ward: string;
  };
}

export interface Reading {
  spo2: number;
  bpm: number;
  temperature: number;
  status: string;
  prediction: string;
  alert: boolean;
  ts: string;
  // Per-metric anomaly flags emitted by the ML pipeline on newer records.
  // Absent on readings that predate per-metric flag emission — consumers must
  // check for their presence before using them and fall back to row-level flags.
  is_spo2_anomalous?: boolean;
  is_bpm_anomalous?: boolean;
  is_temp_anomalous?: boolean;
}

export function fetchPatients(token: string) {
  return apiFetch<Patient[]>("/api/patients", token);
}

export function fetchPatient(id: string, token: string) {
  return apiFetch<Patient>(`/api/patients/${id}`, token);
}

export function fetchAlerts(token: string) {
  return apiFetch<Alert[]>("/api/alerts", token);
}

export interface ResolveAllResult {
  status: string;
  resolved_count: number;
}

export function resolveAllAlerts(patientId: string, token: string) {
  return apiFetch<ResolveAllResult>(`/api/alerts/resolve-all/${patientId}`, token, {
    method: "PUT",
  });
}

export function fetchSessions(patientId: string, token: string) {
  return apiFetch<Session[]>(`/api/patients/${patientId}/sessions`, token);
}

export interface AbnormalSegment {
  startTime: string;  // ISO string
  endTime: string;    // ISO string
  reason: string;     // e.g. "High Temp (38.7°C)"
}

export interface HistoryResponse {
  readings: Reading[];
  abnormalSegments: AbnormalSegment[];
}

// Backward-compatible: current backend returns Reading[]; upgraded backend returns HistoryResponse.
export function fetchHistory(
  patientId: string,
  token: string,
  from: string,
  to: string,
): Promise<HistoryResponse> {
  return apiFetch<Reading[] | HistoryResponse>(
    `/api/patients/${patientId}/history?from=${from}&to=${to}`,
    token,
  ).then((data) => {
    if (Array.isArray(data)) {
      return { readings: data, abnormalSegments: [] };
    }
    return { readings: data.readings, abnormalSegments: data.abnormalSegments ?? [] };
  });
}

export function getStreamUrl(patientId: string, token: string): string {
  return `${BASE}/api/patients/${patientId}/stream?token=${encodeURIComponent(token)}`;
}

export interface SummaryResult {
  summary: string;
  period: string;
  readings_count: number;
}

export function fetchSummary(patientId: string, token: string, range: string) {
  return apiFetch<SummaryResult>(
    `/api/patients/${patientId}/summary?range=${range}`,
    token
  );
}

export interface CopilotReadingPoint {
  ts: string;
  spo2: number;
  bpm: number;
  temperature: number;
}

export interface CopilotRequest {
  metric: string;
  value: number;
  triggered_at: string;
  resolved_at: string | null;
  readings_slice: CopilotReadingPoint[];
}

export interface CopilotResult {
  analysis: string;
  readings_count: number;
}

export function fetchCopilotAnalysis(token: string, req: CopilotRequest) {
  return apiFetch<CopilotResult>("/api/copilot/analyze", token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export interface ChatConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatRequest {
  metric: string;
  value: number;
  triggered_at: string;
  resolved_at: string | null;
  readings_slice: CopilotReadingPoint[];
  history: ChatConversationMessage[];
  message: string;
}

export interface CopilotChatResult {
  response: string;
}

export function fetchCopilotChat(token: string, req: CopilotChatRequest) {
  return apiFetch<CopilotChatResult>("/api/copilot/chat", token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── SSE streaming helpers ─────────────────────────────────────────────────────

interface SSEEvent {
  type: "meta" | "chunk" | "done" | "error";
  text?: string;
  message?: string;
  period?: string;
  readings_count?: number;
}

async function* readSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          yield JSON.parse(line.slice(6)) as SSEEvent;
        } catch {
          // skip malformed event
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Streaming copilot chat ────────────────────────────────────────────────────

export async function* streamCopilotChat(
  token: string,
  req: CopilotChatRequest,
): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/api/copilot/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = (await res.json()).detail; } catch { /* ignore */ }
    throw new Error(detail ?? `API ${res.status}: /api/copilot/chat`);
  }
  for await (const event of readSSEStream(res)) {
    if (event.type === "chunk" && event.text !== undefined) yield event.text;
    if (event.type === "done") return;
    if (event.type === "error") throw new Error(event.message ?? "Stream error");
  }
}

// ── Streaming AI Health Summary ───────────────────────────────────────────────

export interface SummaryStreamEvent {
  type: "meta" | "chunk" | "done" | "error";
  period?: string;
  readings_count?: number;
  text?: string;
  message?: string;
}

export async function* streamSummary(
  patientId: string,
  token: string,
  range: string,
): AsyncGenerator<SummaryStreamEvent> {
  const res = await fetch(
    `${BASE}/api/patients/${patientId}/summary?range=${range}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = (await res.json()).detail; } catch { /* ignore */ }
    throw new Error(detail ?? `API ${res.status}: summary`);
  }
  for await (const event of readSSEStream(res)) {
    yield event as SummaryStreamEvent;
    if (event.type === "done" || event.type === "error") return;
  }
}
