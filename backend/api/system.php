<?php
/**
 * System Module - Users, Roles, Permissions, Audit Logs, Reports, Registry
 * 
 * Endpoints:
 *   GET  /api/system/users                - User list
 *   GET  /api/system/users/get            - Get user detail
 *   POST /api/system/users/create         - Create user
 *   POST /api/system/users/update         - Update user
 *   POST /api/system/users/delete         - Delete user
 *   POST /api/system/users/reset_password - Reset password
 *   GET  /api/system/roles                - Role list
 *   GET  /api/system/roles/get            - Get role detail
 *   POST /api/system/roles/create         - Create role
 *   POST /api/system/roles/update         - Update role
 *   POST /api/system/roles/delete         - Delete role
 *   GET  /api/system/permissions          - Permission tree
 *   POST /api/system/roles/permissions    - Update role permissions
 *   GET  /api/system/audit-logs           - Audit log list
 *   GET  /api/system/settings             - System settings
 *   POST /api/system/settings             - Update settings
 *   GET  /api/reports/dashboard           - Dashboard data
 *   GET  /api/reports/students            - Student statistics
 *   GET  /api/reports/assessments         - Assessment statistics
 *   GET  /api/reports/iep                 - IEP statistics
 *   GET  /api/reports/teaching            - Teaching statistics
 *   GET  /api/registry/menu               - Menu configuration
 *   GET  /api/registry/modules_list       - Module list
 *   POST /api/registry/modules_toggle     - Toggle module
 *   GET  /api/registry/charts             - Chart configuration
 */

require_once __DIR__ . '/config.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$module = isset($parts[0]) ? $parts[0] : '';
$action = isset($parts[1]) ? $parts[1] : '';
$subAction = isset($parts[2]) ? $parts[2] : '';

// Handle module-specific routing
switch ($module) {
    case 'system':
        handleSystemAction($action, $subAction);
        break;
    case 'permissions':
        handlePermissionsAction($action);
        break;
    case 'reports':
        handleReportsAction($action);
        break;
    case 'registry':
        handleRegistryAction($action);
        break;
    default:
        jsonResponse(['success' => false, 'message' => '未知的系统模块: ' . $module]);
}

// ============================================================
// System Actions: users, roles, permissions, audit-logs, settings
// ============================================================
function handleSystemAction(string $action, string $subAction): void {
    switch ($action) {
        // --------------------------------------------------------
        // Users Management
        // --------------------------------------------------------
        case 'users':
            handleUsersAction($subAction);
            break;

        // --------------------------------------------------------
        // Roles Management
        // --------------------------------------------------------
        case 'roles':
            handleRolesAction($subAction);
            break;

        // --------------------------------------------------------
        // Permissions
        // --------------------------------------------------------
        case 'permissions':
            handleSystemPermissions();
            break;

        // --------------------------------------------------------
        // Audit Logs
        // --------------------------------------------------------
        case 'audit-logs':
            handleAuditLogs();
            break;

        // --------------------------------------------------------
        // Settings
        // --------------------------------------------------------
        case 'settings':
            handleSettings();
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的系统操作: ' . $action]);
    }
}

// ============================================================
// Users Management
// ============================================================
function handleUsersAction(string $action): void {
    switch ($action) {
        // GET /api/system/users - User list
        case '':
        case 'list':
            requireAuth();
            requirePermission('user_manage');

            [$page, $pageSize, $offset] = getPagination();
            $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
            $roleId = isset($_GET['role_id']) ? intval($_GET['role_id']) : 0;

            try {
                $pdo = getDB();
                $where = ['u.is_active = 1'];
                $params = [];

                if (!empty($keyword)) {
                    $where[] = '(u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ?)';
                    $like = '%' . $keyword . '%';
                    $params[] = $like;
                    $params[] = $like;
                    $params[] = $like;
                }
                if ($roleId > 0) {
                    $where[] = 'u.role_id = ?';
                    $params[] = $roleId;
                }

                $whereStr = implode(' AND ', $where);

                $countStmt = $pdo->prepare(
                    'SELECT COUNT(*) FROM users u WHERE ' . $whereStr
                );
                $countStmt->execute($params);
                $total = intval($countStmt->fetchColumn());

                $sql = 'SELECT u.id, u.username, u.real_name, u.phone, u.email, u.avatar, 
                               u.role_id, r.name AS role_name, r.code AS role_code,
                               u.department, u.last_login_at, u.is_active, u.created_at
                        FROM users u
                        LEFT JOIN roles r ON u.role_id = r.id
                        WHERE ' . $whereStr . ' ORDER BY u.created_at DESC LIMIT ' . $offset . ', ' . $pageSize;

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $list = $stmt->fetchAll();

                jsonResponse([
                    'success' => true,
                    'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
                    'message' => '查询成功'
                ]);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '查询失败']);
            }
            break;

        // GET /api/system/users/get - Get user detail
        case 'get':
            requireAuth();

            $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'SELECT u.id, u.username, u.real_name, u.phone, u.email, u.avatar, 
                            u.role_id, r.name AS role_name, u.department, u.last_login_at, 
                            u.login_ip, u.is_active, u.created_at
                     FROM users u
                     LEFT JOIN roles r ON u.role_id = r.id
                     WHERE u.id = ? LIMIT 1'
                );
                $stmt->execute([$id]);
                $user = $stmt->fetch();

                if (!$user) {
                    jsonResponse(['success' => false, 'message' => '用户不存在']);
                }

                jsonResponse(['success' => true, 'data' => $user, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // POST /api/system/users/create - Create user
        case 'create':
            requireAuth();
            requirePermission('user_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $username = isset($input['username']) ? trim($input['username']) : '';
            $password = isset($input['password']) ? $input['password'] : '';
            $realName = isset($input['real_name']) ? trim($input['real_name']) : '';

            if (empty($username) || empty($password)) {
                jsonResponse(['success' => false, 'message' => '用户名和密码不能为空']);
            }

            $phone = isset($input['phone']) ? trim($input['phone']) : '';
            $email = isset($input['email']) ? trim($input['email']) : '';
            $roleId = isset($input['role_id']) ? intval($input['role_id']) : 4;
            $department = isset($input['department']) ? trim($input['department']) : '';

            $passwordHash = password_hash($password, PASSWORD_BCRYPT);

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'INSERT INTO users (username, password_hash, real_name, phone, email, role_id, department, is_active, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())'
                );
                $stmt->execute([$username, $passwordHash, $realName, $phone, $email, $roleId, $department]);

                $userId = $pdo->lastInsertId();
                auditLog('create', 'system', 'user', intval($userId), $username, null, null, '创建用户');

                jsonResponse(['success' => true, 'data' => ['id' => $userId], 'message' => '创建成功']);
            } catch (PDOException $e) {
                if ($e->getCode() == 23000) {
                    jsonResponse(['success' => false, 'message' => '用户名已存在']);
                }
                jsonResponse(['success' => false, 'message' => '创建失败']);
            }
            break;

        // POST /api/system/users/update - Update user
        case 'update':
            requireAuth();
            requirePermission('user_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            $updatableFields = ['username', 'real_name', 'phone', 'email', 'role_id', 'department', 'is_active'];
            $updates = [];
            $values = [];

            foreach ($updatableFields as $field) {
                if (isset($input[$field])) {
                    $updates[] = $field . ' = ?';
                    $val = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
                    $values[] = ($val === '' || $val === null) ? null : $val;
                }
            }

            if (empty($updates)) {
                jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
            }

            $values[] = $id;

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ?');
                $stmt->execute($values);

                auditLog('update', 'system', 'user', $id, '', null, null, '更新用户');

                jsonResponse(['success' => true, 'message' => '更新成功']);
            } catch (PDOException $e) {
                if ($e->getCode() == 23000) {
                    jsonResponse(['success' => false, 'message' => '用户名已存在']);
                }
                jsonResponse(['success' => false, 'message' => '更新失败']);
            }
            break;

        // POST /api/system/users/delete - Delete user
        case 'delete':
            requireAuth();
            requirePermission('user_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            // Cannot delete self
            $user = getCurrentUser();
            if ($user && intval($user['sub']) === $id) {
                jsonResponse(['success' => false, 'message' => '不能删除当前登录账号']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?');
                $stmt->execute([$id]);

                auditLog('delete', 'system', 'user', $id, '', null, null, '删除用户');

                jsonResponse(['success' => true, 'message' => '删除成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '删除失败']);
            }
            break;

        // POST /api/system/users/reset_password - Reset password
        case 'reset_password':
            requireAuth();
            requirePermission('user_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            $newPassword = isset($input['new_password']) ? $input['new_password'] : '';

            if ($id <= 0 || empty($newPassword)) {
                jsonResponse(['success' => false, 'message' => '用户ID和新密码不能为空']);
            }

            try {
                $pdo = getDB();
                $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?');
                $stmt->execute([$passwordHash, $id]);

                jsonResponse(['success' => true, 'message' => '密码重置成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '密码重置失败']);
            }
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的用户操作: ' . $action]);
    }
}

// ============================================================
// Roles Management
// ============================================================
function handleRolesAction(string $action): void {
    switch ($action) {
        // GET /api/system/roles - Role list
        case '':
        case 'list':
            requireAuth();
            requirePermission('role_manage');

            try {
                $pdo = getDB();
                $stmt = $pdo->query(
                    'SELECT id, name, code, description, is_system, is_active, created_at FROM roles ORDER BY id'
                );
                $roles = $stmt->fetchAll();

                // Get permissions for each role
                foreach ($roles as &$role) {
                    $permStmt = $pdo->prepare(
                        'SELECT permission_id FROM role_permissions WHERE role_id = ?'
                    );
                    $permStmt->execute([$role['id']]);
                    $role['permission_ids'] = $permStmt->fetchAll(PDO::FETCH_COLUMN);
                }

                jsonResponse(['success' => true, 'data' => $roles, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // GET /api/system/roles/get - Get role detail
        case 'get':
            requireAuth();

            $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'SELECT id, name, code, description, is_system, is_active, created_at FROM roles WHERE id = ? LIMIT 1'
                );
                $stmt->execute([$id]);
                $role = $stmt->fetch();

                if (!$role) {
                    jsonResponse(['success' => false, 'message' => '角色不存在']);
                }

                $permStmt = $pdo->prepare(
                    'SELECT permission_id FROM role_permissions WHERE role_id = ?'
                );
                $permStmt->execute([$id]);
                $role['permission_ids'] = $permStmt->fetchAll(PDO::FETCH_COLUMN);

                jsonResponse(['success' => true, 'data' => $role, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // POST /api/system/roles/create - Create role
        case 'create':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $name = isset($input['name']) ? trim($input['name']) : '';
            $code = isset($input['code']) ? trim($input['code']) : '';

            if (empty($name) || empty($code)) {
                jsonResponse(['success' => false, 'message' => '角色名称和编码不能为空']);
            }

            $description = isset($input['description']) ? trim($input['description']) : '';

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'INSERT INTO roles (name, code, description, is_system, is_active, created_at) 
                     VALUES (?, ?, ?, 0, 1, NOW())'
                );
                $stmt->execute([$name, $code, $description]);
                $roleId = $pdo->lastInsertId();

                auditLog('create', 'system', 'role', intval($roleId), $name, null, null, '创建角色');

                jsonResponse(['success' => true, 'data' => ['id' => $roleId], 'message' => '创建成功']);
            } catch (PDOException $e) {
                if ($e->getCode() == 23000) {
                    jsonResponse(['success' => false, 'message' => '角色编码已存在']);
                }
                jsonResponse(['success' => false, 'message' => '创建失败']);
            }
            break;

        // POST /api/system/roles/update - Update role
        case 'update':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $pdo->beginTransaction();

                // Update role basic info
                $updates = [];
                $values = [];

                if (isset($input['name'])) {
                    $updates[] = 'name = ?';
                    $values[] = trim($input['name']);
                }
                if (isset($input['description'])) {
                    $updates[] = 'description = ?';
                    $values[] = trim($input['description']);
                }
                if (isset($input['is_active'])) {
                    $updates[] = 'is_active = ?';
                    $values[] = intval($input['is_active']);
                }

                if (!empty($updates)) {
                    $values[] = $id;
                    $stmt = $pdo->prepare('UPDATE roles SET ' . implode(', ', $updates) . ' WHERE id = ?');
                    $stmt->execute($values);
                }

                // Update role permissions
                if (isset($input['permissions'])) {
                    $permissions = is_string($input['permissions']) ? json_decode($input['permissions'], true) : $input['permissions'];
                    if (is_array($permissions)) {
                        // Delete old permissions
                        $delStmt = $pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?');
                        $delStmt->execute([$id]);

                        // Insert new permissions
                        if (count($permissions) > 0) {
                            $insertStmt = $pdo->prepare(
                                'INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, NOW())'
                            );
                            foreach ($permissions as $permId) {
                                $insertStmt->execute([$id, intval($permId)]);
                            }
                        }
                    }
                }

                $pdo->commit();
                auditLog('update', 'system', 'role', $id, '', null, null, '更新角色');

                jsonResponse(['success' => true, 'message' => '更新成功']);
            } catch (PDOException $e) {
                $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => '更新失败']);
            }
            break;

        // POST /api/system/roles/delete - Delete role
        case 'delete':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();

                // Check if system role
                $checkStmt = $pdo->prepare('SELECT is_system FROM roles WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $role = $checkStmt->fetch();

                if (!$role) {
                    jsonResponse(['success' => false, 'message' => '角色不存在']);
                }
                if ($role['is_system']) {
                    jsonResponse(['success' => false, 'message' => '系统内置角色不可删除']);
                }

                // Check if role has users
                $userStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE role_id = ?');
                $userStmt->execute([$id]);
                if (intval($userStmt->fetchColumn()) > 0) {
                    jsonResponse(['success' => false, 'message' => '该角色下还有用户，请先移除用户']);
                }

                $stmt = $pdo->prepare('DELETE FROM roles WHERE id = ?');
                $stmt->execute([$id]);

                auditLog('delete', 'system', 'role', $id, '', null, null, '删除角色');

                jsonResponse(['success' => true, 'message' => '删除成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '删除失败']);
            }
            break;

        // POST /api/system/roles/permissions - Update role permissions
        case 'permissions':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $roleId = isset($input['role_id']) ? intval($input['role_id']) : 0;
            $permissionIdsJson = isset($input['permission_ids']) ? $input['permission_ids'] : '[]';

            if ($roleId <= 0) {
                jsonResponse(['success' => false, 'message' => '角色ID不能为空']);
            }

            $permissionIds = is_string($permissionIdsJson) ? json_decode($permissionIdsJson, true) : $permissionIdsJson;
            if (!is_array($permissionIds)) {
                jsonResponse(['success' => false, 'message' => '权限ID格式错误']);
            }

            try {
                $pdo = getDB();
                $pdo->beginTransaction();

                // Delete old permissions
                $delStmt = $pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?');
                $delStmt->execute([$roleId]);

                // Insert new permissions
                if (count($permissionIds) > 0) {
                    $insertStmt = $pdo->prepare(
                        'INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, NOW())'
                    );
                    foreach ($permissionIds as $permId) {
                        $insertStmt->execute([$roleId, intval($permId)]);
                    }
                }

                $pdo->commit();
                auditLog('update_permissions', 'system', 'role', $roleId, '', null, null, '更新角色权限');

                jsonResponse(['success' => true, 'message' => '权限设置成功']);
            } catch (PDOException $e) {
                $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => '设置失败']);
            }
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的角色操作: ' . $action]);
    }
}

// ============================================================
// System Permissions Tree
// ============================================================
function handleSystemPermissions(): void {
    requireAuth();

    try {
        $pdo = getDB();
        $stmt = $pdo->query(
            'SELECT id, name, code, module, description FROM permissions WHERE is_active = 1 ORDER BY module, id'
        );
        $permissions = $stmt->fetchAll();

        // Group by module
        $tree = [];
        foreach ($permissions as $perm) {
            $mod = $perm['module'] ? $perm['module'] : '其他';
            if (!isset($tree[$mod])) {
                $tree[$mod] = ['module' => $mod, 'permissions' => []];
            }
            $tree[$mod]['permissions'][] = $perm;
        }

        jsonResponse(['success' => true, 'data' => array_values($tree), 'message' => '获取成功']);
    } catch (PDOException $e) {
        jsonResponse(['success' => false, 'message' => '获取失败']);
    }
}

// ============================================================
// Audit Logs
// ============================================================
function handleAuditLogs(): void {
    requireAuth();
    requirePermission('audit_log');

    [$page, $pageSize, $offset] = getPagination();
    $module = isset($_GET['module']) ? trim($_GET['module']) : '';
    $action = isset($_GET['action']) ? trim($_GET['action']) : '';
    $startDate = isset($_GET['start_date']) ? trim($_GET['start_date']) : '';
    $endDate = isset($_GET['end_date']) ? trim($_GET['end_date']) : '';
    $alertLevel = isset($_GET['alert_level']) ? trim($_GET['alert_level']) : '';

    try {
        $pdo = getDB();
        $where = ['1=1'];
        $params = [];

        if (!empty($module)) {
            $where[] = 'module = ?';
            $params[] = $module;
        }
        if (!empty($action)) {
            $where[] = 'action = ?';
            $params[] = $action;
        }
        if (!empty($startDate)) {
            $where[] = 'DATE(created_at) >= ?';
            $params[] = $startDate;
        }
        if (!empty($endDate)) {
            $where[] = 'DATE(created_at) <= ?';
            $params[] = $endDate;
        }
        if (!empty($alertLevel)) {
            $where[] = 'alert_level = ?';
            $params[] = $alertLevel;
        }

        $whereStr = implode(' AND ', $where);

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM audit_logs WHERE ' . $whereStr);
        $countStmt->execute($params);
        $total = intval($countStmt->fetchColumn());

        $stmt = $pdo->prepare(
            'SELECT id, user_id, username, user_type, action, module, target_type, target_id, 
                    target_name, change_summary, ip, request_method, request_path, alert_level, created_at
             FROM audit_logs
             WHERE ' . $whereStr . ' ORDER BY created_at DESC LIMIT ' . $offset . ', ' . $pageSize
        );
        $stmt->execute($params);
        $list = $stmt->fetchAll();

        jsonResponse([
            'success' => true,
            'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
            'message' => '查询成功'
        ]);
    } catch (PDOException $e) {
        jsonResponse(['success' => false, 'message' => '查询失败']);
    }
}

// ============================================================
// Settings
// ============================================================
function handleSettings(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // GET /api/system/settings - Get settings
        requireAuth();

        try {
            $pdo = getDB();
            $settings = [];

            // Get settings from dict_common
            $stmt = $pdo->query('SELECT category, code, name, value FROM dict_common WHERE category = "system_setting"');
            $rows = $stmt->fetchAll();
            foreach ($rows as $row) {
                $settings[$row['code']] = $row['value'];
            }

            // Default settings if none found
            if (empty($settings)) {
                $settings = [
                    'school_name' => 'XX培智学校',
                    'school_address' => '',
                    'school_phone' => '',
                    'academic_year' => date('Y') . '-' . (date('Y') + 1),
                    'semester' => date('n') >= 9 || date('n') <= 2 ? '上学期' : '下学期'
                ];
            }

            jsonResponse(['success' => true, 'data' => $settings, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // POST /api/system/settings - Update settings
        requireAuth();
        requirePermission('system_settings');

        $input = getInput();

        try {
            $pdo = getDB();

            foreach ($input as $key => $value) {
                if ($key === 'path') continue;

                $stmt = $pdo->prepare(
                    'INSERT INTO dict_common (category, code, name, value, created_at) 
                     VALUES ("system_setting", ?, ?, ?, NOW()) 
                     ON DUPLICATE KEY UPDATE value = VALUES(value)'
                );
                $stmt->execute([$key, $key, $value]);
            }

            auditLog('update', 'system', 'settings', 0, '', null, null, '更新系统设置');

            jsonResponse(['success' => true, 'message' => '设置更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '设置更新失败']);
        }
    }
}

// ============================================================
// Permissions Module (aliased to system.php)
// ============================================================
function handlePermissionsAction(string $action): void {
    switch ($action) {
        // GET /api/permissions/roles_list - Role list
        case 'roles_list':
            requireAuth();

            try {
                $pdo = getDB();
                $stmt = $pdo->query(
                    'SELECT id, name, code, description, is_system, is_active, created_at FROM roles ORDER BY id'
                );
                $roles = $stmt->fetchAll();
                jsonResponse(['success' => true, 'data' => $roles, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // GET /api/permissions/roles_get - Get role detail
        case 'roles_get':
            requireAuth();

            $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'SELECT id, name, code, description, is_system, is_active, created_at FROM roles WHERE id = ? LIMIT 1'
                );
                $stmt->execute([$id]);
                $role = $stmt->fetch();

                if (!$role) {
                    jsonResponse(['success' => false, 'message' => '角色不存在']);
                }

                $permStmt = $pdo->prepare('SELECT permission_id FROM role_permissions WHERE role_id = ?');
                $permStmt->execute([$id]);
                $role['permission_ids'] = $permStmt->fetchAll(PDO::FETCH_COLUMN);

                jsonResponse(['success' => true, 'data' => $role, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // POST /api/permissions/roles_create - Create role
        case 'roles_create':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $name = isset($input['name']) ? trim($input['name']) : '';
            $code = isset($input['code']) ? trim($input['code']) : '';

            if (empty($name) || empty($code)) {
                jsonResponse(['success' => false, 'message' => '角色名称和编码不能为空']);
            }

            $description = isset($input['description']) ? trim($input['description']) : '';

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'INSERT INTO roles (name, code, description, is_system, is_active, created_at) 
                     VALUES (?, ?, ?, 0, 1, NOW())'
                );
                $stmt->execute([$name, $code, $description]);
                $roleId = $pdo->lastInsertId();

                auditLog('create', 'permissions', 'role', intval($roleId), $name, null, null, '创建角色');

                jsonResponse(['success' => true, 'data' => ['id' => $roleId], 'message' => '创建成功']);
            } catch (PDOException $e) {
                if ($e->getCode() == 23000) {
                    jsonResponse(['success' => false, 'message' => '角色编码已存在']);
                }
                jsonResponse(['success' => false, 'message' => '创建失败']);
            }
            break;

        // POST /api/permissions/roles_update - Update role
        case 'roles_update':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $pdo->beginTransaction();

                $updates = [];
                $values = [];

                if (isset($input['name'])) {
                    $updates[] = 'name = ?';
                    $values[] = trim($input['name']);
                }
                if (isset($input['description'])) {
                    $updates[] = 'description = ?';
                    $values[] = trim($input['description']);
                }
                if (isset($input['is_active'])) {
                    $updates[] = 'is_active = ?';
                    $values[] = intval($input['is_active']);
                }

                if (!empty($updates)) {
                    $values[] = $id;
                    $stmt = $pdo->prepare('UPDATE roles SET ' . implode(', ', $updates) . ' WHERE id = ?');
                    $stmt->execute($values);
                }

                if (isset($input['permissions'])) {
                    $permissions = is_string($input['permissions']) ? json_decode($input['permissions'], true) : $input['permissions'];
                    if (is_array($permissions)) {
                        $delStmt = $pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?');
                        $delStmt->execute([$id]);

                        if (count($permissions) > 0) {
                            $insertStmt = $pdo->prepare(
                                'INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, NOW())'
                            );
                            foreach ($permissions as $permId) {
                                $insertStmt->execute([$id, intval($permId)]);
                            }
                        }
                    }
                }

                $pdo->commit();
                auditLog('update', 'permissions', 'role', $id, '', null, null, '更新角色');

                jsonResponse(['success' => true, 'message' => '更新成功']);
            } catch (PDOException $e) {
                $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => '更新失败']);
            }
            break;

        // POST /api/permissions/roles_delete - Delete role
        case 'roles_delete':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $id = isset($input['id']) ? intval($input['id']) : 0;
            if ($id <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $checkStmt = $pdo->prepare('SELECT is_system FROM roles WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $role = $checkStmt->fetch();

                if (!$role) {
                    jsonResponse(['success' => false, 'message' => '角色不存在']);
                }
                if ($role['is_system']) {
                    jsonResponse(['success' => false, 'message' => '系统内置角色不可删除']);
                }

                $stmt = $pdo->prepare('DELETE FROM roles WHERE id = ?');
                $stmt->execute([$id]);

                auditLog('delete', 'permissions', 'role', $id, '', null, null, '删除角色');

                jsonResponse(['success' => true, 'message' => '删除成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '删除失败']);
            }
            break;

        // GET /api/permissions/permissions_tree - Permission tree
        case 'permissions_tree':
            requireAuth();

            try {
                $pdo = getDB();
                $stmt = $pdo->query(
                    'SELECT id, name, code, module, description FROM permissions WHERE is_active = 1 ORDER BY module, id'
                );
                $permissions = $stmt->fetchAll();

                $tree = [];
                foreach ($permissions as $perm) {
                    $mod = $perm['module'] ? $perm['module'] : '其他';
                    if (!isset($tree[$mod])) {
                        $tree[$mod] = ['module' => $mod, 'permissions' => []];
                    }
                    $tree[$mod]['permissions'][] = $perm;
                }

                jsonResponse(['success' => true, 'data' => array_values($tree), 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // GET /api/permissions/user_permissions - Get user permissions
        case 'user_permissions':
            requireAuth();

            $roleId = isset($_GET['role_id']) ? intval($_GET['role_id']) : 0;
            if ($roleId <= 0) {
                jsonResponse(['success' => false, 'message' => '参数错误']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare(
                    'SELECT p.id, p.name, p.code, p.module, p.description 
                     FROM permissions p
                     INNER JOIN role_permissions rp ON p.id = rp.permission_id
                     WHERE rp.role_id = ? AND p.is_active = 1'
                );
                $stmt->execute([$roleId]);
                $permissions = $stmt->fetchAll();

                jsonResponse(['success' => true, 'data' => $permissions, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // POST /api/permissions/set_permissions - Set role permissions
        case 'set_permissions':
            requireAuth();
            requirePermission('role_manage');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $roleId = isset($input['role_id']) ? intval($input['role_id']) : 0;
            $permissionIdsJson = isset($input['permission_ids']) ? $input['permission_ids'] : '[]';

            if ($roleId <= 0) {
                jsonResponse(['success' => false, 'message' => '角色ID不能为空']);
            }

            $permissionIds = is_string($permissionIdsJson) ? json_decode($permissionIdsJson, true) : $permissionIdsJson;
            if (!is_array($permissionIds)) {
                jsonResponse(['success' => false, 'message' => '权限ID格式错误']);
            }

            try {
                $pdo = getDB();
                $pdo->beginTransaction();

                $delStmt = $pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?');
                $delStmt->execute([$roleId]);

                if (count($permissionIds) > 0) {
                    $insertStmt = $pdo->prepare(
                        'INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES (?, ?, NOW())'
                    );
                    foreach ($permissionIds as $permId) {
                        $insertStmt->execute([$roleId, intval($permId)]);
                    }
                }

                $pdo->commit();
                auditLog('update', 'permissions', 'role_permissions', $roleId, '', null, null, '设置角色权限');

                jsonResponse(['success' => true, 'message' => '权限设置成功']);
            } catch (PDOException $e) {
                $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => '设置失败']);
            }
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的权限操作: ' . $action]);
    }
}

// ============================================================
// Reports Module
// ============================================================
function handleReportsAction(string $action): void {
    requireAuth();

    try {
        $pdo = getDB();

        switch ($action) {
            // GET /api/reports/dashboard - Dashboard data
            case 'dashboard':
                $stats = [];

                // Student count
                $stmt = $pdo->query('SELECT COUNT(*) FROM students WHERE deleted_at IS NULL AND status = "在读"');
                $stats['student_count'] = intval($stmt->fetchColumn());

                // Class count
                $stmt = $pdo->query('SELECT COUNT(*) FROM student_classes WHERE is_active = 1');
                $stats['class_count'] = intval($stmt->fetchColumn());

                // Active IEP count
                $stmt = $pdo->query('SELECT COUNT(*) FROM iep_plans WHERE deleted_at IS NULL AND status IN ("active", "approved", "signed")');
                $stats['active_iep_count'] = intval($stmt->fetchColumn());

                // Pending review count
                $stmt = $pdo->query('SELECT COUNT(*) FROM iep_plans WHERE deleted_at IS NULL AND status = "reviewing"');
                $stats['pending_review_count'] = intval($stmt->fetchColumn());

                // Today teaching count
                $stmt = $pdo->query('SELECT COUNT(*) FROM teaching_records WHERE deleted_at IS NULL AND record_date = CURDATE()');
                $stats['today_teaching_count'] = intval($stmt->fetchColumn());

                // Month assessment count
                $stmt = $pdo->query('SELECT COUNT(*) FROM assessments WHERE deleted_at IS NULL AND assessment_date >= DATE_FORMAT(CURDATE(), "%Y-%m-01")');
                $stats['month_assessment_count'] = intval($stmt->fetchColumn());

                // Disability distribution
                $stmt = $pdo->query(
                    'SELECT ddt.name AS disability_type, COUNT(*) AS count 
                     FROM students s 
                     LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id 
                     WHERE s.deleted_at IS NULL AND s.status = "在读" 
                     GROUP BY s.disability_type_id ORDER BY count DESC'
                );
                $stats['disability_distribution'] = $stmt->fetchAll();

                // Gender distribution
                $stmt = $pdo->query('SELECT gender, COUNT(*) AS count FROM students WHERE deleted_at IS NULL AND status = "在读" GROUP BY gender');
                $stats['gender_distribution'] = $stmt->fetchAll();

                // Class distribution
                $stmt = $pdo->query(
                    'SELECT sc.name AS class_name, COUNT(s.id) AS count 
                     FROM student_classes sc 
                     LEFT JOIN students s ON sc.id = s.class_id AND s.deleted_at IS NULL AND s.status = "在读" 
                     WHERE sc.is_active = 1 
                     GROUP BY sc.id ORDER BY count DESC'
                );
                $stats['class_distribution'] = $stmt->fetchAll();

                // Monthly trend (teaching records for last 6 months)
                $stmt = $pdo->query(
                    'SELECT DATE_FORMAT(record_date, "%Y-%m") AS month, COUNT(*) AS count 
                     FROM teaching_records 
                     WHERE deleted_at IS NULL AND record_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) 
                     GROUP BY month ORDER BY month'
                );
                $stats['teaching_trend'] = $stmt->fetchAll();

                jsonResponse(['success' => true, 'data' => $stats, 'message' => '获取成功']);
                break;

            // GET /api/reports/students - Student statistics
            case 'students':
                $stats = [];

                // Total by status
                $stmt = $pdo->query('SELECT status, COUNT(*) AS count FROM students WHERE deleted_at IS NULL GROUP BY status');
                $stats['by_status'] = $stmt->fetchAll();

                // Total by disability type
                $stmt = $pdo->query(
                    'SELECT ddt.name AS disability_type, COUNT(*) AS count 
                     FROM students s 
                     LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id 
                     WHERE s.deleted_at IS NULL GROUP BY s.disability_type_id'
                );
                $stats['by_disability'] = $stmt->fetchAll();

                // Enrollment by year
                $stmt = $pdo->query(
                    'SELECT YEAR(enrollment_date) AS year, COUNT(*) AS count 
                     FROM students WHERE deleted_at IS NULL AND enrollment_date IS NOT NULL 
                     GROUP BY YEAR(enrollment_date) ORDER BY year DESC LIMIT 10'
                );
                $stats['enrollment_by_year'] = $stmt->fetchAll();

                // Gender ratio
                $stmt = $pdo->query('SELECT gender, COUNT(*) AS count FROM students WHERE deleted_at IS NULL GROUP BY gender');
                $stats['gender_ratio'] = $stmt->fetchAll();

                jsonResponse(['success' => true, 'data' => $stats, 'message' => '获取成功']);
                break;

            // GET /api/reports/assessments - Assessment statistics
            case 'assessments':
                $stats = [];

                // Total by type
                $stmt = $pdo->query('SELECT assessment_type, COUNT(*) AS count FROM assessments WHERE deleted_at IS NULL GROUP BY assessment_type');
                $stats['by_type'] = $stmt->fetchAll();

                // Monthly count
                $stmt = $pdo->query(
                    'SELECT DATE_FORMAT(assessment_date, "%Y-%m") AS month, COUNT(*) AS count 
                     FROM assessments WHERE deleted_at IS NULL AND assessment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) 
                     GROUP BY month ORDER BY month'
                );
                $stats['monthly'] = $stmt->fetchAll();

                // Average score by type
                $stmt = $pdo->query(
                    'SELECT assessment_type, AVG(score_percentage) AS avg_score 
                     FROM assessments WHERE deleted_at IS NULL AND score_percentage > 0 
                     GROUP BY assessment_type'
                );
                $stats['avg_score'] = $stmt->fetchAll();

                jsonResponse(['success' => true, 'data' => $stats, 'message' => '获取成功']);
                break;

            // GET /api/reports/iep - IEP statistics
            case 'iep':
                $stats = [];

                // Total by status
                $stmt = $pdo->query('SELECT status, COUNT(*) AS count FROM iep_plans WHERE deleted_at IS NULL GROUP BY status');
                $stats['by_status'] = $stmt->fetchAll();

                // Goals by area
                $stmt = $pdo->query(
                    'SELECT area, COUNT(*) AS count FROM iep_goals WHERE deleted_at IS NULL GROUP BY area'
                );
                $stats['goals_by_area'] = $stmt->fetchAll();

                // Goals by status
                $stmt = $pdo->query(
                    'SELECT status, COUNT(*) AS count FROM iep_goals WHERE deleted_at IS NULL GROUP BY status'
                );
                $stats['goals_by_status'] = $stmt->fetchAll();

                // Average progress
                $stmt = $pdo->query(
                    'SELECT AVG(progress_percentage) AS avg_progress FROM iep_goals WHERE deleted_at IS NULL'
                );
                $stats['avg_progress'] = round(floatval($stmt->fetchColumn()), 2);

                jsonResponse(['success' => true, 'data' => $stats, 'message' => '获取成功']);
                break;

            // GET /api/reports/teaching - Teaching statistics
            case 'teaching':
                $stats = [];

                // Total by subject
                $stmt = $pdo->query('SELECT subject, COUNT(*) AS count FROM teaching_records WHERE deleted_at IS NULL GROUP BY subject');
                $stats['by_subject'] = $stmt->fetchAll();

                // By teacher
                $stmt = $pdo->query(
                    'SELECT u.real_name AS teacher_name, COUNT(*) AS count 
                     FROM teaching_records tr 
                     LEFT JOIN users u ON tr.teacher_id = u.id 
                     WHERE tr.deleted_at IS NULL 
                     GROUP BY tr.teacher_id ORDER BY count DESC LIMIT 10'
                );
                $stats['by_teacher'] = $stmt->fetchAll();

                // Monthly trend
                $stmt = $pdo->query(
                    'SELECT DATE_FORMAT(record_date, "%Y-%m") AS month, COUNT(*) AS count 
                     FROM teaching_records WHERE deleted_at IS NULL AND record_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) 
                     GROUP BY month ORDER BY month'
                );
                $stats['monthly'] = $stmt->fetchAll();

                // Average effectiveness
                $stmt = $pdo->query(
                    'SELECT AVG(effectiveness_score) AS avg_effectiveness FROM teaching_records 
                     WHERE deleted_at IS NULL AND effectiveness_score IS NOT NULL'
                );
                $stats['avg_effectiveness'] = round(floatval($stmt->fetchColumn()), 2);

                jsonResponse(['success' => true, 'data' => $stats, 'message' => '获取成功']);
                break;

            default:
                jsonResponse(['success' => false, 'message' => '未知的报表操作: ' . $action]);
        }
    } catch (PDOException $e) {
        jsonResponse(['success' => false, 'message' => '获取统计数据失败']);
    }
}

// ============================================================
// Registry Module
// ============================================================
function handleRegistryAction(string $action): void {
    requireAuth();

    switch ($action) {
        // GET /api/registry/menu - Menu configuration
        case 'menu':
            try {
                $pdo = getDB();
                $stmt = $pdo->query(
                    'SELECT id, name, code, parent_id, icon, sort_order, is_active 
                     FROM modules WHERE is_active = 1 ORDER BY sort_order'
                );
                $modules = $stmt->fetchAll();

                // Build tree
                $menu = [];
                foreach ($modules as $mod) {
                    if ($mod['parent_id'] == 0) {
                        $menu[] = [
                            'id'    => $mod['id'],
                            'name'  => $mod['name'],
                            'code'  => $mod['code'],
                            'icon'  => $mod['icon'],
                            'route' => $mod['code']
                        ];
                    }
                }

                jsonResponse(['success' => true, 'data' => $menu, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // GET /api/registry/modules_list - Module list
        case 'modules_list':
            try {
                $pdo = getDB();
                $stmt = $pdo->query(
                    'SELECT id, name, code, parent_id, icon, sort_order, is_active, description, created_at 
                     FROM modules ORDER BY sort_order'
                );
                $modules = $stmt->fetchAll();

                jsonResponse(['success' => true, 'data' => $modules, 'message' => '获取成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '获取失败']);
            }
            break;

        // POST /api/registry/modules_toggle - Toggle module
        case 'modules_toggle':
            requirePermission('system_settings');

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['success' => false, 'message' => '请求方式错误']);
            }

            $input = getInput();
            $moduleId = isset($input['module_id']) ? intval($input['module_id']) : 0;
            $isActive = isset($input['is_active']) ? intval($input['is_active']) : 1;

            if ($moduleId <= 0) {
                jsonResponse(['success' => false, 'message' => '模块ID不能为空']);
            }

            try {
                $pdo = getDB();
                $stmt = $pdo->prepare('UPDATE modules SET is_active = ? WHERE id = ?');
                $stmt->execute([$isActive, $moduleId]);

                jsonResponse(['success' => true, 'message' => '更新成功']);
            } catch (PDOException $e) {
                jsonResponse(['success' => false, 'message' => '更新失败']);
            }
            break;

        // GET /api/registry/charts - Chart configuration
        case 'charts':
            $charts = [
                'dashboard' => [
                    ['type' => 'pie', 'title' => '障碍类型分布', 'data_source' => 'disability_distribution'],
                    ['type' => 'bar', 'title' => '班级人数分布', 'data_source' => 'class_distribution'],
                    ['type' => 'line', 'title' => '教学记录趋势', 'data_source' => 'teaching_trend']
                ],
                'students' => [
                    ['type' => 'pie', 'title' => '性别分布', 'data_source' => 'gender_ratio'],
                    ['type' => 'bar', 'title' => '障碍类型统计', 'data_source' => 'by_disability']
                ],
                'assessments' => [
                    ['type' => 'bar', 'title' => '评估类型统计', 'data_source' => 'by_type'],
                    ['type' => 'line', 'title' => '月度评估趋势', 'data_source' => 'monthly']
                ]
            ];
            jsonResponse(['success' => true, 'data' => $charts, 'message' => '获取成功']);
            break;

        default:
            jsonResponse(['success' => false, 'message' => '未知的注册表操作: ' . $action]);
    }
}
