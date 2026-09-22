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
            // 重构（P0-2 根因治理）：范围条件原为逐文件复制粘贴，漏抄一处即全量泄露。
            // 现统一调用 applyStudentScope()，与 options / export 共用同一实现。
            $scope = getDataScope();
            [$scopeSql, $scopeParams] = applyStudentScope('s');
            $scopeClause = ' AND ' . $scopeSql;


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

            // 安全修复(P0-6)：无 student_view_sensitive 权限者（如只读督导账号）
            // 不得获取学生身份证号、监护人姓名与电话的明文
            $list = maskStudentList($list);

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

            // 安全修复(P0-6)：详情页含身份证、监护人电话、住址等全量敏感字段，
            // 无 student_view_sensitive 权限者（只读督导 / 越权家长）一律脱敏
            if (!canViewSensitiveStudent($id)) {
                $student = maskStudentSensitive($student);
                // 关联家长的联系信息同样脱敏
                foreach ($student['parents'] as &$p) {
                    if (isset($p['phone']) && $p['phone'] !== '') {
                        $p['phone'] = substr($p['phone'], 0, 3) . '****' . substr($p['phone'], -4);
                    }
                    if (isset($p['email']) && $p['email'] !== '') {
                        $p['email'] = '[敏感信息已脱敏]';
                    }
                }
                unset($p);
            }

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

        // 安全修复(P0-3)：改写班级前必须校验该班级在数据范围内。
        // 原实现只校验 student_edit 功能权限，班主任即可把任意非本班班级的
        // teacher_id 改成自己 —— 一次请求即可永久扩大自己的数据范围，
        // 形成「自我扩权闭环」。实测 teacher1 成功改写班级 2。
        requireClassInScope($id);

        $updatable = ['name', 'grade', 'teacher_id', 'assistant_teacher_id', 'capacity', 'description', 'is_active'];
        $updates = [];
        $values = [];

        // 加固：变更班主任/配班教师归属属于人事调整，需 class_manage 权限，
        // 不能由仅具 student_edit 的班主任自行操作（防止二次扩权）。
        if ((array_key_exists('teacher_id', $input) || array_key_exists('assistant_teacher_id', $input))
            && !checkPermission('class_manage')) {
            jsonResponse([
                'success' => false,
                'message' => '无权变更班级班主任/配班教师归属：缺少权限 class_manage',
                'code' => 403
            ], 403);
        }

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

        // 安全修复(P0-3)：删除班级前必须校验该班级在数据范围内，
        // 否则班主任可删除任意非本班班级（实测成功）。
        requireClassInScope($id);

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

            // 安全修复(P0-2)：下拉数据源此前完全没有数据范围过滤，
            // 家长仅能看到 1 名自己的孩子，却可通过本端点拿到全校 19 名
            // 残障儿童的姓名与班级。现统一复用 applyStudentScope()。
            [$scopeSql, $scopeParams] = applyStudentScope('s');
            $where .= ' AND ' . $scopeSql;
            $params = array_merge($params, $scopeParams);

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
            // 修复(P1-5)：原写法 s.disability_type = ? 引用了不存在的列（students 表只有
            // disability_type_id 外键），一旦传入该参数整个导出必然 500。改为按字典表名称关联过滤。
            $disabilityType = isset($_GET['disability_type']) ? trim($_GET['disability_type']) : '';
            if (!empty($disabilityType)) { $where[] = 'ddt.name = ?'; $params[] = $disabilityType; }

            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（fail-closed），与 list / options 统一复用同一实现
            $scope = getDataScope();
            [$scopeSql, $scopeParams] = applyStudentScope('s');
            $scopeClause = ' AND ' . $scopeSql;

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT s.id, s.name, s.gender, s.birth_date, s.id_card, s.status,
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

            // 安全修复(P0-6)：导出是敏感信息批量外泄的最大出口。
            // 只读督导账号具备 student_export 权限但无 student_view_sensitive，
            // 导出的身份证号 / 监护人电话 / 住址一律脱敏。
            $data = maskStudentList($data);

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

        // 修复(P2-4)：导入既无行数上限也无事务，10MB CSV（约 10 万行）逐行
        // SELECT+INSERT 既是 DoS 面也是脏数据面。此处设 5000 行硬上限。
        if (count($parsed['rows']) > 5000) {
            jsonResponse([
                'success' => false,
                'message' => '单次导入最多 5000 行，当前 ' . count($parsed['rows']) . ' 行，请分批导入',
                'code' => 400
            ], 400);
        }

        $pdo = getDB();
        $inserted = 0;
        $failed = 0;
        $errors = [];
        $scope = getDataScope();

        $validStatuses = ['在读', '休学', '毕业', '转衔'];

        // 修复(P2-4续)：整批包事务——中途异常整体回滚，不再留下半批脏数据；
        // 单行数据问题仍按行跳过（保留原有部分导入语义），但不提交任何半途状态。
        $pdo->beginTransaction();

        // 修复(P2-4续)：批次内身份证号去重 + 校验位校验
        $seenIdCards = [];
        try {
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

            // 修复(P2-4续)：身份证号校验——18 位格式 + GB 11643 校验位；
            // 批次内重复的身份证号直接跳过，防止一次导入制造多条重复档案。
            if ($data['id_card'] !== '') {
                $idCard = strtoupper(trim($data['id_card']));
                if (!preg_match('/^\d{17}[\dX]$/', $idCard)) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：身份证号「" . $data['id_card'] . "」格式错误（应为 18 位）";
                    continue;
                }
                $sum = 0;
                $weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
                $checkMap = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
                for ($i = 0; $i < 17; $i++) {
                    $sum += intval($idCard[$i]) * $weights[$i];
                }
                if ($checkMap[$sum % 11] !== $idCard[17]) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：身份证号「" . $data['id_card'] . "」校验位错误";
                    continue;
                }
                if (isset($seenIdCards[$idCard])) {
                    $failed++;
                    $errors[] = "第 " . ($lineNo + 2) . " 行：身份证号与本批次第 " . $seenIdCards[$idCard] . " 行重复，已跳过";
                    continue;
                }
                $seenIdCards[$idCard] = $lineNo + 2;
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

        // 整批提交（修复 P2-4：中途异常在 catch 中整体回滚）
        $pdo->commit();
        } catch (Throwable $batchError) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            error_log('students/import batch error: ' . $batchError->getMessage());
            jsonResponse(['success' => false, 'message' => '导入过程中发生异常，本批数据已整体回滚', 'code' => 500], 500);
        }

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条"
        ]);
        break;

    // ============================================================
    // 6.3 GET /api/students/disability_levels - 国家残疾分级字典
    // ============================================================
    case 'disability_levels':
        requireAuth();

        try {
            $pdo  = getDB();
            $stmt = $pdo->query(
                'SELECT id, code, name, degree, description FROM dict_disability_levels
                 WHERE is_active = 1 ORDER BY sort_order, id'
            );
            jsonResponse(['success' => true, 'data' => $stmt->fetchAll(), 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('students/disability_levels error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.4 GET /api/students/safety - 教学现场安全档案
    // ============================================================
    case 'safety':
        requireAuth();
        requirePermission('student_view');

        $sid = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        requireStudentInScope($sid);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare('SELECT * FROM student_safety_profiles WHERE student_id = ? AND deleted_at IS NULL LIMIT 1');
            $stmt->execute([$sid]);
            $row = $stmt->fetch();
            jsonResponse(['success' => true, 'data' => $row ?: null, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('students/safety error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.4 POST /api/students/safety_save - 保存安全档案
    // ============================================================
    case 'safety_save':
        requireAuth();
        requirePermission('student_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $user  = getCurrentUser();
        $sid   = isset($input['student_id']) ? intval($input['student_id']) : 0;
        requireStudentInScope($sid);

        if (!$sid) {
            jsonResponse(['success' => false, 'message' => '学生ID不能为空', 'code' => 400], 400);
        }

        // 枚举类字段白名单校验：避免非法值入库后被直接 JSON 吐给前端
        $diet = $input['diet_texture'] ?? null;
        if ($diet !== null && !in_array($diet, ['普食', '软食', '糊状', '流质', '鼻饲', '其他'], true)) {
            jsonResponse(['success' => false, 'message' => '饮食性状取值非法', 'code' => 400], 400);
        }
        $wandering = $input['wandering_risk'] ?? null;
        if ($wandering !== null && !in_array($wandering, ['none', 'low', 'medium', 'high'], true)) {
            jsonResponse(['success' => false, 'message' => '走失风险取值非法', 'code' => 400], 400);
        }
        $toilet = $input['toilet_independence'] ?? null;
        if ($toilet !== null && !in_array($toilet, ['independent', 'verbal_prompt', 'physical_prompt', 'full_assistance'], true)) {
            jsonResponse(['success' => false, 'message' => '如厕依赖等级取值非法', 'code' => 400], 400);
        }
        $supervision = $input['supervision_level'] ?? null;
        if ($supervision !== null && !in_array($supervision, ['独立活动', '视线监护', '一对一陪护'], true)) {
            jsonResponse(['success' => false, 'message' => '看护等级取值非法', 'code' => 400], 400);
        }
        $allergens = null;
        if (isset($input['allergens'])) {
            $allergens = is_array($input['allergens'])
                ? json_encode(array_values($input['allergens']), JSON_UNESCAPED_UNICODE)
                : $input['allergens'];
        }

        try {
            $pdo = getDB();
            $chk = $pdo->prepare('SELECT id FROM student_safety_profiles WHERE student_id = ? AND deleted_at IS NULL LIMIT 1');
            $chk->execute([$sid]);
            $exists = intval($chk->fetchColumn());

            if ($exists > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE student_safety_profiles SET
                        has_epilepsy = ?, seizure_type = ?, seizure_first_aid = ?, rescue_medication = ?,
                        allergens = ?, allergy_reaction = ?, anaphylaxis_action = ?, epipen_location = ?,
                        diet_texture = ?, swallowing_precaution = ?, food_taboo = ?,
                        aggression_trigger = ?, deescalation = ?, crisis_procedure = ?, prohibited_response = ?,
                        wandering_risk = ?, wandering_response = ?, toilet_independence = ?, mobility_aid = ?,
                        supervision_level = ?, emergency_updated_at = NOW(), updated_by = ?, updated_at = NOW()
                     WHERE id = ?'
                );
                $stmt->execute([
                    !empty($input['has_epilepsy']) ? 1 : 0,
                    $input['seizure_type'] ?? null, $input['seizure_first_aid'] ?? null, $input['rescue_medication'] ?? null,
                    $allergens, $input['allergy_reaction'] ?? null, $input['anaphylaxis_action'] ?? null, $input['epipen_location'] ?? null,
                    $diet, $input['swallowing_precaution'] ?? null, $input['food_taboo'] ?? null,
                    $input['aggression_trigger'] ?? null, $input['deescalation'] ?? null,
                    $input['crisis_procedure'] ?? null, $input['prohibited_response'] ?? null,
                    $wandering, $input['wandering_response'] ?? null, $toilet,
                    $input['mobility_aid'] ?? null, $supervision,
                    intval($user['sub'] ?? 0) ?: null, $exists
                ]);
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO student_safety_profiles
                     (student_id, has_epilepsy, seizure_type, seizure_first_aid, rescue_medication,
                      allergens, allergy_reaction, anaphylaxis_action, epipen_location,
                      diet_texture, swallowing_precaution, food_taboo,
                      aggression_trigger, deescalation, crisis_procedure, prohibited_response,
                      wandering_risk, wandering_response, toilet_independence, mobility_aid,
                      supervision_level, emergency_updated_at, updated_by)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)'
                );
                $stmt->execute([
                    $sid,
                    !empty($input['has_epilepsy']) ? 1 : 0,
                    $input['seizure_type'] ?? null, $input['seizure_first_aid'] ?? null, $input['rescue_medication'] ?? null,
                    $allergens, $input['allergy_reaction'] ?? null, $input['anaphylaxis_action'] ?? null, $input['epipen_location'] ?? null,
                    $diet, $input['swallowing_precaution'] ?? null, $input['food_taboo'] ?? null,
                    $input['aggression_trigger'] ?? null, $input['deescalation'] ?? null,
                    $input['crisis_procedure'] ?? null, $input['prohibited_response'] ?? null,
                    $wandering, $input['wandering_response'] ?? null, $toilet,
                    $input['mobility_aid'] ?? null, $supervision,
                    intval($user['sub'] ?? 0) ?: null
                ]);
            }

            auditLog('safety_save', 'students', 'student_safety_profile', $sid, '', null, null, '保存学生安全档案');

            jsonResponse(['success' => true, 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('students/safety_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.4 GET /api/students/emergency_card - 紧急情况一览卡（可直接打印的一页纸）
    // ============================================================
    case 'emergency_card':
        requireAuth();
        requirePermission('student_view');

        $sid = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        requireStudentInScope($sid);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, s.birth_date, sc.name AS class_name,
                        ddt.name AS disability_type_name, dl.name AS disability_level_name,
                        s.guardian_name, s.guardian_phone, s.emergency_contact, s.emergency_phone,
                        s.communication_methods, s.communication_notes, s.aac_device,
                        s.receptive_level, s.expressive_level,
                        p.has_epilepsy, p.seizure_type, p.seizure_first_aid, p.rescue_medication,
                        p.allergens, p.allergy_reaction, p.anaphylaxis_action, p.epipen_location,
                        p.diet_texture, p.swallowing_precaution, p.food_taboo,
                        p.aggression_trigger, p.deescalation, p.crisis_procedure, p.prohibited_response,
                        p.wandering_risk, p.wandering_response, p.toilet_independence,
                        p.mobility_aid, p.supervision_level, p.emergency_updated_at
                 FROM students s
                 LEFT JOIN student_classes sc        ON s.class_id = sc.id
                 LEFT JOIN dict_disability_types ddt ON s.disability_type_id = ddt.id
                 LEFT JOIN dict_disability_levels dl ON s.disability_level_id = dl.id
                 LEFT JOIN student_safety_profiles p ON p.student_id = s.id AND p.deleted_at IS NULL
                 WHERE s.id = ? AND s.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$sid]);
            $row = $stmt->fetch();
            if (!$row) {
                jsonResponse(['success' => false, 'message' => '学生不存在', 'code' => 404], 404);
            }

            // 一览卡含癫痫/过敏/危机处置等高度敏感内容：无权查看敏感字段者，
            // 监护人联系方式一并脱敏。代课教师拿这张卡是为了救命，
            // 但不必同时拿到家长的家庭住址与证件号。
            if (!canViewSensitiveStudent($sid)) {
                $row = maskStudentSensitive($row);
                unset($row['address'], $row['id_card'], $row['disability_card_no']);
            }

            jsonResponse(['success' => true, 'data' => $row, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('students/emergency_card error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.5 GET /api/students/communication - 沟通方式档案
    // ============================================================
    case 'communication':
        requireAuth();
        requirePermission('student_view');

        $sid = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        requireStudentInScope($sid);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, name, communication_methods, communication_notes, aac_device,
                        receptive_level, expressive_level
                 FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$sid]);
            $row = $stmt->fetch();
            if ($row && $row['communication_methods']) {
                $decoded = json_decode($row['communication_methods'], true);
                $row['communication_methods'] = is_array($decoded) ? $decoded : [$row['communication_methods']];
            }
            jsonResponse(['success' => true, 'data' => $row ?: null, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('students/communication error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.5 POST /api/students/communication_save - 保存沟通方式档案
    // ============================================================
    case 'communication_save':
        requireAuth();
        requirePermission('student_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $sid   = isset($input['student_id']) ? intval($input['student_id']) : 0;
        requireStudentInScope($sid);

        if (!$sid) {
            jsonResponse(['success' => false, 'message' => '学生ID不能为空', 'code' => 400], 400);
        }

        // 取值必须来自 dict_common.communication_method，杜绝自由字符串污染统计口径
        $methods = $input['communication_methods'] ?? null;
        if ($methods !== null) {
            if (is_string($methods)) {
                $maybe   = json_decode($methods, true);
                $methods = is_array($maybe) ? $maybe : [$methods];
            }
            if (!is_array($methods)) {
                jsonResponse(['success' => false, 'message' => '沟通方式格式错误', 'code' => 400], 400);
            }
            try {
                $pdo  = getDB();
                $dict = $pdo->query(
                    "SELECT code FROM dict_common WHERE category = 'communication_method' AND is_active = 1"
                )->fetchAll(PDO::FETCH_COLUMN);
                foreach ($methods as $m) {
                    if (!in_array($m, $dict, true)) {
                        jsonResponse(['success' => false, 'message' => '未知的沟通方式: ' . $m, 'code' => 400], 400);
                    }
                }
            } catch (PDOException $e) {
                error_log('students/communication_save dict error: ' . $e->getMessage());
                jsonResponse(['success' => false, 'message' => '字典校验失败', 'code' => 500], 500);
            }
            $methods = json_encode(array_values($methods), JSON_UNESCAPED_UNICODE);
        }

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'UPDATE students SET communication_methods = ?, communication_notes = ?,
                 aac_device = ?, receptive_level = ?, expressive_level = ?, updated_at = NOW()
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([
                $methods,
                $input['communication_notes'] ?? null,
                $input['aac_device'] ?? null,
                $input['receptive_level'] ?? null,
                $input['expressive_level'] ?? null,
                $sid
            ]);

            auditLog('communication_save', 'students', 'student', $sid, '', null, null, '保存沟通方式档案');

            jsonResponse(['success' => true, 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('students/communication_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的学生管理操作: ' . $action]);
}
