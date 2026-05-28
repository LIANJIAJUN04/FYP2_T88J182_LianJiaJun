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

export function fetchSessions(patientId: string, token: string) {
  return apiFetch<Session[]>(`/api/patients/${patientId}/sessions`, token);
}

export function fetchHistory(patientId: string, token: string, from: string, to: string) {
  return apiFetch<Reading[]>(
    `/api/patients/${patientId}/history?from=${from}&to=${to}`,
    token
  );
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
