"use client";
import { FormEvent, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Key = { id: number; name: string; prefix: string; scope: string; team: string; expiresAt: string | null; createdBy: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null };
type Data = { keys: Key[]; teams: { value: string; label: string }[] };
const dateTime = (date: string | null) => date ? new Date(date).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}) : '—';
const defaultExpiry = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+90*86400000));
const example = 'GET /api/integrations/work-submissions?date=2026-10-03&page=1\nAuthorization: Bearer YOUR_API_KEY';
export function WorkSubmissionApiPanel({ currentTeam }: { currentTeam: string }) {
  const [data,setData] = useState<Data | null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
  const [clock,setClock] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const [name,setName] = useState('');
  const [scope,setScope] = useState('team');
  const [team,setTeam] = useState('');
  const [expiresOn,setExpiresOn] = useState(defaultExpiry);
  const [saving,setSaving] = useState(false);
  const [created,setCreated] = useState<{ token: string; name: string } | null>(null);
  const [revokeTarget,setRevokeTarget] = useState<Key | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);setError('');
      try {
        const response = await fetch('/api/integration-keys',{cache:'no-store',signal:controller.signal});
        const result = await response.json() as Data & { error?: string };
        if (!response.ok) throw new Error(result.error || 'โหลด API Key ไม่สำเร็จ');
        if (!controller.signal.aborted) { setData(result);setTeam(value => value || result.teams.find(option => option.value===currentTeam)?.value || result.teams[0]?.value || ''); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'โหลด API Key ไม่สำเร็จ'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  },[refresh,currentTeam]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(saving)return;setSaving(true);
    try {
      const response = await fetch('/api/integration-keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',name,scope,team,expiresOn})});
      const result = await response.json() as {token:string;name:string;error?:string};
      if (!response.ok) throw new Error(result.error || 'สร้าง API Key ไม่สำเร็จ');
      setCreated({token:result.token,name:result.name});setName('');setRefresh(value=>value+1);toast.success('สร้าง API Key แล้ว');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'สร้าง API Key ไม่สำเร็จ'); }
    finally {setSaving(false);}
  }
  async function revoke() {
    if (!revokeTarget || saving) return;setSaving(true);
    try {
      const response = await fetch('/api/integration-keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'revoke',id:revokeTarget.id})});
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error || 'ปิดใช้งาน API Key ไม่สำเร็จ');
      setRevokeTarget(null);setRefresh(value=>value+1);toast.success('ปิดใช้งาน API Key แล้ว');
    } catch (failure) {toast.error(failure instanceof Error ? failure.message : 'ปิดใช้งาน API Key ไม่สำเร็จ');}
    finally {setSaving(false);}
  }
  return <div className="space-y-5">
    <section className="panel"><div className="panel-heading"><div><p className="section-kicker">INTEGRATION API</p><h2>เชื่อมข้อมูลส่งงานกับระบบอื่น</h2></div><KeyRound className="size-5 text-indigo-600"/></div><p className="mb-5 text-sm text-muted-foreground">สำหรับ HR · อ่านข้อมูลส่งงานเท่านั้น · จำกัด 60 คำขอต่อนาทีต่อ Key · สร้าง Key แยกสำหรับแต่ละระบบ</p>
      <form onSubmit={create} className="space-y-4"><fieldset disabled={saving || loading || Boolean(error)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="grid gap-2 text-sm font-medium">ชื่อระบบ<Input required maxLength={80} placeholder="เช่น ระบบรายงาน SEO" value={name} onChange={event=>setName(event.target.value)}/></label><label className="grid gap-2 text-sm font-medium">สิทธิ์อ่านข้อมูล<select aria-label="สิทธิ์อ่านข้อมูล API" value={scope} onChange={event=>setScope(event.target.value)} className="h-10 rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 text-indigo-950 shadow-sm"><option value="team">เฉพาะทีม</option><option value="all">ทั้งหมด</option></select></label><label className="grid gap-2 text-sm font-medium">ทีม<select aria-label="ทีมสำหรับ API" required={scope==='team'} disabled={scope!=='team'} value={team} onChange={event=>setTeam(event.target.value)} className="h-10 rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 text-indigo-950 shadow-sm disabled:opacity-50">{!data?.teams.length && <option value="">ยังไม่มีทีม</option>}{data?.teams.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="grid gap-2 text-sm font-medium">ใช้ได้ถึงวันที่ (เวลาไทย)<Input type="date" value={expiresOn} onChange={event=>setExpiresOn(event.target.value)}/></label></fieldset><p className="text-xs text-muted-foreground">เว้นวันหมดอายุไว้เพื่อใช้จนกว่าจะปิด Key · {scope==='all' ? 'ระบบที่ได้ Key นี้จะอ่านงานทุกทีมได้' : `ระบบที่ได้ Key นี้จะอ่านงานเฉพาะ ${data?.teams.find(option=>option.value===team)?.label || 'ทีมที่เลือก'}`}</p><Button disabled={saving || loading || Boolean(error) || scope==='team' && !team} type="submit">{saving ? <Loader2 className="animate-spin"/> : <KeyRound/>} สร้าง API Key</Button></form>
    </section>
    <section className="panel"><div className="panel-heading"><h2>API Key ที่สร้างไว้</h2><Button variant="outline" size="sm" onClick={()=>setRefresh(value=>value+1)} disabled={loading || saving}><RefreshCw/> รีเฟรช</Button></div>{error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}<Table><TableHeader><TableRow><TableHead>ระบบ / Key</TableHead><TableHead>สิทธิ์</TableHead><TableHead>สถานะ</TableHead><TableHead>วันหมดอายุ</TableHead><TableHead>ใช้งานล่าสุด</TableHead><TableHead>ผู้สร้าง</TableHead><TableHead>จัดการ</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={7} className="py-8 text-center">กำลังโหลด…</TableCell></TableRow> : data?.keys.length ? data.keys.map(key=><TableRow key={key.id}><TableCell><strong>{key.name}</strong><code className="mt-1 block text-xs text-muted-foreground">{key.prefix}…</code></TableCell><TableCell>{key.scope==='all' ? 'ทุกทีม' : key.team || 'ยังไม่ระบุทีม'}</TableCell><TableCell><span className={`rounded-full px-2 py-1 text-xs ${key.revokedAt ? 'bg-slate-100 text-slate-600' : key.expiresAt && Date.parse(key.expiresAt)<=clock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{key.revokedAt ? 'ปิดใช้งาน' : key.expiresAt && Date.parse(key.expiresAt)<=clock ? 'หมดอายุ' : 'ใช้งานได้'}</span></TableCell><TableCell>{key.expiresAt ? dateTime(key.expiresAt) : 'ไม่หมดอายุ'}</TableCell><TableCell>{dateTime(key.lastUsedAt)}</TableCell><TableCell><span className="text-xs">{key.createdBy}<br/>{dateTime(key.createdAt)}</span></TableCell><TableCell><Button size="sm" variant="outline" disabled={Boolean(key.revokedAt) || saving} onClick={()=>setRevokeTarget(key)}><ShieldOff/> ปิดใช้งาน</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{error ? 'ไม่สามารถโหลด API Key ได้' : 'ยังไม่มี API Key'}</TableCell></TableRow>}</TableBody></Table></section>
    <section className="panel space-y-4"><h2 className="font-semibold">คู่มือเรียก API</h2><ol className="list-decimal space-y-2 pl-5 text-sm"><li>สร้าง API Key แล้วเก็บไว้ที่เซิร์ฟเวอร์ของระบบที่จะดึงข้อมูล</li><li>เรียก GET ที่โดเมน People OS พร้อม Authorization: Bearer ตามตัวอย่าง</li><li>อ่าน items แล้วเรียก nextPage จน hasMore เป็น false ใช้ id อัปเดตข้อมูลเดิมเพื่อป้องกันซ้ำ</li></ol><pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{example}</pre><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ตัวกรอง</TableHead><TableHead>ความหมาย</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell><code>date</code></TableCell><TableCell>วันที่ในช่องวันที่ของงาน รูปแบบ YYYY-MM-DD</TableCell></TableRow><TableRow><TableCell><code>submittedDate</code></TableCell><TableCell>วันที่กดบันทึกจริงตามเวลาไทย รูปแบบ YYYY-MM-DD</TableCell></TableRow><TableRow><TableCell><code>team</code></TableCell><TableCell>เลือกทีมเพิ่มเติมได้ภายในสิทธิ์ Key ใช้ __unassigned__ สำหรับยังไม่ระบุทีม</TableCell></TableRow><TableRow><TableCell><code>page</code></TableCell><TableCell>เริ่มที่ 1 หน้าละ 100 รายการ</TableCell></TableRow></TableBody></Table></div><p className="text-sm text-muted-foreground">ต้องระบุ date หรือ submittedDate อย่างน้อยหนึ่งค่า ถ้าระบุทั้งคู่ งานต้องตรงทั้งสองวันที่ · อ่านย้อนหลังได้หลัง 10 โมง · ข้อมูลคืนเป็น JSON พร้อมทีม ชื่อ คีย์ เว็บ วันที่ เว็บแม่ ประเภท เวลาส่ง และเวลาแก้ไขล่าสุด</p><p className="text-xs text-muted-foreground">401 = Key ไม่ถูกต้อง/หมดอายุ/ปิดใช้งาน · 403 = เกินสิทธิ์ทีม · 400 = ตัวกรองไม่ถูกต้อง · 429 = เกิน 60 คำขอต่อนาที ให้รอตาม Retry-After · ดึงวันเดิมซ้ำเพื่ออัปเดตรายการที่แก้ไข</p></section>
    <Dialog open={Boolean(created)} onOpenChange={open=>{if(!open)setCreated(null);}}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>API Key สำหรับ {created?.name}</DialogTitle><DialogDescription>แสดง Key เต็มเพียงครั้งนี้ เก็บไว้ที่เซิร์ฟเวอร์ของระบบปลายทาง ก่อนปิดหน้าต่าง</DialogDescription></DialogHeader><code className="block select-all break-all rounded-lg bg-muted p-4 text-sm">{created?.token}</code><div className="flex justify-end gap-2"><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(created?.token || '');toast.success('คัดลอก API Key แล้ว');}catch{toast.error('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความ Key แล้วคัดลอก');}}}><Copy/> คัดลอก Key</Button><Button onClick={()=>setCreated(null)}>เก็บ Key แล้ว</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(revokeTarget)} onOpenChange={open=>{if(!open && !saving)setRevokeTarget(null);}}><DialogContent><DialogHeader><DialogTitle>ปิดใช้งาน API Key</DialogTitle><DialogDescription>ระบบ {revokeTarget?.name} จะดึงข้อมูลด้วย Key นี้ไม่ได้อีก หากต้องการเชื่อมใหม่ต้องสร้าง Key ใหม่</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={()=>setRevokeTarget(null)}>ยกเลิก</Button><Button variant="destructive" disabled={saving} onClick={()=>void revoke()}>{saving && <Loader2 className="animate-spin"/>} ปิดใช้งาน Key</Button></div></DialogContent></Dialog>
  </div>;
}
