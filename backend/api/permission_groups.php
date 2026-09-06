<?php
/**
 * Permission Groups API - 权限组管理CRUD接口
 *
 * Endpoints:
 *   GET    /api/permission_groups        - 获取权限组列表
 *   GET    /api/permission_groups?id=1   - 获取单个权限组详情
 *   POST   /api/permission_groups        - 创建新权限组
 *   PUT    /api/permission_groups?id=1   - 更新权限组
 *   DELETE /api/permission_groups?id=1   - 删除权限组
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    // ============================================================
    // GET - List or Detail
    // ============================================================
    case 'GET':
        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;

        try {
            $pdo = getDB();

            if ($id > 0) {
                // Single permission group detail
                $stmt = $pdo->prepare(
                    'SELECT id, name, description, data_scope_type, iep_level,
                            menu_permissions, feature_permissions, sort_order,
                            is_system, created_at, updated_at
                     FROM permission_groups WHERE id = ? LIMIT 1'
                );
                $stmt->execute([$id]);
                $group = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$group) {
                    jsonResponse(['success' => false, 'message' => '权限组不存在']);
                }

                // Decode JSON fields
                $group['menu_permissions'] = json_decode($group['menu_permissions'] ?? '[]', true) ?: [];
                $group['feature_permissions'] = json_decode($group['feature_permissions'] ?? '[]', true) ?: [];

                // Get user count
                $countStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE permission_group_id = ?');
                $countStmt->execute([$id]);
                $group['user_count'] = intval($countStmt->fetchColumn());

                jsonResponse(['success' => true, 'data' => $group]);
            } else {
                // List all permission groups with user count
                $stmt = $pdo->query(
                    'SELECT pg.id, pg.name, pg.description, pg.data_scope_type, pg.iep_level,
                            pg.menu_permissions, pg.feature_permissions, pg.sort_order,
                            pg.is_system, pg.created_at, pg.updated_at,
                            COUNT(u.id) AS user_count
                     FROM permission_groups pg
                     LEFT JOIN users u ON u.permission_group_id = pg.id
                     GROUP BY pg.id
                     ORDER BY pg.sort_order ASC, pg.id ASC'
                );
                $groups = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Decode JSON fields and ensure user_count is int
                foreach ($groups as &$group) {
                    $group['menu_permissions'] = json_decode($group['menu_permissions'] ?? '[]', true) ?: [];
                    $group['feature_permissions'] = json_decode($group['feature_permissions'] ?? '[]', true) ?: [];
                    $group['user_count'] = intval($group['user_count']);
                }
                unset($group);

                jsonResponse(['success' => true, 'data' => $groups]);
            }
        } catch (PDOException $e) {
            error_log('Permission groups GET error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取权限组失败']);
        }
        break;

    // ============================================================
    // POST - Create
    // ============================================================
    case 'POST':
        // Require authentication and permission
        $user = requireAuth();
        requirePermission('role_manage');

        $input = getInput();

        // Validate required fields
        $name = isset($input['name']) ? trim($input['name']) : '';
        $description = isset($input['description']) ? trim($input['description']) : '';
        $dataScopeType = isset($input['data_scope_type']) ? trim($input['data_scope_type']) : '';
        $iepLevel = isset($input['iep_level']) ? trim($input['iep_level']) : 'none';
        $menuPermissions = isset($input['menu_permissions']) && is_array($input['menu_permissions'])
            ? $input['menu_permissions'] : [];
        $featurePermissions = isset($input['feature_permissions']) && is_array($input['feature_permissions'])
            ? $input['feature_permissions'] : [];
        $sortOrder = isset($input['sort_order']) ? intval($input['sort_order']) : 0;

        if (empty($name)) {
            jsonResponse(['success' => false, 'message' => '权限组名称不能为空']);
        }
        if (mb_strlen($name) > 50) {
            jsonResponse(['success' => false, 'message' => '权限组名称不能超过50个字符']);
        }
        if (empty($dataScopeType)) {
            jsonResponse(['success' => false, 'message' => '数据范围类型不能为空']);
        }

        // Validate data_scope_type
        $validScopeTypes = ['all', 'class_only', 'teacher_related', 'own_only', 'none'];
        if (!in_array($dataScopeType, $validScopeTypes, true)) {
            jsonResponse(['success' => false, 'message' => '无效的数据范围类型']);
        }

        // Validate iep_level
        $validIepLevels = ['none', 'view', 'participate', 'full'];
        if (!in_array($iepLevel, $validIepLevels, true)) {
            jsonResponse(['success' => false, 'message' => '无效的IEP权限级别']);
        }

        try {
            $pdo = getDB();

            // Check for duplicate name
            $checkStmt = $pdo->prepare('SELECT id FROM permission_groups WHERE name = ? LIMIT 1');
            $checkStmt->execute([$name]);
            if ($checkStmt->fetch()) {
                jsonResponse(['success' => false, 'message' => '权限组名称已存在']);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO permission_groups
                 (name, description, data_scope_type, iep_level, menu_permissions,
                  feature_permissions, sort_order, is_system, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())'
            );
            $stmt->execute([
                $name,
                $description,
                $dataScopeType,
                $iepLevel,
                json_encode($menuPermissions),
                json_encode($featurePermissions),
                $sortOrder
            ]);

            $newId = intval($pdo->lastInsertId());

            // Audit log
            auditLog(
                'create',
                'permission_group',
                'permission_group',
                $newId,
                $name,
                null,
                $input,
                '创建权限组：' . $name
            );

            jsonResponse([
                'success' => true,
                'data' => ['id' => $newId],
                'message' => '权限组创建成功'
            ]);
        } catch (PDOException $e) {
            error_log('Permission groups POST error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '创建权限组失败']);
        }
        break;

    // ============================================================
    // PUT - Update
    // ============================================================
    case 'PUT':
        $user = requireAuth();
        requirePermission('role_manage');

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误：缺少权限组ID']);
        }

        $input = getInput();

        try {
            $pdo = getDB();

            // Check if exists
            $checkStmt = $pdo->prepare('SELECT * FROM permission_groups WHERE id = ? LIMIT 1');
            $checkStmt->execute([$id]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if (!$existing) {
                jsonResponse(['success' => false, 'message' => '权限组不存在']);
            }

            // Build update fields dynamically
            $fields = [];
            $params = [];

            if (isset($input['name'])) {
                $name = trim($input['name']);
                if (empty($name)) {
                    jsonResponse(['success' => false, 'message' => '权限组名称不能为空']);
                }
                if (mb_strlen($name) > 50) {
                    jsonResponse(['success' => false, 'message' => '权限组名称不能超过50个字符']);
                }
                // Check for duplicate name (excluding self)
                $dupStmt = $pdo->prepare('SELECT id FROM permission_groups WHERE name = ? AND id != ? LIMIT 1');
                $dupStmt->execute([$name, $id]);
                if ($dupStmt->fetch()) {
                    jsonResponse(['success' => false, 'message' => '权限组名称已存在']);
                }
                $fields[] = 'name = ?';
                $params[] = $name;
            }

            if (isset($input['description'])) {
                $fields[] = 'description = ?';
                $params[] = trim($input['description']);
            }

            if (isset($input['data_scope_type'])) {
                $scope = trim($input['data_scope_type']);
                $validScopeTypes = ['all', 'class_only', 'teacher_related', 'own_only', 'none'];
                if (!in_array($scope, $validScopeTypes, true)) {
                    jsonResponse(['success' => false, 'message' => '无效的数据范围类型']);
                }
                $fields[] = 'data_scope_type = ?';
                $params[] = $scope;
            }

            if (isset($input['iep_level'])) {
                $level = trim($input['iep_level']);
                $validIepLevels = ['none', 'view', 'participate', 'full'];
                if (!in_array($level, $validIepLevels, true)) {
                    jsonResponse(['success' => false, 'message' => '无效的IEP权限级别']);
                }
                $fields[] = 'iep_level = ?';
                $params[] = $level;
            }

            if (isset($input['menu_permissions']) && is_array($input['menu_permissions'])) {
                $fields[] = 'menu_permissions = ?';
                $params[] = json_encode($input['menu_permissions']);
            }

            if (isset($input['feature_permissions']) && is_array($input['feature_permissions'])) {
                $fields[] = 'feature_permissions = ?';
                $params[] = json_encode($input['feature_permissions']);
            }

            if (isset($input['sort_order'])) {
                $fields[] = 'sort_order = ?';
                $params[] = intval($input['sort_order']);
            }

            if (empty($fields)) {
                jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
            }

            // Execute update
            $sql = 'UPDATE permission_groups SET ' . implode(', ', $fields) . ' WHERE id = ?';
            $params[] = $id;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            // Audit log
            auditLog(
                'update',
                'permission_group',
                'permission_group',
                $id,
                $existing['name'],
                $existing,
                $input,
                '更新权限组：' . ($input['name'] ?? $existing['name'])
            );

            jsonResponse([
                'success' => true,
                'message' => '权限组更新成功'
            ]);
        } catch (PDOException $e) {
            error_log('Permission groups PUT error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '更新权限组失败']);
        }
        break;

    // ============================================================
    // DELETE - Delete (system groups cannot be deleted)
    // ============================================================
    case 'DELETE':
        $user = requireAuth();
        requirePermission('role_manage');

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误：缺少权限组ID']);
        }

        // Admin group cannot be deleted
        if ($id === 1) {
            jsonResponse(['success' => false, 'message' => '超级管理员权限组不可删除']);
        }

        try {
            $pdo = getDB();

            // Check if exists and is system group
            $checkStmt = $pdo->prepare(
                'SELECT id, name, is_system FROM permission_groups WHERE id = ? LIMIT 1'
            );
            $checkStmt->execute([$id]);
            $group = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if (!$group) {
                jsonResponse(['success' => false, 'message' => '权限组不存在']);
            }

            if (intval($group['is_system']) === 1) {
                jsonResponse(['success' => false, 'message' => '系统内置权限组不可删除']);
            }

            // Check if any users are associated
            $userStmt = $pdo->prepare(
                'SELECT COUNT(*) FROM users WHERE permission_group_id = ?'
            );
            $userStmt->execute([$id]);
            $userCount = intval($userStmt->fetchColumn());

            if ($userCount > 0) {
                jsonResponse([
                    'success' => false,
                    'message' => '该权限组下还有 ' . $userCount . ' 个用户，请先移除用户后再删除'
                ]);
            }

            // Delete
            $delStmt = $pdo->prepare('DELETE FROM permission_groups WHERE id = ?');
            $delStmt->execute([$id]);

            // Audit log
            auditLog(
                'delete',
                'permission_group',
                'permission_group',
                $id,
                $group['name'],
                $group,
                null,
                '删除权限组：' . $group['name']
            );

            jsonResponse([
                'success' => true,
                'message' => '权限组删除成功'
            ]);
        } catch (PDOException $e) {
            error_log('Permission groups DELETE error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除权限组失败']);
        }
        break;

    // ============================================================
    // OPTIONS - CORS preflight (handled by config.php)
    // ============================================================
    case 'OPTIONS':
        http_response_code(204);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '不支持的请求方式']);
}
