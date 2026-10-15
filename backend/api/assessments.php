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

            // 数据范围过滤（ADR-009 统一核心 applyStudentKeyedScope）
            // 2026-10-15 修复并行实现漂移：此前 list 的 teacher 分支漏了
            // a.assessor_id 条件（教师看不到本人创建的评估），export 却带——
            // 同一教师「列表里没有、导出里有」。现两处统一为并集口径：
            // 本人经手 OR 本班学生 OR 负责 IEP 的学生。
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = applyStudentKeyedScope($scope, 'a', ['owner_col' => 'a.assessor_id']);

            // Merge scope params
            $countParams = array_merge($params, $scopeParams);
            $queryParams = array_merge($params, $scopeParams);

            // Count (join with students for scope filtering)
            $countStmt = $pdo->prepare('SELECT COUNT(*) FROM assessments a LEFT JOIN students s ON a.student_id = s.id WHERE ' . $whereStr . $scopeClause);
            $countStmt->execute($countParams);
            $total = intval($countStmt->fetchColumn());

            // Data
            // v14 真实浏览器冒烟修复：原 SQL 未取 template_id/template_name，
            // 前端只能用 assessment_type（initial）冒充「评估模板」列，表格里
            // 「评估类型」「评估模板」两列显示同一个原始枚举值。
            // 注意：students 表无 student_no 列（学号由前端按入学年份派生，
            // 见 frontend/src/services/students.ts）——曾误加 s.student_no 导致
            // 整个 list 500，字段假设必须以 schema 为准。
            $sql = 'SELECT a.id, a.student_id, s.name AS student_name, a.assessor_id, u.real_name AS assessor_name,
                           a.assessment_date, a.assessment_type, a.template_id, t.name AS template_name,
                           a.total_score, a.max_score, a.score_percentage, a.status,
                           a.summary, a.recommendations, a.created_at
                    FROM assessments a
                    LEFT JOIN students s ON a.student_id = s.id
                    LEFT JOIN users u ON a.assessor_id = u.id
                    LEFT JOIN assessment_templates t ON a.template_id = t.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY a.assessment_date DESC LIMIT ' . $offset . ', ' . $pageSize;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $list = $stmt->fetchAll();

            // v14：assessment_type 是字典枚举（initial/midterm/final/annual），
            // 直接把原始码推给前端，表格「评估类型」列会显示 "initial"。
            // ADR-033：字典是唯一口径，展示名由后端随列表下发；同时下发字典全集，
            // 供前端筛选下拉消费（原下拉硬编码旧五类，对存量 initial 数据全部查不到）。
            $typeLabels = [];
            $labelStmt = $pdo->query(
                "SELECT code, name FROM dict_common WHERE category = 'assessment_type' AND is_active = 1 ORDER BY sort_order, id"
            );
            foreach ($labelStmt->fetchAll() as $lr) {
                $typeLabels[$lr['code']] = $lr['name'];
            }
            foreach ($list as &$lr) {
                $code = (string)($lr['assessment_type'] ?? '');
                $lr['assessment_type_label'] = $typeLabels[$code] ?? $code;
            }
            unset($lr);

            // Audit log
            logDataScopeAccess('assessments', $scope['type'], $total);

            jsonResponse([
                'success' => true,
                'data'    => [
                    'list' => $list,
                    'total' => $total,
                    'page' => $page,
                    'pageSize' => $pageSize,
                    'assessment_types' => array_map(
                        static fn($code, $name) => ['code' => $code, 'name' => $name],
                        array_keys($typeLabels),
                        array_values($typeLabels)
                    ),
                ],
                'message' => '查询成功'
            ]);
        } catch (PDOException $e) {
            // v14：500 不得静默——把真实 SQL 错误写进 error_log，否则线上只能看到"查询失败"
            error_log('assessments/list PDO: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '查询失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/assessments/get - Get assessment detail
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
                jsonResponse(['success' => false, 'message' => '评估记录不存在'], 404);
            }

            // Get assessment items
            $itemStmt = $pdo->prepare(
                'SELECT id, dimension, item_name, item_description, score, max_score, score_level, notes, sort_order
                 FROM assessment_items
                 WHERE assessment_id = ? ORDER BY sort_order, id'
            );
            $itemStmt->execute([$id]);
            $assessment['items'] = $itemStmt->fetchAll();

            // v14：详情与列表同口径——assessment_type 是字典枚举，展示名由后端下发。
            // 缺此字段时前端只能回退显示原始编码（initial），与列表页的「初期评估」不一致。
            $typeLabels = [];
            $labelStmt = $pdo->query(
                "SELECT code, name FROM dict_common WHERE category = 'assessment_type' AND is_active = 1"
            );
            foreach ($labelStmt->fetchAll() as $lr) {
                $typeLabels[$lr['code']] = $lr['name'];
            }
            $typeCode = (string)($assessment['assessment_type'] ?? '');
            $assessment['assessment_type_label'] = $typeLabels[$typeCode] ?? $typeCode;

            jsonResponse(['success' => true, 'data' => $assessment, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/assessments/create - Create assessment with items
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('eval_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $assessmentType = isset($input['assessment_type']) ? trim($input['assessment_type']) : '';

        if ($studentId <= 0 || empty($assessmentType)) {
            jsonResponse(['success' => false, 'message' => '学生ID和评估类型不能为空'], 400);
        }

        // v14 口径修复（ADR-033 + ADR-018）：assessment_type 必须是字典内的编码
        // （initial/midterm/final/annual）。此前前端把「模板分类」（课程本位/专项评估…）
        // 直接塞进该字段，与字典、存量数据（全部 initial）三套口径互相矛盾，
        // 且筛选下拉按字典值过滤时新建记录永远查不到。非字典值一律 400，不放行。
        $pdo = getDB();
        $validTypeStmt = $pdo->prepare(
            "SELECT code FROM dict_common WHERE category = 'assessment_type' AND is_active = 1"
        );
        $validTypeStmt->execute();
        $validTypes = $validTypeStmt->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array($assessmentType, $validTypes, true)) {
            jsonResponse([
                'success' => false,
                'message' => '评估类型无效：' . $assessmentType . '（有效值：' . implode('/', $validTypes) . '）'
            ], 400);
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
            // 详情只进日志：PDO 原文含表结构与 SQL 片段，不该回给客户端（ADR-018）
            error_log('assessments/create error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '创建失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/assessments/update - Update assessment
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('eval_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：禁止修改范围外评估记录
        requireAssessmentInScope($id);

        $updatableFields = [
            'assessment_type', 'assessment_date', 'total_score', 'max_score',
            'summary', 'recommendations', 'status'
        ];

        // v14：与 create 同一条字典校验，避免更新旁路把非字典值写进 assessment_type
        if (isset($input['assessment_type'])) {
            $pdo = getDB();
            $validTypeStmt = $pdo->prepare(
                "SELECT code FROM dict_common WHERE category = 'assessment_type' AND is_active = 1"
            );
            $validTypeStmt->execute();
            $validTypes = $validTypeStmt->fetchAll(PDO::FETCH_COLUMN);
            $newType = trim((string)$input['assessment_type']);
            if (!in_array($newType, $validTypes, true)) {
                jsonResponse([
                    'success' => false,
                    'message' => '评估类型无效：' . $newType . '（有效值：' . implode('/', $validTypes) . '）'
                ], 400);
            }
        }

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
                // 取旧分失败只放弃「百分比」这一派生列的刷新，不阻断主更新；
                // 但静默吞掉会让「百分比没更新」永远查不到原因，补日志。
                error_log('assessments/update 读取旧分数失败（百分比列跳过刷新）: ' . $e->getMessage());
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段'], 400);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('UPDATE assessments SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            // v14：编辑评估时随主记录一起整体重写条目得分（先删后插，同事务）。
            // 缺此能力时「继续编辑」只能改文字字段，条目评分永远是建评时的旧值。
            if (isset($input['items'])) {
                $items = is_string($input['items']) ? json_decode($input['items'], true) : $input['items'];
                if (is_array($items)) {
                    $delStmt = $pdo->prepare('DELETE FROM assessment_items WHERE assessment_id = ?');
                    $delStmt->execute([$id]);
                    if (count($items) > 0) {
                        $itemStmt = $pdo->prepare(
                            'INSERT INTO assessment_items (assessment_id, dimension, item_name,
                             item_description, score, max_score, score_level, notes, sort_order, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
                        );
                        foreach ($items as $index => $item) {
                            $iMax = isset($item['max_score']) ? intval($item['max_score']) : 0;
                            $iScore = isset($item['score']) ? intval($item['score']) : 0;
                            $itemStmt->execute([
                                $id,
                                isset($item['dimension']) ? trim((string)$item['dimension']) : '',
                                isset($item['item_name']) ? trim((string)$item['item_name']) : '',
                                isset($item['item_description']) ? trim((string)$item['item_description']) : '',
                                $iScore,
                                $iMax,
                                isset($item['score_level']) ? trim((string)$item['score_level']) : null,
                                isset($item['notes']) ? trim((string)$item['notes']) : '',
                                $index,
                            ]);
                        }
                    }
                }
            }

            $pdo->commit();

            auditLog('update', 'assessments', 'assessment', $id, '', null, null, '更新评估记录');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            jsonResponse(['success' => false, 'message' => '更新失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/assessments/delete - Delete assessment
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('eval_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
            jsonResponse(['success' => false, 'message' => '删除失败'], 500);
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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/assessments/template_items - Get template items
    // ============================================================
    case 'template_items':
        requireAuth();

        $templateId = isset($_GET['template_id']) ? intval($_GET['template_id']) : 0;
        if ($templateId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/assessments/recommend_goals - Recommend goals
    // ============================================================
    case 'recommend_goals':
        requireAuth();

        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        if ($studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }
        // 同文件的 get/update/delete 都做了范围校验，只有这个端点漏了：
        // 传任意 student_id 就能拉取该生全部评估明细。
        requireStudentInScope($studentId);

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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/assessments/export - Export assessments (csv/json/md/xlsx/docx/pdf)
    // ============================================================
    case 'export':
        requireAuth();
        requirePermission('eval_export');

        // v15：导入模板下载（template=1）——仅输出表头，列名与 io_import_column_map 同源，
        // 保证「按模板填写 → 导入」不缺列。放在权限校验之后：下载模板同样受导出权限管控。
        if (isset($_GET['template']) && $_GET['template'] === '1') {
            io_download('csv', '评估导入模板', array_keys(io_import_column_map('assessments')), []);
        }

        $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';
        if (!in_array($format, ['csv', 'json', 'md', 'markdown', 'xlsx', 'docx', 'pdf'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format], 400);
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

            // 数据范围过滤（ADR-009 统一核心 applyStudentKeyedScope，与 list 同口径）
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = applyStudentKeyedScope($scope, 'a', ['owner_col' => 'a.assessor_id']);

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

            // v14：导出同样下发字典展示名，与列表口径一致（不外泄原始编码）
            $exportTypeLabels = [];
            $exportLabelStmt = $pdo->query(
                "SELECT code, name FROM dict_common WHERE category = 'assessment_type' AND is_active = 1"
            );
            foreach ($exportLabelStmt->fetchAll() as $lr) {
                $exportTypeLabels[$lr['code']] = $lr['name'];
            }

            logDataScopeAccess('assessments', $scope['type'], count($data));

            $headers = ['学生姓名', '评估人', '评估日期', '评估类型', '总分', '满分', '得分率(%)', '状态', '评估摘要', '康复建议'];
            $rows = array_map(function ($r) use ($exportTypeLabels) {
                $typeCode = (string)($r['assessment_type'] ?? '');
                return [
                    $r['student_name'] ?? '', $r['assessor_name'] ?? '', $r['assessment_date'] ?? '',
                    $exportTypeLabels[$typeCode] ?? $typeCode, $r['total_score'] ?? '', $r['max_score'] ?? '',
                    $r['score_percentage'] ?? '', $r['status'] ?? '', $r['summary'] ?? '',
                    $r['recommendations'] ?? '',
                ];
            }, $data);

            io_download($format, '评估记录', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/assessments/import - Import assessments (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('eval_import');

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
        $columnMap = io_import_column_map('assessments');

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

        // v14：评估类型字典（编码 ↔ 展示名双向映射）。
        // 导入同时接受两种写法：代码（initial）或导出文件里的展示名（初期评估），
        // 保证「导出 → 编辑 → 导回」往返不因口径切换而失败。
        $importTypeLabels = [];
        $importTypeCodes = [];
        $importLabelStmt = $pdo->query(
            "SELECT code, name FROM dict_common WHERE category = 'assessment_type' AND is_active = 1"
        );
        foreach ($importLabelStmt->fetchAll() as $lr) {
            $importTypeLabels[$lr['code']] = $lr['name'];
            $importTypeCodes[$lr['name']] = $lr['code'];
        }

        // v15 预检（dry_run）：整批包事务，结尾 rollBack 不落库
        $dryRun = io_import_is_dry_run();
        $pdo->beginTransaction();

        foreach ($parsed['rows'] as $lineNo => $row) {
            $data = io_extract_row($row, $colIndex);
            if (trim($data['student_name']) === '' || trim($data['assessment_type']) === '') {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：学生姓名与评估类型不能为空";
                continue;
            }

            // 展示名（初期评估）归一为编码（initial）；两者都不是则拒绝该行
            $rawType = trim($data['assessment_type']);
            if (isset($importTypeCodes[$rawType])) {
                $rawType = $importTypeCodes[$rawType];
            }
            if (!isset($importTypeLabels[$rawType])) {
                $failed++;
                $errors[] = "第 " . ($lineNo + 2) . " 行：评估类型「" . $data['assessment_type'] . "」无效（有效值：" . implode('/', array_keys($importTypeLabels)) . "）";
                continue;
            }
            $data['assessment_type'] = $rawType;

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
                // 行级失败对用户只给通用文案（不外泄库表细节），
                // 但服务端必须能查到真实原因，否则批量导入坏了没人知道为什么。
                error_log('assessments/import 第 ' . ($lineNo + 2) . " 行失败: " . $e->getMessage());
            }
        }

        // v15：预检报告（此时库中没有任何新数据）
        if ($dryRun) {
            $pdo->rollBack();
            io_import_dry_run_response('assessments', $inserted, $failed, $errors);
        }
        $pdo->commit();

        jsonResponse([
            'success' => true,
            'data'    => ['inserted' => $inserted, 'failed' => $failed, 'total' => count($parsed['rows']), 'errors' => $errors],
            'message' => "导入完成：成功 $inserted 条，失败 $failed 条"
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的评估操作: ' . $action], 404);
}
