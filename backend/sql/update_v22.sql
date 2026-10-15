-- ============================================================
-- update_v22.sql —— 学生表补「医学诊断」三列（2026-10-16 真实浏览器实测发现）
--
-- 缺陷现场（可复现）：
--   学生档案编辑表单里早就摆着「诊断日期 / 诊断机构 / 医学诊断说明」三个输入框，
--   教师填完点保存，界面提示「学生档案已更新」——但重新打开，三个框全是空的。
--   数据被静默丢弃，没有任何报错。
--
-- 根因链：
--   students 表根本没有这三列 → services/students.ts 的 WRITABLE_FIELDS
--   因此在注释里写明「diagnosis_* 为库内不存在字段，必须剔除」（那行注释本身
--   是正确的防御），buildStudentPayload 据此把它们挡在 payload 之外。
--   于是 UI 照收、payload 不传、后端不存，三层都对，凑在一起就是丢数据。
--
-- 为什么选「补列」而不是「删掉输入框」：
--   IEP 的制定必须以医学诊断为起点（诊断机构 + 诊断日期是合规依据），
--   表单既然设计了采集入口，说明产品意图就是要存。
--   把列补上，让「教师录入 — 档案留存 — 制定 IEP 时可回看」这条链闭合。
--   反过来说：留着不存的输入框，就是在向教师征收纯粹的文书税。
--
-- 幂等：逐列查 information_schema.COLUMNS（须带 TABLE_SCHEMA = DATABASE()，
--   见 ADR-026 漏 schema 导致误判的教训），不存在才 ADD COLUMN。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-041 输出可判定自检结果。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. students.diagnosis_date（诊断日期） ----------
SET @has_c1 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'diagnosis_date'
);
SET @sql1 := IF(@has_c1 = 0,
    'ALTER TABLE students
        ADD COLUMN diagnosis_date DATE NULL DEFAULT NULL
        COMMENT ''医学诊断日期''
        AFTER disability_card_no',
    "SELECT 'students.diagnosis_date 已存在，跳过'");
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

-- ---------- 2. students.diagnosis_org（诊断机构） ----------
SET @has_c2 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'diagnosis_org'
);
SET @sql2 := IF(@has_c2 = 0,
    'ALTER TABLE students
        ADD COLUMN diagnosis_org VARCHAR(100) NULL DEFAULT NULL
        COMMENT ''出具医学诊断的机构''
        AFTER diagnosis_date',
    "SELECT 'students.diagnosis_org 已存在，跳过'");
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- ---------- 3. students.diagnosis_note（诊断说明） ----------
SET @has_c3 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'diagnosis_note'
);
SET @sql3 := IF(@has_c3 = 0,
    'ALTER TABLE students
        ADD COLUMN diagnosis_note TEXT NULL DEFAULT NULL
        COMMENT ''医学诊断结论与说明''
        AFTER diagnosis_org',
    "SELECT 'students.diagnosis_note 已存在，跳过'");
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;

-- ---------- 4. 自检：三列必须都在（ADR-041：给出可判定结果） ----------
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'students'
  AND COLUMN_NAME IN ('diagnosis_date', 'diagnosis_org', 'diagnosis_note')
ORDER BY COLUMN_NAME;

-- ---------- 5. 版本登记（ADR-042：ON DUPLICATE KEY UPDATE） ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v22', '幽灵字段修复：students 补 diagnosis_date(DATE) / diagnosis_org(VARCHAR100) / diagnosis_note(TEXT) 三列，使表单已采集多年的「诊断日期/诊断机构/医学诊断说明」真正落库，不再静默丢弃', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
