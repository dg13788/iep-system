-- ============================================================
-- v6：系统管理员控制台（2026-09-20）
--   1) 为权限组 1（超级管理员）的 menu_permissions 追加 "admin"，
--      使侧边栏「管理控制台」入口仅对该组可见；
--   2) 其余权限组一律不授予 admin 菜单（保持最小权限）。
-- 幂等：可重复执行。
-- ============================================================

-- 修复(P1)：本文件原先没有声明客户端字符集。在 character_set_client=gbk 的环境
-- （中文 Windows 上 mysql 客户端的默认值）下导入，下面登记台账的中文语句会报
-- ERROR 1366 直接失败；而安装脚本又把错误输出丢弃，于是「v6 没生效」被完全掩盖，
-- 表现为超级管理员的「管理控制台」对所有人不可达。这里与 v3 / v4 保持一致，
-- 显式声明 utf8mb4。
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS iep_tmp_add_admin_menu;

DELIMITER //
CREATE PROCEDURE iep_tmp_add_admin_menu()
BEGIN
    DECLARE v_menu TEXT;

    SELECT menu_permissions INTO v_menu
    FROM permission_groups WHERE id = 1 LIMIT 1;

    -- 只在尚未包含 "admin" 时追加，避免重复执行产生重复项
    IF v_menu IS NOT NULL AND LOCATE('"admin"', v_menu) = 0 THEN
        IF v_menu IS NULL OR v_menu = '' OR v_menu = '[]' THEN
            SET v_menu = '["admin"]';
        ELSE
            -- 去掉结尾的 ]，追加 ,"admin"]
            SET v_menu = CONCAT(TRIM(TRAILING ']' FROM TRIM(v_menu)), ', "admin"]');
        END IF;
        UPDATE permission_groups SET menu_permissions = v_menu WHERE id = 1;
    END IF;
END //
DELIMITER ;

CALL iep_tmp_add_admin_menu();
DROP PROCEDURE IF EXISTS iep_tmp_add_admin_menu;

-- 结果校验（执行后应看到 menu_permissions 含 "admin"）
SELECT id, name, menu_permissions FROM permission_groups WHERE id = 1;

-- ---------------------------------------------------------------------------
-- 修复(P2-3)：v6 原先不写 db_migrations 台账（v4 / v5 都有写），
-- 导致无法从台账判断存量库是否打过 v6 —— 管理控制台不可达时排查困难。
-- 这里补一条幂等登记，与 v4 / v5 保持一致的运维可见性。
-- ---------------------------------------------------------------------------
INSERT INTO db_migrations (version, description)
SELECT 'v6', '系统管理员控制台：为权限组 1 追加 admin 菜单权限'
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT version FROM db_migrations WHERE version = 'v6') AS t
);
