import {
  createAdvance,
  deleteAdvance,
  listAdvances,
  updateAdvance,
} from "@/db/payroll";
import { authorizeApi, safeApiError } from "@/app/api/auth";

export async function PUT(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["advances"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json({
      advance: await updateAdvance(
        (await request.json()) as Record<string, unknown>,
      ),
    });
  } catch (error) {
    return safeApiError(error, "แก้ไขรายการเบิกไม่สำเร็จ");
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["advances"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(await deleteAdvance(body.id));
  } catch (error) {
    return safeApiError(error, "ลบรายการเบิกไม่สำเร็จ");
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["advances"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const requestedEmployeeId =
      new URL(request.url).searchParams.get("employeeId") ?? undefined;
    const employeeId =
      authorization.access.user.role === "employee"
        ? authorization.access.user.employeeId ?? undefined
        : requestedEmployeeId;
    if (authorization.access.user.role === "employee" && !employeeId)
      return Response.json({ error: "บัญชียังไม่ได้เชื่อมกับพนักงาน" }, { status: 403 });
    return Response.json({ advances: await listAdvances(employeeId) });
  } catch (error) {
    return safeApiError(error, "โหลดรายการเบิกไม่สำเร็จ");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, {
    anyPermissions: ["advances"],
    roles: ["hr"],
  });
  if (!authorization.ok) return authorization.response;
  try {
    const advance = await createAdvance(
      (await request.json()) as Record<string, unknown>,
    );
    return Response.json({ advance }, { status: 201 });
  } catch (error) {
    return safeApiError(error, "บันทึกรายการเบิกไม่สำเร็จ");
  }
}
