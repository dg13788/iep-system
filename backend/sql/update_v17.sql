-- ============================================================
-- update_v17.sql —— 敏感字段权限码归位（2026-10-13）
--
-- 发现经过（不是臆想，是回归实测撞出来的）：
--   perm_sensitive_smoke 报「孤儿权限码数量归零（含别名展开）剩余：
--   ['student_view_sensitive']」，同时「班主任可见自己班明文」失败。
--
-- 根因：`student_view_sensitive` 这个权限码**被代码实际使用**
-- （config.php:1366 的明文放行判定），但它在 backend/sql/ 下的任何迁移
-- 文件里都查不到——也就是说历史上这条码是被手工或临时脚本插进库的，
-- 从未进入迁移链。一旦库被别的方式重建（dump 快照覆盖、全新部署、
-- 换机器），它就永久消失，于是：
--   · 该码成为「代码在用、库里没有」的孤儿码；
--   · 非超管的班主任/科任教师全部被判无敏感字段权限 → 手机号一律脱敏，
--     教师看不到自己班学生的联系电话，家长端演示也随之失效。
-- 这与 ADR-027（权限码必须有归属，不许靠超管直通）、ADR-040（字典/基线不得
-- 只存在于生成器里）是同一类病：**基线数据没有随代码一起进版本库**。
--
-- 归属决策（依据 config.php 中 canViewSensitive() 的注释：
--   「具备 student_view_sensitive 权限（管理员/主任/班主任/科任教师）」）：
--   给予 1 超管 / 2 教学主任 / 3 班主任 / 4 科任教师；
--   **不给 5 家长组**（家长看自己孩子的明文由另一条专用分支放行，
--   见 canViewSensitive() 里的「家长本人查看自己的孩子」）；
--   **不给 6 只读用户**（督导需要全校范围，但按设计要剥夺敏感字段明文，
--   同一段注释已写明）。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. 权限码入库（幂等：只消化唯一键冲突，不掩盖其他错误） ----------
INSERT INTO permissions (code, name, module, description, is_active, created_at)
VALUES
  ('student_view_sensitive', '查看学生敏感字段明文', 'students',
   '查看学生手机号等敏感字段的明文；未授权时一律脱敏显示', 1, NOW())
ON DUPLICATE KEY UPDATE
  name        = VALUES(name),
  module      = VALUES(module),
  description = VALUES(description),
  is_active   = VALUES(is_active);

-- ---------- 2. 授予 4 个权限组（幂等：已包含则跳过） ----------
-- 为什么不能用 `ON DUPLICATE KEY UPDATE id = id`：那一招只保证不写坏已有行，
-- 整行的 feature_permissions JSON 永远不会被更新——本条迁移如果那样写，
-- 重跑一遍等于什么都没做（这正是 init.sql 对 permission_groups 的写法）。
UPDATE permission_groups
   SET feature_permissions = JSON_ARRAY_APPEND(feature_permissions, '$', 'student_view_sensitive'),
       updated_at = NOW()
 WHERE id IN (1, 2, 3, 4)
   AND NOT JSON_CONTAINS(feature_permissions, '"student_view_sensitive"');

-- ---------- 3. 幂等自证 ----------
-- 期望：孤儿码 0 条、被授予的组 4 个。
SELECT
  (SELECT COUNT(*) FROM permissions p
    WHERE p.code = 'student_view_sensitive'
      AND NOT EXISTS (SELECT 1 FROM permission_groups g
                       WHERE 1 = 1
                         AND (JSON_CONTAINS(g.feature_permissions, '"student_view_sensitive"')
                              OR JSON_CONTAINS(g.menu_permissions,  '"student_view_sensitive"'))
                   )) AS v17_孤儿权限码_期望0,
  (SELECT COUNT(*) FROM permission_groups
    WHERE JSON_CONTAINS(feature_permissions, '"student_view_sensitive"')) AS v17_已授权组_期望4;

-- ---------- 4. 版本登记 ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v17', '补齐敏感字段权限码 student_view_sensitive 及其 4 组归属', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);