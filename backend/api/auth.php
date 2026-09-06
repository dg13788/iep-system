<?php
/**
 * Auth Module - Authentication Endpoints
 * 
 * Endpoints:
 *   POST /api/auth/login        - User login
 *   GET  /api/auth/me           - Get current user info
 *   POST /api/auth/parent-login - Parent login
 */

require_once __DIR__ . '/config.php';

// Get action from router
$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // POST /api/auth/login - User login
    // ============================================================
    case 'login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $username = isset($input['username']) ? trim($input['username']) : '';
        $password = isset($input['password']) ? $input['password'] : '';

        if (empty($username) || empty($password)) {
            jsonResponse(['success' => false, 'message' => '账号和密码不能为空']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, username, real_name, password_hash, role_id, permission_group_id, avatar, is_active
                 FROM users WHERE username = ? LIMIT 1'
            );
            $stmt->execute([$username]);
            $user = $stmt->fetch();

            if (!$user) {
                jsonResponse(['success' => false, 'message' => '账号或密码错误']);
            }
            if (!$user['is_active']) {
                jsonResponse(['success' => false, 'message' => '账号已被禁用']);
            }
            if (!password_verify($password, $user['password_hash'])) {
                jsonResponse(['success' => false, 'message' => '账号或密码错误']);
            }

            // Get permission group info (v3)
            $pgId = intval($user['permission_group_id'] ?? $user['role_id'] ?? 0);
            $pgStmt = $pdo->prepare(
                'SELECT id, name, data_scope_type, iep_level, menu_permissions, feature_permissions
                 FROM permission_groups WHERE id = ? LIMIT 1'
            );
            $pgStmt->execute([$pgId]);
            $pg = $pgStmt->fetch(PDO::FETCH_ASSOC);

            // Get role info (backward compatibility)
            $roleStmt = $pdo->prepare('SELECT id, name, code FROM roles WHERE id = ? LIMIT 1');
            $roleStmt->execute([$user['role_id']]);
            $role = $roleStmt->fetch();

            // Update login info
            $updateStmt = $pdo->prepare('UPDATE users SET last_login_at = NOW(), login_ip = ? WHERE id = ?');
            $updateStmt->execute([$_SERVER['REMOTE_ADDR'] ?? '', $user['id']]);

            // Generate JWT with permission_group_id
            $payload = [
                'sub'                 => $user['id'],
                'name'                => $user['real_name'] ? $user['real_name'] : $user['username'],
                'role_id'             => $user['role_id'],
                'permission_group_id' => $pgId,
                'username'            => $user['username']
            ];
            $token = jwtEncode($payload);

            // Build permissions for response
            $menuPerms = json_decode($pg['menu_permissions'] ?? '[]', true) ?: [];
            $featurePerms = json_decode($pg['feature_permissions'] ?? '[]', true) ?: [];

            // Record audit log
            auditLog('login', 'auth', 'user', $user['id'], $user['username'], null, null, '用户登录系统');

            jsonResponse([
                'success' => true,
                'data'    => [
                    'token' => $token,
                    'user'  => [
                        'id'                   => $user['id'],
                        'username'             => $user['username'],
                        'real_name'            => $user['real_name'],
                        'role_id'              => $user['role_id'],
                        'role_name'            => $role ? $role['name'] : '',
                        'role_code'            => $role ? $role['code'] : '',
                        'permission_group_id'  => $pgId,
                        'permission_group_name'=> $pg ? $pg['name'] : '',
                        'avatar'               => $user['avatar']
                    ],
                    'permissions' => [
                        'menu'       => $menuPerms,
                        'data_scope' => $pg['data_scope_type'] ?? 'none',
                        'iep_level'  => $pg['iep_level'] ?? 'none',
                        'features'   => $featurePerms
                    ]
                ],
                'message' => '登录成功'
            ]);
        } catch (PDOException $e) {
            error_log('Login error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '登录失败，请稍后重试']);
        }
        break;

    // ============================================================
    // GET /api/auth/me - Get current user info (v3 with permission group)
    // ============================================================
    case 'me':
        $user = requireAuth();

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT u.id, u.username, u.real_name, u.phone, u.email, u.avatar,
                        u.department, u.role_id, u.permission_group_id,
                        r.name AS role_name, r.code AS role_code
                 FROM users u
                 LEFT JOIN roles r ON u.role_id = r.id
                 WHERE u.id = ? AND u.is_active = 1 LIMIT 1'
            );
            $stmt->execute([$user['sub']]);
            $userInfo = $stmt->fetch();

            if (!$userInfo) {
                jsonResponse(['success' => false, 'message' => '用户不存在或已被禁用']);
            }

            // Get permission group info (v3)
            $pgId = intval($userInfo['permission_group_id'] ?? $userInfo['role_id'] ?? 0);
            $pgStmt = $pdo->prepare(
                'SELECT id, name, data_scope_type, iep_level, menu_permissions, feature_permissions
                 FROM permission_groups WHERE id = ? LIMIT 1'
            );
            $pgStmt->execute([$pgId]);
            $pg = $pgStmt->fetch(PDO::FETCH_ASSOC);

            // Build permissions from permission group
            if ($pg) {
                $userInfo['permission_group_id'] = $pgId;
                $userInfo['permission_group_name'] = $pg['name'];
                $userInfo['permissions'] = [
                    'menu'       => json_decode($pg['menu_permissions'] ?? '[]', true) ?: [],
                    'data_scope' => $pg['data_scope_type'] ?? 'none',
                    'iep_level'  => $pg['iep_level'] ?? 'none',
                    'features'   => json_decode($pg['feature_permissions'] ?? '[]', true) ?: []
                ];
            } else {
                // Fallback: old role-based permissions (backward compatibility)
                $permStmt = $pdo->prepare(
                    'SELECT p.code FROM role_permissions rp
                     INNER JOIN permissions p ON rp.permission_id = p.id
                     WHERE rp.role_id = ? AND p.is_active = 1'
                );
                $permStmt->execute([$userInfo['role_id']]);
                $userInfo['permissions'] = $permStmt->fetchAll(PDO::FETCH_COLUMN);
            }

            jsonResponse(['success' => true, 'data' => $userInfo, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('Get user info error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取用户信息失败']);
        }
        break;

    // ============================================================
    // POST /api/auth/parent-login - Parent login
    // ============================================================
    case 'parent-login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $phone = isset($input['phone']) ? trim($input['phone']) : '';
        $password = isset($input['password']) ? $input['password'] : '';

        if (empty($phone) || empty($password)) {
            jsonResponse(['success' => false, 'message' => '手机号和密码不能为空']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, name, phone, password_hash, is_active 
                 FROM parents WHERE phone = ? AND deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$phone]);
            $parent = $stmt->fetch();

            if (!$parent) {
                jsonResponse(['success' => false, 'message' => '手机号或密码错误']);
            }
            if (!$parent['is_active']) {
                jsonResponse(['success' => false, 'message' => '账号已被禁用']);
            }
            if (!password_verify($password, $parent['password_hash'])) {
                jsonResponse(['success' => false, 'message' => '手机号或密码错误']);
            }

            // Update login info
            $updateStmt = $pdo->prepare('UPDATE parents SET last_login_at = NOW(), login_ip = ? WHERE id = ?');
            $updateStmt->execute([$_SERVER['REMOTE_ADDR'] ?? '', $parent['id']]);

            // Generate JWT with permission_group_id (parents use group 5)
            $payload = [
                'sub'                 => $parent['id'],
                'name'                => $parent['name'],
                'role_id'             => 5,
                'permission_group_id' => 5,
                'username'            => $parent['phone'],
                'type'                => 'parent'
            ];
            $token = jwtEncode($payload);

            // Get parent permission group info
            $pgStmt = $pdo->prepare(
                'SELECT id, name, data_scope_type, iep_level, menu_permissions, feature_permissions
                 FROM permission_groups WHERE id = 5 LIMIT 1'
            );
            $pgStmt->execute();
            $pg = $pgStmt->fetch(PDO::FETCH_ASSOC);
            $menuPerms = json_decode($pg['menu_permissions'] ?? '[]', true) ?: [];
            $featurePerms = json_decode($pg['feature_permissions'] ?? '[]', true) ?: [];

            jsonResponse([
                'success' => true,
                'data'    => [
                    'token' => $token,
                    'user'  => [
                        'id'                   => $parent['id'],
                        'name'                 => $parent['name'],
                        'phone'                => $parent['phone'],
                        'type'                 => 'parent',
                        'permission_group_id'  => 5,
                        'permission_group_name'=> $pg ? $pg['name'] : '家长'
                    ],
                    'permissions' => [
                        'menu'       => $menuPerms,
                        'data_scope' => $pg['data_scope_type'] ?? 'own_only',
                        'iep_level'  => $pg['iep_level'] ?? 'view',
                        'features'   => $featurePerms
                    ]
                ],
                'message' => '登录成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '登录失败，请稍后重试']);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的认证操作: ' . $action]);
}
