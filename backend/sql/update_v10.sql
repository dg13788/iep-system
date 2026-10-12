-- ============================================================
-- IEP System 数据库升级脚本 v10
-- Step 4：转衔与家长闭环
--
-- 幂等：可重复执行。
-- 执行：mysql -uroot iep_system < backend/sql/update_v10.sql
--
-- 依据：
--   - IDEA 转衔条款：转衔目标必须可测量（measurable postsecondary goals），
--     自由文本的 transition_plan 不满足"可测量"要求；
--   - 教育部 2026-08 行动计划："一体推进残疾学生职业教育和就业衔接发展"；
--   - 安大略审计：38–95% 档案无家长咨询证据，属**程序性违规**，直接危及 FAPE。
--     因此家长"会前意见"必须作为结构化证据入库，而不是只留一个签名。
-- ============================================================

SET NAMES utf8mb4;

-- ---------- 1. 转衔目标（可测量，与长期目标同构以便复用决策引擎）----------
CREATE TABLE IF NOT EXISTS iep_transition_goals (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id       INT           NOT NULL              COMMENT '所属 IEP 计划',
    category          ENUM('升学','就业','独立生活') NOT NULL COMMENT '转衔领域',
    title             VARCHAR(200)  NOT NULL,
    target_behavior   TEXT          NULL                  COMMENT '可观察的目标行为',
    criteria          VARCHAR(500)  NULL                  COMMENT '达成标准（可测量）',
    baseline          VARCHAR(500)  NULL                  COMMENT '当前水平（文字）',
    baseline_value    DECIMAL(6,2)  NULL                  COMMENT '当前水平（百分制，可画目标线）',
    baseline_date     DATE          NULL,
    target_value      DECIMAL(6,2)  NULL                  COMMENT '期末目标（百分制）',
    start_date        DATE          NULL,
    target_date       DATE          NULL                  COMMENT '达成期限',
    monitor_frequency ENUM('每次课','每天','每周2次','每周1次','每两周','每月')
                                    NULL                  COMMENT '监控频率',
    responsible_id    INT           NULL                  COMMENT '责任人',
    status            ENUM('not_started','in_progress','achieved','partially_achieved','discontinued')
                                    NOT NULL DEFAULT 'not_started',
    sort_order        INT           NOT NULL DEFAULT 0,
    created_by        INT           NULL,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        TIMESTAMP     NULL,
    KEY idx_tg_plan (iep_plan_id),
    KEY idx_tg_cat  (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='转衔目标：升学/就业/独立生活三类，必须可测量（IDEA）';

-- ---------- 2. 转衔服务（谁在何时提供什么衔接服务）----------
CREATE TABLE IF NOT EXISTS iep_transition_services (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id  INT          NOT NULL,
    service_name VARCHAR(200) NOT NULL                   COMMENT '服务名称（如 职高衔接课程、社区独立出行训练）',
    provider     VARCHAR(200) NULL                       COMMENT '提供方（校内/校外机构/部门）',
    start_date   DATE         NULL,
    end_date     DATE         NULL,
    frequency    VARCHAR(100) NULL                       COMMENT '频次',
    outcome_note TEXT         NULL                       COMMENT '阶段性成效记录',
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    deleted_at   TIMESTAMP    NULL,
    KEY idx_ts_plan (iep_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='转衔服务台账：升学/就业衔接服务的责任与频次留痕';

-- ---------- 3. 家长意见征集（家长参与的证据，不只是签名）----------
CREATE TABLE IF NOT EXISTS parent_meeting_inputs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id   INT          NOT NULL,
    parent_id     INT          NULL                      COMMENT '家长账号（未开通账号时为 NULL，由教师代录）',
    parent_name   VARCHAR(100) NULL                      COMMENT '家长姓名（代录时必填）',
    relation      VARCHAR(50)  NULL                      COMMENT '与学生关系',
    meeting_date  DATE         NULL                      COMMENT '对应 IEP 会议日期',
    strengths     TEXT         NULL                      COMMENT '家长眼中的孩子优势',
    concerns      TEXT         NULL                      COMMENT '家庭的关切与困难',
    expectations  TEXT         NULL                      COMMENT '对孩子的期望',
    support_at_home TEXT       NULL                      COMMENT '家庭可提供的支持',
    source        ENUM('parent_portal','teacher_proxy','paper','phone')
                               NOT NULL DEFAULT 'teacher_proxy'
                               COMMENT '来源：家长端自助提交 / 教师代录 / 纸质回执 / 电话记录',
    submitted_by  INT          NULL                      COMMENT '代录人（教师）',
    submitted_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at    TIMESTAMP    NULL,
    KEY idx_pmi_plan   (iep_plan_id),
    KEY idx_pmi_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='家长会前结构化意见征集：作为家长参与的证据入库（程序合规要件）';

-- ---------- 4. 迁移记录 ----------
INSERT IGNORE INTO db_migrations (version, description)
VALUES ('update_v10', 'Step4 转衔与家长闭环：转衔目标/转衔服务/家长意见征集三表');

-- ---------- 5. Step 5：为管理与教学岗开通「教学健康度」菜单 ----------
-- 家长组（5）不开：该视图含逾期采集教师清单与质检未通过清单，属校内管理信息。
UPDATE permission_groups
   SET menu_permissions = JSON_ARRAY_APPEND(menu_permissions, '$', 'school')
 WHERE id IN (1, 2, 3, 4, 6)
   AND JSON_CONTAINS(menu_permissions, '"school"', '$') = 0;
