import {
  createEmployee,
  deleteEmployee,
  importEmployees,
  listEmployees,
  nextEmployeeSequence,
  updateEmployee,
} from "@/db/employees";
import type { SeedEmployee } from "@/db/seed-employees";
import { requireApiUser } from "@/app/api/auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureAttendanceSetup } from "@/db/attendance";

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asSalary(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function parseEmployee(
  payload: Record<string, unknown>,
  sequence: number,
): SeedEmployee {
  const id = asText(payload.id);
  const nickname = asText(payload.nickname);
  const team = asText(payload.team);
  const rawStatus = asText(payload.status) || "ยังทำงานอยู่";
  const status =
    rawStatus === "รอคัดชื่อออก"
      ? "กำลังรอคัดชื่อออก"
      : rawStatus === "ลาออกแล้ว"
        ? "ลาออก"
        : rawStatus;
  const allowedStatuses = new Set([
    "ยังทำงานอยู่",
    "แจ้งลาออก",
    "กำลังรอคัดชื่อออก",
    "ลาออก",
  ]);
  if (!id) throw new Error("กรุณาระบุรหัสพนักงาน");
  if (!nickname) throw new Error("กรุณาระบุชื่อเล่น");
  if (!team) throw new Error("กรุณาระบุทีม");
  if (!allowedStatuses.has(status))
    throw new Error(`สถานะพนักงานไม่ถูกต้อง: ${status}`);

  return {
    id,
    sequence,
    nickname,
    team,
    position: asText(payload.position) || "Staff",
    employment: asText(payload.employment) || "FullTime",
    fullName: asText(payload.fullName),
    salary: asSalary(payload.salary),
    bankAccount: asText(payload.bankAccount).replace(/\D/g, ""),
    bankName: asText(payload.bankName),
    accountName: asText(payload.accountName),
    startDate: asText(payload.startDate),
    endDate: asText(payload.endDate),
    aff: asText(payload.aff),
    email: asText(payload.email),
    discordId: asText(payload.discordId),
    dynadot: asText(payload.dynadot),
    referredBy: asText(payload.referredBy),
    probation: asText(payload.probation) || "ยังไม่ผ่าน",
    status,
  };
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
  const duplicate = message.includes("UNIQUE constraint failed");
  return Response.json(
    { error: duplicate ? "รหัสพนักงานนี้มีอยู่แล้ว" : message },
    { status: duplicate ? 409 : 500 },
  );
}

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ employees: await listEmployees() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.action === "bulk_import") {
      const rows = Array.isArray(payload.employees) ? payload.employees : [];
      if (!rows.length) throw new Error("ไม่พบข้อมูลพนักงานสำหรับนำเข้า");
      if (rows.length > 500)
        throw new Error("นำเข้าได้สูงสุดครั้งละ 500 รายการ");
      const employees = rows.map((row, index) =>
        parseEmployee(row as Record<string, unknown>, index + 1),
      );
      return Response.json(await importEmployees(employees));
    }
    const employee = parseEmployee(payload, await nextEmployeeSequence());
    return Response.json(
      { employee: await createEmployee(employee) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const sequence = Number(payload.sequence ?? 0);
    const employee = parseEmployee(
      payload,
      Number.isFinite(sequence) ? sequence : 0,
    );
    return Response.json({ employee: await updateEmployee(employee) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const authenticated = await getChatGPTUser();
    if (authenticated) {
      const user = await ensureAttendanceSetup({
        userId: authenticated.userId,
        email: authenticated.email,
        displayName: authenticated.displayName,
      });
      if (user.role !== "hr")
        return Response.json(
          { error: "เฉพาะ HR เท่านั้นที่ลบข้อมูลพนักงานได้" },
          { status: 403 },
        );
    }
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asText(payload.id);
    if (!id) throw new Error("กรุณาระบุรหัสพนักงาน");
    return Response.json({ employee: await deleteEmployee(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
