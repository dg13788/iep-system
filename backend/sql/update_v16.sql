-- =====================================================================
-- v16（2026-10-13）：字典基线补齐 —— 全新安装不能依赖演示数据才有完整字典
--
-- 背景（安装自检 verify_install.sql 实测发现，P0）：
--   用 install_all.sql 全新安装后，以下字典**缺失**，而这些是业务必需的系统基线：
--     · dict_common.goal_area        仅 8 条（应有 18 条）——缺培智课标课程领域
--       生活语文 / 生活数学 / 生活适应 / 劳动技能 / 绘画与手工 /
--       唱游与律动 / 运动与保健 / 信息技术 / 康复训练 / 艺术休闲
--     · dict_common.service_place    0 条（应有 4 条）——v7 placement_type 的下游选项
--     · dict_common.transition_type  0 条（应有 3 条）——v10 转衔模块的下游选项
--     · dict_disability_types        仅 7 条（应有 15 条）——缺 8 类核心障碍
--       言语与语言障碍 / 情绪与行为障碍 / 肢体障碍 / ADHD /
--       发育迟缓 / 精神残疾 / 病弱 / 抽动症
--
-- 根因：这些字典历史上只被写进**演示数据生成器**（demo_data/temp/gen_demo_v3.py），
--       从未进入任何迁移文件。于是「只跑迁移文件」的全新部署装出来的系统，
--       连"生活语文""孤独症以外的 8 类障碍"都选不到；
--       而开发库之所以齐全，是因为灌过演示数据——
--       即：**库的实际状态 ≠ 代码能重建的状态**（与 ADR-038/039 同一类病）。
--
-- 原则：字典属系统基线，不是演示数据。演示数据只应引用字典，不应定义字典。
--
-- 幂等：全部为 INSERT ... SELECT ... WHERE NOT EXISTS，可重复执行；
--       已存在（按业务键：category+name / code）时不重复写入，不产生重复数据。
-- =====================================================================

SET NAMES utf8mb4;

-- ---------- 1. goal_area：补齐培智学校课程标准课程领域 ----------
-- 现有 1~7 为通用领域（认知/沟通/社交/生活自理/运动/情绪行为/学业），
-- 21 为 v13 补的职业转衔；本批从 8 起顺排，不与 21 冲突。
INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'life_chinese',       '生活语文',   '培智课标课程领域',     8,  1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '生活语文');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'life_math',          '生活数学',   '培智课标课程领域',     9,  1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '生活数学');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'life_adaptation',    '生活适应',   '培智课标课程领域',     10, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '生活适应');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'labor_skill',        '劳动技能',   '培智课标课程领域',     11, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '劳动技能');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'drawing_handcraft',  '绘画与手工', '培智课标课程领域',     12, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '绘画与手工');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'music_rhythm',       '唱游与律动', '培智课标课程领域',     13, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '唱游与律动');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'sports_health',      '运动与保健', '培智课标课程领域',     14, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '运动与保健');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'information_tech',   '信息技术',   '培智课标选择性课程',   15, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '信息技术');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'rehab_training',     '康复训练',   '培智课标选择性课程',   16, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '康复训练');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'goal_area', 'art_leisure',        '艺术休闲',   '培智课标选择性课程',   17, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'goal_area' AND t.name = '艺术休闲');

-- ---------- 2. service_place：安置形式/相关服务地点 ----------
INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'service_place', 'resource_room',  '资源教室',     '普通学校资源教室', 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'service_place' AND t.name = '资源教室');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'service_place', 'home_delivery',  '送教上门',     '学生家庭',         2, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'service_place' AND t.name = '送教上门');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'service_place', 'special_class',  '特教班',       '普通学校特教班',   3, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'service_place' AND t.name = '特教班');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'service_place', 'special_school', '特殊教育学校', '培智/特校就读',     4, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'service_place' AND t.name = '特殊教育学校');

-- ---------- 3. transition_type：转衔类型（v10 转衔模块下游选项）----------
INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'transition_type', 'stage_transition',     '学段转衔',     '学前→义务教育、义务教育→高中段', 1, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'transition_type' AND t.name = '学段转衔');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'transition_type', 'career_transition',    '职业转衔',     '高中段→就业/支持性就业',         2, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'transition_type' AND t.name = '职业转衔');

INSERT INTO dict_common (category, code, name, value, sort_order, is_active)
SELECT 'transition_type', 'community_transition', '社区生活转衔', '学校→社区独立生活',               3, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT category, name FROM dict_common) t
                    WHERE t.category = 'transition_type' AND t.name = '社区生活转衔');

-- ---------- 4. dict_disability_types：补齐 8 类核心障碍 ----------
-- 现有 1~7 为 initial 数据（智力/自闭症/脑瘫/唐氏/多重/听力/视力）；本批从 8 起。
INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'speech_lang',         '言语与语言障碍',              '言语、语言及吞咽功能障碍', 8,  1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'speech_lang');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'emotion_behavior',    '情绪与行为障碍',              '情绪与行为障碍',           9,  1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'emotion_behavior');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'physical',            '肢体障碍',                    '肢体（运动）功能障碍',     10, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'physical');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'adhd',                '注意缺陷与多动障碍（ADHD）',  '注意缺陷多动障碍',         11, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'adhd');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'developmental_delay', '发育迟缓',                    '全面性发育迟缓',           12, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'developmental_delay');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'psychiatric',         '精神残疾',                    '精神障碍',                 13, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'psychiatric');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'frail',               '病弱',                        '慢性疾病或体质虚弱',       14, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'frail');

INSERT INTO dict_disability_types (code, name, description, sort_order, is_active)
SELECT 'tics',                '抽动症',                      '抽动障碍',                 15, 1
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT code FROM dict_disability_types) t WHERE t.code = 'tics');

-- ---------- 5. 登记迁移版本（幂等）----------
INSERT INTO db_migrations (version, description, applied_at)
SELECT 'update_v16', '字典基线补齐：goal_area +10 / service_place +4 / transition_type +3 / 障碍类型 +8（全新安装不再依赖演示数据）', NOW()
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT version FROM db_migrations WHERE version = 'update_v16') AS t);

-- ---------- 6. 校验输出（人工执行时可见）----------
SELECT 'goal_area' AS item, COUNT(*) AS count FROM dict_common WHERE category = 'goal_area'
UNION ALL SELECT 'service_place', COUNT(*) FROM dict_common WHERE category = 'service_place'
UNION ALL SELECT 'transition_type', COUNT(*) FROM dict_common WHERE category = 'transition_type'
UNION ALL SELECT 'disability_types', COUNT(*) FROM dict_disability_types;
