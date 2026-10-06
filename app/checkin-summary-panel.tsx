"use client";
import { FormEvent, useEffect, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';
type Row={employeeId:string;nickname:string;team:string;calendarDays:number;absence:number;meetingLeave:number;late:number;trueDays:number;adminDays:number;workingDays:number};
type Data={month:string;throughDate:string;rows:Row[]};
const thisMonth=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,7);
export function CheckinSummaryPanel(){
  const [month,setMonth]=useState(thisMonth);
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  async function load(value:string){setLoading(true);setError('');try{const response=await fetch(`/api/checkin/summary?${new URLSearchParams({month:value})}`,{cache:'no-store'});const result=await response.json() as Data&{error?:string};if(!response.ok)throw new Error(result.error||'โหลดรายงานไม่สำเร็จ');setData(result);}catch(failure){setError(failure instanceof Error?failure.message:'โหลดรายงานไม่สำเร็จ');}finally{setLoading(false);}}
  useEffect(()=>{void load(thisMonth());},[]);
  async function exportReport(){if(!data)return;setExporting(true);try{const response=await fetch(`/api/checkin/summary?${new URLSearchParams({month:data.month,export:'xlsx'})}`,{cache:'no-store'});if(!response.ok){const result=await response.json() as {error?:string};throw new Error(result.error||'Export ไม่สำเร็จ');}const url=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=url;anchor.download=`attendance-summary-${data.month}.xlsx`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);toast.success('Export รายงาน Excel แล้ว');}catch(failure){toast.error(failure instanceof Error?failure.message:'Export ไม่สำเร็จ');}finally{setExporting(false);}}
  function search(event:FormEvent<HTMLFormElement>){event.preventDefault();void load(month);}
  return <section className="panel min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">HR MONTHLY SUMMARY</p><h2>รายงานสรุปรายเดือน</h2></div><Button disabled={!data||loading||exporting} onClick={()=>void exportReport()}>{exporting?<Loader2 className="animate-spin"/>:<Download/>} Export Excel</Button></div>
    <form onSubmit={search} className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-medium">เดือน<Input type="month" required min="1900-01" max={thisMonth()} value={month} onChange={event=>setMonth(event.target.value)}/></label><Button type="submit" disabled={loading}>{loading?<Loader2 className="animate-spin"/>:<Search/>} ค้นหา</Button></form>
    <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">นับจากข้อมูลหน้าลงเวลา · สถานะเดียวกันในวันเดียวกันนับครั้งเดียว · วันทำงาน = วันปฏิทินในช่วงที่ยังทำงานอยู่ − วันขาด/หยุด · ลาประชุม สาย ทรู และแอดมินยังนับวันทำงาน · จำนวนมาสายนับเฉพาะรายการที่บันทึกแล้ว ไม่รวมสายที่รอ HR ยืนยัน</p>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {data&&<><p className="text-sm text-muted-foreground">เดือน {data.month} · ข้อมูลถึง {data.throughDate} · {data.rows.length} คน · เรียงตามทีมและชื่อ</p>{month!==data.month&&<p className="text-sm text-amber-700">กดค้นหาเพื่อเปลี่ยนเดือน รายงาน Export ใช้เดือนที่ค้นหาแล้ว</p>}
    <Table><TableHeader><TableRow>{['ทีม','รหัส','ชื่อ','วันในช่วงทำงาน','ขาด / หยุด','ลาประชุม','มาสาย','ทรู','แอดมิน','วันทำงาน'].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{data.rows.map(row=><TableRow key={row.employeeId}><TableCell>{row.team||'—'}</TableCell><TableCell>{row.employeeId}</TableCell><TableCell className="font-medium">{row.nickname}</TableCell><TableCell>{row.calendarDays}</TableCell><TableCell className="text-rose-700">{row.absence}</TableCell><TableCell className="text-amber-700">{row.meetingLeave}</TableCell><TableCell className="text-rose-700">{row.late}</TableCell><TableCell>{row.trueDays}</TableCell><TableCell>{row.adminDays}</TableCell><TableCell className="font-semibold text-emerald-700">{row.workingDays}</TableCell></TableRow>)}{!data.rows.length&&<TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">ไม่มีพนักงานในเดือนที่เลือก</TableCell></TableRow>}</TableBody></Table></>}
  </section>;
}
