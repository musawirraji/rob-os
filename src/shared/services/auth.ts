import "server-only";

import { getServerSupabase } from "./supabase/serverClient";

/**
 * Who is asking.
 *
 * Read through the cookie-bound anon client, so identity comes from a verified
 * session rather than anything the caller can assert. Data access still happens
 * with the service role — this only answers "which user", and therefore which
 * workspace, the request is allowed to see.
 *
 * `getUser()` rather than `getSession()`: the latter trusts the cookie's contents,
 * the former verifies the token with the auth server. On the path that decides
 * what data someone sees, that difference matters.
 */
export type SignedInUser = {
  id: string;
  email: string | null;
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}
