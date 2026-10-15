-- ============================================================
-- update_v24.sql —— 学生表补「伴随障碍 / 特殊需求说明」两列
-- （2026-10-16 全系统梳理发现，与 v22/v23 同一幽灵字段家族）
--
-- 缺陷现场（可复现）：
--   学生档案表单「障碍信息」区有「伴随障碍」输入框、「其他信息」区有
--   「特殊需求说明」多行框；学生详情抽屉也展示这两项（伴随障碍 / 特殊需求）。
--   教师填完保存提示成功，重开为空——库里同样没有这两列，
--   WRITABLE_FIELDS 据此剔除，数据被静默丢弃。
--   此前巡检只暴露了 diagnosis_* 一组，本轮全量比对「表单 state × 渲染输入框
--   × 库列」才把这一组挖出来。
--
-- 根因链（与 v22/v23 同构）：
--   表内无落点 → services/students.ts 的 WRITABLE_FIELDS 注释写明
--   「secondary_disability / special_needs 为库内不存在字段，必须剔除」
--   （那行注释本身是正确的防御）→ payload 不带 → 后端白名单也没有。
--   UI 照收、payload 不传、后端不存，三层都对，凑在一起就是丢数据。
--
-- 为什么选「补列」而不是「删掉输入框」：
--   伴随障碍（共病）在培智学校极其常见——智力障碍伴脑瘫、伴自闭症特质、
--   伴情绪行为障碍，直接决定教学策略与辅助方式；特殊需求说明是 IEP 个别化
--   服务的核心依据。表单与详情区都在认真采集展示，产品意图就是要存。
--
-- 幂等：逐列查 information_schema.COLUMNS（带 TABLE_SCHEMA = DATABASE()，
--   ADR-026 教训），不存在才 ADD COLUMN。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-041 输出可判定自检结果。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. students.secondary_disability（伴随障碍） ----------
SET @has_c1 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'secondary_disability'
);
SET @sql1 := IF(@has_c1 = 0,
    'ALTER TABLE students
        ADD COLUMN secondary_disability VARCHAR(100) NULL DEFAULT NULL
        COMMENT ''伴随障碍（共病），如脑瘫、自闭症特质、情绪行为障碍等''
        AFTER disability_level_id',
    "SELECT 'students.secondary_disability 已存在，跳过'");
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

-- ---------- 2. students.special_needs（特殊需求说明） ----------
SET @has_c2 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'special_needs'
);
SET @sql2 := IF(@has_c2 = 0,
    'ALTER TABLE students
        ADD COLUMN special_needs TEXT NULL DEFAULT NULL
        COMMENT ''特殊需求说明（IEP 个别化服务依据）''
        AFTER secondary_disability',
    "SELECT 'students.special_needs 已存在，跳过'");
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- ---------- 3. 自检：两列必须都在（ADR-041：给出可判定结果） ----------
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'students'
  AND COLUMN_NAME IN ('secondary_disability', 'special_needs')
ORDER BY COLUMN_NAME;

-- ---------- 4. 版本登记（ADR-042：ON DUPLICATE KEY UPDATE） ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v24', '幽灵字段修复：students 补 secondary_disability(VARCHAR100) / special_needs(TEXT) 两列，使表单已采集的「伴随障碍/特殊需求说明」真正落库；与 v22 诊断三列、v23 第二监护人两列同属表单采集但库内无落点家族', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
