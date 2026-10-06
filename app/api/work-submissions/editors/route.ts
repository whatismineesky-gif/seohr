import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getWorkSubmissionEditorConfig, saveWorkSubmissionEditorConfig } from '@/db/work-submissions';
export async function GET(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'], roles: ['hr'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await getWorkSubmissionEditorConfig(auth.access.user), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return safeApiError(error, 'โหลดสิทธิ์ไม่สำเร็จ'); }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'], roles: ['hr'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await saveWorkSubmissionEditorConfig(auth.access.user, await request.json())); }
  catch (error) { return safeApiError(error, 'บันทึกสิทธิ์ไม่สำเร็จ'); }
}
