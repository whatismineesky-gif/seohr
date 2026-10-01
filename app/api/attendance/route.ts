import { NextRequest, NextResponse } from "next/server";

import { authorizeApi, safeApiError } from "@/app/api/auth";
import {
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceData,
  saveAttendanceRule,
  saveSystemUser,
  updateAttendanceRecord,
} from "@/db/attendance";

export async function PUT(request: NextRequest) {
  const authorization = await authorizeApi(request, { anyPermissions: ["attendance"] });
  if (!authorization.ok) return authorization.response;
  try { return NextResponse.json(await updateAttendanceRecord(authorization.access.user, await request.json() as Record<string, unknown>)); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  const authorization = await authorizeApi(request, { anyPermissions: ["attendance"] });
  if (!authorization.ok) return authorization.response;
  try { const body = await request.json() as Record<string, unknown>; return NextResponse.json(await deleteAttendanceRecord(authorization.access.user, body.id)); }
  catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
  const transient = /overloaded|SQLITE_BUSY|database is locked|timed? out/i.test(message);
  if (transient)
    return NextResponse.json(
      { error: "ระบบฐานข้อมูลไม่ว่าง กรุณาลองใหม่" },
      { status: 503 },
    );
  if (message.includes("UNIQUE constraint"))
    return NextResponse.json(
      { error: "มีรายการประเภทนี้ในวันที่เลือกแล้ว" },
      { status: 409 },
    );
  if (
    message.includes("ไม่มีสิทธิ์") ||
    message.includes("เฉพาะ HR") ||
    message.includes("Audit")
  )
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
  return safeApiError(error, "ดำเนินการลงเวลาไม่สำเร็จ");
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
  const authorization = await authorizeApi(request, { anyPermissions: ["attendance"] });
  if (!authorization.ok) return authorization.response;

  try {
    const month = request.nextUrl.searchParams.get("month") ?? "";
    const employeeId = request.nextUrl.searchParams.get("employeeId") ?? undefined;
    const statusDate = request.nextUrl.searchParams.get("statusDate") ?? undefined;
    const requestedAuditPage = Number(
      request.nextUrl.searchParams.get("auditPage") ?? 1,
    );
    const auditPage = Number.isFinite(requestedAuditPage)
      ? Math.max(1, Math.floor(requestedAuditPage))
      : 1;
    return NextResponse.json(
      await withReadRetry(async () => {
        return getAttendanceData(
          authorization.access.user,
          month,
          employeeId,
          auditPage,
          statusDate,
        );
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(request, { anyPermissions: ["attendance"] });
  if (!authorization.ok) return authorization.response;

  try {
    const user = authorization.access.user;
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
