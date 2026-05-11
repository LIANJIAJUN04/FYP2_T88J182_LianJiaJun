import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${apiUrl}/api/session/active`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.patient_id) return NextResponse.next();
    }
  } catch {}

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
