-- ============================================================
-- update_v20.sql —— 量纲显式化与 LRE 叙述（2026-10-15）
--
-- 来源：《IEP系统_全面架构与设计评估报告_20261014》第四节「IEP 专业维度缺口」
--       第 2 项（缺量纲）与第 1 项（缺 LRE 叙述），对应第七节排序第 4 位。
--
-- 缺口一：目标量纲只能靠反推
--   iep_goals.target_score 这一列历史上混用了两种量纲：演示数据中
--   68 个目标是「0-5 主观评级制」的 5 分，10 个目标是百分制的 100。
--   系统目前靠 pa_aim_line() 猜：target_score ≤ 观测满分 → 当原始分折算，
--   否则当百分制，再不行就退回「统一 80% 掌握标准」。
--   后果：大量目标落入与个别化原则相冲突的「统一 80%」；教师无法表达
--   「这个目标我按 0-5 评级打，掌握标准是连续 3 次 ≥4 分」。
--   修法：新增 measurement_scale 显式声明量纲，代码**优先读显式值**；
--   默认值取 'auto'（沿用现有反推）——保证历史数据行为零变化。
--
-- 缺口二：安置（LRE）只有数字，没有理由
--   iep_plans 只有 placement_type 与「普通班几小时 / 资源教室几小时」。
--   但 LRE 的法定含义不是「抽了几小时」，而是**为什么非抽不可**：
--     · 为什么在普通班加上 supplementary aids and services 仍无法达成目标；
--     · 抽离的频次与时长依据是什么；
--     · 什么条件下可以回归。
--   缺失时，一旦家长对安置提出异议，IEP 无法自证合规 —— 这是实务中
--   最常见的争议点，而系统此刻是"哑"的。
--   修法：新增 lre_narrative（完整叙述）与 lre_removal_reason（抽离理由）。
--
-- 幂等：先查 information_schema 判列是否存在（须带 TABLE_SCHEMA，
--   见 ADR-026 漏 TABLE_SCHEMA 导致误判的教训），不存在才 ALTER。
-- 遵守：ADR-038 禁止 USE <库名>；ADR-042 用 ON DUPLICATE KEY UPDATE。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. iep_goals.measurement_scale：目标按什么量纲测量 ----------
SET @exists_ms := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_goals'
      AND COLUMN_NAME  = 'measurement_scale'
);

SET @sql_ms := IF(@exists_ms = 0,
    "ALTER TABLE iep_goals
        ADD COLUMN measurement_scale ENUM('auto','percent','raw_score','rating_5','frequency','duration','other')
        NOT NULL DEFAULT 'auto'
        COMMENT '目标测量量纲：auto=沿用系统按 target_score 反推的历史口径；percent=百分制；raw_score=原始分；rating_5=0-5 主观评级；frequency=单位时间频次；duration=持续时长；other=其他（需在评估方法中说明）'
        AFTER target_prompt_level",
    "SELECT 'measurement_scale 列已存在，跳过'");

PREPARE stmt_ms FROM @sql_ms;
EXECUTE stmt_ms;
DEALLOCATE PREPARE stmt_ms;

-- ---------- 2. iep_plans.lre_narrative：安置的完整叙述 ----------
SET @exists_lre := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_plans'
      AND COLUMN_NAME  = 'lre_narrative'
);

SET @sql_lre := IF(@exists_lre = 0,
    "ALTER TABLE iep_plans
        ADD COLUMN lre_narrative TEXT NULL
        COMMENT '最少限制环境（LRE）叙述：为何选择该安置方式；若存在抽离，说明为何在普通班辅以支持仍无法达成目标、抽离的频次时长依据、以及回归普通班的条件'
        AFTER placement_notes",
    "SELECT 'lre_narrative 列已存在，跳过'");

PREPARE stmt_lre FROM @sql_lre;
EXECUTE stmt_lre;
DEALLOCATE PREPARE stmt_lre;

-- ---------- 3. iep_plans.lre_removal_reason：抽离理由（结构化短文本）----------
SET @exists_rem := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'iep_plans'
      AND COLUMN_NAME  = 'lre_removal_reason'
);

SET @sql_rem := IF(@exists_rem = 0,
    "ALTER TABLE iep_plans
        ADD COLUMN lre_removal_reason VARCHAR(500) NULL
        COMMENT '从普通班抽离的理由（仅当存在抽离时必填）：具体说明普通班环境下加支持仍无法达成的是哪一项需要，以及抽离如何对应该项需要'
        AFTER lre_narrative",
    "SELECT 'lre_removal_reason 列已存在，跳过'");

PREPARE stmt_rem FROM @sql_rem;
EXECUTE stmt_rem;
DEALLOCATE PREPARE stmt_rem;

-- ---------- 4. 自证（三列都应存在；存量计划未填 LRE 属待补，如实暴露）----------
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_goals'
      AND COLUMN_NAME = 'measurement_scale') AS v20_goals量表列_期望1,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_plans'
      AND COLUMN_NAME = 'lre_narrative')     AS v20_lre叙述列_期望1,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_plans'
      AND COLUMN_NAME = 'lre_removal_reason') AS v20_抽离理由列_期望1,
  (SELECT COUNT(*) FROM iep_plans
    WHERE deleted_at IS NULL AND (lre_narrative IS NULL OR lre_narrative = ''))
                                              AS v20_未填LRE叙述的计划数_待补;

-- ---------- 5. 版本登记 ----------
INSERT INTO db_migrations (version, description, applied_at)
VALUES ('update_v20', '专业合规：iep_goals 增 measurement_scale（量纲显式化，默认 auto 沿用反推以保历史行为不变）；iep_plans 增 lre_narrative / lre_removal_reason（LRE 安置叙述与抽离理由）', NOW())
ON DUPLICATE KEY UPDATE description = VALUES(description);
