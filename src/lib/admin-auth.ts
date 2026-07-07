import { supabaseServer } from "@/lib/supabase/server";

// Platform admins are listed in the ADMIN_EMAILS env var (comma-separated).
// They log in through the normal Supabase auth flow; /api/admin/* routes and
// the /admin page just check the session email against this list.
export async function getAdminUser(): Promise<{ email: string } | null> {
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !allowed.includes(email)) return null;
  return { email };
}
