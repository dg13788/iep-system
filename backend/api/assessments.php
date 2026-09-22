<?php
/**
 * Assessments Module - Assessment Management Endpoints
 * 
 * Endpoints:
 *   GET  /api/assessments/list          - Assessment list
 *   GET  /api/assessments/get           - Get assessment detail
 *   POST /api/assessments/create        - Create assessment with items
 *   POST /api/assessments/update        - Update assessment
 *   POST /api/assessments/delete        - Delete assessment
 *   GET  /api/assessments/templates     - Template list
 *   GET  /api/assessments/template_items - Get template items
 *   GET  /api/assessments/recommend_goals - Recommend goals
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/assessments/list - Assessment list
    // ============================================================
    case 'list':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        $assessmentType = isset($_GET['assessment_type']) ? trim($_GET['assessment_type']) : '';
        $status = isset($_GET['status']) ? trim($_GET['status']) : '';

        try {
            $pdo = getDB();
            // 修复(P2-7)：软删学生的历史评估不再出现在列表里（防孤儿数据外泄）
            $where = ['a.deleted_at IS NULL', 's.deleted_at IS NULL'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'a.student_id = ?';
                $params[] = $studentId;
            }
            if (!empty($assessmentType)) {
                $where[] = 'a.assessment_type = ?';
                $params[] = $assessmentType;
            }
            if (!empty($status)) {
                $where[] = 'a.status = ?';
                $params[] = $status;
            }

            $whereStr = implode(' AND ', $where);

            // Apply data scope filtering
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                // 安全修复(P0-2)：fail-closed，班级集合为空时拒绝而非放行全部
                if (empty($scope['class_ids'])) {
                    $scopeClause = ' AND a.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {

                $conditions = [];
                // Students in their classes
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                // Students whose IEP goals they manage
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "a.student_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) {
                    $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')';
                } else {
                    $scopeClause = ' AND a.id = -1'; // No access
                }
            } elseif ($scope['type'] === 'parent') {
                // 安全修复(P0-2)：fail-closed
                if (empty($scope['student_ids'])) {
                    $scopeClause = ' AND a.id = -1';
                } else {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND a.student_id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
                }
            } elseif ($scope['type'] === 'viewer') {
                $scopeClause = ' AND a.id = -1';
            } elseif ($scope['type'] === 'none') {
                // 安全加固：数据范围为 none 时一律拒绝
                $scopeClause = ' AND a.id = -1';
            }

            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            // Count (join with students for scope filtering)
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM assessments a LEFT JOIN students s ON a.student_id = s.id WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            // Data
            $sql = 'SELECT a.id, a.student_id, s.name AS student_name, a.assessor_id, u.real_name AS assessor_name,
                           a.assessment_date, a.assessment_type, a.total_score, a.max_score, a.score_percentage, a.status,
                           a.summary, a.recommendations, a.created_at
                    FROM assessments a
                    LEFT JOIN students s ON a.student_id = s.id
                    LEFT JOIN users u ON a.assessor_id = u.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY a.assessment_date DESC LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // Audit log
            logDataScopeAccess('assessments', $scope['type'], $total);

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
    // GET /api/assessments/get - Get assessment detail
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：防 IDOR 越权读取评估记录
        requireAssessmentInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT a.*, s.name AS student_name, u.real_name AS assessor_name 
                 FROM assessments a 
                 LEFT JOIN students s ON a.student_id = s.id 
                 LEFT JOIN users u ON a.assessor_id = u.id 
                 WHERE a.id = ? AND a.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$id]);
            $assessment = $stmt->fetch();

            if (!$assessment) {
                jsonResponse(['success' => false, 'message' => '评估记录不存在']);
            }

            // Get assessment items
            $itemStmt = $pdo->prepare(
                'SELECT id, dimension, item_name, item_description, score, max_score, score_level, notes, sort_order 
                 FROM assessment_items 
                 WHERE assessment_id = ? ORDER BY sort_order, id'
            );
            $itemStmt->execute([$id]);
            $assessment['items'] = $itemStmt->fetchAll();

            jsonResponse(['success' => true, 'data' => $assessment, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/assessments/create - Create assessment with items
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('eval_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $assessmentType = isset($input['assessment_type']) ? trim($input['assessment_type']) : '';

        if ($studentId <= 0 || empty($assessmentType)) {
            jsonResponse(['success' => false, 'message' => '学生ID和评估类型不能为空']);
        }

        // 数据范围校验：禁止为范围外学生创建评估
        requireStudentInScope($studentId);

        $user = getCurrentUser();
        $assessorId = isset($user['sub']) ? intval($user['sub']) : 0;

        $totalScore = isset($input['total_score']) ? intval($input['total_score']) : 0;
        $maxScore = isset($input['max_score']) ? intval($input['max_score']) : 0;
        $scorePercentage = $maxScore > 0 ? round(($totalScore / $maxScore) * 100, 2) : 0.00;
        $assessmentDate = isset($input['date']) ? $input['date'] : date('Y-m-d');
        $summary = isset($input['summary']) ? trim($input['summary']) : '';
        $recommendations = isset($input['recommendations']) ? trim($input['recommendations']) : '';
        $templateId = isset($input['template_id']) ? intval($input['template_id']) : null;

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Insert main assessment record
            $stmt = $pdo->prepare(
                'INSERT INTO assessments (student_id, template_id, assessor_id, assessment_date, 
                 assessment_type, total_score, max_score, score_percentage, summary, recommendations, 
                 status, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", NOW(), NOW())'
            );
            $stmt->execute([
                $studentId, $templateId, $assessorId, $assessmentDate,
                $assessmentType, $totalScore, $maxScore, $scorePercentage,
                $summary, $recommendations
            ]);
            $assessmentId = $pdo->lastInsertId();

            // Insert assessment items
            if (isset($input['items'])) {
                $items = is_string($input['items']) ? json_decode($input['items'], true) : $input['items'];
                if (is_array($items) && count($items) > 0) {
                    $itemStmt = $pdo->prepare(
                        'INSERT INTO assessment_items (assessment_id, dimension, item_name, 
                         item_description, score, max_score, score_level, notes, sort_order, created_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
                    );
                    foreach ($items as $index => $item) {
                        $itemStmt->execute([
                            $assessmentId,
                            $item['dimension'] ?? '',
                            $item['item_name'] ?? '',
                            $item['item_description'] ?? '',
                            isset($item['score']) ? intval($item['score']) : 0,
                            isset($item['max_score']) ? intval($item['max_score']) : 5,
                            $item['score_level'] ?? '',
                            $item['notes'] ?? '',
                            $index
                        ]);
                    }
                }
            }

            $pdo->commit();

            auditLog('create', 'assessments', 'assessment', intval($assessmentId), '', null, null, '创建评估记录');

            jsonResponse(['success' => true, 'data' => ['id' => $assessmentId], 'message' => '评估创建成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '创建失败: ' . $e->getMessage()]);
        }
        break;

    // ============================================================
    // POST /api/assessments/update - Update assessment
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('eval_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止修改范围外评估记录
        requireAssessmentInScope($id);

        $updatableFields = [
            'assessment_type', 'assessment_date', 'total_score', 'max_score',
            'summary', 'recommendations', 'status'
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

        // Recalculate percentage if score changed
        if (isset($input['total_score']) || isset($input['max_score'])) {
            try {
                $pdo = getDB();
                $stmt = $pdo->prepare('SELECT total_score, max_score FROM assessments WHERE id = ?');
                $stmt->execute([$id]);
                $old = $stmt->fetch();
                $ts = isset($input['total_score']) ? intval($input['total_score']) : ($old['total_score'] ?? 0);
                $ms = isset($input['max_score']) ? intval($input['max_score']) : ($old['max_score'] ?? 0);
                if ($ms > 0) {
                    $updates[] = 'score_percentage = ?';
                    $values[] = round(($ts / $ms) * 100, 2);
                }
            } catch (PDOException $e) {
                // ignore
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE assessments SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'assessments', 'assessment', $id, '', null, null, '更新评估记录');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/assessments/delete - Delete assessment
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('eval_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        // 数据范围校验：禁止删除范围外评估记录
        requireAssessmentInScope($id);

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE assessments SET deleted_at = NOW() WHERE id = ?');
            $stmt->execute([$id]);

            auditLog('delete', 'assessments', 'assessment', $id, '', null, null, '删除评估记录');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // GET /api/assessments/templates - Assessment template list
    // ============================================================
    case 'templates':
        requireAuth();

        try {
            $pdo = getDB();
            $stmt = $pdo->query(
                'SELECT id, name, category, description, target_disability_types, 
                        applicable_age_min, applicable_age_max, is_system, is_active, 
                        created_by, created_at 
                 FROM assessment_templates 
                 WHERE is_active = 1 
                 ORDER BY is_system DESC, created_at DESC'
            );
            $templates = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $templates, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/assessments/template_items - Get template items
    // ============================================================
    case 'template_items':
        requireAuth();

        $templateId = isset($_GET['template_id']) ? intval($_GET['template_id']) : 0;
        if ($templateId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, dimension, item_name, item_description, max_score, sort_order 
                 FROM template_items_custom 
                 WHERE template_id = ? ORDER BY sort_order, id'
            );
            $stmt->execute([$templateId]);
            $items = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $items, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/assessments/recommend_goals - Recommend goals
    // ============================================================
    case 'recommend_goals':
        requireAuth();

        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        if ($studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            // Get latest assessment items for student
            $stmt = $pdo->prepare(
                'SELECT ai.dimension, ai.item_name, ai.score, ai.max_score, ai.notes
                 FROM assessment_items ai
                 INNER JOIN assessments a ON ai.assessment_id = a.id
                 WHERE a.student_id = ? AND a.deleted_at IS NULL
                 ORDER BY a.assessment_date DESC'
            );
            $stmt->execute([$studentId]);
            $items = $stmt->fetchAll();

            // Group by dimension
            $recommendations = [];
            foreach ($items as $item) {
                $dim = $item['dimension'];
                if (!isset($recommendations[$dim])) {
                    $recommendations[$dim] = [];
                }
                $recommendations[$dim][] = $item;
            }

            jsonResponse(['success' => true, 'data' => array_values($recommendations), 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/assessments/export - Export assessments (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('eval_export');

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format]);
        }

        try {
            $pdo = getDB();

            $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
            $assessmentType = isset($_GET['assessment_type']) ? trim($_GET['assessment_type']) : '';
            $status = isset($_GET['status']) ? trim($_GET['status']) : '';
            $id = isset($_GET['id']) ? intval($_GET['id']) : 0;

            // 修复(P2-7)：软删学生的历史评估不再出现在列表里（防孤儿数据外泄）
            $where = ['a.deleted_at IS NULL', 's.deleted_at IS NULL'];
            $params = [];
            if ($id > 0) { $where[] = 'a.id = ?'; $params[] = $id; }
            if ($studentId > 0) { $where[] = 'a.student_id = ?'; $params[] = $studentId; }
            if (!empty($assessmentType)) { $where[] = 'a.assessment_type = ?'; $params[] = $assessmentType; }
            if (!empty($status)) { $where[] = 'a.status = ?'; $params[] = $status; }
            $whereStr = implode(' AND ', $where);

            // 数据范围过滤（fail-closed），与 list 一致
            $scope = getDataScope();
            $scopeClause = '';
            $scopeParams = [];
            if ($scope['type'] === 'class_teacher') {
                if (empty($scope['class_ids'])) { $scopeClause = ' AND a.id = -1'; }
                else {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $scopeClause = " AND s.class_id IN ($placeholders)";
                    $scopeParams = $scope['class_ids'];
                }
            } elseif ($scope['type'] === 'teacher') {
                $conditions = [];
                if (!empty($scope['teacher_id'])) { $conditions[] = 'a.assessor_id = ?'; $scopeParams[] = $scope['teacher_id']; }
                if (!empty($scope['class_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                    $conditions[] = "s.class_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['class_ids']);
                }
                if (!empty($scope['student_ids'])) {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $conditions[] = "a.student_id IN ($placeholders)";
                    $scopeParams = array_merge($scopeParams, $scope['student_ids']);
                }
                if (!empty($conditions)) { $scopeClause = ' AND (' . implode(' OR ', $conditions) . ')'; }
                else { $scopeClause = ' AND a.id = -1'; }
            } elseif ($scope['type'] === 'parent') {
                if (empty($scope['student_ids'])) { $scopeClause = ' AND a.id = -1'; }
                else {
                    $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                    $scopeClause = " AND a.student_id IN ($placeholders)";
                    $scopeParams = $scope['student_ids'];
                }
            } elseif ($scope['type'] === 'viewer' || $scope['type'] === 'none') {
                $scopeClause = ' AND a.id = -1';
            }

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT s.name AS student_name, u.real_name AS assessor_name, a.assessment_date,
                           a.assessment_type, a.total_score, a.max_score, a.score_percentage, a.status,
                           a.summary, a.recommendations
                    FROM assessments a
                    LEFT JOIN students s ON a.student_id = s.id
                    LEFT JOIN users u ON a.assessor_id = u.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY a.assessment_date DESC, a.id DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $data = $stmt->fetchAll();

            logDataScopeAccess('assessments', $scope['type'], count($data));

            $headers = ['学生姓名', '评估人', '评估日期', '评估类型', '总分', '满分', '得分率(%)', '状态', '评估摘要', '康复建议'];
            $rows = array_map(function ($r) {
                return [
                    $r['student_name'] ?? '', $r['assessor_name'] ?? '', $r['assessment_date'] ?? '',
                    $r['assessment_type'] ?? '', $r['total_score'] ?? '', $r['max_score'] ?? '',
                    $r['score_percentage'] ?? '', $r['status'] ?? '', $r['summary'] ?? '',
                    $r['recommendations'] ?? '',
                ];
            }, $data);

            io_download($format, '评估记录', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败']);
        }
        break;

    // ============================================================
    // POST /api/assessments/import - Import assessments (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('eval_import');

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
            '评估类型'   => ['field' => 'assessment_type', 'required' => true],
            '评估日期'   => ['field' => 'assessment_date', 'required' => false],
            '总分'       => ['field' => 'total_score', 'required' => false],
            '满分'       => ['field' => 'max_score', 'required' => false],
            '评估摘要'   => ['field' => 'summary', 'required' => false],
            '康复建议'   => ['field' => 'recommendations', 'required' => false],
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
        $scope = getDataScope();

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['student_name']) === '' || trim($data['assessment_type']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生姓名与评估类型不能为空";
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

            $assessmentDate = io_normalize_date($data['assessment_date']);
            if ($assessmentDate === false) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：评估日期格式错误（应为 YYYY-MM-DD）";
                continue;
            }
            if ($assessmentDate === null) { $assessmentDate = date('Y-m-d'); }

            $totalScore = $data['total_score'] !== '' ? intval($data['total_score']) : 0;
            $maxScore = $data['max_score'] !== '' ? intval($data['max_score']) : 0;
            $scorePercentage = $maxScore > 0 ? round(($totalScore / $maxScore) * 100, 2) : 0.00;

            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO assessments (student_id, template_id, assessor_id, assessment_date,
                     assessment_type, total_score, max_score, score_percentage, summary, recommendations,
                     status, created_at, updated_at)
                     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, "completed", NOW(), NOW())'
                );
                $stmt->execute([
                    $studentId, $userId, $assessmentDate, $data['assessment_type'],
                    $totalScore, $maxScore, $scorePercentage,
                    $data['summary'] !== '' ? $data['summary'] : null,
                    $data['recommendations'] !== '' ? $data['recommendations'] : null,
                ]);
                auditLog('import', 'assessments', 'assessment', intval($pdo->lastInsertId()), $data['student_name'], null, null, '批量导入评估记录');
                $inserted++;
            } catch (Throwable $e) {
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
        jsonResponse(['success' => false, 'message' => '未知的评估操作: ' . $action]);
}
