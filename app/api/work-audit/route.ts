import { NextRequest, NextResponse } from "next/server";

import { authorizeApi, safeApiError } from "@/app/api/auth";
import {
  confirmDailyWork,
  getWorkAuditData,
  saveWorkTarget,
  saveEmployeeWorkTarget,
  saveWorkStatusConfig,
} from "@/db/work-audit";

export async function GET(request: NextRequest) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["dashboard", "attendance"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const date = request.nextUrl.searchParams.get("date") ?? "";
    const summaryOnly = request.nextUrl.searchParams.get("mode") === "summary";
    return NextResponse.json(
      await getWorkAuditData(authorization.access.user, date, summaryOnly),
    );
  } catch (error) {
    return safeApiError(error, "โหลดข้อมูลตรวจส่งงานไม่สำเร็จ");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["attendance"],
    roles: ["hr", "audit"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "save_status_config")
      return NextResponse.json(await saveWorkStatusConfig(authorization.access.user, body));
    if (action === "save_config")
      return NextResponse.json(
        await saveWorkTarget(authorization.access.user, body),
      );
    if (action === "save_employee_target")
      return NextResponse.json(await saveEmployeeWorkTarget(authorization.access.user, body));
    if (action === "confirm_day")
      return NextResponse.json(
        await confirmDailyWork(authorization.access.user, body),
      );
    return NextResponse.json({ error: "ไม่รู้จักคำสั่งที่ส่งมา" }, { status: 400 });
  } catch (error) {
    return safeApiError(error, "บันทึกข้อมูลตรวจส่งงานไม่สำเร็จ");
  }
}
