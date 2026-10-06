import { authorizeApi, safeApiError } from '@/app/api/auth';
import { getCheckinMonthlySummary } from '@/db/checkin-summary';
export async function GET(request:Request) {
  const auth=await authorizeApi(request,{roles:['hr'],anyPermissions:['checkin']});
  if(!auth.ok)return auth.response;
  try {
    const params=new URL(request.url).searchParams;
    const report=await getCheckinMonthlySummary(auth.access.user,params.get('month')??'');
    if(params.get('export')==='xlsx') {
      const XLSX=await import('xlsx');
      const rows=[['เดือน',report.month,'ข้อมูลถึง',report.throughDate],['นับวันตามสถานะลงเวลา: วันทำงาน = วันปฏิทินในช่วงทำงาน − วันขาด/หยุด; ลาประชุม สาย ทรู แอดมินยังนับวันทำงาน'],['มาสายนับเฉพาะรายการที่บันทึกแล้ว ไม่รวมสถานะสายที่รอ HR ยืนยัน; สถานะเดียวกันในวันเดียวกันนับครั้งเดียว'],[],['ทีม','รหัสพนักงาน','ชื่อ','วันในช่วงทำงาน','ขาด / หยุด (วัน)','ลาประชุม (วัน)','มาสาย (วัน)','ทรู (วัน)','แอดมิน (วัน)','วันทำงาน'],...report.rows.map(row=>[row.team,row.employeeId,row.nickname,row.calendarDays,row.absence,row.meetingLeave,row.late,row.trueDays,row.adminDays,row.workingDays])];
      const sheet=XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols']=[{wch:16},{wch:18},{wch:24},...Array.from({length:7},()=>({wch:20}))];
      sheet['!merges']=[{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:9}}];
      sheet['!autofilter']={ref:`A5:J${Math.max(5,5+report.rows.length)}`};
      const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'สรุปรายเดือน');
      return new Response(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="attendance-summary-${report.month}.xlsx"`,'cache-control':'no-store'}});
    }
    return Response.json(report,{headers:{'cache-control':'no-store'}});
  }catch(error){return safeApiError(error,'โหลดรายงานสรุปไม่สำเร็จ');}
}
