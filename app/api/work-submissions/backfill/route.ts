import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getWorkSubmissionBackfillConfig, saveWorkSubmissionBackfill } from '@/db/work-submissions';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'], roles: ['hr'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await getWorkSubmissionBackfillConfig(auth.access.user), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return safeApiError(error, 'โหลดช่วงส่งงานย้อนหลังไม่สำเร็จ'); }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'], roles: ['hr'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await saveWorkSubmissionBackfill(auth.access.user, await request.json())); }
  catch (error) { return safeApiError(error, 'บันทึกช่วงส่งงานย้อนหลังไม่สำเร็จ'); }
}
