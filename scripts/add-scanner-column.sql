-- Add scanner column to members table for AI Scanner unlock status
-- Run this on your database to enable the feature.
-- scanner: 0 = locked (default), 1 = unlocked

ALTER TABLE members ADD COLUMN scanner TINYINT(1) DEFAULT 0;

-- To unlock for a specific user:
-- UPDATE members SET scanner = 1 WHERE email = 'user@example.com';
