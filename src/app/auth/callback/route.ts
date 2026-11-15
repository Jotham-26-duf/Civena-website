import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const rawNext = request.nextUrl.searchParams.get("next") ?? "/account";
  const requestedDestination = new URL(rawNext, request.url);
  const next = rawNext.startsWith("/") && requestedDestination.origin === request.nextUrl.origin ? requestedDestination.pathname + requestedDestination.search + requestedDestination.hash : "/account";
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=Authentication%20callback%20could%20not%20be%20completed.", request.url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=Authentication%20link%20is%20invalid%20or%20expired.", request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
