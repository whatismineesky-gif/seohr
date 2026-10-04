'use client';
import { defaultBackfillDeadline } from '@/lib/work-submission-backfill-time';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableEmployeeSelect } from '@/components/searchable-employee-select';
type Grant = { id: number; startDate: string; endDate: string; scope: string; team: string; employeeId: string; employeeName: string; closesAt: string; reason: string; createdBy: string; createdAt: string; revokedAt: string | null; revokedBy: string };
type Config = { grants: Grant[]; employees: {id: string; nickname: string; team: string}[]; serverNow: string; clockOffsetMs: number };
const thaiToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatTime = (value: string) => new Date(value.includes('T') ? value : value.replace(' ','T')+'Z').toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
export function WorkSubmissionBackfillPanel({onChanged}:{onChanged:()=>void}) {
 const [config,setConfig]=useState<Config|null>(null), [error,setError]=useState(''), [saving,setSaving]=useState(false);
 const [startDate,setStartDate]=useState(()=>thaiToday().slice(0,7)+'-01');
 const [endDate,setEndDate]=useState(()=>thaiToday().slice(0,7)+'-02');
 const [closesAt,setClosesAt]=useState(()=>defaultBackfillDeadline());
 const [scope,setScope]=useState('all'),[team,setTeam]=useState(''),[employeeId,setEmployeeId]=useState('');
 const [reason,setReason]=useState('เติมข้อมูลการเริ่มใช้ระบบ');
 const load=useCallback(async()=>{try{const r=await fetch('/api/work-submissions/backfill',{cache:'no-store'});const result=await r.json() as Config & {error?: string};if(!r.ok)throw new Error(result.error || 'โหลดข้อมูลไม่สำเร็จ');setConfig({...result,clockOffsetMs:Date.parse(result.serverNow)-Date.now()});setError('');}catch(e){setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ');}},[]);
 useEffect(()=>{const task=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(task);},[load]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const deadline=Date.parse(closesAt+':00+07:00');if(!Number.isFinite(deadline)||deadline<=Date.now()+(config?.clockOffsetMs??0)){toast.error('กรุณาตั้งเวลาปิดรับให้เป็นเวลาในอนาคต');return;}await mutate({action:'create',startDate,endDate,closesAt,scope,team,employeeId,reason});}
 async function mutate(body:Record<string,unknown>){setSaving(true);try{const r=await fetch('/api/work-submissions/backfill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await r.json() as {error?: string};if(!r.ok)throw new Error(result.error || 'บันทึกไม่สำเร็จ');toast.success(body.action==='create'?'เปิดส่งงานย้อนหลังแล้ว':'ปิดช่วงส่งงานย้อนหลังแล้ว');await load();onChanged();}catch(e){toast.error(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setSaving(false);}}
 const teams=[...new Set(config?.employees.map(e=>e.team).filter(Boolean)??[])].sort((a,b)=>a.localeCompare(b,'th',{numeric:true}));
 return <section className="panel space-y-5"><div><p className="section-kicker">BACKFILL CONFIG</p><h2>เปิดส่งงานย้อนหลัง</h2><p className="mt-2 text-sm text-muted-foreground">เลือกวันที่ของงานที่ผ่านมาแล้ว ผู้ที่ส่งได้ และเวลาปิดรับตามเวลาไทย · เปิดให้เพิ่มและแก้ไขรายการของตัวเอง · ผลตรวจที่ยืนยันไว้แล้วต้องตรวจยืนยันใหม่เมื่อยอดเปลี่ยน</p></div>
 {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
 <form onSubmit={save} className="space-y-4"><fieldset disabled={saving||!config} className="grid gap-4 md:grid-cols-3">
 <label className="field-label">วันที่งานเริ่มต้น<Input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
 <label className="field-label">วันที่งานสิ้นสุด<Input type="date" required value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
 <label className="field-label">ปิดรับย้อนหลัง (เวลาไทย)<Input type="datetime-local" required value={closesAt} onChange={e=>setClosesAt(e.target.value)}/><span className="text-xs font-normal text-muted-foreground">ต้องตั้งหลังเวลาปัจจุบัน เช่น วันนี้ 22:00 น. หรือวันถัดไป</span></label>
 <label className="field-label">ผู้ที่ส่งย้อนหลังได้<select className="native-select" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">ทุกคน</option><option value="team">เฉพาะทีม</option><option value="employee">เฉพาะพนักงาน</option></select></label>
 {scope==='team'&&<label className="field-label">ทีม<select className="native-select" required value={team} onChange={e=>setTeam(e.target.value)}><option value="">เลือกทีม</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label>}
 {scope==='employee'&&<div className="field-label">พนักงาน<SearchableEmployeeSelect employees={config?.employees??[]} value={employeeId} onChange={setEmployeeId} disabled={saving}/></div>}
 <label className="field-label md:col-span-3">เหตุผลเปิดย้อนหลัง<Input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 </fieldset><Button disabled={saving||!config}>เปิดส่งงานย้อนหลัง</Button></form>
 <div className="flex items-center justify-between"><h3 className="font-semibold">ช่วงที่เปิดและประวัติ</h3><Button variant="outline" disabled={saving} onClick={()=>void load()}>รีเฟรช</Button></div>
 {!config?.grants.length&&<p className="text-sm text-muted-foreground">ยังไม่มีช่วงส่งงานย้อนหลัง</p>}
 {config?.grants.map(g=>{const expired=Date.parse(g.closesAt)<=Date.parse(config.serverNow);return <article key={g.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{g.startDate} ถึง {g.endDate} · {g.scope==='all'?'ทุกคน':g.scope==='team'?g.team:`${g.employeeId} · ${g.employeeName}`}</p><p className="mt-1 text-sm">ปิดรับ {formatTime(g.closesAt)} · {g.revokedAt?'HR ปิดแล้ว':expired?'หมดเวลา':'เปิดรับ'}</p><p className="mt-1 text-sm">เหตุผล: {g.reason}</p><p className="mt-2 text-xs text-muted-foreground">เปิดโดย {g.createdBy} · {formatTime(g.createdAt)}{g.revokedAt&&` · ปิดโดย ${g.revokedBy} · ${formatTime(g.revokedAt)}`}</p></div>{!g.revokedAt&&!expired&&<Button variant="outline" disabled={saving} onClick={()=>void mutate({action:'revoke',id:g.id})}>ปิดรับตอนนี้</Button>}</div></article>})}
 </section>;
}
