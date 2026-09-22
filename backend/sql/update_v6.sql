-- ============================================================
-- v6：系统管理员控制台（2026-09-20）
--   1) 为权限组 1（超级管理员）的 menu_permissions 追加 "admin"，
--      使侧边栏「管理控制台」入口仅对该组可见；
--   2) 其余权限组一律不授予 admin 菜单（保持最小权限）。
-- 幂等：可重复执行。
-- ============================================================

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
