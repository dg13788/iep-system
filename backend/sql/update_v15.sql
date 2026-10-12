-- ============================================================
-- v15（2026-10-12）：管理控制台数据导入/初始化整改
--
-- 背景（管理员真实浏览器实测 + 回测发现）：
--   ① 「数据导入」后端 5 个端点（students/iep/assessments/parents/teaching
--      的 case 'import'）早已实现，但前端没有任何入口——功能对用户不存在；
--   ② 五个导入权限码（student_import/iep_import/eval_import/parent_import/
--      record_import）在代码里 requirePermission()，却从未登记进 permissions
--      表（孤儿码，ADR-027 场景）——仅对 pg=1 超管无害，权限清单里查不到；
--   ③ 「系统初始化」确认短语「初始化系统」与页签「系统初始化」用字相同顺序
--      相反，管理员按页签名输入后被静默拒绝（按钮无提示），实测卡死；
--   ④ 初始化清空清单漏 6 张业务表（转衔/干预调整/决策审计/目标草稿/
--      家长会议证据），实测 158 行在「清空全部业务数据」后存活。
--
-- 本迁移只做Schema/字典层：登记 5 个导入权限码（不授予任何权限组——
-- 与 ADR-030「新增导入/导出码不扩大暴露面」一致：导入即写入，仅超管可用）。
-- 清空清单扩容、确认短语改「系统初始化」在 admin.php 代码层同步完成。
--
-- 幂等：INSERT ... WHERE NOT EXISTS 风格按 code 去重，可重复执行。
-- ============================================================

INSERT INTO permissions (name, code, module, description, is_active, created_at)
SELECT * FROM (
    SELECT '学生导入' AS name, 'student_import' AS code, 'students' AS module,
           '批量导入学生档案（csv/xlsx/xls）' AS description, 1 AS is_active, NOW() AS created_at
    UNION ALL
    SELECT 'IEP导入', 'iep_import', 'iep', '批量导入IEP计划（csv/xlsx/xls）', 1, NOW()
    UNION ALL
    SELECT '评估导入', 'eval_import', 'assessments', '批量导入评估记录（csv/xlsx/xls）', 1, NOW()
    UNION ALL
    SELECT '家长导入', 'parent_import', 'parents', '批量导入家长账号（csv/xlsx/xls）', 1, NOW()
    UNION ALL
    SELECT '教学记录导入', 'record_import', 'teaching', '批量导入教学记录（csv/xlsx/xls）', 1, NOW()
) AS new_perms
WHERE NOT EXISTS (
    SELECT 1 FROM permissions p WHERE p.code = new_perms.code
);

-- 记录迁移（若 db_migrations 存在且尚未记录；列名 applied_at）
INSERT INTO db_migrations (version, description, applied_at)
SELECT 'update_v15', '管理控制台数据导入/初始化整改：登记 5 个导入权限码（不授予任何组）', NOW()
WHERE NOT EXISTS (SELECT 1 FROM db_migrations WHERE version = 'update_v15');
