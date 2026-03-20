-- Add scanner_uploads_used column for 5-upload limit
-- When uploads reach 5, scanner is reset to 0 (user must pay again)
-- Run after add-scanner-column.sql

ALTER TABLE members ADD COLUMN scanner_uploads_used INT DEFAULT 0;
