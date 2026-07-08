import { redirect } from "next/navigation";

// Login lives on the unified email-first /signup entry now. Keep this path
// working for old links and bookmarks by redirecting.
export default function LoginRedirect() {
  redirect("/signup");
}
