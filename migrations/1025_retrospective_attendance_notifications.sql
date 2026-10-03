-- Notify HR about new edits/deletions that touch a past Bangkok work date.
-- The audit log and notification are written in the same transaction.
CREATE TRIGGER hr_notify_retrospective_attendance AFTER INSERT ON hr_attendance_audit_logs
WHEN NEW.action IN ('edit', 'delete')
 AND (NEW.previous_record_date < date(NEW.created_at, '+7 hours')
      OR NEW.new_record_date < date(NEW.created_at, '+7 hours'))
 AND COALESCE((SELECT source_type FROM hr_attendance_records WHERE id = NEW.attendance_record_id), 'manual') <> 'work_audit'
 AND (NEW.action = 'delete' OR NEW.previous_record_date IS NOT NEW.new_record_date
      OR NEW.previous_record_type IS NOT NEW.new_record_type OR NEW.previous_reason IS NOT NEW.new_reason)
BEGIN
 INSERT INTO hr_notifications(employee_id, source_kind, source_id, actor_email, actor_user_id, actor_name, event_date, action, details)
 VALUES(NEW.employee_id, 'attendance_retro', NEW.id, NEW.actor_email, NEW.actor_user_id, NEW.actor_display_name,
 COALESCE(NEW.previous_record_date, NEW.new_record_date), NEW.action,
 json_object('employeeId', NEW.employee_id,
   'employeeName', NEW.employee_nickname,
   'team', COALESCE((SELECT team FROM hr_employees WHERE id = NEW.employee_id), ''),
   'oldDate', NEW.previous_record_date, 'newDate', NEW.new_record_date,
   'oldStatus', NEW.previous_record_type,
   'newStatus', CASE WHEN NEW.action = 'delete' THEN
     CASE WHEN EXISTS(SELECT 1 FROM hr_attendance_records
       WHERE employee_id = NEW.employee_id AND record_date = NEW.previous_record_date
         AND id <> NEW.attendance_record_id) THEN 'remaining' ELSE 'working' END
     ELSE NEW.new_record_type END,
   'oldReason', NEW.previous_reason, 'newReason', NEW.new_reason,
   'reason', COALESCE(NEW.new_reason, NEW.previous_reason),
   'attendanceRecordId', NEW.attendance_record_id, 'auditLogId', NEW.id));
END;
