import { authorizeApi, safeApiError } from "@/app/api/auth";
import { getMonthlyDashboard } from "@/db/dashboard";
export async function GET(request: Request) {
  const authorization = await authorizeApi(request, { roles: ["hr"], anyPermissions: ["dashboard"] });
  if (!authorization.ok) return authorization.response;
  try {
    return Response.json(await getMonthlyDashboard(authorization.access.user, authorization.access.permissions, new URL(request.url).searchParams.get("month") ?? ""), { headers: { "cache-control": "no-store" } });
  } catch (error) { return safeApiError(error, "โหลดภาพรวมรายเดือนไม่สำเร็จ"); }
}
