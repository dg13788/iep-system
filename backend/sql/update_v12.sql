-- ============================================================
-- update_v12.sql — 权限码治理（孤儿码 / 隐式特权 / 别名补漏）
--
-- 背景（由 audit_perm_codes.py + probe_orphan_perm.py 实测坐实）：
--   1) 12 个权限码「代码在用、但从未授予任何权限组」。
--      因 checkPermission() 对 permission_group_id=1 无条件直通，
--      admin 不受影响，**全体非超管账号的功能被静默阉割**。
--      实测：教学主任/班主任访问 iep_export、eval_export、
--      record_export、parent_export 等一律 403。
--   2) 隐式特权：这些码实际只由「pgId===1 直通」生效，
--      权限清单里根本看不到 admin 拥有它们——审计与自查都查不出来。
--
-- 治理原则：
--   · 导入类（会批量覆盖数据）→ 仅超级管理员，显式授予以消除隐式特权
--   · 导出类（读取为主）→ 按业务需要授予主任/班主任/科任
--   · 高危码（system.manage 等）→ 仅超管，不参与别名（ADR-014）
--
-- 幂等：全部带 NOT JSON_CONTAINS 判重，可重复执行。
-- ============================================================

-- ---------- 1. 导入类：仅超管（组1） ----------
-- 批量覆盖型操作，任何教学岗都不应持有。
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'student_import')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"student_import"');
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'eval_import')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"eval_import"');
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'iep_import')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"iep_import"');
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'record_import')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"record_import"');
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'parent_import')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"parent_import"');

-- ---------- 2. 导出类：按业务需要授予 ----------
-- 评估导出：主任/班主任
-- 最初也曾授予只读组（理由是它已持 student_export），但随后收回——
-- 理由：ADR 明确写明「导出权限一旦账号泄露即为全校残障儿童敏感信息批量泄露」。
-- 既有码不动（避免破坏既有功能），但**新增**的导出码不应再扩大暴露面。
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'eval_export')
WHERE id IN (1,2,3) AND NOT JSON_CONTAINS(feature_permissions, '"eval_export"');

-- 幂等收回：若只读组已持有 eval_export，移除
UPDATE permission_groups
   SET feature_permissions = JSON_REMOVE(
       feature_permissions,
       JSON_UNQUOTE(JSON_SEARCH(feature_permissions, 'one', 'eval_export')))
 WHERE id = 6
   AND JSON_CONTAINS(feature_permissions, '"eval_export"');

-- IEP 导出：主任/班主任（科任仅参与不主导，暂不放开）
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'iep_export')
WHERE id IN (1,2,3) AND NOT JSON_CONTAINS(feature_permissions, '"iep_export"');

-- 教学记录导出：主任/班主任/科任（科任要导出自己授课的记录）
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'record_export')
WHERE id IN (1,2,3,4) AND NOT JSON_CONTAINS(feature_permissions, '"record_export"');

-- 家长名单导出：主任/班主任（含联系方式，科任不授予）
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'parent_export')
WHERE id IN (1,2,3) AND NOT JSON_CONTAINS(feature_permissions, '"parent_export"');

-- ---------- 3. 高危码显式授予超管（消除隐式特权） ----------
-- 此前 admin 能访问 system.manage 全靠 pgId===1 直通，
-- 权限清单里查不到——等于「特权不可见、不可审」。
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'system.manage')
WHERE id IN (1) AND NOT JSON_CONTAINS(feature_permissions, '"system.manage"');

-- ---------- 4. 家长沟通记录：新码补授（旧码 communication_record 已有别名通道） ----------
-- parents.communication_create 是 ADR-014 的漏网之鱼：
-- 代码用新码，但旧码通信记录没有登记别名 → 新码成孤儿。
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'parents.communication_create')
WHERE id IN (1,2,3,4) AND NOT JSON_CONTAINS(feature_permissions, '"parents.communication_create"');

-- ---------- 5. 报表码：reports.iep 此前无任何组持有且无别名 ----------
UPDATE permission_groups SET feature_permissions =
    JSON_ARRAY_APPEND(feature_permissions, '$', 'reports.iep')
WHERE id IN (1,2,3) AND NOT JSON_CONTAINS(feature_permissions, '"reports.iep"');

-- ---------- 6. 核验视图：残留孤儿码应为 0 ----------
-- SELECT g.id, g.name, c.code
--   FROM permission_groups g
--   JOIN (SELECT 'eval_export' code UNION SELECT 'iep_export' UNION SELECT 'record_export'
--         UNION SELECT 'parent_export' UNION SELECT 'student_import' UNION SELECT 'eval_import'
--         UNION SELECT 'iep_import' UNION SELECT 'record_import' UNION SELECT 'parent_import'
--         UNION SELECT 'system.manage' UNION SELECT 'parents.communication_create'
--         UNION SELECT 'reports.iep') c
--  WHERE JSON_CONTAINS(g.feature_permissions, CONCAT('"', c.code, '"'));
