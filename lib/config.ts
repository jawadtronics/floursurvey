// Supabase project connection. The URL and anon key are public by design
// (RLS + SECURITY DEFINER functions are the real guard). Values fall back to
// constants so the build works even if env inlining is unavailable.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ckiqdhgwlubabmqmbzzx.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraXFkaGd3bHViYWJtcW1ienp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1OTkwMTUsImV4cCI6MjEwMTE3NTAxNX0.8KXTLc7KJg_4seHNHbA6s5QT5muovzsAc6n7r7eR_AU";
