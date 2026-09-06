<?php
/**
 * Students Module - Student Management Endpoints
 * 
 * Endpoints:
 *   GET  /api/students/list     - List with pagination, search, filters
 *   GET  /api/students/get      - Get single student detail
 *   POST /api/students/create   - Create student
 *   POST /api/students/update   - Update student
 *   POST /api/students/delete   - Soft delete
 *   GET  /api/students/classes  - Class list
 *   GET  /api/students/options  - Student dropdown options
 *   GET  /api/students/export   - Export students
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/students/list - Student list with pagination
    // ============================================================
    case 'list':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
        $classId = isset($_GET['class_id']) ? intval($_GET['class_id']) : 0;
        $status = isset($_GET['status']) ? trim($_GET['status']) : '';
        $disabilityTypeId = isset($_GET['disability_type_id']) ? intval($_GET['disability_type_id']) : 0;
        $sortField = isset($_GET['sort_field']) ? trim($_GET['sort_field']) : 'created_at';
        $sortOrder = isset($_GET['sort_order']) && strtolower($_GET['sort_order']) === 'asc' ? 'ASC' : 'DESC';

        // Whitelist sort fields
        $allowedSortFields = ['name', 'created_at', 'birth_date', 'status'];
        if (!in_array($sortField, $allowedSortFields)) {
            $sortField = 'created_at';
        }

        try {
            $pdo = getDB();
            $where = ['s.deleted_at IS NULL'];
            $params = [];

            if (!empty($keyword)) {
                $where[] = '(s.name LIKE ? OR s.id_card LIKE ? OR s.guardian_phone LIKE ?)';
                $likeKeyword = '%' . $keyword . '%';
                $params[] = $likeKeyword;
                $params[] = $likeKeyword;
                $params[] = $likeKeyword;
            }
            if ($classId > 0) {
                $where[] = 's.class_id = ?';
                $params[] = $classId;
            }
            if (!empty($status)) {
                $where[] = 's.status = ?';
                $params[] = $status;
            }
            if ($disabilityTypeId > 0) {
                $where[] = 's.disability_type_id = ?';
                $params[] = $disabilityTypeId;
            }

            $whereStr = implode(' AND ', $where);

            // Apply data scope filtering
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                // 安全修复(P0-2)：原实现在 class_ids 为空时不追加任何条件，
                // 导致班主任在关联缺失/查询异常时可见全校学生（fail-open 越权）。
                // 现改为 fail-closed：无关联班级即不可见任何数据。
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                } else {
                    $scopeClause = ' AND s.id = -1';
                }

            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "s.id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) {
                    $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')';
                } else {
                    $scopeClause = ' AND s.id = -1'; // No access
                }
            } elseif ($scope['type'] === 'parent') {
                // 安全修复(P0-2)：同上，家长无关联学生时必须拒绝而非放行。
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND s.id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
                } else {
                    $scopeClause = ' AND s.id = -1';
                }
            } elseif ($scope['type'] === 'viewer') {
                $scopeClause = ' AND s.id = -1';
            } elseif ($scope['type'] === 'none') {
                // 安全加固：数据范围为 none 时一律拒绝（原实现缺少该分支，默认放行全表）
                $scopeClause = ' AND s.id = -1';
            }


            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            // Count total
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM students s WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            // Query data
            $sql = 'SELECT s.id, s.name, s.gender, s.birth_date, s.id_card, s.status, 
                           s.disability_type_id, ddt.name AS disability_type_name, s.disability_level,
                           s.class_id, sc.name AS class_name, s.guardian_name, s.guardian_phone,
                           s.guardian_relation, s.photo_url, s.enrollment_date, s.created_at 
                    FROM students s 
                    LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id 
                    LEFT JOIN student_classes sc ON s.class_id = sc.id 
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY s.' . $sortField . ' ' . $sortOrder . ' LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('students', $scope['type'], $total);

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
    // GET /api/students/get - Get single student detail
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 安全修复(P0-2)：单条学生档案读取必须校验数据范围
        requireStudentInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT s.*, ddt.name AS disability_type_name, sc.name AS class_name 
                 FROM students s 
                 LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id 
                 LEFT JOIN student_classes sc ON s.class_id = sc.id 
                 WHERE s.id = ? AND s.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$id]);
            $student = $stmt->fetch();

            if (!$student) {
                jsonResponse(['success' => false, 'message' => '学生不存在']);
            }

            // Get attachments
            $attStmt = $pdo->prepare(
                'SELECT id, file_name, file_path, file_size, file_type, category, 
                        description, is_confidential, uploaded_by, created_at 
                 FROM student_attachments 
                 WHERE student_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
            );
            $attStmt->execute([$id]);
            $student['attachments'] = $attStmt->fetchAll();

            // Get linked parents
            $parStmt = $pdo->prepare(
                'SELECT p.id, p.name, p.phone, p.relation, p.email, sp.is_primary, sp.can_sign 
                 FROM parents p 
                 INNER JOIN student_parents sp ON p.id = sp.parent_id 
                 WHERE sp.student_id = ? AND p.deleted_at IS NULL'
            );
            $parStmt->execute([$id]);
            $student['parents'] = $parStmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $student, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/students/create - Create student
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('student_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $name = isset($input['name']) ? trim($input['name']) : '';
        if (empty($name)) {
            jsonResponse(['success' => false, 'message' => '学生姓名不能为空']);
        }

        // 安全修复(P0)：创建学生时必须校验班级在数据范围内，禁止跨班创建档案
        $classId = isset($input['class_id']) ? intval($input['class_id']) : 0;
        if ($classId > 0) {
            requireClassInScope($classId);
        }

        $fields = [
            'name', 'gender', 'birth_date', 'id_card', 'disability_type_id',
            'disability_level', 'disability_card_no', 'class_id', 'guardian_name',
            'guardian_phone', 'guardian_relation', 'emergency_contact',
            'emergency_phone', 'address', 'health_info', 'allergy_info',
            'medication_info', 'photo_url', 'enrollment_date', 'remarks'
        ];

        $placeholders = [];
        $values = [];

        foreach ($fields as $field) {
            if (isset($input[$field])) {
                $placeholders[] = $field;
                $val = trim($input[$field]);
                $values[] = $val === '' ? null : $val;
            }
        }

        if (empty($placeholders)) {
            jsonResponse(['success' => false, 'message' => '没有有效字段']);
        }

        try {
            $pdo = getDB();
            $sql = 'INSERT INTO students (' . implode(', ', $placeholders) . ', created_at, updated_at) 
                    VALUES (' . implode(', ', array_fill(0, count($placeholders), '?')) . ', NOW(), NOW())';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);

            $studentId = $pdo->lastInsertId();

            auditLog('create', 'students', 'student', intval($studentId), $name, null, null, '创建学生档案');

            jsonResponse(['success' => true, 'data' => ['id' => $studentId], 'message' => '创建成功']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                jsonResponse(['success' => false, 'message' => '身份证号已存在']);
            }
            jsonResponse(['success' => false, 'message' => '创建失败']);
        }
        break;

    // ============================================================
    // POST /api/students/update - Update student
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('student_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 安全修复(P0-2)：写操作前必须校验数据范围，禁止跨班篡改学生档案
        requireStudentInScope($id);

        $updatableFields = [
            'name', 'gender', 'birth_date', 'id_card', 'disability_type_id',
            'disability_level', 'disability_card_no', 'class_id', 'guardian_name',
            'guardian_phone', 'guardian_relation', 'emergency_contact',
            'emergency_phone', 'address', 'health_info', 'allergy_info',
            'medication_info', 'photo_url', 'status', 'enrollment_date',
            'graduation_date', 'remarks'
        ];

        $updates = [];
        $values = [];

        foreach ($updatableFields as $field) {
            if (isset($input[$field])) {
                $updates[] = $field . ' = ?';
                $val = trim($input[$field]);
                $values[] = $val === '' ? null : $val;
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE students SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'students', 'student', $id, '', null, null, '更新学生档案');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                jsonResponse(['success' => false, 'message' => '身份证号已存在']);
            }
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/students/delete - Soft delete student
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('student_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 安全修复(P0-2)：删除操作同样受数据范围约束
        requireStudentInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE students SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$id]);

            auditLog('delete', 'students', 'student', $id, '', null, null, '删除学生档案');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // GET /api/students/classes - Class list
    // ============================================================
    case 'classes':
        requireAuth();

        try {
            $pdo = getDB();
            $stmt = $pdo->query(
                'SELECT sc.id, sc.name, sc.grade, sc.capacity, sc.teacher_id, 
                        sc.assistant_teacher_id, u.real_name AS teacher_name, 
                        sc.description, sc.is_active,
                        (SELECT COUNT(*) FROM students WHERE class_id = sc.id AND deleted_at IS NULL AND status = "在读") AS student_count 
                 FROM student_classes sc 
                 LEFT JOIN users u ON sc.teacher_id = u.id 
                 WHERE sc.is_active = 1 AND sc.deleted_at IS NULL
                 ORDER BY sc.grade, sc.name'
            );
            $classes = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $classes, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/students/class_create - Create class
    // 补齐说明：原后端只提供 /students/classes 只读查询，
    // 前端「班级管理」的增删改此前仅改本地状态，刷新即丢失。
    // ============================================================
    case 'class_create':
        requireAuth();
        requirePermission('student_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $name = isset($input['name']) ? trim($input['name']) : '';
        if ($name === '') {
            jsonResponse(['success' => false, 'message' => '班级名称不能为空']);
        }

        $grade = isset($input['grade']) ? trim($input['grade']) : '';
        $teacherId = isset($input['teacher_id']) && intval($input['teacher_id']) > 0
            ? intval($input['teacher_id']) : null;
        $assistantId = isset($input['assistant_teacher_id']) && intval($input['assistant_teacher_id']) > 0
            ? intval($input['assistant_teacher_id']) : null;
        $capacity = isset($input['capacity']) && intval($input['capacity']) > 0
            ? intval($input['capacity']) : 12;
        $description = isset($input['description']) ? trim($input['description']) : '';

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO student_classes
                    (name, grade, teacher_id, assistant_teacher_id, capacity, description, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())'
            );
            $stmt->execute([$name, $grade !== '' ? $grade : null, $teacherId, $assistantId, $capacity,
                $description !== '' ? $description : null]);
            $classId = intval($pdo->lastInsertId());

            auditLog('create', 'students', 'class', $classId, $name, null, null, '创建班级');

            jsonResponse(['success' => true, 'data' => ['id' => $classId], 'message' => '创建成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '创建失败']);
        }
        break;

    // ============================================================
    // POST /api/students/class_update - Update class
    // ============================================================
    case 'class_update':
        requireAuth();
        requirePermission('student_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        $updatable = ['name', 'grade', 'teacher_id', 'assistant_teacher_id', 'capacity', 'description', 'is_active'];
        $updates = [];
        $values = [];

        foreach ($updatable as $field) {
            if (!array_key_exists($field, $input)) {
                continue;
            }
            $raw = $input[$field];
            if (in_array($field, ['teacher_id', 'assistant_teacher_id', 'capacity'], true)) {
                $val = (is_numeric($raw) && intval($raw) > 0) ? intval($raw) : null;
            } elseif ($field === 'is_active') {
                $val = (intval($raw) === 1) ? 1 : 0;
            } else {
                $val = trim((string) $raw);
                if ($val === '') {
                    $val = null;
                }
            }
            $updates[] = $field . ' = ?';
            $values[] = $val;
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'UPDATE student_classes SET ' . implode(', ', $updates) . ', updated_at = NOW()
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute($values);

            auditLog('update', 'students', 'class', $id, '', null, null, '更新班级信息');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/students/class_delete - Soft delete class
    // 保护规则：班级下仍存在在读学生时拒绝删除，避免出现无归属学生。
    // ============================================================
    case 'class_delete':
        requireAuth();
        requirePermission('student_edit');

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
            $cntStmt = $pdo->prepare(
                'SELECT COUNT(*) FROM students WHERE class_id = ? AND deleted_at IS NULL'
            );
            $cntStmt->execute([$id]);
            if (intval($cntStmt->fetchColumn()) > 0) {
                jsonResponse(['success' => false, 'message' => '该班级下仍有学生，请先转移学生后再删除']);
            }

            $stmt = $pdo->prepare(
                'UPDATE student_classes SET is_active = 0, deleted_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$id]);

            auditLog('delete', 'students', 'class', $id, '', null, null, '删除班级');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // GET /api/students/options - Student dropdown options
    // ============================================================
    case 'options':
        requireAuth();

        try {
            $pdo = getDB();
            $status = isset($_GET['status']) ? trim($_GET['status']) : '在读';
            $params = [];
            $where = 's.deleted_at IS NULL';
            if ($status) {
                $where .= ' AND s.status = ?';
                $params[] = $status;
            }

            $stmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, sc.name AS class_name 
                 FROM students s 
                 LEFT JOIN student_classes sc ON s.class_id = sc.id 
                 WHERE ' . $where . ' ORDER BY s.name'
            );
            $stmt->execute($params);
            $options = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $options, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/students/export - Export students (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('student_export');

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format]);
        }

        try {
            $pdo = getDB();

            // 与 list 相同的过滤参数
            $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
            $classId = isset($_GET['class_id']) ? intval($_GET['class_id']) : 0;
            $status = isset($_GET['status']) ? trim($_GET['status']) : '';
            $disabilityTypeId = isset($_GET['disability_type_id']) ? intval($_GET['disability_type_id']) : 0;

            $where = ['s.deleted_at IS NULL'];
            $params = [];
            if (!empty($keyword)) {
                $where[] = '(s.name LIKE ? OR s.id_card LIKE ? OR s.guardian_phone LIKE ?)';
                $likeKeyword = '%' . $keyword . '%';
                $params[] = $likeKeyword; $params[] = $likeKeyword; $params[] = $likeKeyword;
            }
            if ($classId > 0) { $where[] = 's.class_id = ?'; $params[] = $classId; }
            if (!empty($status)) { $where[] = 's.status = ?'; $params[] = $status; }
            if ($disabilityTypeId > 0) { $where[] = 's.disability_type_id = ?'; $params[] = $disabilityTypeId; }
            // 按中文障碍类型名过滤（与前端筛选一致）
            $disabilityType = isset($_GET['disability_type']) ? trim($_GET['disability_type']) : '';
            if (!empty($disabilityType)) { $where[] = 's.disability_type = ?'; $params[] = $disabilityType; }

            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（fail-closed），与 list 一致
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                } else { $scopeClause = ' AND s.id = -1'; }
            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "s.id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) { $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')'; }
                else { $scopeClause = ' AND s.id = -1'; }
            } elseif ($scope['type'] === 'parent') {
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND s.id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
                } else { $scopeClause = ' AND s.id = -1'; }
            } elseif ($scope['type'] === 'viewer' || $scope['type'] === 'none') {
                $scopeClause = ' AND s.id = -1';
            }

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT s.name, s.gender, s.birth_date, s.id_card, s.status,
                           ddt.name AS disability_type_name, s.disability_level,
                           sc.name AS class_name, s.guardian_name, s.guardian_phone,
                           s.guardian_relation, s.address, s.enrollment_date, s.created_at
                    FROM students s
                    LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id
                    LEFT JOIN student_classes sc ON s.class_id = sc.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY s.created_at DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $data = $stmt->fetchAll();

            logDataScopeAccess('students', $scope['type'], count($data));

            $headers = ['姓名', '性别', '出生日期', '身份证号', '学籍状态', '障碍类型', '障碍等级', '班级', '监护人', '监护人电话', '监护人关系', '联系地址', '入学日期', '创建时间'];
            $rows = array_map(function ($r) {
                return [
                    $r['name'] ?? '', $r['gender'] ?? '', $r['birth_date'] ?? '', $r['id_card'] ?? '',
                    $r['status'] ?? '', $r['disability_type_name'] ?? '', $r['disability_level'] ?? '',
                    $r['class_name'] ?? '', $r['guardian_name'] ?? '', $r['guardian_phone'] ?? '',
                    $r['guardian_relation'] ?? '', $r['address'] ?? '', $r['enrollment_date'] ?? '',
                    $r['created_at'] ?? '',
                ];
            }, $data);

            io_download($format, '学生列表', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败']);
        }
        break;

    // ============================================================
    // POST /api/students/import - Import students (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('student_import');

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
            '姓名'         => ['field' => 'name', 'required' => true],
            '性别'         => ['field' => 'gender', 'required' => false],
            '出生日期'     => ['field' => 'birth_date', 'required' => false],
            '身份证号'     => ['field' => 'id_card', 'required' => false],
            '学籍状态'     => ['field' => 'status', 'required' => false],
            '障碍类型'     => ['field' => 'disability_type_name', 'required' => false],
            '障碍等级'     => ['field' => 'disability_level', 'required' => false],
            '班级'         => ['field' => 'class_name', 'required' => false],
            '监护人'       => ['field' => 'guardian_name', 'required' => false],
            '监护人电话'   => ['field' => 'guardian_phone', 'required' => false],
            '监护人关系'   => ['field' => 'guardian_relation', 'required' => false],
            '联系地址'     => ['field' => 'address', 'required' => false],
            '入学日期'     => ['field' => 'enrollment_date', 'required' => false],
            '备注'         => ['field' => 'remarks', 'required' => false],
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
        $scope = getDataScope();

        $validStatuses = ['在读', '休学', '毕业', '转衔'];

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['name']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：姓名为空，已跳过";
                continue;
            }

            // 班级名 → class_id（可选）
            $classId = 0;
            if ($data['class_name'] !== '') {
                $classId = io_lookup_class_by_name($pdo, $data['class_name']);
                if ($classId <= 0) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：班级「" . $data['class_name'] . "」不存在，已跳过";
                    continue;
                }
                // 班级范围校验（fail-closed，逐行跳过而非中断整批）
                $inScope = ($scope['type'] === 'all');
                if (!$inScope && in_array($scope['type'], ['class_teacher', 'teacher'], true)) {
                    $classIds = array_map('intval', $scope['class_ids'] ?? []);
                    $inScope = in_array($classId, $classIds, true);
                }
                if (!$inScope) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：班级「" . $data['class_name'] . "」超出数据范围，已跳过";
                    continue;
                }
            }

            // 障碍类型名称 → id（可选）
            $disabilityTypeId = 0;
            if ($data['disability_type_name'] !== '') {
                $disabilityTypeId = io_lookup_disability_by_name($pdo, $data['disability_type_name']);
                if ($disabilityTypeId <= 0) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：障碍类型「" . $data['disability_type_name'] . "」不存在，已跳过";
                    continue;
                }
            }

            // 日期校验
            $birthDate = io_normalize_date($data['birth_date']);
            $enrollDate = io_normalize_date($data['enrollment_date']);
            if ($birthDate === false || $enrollDate === false) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：日期格式错误（应为 YYYY-MM-DD）";
                continue;
            }
            $status = $data['status'] !== '' ? $data['status'] : '在读';
            if (!in_array($status, $validStatuses, true)) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学籍状态「" . $status . "」非法（在读/休学/毕业/转衔）";
                continue;
            }

            $gender = $data['gender'] !== '' ? $data['gender'] : '男';
            if (!in_array($gender, ['男', '女'], true)) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：性别「" . $gender . "」非法（男/女）";
                continue;
            }

            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO students (name, gender, birth_date, id_card, disability_type_id, disability_level,
                     class_id, guardian_name, guardian_phone, guardian_relation, address, enrollment_date, remarks, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
                );
                $stmt->execute([
                    $data['name'],
                    $gender,
                    $birthDate,
                    $data['id_card'] !== '' ? $data['id_card'] : null,
                    $disabilityTypeId > 0 ? $disabilityTypeId : null,
                    $data['disability_level'] !== '' ? $data['disability_level'] : null,
                    $classId > 0 ? $classId : null,
                    $data['guardian_name'] !== '' ? $data['guardian_name'] : null,
                    $data['guardian_phone'] !== '' ? $data['guardian_phone'] : null,
                    $data['guardian_relation'] !== '' ? $data['guardian_relation'] : null,
                    $data['address'] !== '' ? $data['address'] : null,
                    $enrollDate,
                    $data['remarks'] !== '' ? $data['remarks'] : null,
                    $status,
                ]);
                auditLog('import', 'students', 'student', intval($pdo->lastInsertId()), $data['name'], null, null, '批量导入学生');
                $inserted++;
            } catch (Throwable $e) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：" . (($e instanceof PDOException && $e->getCode() == 23000) ? '身份证号重复或数据冲突' : '导入失败');
            }
        }

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条"
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的学生管理操作: ' . $action]);
}
