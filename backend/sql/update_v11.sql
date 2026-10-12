-- =====================================================================
-- IEP 系统 v11：进度决策内核（PIC）教学法正确性修订
-- 针对「三视角深挖」发现的 P0 级决策缺陷，逐条落库。
--
-- 修订要点：
--   1. iep_goals.direction —— 目标方向（增加型 / 递减型）
--      原判据只写 `$value >= $targetValue`，对「降低问题行为发生率」这类
--      终点低于基线的目标会 100% 反向判定：行为越严重越判「已达标」，
--      表现越好越判「需关注」。方向必须显式建模。
--   2. iep_goals.target_prompt_level —— 达标判定的目标辅助层级
--      ADR-010 要求试次按辅助层级分组落库，但读取时又被 SUM 成一条混合线，
--      导致「肢体辅助 → 完全独立」的撤提示过程被判成「建议调整干预」。
--      掌握标准（连续 3 次 ≥80% 独立完成）本就以「独立」为分母。
--   3. iep_goal_progress / 试次口径的量纲塌缩修正（见 PHP 侧）。
-- =====================================================================

-- ---------- 1. 目标方向：increase = 越高越好（默认）；decrease = 越低越好 ----------
SET @exists_dir := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_goals' AND COLUMN_NAME = 'direction'
);
SET @sql_dir := IF(@exists_dir = 0,
    "ALTER TABLE iep_goals
        ADD COLUMN direction ENUM('increase','decrease') NOT NULL DEFAULT 'increase'
        COMMENT '目标方向：increase=达成率越高越好；decrease=发生率越低越好（如问题行为递减）'
        AFTER target_value",
    "SELECT 'direction 列已存在，跳过'");
PREPARE s FROM @sql_dir; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------- 2. 达标判定的目标辅助层级 ----------
SET @exists_lvl := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_goals' AND COLUMN_NAME = 'target_prompt_level'
);
SET @sql_lvl := IF(@exists_lvl = 0,
    "ALTER TABLE iep_goals
        ADD COLUMN target_prompt_level VARCHAR(20) NOT NULL DEFAULT 'independent'
        COMMENT '达标判定所依据的辅助层级；默认 independent（独立完成才叫掌握）'
        AFTER direction",
    "SELECT 'target_prompt_level 列已存在，跳过'");
PREPARE s FROM @sql_lvl; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------- 3. 自动回填方向：基线高于期末目标 → 递减型 ----------
-- 仅回填 direction 为默认值的行，不覆盖教师已显式指定的方向。
UPDATE iep_goals
   SET direction = 'decrease'
 WHERE direction = 'increase'
   AND baseline_value IS NOT NULL
   AND COALESCE(target_value, target_score) IS NOT NULL
   AND CAST(baseline_value AS DECIMAL(10,2)) > CAST(COALESCE(target_value, target_score) AS DECIMAL(10,2));

-- ---------- 4. 决策留痕：记录每次判定所用的口径，便于事后追溯 ----------
CREATE TABLE IF NOT EXISTS iep_decision_audit (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    goal_id        INT NOT NULL,
    decided_at     DATE NOT NULL,
    level          VARCHAR(20) NOT NULL COMMENT 'nodata/stale/regression/adjust/watch/on_track/mastered',
    points_used    INT NOT NULL DEFAULT 0 COMMENT '参与判定的数据点数',
    data_source    VARCHAR(30) DEFAULT NULL COMMENT 'objective_trial / goal_progress',
    prompt_level   VARCHAR(20) DEFAULT NULL COMMENT '判定所用的辅助层级',
    direction      VARCHAR(10) DEFAULT NULL,
    rule_hit       VARCHAR(60) DEFAULT NULL COMMENT '命中的规则编号，如 A/B/C/D/reached',
    reason         TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_goal (goal_id),
    KEY idx_decided (decided_at),
    KEY idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='决策留痕：每个自动结论都可解释（ADR 原则 2）';

SELECT 'v11 迁移完成：direction / target_prompt_level / iep_decision_audit 就位' AS result;
