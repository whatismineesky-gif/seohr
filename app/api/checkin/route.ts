import { NextRequest, NextResponse } from "next/server";

import { authorizeApi, safeApiError } from "@/app/api/auth";
import {
  endMeeting,
  endWork,
  getCheckinData,
  saveCheckinConfig,
  startMeeting,
} from "@/db/checkin";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("เฉพาะ HR") || message.includes("ไม่มีสิทธิ์"))
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
  return safeApiError(error, "ดำเนินการเช็คชื่อไม่สำเร็จ");
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["checkin"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    return NextResponse.json(await getCheckinData(authorization.access.user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["checkin"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "meeting_start")
      return NextResponse.json(await startMeeting(authorization.access.user));
    if (action === "meeting_end")
      return NextResponse.json(await endMeeting(authorization.access.user, body));
    if (action === "work_end")
      return NextResponse.json(await endWork(authorization.access.user));
    if (action === "save_config")
      return NextResponse.json(
        await saveCheckinConfig(authorization.access.user, body),
      );
    return NextResponse.json({ error: "ไม่รู้จักคำสั่งที่ส่งมา" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
