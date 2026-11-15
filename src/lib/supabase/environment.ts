export type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnvironment(): SupabaseEnvironment | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url) return null;
  if (!publishableKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before connecting to Supabase.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the Supabase project base URL.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS (except for localhost development).");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be the project base URL, without /rest/v1 or other paths.");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a Supabase publishable key.");
  }
  return { url: parsed.origin, publishableKey };
}
