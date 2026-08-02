import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const shellUrl = process.env.NEXT_PUBLIC_SHELL_URL ?? "https://kph-os.vercel.app";
  const entryHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    ?? request.headers.get("host")?.split(":")[0];
  const shellHost = new URL(shellUrl).host;
  const localEntry = entryHost === "localhost" || entryHost === "127.0.0.1";
  if (!localEntry && entryHost && entryHost !== shellHost) {
    return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, shellUrl), 302);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/compras/:path*"] };
