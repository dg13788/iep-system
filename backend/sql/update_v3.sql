-- ============================================================
-- IEP System v3 - Permission Groups Migration
-- 权限组管理改造：从硬编码角色升级为后台可配置权限组
--
-- 【回测修复说明】
-- 原脚本存在两个叠加的致命缺陷，导致升级后权限组表被清空、系统不可用：
--   1) 第 12 行 DROP TABLE permission_groups，无条件清空已有权限配置；
--   2) 第 32 行使用 ADD COLUMN IF NOT EXISTS —— 这是 MariaDB 专有语法，
--      MySQL 8.0 不支持，语句抛出 ERROR 1064 并中止整个脚本，
--      使得其后的「初始化 6 个权限组」段落永远不会执行。
--      两者叠加的后果：表被删了，数据却没回填 → 权限组 0 行。
--
-- 本版本改为 MySQL 8.0 原生兼容的幂等写法：
--   - 不 DROP 任何表，改为 CREATE TABLE IF NOT EXISTS；
--   - 条件 DDL 通过 information_schema 查询 + 预处理语句实现；
--   - 种子数据使用 INSERT ... ON DUPLICATE KEY UPDATE，可重复执行。
-- ============================================================

SET NAMES utf8mb4;
SET @db = DATABASE();

-- ============================================================
-- A. Create permission_groups table (幂等，不删表)
-- ============================================================
CREATE TABLE IF NOT EXISTS `permission_groups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '权限组ID',
  `name` VARCHAR(50) NOT NULL COMMENT '权限组名称',
  `description` VARCHAR(200) DEFAULT '' COMMENT '描述',
  `data_scope_type` ENUM('all', 'class_only', 'teacher_related', 'own_only', 'none') NOT NULL DEFAULT 'none' COMMENT '数据范围类型',
  `iep_level` ENUM('none', 'view', 'participate', 'full') NOT NULL DEFAULT 'none' COMMENT 'IEP权限级别',
  `menu_permissions` JSON COMMENT '可访问的菜单列表 ["dashboard","students",...]',
  `feature_permissions` JSON COMMENT '功能权限编码列表 ["student_view","eval_create",...]',
  `sort_order` INT DEFAULT 0 COMMENT '排序号',
  `is_system` TINYINT(1) DEFAULT 0 COMMENT '系统内置=1不可删除',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限组表';

-- ============================================================
-- B. Add permission_group_id column to users table (条件 DDL)
-- ============================================================
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'permission_group_id') = 0,
  'ALTER TABLE `users` ADD COLUMN `permission_group_id` INT DEFAULT NULL COMMENT ''权限组ID，关联permission_groups.id'' AFTER `role_id`',
  'DO 0'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 外键：仅在不存在时添加，避免重复执行报 Duplicate key name
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'users'
      AND CONSTRAINT_NAME = 'fk_users_permission_group') = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `fk_users_permission_group` FOREIGN KEY (`permission_group_id`) REFERENCES `permission_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'DO 0'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 索引：仅在不存在时创建
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'idx_users_permission_group') = 0,
  'CREATE INDEX `idx_users_permission_group` ON `users`(`permission_group_id`)',
  'DO 0'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ============================================================
-- C. Initialize / refresh 6 default permission groups (幂等)
-- ============================================================
INSERT INTO `permission_groups`
  (`id`, `name`, `description`, `data_scope_type`, `iep_level`,
   `menu_permissions`, `feature_permissions`, `sort_order`, `is_system`)
VALUES
-- 1. 超级管理员 - 全部权限
(1, '超级管理员', '系统最高权限，可管理所有数据和系统设置', 'all', 'full',
 '["dashboard","students","evaluation","iep","teaching","templates","parents","system"]',
 '["data_overview","statistics_view","student_view","student_create","student_edit","student_delete","class_manage","student_export","eval_view","eval_create","eval_edit","eval_delete","report_generate","report_export","iep_view","iep_create","iep_edit","iep_delete","iep_approve","signature_manage","goal_update","record_view","record_create","record_edit","record_delete","template_view","template_create","template_edit","template_delete","system_template_edit","parent_view","parent_manage","signature_send","communication_record","notification_send","user_view","user_manage","role_manage","audit_log","system_settings"]',
 1, 1),

-- 2. 教学主任 - 全部数据范围，IEP 完全权限，无系统设置
(2, '教学主任', '负责教学管理和IEP审批', 'all', 'full',
 '["dashboard","students","evaluation","iep","teaching","templates","parents"]',
 '["data_overview","statistics_view","student_view","student_create","student_edit","student_delete","class_manage","student_export","eval_view","eval_create","eval_edit","eval_delete","report_generate","report_export","iep_view","iep_create","iep_edit","iep_delete","iep_approve","signature_manage","goal_update","record_view","record_create","record_edit","record_delete","template_view","template_create","template_edit","template_delete","system_template_edit","parent_view","parent_manage","signature_send","communication_record","notification_send"]',
 2, 1),

-- 3. 班主任 - 仅本班数据，IEP 完全权限
(3, '班主任', '负责班级学生的IEP制定和教学实施', 'class_only', 'full',
 '["dashboard","students","evaluation","iep","teaching","parents"]',
 '["data_overview","statistics_view","student_view","student_create","student_edit","student_export","eval_view","eval_create","eval_edit","report_generate","report_export","iep_view","iep_create","iep_edit","iep_approve","signature_manage","goal_update","record_view","record_create","record_edit","template_view","parent_view","signature_send","communication_record","notification_send"]',
 3, 1),

-- 4. 科任教师 - 仅所教学生数据，IEP 参与权限
(4, '科任教师', '负责所教学生的教学记录和IEP目标更新', 'teacher_related', 'participate',
 '["dashboard","students","evaluation","iep","teaching"]',
 '["data_overview","student_view","eval_view","eval_create","eval_edit","iep_view","iep_edit","goal_update","record_view","record_create","record_edit","template_view"]',
 4, 1),

-- 5. 家长 - 仅本人关联学生，IEP 只读
(5, '家长', '可查看孩子的IEP信息和签名确认', 'own_only', 'view',
 '["iep","parents"]',
 '["iep_view","parent_view"]',
 5, 1),

-- 6. 只读用户 - 全部数据范围，无编辑权限
(6, '只读用户', '可查看大部分数据，无编辑权限', 'all', 'none',
 '["dashboard","students","evaluation","iep","teaching","templates","parents"]',
 '["data_overview","statistics_view","student_view","student_export","eval_view","report_generate","report_export","iep_view","record_view","template_view","parent_view"]',
 6, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `data_scope_type` = VALUES(`data_scope_type`),
  `iep_level` = VALUES(`iep_level`),
  `menu_permissions` = VALUES(`menu_permissions`),
  `feature_permissions` = VALUES(`feature_permissions`),
  `sort_order` = VALUES(`sort_order`),
  `is_system` = VALUES(`is_system`);

-- ============================================================
-- D. Upgrade notes
-- ============================================================
-- 权限组迁移完成。执行后请校验：
--   SELECT COUNT(*) FROM permission_groups;   -- 应为 6
--   SELECT id, username, permission_group_id FROM users;
-- 如 users.permission_group_id 为 NULL，请按角色补齐后重新登录。
