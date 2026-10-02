CREATE TABLE hr_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id TEXT NOT NULL,
 source_kind TEXT NOT NULL, source_id INTEGER NOT NULL,
 actor_email TEXT NOT NULL, actor_user_id TEXT NOT NULL DEFAULT '', actor_name TEXT NOT NULL DEFAULT '',
 event_date TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source_kind, source_id)
);
CREATE INDEX hr_notifications_employee_id ON hr_notifications(employee_id, id DESC);
CREATE TABLE hr_notification_reads (
 user_email TEXT NOT NULL, notification_id INTEGER NOT NULL REFERENCES hr_notifications(id) ON DELETE CASCADE,
 read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_email, notification_id)
);
CREATE TRIGGER hr_notify_attendance_create AFTER INSERT ON hr_attendance_records WHEN NEW.source_type <> 'work_audit' BEGIN
 INSERT INTO hr_notifications(employee_id, source_kind, source_id, actor_email, actor_user_id, actor_name, event_date, action, details)
 VALUES(NEW.employee_id,'attendance_create',NEW.id,NEW.recorder_email,NEW.recorder_user_id,NEW.recorder_email,NEW.record_date,'create',
 json_object('newStatus',NEW.record_type,'reason',NEW.reason));
END;
CREATE TRIGGER hr_notify_attendance_change AFTER INSERT ON hr_attendance_audit_logs
 WHEN COALESCE((SELECT source_type FROM hr_attendance_records WHERE id = NEW.attendance_record_id), 'manual') <> 'work_audit'
 AND (NEW.action = 'delete' OR NEW.previous_record_date IS NOT NEW.new_record_date
 OR NEW.previous_record_type IS NOT NEW.new_record_type OR NEW.previous_reason IS NOT NEW.new_reason) BEGIN
 INSERT INTO hr_notifications(employee_id, source_kind, source_id, actor_email, actor_user_id, actor_name, event_date, action, details)
 VALUES(NEW.employee_id,'attendance_change',NEW.id,NEW.actor_email,NEW.actor_user_id,NEW.actor_display_name,
 COALESCE(NEW.new_record_date,NEW.previous_record_date),NEW.action,
 json_object('oldDate',NEW.previous_record_date,'newDate',NEW.new_record_date,'oldStatus',NEW.previous_record_type,'newStatus',NEW.new_record_type,'oldReason',NEW.previous_reason,'newReason',NEW.new_reason,'reason',COALESCE(NEW.new_reason,NEW.previous_reason)));
END;
CREATE TRIGGER hr_notify_work_review AFTER INSERT ON hr_daily_work_review_logs
 WHEN NEW.previous_status IS NOT NEW.new_status OR NEW.previous_submitted_count IS NOT NEW.new_submitted_count
 OR NEW.previous_reason IS NOT NEW.new_reason OR NEW.previous_target_count IS NOT NEW.new_target_count BEGIN
 INSERT INTO hr_notifications(employee_id, source_kind, source_id, actor_email, actor_user_id, actor_name, event_date, action, details)
 VALUES(NEW.employee_id,'work_review',NEW.id,NEW.actor_email,NEW.actor_user_id,NEW.actor_display_name,NEW.review_date,'review',
 json_object('oldStatus',NEW.previous_status,'newStatus',NEW.new_status,'oldCount',NEW.previous_submitted_count,'newCount',NEW.new_submitted_count,'oldTarget',NEW.previous_target_count,'newTarget',NEW.new_target_count,'reason',COALESCE(NULLIF(NEW.change_reason,''),NEW.new_reason)));
END;
CREATE TRIGGER hr_notify_employee_target AFTER INSERT ON hr_employee_daily_work_target_logs BEGIN
 INSERT INTO hr_notifications(employee_id, source_kind, source_id, actor_email, actor_name, event_date, action, details)
 VALUES(NEW.employee_id,'employee_target',NEW.id,NEW.actor_email,NEW.actor_name,NEW.effective_date,'target',
 json_object('oldTarget',NEW.previous_target,'newTarget',NEW.new_target));
END;
