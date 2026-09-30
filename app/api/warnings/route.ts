import {
  deleteWarningRow,
  getWarningData,
  saveWarningConfig,
  saveWarningRows,
} from "@/db/warnings";
import { requireApiUser } from "@/app/api/auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureAttendanceSetup, type AuthUser } from "@/db/attendance";

async function requireHr(request: Request) {
  const authenticated = await getChatGPTUser();
  const hostname = new URL(request.url).hostname;
  const auth: AuthUser | null = authenticated
    ? {
        userId: authenticated.userId,
        email: authenticated.email,
        displayName: authenticated.displayName,
      }
    : ["localhost", "127.0.0.1", "terminal.local"].includes(hostname)
      ? {
          userId: "local-qa",
          email: "qa@local.test",
          displayName: "Local HR",
        }
      : null;
  if (!auth) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const user = await ensureAttendanceSetup(auth);
  return user.role === "hr"
    ? null
    : Response.json(
        { error: "เฉพาะ HR เท่านั้นที่แก้ไขข้อมูลใบเตือนได้" },
        { status: 403 },
      );
}

function fail(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" },
    { status: 400 },
  );
}

export async function DELETE(request: Request) {
  const unauthorized = await requireHr(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json(
      await deleteWarningRow((await request.json()) as Record<string, unknown>),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json(
      await getWarningData(
        new URL(request.url).searchParams.get("month") ?? "",
      ),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireHr(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "save_config")
      return Response.json(await saveWarningConfig(body));
    if (body.action === "save_rows")
      return Response.json(await saveWarningRows(body));
    throw new Error("ไม่รู้จักคำสั่งที่ส่งมา");
  } catch (error) {
    return fail(error);
  }
}
