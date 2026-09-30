import {
  createEmployee,
  deleteEmployee,
  importEmployees,
  listEmployees,
  nextEmployeeSequence,
  updateEmployee,
  type EmployeeRecord,
} from "@/db/employees";
import type { SeedEmployee } from "@/db/seed-employees";
import { authorizeApi, safeApiError } from "@/app/api/auth";

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

function hideSensitiveEmployeeData(employee: EmployeeRecord): EmployeeRecord {
  return {
    ...employee,
    fullName: "",
    salary: null,
    bankAccount: "",
    bankName: "",
    accountName: "",
    aff: "",
    email: "",
    discordId: "",
    dynadot: "",
    referredBy: "",
  };
}

const employeeReadPermissions = [
  "dashboard",
  "employees",
  "members",
  "resignations",
  "advances",
  "payroll",
  "data",
] as const;

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: [...employeeReadPermissions],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const employees = await listEmployees();
    if (authorization.access.user.role === "hr")
      return Response.json({ employees });
    const visible =
      authorization.access.user.role === "employee"
        ? employees.filter(
            (employee) =>
              employee.id === authorization.access.user.employeeId,
          )
        : employees;
    return Response.json({
      employees: visible.map(hideSensitiveEmployeeData),
    });
  } catch (error) {
    return safeApiError(error, "โหลดข้อมูลพนักงานไม่สำเร็จ");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["employees", "data", "resignations"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
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
    return safeApiError(error, "บันทึกข้อมูลพนักงานไม่สำเร็จ");
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["employees", "data", "resignations"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const sequence = Number(payload.sequence ?? 0);
    const employee = parseEmployee(
      payload,
      Number.isFinite(sequence) ? sequence : 0,
    );
    return Response.json({ employee: await updateEmployee(employee) });
  } catch (error) {
    return safeApiError(error, "แก้ไขข้อมูลพนักงานไม่สำเร็จ");
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["employees", "resignations"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = asText(payload.id);
    if (!id) throw new Error("กรุณาระบุรหัสพนักงาน");
    return Response.json({ employee: await deleteEmployee(id) });
  } catch (error) {
    return safeApiError(error, "ลบข้อมูลพนักงานไม่สำเร็จ");
  }
}
