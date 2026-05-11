const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function getActivePatient() {
  const res = await fetch(`${BASE}/api/session/active`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function registerPatient(data: {
  name: string;
  ic_number: string;
  ward: string;
  age: number;
  gender: string;
  assigned_doctor: string;
}) {
  const res = await fetch(`${BASE}/api/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Registration failed");
  }
  return res.json();
}

export async function sessionLogin(ic_number: string, password: string) {
  const res = await fetch(`${BASE}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ic_number, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Login failed");
  }
  return res.json();
}

export async function sessionLogout() {
  await fetch(`${BASE}/api/session/logout`, { method: "POST" });
}

export function getStreamUrl() {
  return `${BASE}/api/stream`;
}
