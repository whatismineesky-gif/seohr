import { authorizeApi, safeApiError } from '@/app/api/auth';
import { createWorkSubmission, exportWorkSubmissions, getWorkSubmissions } from '@/db/work-submissions';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'] });
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get('export') === 'csv') return new Response(await exportWorkSubmissions(auth.access.user, params), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="work-submissions.csv"', 'cache-control': 'no-store' },
    });
    return Response.json(await getWorkSubmissions(auth.access.user, params), { headers: { 'cache-control': 'no-store' } });
  }
  catch (error) { return safeApiError(error, 'โหลดรายการส่งงานไม่สำเร็จ'); }
}

export async function POST(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'] });
  if (!auth.ok) return auth.response;
  try { return Response.json(await createWorkSubmission(auth.access.user, await request.json()), { status: 201 }); }
  catch (error) { return safeApiError(error, 'บันทึกการส่งงานไม่สำเร็จ'); }
}
