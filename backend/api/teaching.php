<?php
/**
 * Teaching Records Module - Teaching Record Endpoints
 * 
 * Endpoints:
 *   GET  /api/teaching/list           - Teaching records list
 *   GET  /api/teaching/get            - Get teaching record detail
 *   POST /api/teaching/create         - Create record
 *   POST /api/teaching/update         - Update record
 *   POST /api/teaching/delete         - Delete record
 *   GET  /api/teaching/student_options - Student options
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/teaching/list - Teaching records list
    // ============================================================
    case 'list':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        $teacherId = isset($_GET['teacher_id']) ? intval($_GET['teacher_id']) : 0;
        $recordDate = isset($_GET['record_date']) ? trim($_GET['record_date']) : '';
        $isKeyRecord = isset($_GET['is_key_record']) ? intval($_GET['is_key_record']) : -1;

        try {
            $pdo = getDB();
            // 修复(P2-7)：软删学生的历史教学记录不再出现在列表里（防孤儿数据外泄）
            $where = ['tr.deleted_at IS NULL', 's.deleted_at IS NULL'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'tr.student_id = ?';
                $params[] = $studentId;
            }
            if ($teacherId > 0) {
                $where[] = 'tr.teacher_id = ?';
                $params[] = $teacherId;
            }
            if (!empty($recordDate)) {
                $where[] = 'tr.record_date = ?';
                $params[] = $recordDate;
            }
            if ($isKeyRecord >= 0) {
                $where[] = 'tr.is_key_record = ?';
                $params[] = $isKeyRecord;
            }

            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（ADR-009 统一核心 applyStudentKeyedScope；
            // teacher 分支的「本人经手」对教学记录即 tr.teacher_id）
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = applyStudentKeyedScope($scope, 'tr', ['owner_col' => 'tr.teacher_id']);

            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            // Count (join with students for scope filtering)
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM teaching_records tr LEFT JOIN students s ON tr.student_id = s.id WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            // Data
            $sql = 'SELECT tr.id, tr.student_id, s.name AS student_name, tr.teacher_id, u.real_name AS teacher_name,
                           tr.record_date, tr.session_type, tr.subject, tr.teaching_content, tr.student_performance,
                           tr.effectiveness_score, tr.duration_minutes, tr.is_key_record, tr.iep_goal_id,
                           ig.title AS iep_goal_title, tr.created_at
                    FROM teaching_records tr
                    LEFT JOIN students s ON tr.student_id = s.id
                    LEFT JOIN users u ON tr.teacher_id = u.id
                    LEFT JOIN iep_goals ig ON tr.iep_goal_id = ig.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY tr.record_date DESC LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('teaching', $scope['type'], $total);

            jsonResponse([
                'success' => true,
                'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
                'message' => '查询成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '查询失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/teaching/get - Get teaching record detail
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：防 IDOR 越权读取教学记录
        requireTeachingInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT tr.*, s.name AS student_name, u.real_name AS teacher_name, ig.title AS iep_goal_title
                 FROM teaching_records tr
                 LEFT JOIN students s ON tr.student_id = s.id
                 LEFT JOIN users u ON tr.teacher_id = u.id
                 LEFT JOIN iep_goals ig ON tr.iep_goal_id = ig.id
                 WHERE tr.id = ? AND tr.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$id]);
            $record = $stmt->fetch();

            if (!$record) {
                jsonResponse(['success' => false, 'message' => '教学记录不存在'], 404);
            }

            jsonResponse(['success' => true, 'data' => $record, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/teaching/create - Create teaching record
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('record_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $recordDate = isset($input['record_date']) ? trim($input['record_date']) : '';

        if ($studentId <= 0 || empty($recordDate)) {
            jsonResponse(['success' => false, 'message' => '学生ID和记录日期不能为空'], 400);
        }

        // 数据范围校验：禁止为范围外学生创建教学记录
        requireStudentInScope($studentId);

        $user = getCurrentUser();
        $teacherId = isset($user['sub']) ? intval($user['sub']) : 0;

        $fields = [
            'session_type', 'subject', 'teaching_content', 'teaching_method',
            'student_performance', 'difficulties', 'adjustments', 'materials_used',
            'homework', 'next_plan', 'effectiveness_score', 'duration_minutes',
            'is_key_record', 'iep_goal_id'
        ];

        $placeholders = ['teacher_id', 'student_id', 'record_date'];
        $values = [$teacherId, $studentId, $recordDate];

        foreach ($fields as $field) {
            $placeholders[] = $field;
            if (isset($input[$field])) {
                $val = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
                // 修复(探索实测 2026-10-13)：前端「快速记录」默认传 is_key_record=false，
                // PHP PDO 会把布尔 false 绑定成空字符串 ''，MySQL 8 严格模式下插入
                // tinyint 列报 1366 Incorrect integer value → 整个创建 500。
                // 表现：快速记录按默认值填写永远保存失败。布尔必须显式转 0/1。
                if (is_bool($val)) {
                    $val = $val ? 1 : 0;
                }
                $values[] = ($val === '' || $val === null) ? null : $val;
            } else {
                $values[] = null;
            }
        }

        try {
            $pdo = getDB();
            $sql = 'INSERT INTO teaching_records (' . implode(', ', $placeholders) . ', created_at, updated_at) 
                    VALUES (' . implode(', ', array_fill(0, count($placeholders), '?')) . ', NOW(), NOW())';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);

            $recordId = $pdo->lastInsertId();

            auditLog('create', 'teaching', 'teaching_record', intval($recordId), '', null, null, '创建教学记录');

            jsonResponse(['success' => true, 'data' => ['id' => $recordId], 'message' => '创建成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '创建失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/teaching/update - Update teaching record
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('record_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：禁止修改范围外教学记录
        requireTeachingInScope($id);

        $updatableFields = [
            'record_date', 'session_type', 'subject', 'teaching_content', 'teaching_method',
            'student_performance', 'difficulties', 'adjustments', 'materials_used',
            'homework', 'next_plan', 'effectiveness_score', 'duration_minutes',
            'is_key_record', 'iep_goal_id'
        ];

        $updates = [];
        $values = [];

        foreach ($updatableFields as $field) {
            if (isset($input[$field])) {
                $updates[] = $field . ' = ?';
                $val = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
                // 同 create：布尔 false 经 PDO 绑定成 ''，MySQL 8 严格模式插入 tinyint 报 1366 → 500
                if (is_bool($val)) {
                    $val = $val ? 1 : 0;
                }
                $values[] = ($val === '' || $val === null) ? null : $val;
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段'], 400);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE teaching_records SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'teaching', 'teaching_record', $id, '', null, null, '更新教学记录');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/teaching/delete - Delete teaching record
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('record_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：禁止删除范围外教学记录
        requireTeachingInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE teaching_records SET deleted_at = NOW() WHERE id = ?');
            $stmt->execute([$id]);

            auditLog('delete', 'teaching', 'teaching_record', $id, '', null, null, '删除教学记录');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/teaching/student_options - Student options
    // ============================================================
    case 'student_options':
        requireAuth();

        try {
            $pdo = getDB();

            // 安全修复(P0-2)：本端点原为无参数全表查询（$pdo->query 无任何 WHERE 范围条件），
            // 教师/家长均可通过它拿到全校 19 名残障儿童名单。
            // 现统一复用 applyStudentScope()，并改为参数化查询。
            [$scopeSql, $scopeParams] = applyStudentScope('s');
            $stmt = $pdo->prepare(
                'SELECT s.id, s.name, s.gender, sc.name AS class_name 
                 FROM students s 
                 LEFT JOIN student_classes sc ON s.class_id = sc.id 
                 WHERE s.deleted_at IS NULL AND s.status = ? AND ' . $scopeSql . ' ORDER BY s.name'
            );
            $stmt->execute(array_merge(['在读'], $scopeParams));
            $options = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $options, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/teaching/export - Export teaching records (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('record_export');

        // v15：导入模板下载（template=1）——仅输出表头，列名与 io_import_column_map 同源，
        // 保证「按模板填写 → 导入」不缺列。放在权限校验之后：下载模板同样受导出权限管控。
        if (isset($_GET['template']) && $_GET['template'] === '1') {
            io_download('csv', '教学记录导入模板', array_keys(io_import_column_map('teaching')), []);
        }

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format], 400);
        }

        try {
            $pdo = getDB();

            $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
            $sessionType = isset($_GET['session_type']) ? trim($_GET['session_type']) : '';
            $startDate = isset($_GET['start_date']) ? trim($_GET['start_date']) : '';
            $endDate = isset($_GET['end_date']) ? trim($_GET['end_date']) : '';

            // 修复(P2-7)：软删学生的历史教学记录不再出现在导出里（防孤儿数据外泄）
            $where = ['r.deleted_at IS NULL', 's.deleted_at IS NULL'];
            $params = [];
            if ($studentId > 0) { $where[] = 'r.student_id = ?'; $params[] = $studentId; }
            if (!empty($sessionType)) { $where[] = 'r.session_type = ?'; $params[] = $sessionType; }
            if (!empty($startDate)) { $where[] = 'r.record_date >= ?'; $params[] = $startDate; }
            if (!empty($endDate)) { $where[] = 'r.record_date <= ?'; $params[] = $endDate; }
            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（ADR-009 统一核心 applyStudentKeyedScope，与 list 同口径；
            // 导出表别名为 r，本人经手列 r.teacher_id）
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = applyStudentKeyedScope($scope, 'r', ['owner_col' => 'r.teacher_id']);

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT s.name AS student_name, r.record_date, r.session_type, r.subject,
                           r.teaching_content, r.teaching_method, r.student_performance, r.difficulties,
                           r.adjustments, r.materials_used, r.homework, r.next_plan,
                           r.effectiveness_score, r.duration_minutes, r.is_key_record
                    FROM teaching_records r
                    LEFT JOIN students s ON r.student_id = s.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY r.record_date DESC, r.id DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $data = $stmt->fetchAll();

            logDataScopeAccess('teaching', $scope['type'], count($data));

            $headers = ['学生姓名', '记录日期', '课型', '科目', '教学内容', '教学方法', '学生表现', '困难与调整', '使用材料', '作业', '下一步计划', '效果评分', '时长(分钟)', '是否重点记录'];
            $rows = array_map(function ($r) {
                return [
                    $r['student_name'] ?? '', $r['record_date'] ?? '', $r['session_type'] ?? '',
                    $r['subject'] ?? '', $r['teaching_content'] ?? '', $r['teaching_method'] ?? '',
                    $r['student_performance'] ?? '', $r['difficulties'] ?? '', $r['materials_used'] ?? '',
                    $r['homework'] ?? '', $r['next_plan'] ?? '', $r['effectiveness_score'] ?? '',
                    $r['duration_minutes'] ?? '', $r['is_key_record'] ? '是' : '否',
                ];
            }, $data);

            io_download($format, '教学记录', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/teaching/import - Import teaching records (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('record_import');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $filename = isset($_FILES['file']['name']) ? $_FILES['file']['name'] : '';
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $parsed = io_parse_upload(null, $ext);
        if ($parsed['error']) {
            jsonResponse(['success' => false, 'message' => $parsed['error']]);
        }

        // 列映射唯一数据源：io_import_column_map()（导出模板 template=1 同源，勿在此另写一份）
        $columnMap = io_import_column_map('teaching');

        $map = io_map_columns($parsed['header'], $columnMap);
        if (!empty($map['missing'])) {
            jsonResponse(['success' => false, 'message' => '缺少必需列: ' . implode('、', $map['missing'])], 400);
        }
        $colIndex = $map['colIndex'];

        $pdo = getDB();
        $inserted = 0;
        $failed = 0;
        $errors = [];
        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;
        $scope = getDataScope();

        $validSessionTypes = ['个别训练', '小组教学', '集体教学', '融合支持', '评估', '家校沟通', '其他'];

        // v15 预检（dry_run）：整批包事务，结尾 rollBack 不落库
        $dryRun = io_import_is_dry_run();
        $pdo->beginTransaction();

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['student_name']) === '' || trim($data['record_date']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生姓名与记录日期不能为空";
                continue;
            }

            $studentId = io_lookup_student_by_name($pdo, $data['student_name']);
            if ($studentId <= 0) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生「" . $data['student_name'] . "」不存在或姓名重复，已跳过";
                continue;
            }
            if (!isStudentInScope($studentId, $scope)) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生「" . $data['student_name'] . "」超出数据范围，已跳过";
                continue;
            }

            $recordDate = io_normalize_date($data['record_date']);
            if ($recordDate === false) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：记录日期格式错误（应为 YYYY-MM-DD）";
                continue;
            }

            $sessionType = $data['session_type'] !== '' ? $data['session_type'] : '个别训练';
            if (!in_array($sessionType, $validSessionTypes, true)) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：课型「" . $sessionType . "」非法";
                continue;
            }

            $score = $data['effectiveness_score'] !== '' ? intval($data['effectiveness_score']) : 0;
            $duration = $data['duration_minutes'] !== '' ? intval($data['duration_minutes']) : 0;
            $isKey = in_array(trim($data['is_key_record']), ['是', '1', 'true', 'Y', 'yes'], true) ? 1 : 0;

            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO teaching_records (student_id, teacher_id, record_date, session_type, subject,
                     teaching_content, teaching_method, student_performance, difficulties, adjustments, materials_used,
                     homework, next_plan, effectiveness_score, duration_minutes, is_key_record, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
                );
                $stmt->execute([
                    $studentId, $userId, $recordDate, $sessionType,
                    $data['subject'] !== '' ? $data['subject'] : null,
                    $data['teaching_content'] !== '' ? $data['teaching_content'] : null,
                    $data['teaching_method'] !== '' ? $data['teaching_method'] : null,
                    $data['student_performance'] !== '' ? $data['student_performance'] : null,
                    $data['difficulties'] !== '' ? $data['difficulties'] : null,
                    $data['difficulties'] !== '' ? $data['difficulties'] : null,
                    $data['materials_used'] !== '' ? $data['materials_used'] : null,
                    $data['homework'] !== '' ? $data['homework'] : null,
                    $data['next_plan'] !== '' ? $data['next_plan'] : null,
                    $score, $duration, $isKey,
                ]);
                auditLog('import', 'teaching', 'teaching_record', intval($pdo->lastInsertId()), $data['student_name'], null, null, '批量导入教学记录');
                $inserted++;
            } catch (Throwable $e) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：导入失败";
            }
        }

        // v15：预检报告（此时库中没有任何新数据）
        if ($dryRun) {
            $pdo->rollBack();
            io_import_dry_run_response('teaching', $inserted, $failed, $errors);
        }
        $pdo->commit();

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条"
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的教学记录操作: ' . $action], 404);
}
