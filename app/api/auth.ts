import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getSystemAccess, type MenuId } from "@/db/access";
import type { AuthUser, SystemUser } from "@/db/attendance";

type ApiAccess = {
  user: SystemUser;
  permissions: MenuId[];
};

type AccessResult =
  | { ok: true; access: ApiAccess }
  | { ok: false; response: Response };

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function localUser(request: Request): AuthUser | null {
  const hostname = new URL(request.url).hostname;
  return ["localhost", "127.0.0.1", "terminal.local"].includes(hostname)
    ? {
        userId: "local-qa",
        email: "qa@local.test",
        displayName: "Local HR",
      }
    : null;
}

function sameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function authorizeApi(
  request: Request,
  options: {
    anyPermissions?: MenuId[];
    roles?: SystemUser["role"][];
  } = {},
): Promise<AccessResult> {
  if (!sameOrigin(request))
    return { ok: false, response: jsonError("คำขอไม่ได้รับอนุญาต", 403) };
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json"))
      return { ok: false, response: jsonError("รูปแบบคำขอไม่ถูกต้อง", 415) };
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2 * 1024 * 1024)
      return { ok: false, response: jsonError("ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป", 413) };
  }
  const authenticated = await getChatGPTUser();
  const auth: AuthUser | null = authenticated
    ? {
        userId: authenticated.userId,
        email: authenticated.email,
        displayName: authenticated.displayName,
      }
    : localUser(request);
  if (!auth)
    return { ok: false, response: jsonError("กรุณาเข้าสู่ระบบ", 401) };
  const access = await getSystemAccess(auth);
  if (
    options.roles?.length &&
    !options.roles.includes(access.currentUser.role)
  )
    return { ok: false, response: jsonError("ไม่มีสิทธิ์ดำเนินการ", 403) };
  if (
    options.anyPermissions?.length &&
    !options.anyPermissions.some((permission) =>
      access.permissions.includes(permission),
    )
  )
    return { ok: false, response: jsonError("ไม่มีสิทธิ์เข้าใช้งานข้อมูลนี้", 403) };
  return {
    ok: true,
    access: { user: access.currentUser, permissions: access.permissions },
  };
}

export function safeApiError(
  error: unknown,
  fallback = "ดำเนินการไม่สำเร็จ กรุณาลองใหม่",
) {
  console.error("API request failed", error);
  const message = error instanceof Error ? error.message : "";
  const expected = [
    "กรุณา",
    "ไม่พบ",
    "ไม่ถูกต้อง",
    "มีอยู่แล้ว",
    "ซ้ำ",
    "สูงสุด",
    "อย่างน้อย",
    "ยังไม่ได้",
    "ไม่มีสิทธิ์",
    "เฉพาะ HR",
  ].some((text) => message.includes(text));
  return jsonError(expected ? message : fallback, expected ? 400 : 500);
}

export async function requireApiUser(
  request: Request,
): Promise<Response | null> {
  const result = await authorizeApi(request);
  return result.ok ? null : result.response;
}
