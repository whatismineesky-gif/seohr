import {
  deletePayroll,
  getPayrollData,
  getPayrollSettings,
  listMonthlyPayroll,
  savePayroll,
  savePayrollSettings,
} from "@/db/payroll";
import { authorizeApi, safeApiError } from "@/app/api/auth";

export async function DELETE(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["payroll"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(
      await deletePayroll(body.employeeId, body.payrollMonth),
    );
  } catch (error) {
    return safeApiError(error, "ลบข้อมูลเงินเดือนไม่สำเร็จ");
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["payroll"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const params = new URL(request.url).searchParams;
    const isEmployee = authorization.access.user.role === "employee";
    if (params.get("config") === "1") {
      if (isEmployee)
        return Response.json({ error: "ไม่มีสิทธิ์ดูการตั้งค่าเงินเดือน" }, { status: 403 });
      return Response.json({ settings: await getPayrollSettings() });
    }
    if (params.get("summary") === "1") {
      if (isEmployee)
        return Response.json({ error: "ไม่มีสิทธิ์ดูข้อมูลเงินเดือนรวม" }, { status: 403 });
      return Response.json(await listMonthlyPayroll(params.get("month") ?? ""));
    }
    const employeeId = isEmployee
      ? authorization.access.user.employeeId ?? ""
      : params.get("employeeId") ?? "";
    if (!employeeId)
      return Response.json({ error: "ไม่พบพนักงานที่เชื่อมกับบัญชี" }, { status: 403 });
    return Response.json(
      await getPayrollData(
        employeeId,
        params.get("month") ?? "",
      ),
    );
  } catch (error) {
    return safeApiError(error, "โหลดข้อมูลเงินเดือนไม่สำเร็จ");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["payroll"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "save_settings")
      return Response.json({ settings: await savePayrollSettings(body) });
    if (body.action === "save_payroll")
      return Response.json(await savePayroll(body));
    throw new Error("ไม่รู้จักคำสั่งที่ส่งมา");
  } catch (error) {
    return safeApiError(error, "บันทึกข้อมูลเงินเดือนไม่สำเร็จ");
  }
}
