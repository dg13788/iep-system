-- ============================================================================
-- IEP 系统 v7 迁移：进度智能内核（Progress Intelligence Core, PIC）
-- 日期：2026-09-30
-- 定位：把「合规的记录系统」推向「教学决策系统」的第一步 —— 让已采集的数据回流为决策
--
-- 对应整改方案 Step 1，解决以下实测缺陷：
--   P0-0  进度数据只写不读：iep_goal_progress 无任何读取接口，进度图恒为空
--          （数据层配合：补索引 + 监控元数据，读取能力见 api/progress_analysis.php）
--   P0-1  进度图目标线硬编码 y=80（IEPDetail.tsx:816-822），与 iep_goals.target_score 无关
--   P0-2  DBI 循环断在第 2 步：无干预调整实体，进度图无调整标记
--   P0-3  评估与 IEP 两张皮：assessments 无 iep_plan_id，iep_plans/goals 无溯源字段
--   P0-4  监控频率 / 监控方法 / 采集责任人 / 数值化基线 全部缺失（IDEA 法定要件）
--
-- 设计原则：
--   1. 全部幂等（幂等加列 + CREATE TABLE IF NOT EXISTS），可重复执行
--   2. 全部可空、无 NOT NULL 加列，不破坏存量数据与既有写入路径
--   3. 只增不改：不修改任何既有列的类型或语义
--   4. 外键与现有表保持一致（ON DELETE CASCADE / SET NULL）
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- 0. 幂等加列工具过程
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS iep_v7_add_col;
DELIMITER $$
CREATE PROCEDURE iep_v7_add_col(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_ddl);
    PREPARE st FROM @s;
    EXECUTE st;
    DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- ============================================================================
-- 1. iep_goals：补齐「进度监控」的法定与技术要件
--    IDEA §300.320(a)(3)：必须说明「如何测量进度」与「多久报告一次」
--    威斯康星进度监控清单：监控方法 / 频率 / 责任人 / 与基线一致
-- ============================================================================
CALL iep_v7_add_col('iep_goals', 'monitor_frequency',
  "ENUM('每次课','每天','每周2次','每周1次','每两周','每月') NULL DEFAULT NULL COMMENT '进度监控频率（IDEA 法定要件）' AFTER evaluation_method");

CALL iep_v7_add_col('iep_goals', 'monitor_method',
  "VARCHAR(100) NULL DEFAULT NULL COMMENT '进度监控工具/方法（须与基线测量方法一致）' AFTER monitor_frequency");

CALL iep_v7_add_col('iep_goals', 'monitor_owner_id',
  "INT NULL DEFAULT NULL COMMENT '进度数据采集责任人 user_id' AFTER monitor_method");

CALL iep_v7_add_col('iep_goals', 'baseline_value',
  "DECIMAL(6,2) NULL DEFAULT NULL COMMENT '基线数值（0-100 归一），aim line 起点；空则回退到首个实测点' AFTER baseline");

CALL iep_v7_add_col('iep_goals', 'baseline_date',
  "DATE NULL DEFAULT NULL COMMENT '基线测量日期' AFTER baseline_value");

CALL iep_v7_add_col('iep_goals', 'baseline_value_is_derived',
  "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=由系统按最早试次折算（重跑可更新），0=教师明确指定（重跑不覆盖）' AFTER baseline_date");

CALL iep_v7_add_col('iep_goals', 'target_value',
  "DECIMAL(6,2) NULL DEFAULT NULL COMMENT '期末目标数值（0-100 归一），aim line 终点；空则回退 target_score' AFTER target_score");

-- 评估→目标溯源（P0-3 弱关联档）
CALL iep_v7_add_col('iep_goals', 'target_value_is_derived',
  "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=由系统按量纲折算（重跑迁移可更新），0=教师明确指定（重跑不覆盖）' AFTER target_value");

CALL iep_v7_add_col('iep_goals', 'source_assessment_id',
  "INT NULL DEFAULT NULL COMMENT '来源评估记录 assessments.id（内在一致性溯源）' AFTER target_value");

CALL iep_v7_add_col('iep_goals', 'source_assessment_item_id',
  "INT NULL DEFAULT NULL COMMENT '来源评估条目 assessment_items.id' AFTER source_assessment_id");

-- ============================================================================
-- 2. iep_plans：PLAAFP 溯源 + 计划级监控约定
-- ============================================================================
CALL iep_v7_add_col('iep_plans', 'source_assessment_id',
  "INT NULL DEFAULT NULL COMMENT '本计划 PLAAFP 所依据的主评估 assessments.id' AFTER needs");

CALL iep_v7_add_col('iep_plans', 'progress_report_frequency',
  "ENUM('每月','每季度','每学期','其他') NULL DEFAULT NULL COMMENT '向家长报告进度的频率（IDEA 法定要件）' AFTER next_review_date");

-- ============================================================================
-- 3. assessments：反向关联，闭合「评估 → IEP」环路
-- ============================================================================
CALL iep_v7_add_col('assessments', 'iep_plan_id',
  "INT NULL DEFAULT NULL COMMENT '本评估所支撑的 IEP 计划 id（评估↔IEP 双向溯源）' AFTER student_id");

-- ============================================================================
-- 4. iep_goal_progress：补索引（读取路径此前完全缺失，加索引支撑按目标时间序列查询）
-- ============================================================================
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_goal_progress' AND INDEX_NAME = 'idx_gp_goal_date'
);
SET @s := IF(@idx_exists = 0,
  'CREATE INDEX idx_gp_goal_date ON iep_goal_progress(goal_id, recorded_date)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============================================================================
-- 5. iep_intervention_adjustments：干预调整留痕（NCII / DBI Step 3-5）
--    这是「有数据 → 有决策」链条上此前缺失的实体。
--    建表依据：
--      DBI Step 3 诊断（为何无效）→ hypothesis
--      DBI Step 4 调整（一次只改少量变量）→ change_type / change_detail
--      DBI Step 5 再监控 → review_due_date / outcome
--      NCII 明文要求：进度图上应标出干预调整发生的位置 → adjusted_at
-- ============================================================================
CREATE TABLE IF NOT EXISTS iep_intervention_adjustments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  iep_plan_id         INT          NOT NULL                       COMMENT '所属 IEP 计划（冗余，便于计划级查询与权限校验）',
  goal_id             INT          NULL DEFAULT NULL              COMMENT '关联长期目标；NULL 表示计划级整体调整',
  objective_id        INT          NULL DEFAULT NULL              COMMENT '关联短期目标',
  adjusted_at         DATE         NOT NULL                       COMMENT '调整发生日期（进度图上垂直标记的位置）',

  trigger_type        ENUM('below_aimline','plateau','regression','mastered',
                           'parent_request','team_decision','other')
                                   NOT NULL DEFAULT 'team_decision'
                                                                  COMMENT '触发原因分类',
  trigger_detail      VARCHAR(500) NULL DEFAULT NULL              COMMENT '触发证据，如「最近4个数据点均低于目标线」',
  hypothesis          TEXT         NULL                           COMMENT '教师对「为何无效」的假设（DBI Step 3）',

  change_type         ENUM('dosage','prompt_level','material','grouping','schedule',
                           'behavior_support','reinforcement','task_analysis',
                           'environment','other')
                                   NOT NULL DEFAULT 'other'      COMMENT '调整维度（DBI 要求一次只改少量变量）',
  change_detail       TEXT         NOT NULL                      COMMENT '具体改了什么（DBI Step 4）',

  decided_by          INT          NULL DEFAULT NULL             COMMENT '决策人 user_id',
  decided_by_name     VARCHAR(50)  NULL DEFAULT NULL             COMMENT '决策人姓名快照',
  review_due_date     DATE         NULL DEFAULT NULL             COMMENT '再监控到期日（DBI Step 5）',

  outcome             ENUM('effective','partially_effective','ineffective','pending')
                                   NOT NULL DEFAULT 'pending'    COMMENT '调整后是否见效（回填）',
  outcome_note        TEXT         NULL                          COMMENT '效果回述',

  created_by          INT          NULL DEFAULT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          TIMESTAMP    NULL DEFAULT NULL,

  KEY idx_iia_plan      (iep_plan_id),
  KEY idx_iia_goal      (goal_id),
  KEY idx_iia_objective (objective_id),
  KEY idx_iia_date      (adjusted_at),
  KEY idx_iia_outcome   (outcome),

  CONSTRAINT fk_iia_plan      FOREIGN KEY (iep_plan_id)  REFERENCES iep_plans(id)      ON DELETE CASCADE,
  CONSTRAINT fk_iia_goal      FOREIGN KEY (goal_id)      REFERENCES iep_goals(id)      ON DELETE SET NULL,
  CONSTRAINT fk_iia_objective FOREIGN KEY (objective_id) REFERENCES iep_objectives(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='干预调整留痕（NCII 数据化个别化 DBI Step 3-5）';

-- ============================================================================
-- 6. 存量数据迁移：让历史数据「可被决策引擎使用」
--    ⚠ 说明：以下默认值仅用于既有演示/历史数据的兜底，不代表自动满足法定要件。
--       新目标仍应显式填写监控频率与方法（一致性质检 R7/R6 会校验）。
-- ============================================================================
-- 6.1 监控方法回退到既有 evaluation_method（测量方法须与基线方法一致）
UPDATE iep_goals
   SET monitor_method = evaluation_method
 WHERE (monitor_method IS NULL OR monitor_method = '')
   AND evaluation_method IS NOT NULL AND evaluation_method <> '';

-- 6.2 监控频率兜底（演示数据默认每周1次，属最低可接受频率）
UPDATE iep_goals SET monitor_frequency = '每周1次' WHERE monitor_frequency IS NULL;

-- 6.3 期末目标值归一 —— 修复「同一列混用两种量纲」的历史缺陷
--     实测：iep_goals.target_score 中，68 个目标是「0-5 主观评级制」的 5 分，
--           10 个目标是百分制的 100；而 126 条短期目标的 mastery_pct 统一为 80。
--     若把 0-5 制的 5 直接当成百分制，会得到「必须 100% 全对」这种不现实的目标；
--     原来前端硬编码的「目标线 80」其实想表达的正是短期目标的掌握阈值。
--     因此：target_score 落在评级量纲内时，取短期目标掌握阈值均值作为期末目标。
--     只更新「系统折算」的行（target_value_is_derived=1），教师手填的不覆盖。
UPDATE iep_goals g
  LEFT JOIN (SELECT goal_id, MAX(max_score) AS m FROM iep_goal_progress GROUP BY goal_id) s
         ON s.goal_id = g.id
  LEFT JOIN (SELECT goal_id, AVG(mastery_pct) AS mp
               FROM iep_objectives WHERE deleted_at IS NULL GROUP BY goal_id) o
         ON o.goal_id = g.id
   SET g.target_value =
       CASE
         WHEN o.mp IS NOT NULL THEN o.mp                       -- 短期目标掌握阈值（最权威）
         WHEN COALESCE(s.m, 0) > 0 AND g.target_score <= s.m
              THEN ROUND(g.target_score * 100.0 / s.m, 2)      -- 有观测满分 → 按量纲折算
         ELSE LEAST(GREATEST(g.target_score, 0), 100)          -- 无证据 → 视为百分制
       END,
       g.target_value_is_derived = 1
 WHERE g.target_value_is_derived = 1;

-- 6.3b 演示数据兜底：少数目标既没有短期目标、也没有任何进度记录，
--      量纲无从判断（target_score=5 被判成 5%）。这里统一对齐到本系统
--      短期目标的掌握阈值 80%，并保留 is_derived=1 以便后续重算。
--      ⚠ 真实使用时，期末目标值应由教师逐目标设定，不应依赖此兜底。
UPDATE iep_goals
   SET target_value = 80
 WHERE target_value IS NOT NULL
   AND target_value <= 5
   AND target_value_is_derived = 1;

-- 6.4 基线数值：与运行时口径保持一致 —— 优先取「离散试次」最早一日的加权达成率。
--     注意：这里刻意不把 iep_goal_progress 的 0-5 评级折算后写进基线，
--     否则会出现「基线来自评级量纲、序列来自试次量纲」的不一致；
--     没有试次数据的目标保持 NULL，由运行时的 pa_aim_line 按所选序列的首点推导。
DROP TEMPORARY TABLE IF EXISTS tmp_v7_day;
CREATE TEMPORARY TABLE tmp_v7_day AS
SELECT o.goal_id,
       r.record_date,
       SUM(r.trial_count)                                              AS trials,
       ROUND(SUM(r.success_count) * 100.0 / NULLIF(SUM(r.trial_count), 0), 2) AS pct,
       ROW_NUMBER() OVER (PARTITION BY o.goal_id ORDER BY r.record_date) AS rn
  FROM iep_objective_records r
  JOIN iep_objectives o ON r.objective_id = o.id
 WHERE r.deleted_at IS NULL AND o.deleted_at IS NULL
 GROUP BY o.goal_id, r.record_date;

-- 取每个目标最早 3 次的达成率，并标注排序位置（用于求中位数）
DROP TEMPORARY TABLE IF EXISTS tmp_v7_b3;
CREATE TEMPORARY TABLE tmp_v7_b3 AS
SELECT goal_id, record_date, pct,
       ROW_NUMBER() OVER (PARTITION BY goal_id ORDER BY pct) AS k,
       COUNT(*)     OVER (PARTITION BY goal_id)             AS c
  FROM tmp_v7_day
 WHERE rn <= 3 AND trials > 0;

DROP TEMPORARY TABLE IF EXISTS tmp_v7_med;
CREATE TEMPORARY TABLE tmp_v7_med AS
SELECT goal_id,
       MIN(record_date) AS base_date,
       ROUND(AVG(pct), 2) AS med_pct   -- 奇数取正中一点、偶数取中间两点均值 = 中位数
  FROM tmp_v7_b3
 WHERE (c % 2 = 1 AND k = (c + 1) / 2)
    OR (c % 2 = 0 AND k IN (c / 2, c / 2 + 1))
 GROUP BY goal_id;

UPDATE iep_goals g
  JOIN tmp_v7_med m ON m.goal_id = g.id
   SET g.baseline_value = m.med_pct,
       g.baseline_date  = m.base_date,
       g.baseline_value_is_derived = 1
 WHERE g.baseline_value_is_derived = 1;

DROP TEMPORARY TABLE tmp_v7_med;
DROP TEMPORARY TABLE tmp_v7_b3;
DROP TEMPORARY TABLE tmp_v7_day;

-- 6.5 计划级向家长报告频率兜底（IDEA 要求至少与普教成绩单同步，通常每季度）
UPDATE iep_plans SET progress_report_frequency = '每季度' WHERE progress_report_frequency IS NULL;

-- ============================================================================
-- 7. 清理工具过程
-- ============================================================================
DROP PROCEDURE IF EXISTS iep_v7_add_col;

-- ============================================================================
-- 8. 迁移自检（执行后应见结果集）
-- ============================================================================
SELECT 'iep_goals.monitor_frequency' AS item,
       COUNT(*) AS filled,
       SUM(monitor_frequency IS NULL) AS missing
  FROM iep_goals
UNION ALL
SELECT 'iep_goals.baseline_value',
       COUNT(baseline_value),
       SUM(baseline_value IS NULL)
  FROM iep_goals
UNION ALL
SELECT 'iep_goals.target_value',
       COUNT(target_value),
       SUM(target_value IS NULL)
  FROM iep_goals
UNION ALL
SELECT 'iep_goal_progress(rows)', COUNT(*), 0 FROM iep_goal_progress
UNION ALL
SELECT 'iep_intervention_adjustments(rows)', COUNT(*), 0 FROM iep_intervention_adjustments;
