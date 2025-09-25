-- Add send_reminders column (if it doesn’t exist)
alter table providers
add column if not exists send_reminders boolean default true;

-- Backfill: set existing NULL values to true
update providers
set send_reminders = true
where send_reminders is null;

-- Enforce default true going forward
alter table providers
alter column send_reminders set default true;
