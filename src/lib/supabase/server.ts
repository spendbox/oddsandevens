import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-based client for route handlers and server components: used to
// identify the logged-in merchant. Runs under RLS with the user's session.
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a server component where cookies are read-only;
            // middleware handles session refresh.
          }
        },
      },
    }
  );
}
