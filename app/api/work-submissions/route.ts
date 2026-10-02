import { authorizeApi, safeApiError } from '@/app/api/auth';
import { createWorkSubmission, exportWorkSubmissions, getWorkSubmissions, workSubmissionReport } from '@/db/work-submissions';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, { anyPermissions: ['submissions'] });
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get('export') === 'xlsx') {
      const rows = await workSubmissionReport(auth.access.user, params);
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 35 }, { wch: 14 }, { wch: 35 }, { wch: 22 }];
      sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:G1' };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'ข้อมูลการส่งงาน');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      return new Response(new Uint8Array(bytes), { headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="work-submissions.xlsx"', 'cache-control': 'no-store',
      } });
    }
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
