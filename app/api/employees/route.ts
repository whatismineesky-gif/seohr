import {
  createEmployee,
  listEmployees,
  nextEmployeeSequence,
  updateEmployee,
} from "@/db/employees";
import type { SeedEmployee } from "@/db/seed-employees";
import { requireApiUser } from "@/app/api/auth";

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
  if (!id) throw new Error("กรุณาระบุรหัสพนักงาน");
  if (!nickname) throw new Error("กรุณาระบุชื่อเล่น");
  if (!team) throw new Error("กรุณาระบุทีม");

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
    status: asText(payload.status) || "ยังทำงานอยู่",
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
