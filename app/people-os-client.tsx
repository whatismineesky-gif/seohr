"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  Building2,
  CalendarDays,
  Clock3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Save,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import hrData from "./hr-data.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { AttendancePanel } from "./attendance-panel";
import { AdvancePanel, PayrollPanel } from "./payroll-panels";
import { WarningPanel } from "./warning-panel";
import { AccessPanel } from "./access-panel";

type View =
  | "dashboard"
  | "employees"
  | "members"
  | "attendance"
  | "resignations"
  | "advances"
  | "warnings"
  | "payroll"
  | "data"
  | "access";

type Employee = {
  id: string;
  sequence: number;
  nickname: string;
  team: string;
  position: string;
  employment: string;
  tenure: string;
  status: string;
  probation: string;
  startDate: string;
  hasSalary: boolean;
  hasBank: boolean;
  hasEmail: boolean;
  fullName: string;
  salary: number | null;
  bankAccount: string;
  bankName: string;
  accountName: string;
  endDate: string;
  aff: string;
  email: string;
  discordId: string;
  dynadot: string;
  referredBy: string;
  createdAt?: string;
  updatedAt?: string;
};

type EmployeeSortKey =
  | "id"
  | "nickname"
  | "team"
  | "position"
  | "employment"
  | "status"
  | "tenure";

type SortDirection = "asc" | "desc";

const initialEmployees = hrData.employees.map((employee, index) => ({
  ...employee,
  sequence: index + 1,
  fullName: "",
  salary: null,
  bankAccount: "",
  bankName: "",
  accountName: "",
  endDate: "",
  aff: "",
  email: "",
  discordId: "",
  dynadot: "",
  referredBy: "",
})) as Employee[];
const formatNumber = new Intl.NumberFormat("th-TH");
const formatMoney = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const navItems = [
  { id: "dashboard" as View, label: "ภาพรวม", icon: LayoutDashboard },
  { id: "employees" as View, label: "พนักงานทั้งหมด", icon: Users },
  { id: "members" as View, label: "MEMBER", icon: UserRoundCheck },
  { id: "attendance" as View, label: "ลงเวลางาน", icon: Clock3 },
  { id: "resignations" as View, label: "แจ้งลาออก", icon: UserMinus },
  { id: "advances" as View, label: "บันทึกรายการเบิก", icon: Banknote },
  { id: "warnings" as View, label: "บันทึกใบเตือน", icon: ShieldAlert },
  { id: "payroll" as View, label: "คำนวณเงินเดือน", icon: WalletCards },
  { id: "data" as View, label: "นำเข้าและตรวจข้อมูล", icon: FileSpreadsheet },
  { id: "access" as View, label: "สิทธิ์ผู้ใช้งาน", icon: ShieldCheck },
];

const viewTitles: Record<
  View,
  { eyebrow: string; title: string; description: string }
> = {
  dashboard: {
    eyebrow: "HR OVERVIEW",
    title: "ภาพรวมบุคลากรแผนก SEO",
    description:
      "ติดตามจำนวนพนักงาน ความพร้อมของข้อมูล และรายการที่ต้องดำเนินการจากจุดเดียว",
  },
  employees: {
    eyebrow: "EMPLOYEE DIRECTORY",
    title: "ข้อมูลพนักงาน",
    description: "ค้นหา กรอง และตรวจสถานะพนักงานทั้ง 16 ทีม",
  },
  members: {
    eyebrow: "ACTIVE MEMBER",
    title: "รายชื่อ MEMBER",
    description: "พนักงานที่ยังทำงานอยู่ พร้อมอายุงานและสถานะทดลองงาน",
  },
  attendance: {
    eyebrow: "TIME & ATTENDANCE",
    title: "ลงเวลางาน",
    description:
      "บันทึกและติดตามวันทำงาน หยุดงาน ลาประชุม มาสาย พร้อมคำนวณสิทธิ์คงเหลืออัตโนมัติ",
  },
  resignations: {
    eyebrow: "OFFBOARDING",
    title: "จัดการการลาออก",
    description: "รวมรายการแจ้งลาออก ลาออกแล้ว และรอคัดชื่อออก",
  },
  advances: {
    eyebrow: "ADVANCE & INSTALLMENT",
    title: "บันทึกรายการเบิก",
    description: "สร้างตารางคืนเงินและติดตามสถานะรายการหักรายเดือนของพนักงาน",
  },
  warnings: {
    eyebrow: "PERFORMANCE WARNING",
    title: "บันทึกใบเตือน",
    description:
      "นำเข้าจำนวนฝาก คำนวณ WINLOSS ใบเหลือง ใบแดง และติดตามผลรายไตรมาส",
  },
  payroll: {
    eyebrow: "PAYROLL CONTROL",
    title: "คำนวณเงินเดือน",
    description:
      "คำนวณเป้าเว็บไซต์ ดึงรายการหักและใบเตือน ก่อนบันทึก Slip ประจำเดือน",
  },
  data: {
    eyebrow: "DATA QUALITY",
    title: "นำเข้าและตรวจข้อมูล",
    description: "ตรวจฟิลด์ที่ขาดและโครงสร้างข้อมูลก่อนบันทึกเข้าระบบ",
  },
  access: {
    eyebrow: "ACCESS CONTROL",
    title: "สิทธิ์ผู้ใช้งาน",
    description: "กำหนดบทบาทและควบคุมเมนูที่ผู้ใช้งานแต่ละคนสามารถเข้าถึงได้",
  },
};

function statusClass(status: string) {
  if (status === "ยังทำงานอยู่")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "แจ้งลาออก")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ลาออก") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusClass(status)}>
      {status}
    </Badge>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <section className="summary-card">
      <div className={`summary-icon ${tone}`}>
        <Icon aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-[1.75rem] font-semibold tracking-[-0.04em] text-slate-950">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>
    </section>
  );
}

function Dashboard({
  employees,
  onNavigate,
}: {
  employees: Employee[];
  onNavigate: (view: View) => void;
}) {
  const activeEmployees = employees.filter(
    (employee) => employee.status === "ยังทำงานอยู่",
  );
  const notice = employees.filter(
    (employee) => employee.status === "แจ้งลาออก",
  ).length;
  const pendingRemoval = employees.filter(
    (employee) => employee.status === "รอคัดชื่อออก",
  ).length;
  const salaryReady = activeEmployees.filter(
    (employee) => employee.hasSalary,
  ).length;
  const bankReady = activeEmployees.filter(
    (employee) => employee.hasBank,
  ).length;
  const emailReady = activeEmployees.filter(
    (employee) => employee.hasEmail,
  ).length;
  const monthlyPayroll = activeEmployees.reduce(
    (sum, employee) => sum + (employee.salary ?? 0),
    0,
  );
  const missingEmployeeId = employees.filter(
    (employee) => !employee.id || /^TEMP[-_]/i.test(employee.id),
  ).length;
  const teamNames = Array.from(
    new Set(activeEmployees.map((employee) => employee.team).filter(Boolean)),
  );
  const teams = Array.from(
    new Set([
      ...Array.from({ length: 16 }, (_, index) => `ทีม ${index + 1}`),
      ...teamNames,
    ]),
  )
    .map((name) => ({
      name,
      headcount: activeEmployees.filter((employee) => employee.team === name)
        .length,
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, "th", { numeric: true }),
    );
  const maxTeam = Math.max(1, ...teams.map((team) => team.headcount));
  const employment = activeEmployees.reduce<Record<string, number>>(
    (counts, employee) => {
      const label = employee.employment || "ไม่ระบุ";
      counts[label] = (counts[label] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const probationPending = activeEmployees.filter(
    (employee) => employee.probation === "ยังไม่ผ่าน",
  ).length;
  const dataChecks = [
    {
      label: "มีข้อมูลเงินเดือน",
      value: salaryReady,
      total: activeEmployees.length,
    },
    {
      label: "มีข้อมูลบัญชีรับเงิน",
      value: bankReady,
      total: activeEmployees.length,
    },
    {
      label: "มีอีเมลติดต่อ",
      value: emailReady,
      total: activeEmployees.length,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="พนักงานปัจจุบัน"
          value={`${formatNumber.format(activeEmployees.length)} คน`}
          note={`จากทั้งหมด ${formatNumber.format(employees.length)} ประวัติ`}
          icon={Users}
          tone="bg-indigo-50 text-indigo-700"
        />
        <SummaryCard
          label="ทีมที่ดูแล"
          value={`${teamNames.length} ทีม`}
          note="คำนวณจากพนักงานที่ยังทำงานอยู่"
          icon={Building2}
          tone="bg-cyan-50 text-cyan-700"
        />
        <SummaryCard
          label="แจ้งลาออก"
          value={`${notice} รายการ`}
          note={`${pendingRemoval} รายการรอคัดชื่อออก`}
          icon={UserMinus}
          tone="bg-amber-50 text-amber-700"
        />
        <SummaryCard
          label="ยอดเงินเดือนที่มีข้อมูล"
          value={formatMoney.format(monthlyPayroll)}
          note={`${salaryReady}/${activeEmployees.length} คนพร้อมคำนวณ`}
          icon={Banknote}
          tone="bg-emerald-50 text-emerald-700"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">HEADCOUNT BY TEAM</p>
              <h2>จำนวนพนักงานแต่ละทีม</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("employees")}
            >
              ดูรายชื่อ <ChevronRight />
            </Button>
          </div>
          <div className="team-chart" aria-label="กราฟจำนวนพนักงานแต่ละทีม">
            {teams.map((team) => (
              <div key={team.name} className="team-bar-row">
                <span>{team.name.replace("ทีม ", "T")}</span>
                <div className="team-bar-track">
                  <div
                    className="team-bar-fill"
                    style={{
                      width: `${Math.max((team.headcount / maxTeam) * 100, 9)}%`,
                    }}
                  />
                </div>
                <strong>{team.headcount}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">DATA READINESS</p>
              <h2>ความพร้อมก่อนทำเงินเดือน</h2>
            </div>
            <ShieldCheck
              className="size-5 text-emerald-600"
              aria-hidden="true"
            />
          </div>
          <div className="space-y-6 pt-1">
            {dataChecks.map((item) => {
              const percent =
                item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <strong>{percent}%</strong>
                  </div>
                  <Progress value={percent} className="h-2" />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    พร้อม {item.value} จาก {item.total} คน
                  </p>
                </div>
              );
            })}
          </div>
          <button className="attention-card" onClick={() => onNavigate("data")}>
            <AlertTriangle aria-hidden="true" />
            <span>
              <strong>
                พบรหัสพนักงานชั่วคราว {missingEmployeeId} รายการ
              </strong>
              <small>ควรกำหนดรหัสจริงก่อนเชื่อมเงินเดือน</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">EMPLOYMENT MIX</p>
              <h2>รูปแบบการจ้างงาน</h2>
            </div>
          </div>
          <div className="employment-grid">
            {Object.entries(employment).map(([label, count], index) => (
              <div key={label} className="employment-item">
                <span className={`legend-dot dot-${index + 1}`} />
                <div>
                  <p>{label}</p>
                  <strong>{count} คน</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">WORK QUEUE</p>
              <h2>รายการที่ HR ควรดำเนินการ</h2>
            </div>
          </div>
          <div className="task-list">
            <button onClick={() => onNavigate("payroll")}>
              <span className="task-marker bg-rose-500" />
              <span>
                <strong>เติมข้อมูลเงินเดือนที่ขาด</strong>
                <small>
                  {activeEmployees.length - salaryReady} คน
                </small>
              </span>
              <ChevronRight />
            </button>
            <button onClick={() => onNavigate("resignations")}>
              <span className="task-marker bg-amber-500" />
              <span>
                <strong>ตรวจรายการ Offboarding</strong>
                <small>
                  {notice + pendingRemoval} รายการ
                </small>
              </span>
              <ChevronRight />
            </button>
            <button onClick={() => onNavigate("members")}>
              <span className="task-marker bg-indigo-500" />
              <span>
                <strong>ติดตามผู้ยังไม่ผ่านโปร</strong>
                <small>{probationPending} คน</small>
              </span>
              <ChevronRight />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SortableEmployeeHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: EmployeeSortKey;
  activeKey: EmployeeSortKey;
  direction: SortDirection;
  onSort: (key: EmployeeSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 font-medium text-slate-700 transition-colors hover:bg-slate-200/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        onClick={() => onSort(sortKey)}
        title={`เรียงตาม${label}`}
      >
        {label}
        <Icon className={`size-3.5 ${active ? "text-blue-600" : "text-slate-400"}`} />
      </button>
    </TableHead>
  );
}

function EmployeeTable({
  rows,
  onSelect,
  sortKey,
  sortDirection,
  onSort,
  compact = false,
}: {
  rows: Employee[];
  onSelect: (employee: Employee) => void;
  sortKey: EmployeeSortKey;
  sortDirection: SortDirection;
  onSort: (key: EmployeeSortKey) => void;
  compact?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <SortableEmployeeHead label="รหัส" sortKey="id" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          <SortableEmployeeHead label="ชื่อเล่น" sortKey="nickname" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          <SortableEmployeeHead label="ทีม" sortKey="team" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          {!compact && <SortableEmployeeHead label="ตำแหน่ง" sortKey="position" activeKey={sortKey} direction={sortDirection} onSort={onSort} />}
          <SortableEmployeeHead label="ประเภท" sortKey="employment" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          <SortableEmployeeHead label={compact ? "อายุงาน" : "สถานะ"} sortKey={compact ? "tenure" : "status"} activeKey={sortKey} direction={sortDirection} onSort={onSort} />
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((employee) => (
          <TableRow
            key={`${employee.id}-${employee.nickname}`}
            className="cursor-pointer"
            onClick={() => onSelect(employee)}
          >
            <TableCell className="font-mono text-xs text-slate-500">
              {employee.id}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <span className="avatar-initial">
                  {employee.nickname.slice(0, 1)}
                </span>
                <span className="font-medium text-slate-900">
                  {employee.nickname}
                </span>
              </div>
            </TableCell>
            <TableCell>{employee.team}</TableCell>
            {!compact && <TableCell>{employee.position}</TableCell>}
            <TableCell>{employee.employment}</TableCell>
            <TableCell>
              {compact ? (
                employee.tenure
              ) : (
                <StatusBadge status={employee.status} />
              )}
            </TableCell>
            <TableCell>
              <MoreHorizontal className="size-4 text-slate-400" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Directory({
  employees,
  mode,
  onAdd,
  onEmployeeSaved,
}: {
  employees: Employee[];
  mode: "all" | "members" | "resignations";
  onAdd: () => void;
  onEmployeeSaved: (employee: Employee) => void;
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<EmployeeSortKey>("team");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const pageSize = 12;

  const baseRows = useMemo(() => {
    if (mode === "members")
      return employees.filter((employee) => employee.status === "ยังทำงานอยู่");
    if (mode === "resignations")
      return employees.filter((employee) => employee.status !== "ยังทำงานอยู่");
    return employees;
  }, [employees, mode]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return baseRows.filter((employee) => {
      const matchesText =
        !normalized ||
        [employee.id, employee.nickname, employee.team, employee.position]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return (
        matchesText &&
        (team === "all" || employee.team === team) &&
        (status === "all" || employee.status === status)
      );
    });
  }, [baseRows, query, team, status]);

  const sortedRows = useMemo(() => {
    const getValue = (employee: Employee) => {
      if (sortKey === "tenure") {
        return Number(employee.tenure.match(/\d+/)?.[0] ?? 0);
      }
      return employee[sortKey] ?? "";
    };

    return [...filtered].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "th", {
              numeric: true,
              sensitivity: "base",
            });
      if (comparison !== 0)
        return sortDirection === "asc" ? comparison : -comparison;

      return left.nickname.localeCompare(right.nickname, "th", {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [filtered, sortKey, sortDirection]);

  function changeSort(key: EmployeeSortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = sortedRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function exportCsv() {
    const header = [
      "รหัสพนักงาน",
      "ชื่อเล่น",
      "ทีม",
      "ตำแหน่ง",
      "ประเภทการจ้างงาน",
      "อายุงาน",
      "สถานะ",
    ];
    const body = filtered.map((item) => [
      item.id,
      item.nickname,
      item.team,
      item.position,
      item.employment,
      item.tenure,
      item.status,
    ]);
    const csv =
      "\ufeff" +
      [header, ...body]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download =
      mode === "members"
        ? "members.csv"
        : mode === "resignations"
          ? "offboarding.csv"
          : "employees.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("ดาวน์โหลดไฟล์ CSV แล้ว");
  }

  return (
    <div className="space-y-5">
      {mode === "resignations" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="แจ้งลาออก"
            value={`${hrData.summary.notice} คน`}
            note="รอดำเนินการ"
            icon={UserMinus}
            tone="bg-amber-50 text-amber-700"
          />
          <SummaryCard
            label="รอคัดชื่อออก"
            value={`${hrData.summary.pendingRemoval} คน`}
            note="ตรวจสิทธิ์ระบบ"
            icon={AlertTriangle}
            tone="bg-rose-50 text-rose-700"
          />
          <SummaryCard
            label="ลาออกแล้ว"
            value={`${hrData.summary.departed} คน`}
            note="เก็บในประวัติ"
            icon={CheckCircle2}
            tone="bg-slate-100 text-slate-700"
          />
        </div>
      )}

      <section className="panel overflow-hidden p-0">
        <div className="directory-toolbar">
          <div className="search-box">
            <Search aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="ค้นหารหัส ชื่อเล่น ทีม หรือตำแหน่ง"
              aria-label="ค้นหาพนักงาน"
            />
          </div>
          <Select
            value={team}
            onValueChange={(value) => {
              setTeam(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="ทุกทีม" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกทีม</SelectItem>
              {hrData.teams.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode !== "members" && (
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[165px]">
                <SelectValue placeholder="ทุกสถานะ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                <SelectItem value="ยังทำงานอยู่">ยังทำงานอยู่</SelectItem>
                <SelectItem value="แจ้งลาออก">แจ้งลาออก</SelectItem>
                <SelectItem value="กำลังรอคัดชื่อออก">
                  กำลังรอคัดชื่อออก
                </SelectItem>
                <SelectItem value="ลาออก">ลาออก</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download /> ส่งออก CSV
            </Button>
            {mode === "all" && (
              <Button onClick={onAdd}>
                <Plus /> เพิ่มพนักงาน
              </Button>
            )}
          </div>
        </div>

        <div className="border-t">
          <EmployeeTable
            rows={visibleRows}
            onSelect={setSelected}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={changeSort}
            compact={mode === "members"}
          />
        </div>

        <div className="table-footer-bar">
          <p>
            แสดง {visibleRows.length} จาก {filtered.length} รายการ
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ก่อนหน้า
            </Button>
            <span className="text-sm text-muted-foreground">
              หน้า {safePage}/{pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              ถัดไป
            </Button>
          </div>
        </div>
      </section>

      <EmployeeEditDialog
        employee={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        onSaved={(employee) => {
          onEmployeeSaved(employee);
          setSelected(employee);
        }}
      />
    </div>
  );
}

function EmployeeEditDialog({
  employee,
  open,
  onOpenChange,
  onSaved,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (employee: Employee) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showBankAccount, setShowBankAccount] = useState(false);

  useEffect(() => {
    setShowBankAccount(false);
  }, [employee?.id, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const salaryValue = form.get("salary");
    const salaryText = salaryValue === null ? "" : String(salaryValue).trim();
    const payload = {
      ...employee,
      nickname: String(form.get("nickname") ?? employee.nickname).trim(),
      fullName: String(form.get("fullName") ?? employee.fullName).trim(),
      team: String(form.get("team") ?? employee.team).trim(),
      position: String(form.get("position") ?? employee.position).trim(),
      employment: String(form.get("employment") ?? employee.employment).trim(),
      startDate: String(form.get("startDate") ?? employee.startDate).trim(),
      endDate: String(form.get("endDate") ?? employee.endDate).trim(),
      probation: String(form.get("probation") ?? employee.probation).trim(),
      status: String(form.get("status") ?? employee.status).trim(),
      salary:
        salaryValue === null
          ? employee.salary
          : salaryText
            ? Number(salaryText)
            : null,
      bankAccount: String(
        form.get("bankAccount") ?? employee.bankAccount,
      ).trim(),
      bankName: String(form.get("bankName") ?? employee.bankName).trim(),
      accountName: String(
        form.get("accountName") ?? employee.accountName,
      ).trim(),
      email: String(form.get("email") ?? employee.email).trim(),
      aff: String(form.get("aff") ?? employee.aff).trim(),
      discordId: String(form.get("discordId") ?? employee.discordId).trim(),
      dynadot: String(form.get("dynadot") ?? employee.dynadot).trim(),
      referredBy: String(form.get("referredBy") ?? employee.referredBy).trim(),
    };

    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        employee?: Employee;
        error?: string;
      };
      if (!response.ok || !result.employee)
        throw new Error(result.error || "บันทึกข้อมูลไม่สำเร็จ");
      onSaved(result.employee);
      toast.success("บันทึกข้อมูลพนักงานแล้ว", {
        description: `${result.employee.id} · ${result.employee.nickname}`,
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึกข้อมูลไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        {employee && (
          <form key={employee.id} onSubmit={submit}>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-4">
                <span className="profile-avatar">
                  {employee.nickname.slice(0, 1)}
                </span>
                <div>
                  <DialogTitle className="text-xl">
                    แก้ไขข้อมูล {employee.nickname}
                  </DialogTitle>
                  <DialogDescription>
                    รหัสพนักงาน {employee.id} · แก้ไขแล้วกด “บันทึกข้อมูล”
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="work" className="mt-5">
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="work">ข้อมูลการทำงาน</TabsTrigger>
                <TabsTrigger value="payment">เงินเดือนและบัญชี</TabsTrigger>
                <TabsTrigger value="contact">ข้อมูลติดต่อและระบบ</TabsTrigger>
              </TabsList>

              <TabsContent
                value="work"
                forceMount
                className="pt-5 data-[state=inactive]:hidden"
              >
                <div className="edit-form-grid">
                  <label className="field-label">
                    รหัสพนักงาน
                    <Input value={employee.id} disabled />
                  </label>
                  <label className="field-label">
                    ชื่อเล่น
                    <Input
                      name="nickname"
                      required
                      defaultValue={employee.nickname}
                    />
                  </label>
                  <label className="field-label sm:col-span-2">
                    ชื่อ–นามสกุล
                    <Input name="fullName" defaultValue={employee.fullName} />
                  </label>
                  <label className="field-label">
                    ทีม
                    <select
                      name="team"
                      className="native-select"
                      defaultValue={employee.team}
                    >
                      {hrData.teams.map((team) => (
                        <option key={team.name}>{team.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    ตำแหน่ง
                    <select
                      name="position"
                      className="native-select"
                      defaultValue={employee.position}
                    >
                      <option>Staff</option>
                      <option>Parttime</option>
                      <option>Senior-staff</option>
                      <option>Head</option>
                      <option>HEAD</option>
                    </select>
                  </label>
                  <label className="field-label">
                    ประเภทการจ้าง
                    <select
                      name="employment"
                      className="native-select"
                      defaultValue={employee.employment}
                    >
                      <option>FullTime</option>
                      <option>FullTime นผก</option>
                      <option>Freelancer</option>
                    </select>
                  </label>
                  <label className="field-label">
                    สถานะทดลองงาน
                    <select
                      name="probation"
                      className="native-select"
                      defaultValue={employee.probation}
                    >
                      <option>ยังไม่ผ่าน</option>
                      <option>ผ่านโปรขั้น 1</option>
                      <option>ผ่านโปรขั้น 2</option>
                    </select>
                  </label>
                  <label className="field-label">
                    วันที่เริ่มงาน
                    <Input
                      name="startDate"
                      type="date"
                      defaultValue={employee.startDate}
                    />
                  </label>
                  <label className="field-label">
                    วันที่ออกงาน
                    <Input
                      name="endDate"
                      type="date"
                      defaultValue={employee.endDate}
                    />
                  </label>
                  <label className="field-label sm:col-span-2">
                    สถานะพนักงาน
                    <select
                      name="status"
                      className="native-select"
                      defaultValue={employee.status}
                    >
                      <option>ยังทำงานอยู่</option>
                      <option>แจ้งลาออก</option>
                      <option>กำลังรอคัดชื่อออก</option>
                      <option>ลาออก</option>
                    </select>
                  </label>
                </div>
              </TabsContent>

              <TabsContent
                value="payment"
                forceMount
                className="pt-5 data-[state=inactive]:hidden"
              >
                <div className="edit-form-grid">
                  <label className="field-label sm:col-span-2">
                    เงินเดือน
                    <Input
                      name="salary"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={employee.salary ?? ""}
                      placeholder="0"
                    />
                  </label>
                  <label className="field-label">
                    ธนาคาร
                    <Input name="bankName" defaultValue={employee.bankName} />
                  </label>
                  <label className="field-label">
                    เลขบัญชี
                    <div className="relative">
                      <Input
                        name="bankAccount"
                        type={showBankAccount ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        defaultValue={employee.bankAccount}
                        autoComplete="off"
                        aria-label={
                          showBankAccount
                            ? "เลขบัญชี"
                            : "เลขบัญชี (ปกปิด)"
                        }
                        className="pr-11"
                        onInput={(event) => {
                          event.currentTarget.value =
                            event.currentTarget.value.replace(/\D/g, "");
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowBankAccount((current) => !current)}
                        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={
                          showBankAccount
                            ? "ซ่อนเลขบัญชี"
                            : "แสดงเลขบัญชีเต็ม"
                        }
                        title={
                          showBankAccount
                            ? "ซ่อนเลขบัญชี"
                            : "แสดงเลขบัญชีเต็ม"
                        }
                      >
                        {showBankAccount ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      ระบบจะเก็บเฉพาะตัวเลขและลบขีดหรือเว้นวรรคให้อัตโนมัติ
                    </span>
                  </label>
                  <label className="field-label sm:col-span-2">
                    ชื่อบัญชี
                    <Input
                      name="accountName"
                      defaultValue={employee.accountName}
                    />
                  </label>
                </div>
                <div className="privacy-note mt-5">
                  <ShieldCheck />
                  <div>
                    <strong>ข้อมูลจำกัดสิทธิ์</strong>
                    <p>
                      เงินเดือนและบัญชีธนาคารถูกเก็บในฐานข้อมูล
                      และระบบนี้เผยแพร่แบบส่วนตัวสำหรับเจ้าของเท่านั้น
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="contact"
                forceMount
                className="pt-5 data-[state=inactive]:hidden"
              >
                <div className="edit-form-grid">
                  <label className="field-label sm:col-span-2">
                    อีเมล
                    <Input
                      name="email"
                      type="email"
                      defaultValue={employee.email}
                    />
                  </label>
                  <label className="field-label">
                    AFF
                    <Input name="aff" defaultValue={employee.aff} />
                  </label>
                  <label className="field-label">
                    Discord ID
                    <Input name="discordId" defaultValue={employee.discordId} />
                  </label>
                  <label className="field-label">
                    Dynadot
                    <Input name="dynadot" defaultValue={employee.dynadot} />
                  </label>
                  <label className="field-label">
                    ผู้แนะนำ
                    <Input
                      name="referredBy"
                      defaultValue={employee.referredBy}
                    />
                  </label>
                </div>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="form-error">
                <AlertTriangle />
                {error}
              </div>
            )}
            <DialogFooter className="mt-6 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Payroll() {
  const missingSalary = hrData.summary.active - hrData.summary.salaryReady;
  const missingBank = hrData.summary.active - hrData.summary.bankReady;
  const maxSalary = Math.max(...hrData.teams.map((team) => team.salary));
  return (
    <div className="space-y-6">
      <div className="privacy-banner">
        <ShieldCheck />
        <div>
          <strong>โหมดสรุปข้อมูล</strong>
          <p>
            หน้าเงินเดือนแสดงเฉพาะยอดรวม
            ข้อมูลรายบุคคลและเลขบัญชีไม่ได้ถูกนำมาไว้ในหน้าเว็บต้นแบบ
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="ยอดเงินเดือนที่มีข้อมูล"
          value={formatMoney.format(hrData.summary.monthlyPayroll)}
          note={`${hrData.summary.salaryReady} คน`}
          icon={CircleDollarSign}
          tone="bg-emerald-50 text-emerald-700"
        />
        <SummaryCard
          label="ขาดข้อมูลเงินเดือน"
          value={`${missingSalary} คน`}
          note="ต้องเติมก่อนปิดรอบ"
          icon={AlertTriangle}
          tone="bg-rose-50 text-rose-700"
        />
        <SummaryCard
          label="ขาดข้อมูลบัญชี"
          value={`${missingBank} คน`}
          note="ตรวจเลขบัญชีและธนาคาร"
          icon={WalletCards}
          tone="bg-amber-50 text-amber-700"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">PAYROLL BY TEAM</p>
            <h2>ยอดเงินเดือนตามทีม</h2>
          </div>
          <Badge variant="outline">ข้อมูลเฉพาะผู้ยังทำงานอยู่</Badge>
        </div>
        <div className="salary-list">
          {hrData.teams.map((team) => (
            <div key={team.name} className="salary-row">
              <div>
                <strong>{team.name}</strong>
                <span>{team.headcount} คน</span>
              </div>
              <div className="salary-track">
                <span
                  style={{
                    width: `${Math.max((team.salary / maxSalary) * 100, 4)}%`,
                  }}
                />
              </div>
              <b>{formatMoney.format(team.salary)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DataQuality() {
  const checks = [
    {
      name: "รหัสพนักงาน",
      ready: hrData.summary.total - hrData.summary.missingEmployeeId,
      missing: hrData.summary.missingEmployeeId,
      level: "warning",
    },
    {
      name: "เงินเดือน (พนักงานปัจจุบัน)",
      ready: hrData.summary.salaryReady,
      missing: hrData.summary.active - hrData.summary.salaryReady,
      level: "error",
    },
    {
      name: "บัญชีธนาคาร (พนักงานปัจจุบัน)",
      ready: hrData.summary.bankReady,
      missing: hrData.summary.active - hrData.summary.bankReady,
      level: "error",
    },
    {
      name: "อีเมล (พนักงานปัจจุบัน)",
      ready: hrData.summary.emailReady,
      missing: hrData.summary.active - hrData.summary.emailReady,
      level: "warning",
    },
    {
      name: "Discord ID",
      ready: 0,
      missing: hrData.summary.active,
      level: "error",
    },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.55fr]">
      <section className="panel overflow-hidden p-0">
        <div className="panel-heading px-6 pt-6">
          <div>
            <p className="section-kicker">FIELD CHECK</p>
            <h2>ความครบถ้วนของข้อมูล</h2>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              toast.info("ใช้ไฟล์ Excel เดิมเป็นแม่แบบนำเข้ารอบถัดไปได้")
            }
          >
            <RefreshCw /> ตรวจอีกครั้ง
          </Button>
        </div>
        <div className="mt-4 border-t">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>ฟิลด์</TableHead>
                <TableHead>พร้อม</TableHead>
                <TableHead>ขาด</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((check) => (
                <TableRow key={check.name}>
                  <TableCell className="font-medium">{check.name}</TableCell>
                  <TableCell>{check.ready}</TableCell>
                  <TableCell>{check.missing}</TableCell>
                  <TableCell>
                    {check.missing === 0 ? (
                      <Badge className="bg-emerald-600">ครบ</Badge>
                    ) : (
                      <Badge
                        variant={
                          check.level === "error" ? "destructive" : "secondary"
                        }
                      >
                        ต้องตรวจ
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <aside className="panel">
        <p className="section-kicker">IMPORT MAP</p>
        <h2 className="mt-1 text-lg font-semibold">โครงสร้างจาก Excel</h2>
        <div className="mapping-list">
          {[
            "รายชื่อพนักงาน → Employee Master",
            "MEMBER → Active Employee View",
            "แจ้งลาออก → Offboarding",
            "สรุปจำนวนพนักงาน → Dashboard",
            "TELEGRAM → Contact Channel",
          ].map((item, index) => (
            <div key={item}>
              <span>{index + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium">แหล่งข้อมูลล่าสุด</p>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {hrData.source.name}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            อ้างอิงข้อมูล ณ {hrData.source.updatedAt}
          </p>
        </div>
      </aside>
    </div>
  );
}

function AddEmployeeDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (employee: Partial<Employee>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const id = String(form.get("id") || "").trim();
    const nickname = String(form.get("nickname") || "").trim();
    if (!id || !nickname) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        id,
        nickname,
        fullName: String(form.get("fullName") || "").trim(),
        team: String(form.get("team") || "ทีม 1"),
        position: String(form.get("position") || "Staff"),
        employment: String(form.get("employment") || "FullTime"),
        status: "ยังทำงานอยู่",
        probation: "ยังไม่ผ่าน",
        startDate: String(
          form.get("startDate") || new Date().toISOString().slice(0, 10),
        ),
      });
      formElement.reset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "เพิ่มพนักงานไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>เพิ่มพนักงาน</DialogTitle>
            <DialogDescription>
              บันทึกข้อมูลพื้นฐานก่อน
              แล้วค่อยเพิ่มข้อมูลเงินเดือนในหน้าที่จำกัดสิทธิ์
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="field-label">
              รหัสพนักงาน
              <Input name="id" required placeholder="เช่น 0341" />
            </label>
            <label className="field-label">
              ชื่อเล่น
              <Input name="nickname" required placeholder="ชื่อที่ใช้ในทีม" />
            </label>
            <label className="field-label sm:col-span-2">
              ชื่อ–นามสกุล
              <Input name="fullName" />
            </label>
            <label className="field-label">
              ทีม
              <select name="team" className="native-select">
                {hrData.teams.map((team) => (
                  <option key={team.name}>{team.name}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              ตำแหน่ง
              <select name="position" className="native-select">
                <option>Staff</option>
                <option>Parttime</option>
                <option>Senior-staff</option>
                <option>Head</option>
              </select>
            </label>
            <label className="field-label">
              ประเภทการจ้าง
              <select name="employment" className="native-select">
                <option>FullTime</option>
                <option>FullTime นผก</option>
                <option>Freelancer</option>
              </select>
            </label>
            <label className="field-label">
              วันที่เริ่มงาน
              <Input
                name="startDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>
          {error && (
            <div className="form-error">
              <AlertTriangle />
              {error}
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "กำลังบันทึก..." : "บันทึกพนักงาน"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PeopleOSClient() {
  const [view, setView] = useState<View>("dashboard");
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [addOpen, setAddOpen] = useState(false);
  const [access, setAccess] = useState<{
    currentUser: {
      email: string;
      displayName: string;
      role: "employee" | "hr" | "audit";
    };
    permissions: View[];
  } | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const currentTitle = viewTitles[view];
  const visibleNavItems = access
    ? navItems.filter((item) => access.permissions.includes(item.id))
    : [];

  async function loadAccess() {
    setAccessLoading(true);
    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const result = (await response.json()) as {
        currentUser?: {
          email: string;
          displayName: string;
          role: "employee" | "hr" | "audit";
        };
        permissions?: View[];
        error?: string;
      };
      if (!response.ok || !result.currentUser || !result.permissions)
        throw new Error(result.error || "โหลดสิทธิ์ผู้ใช้งานไม่สำเร็จ");
      setAccess({
        currentUser: result.currentUser,
        permissions: result.permissions,
      });
      setView((current) =>
        result.permissions!.includes(current)
          ? current
          : result.permissions![0] || "dashboard",
      );
    } catch (error) {
      setAccess(null);
      toast.error(
        error instanceof Error ? error.message : "โหลดสิทธิ์ผู้ใช้งานไม่สำเร็จ",
      );
    } finally {
      setAccessLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/employees", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          employees?: Employee[];
          error?: string;
        };
        if (!response.ok || !result.employees)
          throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
        if (active) setEmployees(result.employees);
      })
      .catch((loadError) => {
        toast.error("ยังโหลดฐานข้อมูลไม่ได้", {
          description:
            loadError instanceof Error ? loadError.message : "กรุณาลองใหม่",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadAccess();
  }, []);

  function updateEmployeeInList(employee: Employee) {
    setEmployees((current) =>
      current.map((item) => (item.id === employee.id ? employee : item)),
    );
  }

  async function addEmployee(employee: Partial<Employee>) {
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(employee),
    });
    const result = (await response.json()) as {
      employee?: Employee;
      error?: string;
    };
    if (!response.ok || !result.employee)
      throw new Error(result.error || "เพิ่มพนักงานไม่สำเร็จ");
    setEmployees((current) => [result.employee!, ...current]);
    setAddOpen(false);
    toast.success(`เพิ่ม ${result.employee.nickname} เรียบร้อยแล้ว`, {
      description: "ข้อมูลถูกบันทึกในฐานข้อมูลแล้ว",
    });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="px-4 py-5">
          <div className="brand-lockup">
            <span className="brand-mark">
              <Users />
            </span>
            <div>
              <strong>PEOPLE OS</strong>
              <small>SEO Department</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>เมนูหลัก</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={view === item.id}
                      onClick={() => setView(item.id)}
                      className="h-10"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="sidebar-user">
            <span>{access?.currentUser.role.toUpperCase() || "..."}</span>
            <div>
              <strong>
                {access?.currentUser.displayName || "กำลังโหลด..."}
              </strong>
              <small>{access?.currentUser.email || "ตรวจสอบสิทธิ์"}</small>
            </div>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
                window.location.href = "/login";
              }}
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden">
              <Menu />
            </SidebarTrigger>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <CalendarDays className="size-4" /> ข้อมูล ณ 22 กันยายน 2569
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:flex"
            >
              ข้อมูลพร้อมใช้งาน
            </Badge>
            <Button variant="ghost" size="icon" aria-label="ตั้งค่า">
              <Settings2 />
            </Button>
            <span className="top-avatar">HR</span>
          </div>
        </header>

        <div className="page-shell">
          <div className="page-title-row">
            <div>
              <p className="page-kicker">{currentTitle.eyebrow}</p>
              <h1>{currentTitle.title}</h1>
              <p>{currentTitle.description}</p>
            </div>
            {view !== "dashboard" && (
              <Button variant="outline" onClick={() => setView("dashboard")}>
                <LayoutDashboard /> กลับหน้าภาพรวม
              </Button>
            )}
          </div>

          {accessLoading && (
            <section className="panel flex min-h-64 items-center justify-center">
              <Loader2 className="animate-spin text-indigo-600" />
            </section>
          )}
          {!accessLoading && !access && (
            <section className="panel flex min-h-64 flex-col items-center justify-center text-center">
              <ShieldAlert className="mb-3 size-10 text-rose-500" />
              <h2 className="font-semibold">
                ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                กรุณาเข้าสู่ระบบแล้วลองใหม่อีกครั้ง
              </p>
              <Button className="mt-4" onClick={() => void loadAccess()}>
                <RefreshCw /> ลองใหม่
              </Button>
            </section>
          )}
          {!accessLoading && access && view === "dashboard" && (
            <Dashboard
              employees={employees}
              onNavigate={(next) =>
                access.permissions.includes(next) && setView(next)
              }
            />
          )}
          {!accessLoading && access && view === "employees" && (
            <Directory
              employees={employees}
              mode="all"
              onAdd={() => setAddOpen(true)}
              onEmployeeSaved={updateEmployeeInList}
            />
          )}
          {!accessLoading && access && view === "members" && (
            <Directory
              employees={employees}
              mode="members"
              onAdd={() => setAddOpen(true)}
              onEmployeeSaved={updateEmployeeInList}
            />
          )}
          {!accessLoading && access && view === "attendance" && (
            <AttendancePanel />
          )}
          {!accessLoading && access && view === "resignations" && (
            <Directory
              employees={employees}
              mode="resignations"
              onAdd={() => setAddOpen(true)}
              onEmployeeSaved={updateEmployeeInList}
            />
          )}
          {!accessLoading && access && view === "advances" && (
            <AdvancePanel employees={employees} />
          )}
          {!accessLoading && access && view === "warnings" && <WarningPanel />}
          {!accessLoading && access && view === "payroll" && (
            <PayrollPanel employees={employees} />
          )}
          {!accessLoading && access && view === "data" && <DataQuality />}
          {!accessLoading && access && view === "access" && (
            <AccessPanel onAccessChanged={() => void loadAccess()} />
          )}
        </div>
      </SidebarInset>

      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={addEmployee}
      />
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
