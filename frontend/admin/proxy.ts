import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/patient");

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get("sb-token")?.value;
  if (!token) return NextResponse.redirect(new URL("/", request.url));

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/patient/:path*"],
};
