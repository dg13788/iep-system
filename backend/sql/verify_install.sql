-- =====================================================================
-- IEP 系统 · 安装自检（证明「一次导入 = 全量」，兜底用）
--
-- 用法（同 install_all.sql，**在项目根目录执行**）：
--     mysql -uroot <库名> < backend/sql/verify_install.sql
--
-- 检查项：
--   C1 数据库对象齐全（47 表 + 2 视图 = 49，逐个比名，不是只比数字）
--   C2 库中是否存在预期外的对象（仅提示，不判失败）
--   C3 关键列齐全（靠 ALTER 追加的列最容易丢：direction / target_prompt_level /
--      source_assessment_id / baseline_value / parent_ref_id …）
--   C4 iep_approval_logs.action 枚举含 sign_revoke（v5 扩展）
--   C5 基线数据齐全（角色/权限/权限组/字典/账号/模块）
--   C6 无重复数据（permissions.code / dict_common(category,name) / db_migrations.version）
--   C7 视图可查询（定义未损坏）
--   C8 评估模板内容基线（表在≠装全了，必须查行数）
--
-- 退出判定：末行输出 INSTALL_VERIFY: OK 即全通过；FAILED 则列出失败项数。
--
-- 维护：新增表/列后，请同步更新本文件的期望清单，否则自检会失效。
-- =====================================================================

SET NAMES utf8mb4;

DROP TEMPORARY TABLE IF EXISTS _v_obj_expected;
CREATE TEMPORARY TABLE _v_obj_expected (obj_name VARCHAR(64) PRIMARY KEY);
INSERT INTO _v_obj_expected (obj_name) VALUES
  ('assessment_items'),
  ('assessment_templates'),
  ('assessment_templates_custom'),
  ('assessments'),
  ('audit_logs'),
  ('behavior_intervention_plans'),
  ('bip_incident_records'),
  ('data_scope_log'),
  ('db_migrations'),
  ('dict_common'),
  ('dict_disability_levels'),
  ('dict_disability_types'),
  ('dict_related_services'),
  ('iep_approval_logs'),
  ('iep_decision_audit'),
  ('iep_goal_drafts'),
  ('iep_goal_progress'),
  ('iep_goals'),
  ('iep_intervention_adjustments'),
  ('iep_meeting_participants'),
  ('iep_objective_records'),
  ('iep_objective_steps'),
  ('iep_objectives'),
  ('iep_plans'),
  ('iep_related_services'),
  ('iep_transition_goals'),
  ('iep_transition_services'),
  ('modules'),
  ('notifications'),
  ('parent_communications'),
  ('parent_meeting_inputs'),
  ('parent_signatures'),
  ('parents'),
  ('permission_groups'),
  ('permissions'),
  ('role_permissions'),
  ('roles'),
  ('student_attachments'),
  ('student_classes'),
  ('student_parents'),
  ('student_safety_profiles'),
  ('students'),
  ('system_events'),
  ('teacher_classes'),
  ('teaching_records'),
  ('template_items_custom'),
  ('users'),
  ('v_iep_goal_rollup'),
  ('v_iep_objective_progress');

DROP TEMPORARY TABLE IF EXISTS _v_col_expected;
CREATE TEMPORARY TABLE _v_col_expected (t_name VARCHAR(64), c_name VARCHAR(64), PRIMARY KEY (t_name, c_name));
INSERT INTO _v_col_expected (t_name, c_name) VALUES
  ('users','parent_ref_id'),
  ('iep_plans','source_assessment_id'),
  ('iep_plans','plaafp_draft_source'),
  ('iep_plans','placement_type'),
  ('iep_plans','meeting_date'),
  ('iep_goals','direction'),
  ('iep_goals','target_prompt_level'),
  ('iep_goals','baseline_value'),
  ('iep_goals','target_value'),
  ('iep_goals','monitor_frequency'),
  ('students','disability_level_id'),
  ('students','communication_methods');

SET @v_fail = 0;

-- C1 缺失对象
SET @v_missing = (SELECT COUNT(*) FROM _v_obj_expected e
   LEFT JOIN information_schema.tables t
     ON t.table_schema = DATABASE() AND t.table_name = e.obj_name
  WHERE t.table_name IS NULL);
SET @v_fail = @v_fail + @v_missing;

-- C2 预期外对象
SET @v_extra = (SELECT COUNT(*) FROM information_schema.tables t
  WHERE t.table_schema = DATABASE()
    AND t.table_name NOT IN (SELECT obj_name FROM _v_obj_expected));

-- C3 缺失关键列
SET @v_cols = (SELECT COUNT(*) FROM _v_col_expected c
   LEFT JOIN information_schema.columns col
     ON col.table_schema = DATABASE() AND col.table_name = c.t_name AND col.column_name = c.c_name
  WHERE col.column_name IS NULL);
SET @v_fail = @v_fail + @v_cols;

-- C4 枚举扩展
SET @v_enum = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'iep_approval_logs' AND column_name = 'action'
    AND column_type LIKE '%sign_revoke%');
SET @v_fail = @v_fail + IF(@v_enum = 1, 0, 1);

-- C5 基线数据（期望值取自 2026-10-13 正确终态）
SET @v_roles = (SELECT COUNT(*) FROM roles);
SET @v_perms = (SELECT COUNT(*) FROM permissions);
SET @v_pgroups = (SELECT COUNT(*) FROM permission_groups);
SET @v_dict = (SELECT COUNT(*) FROM dict_common);
SET @v_dtypes = (SELECT COUNT(*) FROM dict_disability_types);
SET @v_users = (SELECT COUNT(*) FROM users);
SET @v_modules = (SELECT COUNT(*) FROM modules);
SET @v_base_fail = IF(@v_roles >= 6, 0, 1) + IF(@v_perms >= 48, 0, 1) + IF(@v_pgroups >= 6, 0, 1)
                 + IF(@v_dict >= 52, 0, 1) + IF(@v_dtypes >= 15, 0, 1) + IF(@v_users >= 1, 0, 1)
                 + IF(@v_modules >= 8, 0, 1);
SET @v_fail = @v_fail + @v_base_fail;

-- C5b 字典分类明细（总数对不代表分类对：v16 之前 goal_area 只有 8/18、
--     service_place 与 transition_type 为 0，但总数可能侥幸接近，故逐类校验）
SET @v_goal_area      = (SELECT COUNT(*) FROM dict_common WHERE category = 'goal_area');
SET @v_service_place  = (SELECT COUNT(*) FROM dict_common WHERE category = 'service_place');
SET @v_transition     = (SELECT COUNT(*) FROM dict_common WHERE category = 'transition_type');
SET @v_assessment_t   = (SELECT COUNT(*) FROM dict_common WHERE category = 'assessment_type');
SET @v_dict_cat_fail  = IF(@v_goal_area >= 18, 0, 1) + IF(@v_service_place >= 4, 0, 1)
                      + IF(@v_transition >= 3, 0, 1) + IF(@v_assessment_t >= 4, 0, 1);
SET @v_fail = @v_fail + @v_dict_cat_fail;

-- C6 无重复
SET @v_dup = (SELECT COUNT(*) FROM (SELECT code FROM permissions GROUP BY code HAVING COUNT(*) > 1) a)
           + (SELECT COUNT(*) FROM (SELECT category, name FROM dict_common GROUP BY category, name HAVING COUNT(*) > 1) b)
           + (SELECT COUNT(*) FROM (SELECT version FROM db_migrations GROUP BY version HAVING COUNT(*) > 1) c);
SET @v_fail = @v_fail + @v_dup;

-- C7 视图可查询（视图存在才试查，否则跳过以免中断）
SET @cnt_view = (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'v_iep_goal_rollup');
SET @v_view_stmt = IF(@cnt_view = 1,
  'SET @v_viewrows = (SELECT COUNT(*) FROM v_iep_goal_rollup)', 'SET @v_viewrows = -1');
PREPARE _st FROM @v_view_stmt; EXECUTE _st; DEALLOCATE PREPARE _st;

-- C8 评估模板内容基线（2026-10-13 新增）
--   为什么必须查内容而不是只看表在不在：本次「库被快照覆盖后」表结构完好、
--   C1~C7 全 OK，但 assessment_templates 里课程本位评估表整族消失，
--   assessments 的演示评估引用的 template_id 全部悬空——**自检却显示通过**。
--   这证明「对象齐全 + 字典齐全」仍不足以判定「装全了」，业务基线也要查。
--   期望：101-137 连续 37 个模板（101-123 课程本位/能力检核 + 124-130 系统基础
--         + 131-137 校本）。124-130 这 7 个曾只存在于演示数据生成器，
--         开发库灌过演示数据所以看不出来，全新部署却会少——已补进 v18；
--         这些模板的条目定义不少于 71 条；
--         演示评估实际在用的 101/102/103/122/123 每个都至少有 1 条条目
--         （否则教师端「录入评估」选到模板却无条目可打分）。
SET @v_tpl = (SELECT COUNT(*) FROM assessment_templates WHERE id BETWEEN 101 AND 137);
SET @v_tic = (SELECT COUNT(*) FROM template_items_custom
  WHERE (template_id BETWEEN 101 AND 123) OR (template_id BETWEEN 131 AND 137));
SET @v_tpl_item_ok = (SELECT COUNT(*) FROM (
    SELECT 101 AS tid UNION ALL SELECT 102 UNION ALL SELECT 103
    UNION ALL SELECT 122 UNION ALL SELECT 123) x
  WHERE EXISTS (SELECT 1 FROM template_items_custom t WHERE t.template_id = x.tid));
SET @v_tpl_fail = IF(@v_tpl >= 37, 0, 1) + IF(@v_tic >= 71, 0, 1)
                + IF(@v_tpl_item_ok = 5, 0, 1);
SET @v_fail = @v_fail + @v_tpl_fail;

SELECT '===== IEP 安装自检明细 =====' AS step;

SELECT 'C1 缺失数据库对象' AS check_item, @v_missing AS actual, 0 AS expected, IF(@v_missing = 0, 'OK', 'FAIL') AS result
UNION ALL SELECT 'C2 预期外对象(提示)', @v_extra, 0, IF(@v_extra = 0, 'OK', 'INFO')
UNION ALL SELECT 'C3 缺失关键列', @v_cols, 0, IF(@v_cols = 0, 'OK', 'FAIL')
UNION ALL SELECT 'C4 action枚举含sign_revoke', @v_enum, 1, IF(@v_enum = 1, 'OK', 'FAIL')
UNION ALL SELECT 'C5 基线数据(角色/权限/组/字典/账号/模块)', @v_base_fail, 0, IF(@v_base_fail = 0, 'OK', 'FAIL')
UNION ALL SELECT 'C6 重复数据', @v_dup, 0, IF(@v_dup = 0, 'OK', 'FAIL')
UNION ALL SELECT 'C7 视图可查询(行数)', @v_viewrows, -2, IF(@v_viewrows >= 0, 'OK', 'FAIL')
UNION ALL SELECT 'C5b 字典分类明细齐全', @v_dict_cat_fail, 0, IF(@v_dict_cat_fail = 0, 'OK', 'FAIL')
UNION ALL SELECT 'C8 评估模板内容基线(37模板/71条目/5在用有条目)', @v_tpl_fail, 0, IF(@v_tpl_fail = 0, 'OK', 'FAIL')
UNION ALL SELECT '参考:模板101-137', @v_tpl, 37, 'INFO'
UNION ALL SELECT '参考:上述模板条目数', @v_tic, 71, 'INFO'
UNION ALL SELECT '参考:在用模板已有条目数', @v_tpl_item_ok, 5, 'INFO'
UNION ALL SELECT '参考:dict_common.goal_area', @v_goal_area, 18, 'INFO'
UNION ALL SELECT '参考:dict_common.service_place', @v_service_place, 4, 'INFO'
UNION ALL SELECT '参考:dict_common.transition_type', @v_transition, 3, 'INFO'
UNION ALL SELECT '参考:dict_common.assessment_type', @v_assessment_t, 4, 'INFO'
UNION ALL SELECT '参考:roles', @v_roles, 6, 'INFO'
UNION ALL SELECT '参考:permissions', @v_perms, 48, 'INFO'
UNION ALL SELECT '参考:permission_groups', @v_pgroups, 6, 'INFO'
UNION ALL SELECT '参考:dict_common', @v_dict, 52, 'INFO'
UNION ALL SELECT '参考:dict_disability_types', @v_dtypes, 15, 'INFO'
UNION ALL SELECT '参考:users', @v_users, 1, 'INFO'
UNION ALL SELECT '参考:modules', @v_modules, 8, 'INFO';

SELECT IF(@v_missing > 0, (SELECT GROUP_CONCAT(e.obj_name) FROM _v_obj_expected e
   LEFT JOIN information_schema.tables t ON t.table_schema = DATABASE() AND t.table_name = e.obj_name
  WHERE t.table_name IS NULL), '无缺失对象') AS missing_detail;

SELECT IF(@v_cols > 0, (SELECT GROUP_CONCAT(CONCAT(c.t_name, '.', c.c_name)) FROM _v_col_expected c
   LEFT JOIN information_schema.columns col ON col.table_schema = DATABASE() AND col.table_name = c.t_name AND col.column_name = c.c_name
  WHERE col.column_name IS NULL), '无缺失列') AS missing_column_detail;

SELECT DATABASE() AS verified_database, @v_fail AS failed_items,
       IF(@v_fail = 0, 'INSTALL_VERIFY: OK', CONCAT('INSTALL_VERIFY: FAILED (', @v_fail, ' 项不通过)')) AS final_result;
