import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getDailyCheckinReview, saveDailyCheckinReview } from '@/db/checkin';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, { roles: ['hr'], anyPermissions: ['checkin'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await getDailyCheckinReview(auth.access.user, new URL(request.url).searchParams.get('date')), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return safeApiError(error, 'โหลดข้อมูลตรวจเช็คชื่อไม่สำเร็จ'); }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request, { roles: ['hr'], anyPermissions: ['checkin'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await saveDailyCheckinReview(auth.access.user, await request.json()), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return safeApiError(error, 'บันทึกสถานะเช็คชื่อไม่สำเร็จ'); }
}
