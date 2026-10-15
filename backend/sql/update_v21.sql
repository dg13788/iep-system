-- ============================================================
-- update_v21.sql —— 评估→IEP 溯源链补外键（2026-10-15）
--
-- 来源：《IEP系统_全面架构与设计评估报告_20261014》第四节第 3 项
--       「允许孤立目标——source_assessment_id 可空且无外键，
--         教师绕开评估手写目标即可通过 error 校验」。
--
-- 背景：v7 引入了「评估 → PLAAFP → 目标」的溯源四列，但全部无外键：
--   · iep_goals.source_assessment_id        来源评估 assessments.id
--   · iep_goals.source_assessment_item_id   来源评估条目 assessment_items.id
--   · iep_plans.source_assessment_id        计划主评估 assessments.id
--   · assessments.iep_plan_id               反向关联（双向溯源）
-- 没有外键约束时，任何代码路径（或被直接改库）都可以写入不存在的
-- 评估 id，溯源链在数据层 silently 断裂——而应用层校验只看「非空」，
-- 看不住「指向不存在的一行」。
--
-- 修法：四列补外键，一律 ON DELETE SET NULL。
--   为什么是 SET NULL 而不是 RESTRICT/CASCADE：
--     · 评估被硬删时，据此制定的目标不应跟着消失（CASCADE 会误杀教学数据）；
--     · 也不应阻止删除（RESTRICT 会把「清理评估」变成「先改 N 条目标」的脏活）；
--     · 置空后目标仍在，PLN11 / GOA12 两条 warn 会立刻把「关联缺失」
--       变成教师可见的信号——约束负责完整，可见性负责提醒。
--
-- 幂等：先查 information_schema.TABLE_CONSTRAINTS 判约束是否存在
--   （须带 CONSTRAINT_SCHEMA = DATABASE()，见 ADR-026 漏 schema
--    导致误判的教训），不存在才 ADD CONSTRAINT。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-018 不许静默成功——
--   若库内已存在悬挂引用，ADD CONSTRAINT 会以 1452 失败，
--   这是有意的：先清脏数据再加约束，不允许把断裂的链悄悄打成 NULL。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. iep_goals.source_assessment_id → assessments.id ----------
SET @has_fk1 := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_goals'
      AND CONSTRAINT_NAME = 'fk_goal_source_asm'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql1 := IF(@has_fk1 = 0,
    'ALTER TABLE iep_goals
        ADD CONSTRAINT fk_goal_source_asm
        FOREIGN KEY (source_assessment_id) REFERENCES assessments(id)
        ON DELETE SET NULL',
    "SELECT 'fk_goal_source_asm 已存在，跳过'");
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

-- ---------- 2. iep_goals.source_assessment_item_id → assessment_items.id ----------
SET @has_fk2 := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_goals'
      AND CONSTRAINT_NAME = 'fk_goal_source_item'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql2 := IF(@has_fk2 = 0,
    'ALTER TABLE iep_goals
        ADD CONSTRAINT fk_goal_source_item
        FOREIGN KEY (source_assessment_item_id) REFERENCES assessment_items(id)
        ON DELETE SET NULL',
    "SELECT 'fk_goal_source_item 已存在，跳过'");
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- ---------- 3. iep_plans.source_assessment_id → assessments.id ----------
SET @has_fk3 := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_plans'
      AND CONSTRAINT_NAME = 'fk_plan_source_asm'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql3 := IF(@has_fk3 = 0,
    'ALTER TABLE iep_plans
        ADD CONSTRAINT fk_plan_source_asm
        FOREIGN KEY (source_assessment_id) REFERENCES assessments(id)
        ON DELETE SET NULL',
    "SELECT 'fk_plan_source_asm 已存在，跳过'");
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;

-- ---------- 4. assessments.iep_plan_id → iep_plans.id（反向溯源） ----------
SET @has_fk4 := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessments'
      AND CONSTRAINT_NAME = 'fk_asm_iep_plan'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql4 := IF(@has_fk4 = 0,
    'ALTER TABLE assessments
        ADD CONSTRAINT fk_asm_iep_plan
        FOREIGN KEY (iep_plan_id) REFERENCES iep_plans(id)
        ON DELETE SET NULL',
    "SELECT 'fk_asm_iep_plan 已存在，跳过'");
PREPARE s4 FROM @sql4; EXECUTE s4; DEALLOCATE PREPARE s4;

-- ---------- 5. 自检：四条约束必须都在（ADR-041：输出可判定结果） ----------
SELECT
    CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME IN
    ('fk_goal_source_asm', 'fk_goal_source_item',
     'fk_plan_source_asm', 'fk_asm_iep_plan')
ORDER BY CONSTRAINT_NAME;

-- ---------- 6. 版本登记（ADR-042：ON DUPLICATE KEY UPDATE） ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v21', '数据完整性：评估→IEP 溯源四列补外键（iep_goals.source_assessment_id / source_assessment_item_id、iep_plans.source_assessment_id、assessments.iep_plan_id），一律 ON DELETE SET NULL——置空后由 PLN11 / GOA12 两条 warn 把关联缺失变成教师可见信号', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
