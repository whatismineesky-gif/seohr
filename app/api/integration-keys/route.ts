import { authorizeApi, safeApiError } from '@/app/api/auth';
import { createIntegrationKey, listIntegrationKeys, revokeIntegrationKey, IntegrationError } from '@/db/work-submission-integrations';
const headers = { 'cache-control':'no-store' };
export async function GET(request: Request) {
  const auth = await authorizeApi(request,{anyPermissions:['submissions'],roles:['hr']});
  if (!auth.ok) return auth.response;
  try { return Response.json(await listIntegrationKeys(auth.access.user),{headers}); }
  catch (error) { return safeApiError(error,'โหลด API Key ไม่สำเร็จ'); }
}
export async function POST(request: Request) {
  const auth = await authorizeApi(request,{anyPermissions:['submissions'],roles:['hr']});
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json() as Record<string,unknown>;
    if (body?.action === 'create') return Response.json(await createIntegrationKey(auth.access.user,body),{status:201,headers});
    if (body?.action === 'revoke') return Response.json(await revokeIntegrationKey(auth.access.user,body.id),{headers});
    throw new IntegrationError(400,'คำสั่งไม่ถูกต้อง');
  } catch (error) {
    if (error instanceof IntegrationError) return Response.json({error:error.message},{status:error.status,headers});
    return safeApiError(error,'จัดการ API Key ไม่สำเร็จ');
  }
}
