CREATE TABLE hr_system_announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL, message TEXT NOT NULL,
 show_at TEXT NOT NULL, starts_at TEXT NOT NULL, estimated_ends_at TEXT NOT NULL,
 affected_menus TEXT NOT NULL, pause_writes INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','completed','cancelled')),
 created_by_email TEXT NOT NULL, created_by_name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT, cancelled_at TEXT, updated_by_email TEXT,
 CHECK(show_at <= starts_at AND starts_at < estimated_ends_at)
);
CREATE INDEX hr_system_announcements_schedule ON hr_system_announcements(status,show_at);
CREATE TRIGGER hr_notify_system_announcement AFTER INSERT ON hr_system_announcements BEGIN
 INSERT INTO hr_notifications(employee_id,source_kind,source_id,actor_email,actor_name,event_date,action,details)
 VALUES('', 'system_announcement', NEW.id, NEW.created_by_email, NEW.created_by_name,
 date(NEW.starts_at,'+7 hours'), 'announcement', json_object('title',NEW.title,'message',NEW.message,'showAt',NEW.show_at,'startsAt',NEW.starts_at,'estimatedEndsAt',NEW.estimated_ends_at,'affectedMenus',json(NEW.affected_menus),'pauseWrites',NEW.pause_writes));
END;
CREATE TRIGGER hr_notify_system_announcement_complete AFTER UPDATE OF status ON hr_system_announcements
WHEN NEW.status = 'completed' AND OLD.status <> 'completed' BEGIN
 INSERT INTO hr_notifications(employee_id,source_kind,source_id,actor_email,actor_name,event_date,action,details)
 VALUES('', 'system_announcement_complete', NEW.id, NEW.updated_by_email, NEW.updated_by_email,
 date(NEW.completed_at,'+7 hours'), 'completed', json_object('title',NEW.title,'message','อัปเดตระบบเรียบร้อยแล้ว สามารถใช้งานได้ตามปกติ','startsAt',NEW.starts_at,'estimatedEndsAt',NEW.estimated_ends_at,'affectedMenus',json(NEW.affected_menus),'pauseWrites',0));
END;
