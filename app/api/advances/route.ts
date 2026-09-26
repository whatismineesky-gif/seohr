import {
  createAdvance,
  deleteAdvance,
  listAdvances,
  updateAdvance,
} from "@/db/payroll";
import { requireApiUser } from "@/app/api/auth";

function fail(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ" },
    { status: 400 },
  );
}

export async function PUT(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({
      advance: await updateAdvance(
        (await request.json()) as Record<string, unknown>,
      ),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(await deleteAdvance(body.id));
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const employeeId =
      new URL(request.url).searchParams.get("employeeId") ?? undefined;
    return Response.json({ advances: await listAdvances(employeeId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiUser(request);
  if (unauthorized) return unauthorized;
  try {
    const advance = await createAdvance(
      (await request.json()) as Record<string, unknown>,
    );
    return Response.json({ advance }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
