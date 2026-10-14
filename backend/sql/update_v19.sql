-- ============================================================
-- update_v19.sql —— 决策反馈回路数据层（2026-10-15）
--
-- 为什么补（来自《IEP系统_全面架构与设计评估报告_20261014》第七节排序第 1 位）：
--   系统的定位是「以教师的一天为主视角的教学决策系统」，北极星指标是
--   「教师每周因系统数据而改变教学决策的次数」。但评估实测发现：
--     · progress_analysis 算出了 evidence / rule_hit / suggestions；
--     · 前端把它们拼成一段纯文本展示（Today.tsx「可考虑的方向：…」）；
--     · 教师照做了，系统里**没有任何事件**留下归因。
--   结果是：北极星指标在系统内**没有可计数事件** —— 既无法度量，
--   也无法据此迭代规则（不知道哪类建议被采纳、哪类被无视）。
--
--   这不是「功能不够」，是回路断开：数据单向出库后不再回来。
--
-- 本迁移做什么（只建容器，不臆造历史）：
--   为 iep_intervention_adjustments 增加两列，让「教师登记干预调整」时
--   能够回传「采纳了系统给出的哪几条候选方向」：
--     · adopted        —— 本次调整是否采纳了系统建议（0/1）
--     · suggestion_ids —— 采纳的建议 id 列表（逗号分隔，格式 "<level>:<type>"）
--   既有历史记录一律保持 NULL / 0 —— 无法回溯当时采纳了什么，
--   按 ADR-002 绝不臆造，宁可留空。
--
-- 幂等：先查 information_schema 判列是否存在（须带 TABLE_SCHEMA，
--   见 ADR-026 漏 TABLE_SCHEMA 的教训），不存在才 ALTER。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-042 用 ON DUPLICATE KEY UPDATE。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. adopted：本次调整是否采纳系统建议 ----------
SET @exists_adopted := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_intervention_adjustments'
      AND COLUMN_NAME  = 'adopted'
);

SET @sql_adopted := IF(@exists_adopted = 0,
    "ALTER TABLE iep_intervention_adjustments
        ADD COLUMN adopted TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '是否采纳了系统给出的候选方向：1=采纳，0=团队自行决定。用于度量「系统数据改变教学决策」的次数（北极星指标）'
        AFTER outcome_note",
    "SELECT 'adopted 列已存在，跳过'");

PREPARE stmt_adopted FROM @sql_adopted;
EXECUTE stmt_adopted;
DEALLOCATE PREPARE stmt_adopted;

-- ---------- 2. suggestion_ids：采纳了哪几条（可归因）----------
SET @exists_sids := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_intervention_adjustments'
      AND COLUMN_NAME  = 'suggestion_ids'
);

SET @sql_sids := IF(@exists_sids = 0,
    "ALTER TABLE iep_intervention_adjustments
        ADD COLUMN suggestion_ids VARCHAR(200) NULL
        COMMENT '采纳的系统候选方向 id 列表（逗号分隔，格式 <level>:<type>）；用于回溯哪类建议真正被教师采用'
        AFTER adopted",
    "SELECT 'suggestion_ids 列已存在，跳过'");

PREPARE stmt_sids FROM @sql_sids;
EXECUTE stmt_sids;
DEALLOCATE PREPARE stmt_sids;

-- ---------- 3. 自证（列存在=1/1；历史回填=0 是正确的）----------
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_intervention_adjustments'
      AND COLUMN_NAME = 'adopted')        AS v19_adopted列_期望1,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_intervention_adjustments'
      AND COLUMN_NAME = 'suggestion_ids') AS v19_suggestion_ids列_期望1,
  (SELECT COUNT(*) FROM iep_intervention_adjustments
    WHERE adopted = 1)                    AS v19_已标记采纳数_新库期望0;

-- ---------- 4. 版本登记 ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v19', '决策反馈回路：iep_intervention_adjustments 增 adopted/suggestion_ids 两列，让教师采纳系统建议可被归因与计数（北极星指标可度量）', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
