import { cookies } from "next/headers";
import { getD1 } from "@/db";

export type SessionUser = { userId: string; displayName: string; email: string; fullName: string | null };
export const SESSION_COOKIE = "__Host-people_os_session";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await getD1().prepare(`
    SELECT u.id, u.username, e.email, e.legal_name, e.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN employees e ON e.id = u.employee_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'
    LIMIT 1
  `).bind(await sha256(token), new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) return null;
  const username = String(row.username ?? "user");
  const displayName = String(row.display_name || row.legal_name || username);
  return {
    userId: String(row.id),
    displayName,
    email: String(row.email || `${username}@people-os.local`).toLowerCase(),
    fullName: displayName,
  };
}
