<?php
/**
 * Admin Console Module - 系统管理员专属（permission_group_id = 1）
 *
 * 定位：面向系统管理员的运维控制台，全部端点经 requireSystemAdmin() 硬校验，
 *       非管理员一律 403 并记入审计日志；不可逆操作（初始化 / 恢复备份）
 *       额外要求「登录密码二次确认 + 确认短语」。
 *
 * 端点一览：
 *   GET  /api/admin/overview                    - 数据总览（表行数、库容量、备份概况、运行环境）
 *   GET  /api/admin/tables                      - 全量数据可查阅表清单（白名单）
 *   GET  /api/admin/all_data       ?table=&page=&pageSize=&keyword=
 *                                               - 全量数据只读查阅（绕过数据范围，仅管理员）
 *   GET  /api/admin/all_data_export ?table=     - 全量数据导出 CSV
 *   GET  /api/admin/backup/list                 - 备份文件清单
 *   POST /api/admin/backup/create               - 一键备份（纯 PHP 导出，无需 mysqldump）
 *   GET  /api/admin/backup/download ?file=      - 下载备份
 *   POST /api/admin/backup/delete               - 删除备份 { file }
 *   POST /api/admin/backup/restore              - 恢复备份 { file, password, confirm }
 *   POST /api/admin/init                        - 系统初始化 { mode: reset|demo, password, confirm }
 *
 * 安全约束（务必保留）：
 *   1) 表名一律走白名单 ADMIN_READABLE_TABLES，禁止拼接任意表名；
 *   2) 备份文件名按白名单正则校验 + realpath 必须落在备份目录内（防目录穿越）；
 *   3) 初始化 / 恢复前强制先落地一份备份（初始化失败即中止，不留半截状态）；
 *   4) 所有写操作写入 audit_logs，module='admin'。
 */

require_once __DIR__ . '/config.php';

// ---------------------------------------------------------------------------
// 常量与白名单
// ---------------------------------------------------------------------------

/** 备份目录（backend/backups） */
if (!defined('ADMIN_BACKUP_DIR')) {
    define('ADMIN_BACKUP_DIR', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups');
}

/**
 * 「全量数据」单次返回的行数上限。
 * 必须与 config.php: getPagination() 中的 min(100, ...) 保持一致——
 * 真正的钳制发生在那里，前端文案也以本常量为准。
 */
if (!defined('ADMIN_MAX_PAGE_SIZE')) {
    define('ADMIN_MAX_PAGE_SIZE', 100);
}

/** 「全量数据」可查阅的表白名单：表名 => 中文名 */
if (!function_exists('adminReadableTables')) {
    function adminReadableTables(): array {
        return [
            'students'                    => '学生',
            'student_classes'             => '班级',
            'student_parents'             => '学生-家长关联',
            'parents'                     => '家长',
            'student_safety_profiles'     => '安全档案',
            'iep_plans'                   => 'IEP计划',
            'iep_goals'                   => 'IEP长期目标',
            'iep_objectives'              => '短期目标',
            'iep_objective_steps'         => '任务分析步骤',
            'iep_objective_records'       => '试次达成记录',
            'iep_related_services'        => '相关服务台账',
            'iep_meeting_participants'    => 'IEP会议参与人',
            'iep_approval_logs'           => '审批留痕',
            'iep_goal_progress'           => '目标进度',
            'assessments'                 => '评估记录',
            'assessment_items'            => '评估明细',
            'teaching_records'            => '教学记录',
            'behavior_intervention_plans' => '行为干预计划',
            'bip_incident_records'        => '行为事件',
            'parent_signatures'           => '家长签名',
            'parent_communications'       => '家校沟通',
            'notifications'               => '通知',
            'users'                       => '用户账号',
            'audit_logs'                  => '审计日志',
        ];
    }
}

/**
 * 初始化时要清空的业务表（按外键依赖顺序，先子后父）。
 * 刻意不含：users / roles / permissions / role_permissions / permission_groups /
 *           modules / dict_* —— 账号、权限与字典必须保留，否则系统将无法登录。
 */
if (!function_exists('adminResetTables')) {
    function adminResetTables(): array {
        return [
            'assessment_items',
            'assessments',
            'iep_objective_records',
            'iep_objective_steps',
            'iep_objectives',
            'iep_goal_progress',
            'iep_goals',
            'iep_related_services',
            'iep_meeting_participants',
            'iep_approval_logs',
            'iep_plans',
            'bip_incident_records',
            'behavior_intervention_plans',
            'student_safety_profiles',
            'student_attachments',
            'student_parents',
            'parents',
            'teaching_records',
            'parent_signatures',
            'parent_communications',
            'notifications',
            'data_scope_log',
            'system_events',
            'students',
            'student_classes',
            'teacher_classes',
        ];
    }
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------
$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';
$subAction = isset($parts[2]) ? $parts[2] : '';

switch ($action) {
    case 'overview':
        adminOverview();
        break;

    case 'tables':
        adminTables();
        break;

    case 'all_data':
        adminAllData();
        break;

    case 'all_data_export':
        adminAllDataExport();
        break;

    case 'backup':
        adminBackup($subAction);
        break;

    case 'init':
        adminInit();
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的管理操作: ' . $action]);
}

// ===========================================================
// 数据总览
// ===========================================================
function adminOverview(): void {
    requireSystemAdmin();

    try {
        $pdo = getDB();

        // 全部表行数与容量
        $stmt = $pdo->query(
            'SELECT TABLE_NAME AS table_name, TABLE_ROWS AS table_rows,
                    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb,
                    TABLE_COMMENT AS table_comment
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
             ORDER BY TABLE_NAME'
        );
        $tables = $stmt->fetchAll();

        // 精确行数（information_schema 的 TABLE_ROWS 是估算值，用 COUNT(*) 校正核心表）
        $coreTables = adminReadableTables();
        $exact = [];
        foreach ($coreTables as $t => $label) {
            try {
                $c = $pdo->query('SELECT COUNT(*) FROM `' . $t . '`');
                $exact[$t] = intval($c->fetchColumn());
            } catch (PDOException $e) {
                $exact[$t] = null; // 表不存在等情况，置空不阻断总览
            }
        }

        // 数据库总容量
        $sizeStmt = $pdo->query(
            'SELECT ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2)
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
        );
        $dbSizeMb = floatval($sizeStmt->fetchColumn() ?: 0);

        // 备份概况
        $backups = adminListBackupFiles();
        $backupTotalMb = 0.0;
        foreach ($backups as $b) {
            $backupTotalMb += floatval($b['size_mb']);
        }

        // 关键业务指标
        $metrics = [];
        $metricSql = [
            'student_count'  => 'SELECT COUNT(*) FROM students WHERE deleted_at IS NULL',
            'class_count'    => 'SELECT COUNT(*) FROM student_classes WHERE is_active = 1',
            'iep_count'      => 'SELECT COUNT(*) FROM iep_plans WHERE deleted_at IS NULL',
            'user_count'     => 'SELECT COUNT(*) FROM users WHERE is_active = 1',
            'audit_count'    => 'SELECT COUNT(*) FROM audit_logs',
            'last_audit_at'  => 'SELECT MAX(created_at) FROM audit_logs',
        ];
        foreach ($metricSql as $k => $sql) {
            try {
                $metrics[$k] = $pdo->query($sql)->fetchColumn();
            } catch (PDOException $e) {
                $metrics[$k] = null;
            }
        }

        jsonResponse([
            'success' => true,
            'data'    => [
                'tables'         => $tables,
                'table_counts'   => $exact,
                'table_labels'   => $coreTables,
                'db_size_mb'     => $dbSizeMb,
                'backup_count'   => count($backups),
                'backup_size_mb' => round($backupTotalMb, 2),
                'last_backup'    => $backups[0]['file'] ?? null,
                'last_backup_at' => $backups[0]['created_at'] ?? null,
                'metrics'        => $metrics,
                'env'            => [
                    'php_version'  => PHP_VERSION,
                    'db_version'   => $pdo->query('SELECT VERSION()')->fetchColumn(),
                    'db_name'      => DB_NAME,
                    'server_time'  => date('Y-m-d H:i:s'),
                    'backup_dir'   => ADMIN_BACKUP_DIR,
                    'backup_dir_writable' => is_writable(ADMIN_BACKUP_DIR),
                ],
            ],
            'message' => '获取成功',
        ]);
    } catch (PDOException $e) {
        error_log('admin/overview error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '获取总览失败'], 500);
    }
}

// ===========================================================
// 可查阅表清单
// ===========================================================
function adminTables(): void {
    requireSystemAdmin();

    try {
        $pdo = getDB();
        $out = [];
        foreach (adminReadableTables() as $t => $label) {
            try {
                $c = intval($pdo->query('SELECT COUNT(*) FROM `' . $t . '`')->fetchColumn());
            } catch (PDOException $e) {
                $c = null;
            }
            $out[] = ['table' => $t, 'label' => $label, 'count' => $c];
        }
        jsonResponse(['success' => true, 'data' => $out, 'message' => '获取成功']);
    } catch (PDOException $e) {
        jsonResponse(['success' => false, 'message' => '获取失败'], 500);
    }
}

// ===========================================================
// 全量数据（只读）
// ===========================================================
function adminAllData(): void {
    requireSystemAdmin();

    $tables = adminReadableTables();
    $table = isset($_GET['table']) ? trim($_GET['table']) : '';
    if (!isset($tables[$table])) {
        jsonResponse(['success' => false, 'message' => '不允许查阅该表'], 400);
    }

    [$page, $pageSize, $offset] = getPagination();
    // 修复（0920 回测 P2-1）：getPagination() 已将 pageSize 钳制到 100，
    // 原先这里的 `>200` 二次钳制永远不可能触发（死代码），
    // 却让前端据注释写出「单次最多 200 行」的错误文案。
    // 统一以 ADMIN_MAX_PAGE_SIZE 为唯一口径，前后端一致。
    if ($pageSize > ADMIN_MAX_PAGE_SIZE) {
        $pageSize = ADMIN_MAX_PAGE_SIZE; // 防止一次拉取过大拖垮服务
    }

    try {
        $pdo = getDB();

        // 有软删标记的表默认只看未删除（管理员可通过 with_deleted=1 查看全部）
        $hasDeletedAt = adminTableHasColumn($pdo, $table, 'deleted_at');
        $withDeleted = isset($_GET['with_deleted']) && intval($_GET['with_deleted']) === 1;
        $where = ($hasDeletedAt && !$withDeleted) ? 'WHERE `deleted_at` IS NULL' : '';

        $total = intval($pdo->query('SELECT COUNT(*) FROM `' . $table . '` ' . $where)->fetchColumn());

        $orderCol = adminTableHasColumn($pdo, $table, 'id') ? '`id` DESC' : '1';
        $sql = 'SELECT * FROM `' . $table . '` ' . $where . ' ORDER BY ' . $orderCol .
               ' LIMIT ' . $offset . ', ' . $pageSize;
        $rows = $pdo->query($sql)->fetchAll();

        // 账号表不出密码哈希；审计日志允许查看（管理员本职）
        if ($table === 'users') {
            foreach ($rows as &$r) {
                unset($r['password_hash']);
            }
            unset($r);
        }

        jsonResponse([
            'success' => true,
            'data'    => [
                'list'     => $rows,
                'columns'  => $rows ? array_keys($rows[0]) : [],
                'total'    => $total,
                'page'     => $page,
                'pageSize' => $pageSize,
                'label'    => $tables[$table],
            ],
            'message' => '获取成功',
        ]);
    } catch (PDOException $e) {
        error_log('admin/all_data error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '查询失败'], 500);
    }
}

// ===========================================================
// 全量数据导出 CSV
// ===========================================================
function adminAllDataExport(): void {
    requireSystemAdmin();

    $tables = adminReadableTables();
    $table = isset($_GET['table']) ? trim($_GET['table']) : '';
    if (!isset($tables[$table])) {
        jsonResponse(['success' => false, 'message' => '不允许导出该表'], 400);
    }

    try {
        $pdo = getDB();
        $hasDeletedAt = adminTableHasColumn($pdo, $table, 'deleted_at');
        $withDeleted = isset($_GET['with_deleted']) && intval($_GET['with_deleted']) === 1;
        $where = ($hasDeletedAt && !$withDeleted) ? 'WHERE `deleted_at` IS NULL' : '';

        $rows = $pdo->query('SELECT * FROM `' . $table . '` ' . $where . ' LIMIT 20000')->fetchAll();

        if ($table === 'users') {
            foreach ($rows as &$r) {
                unset($r['password_hash']);
            }
            unset($r);
        }

        $filename = 'iep_' . $table . '_' . date('Ymd_His') . '.csv';

        header('Content-Type: text/csv; charset=UTF-8');
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: attachment; filename="' . $filename . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
        header('Cache-Control: no-store, no-cache, must-revalidate');

        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // Excel 中文 BOM

        if (!empty($rows)) {
            fputcsv($out, array_keys($rows[0]));
            foreach ($rows as $row) {
                $line = [];
                foreach ($row as $v) {
                    $line[] = is_null($v) ? '' : (is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string) $v);
                }
                fputcsv($out, $line);
            }
        } else {
            fputcsv($out, ['无数据']);
        }
        fclose($out);

        auditLog('export', 'admin', 'all_data', 0, $table, null, null, '导出全量数据：' . $table);
        exit;
    } catch (PDOException $e) {
        error_log('admin/all_data_export error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '导出失败'], 500);
    }
}

// ===========================================================
// 备份：list / create / download / delete / restore
// ===========================================================
function adminBackup(string $subAction): void {
    $user = requireSystemAdmin();

    switch ($subAction) {
        case '':
        case 'list':
            jsonResponse([
                'success' => true,
                'data'    => [
                    'list' => adminListBackupFiles(),
                    'dir'  => ADMIN_BACKUP_DIR,
                ],
                'message' => '获取成功',
            ]);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
            }
            adminBackupCreate($user);
            break;

        case 'download':
            adminBackupDownload();
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
            }
            adminBackupDelete($user);
            break;

        case 'restore':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
            }
            adminBackupRestore($user);
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的备份操作: ' . $subAction]);
    }
}

/** 一键备份：纯 PHP 导出整库 SQL（不依赖 mysqldump，Windows 环境同样可用） */
function adminBackupCreate(array $user): void {
    // 备份目录不存在则创建，并放置 .htaccess 拒绝直接下载（Apache 部署形态）
    if (!is_dir(ADMIN_BACKUP_DIR)) {
        @mkdir(ADMIN_BACKUP_DIR, 0750, true);
        @file_put_contents(
            ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . '.htaccess',
            "Require all denied\nDeny from all\n"
        );
    }
    if (!is_dir(ADMIN_BACKUP_DIR) || !is_writable(ADMIN_BACKUP_DIR)) {
        jsonResponse(['success' => false, 'message' => '备份目录不可写：' . ADMIN_BACKUP_DIR], 500);
    }

    $filename = 'iep_backup_' . date('Ymd_His') . '.sql';
    $filepath = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $filename;

    try {
        $pdo = getDB();
        // 基表与视图分开：先落基表数据，最后重建视图（视图依赖基表）
        [$tables, $views] = adminListTablesAndViews($pdo);

        $fh = fopen($filepath, 'w');
        if (!$fh) {
            jsonResponse(['success' => false, 'message' => '无法创建备份文件'], 500);
        }

        $written = [
            '-- IEP System Database Backup',
            '-- Generated: ' . date('Y-m-d H:i:s'),
            '-- Database : ' . DB_NAME,
            '-- Operator : user#' . intval($user['sub'] ?? 0),
            '-- Tables   : ' . count($tables) . ' (views: ' . count($views) . ')',
            '',
            'SET NAMES utf8mb4;',
            'SET FOREIGN_KEY_CHECKS = 0;',
            'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";',
            '',
        ];
        fwrite($fh, implode("\n", $written) . "\n");

        $dumped = 0;
        foreach ($tables as $t) {
            $dumped += adminDumpTable($pdo, $fh, $t, 'BASE TABLE');
        }
        foreach ($views as $v) {
            adminDumpTable($pdo, $fh, $v, 'VIEW');
        }

        fwrite($fh, "\nSET FOREIGN_KEY_CHECKS = 1;\n-- End of backup\n");
        fclose($fh);

        $sizeMb = round(filesize($filepath) / 1024 / 1024, 2);
        auditLog('backup', 'admin', 'database', 0, $filename, null,
            ['file' => $filename, 'size_mb' => $sizeMb, 'rows' => $dumped],
            '一键备份数据库：' . $filename);

        jsonResponse([
            'success' => true,
            'data'    => [
                'file'    => $filename,
                'size_mb' => $sizeMb,
                'rows'    => $dumped,
                'tables'  => count($tables),
            ],
            'message' => '备份完成：' . $filename,
        ]);
    } catch (PDOException $e) {
        error_log('admin/backup_create error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '备份失败：数据库错误'], 500);
    } catch (Throwable $e) {
        error_log('admin/backup_create error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '备份失败'], 500);
    }
}

/** 下载备份文件 */
function adminBackupDownload(): void {
    requireSystemAdmin();

    $file = isset($_GET['file']) ? trim($_GET['file']) : '';
    if (!adminIsSafeBackupFile($file)) {
        jsonResponse(['success' => false, 'message' => '文件名非法'], 400);
    }
    $filepath = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $file;
    if (!is_file($filepath)) {
        jsonResponse(['success' => false, 'message' => '备份文件不存在'], 404);
    }

    auditLog('download', 'admin', 'backup', 0, $file, null, null, '下载备份文件：' . $file);

    header('Content-Type: application/sql; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($filepath));
    header('Content-Disposition: attachment; filename="' . $file . '"; filename*=UTF-8\'\'' . rawurlencode($file));
    header('Cache-Control: no-store, no-cache, must-revalidate');
    readfile($filepath);
    exit;
}

/** 删除备份文件 */
function adminBackupDelete(array $user): void {
    $input = getInput();
    $file = isset($input['file']) ? trim($input['file']) : '';
    if (!adminIsSafeBackupFile($file)) {
        jsonResponse(['success' => false, 'message' => '文件名非法'], 400);
    }
    $filepath = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $file;
    if (!is_file($filepath)) {
        jsonResponse(['success' => false, 'message' => '备份文件不存在'], 404);
    }
    if (!@unlink($filepath)) {
        jsonResponse(['success' => false, 'message' => '删除失败，请检查文件权限'], 500);
    }

    auditLog('delete', 'admin', 'backup', 0, $file, null, null, '删除备份文件：' . $file);
    jsonResponse(['success' => true, 'message' => '已删除：' . $file]);
}

/** 恢复备份：需要登录密码 + 确认短语（必须等于文件名） */
function adminBackupRestore(array $user): void {
    $input = getInput();
    $file = isset($input['file']) ? trim($input['file']) : '';
    $password = isset($input['password']) ? (string) $input['password'] : '';
    $confirm = isset($input['confirm']) ? trim((string) $input['confirm']) : '';

    // 名称合法性（含路径穿越）与「文件是否存在」分开判定：
    // 前者是 400（请求本身有问题），后者是 404（请求合法但资源不存在）。
    if (!adminIsSafeBackupName($file)) {
        jsonResponse(['success' => false, 'message' => '文件名非法'], 400);
    }
    if (!verifyCurrentAdminPassword($user, $password)) {
        auditLog('denied', 'admin', 'restore', 0, $file, null, null, '恢复备份：密码校验失败');
        jsonResponse(['success' => false, 'message' => '登录密码校验失败，无法执行恢复'], 403);
    }
    if ($confirm !== $file) {
        jsonResponse(['success' => false, 'message' => '确认短语与备份文件名不一致，已取消'], 400);
    }

    $filepath = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $file;
    if (!is_file($filepath)) {
        jsonResponse(['success' => false, 'message' => '备份文件不存在'], 404);
    }
    if (!adminIsSafeBackupFile($file)) {
        jsonResponse(['success' => false, 'message' => '文件名非法'], 400);
    }

    // 权限预检（0920 回测 P0-1 加固）：DDL 无法回滚，务必在触碰任何数据之前
    // 确认当前连接具备重建视图的权限；不具备就直接中止，库保持原样。
    $probeErr = null;
    if (!adminCanRecreateViews($probeErr)) {
        error_log('admin/backup_restore precheck failed: ' . (string) $probeErr);
        auditLog('restore_failed', 'admin', 'database', 0, $file,
            ['stage' => 'precheck', 'error' => $probeErr], null,
            '恢复前权限预检未通过，已中止（数据未改动）');
        jsonResponse([
            'success' => false,
            'data'    => ['stage' => 'precheck', 'error' => $probeErr],
            'message' => '当前数据库账号权限不足，无法重建视图；已中止恢复，数据未改动。'
                . '请改用具备 SUPER/SYSTEM_USER 或视图定义者权限的账号，原因：' . $probeErr,
        ], 500);
    }

    // 恢复前强制留一份当前状态备份，避免误恢复后无从回退
    $preBackup = adminCreateBackupSilently();
    if (!$preBackup) {
        jsonResponse(['success' => false, 'message' => '恢复前的自动备份失败，已中止恢复（数据未改动）'], 500);
    }

    $err = null;
    $statements = 0;
    try {
        $pdo = getDB();
        set_time_limit(0);

        // 注意：备份文件含 DROP TABLE / CREATE TABLE / CREATE VIEW 等 DDL，
        // MySQL 对 DDL 会隐式提交，无法用事务整体回滚。因此这里不做事务包裹，
        // 而是「逐语句执行 + 失败即自动用恢复前备份回退」来保证数据安全。
        $statements = adminExecuteSqlFile($pdo, $filepath, $err);
    } catch (Throwable $e) {
        $err = $e->getMessage();
    }

    if ($err !== null) {
        error_log('admin/backup_restore error: ' . $err . ' (file=' . $file . ')');
        auditLog('restore_failed', 'admin', 'database', 0, $file,
            ['pre_backup' => $preBackup, 'error' => $err], null, '恢复备份失败：' . $file);

        // 自动回退：用恢复前刚生成的备份把库拉回原状态（仅回退一次，避免递归）
        $rolledBack = false;
        $rollbackErr = null;
        try {
            $pdo2 = getDB();
            adminExecuteSqlFile($pdo2, ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $preBackup, $rollbackErr);
            $rolledBack = ($rollbackErr === null);
        } catch (Throwable $e2) {
            $rollbackErr = $e2->getMessage();
        }
        if (!$rolledBack) {
            error_log('admin/backup_restore rollback failed: ' . (string) $rollbackErr);
        }

        jsonResponse([
            'success' => false,
            'data'    => [
                'pre_backup'    => $preBackup,
                'auto_rollback' => $rolledBack,
                'failed_at'     => $err,
            ],
            'message' => $rolledBack
                ? ('恢复失败，已自动从恢复前备份 ' . $preBackup . ' 回退。原因：' . $err)
                : ('恢复失败且自动回退未成功，请手动从 ' . $preBackup . ' 恢复。原因：' . $err),
        ], 500);
    }

    auditLog('restore', 'admin', 'database', 0, $file,
        ['pre_backup' => $preBackup, 'statements' => $statements], null, '恢复备份：' . $file);

    jsonResponse([
        'success' => true,
        'data'    => ['restored_from' => $file, 'pre_backup' => $preBackup, 'statements' => $statements],
        'message' => '已从 ' . $file . ' 恢复（恢复前自动备份为 ' . $preBackup . '）',
    ]);
}

/**
 * demo 种子收尾：把占位口令替换为真实 bcrypt 摘要。
 *
 * parents.password_hash 为 NOT NULL 且无默认值，SQL 种子只能写入占位串；
 * 这里按 parents.php 的既有规则（初始口令 = 手机号后 6 位）补齐，
 * 使 demo 初始化出来的家长账号可直接登录。
 */
function adminFinalizeDemoParents(PDO $pdo): int {
    try {
        $st = $pdo->query("SELECT id, phone FROM parents WHERE password_hash = '__PENDING__'");
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $upd = $pdo->prepare('UPDATE parents SET password_hash = ? WHERE id = ?');
        $n = 0;
        foreach ($rows as $r) {
            $phone = (string) ($r['phone'] ?? '');
            if ($phone === '') {
                continue;
            }
            $upd->execute([password_hash(substr($phone, -6), PASSWORD_BCRYPT), $r['id']]);
            $n++;
        }
        return $n;
    } catch (Throwable $e) {
        error_log('adminFinalizeDemoParents error: ' . $e->getMessage());
        return 0;
    }
}

/**
 * 恢复前权限预检：确认当前连接能 DROP/CREATE 视图。
 *
 * 做法：建一个临时视图并立即删除。若当前账号缺少相应权限（如 MySQL 8 下
 * 非 root 账号操作 DEFINER=root 的视图会报 1227），这里会先失败，
 * 从而在「尚未触碰任何业务数据」的阶段中止恢复。
 */
function adminCanRecreateViews(?string &$err): bool {
    $err = null;
    try {
        $pdo = getDB();

        // ① 自身能否建/删视图（新建的临时视图定义者即当前账号，必然有权限）
        $tmp = 'iep_restore_probe_' . substr(md5(uniqid('', true)), 0, 8);
        $pdo->exec('CREATE VIEW `' . $tmp . '` AS SELECT 1 AS probe');
        $pdo->exec('DROP VIEW IF EXISTS `' . $tmp . '`');

        // ② 关键：库里「现存」视图的定义者是否为当前账号。
        //    备份文件已剥离 DEFINER（新建视图不再是 root），但历史库里的视图
        //    可能仍由 root 创建；MySQL 8 下 DROP 他人定义的视图需要
        //    SYSTEM_USER/SUPER，否则报 1227。仅做 ① 会通过预检却在执行中失败，
        //    因此这里必须显式比对定义者。
        $me = (string) $pdo->query('SELECT CURRENT_USER()')->fetchColumn();
        $rows = $pdo->query(
            'SELECT TABLE_NAME, DEFINER FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()'
        )->fetchAll(PDO::FETCH_ASSOC);
        $foreign = [];
        foreach ($rows as $r) {
            if (strcasecmp((string) $r['DEFINER'], $me) !== 0) {
                $foreign[] = $r['TABLE_NAME'] . '(' . $r['DEFINER'] . ')';
            }
        }
        if (empty($foreign)) {
            return true;
        }

        // ③ 定义者不一致时，只有当账号具备 SYSTEM_USER / SUPER 才可安全继续
        $privs = [];
        try {
            $st = $pdo->query(
                "SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES "
                . "WHERE GRANTEE = CONCAT(\"'\", SUBSTRING_INDEX(CURRENT_USER(),'@',1), \"'@'\", "
                . "SUBSTRING_INDEX(CURRENT_USER(),'@',-1), \"'\")"
            );
            $privs = array_map('strtoupper', $st->fetchAll(PDO::FETCH_COLUMN));
        } catch (Throwable $e2) {
            $privs = [];
        }
        if (in_array('SYSTEM_USER', $privs, true) || in_array('SUPER', $privs, true)) {
            return true;
        }

        $err = '视图定义者与当前账号不一致：' . implode('、', $foreign)
            . '；当前账号为 ' . $me
            . '，且不具备 SYSTEM_USER/SUPER 权限，无法 DROP 他人定义的视图。'
            . '请先以原定义者（或 root）重建这些视图，使其定义者为应用账号，再执行恢复。';
        return false;
    } catch (Throwable $e) {
        $err = $e->getMessage();
        return false;
    }
}

/**
 * 逐语句执行一个 .sql 备份文件。
 * MySQL 的 DDL 会隐式提交，因此不使用事务；返回已执行语句数，
 * 失败时通过 $err 带出「第几条语句 + 错误原因 + 语句片段」并立即中止。
 */
function adminExecuteSqlFile(PDO $pdo, string $filepath, ?string &$err): int {
    $err = null;
    $sql = @file_get_contents($filepath);
    if ($sql === false || trim($sql) === '') {
        $err = '备份文件读取失败或为空：' . basename($filepath);
        return 0;
    }

    set_time_limit(0);
    $executed = 0;
    $idx = 0;
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (adminSplitSql($sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '' || strpos($statement, '--') === 0) {
            continue;
        }
        $idx++;
        try {
            $pdo->exec($statement);
            $executed++;
        } catch (Throwable $e) {
            $err = '第 ' . $idx . ' 条语句执行失败：' . $e->getMessage()
                 . ' ｜ 片段：' . mb_substr(preg_replace('/\s+/', ' ', $statement), 0, 120);
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
            return $executed;
        }
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    return $executed;
}

// ===========================================================
// 系统初始化
// ===========================================================
function adminInit(): void {
    $user = requireSystemAdmin();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
    }

    $input = getInput();
    $mode = isset($input['mode']) ? trim((string) $input['mode']) : 'reset';
    $password = isset($input['password']) ? (string) $input['password'] : '';
    $confirm = isset($input['confirm']) ? trim((string) $input['confirm']) : '';

    if (!in_array($mode, ['reset', 'demo'], true)) {
        jsonResponse(['success' => false, 'message' => '未知的初始化模式'], 400);
    }
    if (!verifyCurrentAdminPassword($user, $password)) {
        auditLog('denied', 'admin', 'init', 0, $mode, null, null, '系统初始化：密码校验失败');
        jsonResponse(['success' => false, 'message' => '登录密码校验失败，无法执行初始化'], 403);
    }
    if ($confirm !== '初始化系统') {
        jsonResponse(['success' => false, 'message' => '确认短语不正确，请输入「初始化系统」'], 400);
    }

    // 铁律：初始化前必须先落地备份，备份失败即中止
    $backupFile = adminCreateBackupSilently();
    if (!$backupFile) {
        jsonResponse(['success' => false, 'message' => '初始化前的自动备份失败，已中止（数据未改动）'], 500);
    }

    try {
        $pdo = getDB();
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

        $cleared = [];
        foreach (adminResetTables() as $t) {
            try {
                $pdo->exec('TRUNCATE TABLE `' . $t . '`');
                $cleared[] = $t;
            } catch (PDOException $e) {
                // 视图/表不存在时跳过，不阻断整体初始化
                error_log('admin/init skip table ' . $t . ': ' . $e->getMessage());
            }
        }

        $seeded = 0;
        $parentsFixed = 0;
        if ($mode === 'demo') {
            $seedFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'sql' . DIRECTORY_SEPARATOR . 'init_demo_minimal.sql';
            if (is_file($seedFile)) {
                foreach (adminSplitSql((string) file_get_contents($seedFile)) as $statement) {
                    $statement = trim($statement);
                    if ($statement === '' || strpos($statement, '--') === 0) {
                        continue;
                    }
                    $pdo->exec($statement);
                    $seeded++;
                }
            }
            // parents.password_hash 为 NOT NULL 且无默认值，而 SQL 无法计算 bcrypt，
            // 种子里先写入 '__PENDING__' 占位；这里按系统既有规则
            // （与 parents.php 一致：手机号后 6 位）补齐真实口令摘要，
            // 保证 demo 初始化出来的家长账号可以正常登录。
            $parentsFixed = adminFinalizeDemoParents($pdo);
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        auditLog('init', 'admin', 'database', 0, $mode,
            ['backup' => $backupFile, 'cleared_tables' => count($cleared)],
            ['seeded_statements' => $seeded],
            '系统初始化（mode=' . $mode . '），清空表 ' . count($cleared) . ' 个，初始化前备份：' . $backupFile);

        jsonResponse([
            'success' => true,
            'data'    => [
                'mode'          => $mode,
                'backup'        => $backupFile,
                'cleared'       => count($cleared),
                'seeded'        => $seeded,
                'parents_fixed' => $parentsFixed,
            ],
            'message' => '初始化完成：清空 ' . count($cleared) . ' 张业务表' .
                         ($mode === 'demo'
                             ? ('，并写入最小演示数据（' . $parentsFixed . ' 位家长口令已按手机号后 6 位初始化）')
                             : '（保留账号/权限/字典）'),
        ]);
    } catch (Throwable $e) {
        error_log('admin/init error: ' . $e->getMessage());

        // 原子性（0920 回测 P1-1）：清空或写种子中途失败会留下「表已清空、数据只写了一半」
        // 的半初始化状态。这里用初始化前刚落地的备份自动还原一次，保证要么完整成功、
        // 要么回到原点，绝不留下脏数据。
        $rollbackErr = null;
        $rolledBack = false;
        try {
            $pdo2 = getDB();
            adminExecuteSqlFile($pdo2, ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $backupFile, $rollbackErr);
            $rolledBack = ($rollbackErr === null);
        } catch (Throwable $e2) {
            $rollbackErr = $e2->getMessage();
        }
        if (!$rolledBack) {
            error_log('admin/init rollback failed: ' . (string) $rollbackErr);
        }

        auditLog('init_failed', 'admin', 'database', 0, $mode,
            ['backup' => $backupFile, 'error' => $e->getMessage(), 'auto_rollback' => $rolledBack],
            null, '系统初始化失败（mode=' . $mode . '）');

        jsonResponse([
            'success' => false,
            'data'    => [
                'backup'        => $backupFile,
                'auto_rollback' => $rolledBack,
                'error'         => $e->getMessage(),
            ],
            'message' => $rolledBack
                ? ('初始化失败，已自动从 ' . $backupFile . ' 还原。原因：' . $e->getMessage())
                : ('初始化失败且自动还原未成功，请手动从 ' . $backupFile . ' 恢复。原因：' . $e->getMessage()),
        ], 500);
    }
}

// ===========================================================
// 工具函数
// ===========================================================

/** 备份文件名白名单 + 目录穿越防护 */
/**
 * 仅校验「文件名是否合法 + 是否试图路径穿越」。
 * 不要求文件存在——存在性应单独判定，以便对不存在的文件返回语义正确的 404
 * （0920 回测 P2-3：原先存在性被混进本函数，导致 404 场景误报 400「文件名非法」）。
 */
function adminIsSafeBackupName(string $file): bool {
    if ($file === '' || !preg_match('/^[A-Za-z0-9._-]+\.sql$/', $file)) {
        return false;
    }
    return strpos($file, '..') === false;
}

/** 校验文件名合法且该文件确实位于备份目录内（要求已存在） */
function adminIsSafeBackupFile(string $file): bool {
    if (!adminIsSafeBackupName($file)) {
        return false;
    }
    $real = realpath(ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $file);
    $dir = realpath(ADMIN_BACKUP_DIR);
    return $real !== false && $dir !== false && strpos($real, $dir) === 0;
}

/** 备份文件清单（按时间倒序） */
function adminListBackupFiles(): array {
    if (!is_dir(ADMIN_BACKUP_DIR)) {
        return [];
    }
    $files = [];
    foreach (scandir(ADMIN_BACKUP_DIR) as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        if (!preg_match('/^iep_backup_[0-9]{8}_[0-9]{6}\.sql$/', $f)) {
            continue;
        }
        $p = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $f;
        $files[] = [
            'file'       => $f,
            'size_mb'    => round(filesize($p) / 1024 / 1024, 2),
            'created_at' => date('Y-m-d H:i:s', filemtime($p)),
        ];
    }
    usort($files, function ($a, $b) {
        return strcmp($b['file'], $a['file']);
    });
    return $files;
}

/** 静默创建备份（供初始化/恢复前调用），返回文件名或 false */
function adminCreateBackupSilently() {
    try {
        if (!is_dir(ADMIN_BACKUP_DIR)) {
            @mkdir(ADMIN_BACKUP_DIR, 0750, true);
        }
        $pdo = getDB();
        $filename = 'iep_backup_' . date('Ymd_His') . '.sql';
        $filepath = ADMIN_BACKUP_DIR . DIRECTORY_SEPARATOR . $filename;

        [$tables, $views] = adminListTablesAndViews($pdo);
        $fh = fopen($filepath, 'w');
        if (!$fh) {
            return false;
        }
        fwrite($fh, "-- IEP System Auto Backup (pre-destructive operation)\n");
        fwrite($fh, '-- Generated: ' . date('Y-m-d H:i:s') . "\n");
        fwrite($fh, 'SET NAMES utf8mb4;' . "\n" . 'SET FOREIGN_KEY_CHECKS = 0;' . "\n");

        foreach ($tables as $t) {
            adminDumpTable($pdo, $fh, $t, 'BASE TABLE');
        }
        foreach ($views as $v) {
            adminDumpTable($pdo, $fh, $v, 'VIEW');
        }
        fwrite($fh, "SET FOREIGN_KEY_CHECKS = 1;\n");
        fclose($fh);
        return $filename;
    } catch (Throwable $e) {
        error_log('adminCreateBackupSilently error: ' . $e->getMessage());
        return false;
    }
}

/**
 * 列出基表与视图（分开返回，保证恢复时先建表后建视图）。
 *
 * @return array{0: string[], 1: string[]} [基表, 视图]
 */
function adminListTablesAndViews(PDO $pdo): array {
    $tables = [];
    $views = [];
    foreach ($pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM) as $r) {
        if (isset($r[1]) && strtoupper((string) $r[1]) === 'VIEW') {
            $views[] = $r[0];
        } else {
            $tables[] = $r[0];
        }
    }
    return [$tables, $views];
}

/**
 * 导出单个表/视图到备份文件句柄。
 *
 * 修复说明（2026-09-20 回测发现）：
 *   1) 生成列（如 iep_objective_records.achievement_pct 为 STORED GENERATED）
 *      不允许出现在 INSERT 的列清单中，MySQL 会报 error 3105，导致整份备份
 *      无法恢复。现按 information_schema 排除 GENERATED 列，值由库自动计算；
 *   2) 视图（v_iep_objective_progress / v_iep_goal_rollup）此前完全未导出，
 *      恢复后视图丢失会让短期目标进度等查询直接报错。现一并导出 CREATE VIEW。
 *
 * @return int 导出的行数（视图恒为 0）
 */
/**
 * 规范化视图 DDL，使备份可被任意具备库权限的账号恢复。
 *
 * 背景（0920 回测 P0-1）：SHOW CREATE VIEW 会原样带出 DEFINER=`root`@`localhost`。
 * MySQL 8 要求 DROP/CREATE 此类视图的连接具备 SYSTEM_USER（或为定义者本人），
 * 而生产部署通常使用专用的 iep_app 账号，于是恢复必然在第 N 条 DROP VIEW 处
 * 报 1227 Access denied —— 更糟的是自动回退用的是同一套逻辑，必然连带失败，
 * 最终库被 DROP+CREATE 清空却没恢复任何数据。
 *
 * 处置：
 *   1) 剥离 DEFINER=`u`@`h` 子句（缺省即以执行者 CURRENT_USER 为定义者）；
 *   2) SQL SECURITY 由 DEFINER 降级为 INVOKER，视图以调用者权限执行，
 *      既消除越权面，也让恢复连接天然拥有操作自己创建的视图的权限。
 */
function adminNormalizeViewDdl(string $ddl): string {
    $ddl = preg_replace(
        '/\s*DEFINER\s*=\s*(?:`[^`]*`|[^\s@]+)\s*@\s*(?:`[^`]*`|[^\s]+)/i',
        '',
        $ddl
    );
    $ddl = preg_replace('/\bSQL\s+SECURITY\s+DEFINER\b/i', 'SQL SECURITY INVOKER', $ddl);
    return $ddl;
}

function adminDumpTable(PDO $pdo, $fh, string $table, string $type): int {
    $isView = strtoupper($type) === 'VIEW';

    $create = $pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM);
    if (!$create) {
        return 0;
    }

    fwrite($fh, "\n-- -----------------------------\n");
    fwrite($fh, "-- " . ($isView ? 'View' : 'Table') . " structure for `{$table}`\n");
    fwrite($fh, "-- -----------------------------\n");
    fwrite($fh, ($isView ? "DROP VIEW IF EXISTS `{$table}`;\n" : "DROP TABLE IF EXISTS `{$table}`;\n"));
    fwrite($fh, ($isView ? adminNormalizeViewDdl($create[1]) : $create[1]) . ";\n");

    if ($isView) {
        return 0;
    }

    // 生成列不写入 INSERT
    $genStmt = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND (EXTRA LIKE '%GENERATED%' AND EXTRA NOT LIKE '%DEFAULT_GENERATED%')"
    );
    $genStmt->execute([$table]);
    $generated = array_flip($genStmt->fetchAll(PDO::FETCH_COLUMN));

    $total = intval($pdo->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn());
    if ($total === 0) {
        return 0;
    }
    fwrite($fh, "\n-- Records of `{$table}` ({$total} rows)\n");

    $dumped = 0;
    $offset = 0;
    $batch = 200;
    while ($offset < $total) {
        $rows = $pdo->query('SELECT * FROM `' . $table . '` LIMIT ' . $offset . ', ' . $batch)->fetchAll(PDO::FETCH_ASSOC);
        if (empty($rows)) {
            break;
        }
        $cols = array_values(array_filter(array_keys($rows[0]), function ($c) use ($generated) {
            return !isset($generated[$c]);
        }));
        if (empty($cols)) {
            break;
        }
        $colSql = '`' . implode('`, `', $cols) . '`';
        $values = [];
        foreach ($rows as $row) {
            $vals = [];
            foreach ($cols as $c) {
                $v = $row[$c] ?? null;
                if ($v === null) {
                    $vals[] = 'NULL';
                } elseif (is_numeric($v)) {
                    $vals[] = $v;
                } else {
                    $vals[] = $pdo->quote((string) $v);
                }
            }
            $values[] = '(' . implode(', ', $vals) . ')';
        }
        fwrite($fh, "INSERT INTO `{$table}` ({$colSql}) VALUES\n" . implode(",\n", $values) . ";\n");
        $offset += $batch;
        $dumped += count($rows);
    }
    return $dumped;
}

/** 判断表是否存在某列 */
function adminTableHasColumn(PDO $pdo, string $table, string $column): bool {
    try {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $stmt->execute([$table, $column]);
        return intval($stmt->fetchColumn()) > 0;
    } catch (PDOException $e) {
        return false;
    }
}

/** 将 SQL 文本按分号切分为语句（忽略字符串/注释内的分号） */
function adminSplitSql(string $sql): array {
    $statements = [];
    $buf = '';
    $inString = false;
    $stringChar = '';
    $len = strlen($sql);

    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $next = ($i + 1 < $len) ? $sql[$i + 1] : '';

        // 行注释
        if (!$inString && $ch === '-' && $next === '-') {
            while ($i < $len && $sql[$i] !== "\n") {
                $i++;
            }
            $buf .= "\n";
            continue;
        }
        // 块注释
        if (!$inString && $ch === '/' && $next === '*') {
            $i += 2;
            while ($i < $len && !($sql[$i] === '*' && ($i + 1 < $len) && $sql[$i + 1] === '/')) {
                $i++;
            }
            $i++;
            continue;
        }
        if ($inString) {
            $buf .= $ch;
            if ($ch === '\\') {
                $i++;
                if ($i < $len) {
                    $buf .= $sql[$i];
                }
                continue;
            }
            if ($ch === $stringChar) {
                $inString = false;
            }
            continue;
        }
        if ($ch === "'" || $ch === '"' || $ch === '`') {
            $inString = true;
            $stringChar = $ch;
            $buf .= $ch;
            continue;
        }
        if ($ch === ';') {
            $statements[] = $buf;
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    if (trim($buf) !== '') {
        $statements[] = $buf;
    }
    return $statements;
}
