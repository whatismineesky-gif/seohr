import {
  deleteWarningRow,
  deleteWarningMonth,
  getWarningData,
  saveWarningConfig,
  saveWarningRows,
} from "@/db/warnings";
import { authorizeApi, safeApiError } from "@/app/api/auth";

export async function DELETE(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["warnings"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(
      body.action === "delete_month" ? await deleteWarningMonth(body) : await deleteWarningRow(body),
    );
  } catch (error) {
    return safeApiError(error, "ลบข้อมูลใบเตือนไม่สำเร็จ");
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["warnings"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json(
      await getWarningData(
        new URL(request.url).searchParams.get("month") ?? "",
      ),
    );
  } catch (error) {
    return safeApiError(error, "โหลดข้อมูลใบเตือนไม่สำเร็จ");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["warnings"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "save_config")
      return Response.json(await saveWarningConfig(body));
    if (body.action === "save_rows")
      return Response.json(await saveWarningRows(body));
    throw new Error("ไม่รู้จักคำสั่งที่ส่งมา");
  } catch (error) {
    return safeApiError(error, "บันทึกข้อมูลใบเตือนไม่สำเร็จ");
  }
}
