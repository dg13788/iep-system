<?php
/**
 * Parents Module - Parent Management Endpoints
 * 
 * Endpoints:
 *   GET  /api/parents/list              - Parent accounts list
 *   GET  /api/parents/get               - Get parent detail
 *   POST /api/parents/create            - Create parent account
 *   POST /api/parents/update            - Update parent
 *   POST /api/parents/delete            - Delete parent
 *   GET  /api/parents/students          - Get linked students
 *   POST /api/parents/link_student      - Link student
 *   POST /api/parents/unlink_student    - Unlink student
 *   POST /api/parents/login             - Parent login
 *   GET  /api/parents/communications    - Communication records
 *   POST /api/parents/communications/create - Add communication
 *   GET  /api/parents/signatures        - Signature records
 *   GET  /api/parents/children          - Get children for logged-in parent
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/parents/list - Parent accounts list
    // ============================================================
    case 'list':
        requireAuth();
        requirePermission('parent_view');

        [$page, $pageSize, $offset] = getPagination();
        $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';

        try {
            $pdo = getDB();
            $where = ['p.deleted_at IS NULL'];
            $params = [];

            if (!empty($keyword)) {
                $where[] = '(p.name LIKE ? OR p.phone LIKE ?)';
                $like = '%' . $keyword . '%';
                $params[] = $like;
                $params[] = $like;
            }

            $whereStr = implode(' AND ', $where);

            // Apply data scope filtering
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'parent') {
                // 安全修复(P0-2)：家长身份但未绑定 parent_id 时必须拒绝，不可放行
                if (empty($scope['parent_id'])) {
                    $scopeClause = ' AND p.id = -1';
                } else {
                    $scopeClause = ' AND p.id = ?';
                    $scopeParams[] = $scope['parent_id'];
                }
            } elseif ($scope['type'] === 'class_teacher') {

                // 安全修复(P0-2)：fail-closed
                if (empty($scope['class_ids'])) {
                    $scopeClause = ' AND p.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND EXISTS (SELECT 1 FROM student_parents sp2 INNER JOIN students s2 ON sp2.student_id = s2.id WHERE sp2.parent_id = p.id AND s2.class_id IN ($placeholders))";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                // Parents of students in their classes
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "EXISTS (SELECT 1 FROM student_parents sp2 INNER JOIN students s2 ON sp2.student_id = s2.id WHERE sp2.parent_id = p.id AND s2.class_id IN ($placeholders))";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                // Parents of students whose IEP goals they manage
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "EXISTS (SELECT 1 FROM student_parents sp2 WHERE sp2.parent_id = p.id AND sp2.student_id IN ($placeholders))";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) {
                    $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')';
                } else {
                    $scopeClause = ' AND p.id = -1'; // No access
                }
            } elseif ($scope['type'] === 'viewer') {
                $scopeClause = ' AND p.id = -1';
            } elseif ($scope['type'] === 'none') {
                // 安全加固：数据范围为 none 时一律拒绝
                $scopeClause = ' AND p.id = -1';
            }

            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            // Count
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM parents p WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            $stmt = $pdo->prepare(
                'SELECT p.id, p.name, p.phone, p.email, p.relation, p.is_active, p.last_login_at, p.created_at 
                 FROM parents p WHERE ' . $whereStr . $scopeClause . ' ORDER BY p.created_at DESC LIMIT ' . $offset . ', ' . $pageSize
            );
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('parents', $scope['type'], $total);

            jsonResponse([
                'success' => true,
                'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
                'message' => '查询成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '查询失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/get - Get parent detail
    // ============================================================
    case 'get':
        requireAuth();
        requirePermission('parent_view');

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, name, phone, email, avatar, relation, address, wechat_openid, 
                        is_active, last_login_at, created_at 
                 FROM parents WHERE id = ? AND deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$id]);
            $parent = $stmt->fetch();

            if (!$parent) {
                jsonResponse(['success' => false, 'message' => '家长不存在']);
            }

            // Get linked students
            $stuStmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, s.birth_date, s.status, sc.name AS class_name, 
                        sp.relation, sp.is_primary, sp.can_sign 
                 FROM students s 
                 INNER JOIN student_parents sp ON s.id = sp.student_id 
                 LEFT JOIN student_classes sc ON s.class_id = sc.id 
                 WHERE sp.parent_id = ? AND s.deleted_at IS NULL'
            );
            $stuStmt->execute([$id]);
            $parent['students'] = $stuStmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $parent, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/create - Create parent account
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('parent_manage');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $name = isset($input['name']) ? trim($input['name']) : '';
        $phone = isset($input['phone']) ? trim($input['phone']) : '';

        if (empty($name) || empty($phone)) {
            jsonResponse(['success' => false, 'message' => '姓名和手机号不能为空']);
        }

        $relation = isset($input['relation']) ? trim($input['relation']) : '';
        $email = isset($input['email']) ? trim($input['email']) : '';
        $address = isset($input['address']) ? trim($input['address']) : '';

        // Default password: last 6 digits of phone
        $defaultPassword = substr($phone, -6);
        $passwordHash = password_hash($defaultPassword, PASSWORD_BCRYPT);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO parents (name, phone, password_hash, email, relation, address, is_active, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())'
            );
            $stmt->execute([$name, $phone, $passwordHash, $email, $relation, $address]);
            $parentId = $pdo->lastInsertId();

            auditLog('create', 'parents', 'parent', intval($parentId), $name, null, null, '创建家长账号');

            jsonResponse(['success' => true, 'data' => ['id' => $parentId], 'message' => '创建成功，初始密码为手机号后6位']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                jsonResponse(['success' => false, 'message' => '手机号已存在']);
            }
            jsonResponse(['success' => false, 'message' => '创建失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/update - Update parent
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('parent_manage');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        $updatableFields = ['name', 'phone', 'relation', 'email', 'address', 'is_active'];
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
            $stmt = $pdo->prepare('UPDATE parents SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'parents', 'parent', $id, '', null, null, '更新家长信息');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                jsonResponse(['success' => false, 'message' => '手机号已存在']);
            }
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/delete - Delete parent
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('parent_manage');

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
            $stmt = $pdo->prepare('UPDATE parents SET deleted_at = NOW() WHERE id = ?');
            $stmt->execute([$id]);

            auditLog('delete', 'parents', 'parent', $id, '', null, null, '删除家长账号');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/students - Get linked students
    // ============================================================
    case 'students':
        requireAuth();
        // 加固(P2)：原实现仅 requireAuth，任意登录账号可通过遍历 parent_id
        // 反查「家长→孩子」对应关系。现要求具 parent_view 权限。
        requirePermission('parent_view');

        $parentId = isset($_GET['parent_id']) ? intval($_GET['parent_id']) : 0;
        if ($parentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, s.birth_date, s.status, sc.name AS class_name, 
                        sp.relation, sp.is_primary, sp.can_sign 
                 FROM students s 
                 INNER JOIN student_parents sp ON s.id = sp.student_id 
                 LEFT JOIN student_classes sc ON s.class_id = sc.id 
                 WHERE sp.parent_id = ? AND s.deleted_at IS NULL'
            );
            $stmt->execute([$parentId]);
            $students = $stmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $students, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/link_student - Link student to parent
    // ============================================================
    case 'link_student':
        requireAuth();
        requirePermission('parent_manage');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;

        if ($parentId <= 0 || $studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '家长ID和学生ID不能为空']);
        }

        $relation = isset($input['relation']) ? trim($input['relation']) : '';

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO student_parents (student_id, parent_id, relation, is_primary, can_sign, created_at) 
                 VALUES (?, ?, ?, 0, 1, NOW())'
            );
            $stmt->execute([$studentId, $parentId, $relation]);

            jsonResponse(['success' => true, 'message' => '关联成功']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                jsonResponse(['success' => false, 'message' => '该家长已关联此学生']);
            }
            jsonResponse(['success' => false, 'message' => '关联失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/unlink_student - Unlink student from parent
    // ============================================================
    case 'unlink_student':
        requireAuth();
        requirePermission('parent_manage');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;

        if ($parentId <= 0 || $studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('DELETE FROM student_parents WHERE parent_id = ? AND student_id = ?');
            $stmt->execute([$parentId, $studentId]);

            jsonResponse(['success' => true, 'message' => '取消关联成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '取消关联失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/login - Parent login
    // ============================================================
    case 'login':
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

            // Generate JWT
            $payload = [
                'sub'      => $parent['id'],
                'name'     => $parent['name'],
                'role_id'  => 5,
                'username' => $parent['phone'],
                'type'     => 'parent'
            ];
            $token = jwtEncode($payload);

            jsonResponse([
                'success' => true,
                'data'    => [
                    'token' => $token,
                    'user'  => [
                        'id'    => $parent['id'],
                        'name'  => $parent['name'],
                        'phone' => $parent['phone'],
                        'type'  => 'parent'
                    ]
                ],
                'message' => '登录成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '登录失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/communications - Communication records
    // ============================================================
    case 'communications':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        $parentId = isset($_GET['parent_id']) ? intval($_GET['parent_id']) : 0;

        try {
            $pdo = getDB();
            $where = ['1=1'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'pc.student_id = ?';
                $params[] = $studentId;
            }
            if ($parentId > 0) {
                $where[] = 'pc.parent_id = ?';
                $params[] = $parentId;
            }

            $whereStr = implode(' AND ', $where);

            // Apply data scope filtering
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'parent' && !empty($scope['student_ids'])) {
                // Parents see only communications about their children
                $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                $scopeClause = " AND pc.student_id IN ($placeholders)";
                $scopeParams = $scope['student_ids'];

            } elseif ($scope['type'] === 'parent' && empty($scope['student_ids'])) {
                $scopeClause = ' AND pc.student_id = -1'; // No children = no access
            } elseif ($scope['type'] === 'class_teacher') {
                // 安全修复(P0-2)：fail-closed，班级集合为空时拒绝而非放行全部
                if (empty($scope['class_ids'])) {
                    $scopeClause = ' AND pc.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND EXISTS (SELECT 1 FROM students s2 WHERE s2.id = pc.student_id AND s2.class_id IN ($placeholders))";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                // Communications about students in their classes
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "EXISTS (SELECT 1 FROM students s2 WHERE s2.id = pc.student_id AND s2.class_id IN ($placeholders))";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                // Communications about students whose IEP goals they manage
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "pc.student_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) {
                    $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')';
                } else {
                    $scopeClause = ' AND pc.id = -1'; // No access
                }
            } elseif ($scope['type'] === 'viewer') {
                $scopeClause = ' AND pc.id = -1';
            } elseif ($scope['type'] === 'none') {
                // 安全加固：数据范围为 none 时一律拒绝
                $scopeClause = ' AND pc.id = -1';
            }

            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM parent_communications pc WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            $sql = 'SELECT pc.id, pc.student_id, s.name AS student_name, pc.teacher_id, u.real_name AS teacher_name,
                           pc.parent_id, p.name AS parent_name, pc.communication_type, pc.content,
                           pc.teacher_feedback, pc.parent_feedback, pc.follow_up, pc.is_confidential,
                           pc.communication_date, pc.created_at
                    FROM parent_communications pc
                    LEFT JOIN students s ON pc.student_id = s.id
                    LEFT JOIN users u ON pc.teacher_id = u.id
                    LEFT JOIN parents p ON pc.parent_id = p.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY pc.created_at DESC LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('parents/communications', $scope['type'], $total);

            jsonResponse([
                'success' => true,
                'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
                'message' => '查询成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '查询失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/communications/create - Add communication
    // ============================================================
    case 'communications/create':
        requireAuth();
        requirePermission('parents.communication_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $content = isset($input['content']) ? trim($input['content']) : '';

        if ($studentId <= 0 || empty($content)) {
            jsonResponse(['success' => false, 'message' => '学生ID和沟通内容不能为空']);
        }

        $user = getCurrentUser();
        $teacherId = isset($user['sub']) ? intval($user['sub']) : 0;

        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : null;
        $communicationType = isset($input['communication_type']) ? trim($input['communication_type']) : '';
        $teacherFeedback = isset($input['teacher_feedback']) ? trim($input['teacher_feedback']) : '';
        $parentFeedback = isset($input['parent_feedback']) ? trim($input['parent_feedback']) : '';
        $followUp = isset($input['follow_up']) ? trim($input['follow_up']) : '';
        $isConfidential = isset($input['is_confidential']) ? intval($input['is_confidential']) : 0;
        $communicationDate = isset($input['communication_date']) ? $input['communication_date'] : date('Y-m-d');

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO parent_communications (student_id, teacher_id, parent_id, communication_type, 
                 content, teacher_feedback, parent_feedback, follow_up, is_confidential, communication_date, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
            );
            $stmt->execute([
                $studentId, $teacherId, $parentId, $communicationType, $content,
                $teacherFeedback, $parentFeedback, $followUp, $isConfidential, $communicationDate
            ]);

            $commId = $pdo->lastInsertId();

            auditLog('create', 'parents', 'communication', intval($commId), '', null, null, '创建沟通记录');

            jsonResponse(['success' => true, 'data' => ['id' => $commId], 'message' => '创建成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '创建失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/signatures - Signature records
    // ============================================================
    case 'signatures':
        requireAuth();

        $parentId = isset($_GET['parent_id']) ? intval($_GET['parent_id']) : 0;
        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;

        try {
            $pdo = getDB();
            $where = ['1=1'];
            $params = [];

            if ($parentId > 0) {
                $where[] = 'ps.parent_id = ?';
                $params[] = $parentId;
            }
            if ($planId > 0) {
                $where[] = 'ps.iep_plan_id = ?';
                $params[] = $planId;
            }

            $whereStr = implode(' AND ', $where);

            $stmt = $pdo->prepare(
                'SELECT ps.id, ps.iep_plan_id, ip.title AS plan_title, ps.parent_id, p.name AS parent_name,
                        ps.signature_type, ps.is_revoked, ps.signed_at, ps.created_at
                 FROM parent_signatures ps
                 LEFT JOIN iep_plans ip ON ps.iep_plan_id = ip.id
                 LEFT JOIN parents p ON ps.parent_id = p.id
                 WHERE ' . $whereStr . ' ORDER BY ps.created_at DESC'
            );
            $stmt->execute($params);
            $signatures = $stmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $signatures, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/children - Get children for logged-in parent
    // ============================================================
    case 'children':
        $user = getCurrentUser();
        if (!$user || !isset($user['type']) || $user['type'] !== 'parent') {
            jsonResponse(['success' => false, 'message' => '仅限家长访问']);
        }

        $parentId = intval($user['sub']);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, s.birth_date, s.status, sc.name AS class_name,
                        ddt.name AS disability_type_name, sp.relation, sp.can_sign
                 FROM students s
                 INNER JOIN student_parents sp ON s.id = sp.student_id
                 LEFT JOIN student_classes sc ON s.class_id = sc.id
                 LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id
                 WHERE sp.parent_id = ? AND s.deleted_at IS NULL'
            );
            $stmt->execute([$parentId]);
            $children = $stmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $children, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/parents/export - Export parents (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('parent_export');

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format]);
        }

        try {
            $pdo = getDB();
            $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';

            $where = ['deleted_at IS NULL'];
            $params = [];
            if (!empty($keyword)) {
                $where[] = '(name LIKE ? OR phone LIKE ?)';
                $likeKeyword = '%' . $keyword . '%';
                $params[] = $likeKeyword; $params[] = $likeKeyword;
            }
            $whereStr = implode(' AND ', $where);

            $stmt = $pdo->prepare(
                'SELECT name, phone, email, relation, address, is_active, last_login_at, created_at
                 FROM parents WHERE ' . $whereStr . ' ORDER BY created_at DESC'
            );
            $stmt->execute($params);
            $data = $stmt->fetchAll();

            $headers = ['姓名', '手机号', '邮箱', '关系', '联系地址', '状态', '最后登录', '创建时间'];
            $rows = array_map(function ($r) {
                return [
                    $r['name'] ?? '', $r['phone'] ?? '', $r['email'] ?? '', $r['relation'] ?? '',
                    $r['address'] ?? '', $r['is_active'] ? '启用' : '停用',
                    $r['last_login_at'] ?? '', $r['created_at'] ?? '',
                ];
            }, $data);

            io_download($format, '家长账号', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败']);
        }
        break;

    // ============================================================
    // POST /api/parents/import - Import parents (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('parent_import');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $filename = isset($_FILES['file']['name']) ? $_FILES['file']['name'] : '';
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $parsed = io_parse_upload(null, $ext);
        if ($parsed['error']) {
            jsonResponse(['success' => false, 'message' => $parsed['error']]);
        }

        $columnMap = [
            '姓名'     => ['field' => 'name', 'required' => true],
            '手机号'   => ['field' => 'phone', 'required' => true],
            '邮箱'     => ['field' => 'email', 'required' => false],
            '关系'     => ['field' => 'relation', 'required' => false],
            '联系地址' => ['field' => 'address', 'required' => false],
        ];

        $map = io_map_columns($parsed['header'], $columnMap);
        if (!empty($map['missing'])) {
            jsonResponse(['success' => false, 'message' => '缺少必需列: ' . implode('、', $map['missing'])]);
        }
        $colIndex = $map['colIndex'];

        $pdo = getDB();
        $inserted = 0;
        $failed = 0;
        $errors = [];

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['name']) === '' || trim($data['phone']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：姓名与手机号不能为空";
                continue;
            }
            if (!preg_match('/^1\d{10}$/', trim($data['phone']))) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：手机号「" . $data['phone'] . "」格式不正确";
                continue;
            }

            // 手机号唯一性检查
            $checkStmt = $pdo->prepare('SELECT id FROM parents WHERE phone = ? AND deleted_at IS NULL LIMIT 1');
            $checkStmt->execute([trim($data['phone'])]);
            if ($checkStmt->fetchColumn()) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：手机号「" . $data['phone'] . "」已存在，已跳过";
                continue;
            }

            $defaultPassword = substr(trim($data['phone']), -6);
            $passwordHash = password_hash($defaultPassword, PASSWORD_BCRYPT);

            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO parents (name, phone, password_hash, email, relation, address, is_active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())'
                );
                $stmt->execute([
                    $data['name'], trim($data['phone']), $passwordHash,
                    $data['email'] !== '' ? $data['email'] : null,
                    $data['relation'] !== '' ? $data['relation'] : null,
                    $data['address'] !== '' ? $data['address'] : null,
                ]);
                auditLog('import', 'parents', 'parent', intval($pdo->lastInsertId()), $data['name'], null, null, '批量导入家长账号');
                $inserted++;
            } catch (Throwable $e) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：导入失败";
            }
        }

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条（初始密码为手机号后6位）"
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的家长操作: ' . $action]);
}
