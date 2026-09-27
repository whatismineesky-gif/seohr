import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/db";
import { SESSION_COOKIE } from "@/app/session-auth";

const encoder = new TextEncoder();
const ttlSeconds = 8 * 60 * 60;

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
function hexToBytes(value: string) {
  if (!/^(?:[a-f\d]{2})+$/i.test(value)) throw new Error("invalid hash");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}
function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function verifyPassword(password: string, encoded: string) {
  const [scheme, rounds, saltHex, digestHex] = encoded.split("$");
  if (scheme !== "pbkdf2_sha256" || !/^\d+$/.test(rounds)) return false;
  const iterations = Number(rounds);
  if (iterations < 100_000 || iterations > 1_000_000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256));
    return equalBytes(derived, hexToBytes(digestHex));
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origin ไม่ถูกต้อง" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const database = getD1();

  if (payload.action === "logout") {
    const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
    if (/^[a-f0-9]{64}$/.test(token)) {
      await database.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(new Date().toISOString(), await sha256(token)).run();
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "strict", maxAge: 0 });
    return response;
  }

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");
  const user = await database.prepare(`
    SELECT u.id, u.password_hash, u.status, u.failed_login_count, u.locked_until
    FROM users u
    LEFT JOIN hr_system_users h ON h.login_username = u.username COLLATE NOCASE
    WHERE u.username = ? COLLATE NOCASE OR h.email = ? COLLATE NOCASE
    ORDER BY CASE WHEN u.username = ? COLLATE NOCASE THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(username, username, username).first<Record<string, unknown>>();
  const now = new Date();
  const lockedUntil = user?.locked_until ? new Date(String(user.locked_until)) : null;
  const valid = user?.status === "active" && (!lockedUntil || lockedUntil <= now) && await verifyPassword(password, String(user?.password_hash ?? ""));
  if (!user || !valid) {
    if (user) {
      const failures = Number(user.failed_login_count ?? 0) + 1;
      const lock = failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
      await database.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
        .bind(failures >= 5 ? 0 : failures, lock, now.toISOString(), user.id).run();
    }
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await database.batch([
    database.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
      .bind(now.toISOString(), now.toISOString(), user.id),
    database.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, await sha256(token), now.toISOString(), new Date(now.getTime() + ttlSeconds * 1000).toISOString()),
  ]);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { path: "/", httpOnly: true, secure: true, sameSite: "strict", maxAge: ttlSeconds });
  return response;
}
