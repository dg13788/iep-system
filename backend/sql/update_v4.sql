-- =====================================================================
-- IEP System - 数据库迁移 v4：特教专业内核补齐
-- 对应《IEP系统_部署运行与深度审查报告_20260917》第六章 6.1 ~ 6.5
-- =====================================================================
-- 6.1 短期目标（含任务分析步骤）+ 按次/按日达成记录 + 长期目标自动汇总
-- 6.2 教育安置形式 / 相关服务台账 / IEP 会议参与人与签署留痕
-- 6.3 残疾等级对齐 GB/T 26341 国家标准（一级 ~ 四级）
-- 6.4 教学现场结构化安全档案（支撑「紧急情况一览卡」）
-- 6.5 沟通方式（PECS / AAC 等）+ 行为干预计划 BIP（ABC 分析 + 事件台账）
--
-- 设计原则：
--   1) 全部 ADD COLUMN 均为可空、历史数据零破坏；原 disability_level 自由文本保留
--      作历史兼容，由 disability_level_id 承担正式语义；
--   2) 学生安全信息放在独立表而非塞进 students，避免 `SELECT s.*` 的历史写法
--      把过敏/癫痫等高度敏感字段连带暴露出去；
--   3) 所有新表统一带 created_at/updated_at/deleted_at，与既有软删约定一致；
--   4) 本文件幂等，可重复执行（见下方的守卫存储过程）。
--
-- 兼容说明：MySQL 8.0 **不支持** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
-- （那是 MariaDB 语法，实测 8.0.30 报 ER_PARSE_ERROR），因此这里用
-- information_schema 做存在性判断后再动态拼接 DDL，达到幂等目的。
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 幂等守卫：加列 / 加索引 / 加外键
-- =====================================================================
DROP PROCEDURE IF EXISTS iep_add_col;
DROP PROCEDURE IF EXISTS iep_add_idx;
DROP PROCEDURE IF EXISTS iep_add_fk;

DELIMITER $$

CREATE PROCEDURE iep_add_col(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col
    ) THEN
        SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
        PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
        SELECT CONCAT('+ COLUMN ', p_table, '.', p_col) AS applied;
    ELSE
        SELECT CONCAT('= COLUMN ', p_table, '.', p_col, ' already exists') AS skipped;
    END IF;
END$$

CREATE PROCEDURE iep_add_idx(IN p_table VARCHAR(64), IN p_idx VARCHAR(64), IN p_ddl TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx
    ) THEN
        SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD INDEX ', p_ddl);
        PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
        SELECT CONCAT('+ INDEX ', p_table, '.', p_idx) AS applied;
    ELSE
        SELECT CONCAT('= INDEX ', p_table, '.', p_idx, ' already exists') AS skipped;
    END IF;
END$$

CREATE PROCEDURE iep_add_fk(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_ddl TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name
    ) THEN
        SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT ', p_ddl);
        PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
        SELECT CONCAT('+ FK ', p_table, '.', p_name) AS applied;
    ELSE
        SELECT CONCAT('= FK ', p_table, '.', p_name, ' already exists') AS skipped;
    END IF;
END$$

DELIMITER ;

-- =====================================================================
-- 6.3 残疾等级字典（GB/T 26341《残疾人残疾分类和分级》）
-- =====================================================================
CREATE TABLE IF NOT EXISTS dict_disability_levels (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE COMMENT '等级代码 L1~L4',
    name        VARCHAR(50)  NOT NULL COMMENT '等级名称 一级~四级',
    degree      VARCHAR(20)  NOT NULL COMMENT '程度：极重度/重度/中度/轻度',
    description VARCHAR(500) DEFAULT NULL COMMENT '国家分级标准对应描述',
    sort_order  INT          DEFAULT 0,
    is_active   TINYINT(1)   DEFAULT 1,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='残疾等级字典，对齐 GB/T 26341-2010';

INSERT INTO dict_disability_levels (code, name, degree, description, sort_order) VALUES
    ('L1', '一级', '极重度', 'GB/T 26341 一级：极重度，生活完全不能自理，需他人全程照料', 1),
    ('L2', '二级', '重度',   'GB/T 26341 二级：重度，生活大部分需他人协助', 2),
    ('L3', '三级', '中度',   'GB/T 26341 三级：中度，生活部分需他人协助，可完成部分自理', 3),
    ('L4', '四级', '轻度',   'GB/T 26341 四级：轻度，生活基本自理，需少量支持与环境调整', 4)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), degree = VALUES(degree), description = VALUES(description);

CALL iep_add_col('students', 'disability_level_id',
    'disability_level_id INT DEFAULT NULL COMMENT ''残疾等级ID，关联dict_disability_levels.id（GB/T 26341）'' AFTER disability_level');
CALL iep_add_idx('students', 'idx_student_level', 'idx_student_level (disability_level_id)');
CALL iep_add_fk('students', 'fk_student_level',
    'fk_student_level FOREIGN KEY (disability_level_id) REFERENCES dict_disability_levels (id) ON DELETE SET NULL');

-- 历史文本回填：轻度->四级(L4) 中度->三级(L3) 重度->二级(L2) 极重度->一级(L1)
UPDATE students s
JOIN dict_disability_levels d
  ON (d.degree = s.disability_level OR d.name = s.disability_level)
SET s.disability_level_id = d.id
WHERE s.disability_level_id IS NULL;

-- =====================================================================
-- 6.5-a 学生沟通方式（决定目标设定与评量方式，属评量前置条件）
-- =====================================================================
CALL iep_add_col('students', 'communication_methods',
    'communication_methods JSON DEFAULT NULL COMMENT ''沟通方式集合，取值见 dict_common.communication_method''');
CALL iep_add_col('students', 'communication_notes',
    'communication_notes TEXT DEFAULT NULL COMMENT ''沟通补充说明：可理解指令层级、表达句长、代偿方式等''');
CALL iep_add_col('students', 'aac_device',
    'aac_device VARCHAR(200) DEFAULT NULL COMMENT ''AAC 辅具型号/来源''');
CALL iep_add_col('students', 'receptive_level',
    'receptive_level VARCHAR(200) DEFAULT NULL COMMENT ''语言理解能力水平描述''');
CALL iep_add_col('students', 'expressive_level',
    'expressive_level VARCHAR(200) DEFAULT NULL COMMENT ''语言表达能力水平描述''');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active) VALUES
    ('communication_method', 'speech',  '口语',         '口语',                    1, 1),
    ('communication_method', 'gesture', '手势/肢体',    '手势或肢体动作表达',      2, 1),
    ('communication_method', 'sign',    '手语',         '手语',                    3, 1),
    ('communication_method', 'pecs',    'PECS图片交换', '图片交换沟通系统 PECS',   4, 1),
    ('communication_method', 'aac',     'AAC辅具',      '辅助沟通设备（语音输出等）', 5, 1),
    ('communication_method', 'picture', '图卡沟通板',   '图卡或沟通板',            6, 1),
    ('communication_method', 'facial',  '表情/发声',    '面部表情或发声表达',      7, 1),
    ('communication_method', 'none',    '暂无法表达',   '尚未建立功能性沟通',      8, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), value = VALUES(value);

-- =====================================================================
-- 6.2-a 教育安置形式（IEP 法定必备：回答"在何处接受教育"）
-- =====================================================================
CALL iep_add_col('iep_plans', 'placement_type',
    'placement_type ENUM(''普通班随班就读'',''特教班'',''资源教室'',''送教上门'',''特殊教育学校'',''其他'') DEFAULT NULL COMMENT ''教育安置形式（法定要素）'' AFTER semester');
CALL iep_add_col('iep_plans', 'placement_notes',
    'placement_notes VARCHAR(500) DEFAULT NULL COMMENT ''安置补充说明''');
CALL iep_add_col('iep_plans', 'regular_class_hours',
    'regular_class_hours DECIMAL(4,1) DEFAULT NULL COMMENT ''每周在普通班学习课时''');
CALL iep_add_col('iep_plans', 'resource_room_hours',
    'resource_room_hours DECIMAL(4,1) DEFAULT NULL COMMENT ''每周资源教室课时''');
CALL iep_add_col('iep_plans', 'meeting_date',
    'meeting_date DATE DEFAULT NULL COMMENT ''IEP 会议日期（法定程序要件）''');
CALL iep_add_col('iep_plans', 'meeting_place',
    'meeting_place VARCHAR(200) DEFAULT NULL COMMENT ''IEP 会议地点''');
CALL iep_add_col('iep_plans', 'next_review_date',
    'next_review_date DATE DEFAULT NULL COMMENT ''下次复核日期''');

-- =====================================================================
-- 6.2-b 相关服务字典 + 开具执行台账
-- =====================================================================
CREATE TABLE IF NOT EXISTS dict_related_services (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL UNIQUE COMMENT '服务代码',
    name        VARCHAR(100) NOT NULL COMMENT '服务名称',
    category    VARCHAR(50)  DEFAULT NULL COMMENT '分类：康复类/心理类/支持类/便利类',
    description VARCHAR(500) DEFAULT NULL,
    sort_order  INT          DEFAULT 0,
    is_active   TINYINT(1)   DEFAULT 1,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='相关服务字典（康复/心理/交通/辅具/考试便利等）';

INSERT INTO dict_related_services (code, name, category, description, sort_order) VALUES
    ('ot',            '作业治疗 OT',     '康复类', '精细动作、感觉统合、日常生活作业活动训练', 1),
    ('pt',            '物理治疗 PT',     '康复类', '粗大运动、步态与姿势控制训练',             2),
    ('st',            '言语语言治疗 ST', '康复类', '言语清晰度、语言理解表达、吞咽训练',       3),
    ('psychology',    '心理辅导',        '心理类', '个别/团体心理辅导与情绪支持',              4),
    ('behavior',      '行为干预',        '心理类', '正向行为支持 PBS 与行为干预计划执行',      5),
    ('transport',     '交通服务',        '支持类', '上下学交通接送支持',                       6),
    ('assistive',     '辅助器具',        '支持类', '辅具适配、使用训练与维护',                 7),
    ('exam_adapt',    '考试便利',        '便利类', '延长时间、大字卷、单独考场、读题代答等',   8),
    ('nursing',       '医疗护理',        '支持类', '服药管理、管路护理、健康监测',             9),
    ('parent_train',  '家长培训',        '支持类', '家庭康复指导与家长支持',                  10),
    ('social_work',   '社会工作',        '支持类', '资源链接、转衔服务与社区融合',            11),
    ('academic_supp', '学科补救教学',    '便利类', '个别化补救教学与作业调整',                12)
ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), description = VALUES(description);

CREATE TABLE IF NOT EXISTS iep_related_services (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id         INT NOT NULL COMMENT 'IEP计划ID',
    service_code        VARCHAR(50)  DEFAULT NULL COMMENT '服务代码，关联dict_related_services.code',
    service_name        VARCHAR(100) NOT NULL COMMENT '服务名称',
    provider            VARCHAR(100) DEFAULT NULL COMMENT '提供方/执行人姓名或机构',
    provider_role       VARCHAR(100) DEFAULT NULL COMMENT '提供角色：校内资源教师/康复治疗师/校外机构',
    frequency_per_week  DECIMAL(4,1) DEFAULT 1.0 COMMENT '每周频次',
    minutes_per_session INT          DEFAULT 40 COMMENT '单次时长(分钟)',
    planned_sessions    INT          DEFAULT 0 COMMENT '计划总次数',
    completed_sessions  INT          DEFAULT 0 COMMENT '已完成次数',
    location            VARCHAR(200) DEFAULT NULL COMMENT '服务地点',
    start_date          DATE         DEFAULT NULL COMMENT '开始日期',
    end_date            DATE         DEFAULT NULL COMMENT '结束日期',
    status              ENUM('planned','active','completed','suspended') DEFAULT 'planned' COMMENT '执行状态',
    remark              TEXT         DEFAULT NULL,
    sort_order          INT          DEFAULT 0,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMP    NULL DEFAULT NULL,
    KEY idx_plan (iep_plan_id),
    KEY idx_status (status),
    CONSTRAINT fk_rsvc_plan FOREIGN KEY (iep_plan_id) REFERENCES iep_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='IEP相关服务台账：按服务项开具、执行与季度追踪';

-- =====================================================================
-- 6.2-c IEP 会议参与人（team_members 只是 JSON，缺签署留痕）
-- =====================================================================
CREATE TABLE IF NOT EXISTS iep_meeting_participants (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id      INT NOT NULL COMMENT 'IEP计划ID',
    participant_type ENUM('school','parent','student','specialist','external') DEFAULT 'school'
        COMMENT '参与人类型：校内人员/家长/学生本人/专业人员/外部机构',
    user_id          INT          DEFAULT NULL COMMENT '系统用户ID（校内人员）',
    parent_id        INT          DEFAULT NULL COMMENT '家长ID（家长出席时）',
    name             VARCHAR(100) NOT NULL COMMENT '姓名',
    role             VARCHAR(100) DEFAULT NULL COMMENT '角色：班主任/资源教师/康复治疗师/家长等',
    attendance       ENUM('present','proxy','absent') DEFAULT 'present' COMMENT '出席方式：出席/委托/缺席',
    proxy_note       VARCHAR(255) DEFAULT NULL COMMENT '委托说明（谁代谁出席）',
    signed_at        DATETIME     NULL DEFAULT NULL COMMENT '会议签到时间（签署留痕）',
    remark           VARCHAR(500) DEFAULT NULL,
    sort_order       INT          DEFAULT 0,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    KEY idx_plan (iep_plan_id),
    KEY idx_user (user_id),
    CONSTRAINT fk_mp_plan   FOREIGN KEY (iep_plan_id) REFERENCES iep_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_mp_user   FOREIGN KEY (user_id)     REFERENCES users (id)    ON DELETE SET NULL,
    CONSTRAINT fk_mp_parent FOREIGN KEY (parent_id)   REFERENCES parents (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='IEP会议参与人与签到留痕（team_members 的结构化版本）';

-- =====================================================================
-- 6.1-a 短期目标（长期目标 → 短期目标，三级闭环的中间层）
-- =====================================================================
CREATE TABLE IF NOT EXISTS iep_objectives (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id        INT NOT NULL COMMENT 'IEP计划ID',
    goal_id            INT NOT NULL COMMENT '所属长期目标ID',
    objective_code     VARCHAR(100) DEFAULT NULL COMMENT '短期目标编号',
    seq_no             INT          DEFAULT 1 COMMENT '在长期目标下的序号',
    title              VARCHAR(200) NOT NULL COMMENT '短期目标标题',
    target_behavior    TEXT         DEFAULT NULL COMMENT '可观察可测量的目标行为',
    criteria           VARCHAR(500) DEFAULT NULL COMMENT '达成标准（如"连续3天 ≥80%独立完成"）',
    measurement_method VARCHAR(100) DEFAULT NULL COMMENT '测量方式：频次统计/时长观察/作品分析/检核表/试误次数',
    baseline_level     VARCHAR(200) DEFAULT NULL COMMENT '基线水平（起始数据）',
    target_level       VARCHAR(200) DEFAULT NULL COMMENT '目标水平',
    mastery_pct        DECIMAL(5,2) DEFAULT 80.00 COMMENT '掌握标准阈值(%)',
    start_date         DATE         DEFAULT NULL,
    target_date        DATE         DEFAULT NULL COMMENT '预计达成日期',
    prompt_hierarchy   JSON         DEFAULT NULL COMMENT '提示层级表：由多到少的辅助序列',
    teaching_strategy  TEXT         DEFAULT NULL COMMENT '教学策略（如正向链式塑造、时间延宕）',
    status             ENUM('not_started','in_progress','mastered','not_mastered','discontinued')
                       DEFAULT 'not_started' COMMENT '达成状态',
    sort_order         INT          DEFAULT 0,
    created_by         INT          DEFAULT NULL,
    created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         TIMESTAMP    NULL DEFAULT NULL,
    KEY idx_plan (iep_plan_id),
    KEY idx_goal (goal_id),
    KEY idx_status (status),
    CONSTRAINT fk_obj_plan    FOREIGN KEY (iep_plan_id) REFERENCES iep_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_obj_goal    FOREIGN KEY (goal_id)     REFERENCES iep_goals (id) ON DELETE CASCADE,
    CONSTRAINT fk_obj_creator FOREIGN KEY (created_by)  REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='IEP短期目标表（长期目标的任务分解层）';

-- 6.1-b 任务分析步骤：把"会用勺子吃饭"拆成可教可测的链式步骤
CREATE TABLE IF NOT EXISTS iep_objective_steps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    objective_id    INT NOT NULL COMMENT '短期目标ID',
    step_no         INT NOT NULL DEFAULT 1 COMMENT '步骤序号',
    title           VARCHAR(255) NOT NULL COMMENT '步骤名称',
    description     TEXT DEFAULT NULL COMMENT '步骤细化描述',
    teaching_prompt VARCHAR(255) DEFAULT NULL COMMENT '该步的提示/辅助方式',
    is_critical     TINYINT(1) DEFAULT 0 COMMENT '是否为关键（难以掌握）步骤',
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_objective (objective_id),
    CONSTRAINT fk_step_obj FOREIGN KEY (objective_id) REFERENCES iep_objectives (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='任务分析步骤表（对短期目标做链式/反向链式分解）';

-- 6.1-c 按次/按日达成记录：让达成率具备教育测量学意义
CREATE TABLE IF NOT EXISTS iep_objective_records (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    objective_id      INT NOT NULL COMMENT '短期目标ID',
    step_id           INT DEFAULT NULL COMMENT '任务步骤ID（NULL 表示记录面向整个短期目标）',
    record_date       DATE NOT NULL COMMENT '记录日期',
    session_type      VARCHAR(50)  DEFAULT NULL COMMENT '教学场景：集体课/个训课/生活情境/家庭泛化',
    context           VARCHAR(100) DEFAULT NULL COMMENT '具体情境（如"午餐时间/教室"）',
    trial_count       INT NOT NULL DEFAULT 1  COMMENT '本次试次数（trial）',
    success_count     INT NOT NULL DEFAULT 0  COMMENT '成功试次数',
    achievement_pct   DECIMAL(5,2) GENERATED ALWAYS AS (
                          CASE WHEN trial_count > 0
                               THEN ROUND(success_count * 100.0 / trial_count, 2)
                               ELSE 0 END) STORED COMMENT '本次达成率(%)，由试次数自动生成',
    prompt_level      ENUM('independent','gesture','verbal','model','physical')
                      DEFAULT 'independent' COMMENT '本次使用的提示层级：独立/手势/言语/示范/肢体',
    is_generalized    TINYINT(1) DEFAULT 0 COMMENT '是否为泛化情境表现',
    duration_minutes  INT DEFAULT NULL COMMENT '观察时长(分钟)',
    notes             TEXT DEFAULT NULL COMMENT '记录说明',
    recorded_by       INT NOT NULL COMMENT '记录人ID',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        TIMESTAMP NULL DEFAULT NULL,
    KEY idx_objective (objective_id),
    KEY idx_step (step_id),
    KEY idx_date (record_date),
    CONSTRAINT fk_orec_obj  FOREIGN KEY (objective_id) REFERENCES iep_objectives (id)     ON DELETE CASCADE,
    CONSTRAINT fk_orec_step FOREIGN KEY (step_id)      REFERENCES iep_objective_steps (id) ON DELETE SET NULL,
    CONSTRAINT fk_orec_by   FOREIGN KEY (recorded_by)  REFERENCES users (id)              ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='短期目标达成数据表（trial-by-trial / 单次达成率）';

-- =====================================================================
-- 6.1-d 汇总视图
--   长期目标达成率不再来自教师主观 0~5 打分，而由短期目标的 trial 级数据推导。
-- =====================================================================
CREATE OR REPLACE VIEW v_iep_objective_progress AS
SELECT
    o.id                             AS objective_id,
    o.iep_plan_id                    AS iep_plan_id,
    o.goal_id                        AS goal_id,
    o.title                          AS title,
    o.status                         AS status,
    o.mastery_pct                    AS mastery_pct,
    o.target_date                    AS target_date,
    COUNT(r.id)                      AS record_count,
    COALESCE(SUM(r.trial_count), 0)  AS total_trials,
    COALESCE(SUM(r.success_count), 0) AS total_success,
    CASE WHEN COALESCE(SUM(r.trial_count), 0) > 0
         THEN ROUND(SUM(r.success_count) * 100.0 / SUM(r.trial_count), 2)
         ELSE 0 END                  AS overall_pct,
    MAX(r.record_date)               AS last_record_date,
    (SELECT r2.achievement_pct FROM iep_objective_records r2
      WHERE r2.objective_id = o.id AND r2.deleted_at IS NULL
      ORDER BY r2.record_date DESC, r2.id DESC LIMIT 1) AS latest_pct,
    (SELECT r2.prompt_level FROM iep_objective_records r2
      WHERE r2.objective_id = o.id AND r2.deleted_at IS NULL
      ORDER BY r2.record_date DESC, r2.id DESC LIMIT 1) AS latest_prompt_level
FROM iep_objectives o
LEFT JOIN iep_objective_records r
       ON r.objective_id = o.id AND r.deleted_at IS NULL
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.iep_plan_id, o.goal_id, o.title, o.status, o.mastery_pct, o.target_date;

CREATE OR REPLACE VIEW v_iep_goal_rollup AS
SELECT
    g.id              AS goal_id,
    g.iep_plan_id     AS iep_plan_id,
    g.title           AS title,
    g.status          AS current_status,
    COUNT(p.objective_id)                                  AS objective_count,
    SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) AS mastered_count,
    ROUND(COALESCE(AVG(p.overall_pct), 0), 2)              AS avg_pct,
    CASE
        WHEN COUNT(p.objective_id) = 0 THEN 'not_started'
        WHEN SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) = COUNT(p.objective_id)
             THEN 'achieved'
        WHEN SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) > 0
             THEN 'partially_achieved'
        WHEN COALESCE(AVG(p.overall_pct), 0) > 0 THEN 'in_progress'
        ELSE 'not_started'
    END AS suggested_status
FROM iep_goals g
LEFT JOIN v_iep_objective_progress p ON p.goal_id = g.id
WHERE g.deleted_at IS NULL
GROUP BY g.id, g.iep_plan_id, g.title, g.status;

-- =====================================================================
-- 6.4 教学现场安全档案（独立表，避免随 SELECT s.* 泄露）
-- =====================================================================
CREATE TABLE IF NOT EXISTS student_safety_profiles (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    student_id            INT NOT NULL COMMENT '学生ID',
    -- 癫痫与急救
    has_epilepsy          TINYINT(1)   DEFAULT 0 COMMENT '是否有癫痫史',
    seizure_type          VARCHAR(100) DEFAULT NULL COMMENT '发作类型',
    seizure_first_aid     TEXT         DEFAULT NULL COMMENT '发作时的现场处置流程',
    rescue_medication     VARCHAR(255) DEFAULT NULL COMMENT '急救药物名称与用法',
    -- 过敏
    allergens             JSON         DEFAULT NULL COMMENT '严重过敏原清单（数组）',
    allergy_reaction      VARCHAR(255) DEFAULT NULL COMMENT '过敏反应表现',
    anaphylaxis_action    TEXT         DEFAULT NULL COMMENT '过敏性休克处置流程（含肾上腺素笔）',
    epipen_location       VARCHAR(200) DEFAULT NULL COMMENT '肾上腺素笔/急救药品存放位置',
    -- 饮食与吞咽
    diet_texture          ENUM('普食','软食','糊状','流质','鼻饲','其他') DEFAULT NULL COMMENT '饮食性状要求',
    swallowing_precaution VARCHAR(255) DEFAULT NULL COMMENT '吞咽/进食注意事项',
    food_taboo            VARCHAR(255) DEFAULT NULL COMMENT '饮食禁忌',
    -- 行为危机
    aggression_trigger    TEXT         DEFAULT NULL COMMENT '攻击行为已知触发因素',
    deescalation          TEXT         DEFAULT NULL COMMENT '降阶/安抚有效策略',
    crisis_procedure      TEXT         DEFAULT NULL COMMENT '危机处置流程（含撤离与上报）',
    prohibited_response   TEXT         DEFAULT NULL COMMENT '禁止采用的处置方式',
    -- 走失与如厕
    wandering_risk        ENUM('none','low','medium','high') DEFAULT 'none' COMMENT '走失风险等级',
    wandering_response    TEXT         DEFAULT NULL COMMENT '走失防范与寻回流程',
    toilet_independence   ENUM('independent','verbal_prompt','physical_prompt','full_assistance')
                          DEFAULT NULL COMMENT '如厕依赖等级',
    mobility_aid          VARCHAR(100) DEFAULT NULL COMMENT '行动辅具（轮椅/助行器等）',
    supervision_level     ENUM('独立活动','视线监护','一对一陪护') DEFAULT NULL COMMENT '所需看护等级',
    emergency_updated_at  DATETIME     NULL DEFAULT NULL COMMENT '一览卡最后更新时间',
    updated_by            INT          DEFAULT NULL,
    created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at            TIMESTAMP    NULL DEFAULT NULL,
    UNIQUE KEY uk_student (student_id),
    CONSTRAINT fk_safety_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
    CONSTRAINT fk_safety_updater FOREIGN KEY (updated_by) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='学生现场安全档案（紧急情况一览卡数据源）';

-- =====================================================================
-- 6.5-b 行为干预计划 BIP（ABC 分析）与事件台账
-- =====================================================================
CREATE TABLE IF NOT EXISTS behavior_intervention_plans (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    student_id             INT NOT NULL COMMENT '学生ID',
    iep_plan_id            INT DEFAULT NULL COMMENT '关联IEP计划ID',
    plan_code              VARCHAR(100) DEFAULT NULL COMMENT '计划编号',
    target_behavior        VARCHAR(255) NOT NULL COMMENT '目标行为（具体可观察）',
    behavior_function      VARCHAR(100) DEFAULT NULL COMMENT '行为功能：感觉寻求/逃避要求/获取关注/获取实物/生理不适',
    antecedent             TEXT DEFAULT NULL COMMENT '前因 A：行为之前的情境事件',
    behavior_desc          TEXT DEFAULT NULL COMMENT '行为 B：表现、频率、时长、强度',
    consequence            TEXT DEFAULT NULL COMMENT '后果 C：行为之后的环境变化（维持机制）',
    setting_events         TEXT DEFAULT NULL COMMENT '设定事件：睡眠不足、身体不适等背景因素',
    replacement_behavior   TEXT DEFAULT NULL COMMENT '替代行为：欲建立的功能等价行为',
    prevention_strategy    TEXT DEFAULT NULL COMMENT '前事干预/预防策略',
    reinforcement_strategy TEXT DEFAULT NULL COMMENT '强化策略与区别性强化方案',
    reinforcement_schedule VARCHAR(100) DEFAULT NULL COMMENT '强化时程',
    consequence_strategy   TEXT DEFAULT NULL COMMENT '后果处理策略',
    crisis_procedure       TEXT DEFAULT NULL COMMENT '危机处置流程',
    start_date             DATE DEFAULT NULL,
    review_cycle_days      INT DEFAULT 30 COMMENT '复核周期(天)',
    next_review_date       DATE DEFAULT NULL,
    status                 ENUM('draft','active','revised','closed') DEFAULT 'draft' COMMENT '状态',
    created_by             INT DEFAULT NULL,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at             TIMESTAMP NULL DEFAULT NULL,
    KEY idx_student (student_id),
    KEY idx_status (status),
    CONSTRAINT fk_bip_student FOREIGN KEY (student_id)  REFERENCES students (id) ON DELETE CASCADE,
    CONSTRAINT fk_bip_plan    FOREIGN KEY (iep_plan_id) REFERENCES iep_plans (id) ON DELETE SET NULL,
    CONSTRAINT fk_bip_creator FOREIGN KEY (created_by)  REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='行为干预计划 BIP：ABC 分析与正向行为支持方案';

CREATE TABLE IF NOT EXISTS bip_incident_records (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    bip_id            INT NOT NULL COMMENT 'BIP计划ID',
    occurred_at       DATETIME NOT NULL COMMENT '发生时间',
    location          VARCHAR(100) DEFAULT NULL COMMENT '发生地点',
    activity          VARCHAR(100) DEFAULT NULL COMMENT '当时活动',
    antecedent        TEXT DEFAULT NULL COMMENT '前因',
    behavior          TEXT DEFAULT NULL COMMENT '行为表现',
    consequence       TEXT DEFAULT NULL COMMENT '处理结果',
    intensity         ENUM('轻度','中度','重度') DEFAULT '中度' COMMENT '强度',
    duration_minutes  INT DEFAULT NULL COMMENT '持续时长(分钟)',
    has_injury        TINYINT(1) DEFAULT 0 COMMENT '是否造成受伤',
    intervention_used VARCHAR(255) DEFAULT NULL COMMENT '采用的干预措施',
    effectiveness     TINYINT DEFAULT NULL COMMENT '干预有效性 1~5（5最有效）',
    reported_by       INT DEFAULT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_bip (bip_id),
    KEY idx_time (occurred_at),
    CONSTRAINT fk_incident_bip FOREIGN KEY (bip_id)      REFERENCES behavior_intervention_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_incident_by FOREIGN KEY (reported_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='行为事件台账：验证 BIP 干预有效性的依据数据';

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 清理守卫过程并登记迁移
-- =====================================================================
DROP PROCEDURE IF EXISTS iep_add_col;
DROP PROCEDURE IF EXISTS iep_add_idx;
DROP PROCEDURE IF EXISTS iep_add_fk;

INSERT INTO db_migrations (version, description) VALUES
    ('1.4.0', 'v4 特教专业内核：短期目标/任务分析/按次记录、安置形式、相关服务台账、会议留痕、GB/T 26341 残疾分级字典、安全档案、沟通方式、BIP')
ON DUPLICATE KEY UPDATE description = VALUES(description);

SELECT 'update_v4.sql applied OK' AS result;
