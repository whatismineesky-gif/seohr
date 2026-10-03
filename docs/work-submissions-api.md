# API ตารางส่งงานใหม่

API อ่านข้อมูลส่งงานสำหรับการเชื่อมต่อจากเซิร์ฟเวอร์ของระบบอื่น ใช้ได้ตลอดเวลา รวมถึงหลังปิดรับส่งงาน 10:00 น.

## สร้าง API Key

1. เข้าระบบ People OS ด้วยบัญชี HR ที่มีสิทธิ์เมนู **ตารางส่งงานใหม่**
2. เปิดแท็บ **API / เชื่อมระบบ**
3. ระบุชื่อระบบ เลือกสิทธิ์ **เฉพาะทีม** หรือ **ทั้งหมด** และวันหมดอายุ (ค่าเริ่มต้น 90 วัน)
4. กด **สร้าง API Key** แล้วคัดลอก Key ไปเก็บในตัวแปรสภาพแวดล้อมของเซิร์ฟเวอร์ปลายทาง
5. Key เต็มแสดงเพียงครั้งเดียว ถ้าทำหายให้ปิด Key เดิมและสร้างใหม่

HR ดูชื่อระบบ สิทธิ์ วันหมดอายุ ผู้สร้าง และเวลาเรียกใช้งานล่าสุดได้ พร้อมปุ่มปิดใช้งาน Key

## เรียกข้อมูล

```http
GET https://dev.member-seo.com/api/integrations/work-submissions?date=2026-10-03&page=1
Authorization: Bearer YOUR_API_KEY
```

| พารามิเตอร์ | ความหมาย |
| --- | --- |
| `date` | วันที่ในช่องวันที่ของรายการส่งงาน รูปแบบ `YYYY-MM-DD` |
| `submittedDate` | วันที่กดบันทึกจริงตามเวลา `Asia/Bangkok` รูปแบบ `YYYY-MM-DD` |
| `team` | ตัวกรองชื่อทีม เช่น `ทีม 1` ภายในสิทธิ์ของ Key; `__unassigned__` หมายถึงยังไม่ระบุทีม |
| `page` | หน้าที่ต้องการ เริ่มที่ `1` หน้าละ `100` รายการ |

ต้องระบุ `date` หรือ `submittedDate` อย่างน้อยหนึ่งค่า ถ้าระบุทั้งสองจะเลือกงานที่ตรงทั้งสองเงื่อนไข Key เฉพาะทีมจะกรองทีมนั้นเสมอ และขอทีมอื่นไม่ได้ ใช้ URLSearchParams เพื่อเข้ารหัสชื่อทีมภาษาไทย

วันส่งจริงนับตั้งแต่ 00:00:00 ถึงก่อน 00:00:00 ของวันถัดไปตามเวลาไทย และยังคงเป็นวันส่งเดิมแม้มีการแก้ไขรายการภายหลัง

## ตัวอย่าง JSON (ข้อมูลสมมติ)

```json
{
  "items": [
    {
      "id": 101,
      "employeeId": "EMP001",
      "name": "ชื่อผู้ส่ง",
      "team": "ทีม 1",
      "keyword": "คีย์ตัวอย่าง",
      "website": "https://example.com",
      "date": "2026-10-03",
      "parentWebsite": "https://parent.example.com",
      "type": "new",
      "typeLabel": "เว็บใหม่",
      "submittedAt": "2026-10-03T01:15:00.000Z",
      "updatedAt": "2026-10-03T01:20:00.000Z"
    }
  ],
  "date": "2026-10-03",
  "submittedDate": null,
  "timezone": "Asia/Bangkok",
  "page": 1,
  "pageSize": 100,
  "total": 1,
  "totalPages": 1,
  "hasMore": false,
  "nextPage": null
}
```

- `type`: `new` = เว็บใหม่, `301` = เว็บ 301, `301_new` = เว็บ 301 ขึ้นใหม่
- `submittedAt` และ `updatedAt` เป็น ISO 8601 เวลา UTC (`Z`); แปลงเป็นเวลาไทยก่อนแสดง
- `employeeId` อาจเป็น `null` เมื่อบัญชีผู้ส่งยังไม่เชื่อมพนักงาน; `team` อาจเป็นข้อความว่าง
- ข้อมูลเรียงตาม `id` จากน้อยไปมาก การแก้ไขจะคง `id` เดิม
- API ไม่คืนอีเมล รหัสผ่าน API Key หรือข้อมูลเงินเดือน
- ไม่พบข้อมูลคืน `200` พร้อม `items: []`, `total: 0`, `totalPages: 0`

## ตัวอย่าง Node.js (เรียกจากเซิร์ฟเวอร์)

กำหนดตัวแปร `PEOPLE_OS_API_KEY` ในระบบปลายทาง แล้วเรียกฟังก์ชันนี้:

```js
async function readDailySubmissions(date) {
  const token = process.env.PEOPLE_OS_API_KEY;
  if (!token) throw new Error('Missing PEOPLE_OS_API_KEY');
  const items = [];
  let page = 1;
  while (page !== null) {
    const params = new URLSearchParams({ date, page: String(page) });
    const response = await fetch(
      `https://dev.member-seo.com/api/integrations/work-submissions?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.status === 429) {
      const seconds = Math.max(1, Number(response.headers.get('Retry-After') || 60));
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      continue;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    items.push(...data.items);
    page = data.nextPage;
  }
  return items;
}
```

หากต้องการวันกดส่งจริง ให้เปลี่ยนพารามิเตอร์ `date` เป็น `submittedDate`

ระบบปลายทางควรบันทึกด้วย `id` เป็นคีย์อ้างอิงและอัปเดตรายการเดิมทุกครั้งที่ดึงซ้ำ เพื่อรับการแก้ไขคีย์ เว็บ ประเภท หรือวันที่ ดึงวันเดียวซ้ำหลังปิดรับแก้ไข 10:00 น. หรือดึงทั้งวันที่เก่าและใหม่หากวันที่ในงานเปลี่ยน การแบ่งหน้ามีความสอดคล้องภายในคำขอเดียว แต่หลายคำขอไม่ใช่ snapshot เดียวกัน จึงควรดึงซ้ำหลังปิดรับงาน

## สถานะตอบกลับ

| HTTP | ความหมาย |
| --- | --- |
| `200` | ดึงข้อมูลสำเร็จ |
| `400` | ตัวกรองไม่ถูกต้อง เช่น วันที่ผิดรูปแบบ ไม่ระบุวันที่ หรือใช้พารามิเตอร์ที่ไม่รองรับ |
| `401` | ไม่ได้ส่ง Key, Key ไม่ถูกต้อง, หมดอายุ หรือถูกปิดใช้งาน |
| `403` | ขอข้อมูลเกินสิทธิ์ทีม |
| `405` | ใช้เมธอดอื่นนอกเหนือจาก GET |
| `429` | เกิน 60 คำขอต่อนาทีต่อ Key ให้รอตาม `Retry-After` (วินาที) |
| `500` | ระบบไม่สามารถโหลดข้อมูลได้ |

API ใช้ Bearer Key จาก Authorization header เท่านั้น ไม่รับ Key ผ่าน URL และไม่ต้องใช้ session ล็อกอิน หน้าเว็บทั่วไปจะไม่มีสิทธิ์อ่าน API Key ของ HR คำขอสำเร็จและล้มเหลวไม่อนุญาตให้ cache
