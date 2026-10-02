import { authorizeApi, safeApiError } from '@/app/api/auth';
import { createWorkSubmission, getWorkSubmissions } from '@/db/work-submissions';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await getWorkSubmissions(auth.access.user, new URL(request.url).searchParams), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return safeApiError(error, 'โหลดรายการส่งงานไม่สำเร็จ'); }
}

export async function POST(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await createWorkSubmission(auth.access.user, await request.json()), { status: 201 }); }
  catch (error) { return safeApiError(error, 'บันทึกการส่งงานไม่สำเร็จ'); }
}
