import {
  deletePayroll,
  getPayrollData,
  getPayrollSettings,
  listMonthlyPayroll,
  savePayroll,
  savePayrollSettings,
} from "@/db/payroll";
import { requireApiUser } from "@/app/api/auth";

function fail(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ" },
    { status: 400 },
  );
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(
      await deletePayroll(body.employeeId, body.payrollMonth),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("config") === "1")
      return Response.json({ settings: await getPayrollSettings() });
    if (params.get("summary") === "1")
      return Response.json(await listMonthlyPayroll(params.get("month") ?? ""));
    return Response.json(
      await getPayrollData(
        params.get("employeeId") ?? "",
        params.get("month") ?? "",
      ),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "save_settings")
      return Response.json({ settings: await savePayrollSettings(body) });
    if (body.action === "save_payroll")
      return Response.json(await savePayroll(body));
    throw new Error("ไม่รู้จักคำสั่งที่ส่งมา");
  } catch (error) {
    return fail(error);
  }
}
