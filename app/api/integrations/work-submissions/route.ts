import { authorizeIntegration, getIntegrationSubmissions, IntegrationError } from '@/db/work-submission-integrations';
export async function GET(request: Request) {
  const headers: Record<string,string> = { 'cache-control': 'no-store' };
  try {
    const key = await authorizeIntegration(request.headers.get('authorization'));
    return Response.json(await getIntegrationSubmissions(key,new URL(request.url).searchParams),{headers});
  } catch (error) {
    if (error instanceof IntegrationError) {
      if (error.status === 401) headers['www-authenticate'] = 'Bearer';
      if (error.retryAfter) headers['retry-after'] = String(error.retryAfter);
      return Response.json({error:error.message},{status:error.status,headers});
    }
    // Do not log requests or bearer tokens.
    return Response.json({error:'โหลดข้อมูลส่งงานไม่สำเร็จ'},{status:500,headers});
  }
}
function readOnlyResponse() {
  return Response.json({error:'API นี้รองรับการอ่านข้อมูลด้วย GET เท่านั้น'},{status:405,headers:{'cache-control':'no-store',allow:'GET'}});
}
export const POST = readOnlyResponse;
export const PUT = readOnlyResponse;
export const PATCH = readOnlyResponse;
export const DELETE = readOnlyResponse;
