"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";

type Role = "employee" | "hr" | "audit";
type UserRow = {
  email: string;
  displayName: string;
  role: Role;
  employeeId: string;
  nickname: string;
  team: string;
  permissions: string[];
};
type Employee = { id: string; nickname: string; team: string; email: string };
type AccessData = {
  currentUser: { email: string; role: Role };
  users: UserRow[];
  employees: Employee[];
};

const roleLabels: Record<Role, string> = {
  hr: "HR / ผู้ดูแล",
  audit: "Audit",
  employee: "พนักงาน",
};
const menus = [
  ["dashboard", "ภาพรวม"],
  ["employees", "พนักงานทั้งหมด"],
  ["members", "MEMBER"],
  ["attendance", "ลงเวลางาน"],
  ["resignations", "แจ้งลาออก"],
  ["advances", "บันทึกรายการเบิก"],
  ["warnings", "บันทึกใบเตือน"],
  ["payroll", "คำนวณเงินเดือน"],
  ["data", "นำเข้าและตรวจข้อมูล"],
  ["access", "สิทธิ์ผู้ใช้งาน"],
] as const;

const defaults: Record<Role, string[]> = {
  hr: menus.map(([id]) => id),
  audit: ["dashboard", "employees", "members", "attendance"],
  employee: ["dashboard", "attendance"],
};

export function AccessPanel({
  onAccessChanged,
}: {
  onAccessChanged: () => void;
}) {
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("permissions");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    email: "",
    role: "employee" as Role,
    employeeId: "",
    permissions: defaults.employee,
  });

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const result = (await response.json()) as AccessData & { error?: string };
      if (!response.ok) throw new Error(result.error || "โหลดสิทธิ์ไม่สำเร็จ");
      setData(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดสิทธิ์ไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function changeRole(nextRole: Role) {
    setForm((current) => ({
      ...current,
      role: nextRole,
      permissions: defaults[nextRole],
    }));
  }

  function togglePermission(menuId: string) {
    if (form.role === "hr" && menuId === "access") return;
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(menuId)
        ? current.permissions.filter((id) => id !== menuId)
        : [...current.permissions, menuId],
    }));
  }

  function editUser(user: UserRow) {
    setForm({
      email: user.email,
      role: user.role,
      employeeId: user.employeeId || "",
      permissions: user.permissions,
    });
    setActiveTab("permissions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "บันทึกสิทธิ์ไม่สำเร็จ");
      toast.success("บันทึกสิทธิ์ผู้ใช้งานแล้ว");
      setForm({
        email: "",
        role: "employee",
        employeeId: "",
        permissions: defaults.employee,
      });
      await load();
      onAccessChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกสิทธิ์ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <section className="panel flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" />
      </section>
    );
  if (!data) return null;

  const searchTerm = search.trim().toLocaleLowerCase("th-TH");
  const filteredUsers = data.users.filter((user) => {
    if (!searchTerm) return true;
    return [
      user.displayName,
      user.email,
      roleLabels[user.role],
      user.employeeId,
      user.nickname,
      user.team,
    ]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase("th-TH").includes(searchTerm));
  });

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
      <TabsList>
        <TabsTrigger value="permissions">
          <ShieldCheck /> กำหนดสิทธิ์
        </TabsTrigger>
        <TabsTrigger value="users">
          <Users /> ผู้ใช้งานในระบบ
        </TabsTrigger>
      </TabsList>

      <TabsContent value="permissions">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">USER ACCESS</p>
              <h2>กำหนดสิทธิ์การเข้าเมนู</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เพิ่มอีเมลผู้ใช้งาน เลือกบทบาท
                และเปิดเฉพาะเมนูที่ต้องการให้ใช้งาน
              </p>
            </div>
            <ShieldCheck className="text-indigo-600" />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <label className="field-label">
              อีเมลผู้ใช้งาน
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="name@company.com"
              />
            </label>
            <label className="field-label">
              บทบาท
              <select
                className="native-select"
                value={form.role}
                onChange={(event) => changeRole(event.target.value as Role)}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              เชื่อมกับพนักงาน
              <SearchableEmployeeSelect
                employees={data.employees}
                value={form.employeeId}
                emptyLabel="ไม่เชื่อมพนักงาน"
                onChange={(employeeId) => {
                  const employee = data.employees.find(
                    (item) => item.id === employeeId,
                  );
                  setForm({
                    ...form,
                    employeeId,
                    email: form.email || employee?.email || "",
                  });
                }}
              />
            </label>
          </div>
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">เมนูที่อนุญาต</h3>
              <span className="text-sm text-muted-foreground">
                เลือกแล้ว {form.permissions.length} เมนู
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {menus.map(([id, label]) => {
                const selected = form.permissions.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePermission(id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${selected ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-900" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                  >
                    <span>{label}</span>
                    <span
                      className={`flex size-6 items-center justify-center rounded-full ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}
                    >
                      {selected && <Check className="size-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <Button
            className="mt-6 w-full sm:w-auto"
            onClick={save}
            disabled={saving || !form.email}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์ผู้ใช้งาน"}
          </Button>
        </section>
      </TabsContent>

      <TabsContent value="users">
        <section className="panel overflow-hidden p-0">
          <div className="panel-heading gap-4 px-6 pt-6">
            <div>
              <p className="section-kicker">ACCESS LIST</p>
              <h2>ผู้ใช้งานในระบบ</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                พบ {filteredUsers.length} จาก {data.users.length} ผู้ใช้งาน
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อ อีเมล บทบาท หรือทีม"
                aria-label="ค้นหาผู้ใช้งาน"
              />
            </div>
          </div>
          <div className="mt-4 overflow-auto border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>เชื่อมพนักงาน</TableHead>
                  <TableHead>สิทธิ์เมนู</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.email}>
                    <TableCell>
                      <strong>{user.displayName || user.email}</strong>
                      <div className="text-xs text-muted-foreground">
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <UserCog /> {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.nickname ? (
                        <>
                          <strong>{user.nickname}</strong>
                          <div className="text-xs text-muted-foreground">
                            {user.employeeId} · {user.team}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xl flex-wrap gap-1">
                        {user.permissions.map((id) => (
                          <Badge key={id} variant="secondary">
                            {menus.find(([menuId]) => menuId === id)?.[1] || id}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => editUser(user)}
                      >
                        <Pencil /> แก้ไข
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredUsers.length && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      ไม่พบผู้ใช้งานที่ตรงกับคำค้นหา
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}
