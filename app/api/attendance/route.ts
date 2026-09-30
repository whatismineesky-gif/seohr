import { NextRequest, NextResponse } from "next/server";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  createAttendanceRecord,
  deleteAttendanceRecord,
  ensureAttendanceSetup,
  getAttendanceData,
  saveAttendanceRule,
  saveSystemUser,
  updateAttendanceRecord,
  type AuthUser,
} from "@/db/attendance";

async function resolveUser(request: NextRequest): Promise<AuthUser | null> {
  const authenticated = await getChatGPTUser();
  if (authenticated) {
    return {
      userId: authenticated.userId,
      email: authenticated.email,
      displayName: authenticated.displayName,
    };
  }

  const hostname = request.nextUrl.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "terminal.local") {
    return { userId: "local-qa", email: "qa@local.test", displayName: "Local HR" };
  }
  return null;
}

export async function PUT(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try { const user = await ensureAttendanceSetup(auth); return NextResponse.json(await updateAttendanceRecord(user, await request.json() as Record<string, unknown>)); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try { const user = await ensureAttendanceSetup(auth); const body = await request.json() as Record<string, unknown>; return NextResponse.json(await deleteAttendanceRecord(user, body.id)); }
  catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
  const transient = /overloaded|SQLITE_BUSY|database is locked|timed? out/i.test(message);
  const status = transient
    ? 503
    : message.includes("ไม่มีสิทธิ์") || message.includes("เฉพาะ HR") || message.includes("Audit")
    ? 403
    : message.includes("UNIQUE constraint")
      ? 409
      : 400;
  return NextResponse.json(
    { error: status === 409 ? "มีรายการประเภทนี้ในวันที่เลือกแล้ว" : message },
    { status },
  );
}

async function withReadRetry<T>(operation: () => Promise<T>) {
  const delays = [60, 180];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt >= delays.length ||
        !/overloaded|SQLITE_BUSY|database is locked|timed? out/i.test(message)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  try {
    const month = request.nextUrl.searchParams.get("month") ?? "";
    const employeeId = request.nextUrl.searchParams.get("employeeId") ?? undefined;
    const requestedAuditPage = Number(
      request.nextUrl.searchParams.get("auditPage") ?? 1,
    );
    const auditPage = Number.isFinite(requestedAuditPage)
      ? Math.max(1, Math.floor(requestedAuditPage))
      : 1;
    return NextResponse.json(
      await withReadRetry(async () => {
        const user = await ensureAttendanceSetup(auth);
        return getAttendanceData(user, month, employeeId, auditPage);
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveUser(request);
  if (!auth) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  try {
    const user = await ensureAttendanceSetup(auth);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "record") await createAttendanceRecord(user, body);
    else if (action === "save_rule") await saveAttendanceRule(user, body);
    else if (action === "save_user") await saveSystemUser(user, body);
    else throw new Error("ไม่รู้จักคำสั่งที่ส่งมา");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
