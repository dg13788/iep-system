<?php
/**
 * IEP Module - Individualized Education Plan Endpoints
 * 
 * Endpoints:
 *   GET  /api/iep/list            - IEP plan list with status filters
 *   GET  /api/iep/get             - Get IEP detail with goals
 *   POST /api/iep/create          - Create IEP plan
 *   POST /api/iep/update          - Update IEP
 *   POST /api/iep/delete          - Delete IEP
 *   POST /api/iep/submit          - Submit for review
 *   POST /api/iep/approve         - Approve/reject IEP
 *   POST /api/iep/sign            - Parent signature
 *   POST /api/iep/save_goals      - Save IEP goals
 *   POST /api/iep/progress        - Record goal progress
 *   GET  /api/iep/approval-logs   - Get approval history
 *   GET  /api/iep/goal_stats      - Goal statistics
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/iep/list - IEP plan list
    // ============================================================
    case 'list':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        $status = isset($_GET['status']) ? trim($_GET['status']) : '';

        try {
            $pdo = getDB();
            $where = ['p.deleted_at IS NULL'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'p.student_id = ?';
                $params[] = $studentId;
            }
            if (!empty($status)) {
                $where[] = 'p.status = ?';
                $params[] = $status;
            }

            $whereStr = implode(' AND ', $where);

            // Apply data scope filtering
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                // 安全修复(P0-2)：原实现在 class_ids 为空时不追加任何过滤条件，
                // 导致班主任在关联缺失或查询异常时可见全校数据（fail-open 越权）。
                // 现改为 fail-closed：无关联班级即不可见任何数据。
                if (empty($scope['class_ids'])) {
                    $scopeClause = ' AND p.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {

                $conditions = [];
                // Primary teacher
                if (!empty($scope['teacher_id'])) {
                    $conditions[] = 'p.primary_teacher_id = ?';
                    $scopeParams[] = $scope['teacher_id'];
                }
                // Students in their classes
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                // Students whose IEP goals they manage
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "p.student_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) {
                    $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')';
                } else {
                    $scopeClause = ' AND p.id = -1'; // No access
                }
            } elseif ($scope['type'] === 'parent') {
                // 安全修复(P0-2)：fail-closed
                if (empty($scope['student_ids'])) {
                    $scopeClause = ' AND p.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND p.student_id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
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

            // Count (join with students for scope filtering)
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM iep_plans p LEFT JOIN students s ON p.student_id = s.id WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            // Data
            $sql = 'SELECT p.id, p.student_id, s.name AS student_name, p.plan_code, p.title, 
                           p.academic_year, p.semester, p.start_date, p.end_date, 
                           p.primary_teacher_id, u.real_name AS primary_teacher_name,
                           p.status, p.approved_by, p.approved_at, p.created_at,
                           (SELECT COUNT(*) FROM iep_goals WHERE iep_plan_id = p.id AND deleted_at IS NULL) AS goal_count
                    FROM iep_plans p
                    LEFT JOIN students s ON p.student_id = s.id
                    LEFT JOIN users u ON p.primary_teacher_id = u.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY p.created_at DESC LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('iep', $scope['type'], $total);

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
    // GET /api/iep/get - Get IEP detail with goals
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：防 IDOR 越权读取（教师仅本班/所教学生，家长仅自家孩子）
        requireIepInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT p.*, s.name AS student_name, s.birth_date, s.gender, 
                        s.disability_type_id, ddt.name AS disability_type_name, 
                        u.real_name AS primary_teacher_name, u2.real_name AS approved_by_name 
                 FROM iep_plans p 
                 LEFT JOIN students s ON p.student_id = s.id 
                 LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id 
                 LEFT JOIN users u ON p.primary_teacher_id = u.id 
                 LEFT JOIN users u2 ON p.approved_by = u2.id 
                 WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$id]);
            $plan = $stmt->fetch();

            if (!$plan) {
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在']);
            }

            // Get goals
            $goalStmt = $pdo->prepare(
                'SELECT id, goal_code, area, title, description, target_behavior, criteria, 
                        evaluation_method, baseline, target_score, current_score, progress_percentage, 
                        start_date, target_date, priority, status, teaching_strategies, resources, 
                        responsible_teacher_id, sort_order 
                 FROM iep_goals 
                 WHERE iep_plan_id = ? AND deleted_at IS NULL ORDER BY area, sort_order'
            );
            $goalStmt->execute([$id]);
            $plan['goals'] = $goalStmt->fetchAll();

            // Get approval logs
            $logStmt = $pdo->prepare(
                'SELECT id, approver_id, approver_type, approver_role, approver_name, action, 
                        comment, previous_status, new_status, created_at 
                 FROM iep_approval_logs 
                 WHERE iep_plan_id = ? ORDER BY created_at DESC'
            );
            $logStmt->execute([$id]);
            $plan['approval_logs'] = $logStmt->fetchAll();

            // Get parent signatures
            $sigStmt = $pdo->prepare(
                'SELECT ps.id, ps.parent_id, p.name AS parent_name, ps.signature_type, 
                        ps.is_revoked, ps.signed_at 
                 FROM parent_signatures ps 
                 LEFT JOIN parents p ON ps.parent_id = p.id 
                 WHERE ps.iep_plan_id = ?'
            );
            $sigStmt->execute([$id]);
            $plan['signatures'] = $sigStmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $plan, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/create - Create IEP plan
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('iep_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $title = isset($input['title']) ? trim($input['title']) : '';

        if ($studentId <= 0 || empty($title)) {
            jsonResponse(['success' => false, 'message' => '学生ID和计划标题不能为空']);
        }

        // 数据范围校验：禁止为范围外学生创建 IEP
        requireStudentInScope($studentId);

        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        $semester = isset($input['semester']) ? trim($input['semester']) : '';
        $academicYear = isset($input['academic_year']) ? trim($input['academic_year']) : date('Y') . '-' . (date('Y') + 1);
        $startDate = isset($input['start_date']) ? $input['start_date'] : date('Y-m-d');
        $endDate = isset($input['end_date']) ? $input['end_date'] : date('Y-m-d', strtotime('+6 months'));

        // Generate plan code
        $planCode = 'IEP-' . date('Y') . '-' . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO iep_plans (student_id, plan_code, title, academic_year, semester, 
                 start_date, end_date, primary_teacher_id, created_by, status, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "draft", NOW(), NOW())'
            );
            $stmt->execute([$studentId, $planCode, $title, $academicYear, $semester, $startDate, $endDate, $userId, $userId]);

            $planId = $pdo->lastInsertId();

            // Record approval log
            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_name, 
                 action, new_status, comment, created_at) 
                 VALUES (?, ?, "user", ?, "submit", "draft", "创建IEP计划", NOW())'
            );
            $logStmt->execute([$planId, $userId, $user['name'] ?? '']);

            auditLog('create', 'iep', 'iep_plan', intval($planId), $title, null, null, '创建IEP计划');

            jsonResponse(['success' => true, 'data' => ['id' => $planId, 'plan_code' => $planCode], 'message' => '创建成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '创建失败: ' . $e->getMessage()]);
        }
        break;

    // ============================================================
    // POST /api/iep/update - Update IEP plan
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止修改范围外 IEP
        requireIepInScope($id);

        $updatableFields = [
            'title', 'semester', 'academic_year', 'start_date', 'end_date',
            'strengths', 'needs', 'priorities', 'adaptations', 'assistive_tech',
            'transition_plan', 'team_members', 'status', 'progress_summary'
        ];
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
            $stmt = $pdo->prepare('UPDATE iep_plans SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'iep', 'iep_plan', $id, '', null, null, '更新IEP计划');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/delete - Delete IEP plan
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('iep_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止删除范围外 IEP
        requireIepInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE iep_plans SET deleted_at = NOW() WHERE id = ?');
            $stmt->execute([$id]);

            auditLog('delete', 'iep', 'iep_plan', $id, '', null, null, '删除IEP计划');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/submit - Submit for review
    // ============================================================
    case 'submit':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止提交范围外 IEP
        requireIepInScope($id);

        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Get current status
            $stmt = $pdo->prepare('SELECT status FROM iep_plans WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) {
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在']);
            }
            $previousStatus = $current['status'];

            // Update status
            $stmt = $pdo->prepare('UPDATE iep_plans SET status = "reviewing", updated_at = NOW() WHERE id = ?');
            $stmt->execute([$id]);
            // Log
            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_name, 
                 action, previous_status, new_status, comment, created_at) 
                 VALUES (?, ?, "user", ?, "submit", ?, "reviewing", "提交审核", NOW())'
            );
            $logStmt->execute([$id, $userId, $user['name'] ?? '', $previousStatus]);

            $pdo->commit();

            auditLog('submit', 'iep', 'iep_plan', $id, '', null, null, '提交IEP审核');
            jsonResponse(['success' => true, 'message' => '提交成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '提交失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/approve - Approve/reject IEP
    // ============================================================
    case 'approve':
        requireAuth();
        requirePermission('iep_approve');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        $decision = isset($input['decision']) ? trim($input['decision']) : ''; // 'approve' or 'reject'
        $comment = isset($input['comment']) ? trim($input['comment']) : '';

        if ($id <= 0 || empty($decision)) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止审批范围外 IEP
        requireIepInScope($id);

        $newStatus = ($decision === 'approve') ? 'approved' : 'rejected';
        $actionType = ($decision === 'approve') ? 'approve' : 'reject';
        $actionLabel = ($decision === 'approve') ? '审批通过' : '审批驳回';

        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Get current status
            $stmt = $pdo->prepare('SELECT status FROM iep_plans WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) {
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在']);
            }
            $previousStatus = $current['status'];

            // Update status
            $approvedAt = ($decision === 'approve') ? 'NOW()' : 'NULL';
            $stmt = $pdo->prepare(
                'UPDATE iep_plans SET status = ?, approved_by = ?, approved_at = ' . $approvedAt . ', updated_at = NOW() WHERE id = ?'
            );
            $stmt->execute([$newStatus, $userId, $id]);

            // Log
            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_name, 
                 action, previous_status, new_status, comment, created_at) 
                 VALUES (?, ?, "user", ?, ?, ?, ?, ?, NOW())'
            );
            $logStmt->execute([$id, $userId, $user['name'] ?? '', $actionType, $previousStatus, $newStatus, $comment]);

            $pdo->commit();

            auditLog($actionType, 'iep', 'iep_plan', $id, '', null, null, $actionLabel);

            jsonResponse(['success' => true, 'message' => $actionLabel . '成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => $actionLabel . '失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/sign - Parent signature
    // ============================================================
    case 'sign':
        $user = getCurrentUser();
        if (!$user) {
            jsonResponse(['success' => false, 'message' => '未登录']);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $signatureData = isset($input['signature_data']) ? $input['signature_data'] : '';
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;

        if ($planId <= 0 || empty($signatureData)) {
            jsonResponse(['success' => false, 'message' => '计划ID和签名数据不能为空']);
        }

        // 数据范围校验：家长仅可签署自家孩子的 IEP
        requireIepInScope($planId);

        // For parent users, use their own ID
        if (isset($user['type']) && $user['type'] === 'parent') {
            $parentId = intval($user['sub']);
        }

        if ($parentId <= 0) {
            jsonResponse(['success' => false, 'message' => '家长ID不能为空']);
        }

        $signatureType = isset($input['signature_type']) ? trim($input['signature_type']) : 'handwritten';
        $signatureHash = hash('sha256', $signatureData);
        $deviceInfo = isset($input['device_info']) ? trim($input['device_info']) : ($_SERVER['HTTP_USER_AGENT'] ?? '');

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Upsert signature
            $stmt = $pdo->prepare(
                'INSERT INTO parent_signatures (iep_plan_id, parent_id, signature_type, signature_data, 
                 signature_hash, ip_address, device_info, signing_purpose, is_revoked, signed_at, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, "IEP计划确认", 0, NOW(), NOW()) 
                 ON DUPLICATE KEY UPDATE 
                 signature_type = VALUES(signature_type), 
                 signature_data = VALUES(signature_data), 
                 signature_hash = VALUES(signature_hash), 
                 ip_address = VALUES(ip_address), 
                 device_info = VALUES(device_info), 
                 is_revoked = 0, 
                 signed_at = NOW()'
            );
            $stmt->execute([$planId, $parentId, $signatureType, $signatureData, $signatureHash, $_SERVER['REMOTE_ADDR'] ?? '', $deviceInfo]);

            // Update IEP status to signed
            $stmt = $pdo->prepare('UPDATE iep_plans SET status = "signed", updated_at = NOW() WHERE id = ?');
            $stmt->execute([$planId]);

            // Get parent name
            $parStmt = $pdo->prepare('SELECT name FROM parents WHERE id = ?');
            $parStmt->execute([$parentId]);
            $parentName = $parStmt->fetchColumn();

            // Log
            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_name, 
                 action, new_status, comment, created_at) 
                 VALUES (?, ?, "parent", ?, "sign", "signed", "家长电子签名", NOW())'
            );
            $logStmt->execute([$planId, $parentId, $parentName]);

            $pdo->commit();

            jsonResponse(['success' => true, 'message' => '签名成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '签名失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/save_goals - Save IEP goals
    // ============================================================
    case 'save_goals':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $goalsJson = isset($input['goals']) ? $input['goals'] : '[]';

        if ($planId <= 0) {
            jsonResponse(['success' => false, 'message' => '计划ID不能为空']);
        }

        // 数据范围校验：禁止修改范围外 IEP 的目标
        requireIepInScope($planId);

        $goals = is_string($goalsJson) ? json_decode($goalsJson, true) : $goalsJson;
        if (!is_array($goals)) {
            jsonResponse(['success' => false, 'message' => '目标数据格式错误']);
        }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            $insertStmt = $pdo->prepare(
                'INSERT INTO iep_goals (iep_plan_id, goal_code, area, title, description, target_behavior, 
                 criteria, evaluation_method, baseline, target_score, current_score, start_date, target_date, 
                 priority, teaching_strategies, resources, responsible_teacher_id, sort_order, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
            );

            $updateStmt = $pdo->prepare(
                'UPDATE iep_goals SET area = ?, title = ?, description = ?, target_behavior = ?, 
                 criteria = ?, evaluation_method = ?, baseline = ?, target_score = ?, start_date = ?, 
                 target_date = ?, priority = ?, teaching_strategies = ?, resources = ?, 
                 responsible_teacher_id = ?, sort_order = ?, updated_at = NOW() WHERE id = ?'
            );

            foreach ($goals as $index => $goal) {
                if (isset($goal['id']) && intval($goal['id']) > 0) {
                    // Update existing goal
                    $updateStmt->execute([
                        $goal['area'] ?? '',
                        $goal['title'] ?? '',
                        $goal['description'] ?? '',
                        $goal['target_behavior'] ?? '',
                        $goal['criteria'] ?? '',
                        $goal['evaluation_method'] ?? '',
                        $goal['baseline'] ?? '',
                        isset($goal['target_score']) ? intval($goal['target_score']) : 5,
                        $goal['start_date'] ?? null,
                        $goal['target_date'] ?? null,
                        $goal['priority'] ?? 'medium',
                        $goal['teaching_strategies'] ?? '',
                        $goal['resources'] ?? '',
                        isset($goal['responsible_teacher_id']) ? intval($goal['responsible_teacher_id']) : null,
                        $index,
                        intval($goal['id'])
                    ]);
                } else {
                    // Insert new goal
                    $goalCode = 'G-' . $planId . '-' . strtoupper(substr(md5(uniqid()), 0, 6));
                    $insertStmt->execute([
                        $planId, $goalCode,
                        $goal['area'] ?? '',
                        $goal['title'] ?? '',
                        $goal['description'] ?? '',
                        $goal['target_behavior'] ?? '',
                        $goal['criteria'] ?? '',
                        $goal['evaluation_method'] ?? '',
                        $goal['baseline'] ?? '',
                        isset($goal['target_score']) ? intval($goal['target_score']) : 5,
                        0,
                        $goal['start_date'] ?? null,
                        $goal['target_date'] ?? null,
                        $goal['priority'] ?? 'medium',
                        $goal['teaching_strategies'] ?? '',
                        $goal['resources'] ?? '',
                        isset($goal['responsible_teacher_id']) ? intval($goal['responsible_teacher_id']) : null,
                        $index
                    ]);
                }
            }

            $pdo->commit();

            auditLog('save_goals', 'iep', 'iep_plan', $planId, '', null, null, '保存IEP目标');

            jsonResponse(['success' => true, 'message' => '目标保存成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '保存失败: ' . $e->getMessage()]);
        }
        break;

    // ============================================================
    // POST /api/iep/progress - Record goal progress
    // ============================================================
    case 'progress':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $goalId = isset($input['goal_id']) ? intval($input['goal_id']) : 0;
        $recordedDate = isset($input['recorded_date']) ? $input['recorded_date'] : date('Y-m-d');
        $score = isset($input['score']) ? intval($input['score']) : 0;

        if ($goalId <= 0) {
            jsonResponse(['success' => false, 'message' => '目标ID不能为空']);
        }

        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        $maxScore = isset($input['max_score']) ? intval($input['max_score']) : 5;
        $sessionType = isset($input['session_type']) ? trim($input['session_type']) : '';
        $promptLevel = isset($input['prompt_level']) ? trim($input['prompt_level']) : '';
        $isGeneralized = isset($input['is_generalized']) ? intval($input['is_generalized']) : 0;
        $generalizationContext = isset($input['generalization_context']) ? trim($input['generalization_context']) : '';
        $notes = isset($input['notes']) ? trim($input['notes']) : '';

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Insert progress record
            $stmt = $pdo->prepare(
                'INSERT INTO iep_goal_progress (goal_id, recorded_date, session_type, score, max_score, 
                 prompt_level, is_generalized, generalization_context, notes, recorded_by, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
            );
            $stmt->execute([
                $goalId, $recordedDate, $sessionType, $score, $maxScore,
                $promptLevel, $isGeneralized, $generalizationContext, $notes, $userId
            ]);

            // Update goal current score and progress
            // Calculate average score from all progress records
            $avgStmt = $pdo->prepare(
                'SELECT AVG(score) as avg_score, COUNT(*) as count FROM iep_goal_progress WHERE goal_id = ?'
            );
            $avgStmt->execute([$goalId]);
            $avgData = $avgStmt->fetch();

            // Get goal target score
            $targetStmt = $pdo->prepare('SELECT target_score FROM iep_goals WHERE id = ?');
            $targetStmt->execute([$goalId]);
            $targetScore = intval($targetStmt->fetchColumn());

            $currentScore = round($avgData['avg_score'] ?? 0, 2);
            $progressPercentage = $targetScore > 0 ? round(($currentScore / $targetScore) * 100, 2) : 0;

            // Determine status
            $status = 'not_started';
            if ($progressPercentage >= 100) {
                $status = 'achieved';
            } elseif ($progressPercentage > 0) {
                $status = 'in_progress';
            }

            $updateStmt = $pdo->prepare(
                'UPDATE iep_goals SET current_score = ?, progress_percentage = ?, status = ?, updated_at = NOW() WHERE id = ?'
            );
            $updateStmt->execute([$currentScore, min($progressPercentage, 100), $status, $goalId]);

            $pdo->commit();

            auditLog('progress', 'iep', 'iep_goal', $goalId, '', null, null, '记录目标进度');

            jsonResponse(['success' => true, 'data' => ['current_score' => $currentScore, 'progress' => min($progressPercentage, 100)], 'message' => '进度记录成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '记录失败']);
        }
        break;

    // ============================================================
    // GET /api/iep/approval-logs - Get approval history
    // ============================================================
    case 'approval-logs':
        requireAuth();

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, approver_id, approver_type, approver_role, approver_name, action, 
                        comment, previous_status, new_status, created_at 
                 FROM iep_approval_logs 
                 WHERE iep_plan_id = ? ORDER BY created_at DESC'
            );
            $stmt->execute([$planId]);
            $logs = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $logs, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/iep/goal_stats - Goal statistics
    // ============================================================
    case 'goal_stats':
        requireAuth();

        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        if ($studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();

            // Get latest IEP for student
            $stmt = $pdo->prepare(
                'SELECT id FROM iep_plans WHERE student_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1'
            );
            $stmt->execute([$studentId]);
            $planId = $stmt->fetchColumn();

            if (!$planId) {
                jsonResponse(['success' => true, 'data' => ['total' => 0, 'by_area' => [], 'by_status' => []], 'message' => '暂无IEP计划']);
            }

            // Total goals
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL');
            $stmt->execute([$planId]);
            $total = intval($stmt->fetchColumn());

            // By area
            $stmt = $pdo->prepare(
                'SELECT area, COUNT(*) as count FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL GROUP BY area'
            );
            $stmt->execute([$planId]);
            $byArea = $stmt->fetchAll();

            // By status
            $stmt = $pdo->prepare(
                'SELECT status, COUNT(*) as count FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL GROUP BY status'
            );
            $stmt->execute([$planId]);
            $byStatus = $stmt->fetchAll();

            // Average progress
            $stmt = $pdo->prepare(
                'SELECT AVG(progress_percentage) as avg_progress FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$planId]);
            $avgProgress = round(floatval($stmt->fetchColumn()), 2);

            jsonResponse([
                'success' => true,
                'data'    => [
                    'total'        => $total,
                    'by_area'      => $byArea,
                    'by_status'    => $byStatus,
                    'avg_progress' => $avgProgress
                ],
                'message' => '获取成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/iep/export - Export IEP plans (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('iep_export');

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format]);
        }

        try {
            $pdo = getDB();

            $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
            $status = isset($_GET['status']) ? trim($_GET['status']) : '';

            $where = ['p.deleted_at IS NULL'];
            $params = [];
            if ($studentId > 0) { $where[] = 'p.student_id = ?'; $params[] = $studentId; }
            if (!empty($status)) { $where[] = 'p.status = ?'; $params[] = $status; }
            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（fail-closed），与 list 一致
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                if (empty($scope['class_ids'])) { $scopeClause = ' AND p.id = -1'; }
                else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                if (!empty($scope['teacher_id'])) { $conditions[] = 'p.primary_teacher_id = ?'; $scopeParams[] = $scope['teacher_id']; }
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "p.student_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) { $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')'; }
                else { $scopeClause = ' AND p.id = -1'; }
            } elseif ($scope['type'] === 'parent') {
                if (empty($scope['student_ids'])) { $scopeClause = ' AND p.id = -1'; }
                else {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND p.student_id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
                }
            } elseif ($scope['type'] === 'viewer' || $scope['type'] === 'none') {
                $scopeClause = ' AND p.id = -1';
            }

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT p.plan_code, s.name AS student_name, p.title, p.academic_year, p.semester,
                           p.start_date, p.end_date, u.real_name AS primary_teacher_name, p.status,
                           (SELECT COUNT(*) FROM iep_goals WHERE iep_plan_id = p.id AND deleted_at IS NULL) AS goal_count
                    FROM iep_plans p
                    LEFT JOIN students s ON p.student_id = s.id
                    LEFT JOIN users u ON p.primary_teacher_id = u.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY p.created_at DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $data = $stmt->fetchAll();

            logDataScopeAccess('iep', $scope['type'], count($data));

            $headers = ['计划编号', '学生姓名', '计划标题', '学年', '学期', '开始日期', '结束日期', '主责教师', '状态', '目标数'];
            $rows = array_map(function ($r) {
                return [
                    $r['plan_code'] ?? '', $r['student_name'] ?? '', $r['title'] ?? '',
                    $r['academic_year'] ?? '', $r['semester'] ?? '', $r['start_date'] ?? '',
                    $r['end_date'] ?? '', $r['primary_teacher_name'] ?? '', $r['status'] ?? '',
                    $r['goal_count'] ?? 0,
                ];
            }, $data);

            io_download($format, 'IEP计划', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/import - Import IEP plans (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('iep_import');

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
            '学生姓名'   => ['field' => 'student_name', 'required' => true],
            '计划标题'   => ['field' => 'title', 'required' => true],
            '学年'       => ['field' => 'academic_year', 'required' => false],
            '学期'       => ['field' => 'semester', 'required' => false],
            '开始日期'   => ['field' => 'start_date', 'required' => false],
            '结束日期'   => ['field' => 'end_date', 'required' => false],
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
        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;
        $userName = $user['name'] ?? $user['username'] ?? '';

        $validStatuses = ['draft', 'reviewing', 'approved', 'rejected'];

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['student_name']) === '' || trim($data['title']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生姓名与计划标题不能为空";
                continue;
            }

            $studentId = io_lookup_student_by_name($pdo, $data['student_name']);
            if ($studentId <= 0) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生「" . $data['student_name'] . "」不存在或姓名重复，已跳过";
                continue;
            }
            // 学生范围校验（fail-closed，逐行跳过）
            if (!isStudentInScope($studentId, getDataScope())) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生「" . $data['student_name'] . "」超出数据范围，已跳过";
                continue;
            }

            $startDate = io_normalize_date($data['start_date']);
            $endDate = io_normalize_date($data['end_date']);
            if ($startDate === false || $endDate === false) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：日期格式错误（应为 YYYY-MM-DD）";
                continue;
            }

            $academicYear = $data['academic_year'] !== '' ? $data['academic_year'] : (date('Y') . '-' . (date('Y') + 1));
            $planCode = 'IEP-' . date('Y') . '-' . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);

            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare(
                    'INSERT INTO iep_plans (student_id, plan_code, title, academic_year, semester,
                     start_date, end_date, primary_teacher_id, created_by, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "draft", NOW(), NOW())'
                );
                $stmt->execute([
                    $studentId, $planCode, $data['title'], $academicYear,
                    $data['semester'] !== '' ? $data['semester'] : null,
                    $startDate, $endDate, $userId, $userId,
                ]);
                $planId = $pdo->lastInsertId();

                $logStmt = $pdo->prepare(
                    'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_name,
                     action, new_status, comment, created_at)
                     VALUES (?, ?, "user", ?, "submit", "draft", "批量导入IEP计划", NOW())'
                );
                $logStmt->execute([$planId, $userId, $userName]);
                $pdo->commit();

                auditLog('import', 'iep', 'iep_plan', intval($planId), $data['title'], null, null, '批量导入IEP计划');
                $inserted++;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：导入失败";
            }
        }

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条"
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的IEP操作: ' . $action]);
}
