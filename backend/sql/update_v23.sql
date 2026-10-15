-- ============================================================
-- update_v23.sql —— 学生表补「第二监护人」两列（2026-10-16 遗留项修订）
--
-- 缺陷现场（可复现，API 层已坐实）：
--   学生档案编辑表单摆着「监护人2姓名 / 监护人2电话」两个输入框（还带手机号
--   格式校验），学生详情抽屉也认真展示这两项——但 students 表没有对应列，
--   WRITABLE_FIELDS 据此剔除，payload 里永远不带它们。
--   实测 POST /students/update 只传 guardian2_* 时后端直接返回
--   「没有需要更新的字段」：教师填完保存，数据被静默丢弃，重开为空。
--   更讽刺的是后端 students.php 还在校验 guardian2_phone 的格式——
--   校验一个永远存不进去的字段（死校验）。
--
-- 根因链（与 v22 诊断三列同构）：
--   表内无落点 → services/students.ts 的 WRITABLE_FIELDS 注释写明
--   「guardian2_* 为库内不存在字段，必须剔除」（那行注释本身是正确的防御）
--   → buildStudentPayload 据此挡在 payload 外 → 后端白名单同样没有这两列。
--   UI 照收、payload 不传、后端不存，三层都对，凑在一起就是丢数据。
--
-- 为什么选「补列」而不是「删掉输入框」：
--   培智学校家校沟通频次要远高于普通学校（每日接送、康复配合、情绪通报），
--   第二监护人是真实存在的联络对象，表单与详情区都在认真采集展示，
--   说明产品意图就是要存。留着不存的输入框，就是向教师征收纯粹的文书税。
--
-- 幂等：逐列查 information_schema.COLUMNS（须带 TABLE_SCHEMA = DATABASE()，
--   见 ADR-026 漏 schema 导致误判的教训），不存在才 ADD COLUMN。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-041 输出可判定自检结果。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. students.guardian2_name（第二监护人姓名） ----------
SET @has_c1 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'guardian2_name'
);
SET @sql1 := IF(@has_c1 = 0,
    'ALTER TABLE students
        ADD COLUMN guardian2_name VARCHAR(50) NULL DEFAULT NULL
        COMMENT ''第二监护人姓名''
        AFTER guardian_relation',
    "SELECT 'students.guardian2_name 已存在，跳过'");
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

-- ---------- 2. students.guardian2_phone（第二监护人电话） ----------
SET @has_c2 := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'students'
      AND COLUMN_NAME  = 'guardian2_phone'
);
SET @sql2 := IF(@has_c2 = 0,
    'ALTER TABLE students
        ADD COLUMN guardian2_phone VARCHAR(20) NULL DEFAULT NULL
        COMMENT ''第二监护人电话''
        AFTER guardian2_name',
    "SELECT 'students.guardian2_phone 已存在，跳过'");
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- ---------- 3. 自检：两列必须都在（ADR-041：给出可判定结果） ----------
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'students'
  AND COLUMN_NAME IN ('guardian2_name', 'guardian2_phone')
ORDER BY COLUMN_NAME;

-- ---------- 4. 版本登记（ADR-042：ON DUPLICATE KEY UPDATE） ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v23', '幽灵字段修复：students 补 guardian2_name(VARCHAR50) / guardian2_phone(VARCHAR20) 两列，使表单已采集的「第二监护人姓名/电话」真正落库，不再静默丢弃；同时消除后端对 guardian2_phone 的死校验', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
