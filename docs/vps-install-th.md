# People OS บน Windows VPS — ทดลองก่อนสลับเว็บหลัก

ชื่อรุ่น: Windows VPS / Node.js

ชุดนี้ย้ายเว็บและ API มารันด้วย Node.js/Next.js บน VPS เชื่อม PostgreSQL เดิมภายในเครื่องโดยตรง ไม่ใช้ Workers หรือ Hyperdrive และไม่สร้างฐานข้อมูล/ตารางใหม่

## 1. แตกไฟล์และบิลด์

ดาวน์โหลด ZIP ลง VPS แล้วแตกไฟล์ให้ได้ `C:\PeopleOS\package.json` เปิด PowerShell แบบ Run as Administrator:

```powershell
cd C:\PeopleOS
node -v
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-VPS.ps1
```

ต้องมี Node.js อย่างน้อย 22.13.0 และอินเทอร์เน็ตสำหรับติดตั้งแพ็กเกจ ใช้ `ExecutionPolicy Bypass` เฉพาะ PowerShell ครั้งนี้ ไม่มีการเปลี่ยนนโยบายถาวร บิลด์ครั้งแรกอาจใช้หลายนาที

## 2. ตั้งการเชื่อมต่อฐานข้อมูล

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Configure-VPS.ps1
npm.cmd run check:db
```

ใส่ตำแหน่ง CA เดิม (ค่าตั้งต้น `C:\people-os-tls\ca.crt`) แล้วใส่รหัสผ่านเดิมของ `people_os_app` ในช่องที่ซ่อนข้อความ ไม่ต้องส่งรหัสผ่านในแชท ไม่ใช้รหัสผ่านของ `postgres`

สคริปต์บันทึกข้อมูลเชื่อมต่อที่ `config\runtime.json` และจำกัดสิทธิ์โฟลเดอร์ให้ SYSTEM กับ Administrators จัดการได้ และให้ LocalService ที่รันเว็บอ่านได้เท่านั้น รหัสผ่านอยู่ในไฟล์ภายใน VPS ซึ่งต้องเก็บไว้เป็นส่วนตัว ห้ามส่งไฟล์นี้หรือแนบรวมใน ZIP

ผลตรวจควรเป็น `ok: true`, `database: people_os`, `role: people_os_app`, `tables: 54`, `notification_triggers: 7`, `tls: true` จำนวนพนักงานและงานอาจเพิ่มจากตอนย้ายฐานข้อมูลแล้ว

ถ้าตรวจไม่ผ่าน หยุดขั้นตอนนี้และตรวจ PostgreSQL, CA, รหัสผ่าน, pg_hba.conf ก่อน ห้ามปิดการตรวจใบรับรองเพื่อแก้ขัด

## 3. เปิดเว็บอัตโนมัติ

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-Startup.ps1
Invoke-RestMethod http://127.0.0.1:3000/health
Get-ScheduledTask -TaskName PeopleOS-Web
```

`health` ควรแสดง `ok: True` และ `runtime: node` ถ้าเพิ่งเริ่มงาน ให้ตรวจซ้ำอีกครั้งหลังไม่กี่วินาที เว็บเปิดเฉพาะ `127.0.0.1:3000` ไม่ต้องเปิดพอร์ต 3000 หรือ 5432 ออกอินเทอร์เน็ต

ใช้ Task Scheduler ของ Windows ชื่อ `PeopleOS-Web` รันด้วย LocalService เปิดเองหลังเครื่องเริ่มทำงาน แม้ไม่มีผู้ใช้ล็อกอิน ตั้งให้เริ่มใหม่เมื่อโปรแกรมล้ม Log อยู่ `C:\PeopleOS\logs\web.log` หมุนไฟล์ประมาณ 10 MB และเก็บย้อนหลัง 5 ไฟล์

ต้องให้บริการ PostgreSQL และ Cloudflared เดิมทำงานอยู่ด้วย

## 4. ทดลองผ่านโดเมนชั่วคราว

ไปที่ Cloudflare Zero Trust แล้วเปิด Tunnel `people-os-db` ที่เชื่อมต่ออยู่ เพิ่ม Published application / Public hostname ใหม่:

- Hostname: `vps.member-seo.com`
- Service type: `HTTP`
- URL: `127.0.0.1:3000`

เก็บเส้นทางฐานข้อมูล `db-people-os.member-seo.com` เดิมไว้ เปิด `https://vps.member-seo.com/health` แล้วเปิดหน้าเว็บ `https://vps.member-seo.com` ล็อกอินด้วยบัญชีเดิม

ใช้หน้า HTTPS นี้ทดสอบล็อกอิน หน้าเช็คชื่อ การลงเวลา ตารางส่งงาน และ Export ส่วนหน้าภาพรวมให้เฉพาะ HR ตามเดิม ข้อมูลบนโดเมนทดลองเป็นฐานข้อมูลจริงชุดเดียวกับเว็บหลัก การเพิ่ม/แก้ไข/ลบจะมีผลจริง จึงควรเริ่มจากตรวจดูข้อมูลก่อน

HR เปิด `/api/database-status` ควรเห็น `activeDatabase: postgres` และ `runtime: node` ผู้ใช้ที่ไม่ใช่ HR ไม่มีสิทธิ์เปิดหน้านี้

## 5. สลับเว็บหลักหลังทดลองผ่าน

สำรอง PostgreSQL ก่อน ใช้คำสั่งสำรองเดิมของคุณ เก็บไฟล์สำรองไว้นอกโฟลเดอร์เว็บ แล้ว:

```powershell
cd C:\PeopleOS
Stop-ScheduledTask -TaskName PeopleOS-Web
node .\scripts\set-origin.mjs https://dev.member-seo.com
Start-ScheduledTask -TaskName PeopleOS-Web
```

ถ้าเว็บหยุดไม่ลง ตรวจ Task Manager ก่อนเริ่มใหม่ เพื่อไม่ให้มีสองโปรแกรมใช้พอร์ตเดียวกัน

ใน Cloudflare Workers เปิด `people-os-api` → Settings → Domains & Routes เอา Custom domain `dev.member-seo.com` ออกจาก Worker แล้วเพิ่ม hostname นี้เข้า Tunnel `people-os-db` โดยให้บริการ `HTTP` → `127.0.0.1:3000` เช่นเดียวกับโดเมนทดลอง อาจต้องแก้ DNS เดิมที่ผูก Worker ก่อนเพิ่ม route

เปิด `https://dev.member-seo.com/health` ต้องเห็น `runtime: node` จากนั้นล็อกอินและตรวจข้อมูล ถ้ายังไม่เห็นค่านี้ อย่าเพิ่งลบ Worker หรือ Hyperdrive

เมื่อเว็บหลักผ่านแล้ว ค่อยปิด/ลบ Worker เดิมและยกเลิกการดีพอยอัตโนมัติจาก GitHub อย่าให้ main ที่ยังเป็นรุ่น Worker ดีพอยกลับมาทับโดเมนอีก เก็บซอร์สรุ่น VPS ไว้เป็นรุ่นใช้งานต่อไป แล้วค่อยลบ Hyperdrive และเส้นทางฐานข้อมูลใน Tunnel หากไม่มีระบบอื่นใช้งาน ตรวจ Subscriptions แยกต่างหากหากเคยสมัคร Workers Paid — ย้ายเว็บอย่างเดียวไม่ยกเลิกค่ารายเดือน

โดเมนทดลองจะยังแสดงเว็บได้ แต่หลังเปลี่ยน origin เป็นโดเมนหลัก การล็อกอิน/บันทึกผ่านโดเมนทดลองจะถูกปฏิเสธ ให้เอา route โดเมนทดลองออกเมื่อจบ

## เปิด/หยุด/ดูสถานะ

```powershell
Start-ScheduledTask -TaskName PeopleOS-Web
Stop-ScheduledTask -TaskName PeopleOS-Web
Get-ScheduledTaskInfo -TaskName PeopleOS-Web
Get-Content C:\PeopleOS\logs\web.log -Tail 60
```

อย่าส่ง log ทั้งไฟล์โดยไม่ตรวจ เพราะอาจมีข้อมูลภายใน

## การอัปเดตรุ่นถัดไป

สร้างโฟลเดอร์ staging แยก ติดตั้งและบิลด์ให้ผ่านก่อน ไม่แตก ZIP ทับเว็บที่กำลังรัน สำรอง DB และสำรองโฟลเดอร์เว็บเดิม เก็บ `config\runtime.json` เดิมเป็นส่วนตัว จากนั้นหยุด task และสลับไฟล์รุ่นที่ผ่านแล้ว ตั้ง origin เดิมและเริ่มใหม่ ข้อมูลอยู่ PostgreSQL จึงไม่ต้อง import ข้อมูลซ้ำ

การเปลี่ยนโครงสร้างตารางให้รัน SQL ที่เตรียมสำหรับ PostgreSQL เท่านั้น ห้ามรัน migrations แบบ SQLite/D1 บน PostgreSQL

## ผลทดสอบก่อนส่งชุดติดตั้ง

บิลด์ Next.js บน Node.js และตรวจ TypeScript ผ่าน ทดสอบ API ผ่าน TCP กับ PostgreSQL จำลองในเครื่องทดสอบผ่าน ได้แก่ล็อกอิน/ออกจากระบบ Cookie แบบ Secure การป้องกัน origin การจำกัดสิทธิ์ HR และ API หลัก รวมทั้งส่ง/แก้ไข/ลบงานย้อนหลังและ Export CSV/Excel ไม่มีการเชื่อมต่อหรือแก้ไขฐานข้อมูล VPS ระหว่างทดสอบนี้

สคริปต์ Task Scheduler และสิทธิ์ไฟล์ออกแบบสำหรับ Windows PowerShell 5.1 แต่ยังต้องตรวจการทำงานจริงบน Windows VPS ของคุณ ชุดนี้ยังไม่ได้สลับเว็บหลักหรือปิด Worker ให้

## เอกสารอ้างอิง

- https://nextjs.org/docs/app/guides/self-hosting
- https://node-postgres.com/features/pooling
- https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/
