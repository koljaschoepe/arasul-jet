-- Migration 068: Add role column to admin_users for RBAC
-- All existing users get 'admin' role (backwards compatible)

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin';

COMMENT ON COLUMN admin_users.role IS 'User role: admin, viewer (future)';
