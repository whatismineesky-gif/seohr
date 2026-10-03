'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
type Notice = { id: number; kind: string; action: string; actor: string; eventDate: string; details: Record<string, string | number | null>; createdAt: string; read: boolean };
type Inbox = { items: Notice[]; unreadCount: number; hasMore: boolean };
const labels: Record<string, string> = { absence:'หยุดงาน', meeting_leave:'ลาประชุม', late:'มาสาย', admin:'แอดมิน', true:'ทรู', working:'ทำงาน', remaining:'ตามรายการลงเวลาที่เหลือ', complete:'ส่งครบ', incomplete:'ส่งไม่ครบ', none:'ไม่ส่งงาน' };
function status(value: unknown) { return value == null ? 'ยังไม่มีข้อมูล' : labels[String(value)] ?? String(value); }
function target(value: unknown) { return value == null ? 'ใช้ค่ากลาง' : `${value} เว็บ/วัน`; }
function date(value: string) { return new Date(value.includes(' ') ? value.replace(' ','T')+'Z' : value+'T00:00:00Z').toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium', ...(value.includes(' ') ? {timeStyle:'short' as const} : {})}); }
function describe(item: Notice) {
  const d=item.details;
  if(item.kind==='attendance_retro')return `${item.action==='delete' ? 'ลบ' : 'แก้ไข'}ลงเวลาย้อนหลัง: ${status(d.oldStatus)} → ${status(d.newStatus)}${d.oldDate!==d.newDate && item.action!=='delete' ? ` · วันที่ ${d.oldDate} → ${d.newDate}` : ''}`;
  if(item.kind==='work_submission')return `คุณได้ทำการส่งงานแล้ว จำนวน ${d.count} เว็บ`;
  if(item.kind==='employee_target')return `เป้าหมายส่วนตัว: ${target(d.oldTarget)} → ${target(d.newTarget)}`;
  if(item.kind==='work_review')return `ผลตรวจส่งงาน: ${status(d.oldStatus)} → ${status(d.newStatus)} · จำนวน ${d.oldCount ?? '—'} → ${d.newCount} · เป้าหมาย ${d.oldTarget ?? '—'} → ${d.newTarget ?? '—'}`;
  if(item.action==='create')return `เพิ่มสถานะ ${status(d.newStatus)}`;
  if(item.action==='delete')return `ลบสถานะ ${status(d.oldStatus)}`;
  return `แก้ไขสถานะ: ${status(d.oldStatus)} → ${status(d.newStatus)}${d.oldDate!==d.newDate ? ` · วันที่ ${d.oldDate} → ${d.newDate}` : ''}`;
}
export function NotificationBell({onOpenRecord,canOpenRecord}:{onOpenRecord:()=>void;canOpenRecord:boolean}) {
  const [open,setOpen]=useState(false),[inbox,setInbox]=useState<Inbox>({items:[],unreadCount:0,hasMore:false}),[loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async(before=0)=>{
    setLoading(true);
    try {const response=await fetch(`/api/notifications${before ? `?before=${before}` : ''}`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'โหลดแจ้งเตือนไม่สำเร็จ');setInbox(current=>({...result,items:before ? [...current.items,...result.items] : result.items}));setError('');}
    catch(e){setError(e instanceof Error?e.message:'โหลดแจ้งเตือนไม่สำเร็จ');}finally{setLoading(false);}
  },[]);
  useEffect(()=>{const initial=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>{if(!document.hidden&&!open)void load();},30000);const refresh=()=>{if(!document.hidden&&!open)void load();};const submitted=()=>void load();window.addEventListener('focus',refresh);window.addEventListener('work-submitted',submitted);return()=>{window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('work-submitted',submitted);};},[load,open]);
  async function mark(id?:number){try{const response=await fetch('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(id?{action:'read',id}:{action:'read_all'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'บันทึกการอ่านไม่สำเร็จ');setInbox(result);return true;}catch(e){toast.error(e instanceof Error?e.message:'บันทึกการอ่านไม่สำเร็จ');return false;}}
  return <><Button variant="ghost" size="icon" className="relative" aria-label={`แจ้งเตือน ${inbox.unreadCount} รายการที่ยังไม่อ่าน`} onClick={()=>setOpen(true)}><Bell/>{inbox.unreadCount>0&&<span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-xs text-white">{inbox.unreadCount>99?'99+':inbox.unreadCount}</span>}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>แจ้งเตือนของฉัน</DialogTitle><DialogDescription>การเปลี่ยนแปลงข้อมูลและยืนยันการส่งงาน · ยังไม่อ่าน {inbox.unreadCount} รายการ</DialogDescription></DialogHeader>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>รีเฟรช</Button><Button size="sm" disabled={!inbox.unreadCount||loading} onClick={()=>void mark()}>อ่านทั้งหมด</Button></div>
      {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}{loading&&<Loader2 className="animate-spin"/>}
      {!loading&&!inbox.items.length&&!error&&<p className="py-8 text-center text-muted-foreground">ยังไม่มีแจ้งเตือน</p>}
      {inbox.items.map(item=><article key={item.id} className={`rounded-lg border p-4 ${item.read?'bg-white':'border-indigo-200 bg-indigo-50'}`}><p className="font-medium">{describe(item)}</p>{item.kind==='attendance_retro'&&<p className="mt-1 text-sm font-medium text-indigo-700">{item.details.employeeName || '—'} · รหัส {item.details.employeeId || '—'} · {item.details.team || 'ยังไม่ระบุทีม'}</p>}<p className="mt-1 text-sm">ข้อมูลวันที่ {date(item.eventDate)}</p>{['attendance_change','attendance_retro'].includes(item.kind)&&item.action==='edit'&&item.details.oldReason!==item.details.newReason&&<p className="mt-1 whitespace-pre-wrap text-sm">เหตุผลเดิม: {item.details.oldReason || '—'}</p>}{item.details.reason&&<p className="mt-1 whitespace-pre-wrap text-sm">เหตุผล: {item.details.reason}</p>}<p className="mt-2 text-xs text-muted-foreground">โดย {item.actor} · {date(item.createdAt)} · {item.read?'อ่านแล้ว':'ยังไม่อ่าน'}</p><div className="mt-3 flex gap-2">{!item.read&&<Button size="sm" variant="outline" onClick={()=>void mark(item.id)}>ทำเครื่องหมายว่าอ่านแล้ว</Button>}{canOpenRecord&&item.kind!=='work_submission'&&<Button size="sm" variant="ghost" onClick={async()=>{if(await mark(item.id)){setOpen(false);onOpenRecord();}}}>เปิดหน้าลงเวลา</Button>}</div></article>)}
      {inbox.hasMore&&<Button variant="outline" disabled={loading} onClick={()=>void load(inbox.items.at(-1)?.id)}>ดูประวัติเพิ่มเติม</Button>}
    </DialogContent></Dialog></>;
}
