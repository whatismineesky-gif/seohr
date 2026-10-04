import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getSystemAnnouncements, saveSystemAnnouncement } from '@/db/system-announcements';
export async function GET(request: Request) {
 const manage=new URL(request.url).searchParams.get('manage')==='1';
 const auth=await authorizeApi(request,manage?{roles:['hr']}:{});if(!auth.ok)return auth.response;
 try{return Response.json(await getSystemAnnouncements(auth.access.user,manage),{headers:{'cache-control':'no-store'}});}catch(error){return safeApiError(error,'โหลดประกาศไม่สำเร็จ');}
}
export async function POST(request: Request) {
 const auth=await authorizeApi(request,{roles:['hr']});if(!auth.ok)return auth.response;
 try{return Response.json(await saveSystemAnnouncement(auth.access.user,await request.json()));}catch(error){return safeApiError(error,'บันทึกประกาศไม่สำเร็จ');}
}
