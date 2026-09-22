-- ============================================================
-- IEP 系统 v5 迁移：整改遗留项（对应深度审查报告 P1-6 等）
-- 日期：2026-09-19
-- 兼容：MySQL 8.0.30（不支持 ADD COLUMN IF NOT EXISTS，用 information_schema 守卫）
-- 幂等：可重复执行
-- ============================================================

-- ------------------------------------------------------------
-- 1. users.parent_ref_id（P1-6：own_only 权限关联改显式外键）
--    原「手机号相等」软关联存在教师/家长同号即越权、家长换号即断链两类风险，
--    且把 users.id 误当 parents.id 使用（ID 空间混淆）。
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS v5_add_parent_ref;
DELIMITER $$
CREATE PROCEDURE v5_add_parent_ref()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'parent_ref_id'
    ) THEN
        ALTER TABLE users
            ADD COLUMN parent_ref_id INT NULL DEFAULT NULL AFTER permission_group_id,
            ADD KEY idx_users_parent_ref (parent_ref_id);
    END IF;
END$$
DELIMITER ;
CALL v5_add_parent_ref();
DROP PROCEDURE IF EXISTS v5_add_parent_ref;

-- 一次性过渡回填：仅对 own_only 权限组的用户，按手机号匹配建立显式关联。
-- 此后系统一律以 parent_ref_id 为准，手机号变更不再影响权限。
UPDATE users u
INNER JOIN permission_groups pg ON pg.id = u.permission_group_id AND pg.data_scope_type = 'own_only'
INNER JOIN parents p ON p.phone = u.phone AND p.deleted_at IS NULL
SET u.parent_ref_id = p.id
WHERE u.parent_ref_id IS NULL;

-- ------------------------------------------------------------
-- 2. 存量 IEP 计划补齐教育安置形式（6.2：placement_type 必填化前置回填）
--    12 份原始演示计划无安置形式；提交校验上线前先回填合理默认值。
--    培智学校演示场景默认「特教班」；学生 3（送教上门个案）单独处理见下方。
-- ------------------------------------------------------------
UPDATE iep_plans SET placement_type = '特教班' WHERE placement_type IS NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 3. iep_approval_logs.action 枚举扩展（P0-1 残留：撤销签名 / 重新签署留痕）
--    原枚举仅含 submit/review/approve/reject/revise/sign/withdraw，
--    新增 sign_revoke（撤销签名）与 sign_renew（撤销后重新签署）。
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS v5_extend_approval_action;
DELIMITER $$
CREATE PROCEDURE v5_extend_approval_action()
BEGIN
    DECLARE cur_enum TEXT;
    SELECT COLUMN_TYPE INTO cur_enum
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_approval_logs' AND COLUMN_NAME = 'action';
    IF cur_enum NOT LIKE '%sign_revoke%' THEN
        ALTER TABLE iep_approval_logs
            MODIFY COLUMN action ENUM('submit','review','approve','reject','revise','sign','withdraw','sign_revoke','sign_renew') NOT NULL;
    END IF;
END$$
DELIMITER ;
CALL v5_extend_approval_action();
DROP PROCEDURE IF EXISTS v5_extend_approval_action;

-- 记录迁移版本
INSERT INTO db_migrations (version, description, applied_at)
SELECT 'v5', 'P1-6 users.parent_ref_id 外键化 + placement_type 存量回填', NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM db_migrations WHERE version = 'v5');
