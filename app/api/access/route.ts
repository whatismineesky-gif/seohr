import { NextRequest, NextResponse } from "next/server";
import { authorizeApi, safeApiError } from "@/app/api/auth";
import {
  createEmployeeUsersBulk,
  getAccessData,
  saveAccessUser,
} from "@/db/access";

export async function GET(request: NextRequest) {
  const authorization = await authorizeApi(request);
  if (!authorization.ok) return authorization.response;
  try { return NextResponse.json(await getAccessData(authorization.access.user)); }
  catch (error) { return safeApiError(error, "โหลดสิทธิ์ไม่สำเร็จ"); }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["access"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action === "bulk_create_employee_users")
      return NextResponse.json(await createEmployeeUsersBulk(authorization.access.user, payload));
    return NextResponse.json(await saveAccessUser(authorization.access.user, payload));
  } catch (error) {
    return safeApiError(error, "บันทึกสิทธิ์ไม่สำเร็จ");
  }
}
