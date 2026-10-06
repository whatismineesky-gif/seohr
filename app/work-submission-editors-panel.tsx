'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
type Editor = { email: string; name: string; employeeId: string; team: string; enabled: boolean };
export function WorkSubmissionEditorsPanel({ onChanged }: { onChanged: () => void }) {
  const [users, setUsers] = useState<Editor[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(''), [error, setError] = useState(''), [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/work-submissions/editors', { cache: 'no-store' });
      const result = await response.json() as { users: Editor[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'โหลดสิทธิ์ไม่สำเร็จ');
      setUsers(result.users); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'โหลดสิทธิ์ไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function toggle(user: Editor) {
    setSaving(user.email);
    try {
      const response = await fetch('/api/work-submissions/editors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, enabled: !user.enabled }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'บันทึกสิทธิ์ไม่สำเร็จ');
      setUsers(current => current.map(item => item.email === user.email ? { ...item, enabled: !user.enabled } : item));
      toast.success(user.enabled ? 'ถอนสิทธิ์แล้ว' : 'ให้สิทธิ์แล้ว'); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'บันทึกสิทธิ์ไม่สำเร็จ'); }
    finally { setSaving(''); }
  }
  const filtered = users.filter(user => [user.name, user.email, user.employeeId, user.team].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="panel space-y-4">
    <div><h2>สิทธิ์จัดการตารางส่งงานใหม่</h2><p className="mt-2 text-sm text-muted-foreground">HR เลือกผู้ที่เพิ่มและแก้ไขงานได้ทุกช่วงเวลา และแก้ไขรายการของผู้อื่นได้ · การลบยังใช้ช่วงรับส่งงานหรือช่วงส่งย้อนหลังที่เปิดให้บัญชีนั้น · ผู้ส่งยังจัดการรายการของตนเองได้ในช่วงเวลาที่กำหนด</p></div>
    <div className="flex gap-3"><Input aria-label="ค้นหาผู้ใช้งาน" placeholder="ค้นหาชื่อ รหัส ทีม หรืออีเมล" value={search} onChange={event => setSearch(event.target.value)} /><Button variant="outline" disabled={loading || Boolean(saving)} onClick={() => void load()}>รีเฟรช</Button></div>
    {error && <p role="alert" className="text-rose-600">{error}</p>}
    {loading ? <p>กำลังโหลด…</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">ไม่พบผู้ใช้งาน</p> : <div className="space-y-2">{filtered.map(user => <article key={user.email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="font-medium break-words">{user.name} · {user.employeeId || 'ไม่มีรหัส'} · {user.team || 'ไม่มีทีม'}</p><p className="text-sm text-muted-foreground break-all">{user.email}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={user.enabled} disabled={Boolean(saving) || Boolean(error)} onChange={() => void toggle(user)} aria-label={`สิทธิ์จัดการงานของ ${user.name}`} />เพิ่ม / แก้ไขทุกเวลา และลบตามช่วงที่เปิด{saving === user.email && ' · กำลังบันทึก…'}</label></article>)}</div>}
  </section>;
}
