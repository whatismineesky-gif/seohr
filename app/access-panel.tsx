"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Download,
  Loader2,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
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
  loginUsername: string;
};
type Employee = {
  id: string;
  nickname: string;
  team: string;
  email: string;
  status: string;
};
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
  employee: ["attendance"],
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
  const [bulkSearch, setBulkSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    loginUsername: "",
    password: "",
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
      loginUsername: user.loginUsername || "",
      password: "",
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
        loginUsername: "",
        password: "",
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

  async function downloadCredentials(
    rows: Array<{
      employeeId: string;
      nickname: string;
      team: string;
      username: string;
      password: string;
    }>,
  ) {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["รหัสพนักงาน", "ชื่อเล่น", "ทีม", "Username", "รหัสผ่านเริ่มต้น", "สิทธิ์"],
      ...rows.map((row) => [
        row.employeeId,
        row.nickname,
        row.team,
        row.username,
        row.password,
        "ลงเวลางาน",
      ]),
    ]);
    worksheet["!cols"] = [14, 18, 14, 20, 22, 18].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ข้อมูลเข้าสู่ระบบ");
    XLSX.writeFile(workbook, `employee-login-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function createUsersBulk() {
    if (!selectedEmployeeIds.length || bulkSaving) return;
    setBulkSaving(true);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "bulk_create_employee_users",
          employeeIds: selectedEmployeeIds,
        }),
      });
      const result = (await response.json()) as {
        created?: Array<{
          employeeId: string;
          nickname: string;
          team: string;
          username: string;
          password: string;
        }>;
        skipped?: Array<{ employeeId: string; reason: string }>;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "สร้าง User แบบกลุ่มไม่สำเร็จ");
      const created = result.created ?? [];
      if (created.length) await downloadCredentials(created);
      toast.success(`สร้าง User สำเร็จ ${created.length} คน`, {
        description: result.skipped?.length
          ? `ข้าม ${result.skipped.length} คน เนื่องจากมีบัญชีแล้วหรือข้อมูลไม่พร้อม`
          : "ดาวน์โหลดไฟล์ Username และรหัสผ่านแล้ว",
      });
      setSelectedEmployeeIds([]);
      await load();
      onAccessChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "สร้าง User แบบกลุ่มไม่สำเร็จ",
      );
    } finally {
      setBulkSaving(false);
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
  const linkedEmployeeIds = new Set(
    data.users.map((user) => user.employeeId).filter(Boolean),
  );
  const bulkSearchTerm = bulkSearch.trim().toLocaleLowerCase("th-TH");
  const availableEmployees = data.employees.filter((employee) => {
    if (employee.status === "ลาออก" || linkedEmployeeIds.has(employee.id))
      return false;
    if (!bulkSearchTerm) return true;
    return [employee.id, employee.nickname, employee.team, employee.status]
      .filter(Boolean)
      .some((value) =>
        value.toLocaleLowerCase("th-TH").includes(bulkSearchTerm),
      );
  });
  const allVisibleSelected =
    availableEmployees.length > 0 &&
    availableEmployees.every((employee) =>
      selectedEmployeeIds.includes(employee.id),
    );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
      <TabsList>
        <TabsTrigger value="permissions">
          <ShieldCheck /> กำหนดสิทธิ์
        </TabsTrigger>
        <TabsTrigger value="users">
          <Users /> ผู้ใช้งานในระบบ
        </TabsTrigger>
        <TabsTrigger value="bulk-users">
          <UserPlus /> สร้าง User แบบกลุ่ม
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
              Username สำหรับ Login
              <Input
                value={form.loginUsername}
                onChange={(event) =>
                  setForm({ ...form, loginUsername: event.target.value })
                }
                placeholder="เช่น minee03"
                autoComplete="off"
              />
            </label>
            <label className="field-label">
              รหัสผ่านเริ่มต้น
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder="อย่างน้อย 8 ตัวอักษร"
                autoComplete="new-password"
              />
              <span className="text-xs font-normal text-muted-foreground">
                ผู้ใช้เดิมปล่อยว่างได้ หากไม่ต้องการเปลี่ยนรหัสผ่าน
              </span>
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
            disabled={saving || !form.email || !form.loginUsername}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์ผู้ใช้งาน"}
          </Button>
        </section>
      </TabsContent>

      <TabsContent value="bulk-users">
        <section className="panel overflow-hidden p-0">
          <div className="panel-heading gap-4 px-6 pt-6">
            <div>
              <p className="section-kicker">BULK USER CREATION</p>
              <h2>สร้าง User พนักงานแบบกลุ่ม</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Username ใช้รหัสพนักงาน ระบบจะสุ่มรหัสผ่านเฉพาะบุคคล
                และให้สิทธิ์เฉพาะเมนูลงเวลางาน
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                value={bulkSearch}
                onChange={(event) => setBulkSearch(event.target.value)}
                placeholder="ค้นหารหัส ชื่อ หรือทีม"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y bg-slate-50 px-6 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => {
                  const visibleIds = availableEmployees.map((item) => item.id);
                  setSelectedEmployeeIds((current) =>
                    allVisibleSelected
                      ? current.filter((id) => !visibleIds.includes(id))
                      : Array.from(new Set([...current, ...visibleIds])),
                  );
                }}
                className="size-4 accent-indigo-600"
              />
              เลือกทั้งหมดที่แสดง ({availableEmployees.length} คน)
            </label>
            <Badge variant="outline">
              เลือกแล้ว {selectedEmployeeIds.length} คน
            </Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow>
                  <TableHead className="w-14">เลือก</TableHead>
                  <TableHead>พนักงาน</TableHead>
                  <TableHead>ทีม</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>Username ที่จะสร้าง</TableHead>
                  <TableHead>สิทธิ์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableEmployees.map((employee) => {
                  const selected = selectedEmployeeIds.includes(employee.id);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setSelectedEmployeeIds((current) =>
                              selected
                                ? current.filter((id) => id !== employee.id)
                                : [...current, employee.id],
                            )
                          }
                          className="size-4 accent-indigo-600"
                          aria-label={`เลือก ${employee.nickname}`}
                        />
                      </TableCell>
                      <TableCell>
                        <strong>{employee.nickname}</strong>
                        <div className="text-xs text-muted-foreground">
                          {employee.id}
                        </div>
                      </TableCell>
                      <TableCell>{employee.team}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{employee.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{employee.id}</TableCell>
                      <TableCell>
                        <Badge className="bg-violet-600">ลงเวลางาน</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!availableEmployees.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      ไม่พบพนักงานที่ยังไม่มี User
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-5">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              ไฟล์รหัสผ่านจะดาวน์โหลดเพียงครั้งเดียวหลังสร้างสำเร็จ
              กรุณาเก็บไฟล์ให้ปลอดภัยและส่งรหัสให้พนักงานเป็นรายบุคคล
            </p>
            <Button
              onClick={() => void createUsersBulk()}
              disabled={!selectedEmployeeIds.length || bulkSaving}
            >
              {bulkSaving ? <Loader2 className="animate-spin" /> : <Download />}
              {bulkSaving
                ? "กำลังสร้าง User..."
                : `สร้าง ${selectedEmployeeIds.length} User และดาวน์โหลดไฟล์`}
            </Button>
          </div>
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
                      <div className="text-xs text-indigo-600">
                        Username: {user.loginUsername || "ยังไม่ได้กำหนด"}
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
