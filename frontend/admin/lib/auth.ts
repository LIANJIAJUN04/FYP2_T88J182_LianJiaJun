const TOKEN_KEY = "admin-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  const expires = new Date(Date.now() + 3600 * 1000).toUTCString();
  document.cookie = `sb-token=${token}; path=/; expires=${expires}; samesite=lax`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = "sb-token=; path=/; max-age=0; samesite=lax";
}
