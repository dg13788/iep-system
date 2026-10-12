-- =====================================================================
-- update_v8.sql —— Step 2「教师的一天」今日工作台
--
-- 本步不新增业务表：Step 1 的 v7 已经把监控频率、基线、期末目标值、
-- 干预调整等字段与实体建好了，v8 只做两件必需的落地动作：
--   1. 为教学岗权限组开通「今日」菜单（家长组与只读组不开）
--   2. 登记迁移版本
--
-- 幂等：可重复执行；已含 today 菜单的组不会重复追加。
-- =====================================================================

USE iep_system;

-- 1. 为「已有教学菜单」的权限组追加 today 菜单
--    判据用 teaching 而非硬编码 id：新增自定义权限组时无需改脚本，
--    也避免把教学待办开给家长组（家长组菜单为 iep/parents，无 teaching）。
UPDATE permission_groups
   SET menu_permissions = JSON_ARRAY_APPEND(menu_permissions, '$', 'today')
 WHERE menu_permissions IS NOT NULL
   AND JSON_CONTAINS(menu_permissions, '"today"') = 0
   AND JSON_CONTAINS(menu_permissions, '"teaching"') = 1;

-- 2. 登记迁移版本（幂等）
INSERT INTO db_migrations (version, description, applied_at)
SELECT 'v8', '今日工作台：为教学岗权限组开通 today 菜单（Step 2）', NOW()
 WHERE NOT EXISTS (SELECT 1 FROM db_migrations WHERE version = 'v8');

-- 3. 校验输出（人工执行时可见）
SELECT id, name, menu_permissions
  FROM permission_groups
 ORDER BY id;
