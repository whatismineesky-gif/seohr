"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const statusOptions = [{value:'working',label:'ทำงาน (HR ยืนยัน)'},{value:'late',label:'มาสาย'},{value:'absence',label:'หยุดงาน'},{value:'meeting_leave',label:'ลาประชุม'},{value:'admin',label:'แอดมิน'},{value:'true',label:'ทรู'}];
const labels: Record<string,string> = { late:'สาย',exempt:'ลา / หยุด',working:'ทำงาน (HR ยืนยัน)',checked:'เช็คชื่อแล้ว',waiting:'ยังไม่เช็คชื่อ · ยังไม่เลยเวลา',disabled:'ยังไม่เช็คชื่อ · ระบบปิดอยู่' };
const today = () => new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const recordLabel = (type: string) => statusOptions.find(option=>option.value===type)?.label ?? type;
const time = (value:string|null) => value ? new Date(value).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}) : '—';
type Attendance = {id:number;type:string;reason:string;source:string;recorderEmail:string};
type Item = {employeeId:string;nickname:string;team:string;meetingAnswer:string;meetingStartedAt:string|null;meetingEndedAt:string|null;workEndedAt:string|null;status:string;records:Attendance[]};
type Data = {date:string;lateAfter:string;systemEnabled:boolean;items:Item[]};
const selectClass = 'h-10 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 text-sm text-indigo-950 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

export function CheckinReviewPanel() {
  const [date,setDate] = useState(today);
  const [data,setData] = useState<Data|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [filter,setFilter] = useState('all');
  const [search,setSearch] = useState('');
  const [answerTarget,setAnswerTarget] = useState<Item|null>(null);
  const [target,setTarget] = useState<Item|null>(null);
  const [recordId,setRecordId] = useState('');
  const [recordType,setRecordType] = useState('late');
  const [reason,setReason] = useState('');
  const [saving,setSaving] = useState(false);
  const savingRef = useRef(false);

  async function load(value:string) {
    setLoading(true);setError('');
    try {
      const response = await fetch(`/api/checkin/review?${new URLSearchParams({date:value})}`,{cache:'no-store'});
      const result = await response.json() as Data & {error?:string};
      if (!response.ok) throw new Error(result.error || 'โหลดข้อมูลเช็คชื่อไม่สำเร็จ');
      setData(result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'โหลดข้อมูลเช็คชื่อไม่สำเร็จ'); }
    finally {setLoading(false);}
  }
  useEffect(()=>{void load(today());},[]);

  function selectRecord(item:Item,id:string) {
    const record = item.records.find(record=>String(record.id)===id);
    setRecordId(id);setRecordType(record?.type ?? (item.status==='late'?'late':'working'));
    setReason(record?.reason ?? (item.status==='late'?(item.meetingStartedAt?'เช็คชื่อหลังเวลาที่กำหนด':'ไม่กดเช็คชื่อและไม่ได้ลงลาหรือหยุด'):'HR ยืนยันสถานะการเข้างาน'));
  }
  function open(item:Item) {
    setTarget(item);
    const existing = item.records.find(record=>record.source!=='work_audit' && record.type==='late') ?? item.records.find(record=>record.source!=='work_audit');
    selectRecord(item,existing ? String(existing.id) : '');
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !data || savingRef.current) return;
    savingRef.current=true;setSaving(true);
    try {
      const response = await fetch('/api/checkin/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({employeeId:target.employeeId,recordDate:data.date,recordType,reason,id:recordId ? Number(recordId) : 0})});
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error || 'บันทึกสถานะไม่สำเร็จ');
      toast.success('บันทึกสถานะและอัปเดตหน้าลงเวลาแล้ว');setTarget(null);
      await load(data.date);
    } catch (failure) {toast.error(failure instanceof Error ? failure.message : 'บันทึกสถานะไม่สำเร็จ');}
    finally {savingRef.current=false;setSaving(false);}
  }
  const items = data?.items.filter(item=>(filter==='all'||item.status===filter)&&`${item.nickname} ${item.employeeId} ${item.team}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <section className="panel min-w-0 space-y-5">
    <div><p className="section-kicker">HR DAILY CHECK-IN</p><h2>ตรวจเช็คชื่อและบันทึกสถานะ</h2></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">หลังเวลา {data?.lateAfter ?? 'ที่กำหนด'} น. ผู้ที่ไม่กดเช็คชื่อและไม่มีรายการลาประชุมหรือหยุดงานจะแสดงว่าสาย · ก่อนเลยเวลาจะแสดงรอเช็คชื่อ · การแสดงว่าสายยังไม่บันทึกรายการมาสายหรือรายการหักเงินจนกว่า HR จะกดบันทึก</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();void load(date);}}>
      <label className="grid gap-2 text-sm font-medium">วันที่<Input type="date" required min="1900-01-01" max={today()} value={date} onChange={event=>setDate(event.target.value)} /></label>
      <Button type="submit" disabled={loading}>{loading?<Loader2 className="animate-spin"/>:<Search/>} ค้นหา</Button>
    </form>
    {date!==data?.date && data && <p className="text-sm text-amber-700">กดค้นหาเพื่อดูข้อมูลของวันที่ที่เลือก</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">ข้อมูลวันที่ {data.date} · {data.items.length} คน · แสดงสาย {data.items.filter(item=>item.status==='late').length} คน</p>
      <div className="flex flex-wrap gap-3"><Input className="max-w-xs" aria-label="ค้นหาชื่อ รหัส หรือทีม" placeholder="ค้นหาชื่อ รหัส หรือทีม" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="กรองผลเช็คชื่อ" className={`${selectClass} max-w-xs`} value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">ทั้งหมด</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
      <Table><TableHeader><TableRow><TableHead>ชื่อ / รหัส</TableHead><TableHead>ทีม</TableHead><TableHead>เช็คชื่อ</TableHead><TableHead>เลิกประชุม</TableHead><TableHead>คำตอบ</TableHead><TableHead>เลิกงาน</TableHead><TableHead>ผลเช็คชื่อ</TableHead><TableHead>สถานะจากหน้าลงเวลา</TableHead><TableHead>จัดการ</TableHead></TableRow></TableHeader><TableBody>
        {items.map(item=><TableRow key={item.employeeId}><TableCell><strong>{item.nickname}</strong><p className="text-xs text-muted-foreground">{item.employeeId}</p></TableCell><TableCell>{item.team||'—'}</TableCell><TableCell>{time(item.meetingStartedAt)}</TableCell><TableCell>{time(item.meetingEndedAt)}</TableCell><TableCell>{item.meetingAnswer ? <button type="button" className="block w-64 truncate text-left text-sm hover:text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500" title={item.meetingAnswer} aria-label={`ดูคำตอบเต็มของ ${item.nickname}`} onClick={()=>setAnswerTarget(item)}>{item.meetingAnswer}</button> : '—'}</TableCell><TableCell>{time(item.workEndedAt)}</TableCell><TableCell><Badge className={item.status==='late'?'bg-rose-100 text-rose-700':item.status==='checked'||item.status==='working'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-700'}>{labels[item.status]??item.status}</Badge></TableCell><TableCell className="min-w-60 whitespace-normal">{item.records.length?item.records.map(record=><div key={record.id} className="mb-2"><span className="font-medium">{recordLabel(record.type)}{record.source==='work_audit'?' (ผลตรวจส่งงาน)':''}</span><p className="max-w-72 truncate text-xs text-muted-foreground" title={record.reason}>{record.reason}</p></div>):'ไม่มีรายการลงเวลา'}</TableCell><TableCell><Button variant="outline" size="sm" disabled={loading} onClick={()=>open(item)}><Pencil/> บันทึกสถานะ</Button></TableCell></TableRow>)}
        {!items.length && <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">ไม่พบข้อมูลตามเงื่อนไข</TableCell></TableRow>}
      </TableBody></Table>
    </>}
    <Dialog open={Boolean(answerTarget)} onOpenChange={open=>{if(!open)setAnswerTarget(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>คำตอบ {answerTarget?.nickname}</DialogTitle><DialogDescription>วันที่ {data?.date} · {answerTarget?.employeeId} · {answerTarget?.team || 'ไม่มีทีม'}</DialogDescription></DialogHeader><p className="whitespace-pre-wrap break-words text-sm">{answerTarget?.meetingAnswer}</p></DialogContent></Dialog>
    <Dialog open={Boolean(target)} onOpenChange={open=>{if(!open&&!saving)setTarget(null);}}><DialogContent><DialogHeader><DialogTitle>บันทึกสถานะ {target?.nickname}</DialogTitle><DialogDescription>วันที่ {data?.date} · ข้อมูลจะเชื่อมกับหน้าลงเวลา การแก้ไขรายการเดิมจะเก็บประวัติและคำนวณผลต่อเงินเดือนใหม่ การยืนยันทำงานโดย HR จะไม่สร้างเวลาเช็คชื่อแทนพนักงาน</DialogDescription></DialogHeader>
      {target && <form onSubmit={save} className="space-y-4"><fieldset disabled={saving} className="space-y-4"><label className="grid gap-2 text-sm font-medium">รายการลงเวลา<select className={selectClass} value={recordId} onChange={event=>selectRecord(target,event.target.value)}><option value="">เพิ่มรายการใหม่</option>{target.records.filter(record=>record.source!=='work_audit').map(record=><option key={record.id} value={record.id}>แก้ไข {recordLabel(record.type)}</option>)}</select></label><label className="grid gap-2 text-sm font-medium">สถานะ<select className={selectClass} required value={recordType} onChange={event=>setRecordType(event.target.value)}>{statusOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="grid gap-2 text-sm font-medium">เหตุผล<textarea required maxLength={2000} className="min-h-24 rounded-lg border border-slate-200 p-3 text-sm" value={reason} onChange={event=>setReason(event.target.value)}/></label></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={()=>setTarget(null)}>ยกเลิก</Button><Button type="submit" disabled={saving||!reason.trim()}>{saving?<Loader2 className="animate-spin"/>:<Save/>} บันทึก</Button></div></form>}
    </DialogContent></Dialog>
  </section>;
}
