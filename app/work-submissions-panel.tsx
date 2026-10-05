"use client";

import { defaultSubmissionDate, workSubmissionWindow } from '@/lib/work-submission-window';

import { WorkSubmissionBackfillPanel } from "./work-submission-backfill-panel";

import { WorkSubmissionApiPanel } from "./work-submission-api-panel";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ClipboardList, KeyRound, Download, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const types = [{ value: 'new', label: 'เว็บใหม่' }, { value: '301', label: 'เว็บ 301' }, { value: '301_new', label: 'เว็บ 301 ขึ้นใหม่' }];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const newEntry = (rowId: string) => ({ rowId, keyword: '', website: '', date: defaultSubmissionDate(), parentWebsite: '', type: '' });
type Entry = ReturnType<typeof newEntry>;
type Row = { id: number; submittedAt: string; isBackfill: boolean; employeeId: string; authorName: string; team: string; keyword: string; website: string; date: string; parentWebsite: string; type: string; canEdit: boolean };
type Data = { backfillGrants: { id: number; startDate: string; endDate: string; closesAt: string }[]; items: Row[]; total: number; pageSize: number; teams: { value: string; label: string }[]; currentUser: { name: string; team: string; role: string }; clockOffsetMs: number; window: { canSubmit: boolean; closesAt: string; serverNow: string } };

function Dropdown({ id, label, value, options, disabled, required = false, onChange }: { id: string; label: string; value: string; options: { value: string; label: string }[]; disabled?: boolean; required?: boolean; onChange: (value: string) => void }) {
  return <div className="grid gap-2 text-sm font-medium"><label htmlFor={id}>{label}</label>
    <Select value={value} onValueChange={onChange} disabled={disabled} required={required} name={id}>
      <SelectTrigger id={id} aria-label={label} className="h-10! w-full rounded-lg border-indigo-200 bg-indigo-50/40 font-medium text-indigo-950 shadow-sm hover:border-indigo-400 hover:bg-indigo-50"><SelectValue placeholder="กรุณาเลือกประเภท" /></SelectTrigger>
      <SelectContent position="popper" className="rounded-xl border-indigo-100 bg-white p-1 shadow-xl">{options.map(option => <SelectItem key={option.value} value={option.value} className="rounded-lg px-3 py-2.5 focus:bg-indigo-50 focus:text-indigo-900">{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function WorkSubmissionsPanel() {
  const [tab, setTab] = useState('create');
  const [entries, setEntries] = useState<Entry[]>([newEntry('1')]);
  const nextId = useRef(2);
  const [scope, setScope] = useState('mine');
  const [team, setTeam] = useState('');
  const [page, setPage] = useState(1);
  const [reportDate, setReportDate] = useState(today);
  const [search, setSearch] = useState(() => ({ scope: 'mine', team: '', reportDate: today() }));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(0);
  const [editTarget, setEditTarget] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const params = new URLSearchParams({ scope: search.scope, page: String(page) });
        if (search.scope === 'team') params.set('team', search.team);
        if (search.reportDate) params.set('date', search.reportDate);
        const response = await fetch(`/api/work-submissions?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as Data & {error?:string};
        if (!response.ok) throw new Error(result.error || 'โหลดรายการส่งงานไม่สำเร็จ');
        if (!controller.signal.aborted) { setNow(Date.now()); setData({ ...result, clockOffsetMs: Date.parse(result.window.serverNow) - Date.now() }); }
      } catch (failure) {
        if (!controller.signal.aborted) { setData(null); setError(failure instanceof Error ? failure.message : 'โหลดรายการส่งงานไม่สำเร็จ'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [search, page, refresh]);

  function searchReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch({ scope, team, reportDate });
    setPage(1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || saving) return;
    const invalid = entries.findIndex(entry => !entry.keyword.trim() || !entry.website.trim() || !entry.date.trim() || !entry.parentWebsite.trim() || !types.some(type=>type.value===entry.type));
    if (invalid >= 0) { toast.error(`กรุณากรอกทุกช่องและเลือกประเภทในรายการที่ ${invalid + 1}`); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/work-submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: entries }) });
      const result = await response.json() as {error?:string;count?:number};
      if (!response.ok) throw new Error(result.error || 'บันทึกการส่งงานไม่สำเร็จ');
      toast.success(`คุณได้ทำการส่งงานแล้ว จำนวน ${result.count} เว็บ`);
      window.dispatchEvent(new Event('work-submitted'));
      setEntries([newEntry(String(nextId.current++))]);
      setScope('mine'); setReportDate(''); setSearch({ scope: 'mine', team: '', reportDate: '' }); setPage(1); setRefresh(current => current + 1); setTab('list');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'บันทึกการส่งงานไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function exportReport(format: 'csv' | 'xlsx') {
    setExporting(true);
    try {
      const params = new URLSearchParams({ scope: search.scope, export: format });
      if (search.scope === 'team') params.set('team', search.team);
      if (search.reportDate) params.set('date', search.reportDate);
      const response = await fetch(`/api/work-submissions?${params}`, { cache: 'no-store' });
      if (!response.ok) { const result = await response.json() as {error?:string;count?:number}; throw new Error(result.error || 'Export รายงานไม่สำเร็จ'); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `work-submissions-${search.reportDate || 'all-dates'}.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Export รายงานแล้ว');
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Export รายงานไม่สำเร็จ'); }
    finally { setExporting(false); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !canSaveEdit || saving) return;
    if (!editTarget.keyword.trim() || !editTarget.website.trim() || !editTarget.date.trim() || !editTarget.parentWebsite.trim() || !types.some(type=>type.value===editTarget.type)) { toast.error('กรุณากรอกทุกช่องและเลือกประเภท'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/work-submissions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editTarget) });
      const result = await response.json() as {error?:string;count?:number};
      if (!response.ok) throw new Error(result.error || 'แก้ไขรายการส่งงานไม่สำเร็จ');
      toast.success('แก้ไขรายการส่งงานแล้ว');
      setEditTarget(null); setPage(1); setRefresh(current => current + 1);
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'แก้ไขรายการส่งงานไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  function editField(field: 'keyword' | 'website' | 'date' | 'parentWebsite' | 'type', value: string) {
    setEditTarget(current => current ? { ...current, [field]: value } : null);
  }

  async function confirmDelete() {
    if (!deleteTarget || !dateOpen(deleteTarget.date) || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/work-submissions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'ลบรายการส่งงานไม่สำเร็จ');
      toast.success('ลบรายการส่งงานแล้ว');
      window.dispatchEvent(new Event('work-submitted'));
      setDeleteTarget(null); setPage(1); setRefresh(current => current + 1);
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'ลบรายการส่งงานไม่สำเร็จ'); setRefresh(current => current + 1); }
    finally { setSaving(false); }
  }

  function update(rowId: string, field: keyof Entry, value: string) {
    setEntries(current => current.map(entry => entry.rowId === rowId ? { ...entry, [field]: value } : entry));
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 100));
  const serverTime = new Date(now + (data?.clockOffsetMs ?? 0));
  const dateOpen = (date: string) => Boolean(data && (workSubmissionWindow(date, serverTime).canSubmit || data.backfillGrants.some(grant => date >= grant.startDate && date <= grant.endDate && serverTime.getTime() < Date.parse(grant.closesAt))));
  const canSubmit = entries.every(entry => dateOpen(entry.date));
  const originalEditDate = data?.items.find(row => row.id === editTarget?.id)?.date;
  const canSaveEdit = Boolean(editTarget && originalEditDate && dateOpen(originalEditDate) && dateOpen(editTarget.date));
  const formatTime = (value: string) => value ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : 'กรุณาระบุวันที่ให้ถูกต้อง';
  return <Tabs value={tab} onValueChange={setTab}>
    <TabsList><TabsTrigger value="create"><Save /> บันทึกส่งงาน</TabsTrigger><TabsTrigger value="list"><ClipboardList /> ข้อมูลการส่งงาน</TabsTrigger>{data?.currentUser.role === 'hr' && <><TabsTrigger value="backfill">เปิดส่งงานย้อนหลัง</TabsTrigger><TabsTrigger value="api"><KeyRound /> API / เชื่อมระบบ</TabsTrigger></>}</TabsList>
    <TabsContent value="create">
      <section className="panel">
        <div className="panel-heading mb-5"><div><p className="section-kicker">NEW WORK SUBMISSION</p><h2>บันทึกส่งงานใหม่</h2>
          <p className="mt-2 text-sm text-muted-foreground">ผู้ส่ง: {data?.currentUser.name ?? 'บัญชีที่ล็อกอิน'} · {data?.currentUser.team || 'ยังไม่ระบุทีม'}</p>
        </div></div>
        <p className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900" role="status">เลือกวันที่ของงานได้ตลอดเวลา · ส่งและแก้ไขงานตั้งแต่ 14:00 น. ของวันที่ระบุ ถึงก่อน 10:00 น. ของวันถัดไป เวลาไทย · บันทึกทุกรายการพร้อมกัน · บังคับกรอกทุกช่องและเลือกประเภทในทุกรายการ</p>
        {data?.backfillGrants.map(grant => <p key={grant.id} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">HR เปิดให้ส่งและแก้ไขย้อนหลัง วันที่ {grant.startDate} ถึง {grant.endDate} · ปิดรับ {formatTime(grant.closesAt)}</p>)}
        {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          {entries.map((entry, index) => <fieldset key={entry.rowId} disabled={saving} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <legend className="px-2 text-sm font-semibold text-indigo-900">รายการที่ {index + 1}</legend>
            <div className="mb-3 flex justify-end">{entries.length > 1 && <Button type="button" size="sm" variant="ghost" className="text-rose-600" aria-label={`ลบรายการที่ ${index + 1}`} onClick={() => setEntries(current => current.filter(item => item.rowId !== entry.rowId))}><Trash2 /> ลบรายการ</Button>}</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">คีย์<Input required maxLength={250} value={entry.keyword} onChange={e => update(entry.rowId, 'keyword', e.target.value)} /></label>
              <label className="grid gap-2 text-sm font-medium">เว็บ<Input required maxLength={500} placeholder="example.com" value={entry.website} onChange={e => update(entry.rowId, 'website', e.target.value)} /></label>
              <label className="grid gap-2 text-sm font-medium">วันที่<Input required type="date" min="1900-01-01" value={entry.date} onChange={e => update(entry.rowId, 'date', e.target.value)} /></label>
              <label className="grid gap-2 text-sm font-medium">เว็บแม่<Input required maxLength={500} placeholder="parent.com" value={entry.parentWebsite} onChange={e => update(entry.rowId, 'parentWebsite', e.target.value)} /></label>
              <Dropdown id={`submission-type-${entry.rowId}`} label="ประเภท" required value={entry.type} options={types} disabled={saving} onChange={value => update(entry.rowId, 'type', value)} />
            </div>
            <p className={`mt-3 text-sm ${dateOpen(entry.date) ? 'text-green-700' : 'text-amber-700'}`} role="status">{(() => { const period = workSubmissionWindow(entry.date, serverTime); const grant = data?.backfillGrants.find(item => entry.date >= item.startDate && entry.date <= item.endDate && serverTime.getTime() < Date.parse(item.closesAt)); if (!period.canSubmit && grant) return `เปิดรับส่งย้อนหลัง ถึงก่อน ${formatTime(grant.closesAt)} เวลาไทย`; return `${dateOpen(entry.date) ? 'เปิดรับส่งงาน' : 'อยู่นอกช่วงรับส่งงาน'} · ${formatTime(period.opensAt)} ถึงก่อน ${formatTime(period.closesAt)} เวลาไทย`; })()}</p>
          </fieldset>)}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" className="border-indigo-200 text-indigo-700" disabled={saving || entries.length >= 100} onClick={() => setEntries(current => [...current, newEntry(String(nextId.current++))])}><Plus /> เพิ่มรายการ</Button>
            <Button type="submit" disabled={saving || !canSubmit}>{saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึกทั้งหมด ({entries.length} เว็บ)</Button>
          </div>
        </form>
      </section>
    </TabsContent>
    <TabsContent value="list">
      <section className="panel min-w-0">
        <div className="panel-heading mb-4 flex-wrap"><div><p className="section-kicker">WORK SUBMISSIONS</p><h2>ข้อมูลการส่งงาน</h2><p className="mt-1 text-xs text-muted-foreground">เลือกเงื่อนไขแล้วกดค้นหา · Export ตามผลค้นหา · เรียงตามทีมและชื่อ</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading || exporting} onClick={() => void exportReport('csv')}><Download /> Export CSV</Button><Button disabled={loading || exporting} onClick={() => void exportReport('xlsx')}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Export Excel</Button></div></div>
        <form onSubmit={searchReport} className="mb-4 flex flex-wrap gap-3">
          <label className="grid min-w-44 gap-2 text-sm font-medium">วันที่ส่งงาน<Input type="date" min="1900-01-01" value={reportDate} onChange={e => setReportDate(e.target.value)} /></label>
          <div className="flex items-end"><Button type="button" variant="outline" disabled={!reportDate} onClick={() => setReportDate('')}>ทุกวันที่</Button></div>
          <div className="min-w-44"><Dropdown id="submission-scope" label="ตัวกรอง" value={scope} options={[{value:'mine',label:'ของฉัน'},{value:'team',label:'รายทีม'},{value:'all',label:'ทั้งหมด'}]} onChange={next => {
            setScope(next);
            if (next === 'team' && !team) setTeam(data?.currentUser.team || data?.teams[0]?.value || '__unassigned__');
          }} /></div>
          {scope === 'team' && <div className="min-w-44"><Dropdown id="submission-team" label="ทีม" value={team} onChange={setTeam} options={data?.teams.length ? data.teams : [{ value: team, label: team === '__unassigned__' ? 'ยังไม่ระบุทีม' : team }]} /></div>}
          <div className="flex items-end"><Button type="submit" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null} ค้นหา</Button></div>
        </form>
        {(scope !== search.scope || (scope === 'team' && team !== search.team) || reportDate !== search.reportDate) && <p className="mb-4 text-sm text-amber-700" role="status">เงื่อนไขเปลี่ยนแล้ว กดค้นหาเพื่อแสดงข้อมูลตามเงื่อนไขใหม่</p>}
        {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error}</p>}
        <Table><TableHeader><TableRow><TableHead>ชื่อผู้ส่ง</TableHead><TableHead>รหัสพนักงาน</TableHead><TableHead>ทีม</TableHead><TableHead>คีย์</TableHead><TableHead>เว็บ</TableHead><TableHead>วันที่</TableHead><TableHead>เว็บแม่</TableHead><TableHead>ประเภท</TableHead><TableHead className="text-right">จัดการ</TableHead></TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={9} className="py-10 text-center">กำลังโหลด...</TableCell></TableRow> : data?.items.length ? data.items.map(row => <TableRow key={row.id}>
            <TableCell className="font-medium"><span className="block w-28 truncate" title={row.authorName}>{row.authorName || '—'}</span></TableCell><TableCell className="whitespace-nowrap">{row.employeeId || '—'}</TableCell><TableCell><span className="block w-24 truncate" title={row.team}>{row.team || 'ยังไม่ระบุทีม'}</span></TableCell>
            <TableCell><span className="block w-40 truncate" title={row.keyword}>{row.keyword}</span></TableCell><TableCell><span className="block w-48 truncate" title={row.website}>{row.website}</span></TableCell>
            <TableCell>{new Date(`${row.date}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}{row.isBackfill && <span className="block text-xs text-amber-700" title={`ส่งจริง ${formatTime(row.submittedAt)}`}>ส่งย้อนหลัง</span>}</TableCell><TableCell><span className="block w-72 truncate" title={row.parentWebsite}>{row.parentWebsite}</span></TableCell>
            <TableCell>{types.find(type => type.value === row.type)?.label ?? row.type}</TableCell>
            <TableCell className="text-right">{row.canEdit ? <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={!dateOpen(row.date) || saving} title={dateOpen(row.date) ? 'แก้ไขรายการของฉัน' : 'อยู่นอกช่วงรับแก้ไขของวันที่รายการ'} onClick={() => setEditTarget({ ...row })}><Pencil /> แก้ไข</Button>
              <Button size="sm" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={!dateOpen(row.date) || saving} title={dateOpen(row.date) ? 'ลบรายการของฉัน' : 'อยู่นอกช่วงเวลาที่อนุญาตให้ลบ'} onClick={() => setDeleteTarget({ ...row })}><Trash2 /> ลบ</Button>
            </div> : '—'}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">{error ? 'ไม่สามารถโหลดรายการได้' : 'ยังไม่มีข้อมูลการส่งงานตามตัวกรองนี้'}</TableCell></TableRow>}</TableBody>
        </Table>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{data?.total ?? 0} รายการ · หน้าละ 100 รายการ</span>
          <div className="flex items-center gap-3"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>ก่อนหน้า</Button><span>หน้า {page} / {pages}</span><Button variant="outline" disabled={loading || page >= pages} onClick={() => setPage(current => current + 1)}>ถัดไป</Button></div>
        </div>
      </section>
    </TabsContent>
    {data?.currentUser.role === 'hr' && <TabsContent value="backfill"><WorkSubmissionBackfillPanel onChanged={() => setRefresh(current => current + 1)} /></TabsContent>}
    {data?.currentUser.role === 'hr' && <TabsContent value="api"><WorkSubmissionApiPanel currentTeam={data.currentUser.team} /></TabsContent>}
    <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !saving) setDeleteTarget(null); }}>
      <DialogContent><DialogHeader><DialogTitle>ยืนยันลบรายการส่งงาน</DialogTitle><DialogDescription>ลบได้เฉพาะรายการของตัวเอง ในช่วง 14:00 น. ของวันที่งาน ถึงก่อน 10:00 น. ของวันถัดไป เวลาไทย หรือช่วงย้อนหลังที่ HR เปิดให้ การลบจะลดจำนวนงานที่ส่งของวันที่นั้น</DialogDescription></DialogHeader>
        {deleteTarget && <>
          <dl className="grid gap-2 rounded-lg border bg-slate-50 p-4 text-sm"><div><dt className="font-medium">คีย์</dt><dd className="break-all">{deleteTarget.keyword}</dd></div><div><dt className="font-medium">เว็บ</dt><dd className="break-all">{deleteTarget.website}</dd></div><div><dt className="font-medium">วันที่งาน</dt><dd>{new Date(`${deleteTarget.date}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</dd></div></dl>
          {!dateOpen(deleteTarget.date) && <p role="alert" className="text-sm text-amber-700">อยู่นอกช่วงเวลาที่อนุญาตให้ลบรายการนี้</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleteTarget(null)}>ยกเลิก</Button><Button variant="destructive" disabled={saving || !dateOpen(deleteTarget.date)} onClick={confirmDelete}>{saving ? <Loader2 className="animate-spin" /> : <Trash2 />} ยืนยันลบ</Button></div>
        </>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editTarget)} onOpenChange={open => { if (!open && !saving) setEditTarget(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>แก้ไขรายการส่งงาน</DialogTitle><DialogDescription>แก้ไขรายการของตัวเองได้ในช่วง 14:00 น. ของวันที่รายการ ถึงก่อน 10:00 น. ของวันถัดไป หรือช่วงย้อนหลังที่ HR เปิดให้ หากเปลี่ยนวันที่ ทั้งวันที่เดิมและใหม่ต้องอยู่ในช่วงรับงาน</DialogDescription></DialogHeader>
        {editTarget && <form onSubmit={saveEdit} className="space-y-5">
          <fieldset disabled={saving} className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">คีย์<Input required maxLength={250} value={editTarget.keyword} onChange={e => editField('keyword', e.target.value)} /></label>
            <label className="grid gap-2 text-sm font-medium">เว็บ<Input required maxLength={500} value={editTarget.website} onChange={e => editField('website', e.target.value)} /></label>
            <label className="grid gap-2 text-sm font-medium">วันที่<Input required type="date" min="1900-01-01" value={editTarget.date} onChange={e => editField('date', e.target.value)} /></label>
            <label className="grid gap-2 text-sm font-medium">เว็บแม่<Input required maxLength={500} value={editTarget.parentWebsite} onChange={e => editField('parentWebsite', e.target.value)} /></label>
            <Dropdown id="submission-edit-type" label="ประเภท" required value={editTarget.type} options={types} disabled={saving} onChange={value => editField('type', value)} />
          </fieldset>
          {!canSaveEdit && <p role="alert" className="text-sm text-amber-700">วันที่เดิมหรือวันที่ใหม่อยู่นอกช่วงรับแก้ไขงาน</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditTarget(null)}>ยกเลิก</Button><Button type="submit" disabled={saving || !canSaveEdit}>{saving ? <Loader2 className="animate-spin" /> : <Save />} บันทึกการแก้ไข</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </Tabs>;
}
