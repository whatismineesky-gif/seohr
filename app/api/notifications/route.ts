import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getNotifications, readNotifications } from '@/db/notifications';
export async function GET(request: Request) {
  const auth = await authorizeApi(request);
  if (!auth.ok) return auth.response;
  try {
    const before = Number(new URL(request.url).searchParams.get('before') ?? 0);
    if (!Number.isSafeInteger(before) || before < 0) throw new Error('หน้าประวัติไม่ถูกต้อง');
    return Response.json(await getNotifications(auth.access.user, before), { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return safeApiError(error, 'โหลดแจ้งเตือนไม่สำเร็จ'); }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request);
  if (!auth.ok) return auth.response;
  try { return Response.json(await readNotifications(auth.access.user, await request.json())); }
  catch (error) { return safeApiError(error, 'บันทึกการอ่านไม่สำเร็จ'); }
}
