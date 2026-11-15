import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnvironment } from "./environment";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const environment = getSupabaseEnvironment();
  if (!environment) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(environment.url, environment.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions on requests.
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return { supabase, user: null };
  return { supabase, user };
}
