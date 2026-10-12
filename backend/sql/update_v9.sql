-- ============================================================
-- IEP System 数据库升级脚本 v9
-- Step 3：评估 → IEP 因果链闭合 + 起草助手留痕
--
-- 幂等：可重复执行，已存在则跳过。
-- 执行：mysql -uroot iep_system < backend/sql/update_v9.sql
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 0. 幂等加列辅助过程 ----------
DROP PROCEDURE IF EXISTS iep_v9_add_col;
DELIMITER $$
CREATE PROCEDURE iep_v9_add_col(
    IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = p_table
           AND COLUMN_NAME  = p_col
    ) THEN
        SET @s = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

-- ---------- 1. 计划级溯源：这个 IEP 是哪一次评估支撑的 ----------
CALL iep_v9_add_col('iep_plans', 'source_assessment_id',
  "INT NULL DEFAULT NULL COMMENT '支撑本计划的评估 assessments.id（因果链溯源）' AFTER student_id");

-- PLAAFP 初稿是否来自起草助手（区分人写与机写，审计必需）
CALL iep_v9_add_col('iep_plans', 'plaafp_draft_source',
  "ENUM('manual','rule','llm') NOT NULL DEFAULT 'manual' COMMENT 'PLAAFP 起草来源：manual=教师自写' AFTER needs");

-- ---------- 2. 草案留痕表（ADR-007：AI 建议 → 教师定稿，差异可查）----------
CREATE TABLE IF NOT EXISTS iep_goal_drafts (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id         INT           NOT NULL              COMMENT '所属 IEP 计划',
    assessment_id       INT           NULL                  COMMENT '依据的评估',
    assessment_item_id  INT           NULL                  COMMENT '依据的具体评估条目',
    goal_id             INT           NULL                  COMMENT '采纳后生成的 iep_goals.id（未采纳为 NULL）',
    draft_kind          ENUM('goal','plaafp') NOT NULL DEFAULT 'goal',
    source              ENUM('rule','llm','manual') NOT NULL DEFAULT 'rule'
                                                            COMMENT '草案来源：rule=本地确定性引擎 / llm=本地私有化模型 / manual=人工',
    engine_version      VARCHAR(20)   NOT NULL DEFAULT 'gd1' COMMENT '引擎版本，便于日后回溯口径',
    draft_json          JSON          NOT NULL              COMMENT '引擎产出的原始草案',
    final_json          JSON          NULL                  COMMENT '教师定稿后的内容（采纳时写入）',
    edited_fields       VARCHAR(500)  NULL                  COMMENT '相对草案被修改过的字段名（教研数据）',
    adopted             TINYINT(1)    NOT NULL DEFAULT 0    COMMENT '是否被采纳',
    rejected_reason     VARCHAR(200)  NULL                  COMMENT '未采纳原因（可选填写）',
    created_by          INT           NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    adopted_at          TIMESTAMP     NULL,
    deleted_at          TIMESTAMP     NULL,
    KEY idx_drafts_plan  (iep_plan_id),
    KEY idx_drafts_assess(assessment_id),
    KEY idx_drafts_goal  (goal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='目标/PLAAFP 草案留痕：记录"引擎建议了什么"与"教师最终定了什么"的差异';

-- ---------- 3. 迁移记录 ----------
INSERT IGNORE INTO db_migrations (version, description)
VALUES ('update_v9', 'Step3 评估→IEP 因果链闭合：计划级溯源字段 + 草案留痕表 iep_goal_drafts');

DROP PROCEDURE IF EXISTS iep_v9_add_col;

-- ---------- 4. 验收自检（执行后人工核对）----------
-- SELECT COUNT(*) FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='iep_plans' AND COLUMN_NAME='source_assessment_id';
-- SELECT COUNT(*) FROM information_schema.TABLES
--  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='iep_goal_drafts';
