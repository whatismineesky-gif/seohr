"use client";

import { FormEvent, useEffect, useState } from 'react';
import { ClipboardList, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const types = [{ value: 'new', label: 'เว็บใหม่' }, { value: '301', label: 'เว็บ 301' }, { value: '301_new', label: 'เว็บ 301 ขึ้นใหม่' }];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const selectClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm';
type Row = { id: number; keyword: string; website: string; date: string; parentWebsite: string; type: string };
type Data = { items: Row[]; total: number; pageSize: number; teams: { value: string; label: string }[]; currentUser: { name: string; team: string } };

export function WorkSubmissionsPanel() {
  const [tab, setTab] = useState('create');
  const [form, setForm] = useState({ keyword: '', website: '', date: today(), parentWebsite: '', type: 'new' });
  const [scope, setScope] = useState('mine');
  const [team, setTeam] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const params = new URLSearchParams({ scope, page: String(page) });
        if (scope === 'team') params.set('team', team);
        const response = await fetch(`/api/work-submissions?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'โหลดรายการส่งงานไม่สำเร็จ');
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) { setData(null); setError(failure instanceof Error ? failure.message : 'โหลดรายการส่งงานไม่สำเร็จ'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [scope, team, page, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch('/api/work-submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'บันทึกการส่งงานไม่สำเร็จ');
      toast.success('บันทึกการส่งงานแล้ว');
      setForm(current => ({ ...current, keyword: '', website: '', parentWebsite: '' }));
      setScope('mine'); setPage(1); setRefresh(current => current + 1); setTab('list');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'บันทึกการส่งงานไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 100));
  return <Tabs value={tab} onValueChange={setTab}>
    <TabsList><TabsTrigger value="create"><Save /> บันทึกส่งงาน</TabsTrigger><TabsTrigger value="list"><ClipboardList /> ข้อมูลการส่งงาน</TabsTrigger></TabsList>
    <TabsContent value="create">
      <section className="panel">
        <div className="panel-heading mb-5"><div><p className="section-kicker">NEW WORK SUBMISSION</p><h2>บันทึกส่งงานใหม่</h2>
          <p className="mt-2 text-sm text-muted-foreground">ผู้ส่ง: {data?.currentUser.name ?? 'บัญชีที่ล็อกอิน'} · {data?.currentUser.team || 'ยังไม่ระบุทีม'}</p>
        </div></div>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">คีย์<Input required maxLength={250} value={form.keyword} disabled={saving} onChange={e => setForm({ ...form, keyword: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-medium">เว็บ<Input required maxLength={500} placeholder="example.com" value={form.website} disabled={saving} onChange={e => setForm({ ...form, website: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-medium">วันที่<Input required type="date" min="1900-01-01" value={form.date} disabled={saving} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-medium">เว็บแม่<Input required maxLength={500} placeholder="parent.com" value={form.parentWebsite} disabled={saving} onChange={e => setForm({ ...form, parentWebsite: e.target.value })} /></label>
          <label className="grid gap-2 text-sm font-medium">ประเภท<select className={selectClass} value={form.type} disabled={saving} onChange={e => setForm({ ...form, type: e.target.value })}>{types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <div className="flex items-end"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึกส่งงาน</Button></div>
        </form>
      </section>
    </TabsContent>
    <TabsContent value="list">
      <section className="panel min-w-0">
        <div className="panel-heading mb-4 flex-wrap"><div><p className="section-kicker">WORK SUBMISSIONS</p><h2>ข้อมูลการส่งงาน</h2></div><Button variant="outline" disabled={loading} onClick={() => setRefresh(current => current + 1)}>รีเฟรช</Button></div>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="grid min-w-40 gap-2 text-sm">ตัวกรอง<select className={selectClass} value={scope} onChange={e => {
            const next = e.target.value; setScope(next); setPage(1);
            if (next === 'team' && !team) setTeam(data?.currentUser.team || data?.teams[0]?.value || '__unassigned__');
          }}><option value="mine">ของฉัน</option><option value="team">รายทีม</option><option value="all">ทั้งหมด</option></select></label>
          {scope === 'team' && <label className="grid min-w-40 gap-2 text-sm">ทีม<select className={selectClass} value={team} onChange={e => { setTeam(e.target.value); setPage(1); }}>
            {(data?.teams.length ? data.teams : [{ value: team, label: team === '__unassigned__' ? 'ยังไม่ระบุทีม' : team }]).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select></label>}
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error}</p>}
        <Table><TableHeader><TableRow><TableHead>คีย์</TableHead><TableHead>เว็บ</TableHead><TableHead>วันที่</TableHead><TableHead>เว็บแม่</TableHead><TableHead>ประเภท</TableHead></TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={5} className="py-10 text-center">กำลังโหลด...</TableCell></TableRow> : data?.items.length ? data.items.map(row => <TableRow key={row.id}>
            <TableCell className="max-w-72 whitespace-normal break-words">{row.keyword}</TableCell><TableCell className="max-w-72 whitespace-normal break-all">{row.website}</TableCell>
            <TableCell>{new Date(`${row.date}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</TableCell><TableCell className="max-w-72 whitespace-normal break-all">{row.parentWebsite}</TableCell>
            <TableCell>{types.find(type => type.value === row.type)?.label ?? row.type}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{error ? 'ไม่สามารถโหลดรายการได้' : 'ยังไม่มีข้อมูลการส่งงานตามตัวกรองนี้'}</TableCell></TableRow>}</TableBody>
        </Table>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{data?.total ?? 0} รายการ · หน้าละ 100 รายการ</span>
          <div className="flex items-center gap-3"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>ก่อนหน้า</Button><span>หน้า {page} / {pages}</span><Button variant="outline" disabled={loading || page >= pages} onClick={() => setPage(current => current + 1)}>ถัดไป</Button></div>
        </div>
      </section>
    </TabsContent>
  </Tabs>;
}
