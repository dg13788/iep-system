<?php
/**
 * 归一化团队成员为「可读字符串数组」。
 *
 * team_members 是 JSON 列，库里实际存在两种形态：
 *   1) 对象数组：[{"role":"班主任","user_id":3}, ...]（生成器 / 早期写入）
 *   2) 字符串数组：["李老师","王老师"]（前端向导提交）
 * 前端与导出文档都按 string[] 直接 join('、') 展示，遇到第 1 种会渲染成
 * "[object Object]、[object Object]"，详情页和导出的 Word/PDF 都会中招。
 * 这里统一成「姓名（角色）」的可读文本；角色缺失时只留姓名，姓名查不到时回落 ID。
 */
function normalize_team_members($raw): array
{
    if (empty($raw)) {
        return [];
    }
    $list = is_string($raw) ? json_decode($raw, true) : $raw;
    if (!is_array($list)) {
        return [];
    }

    $userIds = [];
    foreach ($list as $m) {
        if (is_array($m) && !empty($m['user_id'])) {
            $userIds[] = intval($m['user_id']);
        }
    }
    $nameById = [];
    if ($userIds) {
        try {
            $pdo = getDB();
            $in = implode(',', array_fill(0, count($userIds), '?'));
            $st = $pdo->prepare("SELECT id, real_name FROM users WHERE id IN ($in)");
            $st->execute($userIds);
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $nameById[intval($r['id'])] = $r['real_name'] ?: ('用户' . intval($r['id']));
            }
        } catch (PDOException $e) {
            error_log('normalize_team_members user lookup: ' . $e->getMessage());
        }
    }

    $out = [];
    foreach ($list as $m) {
        if (is_array($m)) {
            $name = '';
            if (!empty($m['user_id'])) {
                $name = $nameById[intval($m['user_id'])] ?? ('用户' . intval($m['user_id']));
            } elseif (!empty($m['name'])) {
                $name = (string) $m['name'];
            }
            $role = isset($m['role']) ? trim((string) $m['role']) : '';
            if ($name === '' && $role !== '') {
                $name = $role;
            }
            if ($name === '') {
                continue;
            }
            $out[] = ($role !== '' && $role !== $name) ? "{$name}（{$role}）" : $name;
        } else {
            $s = trim((string) $m);
            if ($s !== '') {
                $out[] = $s;
            }
        }
    }
    return array_values(array_unique($out));
}

/**
 * 兼容 team_members 的两种历史写法：字符串数组或 JSON 字符串。
 */
function iep_team_members_param($value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_array($value)) {
        return json_encode(array_values($value), JSON_UNESCAPED_UNICODE);
    }
    return (string) $value;
}

/**
 * 判断某教师是否在团队成员名单中。
 * 归一化后的元素形如「李老师（班主任）」，勾选态比较时需去掉括号内的角色。
 */
function iep_team_members_contains(array $members, string $name): bool
{
    $target = trim($name);
    if ($target === '') {
        return false;
    }
    foreach ($members as $m) {
        if ($m === $target || preg_replace('/（[^）]*）$/', '', (string) $m) === $target) {
            return true;
        }
    }
    return false;
}

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
 *
 * v4（特教专业内核，对应审查报告 6.1 / 6.2）：
 *   GET  /api/iep/objectives              - 短期目标列表（含任务步骤与达成率）
 *   POST /api/iep/objective_save          - 保存短期目标及其任务分析步骤
 *   POST /api/iep/objective_delete        - 软删除短期目标
 *   GET  /api/iep/objective_records       - trial 级达成数据
 *   POST /api/iep/objective_record_add    - 记录一次教学试次（自动掌握判定）
 *   POST /api/iep/goal_rollup             - 由短期目标汇总长期目标状态与达成率
 *   GET  /api/iep/related_services        - 相关服务台账
 *   POST /api/iep/related_service_save    - 开具/更新相关服务
 *   POST /api/iep/related_service_delete  - 删除相关服务
 *   GET  /api/iep/meeting_participants    - IEP 会议参与人
 *   POST /api/iep/meeting_participant_save- 会议参与人与签到留痕
 *   GET  /api/iep/meta                    - 特教专业字典（安置形式/相关服务/沟通方式）
 *
 * v7（进度智能内核 Progress Intelligence Core，对应 Step 1 整改）：
 *   GET  /api/iep/progress_series         - 目标历史进度数据点（修复「只写不读」）
 *   GET  /api/iep/progress_analysis       - aim line / 趋势线 / 决策结论 / 调整点
 *   GET  /api/iep/adjustments             - 干预调整留痕列表
 *   POST /api/iep/adjustment_save         - 记录一次干预调整（DBI Step 4）
 *   POST /api/iep/adjustment_delete       - 软删除干预调整
 *   GET  /api/iep/consistency_check       - IEP 内在一致性质检（提交审核前强制）
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';
require_once __DIR__ . '/progress_analysis.php';

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
            // 修复(P2-7)：软删学生的历史 IEP 不再出现在列表里（防孤儿数据外泄）
            $where = ['p.deleted_at IS NULL', 's.deleted_at IS NULL'];
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
            //
            // 安全修复(P0-2)：原实现在 class_ids 为空时不追加任何过滤条件，
            // 导致班主任在关联缺失或查询异常时可见全校数据（fail-open 越权）；
            // 现改为 fail-closed：无关联班级即不可见任何数据。
            //
            // 重构(v8)：这段过滤原先在 iep.php 与 workbench.php 各写一份。
            // 安全边界出现第二份实现，迟早会长出「列表看不到、工作台却能操作」的越权口子。
            // 现统一收敛到 pa_plan_scope_clause()，行为逐分支保持一致（含 viewer/none 一律拒绝）。
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = pa_plan_scope_clause($scope);

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
                           p.placement_type, p.meeting_date, p.next_review_date,
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
            jsonResponse(['success' => false, 'message' => '查询失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/iep/get - Get IEP detail with goals
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在'], 404);
            }

            // 团队成员归一化：库里可能是 [{role,user_id}] 对象数组，
            // 原样下发会让前端 join('、') 渲染成 [object Object]
            $plan['team_members'] = normalize_team_members($plan['team_members'] ?? null);

            // Get goals
            $goalStmt = $pdo->prepare(
                'SELECT id, goal_code, area, title, description, target_behavior, criteria, 
                        evaluation_method, baseline, target_score, current_score, progress_percentage, 
                        start_date, target_date, priority, status, teaching_strategies, resources, 
                        responsible_teacher_id, sort_order,
                        monitor_frequency, monitor_method, monitor_owner_id,
                        baseline_value, baseline_date, target_value,
                        source_assessment_id, source_assessment_item_id
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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/create - Create IEP plan
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('iep_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
        $title = isset($input['title']) ? trim($input['title']) : '';

        if ($studentId <= 0 || empty($title)) {
            jsonResponse(['success' => false, 'message' => '学生ID和计划标题不能为空'], 400);
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
            jsonResponse(['success' => false, 'message' => '创建失败: ' . $e->getMessage()], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/update - Update IEP plan
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：禁止修改范围外 IEP
        requireIepInScope($id);

        $updatableFields = [
            'title', 'semester', 'academic_year', 'start_date', 'end_date',
            'strengths', 'needs', 'priorities', 'adaptations', 'assistive_tech',
            'transition_plan', 'team_members', 'status', 'progress_summary',
            // v4 特教内核（6.2）：教育安置形式与 IEP 会议要件
            'placement_type', 'placement_notes', 'regular_class_hours', 'resource_room_hours',
            'meeting_date', 'meeting_place', 'next_review_date'
        ];

        // 安置形式白名单校验：与 ENUM 保持一致，非法值直接拒绝而非污染数据库
        if (isset($input['placement_type']) && $input['placement_type'] !== '' && $input['placement_type'] !== null) {
            $allowedPlacements = ['普通班随班就读', '特教班', '资源教室', '送教上门', '特教学校'];
            if (!in_array($input['placement_type'], $allowedPlacements, true)) {
                jsonResponse([
                    'success' => false,
                    'message' => '教育安置形式取值非法（应为：' . implode('/', $allowedPlacements) . '）',
                    'code' => 400
                ], 400);
            }
        }

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
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段'], 400);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE iep_plans SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute($values);

            auditLog('update', 'iep', 'iep_plan', $id, '', null, null, '更新IEP计划');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/delete - Delete IEP plan
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('iep_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
            jsonResponse(['success' => false, 'message' => '删除失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/submit - Submit for review
    // ============================================================
    case 'submit':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }

        // 数据范围校验：禁止提交范围外 IEP
        requireIepInScope($id);

        $user = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // Get current status
            $stmt = $pdo->prepare('SELECT status, placement_type FROM iep_plans WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$id]);
            $current = $stmt->fetch();
            if (!$current) {
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在'], 404);
            }
            $previousStatus = $current['status'];

            // 修复（三维度回测 0919 · P1-1 审批状态机越级）：
            // 原实现未校验当前状态，导致已批准(approved)/已签名(signed)的计划
            // 可被再次 submit 打回 reviewing，审批流出现「approved→reviewing→approved」
            // 的倒流，历史审批结论被悄悄推翻且无修订留痕。
            // 收紧为：仅草稿(draft)与已驳回(rejected)可提交审核。
            if (!in_array($previousStatus, ['draft', 'rejected'], true)) {
                $pdo->rollBack();
                jsonResponse([
                    'success' => false,
                    'message' => '当前状态不可提交审核：只有「草稿」或「已驳回」的计划可提交'
                        . '（当前状态：' . $previousStatus . '）。已通过的计划如需修订，'
                        . '请走驳回/修订流程以便留痕。',
                    'code'    => 400,
                ], 400);
            }

            // 修复(v4遗留4)：教育安置形式是 IEP 的法定必备要素（随班就读/特教班/
            // 资源教室/送教上门等），报告 6.2 要求必填。存量表结构保持可空（兼容
            // 旧数据），但在提交审核这一关口强制校验：没有安置形式的 IEP 不允许
            // 进入审批流，避免"法定要件缺失的计划"被审批通过。
            if (empty($current['placement_type'])) {
                $pdo->rollBack();
                jsonResponse([
                    'success' => false,
                    'message' => '教育安置形式为必填项，请先在计划中补充（随班就读/特教班/资源教室/送教上门）后再提交',
                    'code' => 400
                ], 400);
            }

            // v7（Step 1 · P0-3 / IDEA 内在一致性）：提交审核前强制质检。
            // 此前系统只校验「安置形式」一项，其余法定要件（基线、达成标准、监控频率、
            // 会议日期、转衔）全靠教师自查，形式化风险完全外溢到审计环节。
            // 现在把质量量规固化成可执行规则：error 级问题阻断提交并逐条列出，
            // 让「质量不合格的 IEP」在流程内被拦下，而不是在流程外被追责。
            $check = pa_consistency_check($pdo, $id);
            if (!$check['passed']) {
                $pdo->rollBack();
                $lines = [];
                foreach ($check['issues'] as $iss) {
                    if ($iss['level'] !== 'error') continue;
                    $lines[] = '· ' . $iss['title'] . '：' . $iss['detail'];
                }
                jsonResponse([
                    'success' => false,
                    'message' => '未通过 IEP 一致性质检，共 ' . $check['error_count'] . ' 项必须处理后才能提交：',
                    'code'    => 422,
                    'data'    => [
                        'check' => $check,
                        'brief' => $lines
                    ]
                ], 422);
            }

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
            jsonResponse(['success' => false, 'message' => '提交失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/approve - Approve/reject IEP
    // ============================================================
    case 'approve':
        requireAuth();
        requirePermission('iep_approve');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        $decision = isset($input['decision']) ? trim($input['decision']) : ''; // 'approve' or 'reject'
        $comment = isset($input['comment']) ? trim($input['comment']) : '';

        if ($id <= 0 || empty($decision)) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
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
                jsonResponse(['success' => false, 'message' => 'IEP计划不存在'], 404);
            }
            $previousStatus = $current['status'];

            // 修复（三维度回测 0919 · P1-1 审批状态机越级）：
            // 原实现只读取当前状态用于写日志，未做任何校验，导致
            //   · 草稿(draft) 可被一键批准 —— 绕过「提交审核」这一法定环节；
            //   · 已同意(approved)/已签名(signed) 可被重复审批 —— 审批记录出现
            //     approve: approved→approved 这类无意义且污染时间线的条目。
            // 这里收紧为：仅「审核中(reviewing)」可进入审批决定。
            if ($previousStatus !== 'reviewing') {
                $pdo->rollBack();
                jsonResponse([
                    'success' => false,
                    'message' => '当前状态不可审批：只有「审核中」的计划才能审批（当前状态：'
                        . $previousStatus . '）。草稿请先提交审核。',
                    'code'    => 400,
                ], 400);
            }

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
            // 修复(7.3)：原 catch 静默吞异常
            error_log('iep/approve error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => $actionLabel . '失败']);
        }
        break;

    // ============================================================
    // POST /api/iep/sign - Parent signature
    // ============================================================
    case 'sign':
        $user = requireAuth();

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $signatureData = isset($input['signature_data']) ? $input['signature_data'] : '';
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;

        if ($planId <= 0 || empty($signatureData)) {
            jsonResponse(['success' => false, 'message' => '计划ID和签名数据不能为空', 'code' => 400], 400);
        }

        // 数据范围校验：家长仅可签署自家孩子的 IEP
        requireIepInScope($planId);

        // 取计划所属学生（用于校验签名人是否为该学生的真实监护人）
        $planStudentId = 0;
        try {
            $pdoTmp = getDB();
            $st = $pdoTmp->prepare('SELECT student_id FROM iep_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1');
            $st->execute([$planId]);
            $planStudentId = intval($st->fetchColumn());
        } catch (PDOException $e) {
            error_log('iep/sign student lookup error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '数据校验失败', 'code' => 500], 500);
        }
        if ($planStudentId <= 0) {
            jsonResponse(['success' => false, 'message' => 'IEP计划不存在', 'code' => 404], 404);
        }

        // 家长身份需同时覆盖两类账号（parents 表登录 / users 表家长角色），
        // 否则后者在签名时会被要求 iep_approve 权限而被拒。
        $isParent = currentUserIsParent($user);

        // 安全修复(P0-1)：家长电子签名是 IEP 流程中具有法律效力的确认环节。
        // 原实现存在三处致命缺陷：
        //   1) 只做 requireAuth，未做任何功能权限校验 —— 连「只读督导」账号都能签；
        //   2) parent_id 完全由客户端传入且不与所属学生做关联校验 ——
        //      任何人都能以任意家长的名义代签；
        //   3) 审批日志把 approver 写成被冒充的家长，操作人完全不可追溯。
        // 现策略：
        //   - 家长本人：强制使用自身 sub，并校验其确为该学生的监护人；
        //   - 教职工代签：必须具 iep_approve 权限，且 parent_id 必须是该学生的
        //     真实监护人之一，审批日志如实记录实际操作人为「代签」。
        if ($isParent) {
            // 必须走 parent_ref_id 映射：users.id ≠ parents.id，直接取 sub 会签成另一位家长
            $mapped = currentParentId($user);
            if ($mapped === null) {
                jsonResponse(['success' => false, 'message' => '家长身份解析失败', 'code' => 403], 403);
            }
            $parentId = $mapped;
        } else {
            requirePermission('iep_approve');
            if ($parentId <= 0) {
                jsonResponse(['success' => false, 'message' => '代签时必须指定被代签的家长ID', 'code' => 400], 400);
            }
        }

        if ($parentId <= 0) {
            jsonResponse(['success' => false, 'message' => '家长ID不能为空', 'code' => 400], 400);
        }

        // 核心校验：该 parent_id 必须是本 IEP 所属学生的真实监护人
        try {
            $pdoTmp = getDB();
            $gSt = $pdoTmp->prepare(
                'SELECT 1 FROM student_parents sp
                 INNER JOIN parents p ON p.id = sp.parent_id
                 WHERE sp.student_id = ? AND sp.parent_id = ? AND p.deleted_at IS NULL LIMIT 1'
            );
            $gSt->execute([$planStudentId, $parentId]);
            if (!$gSt->fetchColumn()) {
                jsonResponse([
                    'success' => false,
                    'message' => '签名人不是该学生的监护人，禁止代签',
                    'code' => 403
                ], 403);
            }
        } catch (PDOException $e) {
            error_log('iep/sign guardian check error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '监护人校验失败', 'code' => 500], 500);
        }

        $signatureType = isset($input['signature_type']) ? trim($input['signature_type']) : 'handwritten';
        // 修复(P0-1残留)：原 hash('sha256') 无密钥参与，任何拿到签名数据的人都能重算同样
        // 的哈希，「完整性证明」不成立。改为 HMAC-SHA256（密钥参与），同时把签署时间与
        // 数据内容一并纳入哈希域，使哈希与签署事件绑定、不可脱离系统重算。
        $signatureHash = hash_hmac(
            'sha256',
            $planId . '|' . $parentId . '|' . $signatureData . '|' . date('c'),
            JWT_SECRET
        );
        $deviceInfo = isset($input['device_info']) ? trim($input['device_info']) : ($_SERVER['HTTP_USER_AGENT'] ?? '');

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // 修复(P0-1残留)：检测「复活」场景——已有签名曾被撤销（is_revoked=1）时，
            // 再次签署虽然业务上允许（家长改主意重新签），但必须在审批日志与审计日志中
            // 留痕，不允许静默把撤销记录抹掉。
            $revokedBefore = false;
            $chk = $pdo->prepare('SELECT is_revoked FROM parent_signatures WHERE iep_plan_id = ? AND parent_id = ? LIMIT 1');
            $chk->execute([$planId, $parentId]);
            $existing = $chk->fetch();
            if ($existing && intval($existing['is_revoked']) === 1) {
                $revokedBefore = true;
            }

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

            // 修复（审批链完整性）：审批日志是事后追溯与合规举证的唯一凭据。原实现在
            // sign / sign_renew / sign_revoke 三条日志里都**没有写入 previous_status**，
            // 导致「这份计划是从哪个状态被签掉的/被退回哪个状态」无据可查，状态机链条断裂
            // （种子数据之所以有值，只是因为它们是 SQL 直接插入而非走接口）。
            // 这里在改写状态之前先取原状态，并随日志一并落库。
            $prevStmt = $pdo->prepare('SELECT status FROM iep_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1');
            $prevStmt->execute([$planId]);
            $prevRaw    = $prevStmt->fetchColumn();
            $prevStatus = ($prevRaw === false || $prevRaw === null) ? null : (string)$prevRaw;

            // Update IEP status to signed
            $stmt = $pdo->prepare('UPDATE iep_plans SET status = "signed", updated_at = NOW() WHERE id = ?');
            $stmt->execute([$planId]);

            // Get parent name
            $parStmt = $pdo->prepare('SELECT name FROM parents WHERE id = ?');
            $parStmt->execute([$parentId]);
            $parentName = $parStmt->fetchColumn();

            // 安全修复(P0-1)续：审批日志必须如实记录「谁按下了签名按钮」。
            // 原实现无论实际是谁操作，approver 一律写成被代签的家长，
            // 事后无法追溯真正的操作人，审计形同虚设。
            if ($isParent) {
                $approverId   = $parentId;
                // approver_type 为 ENUM('user','parent')，只能取这两值
                $approverType = 'parent';
                $approverRole = 'guardian';
                $approverName = $parentName;
                $comment      = '家长电子签名';
            } else {
                $approverId   = intval($user['sub']);
                $approverType = 'user';
                $approverRole = 'staff_proxy';
                $approverName = $user['real_name'] ?? $user['name'] ?? $user['username'] ?? ('用户#' . $approverId);
                $comment      = '由' . $approverName . '代家长（' . $parentName . '）签署，须有线下授权凭证';
            }

            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_role, 
                 approver_name, action, previous_status, new_status, comment, created_at) 
                 VALUES (?, ?, ?, ?, ?, "sign", ?, "signed", ?, NOW())'
            );
            $logStmt->execute([$planId, $approverId, $approverType, $approverRole, $approverName,
                               $prevStatus, $comment]);

            // 曾撤销后重新签署：补一条留痕，防止撤销历史被静默抹除
            if ($revokedBefore) {
                $renewStmt = $pdo->prepare(
                    'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_role, 
                     approver_name, action, previous_status, new_status, comment, created_at) 
                     VALUES (?, ?, ?, ?, ?, "sign_renew", ?, "signed", "该家长此前已撤销签名，本次为重新签署", NOW())'
                );
                $renewStmt->execute([$planId, $approverId, $approverType, $approverRole, $approverName,
                                     $prevStatus]);
            }

            $pdo->commit();

            // 写入系统审计日志，保留 IP / UA，满足事后追溯
            auditLog('sign', 'iep', 'iep_plan', $planId, '', null,
                     ['parent_id' => $parentId, 'by' => $approverName, 'type' => $approverType],
                     $comment);

            jsonResponse(['success' => true, 'message' => '签名成功',
                          'data' => ['approver_type' => $approverType, 'approver_name' => $approverName]]);
        } catch (PDOException $e) {
            $pdo->rollBack();
            // 修复(7.3)：原 catch 静默吞异常，排障等于瞎的
            error_log('iep/sign error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '签名失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/sign_revoke - 撤销家长电子签名（P0-1 残留整改）
    // 家长可撤销本人签名；教职工须具 iep_approve 权限并只能撤销
    // 该学生真实监护人的签名。撤销后计划状态回退：
    //   已审批过 -> approved；从未审批 -> draft。
    // ============================================================
    case 'sign_revoke':
        $user = requireAuth();

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;
        $reason = isset($input['reason']) ? trim($input['reason']) : '';

        if ($planId <= 0) {
            jsonResponse(['success' => false, 'message' => '计划ID不能为空', 'code' => 400], 400);
        }
        if ($reason === '') {
            jsonResponse(['success' => false, 'message' => '必须填写撤销原因', 'code' => 400], 400);
        }

        // 数据范围校验：只能撤销范围内 IEP 的签名
        requireIepInScope($planId);

        $isParent = currentUserIsParent($user);
        if ($isParent) {
            $mapped = currentParentId($user);
            if ($mapped === null) {
                jsonResponse(['success' => false, 'message' => '家长身份解析失败', 'code' => 403], 403);
            }
            $parentId = $mapped;
        } else {
            requirePermission('iep_approve');
            if ($parentId <= 0) {
                jsonResponse(['success' => false, 'message' => '必须指定要撤销签名的家长ID', 'code' => 400], 400);
            }
        }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // 校验：签名必须真实存在且未撤销
            $chk = $pdo->prepare(
                'SELECT ps.id, ps.is_revoked FROM parent_signatures ps
                 WHERE ps.iep_plan_id = ? AND ps.parent_id = ? LIMIT 1'
            );
            $chk->execute([$planId, $parentId]);
            $sig = $chk->fetch();
            if (!$sig) {
                jsonResponse(['success' => false, 'message' => '该家长在此计划上没有签名记录', 'code' => 404], 404);
            }
            if (intval($sig['is_revoked']) === 1) {
                jsonResponse(['success' => false, 'message' => '该签名已处于撤销状态', 'code' => 400], 400);
            }

            // 教职工撤销时，须确认该家长确为该学生的真实监护人
            if (!$isParent) {
                $st = $pdo->prepare('SELECT student_id FROM iep_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1');
                $st->execute([$planId]);
                $planStudentId = intval($st->fetchColumn());
                $gSt = $pdo->prepare(
                    'SELECT 1 FROM student_parents sp
                     INNER JOIN parents p ON p.id = sp.parent_id
                     WHERE sp.student_id = ? AND sp.parent_id = ? AND p.deleted_at IS NULL LIMIT 1'
                );
                $gSt->execute([$planStudentId, $parentId]);
                if (!$gSt->fetchColumn()) {
                    jsonResponse(['success' => false, 'message' => '该家长不是此学生的监护人，禁止操作', 'code' => 403], 403);
                }
            }

            // 撤销签名（软状态，保留原始签名数据作为证据链）
            $rv = $pdo->prepare('UPDATE parent_signatures SET is_revoked = 1, revoked_at = NOW(), revoked_reason = ? WHERE id = ?');
            $rv->execute([$reason, $sig['id']]);

            // 同 sign：状态回退前先取原状态，保证审批链 previous_status 完整
            $prevStmt = $pdo->prepare('SELECT status FROM iep_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1');
            $prevStmt->execute([$planId]);
            $prevRaw    = $prevStmt->fetchColumn();
            $prevStatus = ($prevRaw === false || $prevRaw === null) ? null : (string)$prevRaw;

            // 计划状态回退：审批过回 approved，否则回 draft
            $pdo->exec('UPDATE iep_plans SET status = IF(approved_at IS NULL, "draft", "approved"), updated_at = NOW() WHERE id = ' . intval($planId));

            // 审批日志留痕
            $parStmt = $pdo->prepare('SELECT name FROM parents WHERE id = ?');
            $parStmt->execute([$parentId]);
            $parentName = $parStmt->fetchColumn() ?: ('家长#' . $parentId);
            if ($isParent) {
                $approverId = $parentId; $approverType = 'parent'; $approverRole = 'guardian'; $approverName = $parentName;
                $comment = '家长本人撤销签名：' . $reason;
            } else {
                $approverId = intval($user['sub']);
                $approverType = 'user';
                $approverRole = 'staff_revoke';
                $approverName = $user['real_name'] ?? $user['name'] ?? $user['username'] ?? ('用户#' . $approverId);
                $comment = '由' . $approverName . '撤销家长（' . $parentName . '）的签名：' . $reason;
            }
            $logStmt = $pdo->prepare(
                'INSERT INTO iep_approval_logs (iep_plan_id, approver_id, approver_type, approver_role, 
                 approver_name, action, previous_status, new_status, comment, created_at) 
                 VALUES (?, ?, ?, ?, ?, "sign_revoke", ?, "revoked", ?, NOW())'
            );
            $logStmt->execute([$planId, $approverId, $approverType, $approverRole, $approverName,
                               $prevStatus, $comment]);

            $pdo->commit();

            auditLog('sign_revoke', 'iep', 'iep_plan', $planId, '', null,
                     ['parent_id' => $parentId, 'by' => $approverName],
                     $comment);

            jsonResponse(['success' => true, 'message' => '签名已撤销']);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            error_log('iep/sign_revoke error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '撤销失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/save_goals - Save IEP goals
    // ============================================================
    case 'save_goals':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $goalsJson = isset($input['goals']) ? $input['goals'] : '[]';

        if ($planId <= 0) {
            jsonResponse(['success' => false, 'message' => '计划ID不能为空'], 400);
        }

        // 数据范围校验：禁止修改范围外 IEP 的目标
        requireIepInScope($planId);

        $goals = is_string($goalsJson) ? json_decode($goalsJson, true) : $goalsJson;
        if (!is_array($goals)) {
            jsonResponse(['success' => false, 'message' => '目标数据格式错误'], 400);
        }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            // v7（Step 1）：保存目标时必须一并持久化「进度监控」元数据。
            // 这些字段是 IDEA 法定要件，也是 aim line 与提示提醒的计算依据；
            // 若保存路径不支持写入，新增目标将永远无法通过一致性质检而被挡住 —— 那是自造死锁。
            $monitorFields = function (array $goal): array {
                $freq = trim((string)($goal['monitor_frequency'] ?? ''));
                if (!in_array($freq, ['每次课', '每天', '每周2次', '每周1次', '每两周', '每月'], true)) {
                    $freq = null;
                }
                $baseVal   = (isset($goal['baseline_value']) && is_numeric($goal['baseline_value']))
                    ? max(0, min(100, floatval($goal['baseline_value']))) : null;
                $targetVal = (isset($goal['target_value']) && is_numeric($goal['target_value']))
                    ? max(0, min(100, floatval($goal['target_value']))) : null;
                return [
                    $freq,
                    trim((string)($goal['monitor_method'] ?? '')) ?: null,
                    isset($goal['monitor_owner_id']) && intval($goal['monitor_owner_id']) > 0
                        ? intval($goal['monitor_owner_id']) : null,
                    $baseVal,
                    trim((string)($goal['baseline_date'] ?? '')) ?: null,
                    $targetVal,
                    isset($goal['source_assessment_id']) && intval($goal['source_assessment_id']) > 0
                        ? intval($goal['source_assessment_id']) : null,
                    isset($goal['source_assessment_item_id']) && intval($goal['source_assessment_item_id']) > 0
                        ? intval($goal['source_assessment_item_id']) : null,
                    // 显式给了数值 → 标记为「教师指定」，后续重跑迁移不得覆盖
                    $baseVal !== null ? 0 : 1,
                    $targetVal !== null ? 0 : 1,
                ];
            };

            $insertStmt = $pdo->prepare(
                'INSERT INTO iep_goals (iep_plan_id, goal_code, area, title, description, target_behavior, 
                 criteria, evaluation_method, baseline, target_score, current_score, start_date, target_date, 
                 priority, teaching_strategies, resources, responsible_teacher_id, sort_order,
                 monitor_frequency, monitor_method, monitor_owner_id,
                 baseline_value, baseline_date, target_value,
                 source_assessment_id, source_assessment_item_id,
                 baseline_value_is_derived, target_value_is_derived,
                 created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
            );

            $updateStmt = $pdo->prepare(
                'UPDATE iep_goals SET area = ?, title = ?, description = ?, target_behavior = ?, 
                 criteria = ?, evaluation_method = ?, baseline = ?, target_score = ?, start_date = ?, 
                 target_date = ?, priority = ?, teaching_strategies = ?, resources = ?, 
                 responsible_teacher_id = ?, sort_order = ?,
                 monitor_frequency = ?, monitor_method = ?, monitor_owner_id = ?,
                 baseline_value = ?, baseline_date = ?, target_value = ?,
                 source_assessment_id = ?, source_assessment_item_id = ?,
                 baseline_value_is_derived = ?, target_value_is_derived = ?,
                 updated_at = NOW() WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
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
                        ...$monitorFields($goal),
                        intval($goal['id']), $planId
                    ]);
                    // 此前 WHERE 只约束 id，不约束 iep_plan_id：
                    // 只要拿到任意一个在范围内计划的 id，就能在 goals 数组里塞别人的 goal_id，
                    // 改写全校任意 IEP 的目标、基线与期末目标值（教学岗普遍有 goal_update 权限）。
                    // 现在加了计划归属约束，并对「无匹配」按 ADR-018 返回 404——
                    // 否则越权写入会被静默伪装成操作成功。
                    if ($updateStmt->rowCount() === 0) {
                        if ($pdo->inTransaction()) $pdo->rollBack();
                        jsonResponse([
                            'success' => false,
                            'message' => '目标 #' . intval($goal['id']) . ' 不存在或不属于该计划，未做任何修改'
                        ], 404);
                    }
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
                        $index,
                        ...$monitorFields($goal)
                    ]);
                }
            }

            $pdo->commit();

            auditLog('save_goals', 'iep', 'iep_plan', $planId, '', null, null, '保存IEP目标');

            jsonResponse(['success' => true, 'message' => '目标保存成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '保存失败: ' . $e->getMessage()], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/progress - Record goal progress
    // ============================================================
    case 'progress':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
        }

        $input = getInput();
        $goalId = isset($input['goal_id']) ? intval($input['goal_id']) : 0;
        $recordedDate = isset($input['recorded_date']) ? $input['recorded_date'] : date('Y-m-d');
        $score = isset($input['score']) ? intval($input['score']) : 0;

        if ($goalId <= 0) {
            jsonResponse(['success' => false, 'message' => '目标ID不能为空', 'code' => 400], 400);
        }

        // 安全修复(P0-5)：原实现只校验 goal_update 功能权限，未校验目标所属
        // 学生是否在数据范围内。实测 teacher1 可对「自己读不到也改不了」的
        // 他班学生计划（plan 5 / student 3）成功写入达成度记录，
        // 直接污染该生 IEP 达成率与教学成效统计。
        requireGoalInScope($goalId);

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
            jsonResponse(['success' => false, 'message' => '记录失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/iep/approval-logs - Get approval history
    // ============================================================
    case 'approval-logs':
        requireAuth();

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }
        // 审批意见全文（含驳回理由、代签说明）不该对任何登录账号开放
        requireIepInScope($planId);

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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // GET /api/iep/goal_stats - Goal statistics
    // ============================================================
    case 'goal_stats':
        requireAuth();

        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
        if ($studentId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        }
        requireStudentInScope($studentId);

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
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
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
            jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format], 400);
        }

        try {
            $pdo = getDB();

            $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;
            $status = isset($_GET['status']) ? trim($_GET['status']) : '';

            // 修复(P2-7)：软删学生的历史 IEP 不再出现在列表里（防孤儿数据外泄）
            $where = ['p.deleted_at IS NULL', 's.deleted_at IS NULL'];
            $params = [];
            if ($studentId > 0) { $where[] = 'p.student_id = ?'; $params[] = $studentId; }
            if (!empty($status)) { $where[] = 'p.status = ?'; $params[] = $status; }
            $whereStr = implode(' AND ', $where);

            // 数据范围过滤：复用全库唯一实现（ADR-009）。
            // 原先此处是手抄的一份 if/elseif，且**没有 else 兜底**——
            // 遇到 'all' 或将来新增的 scope 类型时 $scopeClause 为空串，
            // 等于静默 fail-open 全量导出。改为统一实现后未知类型一律拒绝。
            $scope = getDataScope();
            [$scopeClause, $scopeParams] = pa_plan_scope_clause($scope);

            $queryParams = array_merge($params, $scopeParams);

            $sql = 'SELECT p.plan_code, s.name AS student_name, p.title, p.academic_year, p.semester,
                           p.start_date, p.end_date, u.real_name AS primary_teacher_name, p.status,
                           p.placement_type, p.meeting_date, p.next_review_date,
                           (SELECT COUNT(*) FROM iep_goals WHERE iep_plan_id = p.id AND deleted_at IS NULL) AS goal_count
                    FROM iep_plans p
                    LEFT JOIN students s ON p.student_id = s.id
                    LEFT JOIN users u ON p.primary_teacher_id = u.id
                    WHERE ' . $whereStr . $scopeClause . ' ORDER BY p.created_at DESC';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($queryParams);
            $data = $stmt->fetchAll();

            logDataScopeAccess('iep', $scope['type'], count($data));

            $headers = ['计划编号', '学生姓名', '计划标题', '学年', '学期', '开始日期', '结束日期', '主责教师', '状态', '安置形式', '会议日期', '下次评鉴日期', '目标数'];
            $rows = array_map(function ($r) {
                return [
                    $r['plan_code'] ?? '', $r['student_name'] ?? '', $r['title'] ?? '',
                    $r['academic_year'] ?? '', $r['semester'] ?? '', $r['start_date'] ?? '',
                    $r['end_date'] ?? '', $r['primary_teacher_name'] ?? '', $r['status'] ?? '',
                    $r['placement_type'] ?? '', $r['meeting_date'] ?? '', $r['next_review_date'] ?? '',
                    $r['goal_count'] ?? 0,
                ];
            }, $data);

            io_download($format, 'IEP计划', $headers, $rows);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '导出失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/iep/import - Import IEP plans (csv/xlsx/xls)
    // ============================================================
    case 'import':
        requireAuth();
        requirePermission('iep_import');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误'], 405);
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
            jsonResponse(['success' => false, 'message' => '缺少必需列: ' . implode('、', $map['missing'])], 400);
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

    // ============================================================
    // 6.1 GET /api/iep/objectives - 短期目标列表
    //     附带任务分析步骤 + trial 级数据汇总出的达成率
    // ============================================================
    case 'objectives':
        requireAuth();
        requirePermission('iep_view');

        $goalId = isset($_GET['goal_id']) ? intval($_GET['goal_id']) : 0;
        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;

        if ($goalId <= 0 && $planId <= 0) {
            jsonResponse(['success' => false, 'message' => 'goal_id 或 plan_id 不能为空', 'code' => 400], 400);
        }
        if ($goalId > 0) {
            requireGoalInScope($goalId);
        } else {
            requireIepInScope($planId);
        }

        try {
            $pdo    = getDB();
            $where  = 'o.deleted_at IS NULL';
            $params = [];
            if ($goalId > 0) {
                $where   .= ' AND o.goal_id = ?';
                $params[] = $goalId;
            } else {
                $where   .= ' AND o.iep_plan_id = ?';
                $params[] = $planId;
            }

            $sql = 'SELECT o.id, o.iep_plan_id, o.goal_id, o.objective_code, o.seq_no, o.title,
                           o.target_behavior, o.criteria, o.measurement_method, o.baseline_level,
                           o.target_level, o.mastery_pct, o.start_date, o.target_date, o.status,
                           o.sort_order, o.teaching_strategy, o.prompt_hierarchy,
                           COALESCE(pr.record_count, 0)   AS record_count,
                           COALESCE(pr.total_trials, 0)   AS total_trials,
                           COALESCE(pr.total_success, 0)  AS total_success,
                           COALESCE(pr.overall_pct, 0)    AS overall_pct,
                           pr.latest_pct, pr.latest_prompt_level, pr.last_record_date
                    FROM iep_objectives o
                    LEFT JOIN v_iep_objective_progress pr ON pr.objective_id = o.id
                    WHERE ' . $where . ' ORDER BY o.goal_id, o.sort_order, o.seq_no, o.id';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $list = $stmt->fetchAll();

            // 挂载任务分析步骤
            if (!empty($list)) {
                $ids = array_column($list, 'id');
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                $stp = $pdo->prepare(
                    'SELECT id, objective_id, step_no, title, description, teaching_prompt, is_critical, sort_order
                     FROM iep_objective_steps WHERE objective_id IN (' . $ph . ')
                     ORDER BY objective_id, sort_order, step_no'
                );
                $stp->execute($ids);
                $stepsMap = [];
                foreach ($stp->fetchAll() as $s) {
                    $stepsMap[$s['objective_id']][] = $s;
                }
                foreach ($list as &$row) {
                    $row['steps'] = $stepsMap[$row['id']] ?? [];
                }
                unset($row);
            }

            jsonResponse(['success' => true, 'data' => $list, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('iep/objectives error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.1 POST /api/iep/objective_save - 保存短期目标及其任务分析步骤
    // ============================================================
    case 'objective_save':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $user   = getCurrentUser();
        $objId  = isset($input['id']) ? intval($input['id']) : 0;
        $goalId = isset($input['goal_id']) ? intval($input['goal_id']) : 0;
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;

        // 范围校验：新建时必须能接触到该长期目标；编辑时以既有记录所属计划为准
        if ($objId > 0) {
            requireObjectiveInScope($objId);
            $planId = getObjectivePlanId($objId);
        } else {
            if ($goalId <= 0) {
                jsonResponse(['success' => false, 'message' => '所属长期目标不能为空', 'code' => 400], 400);
            }
            requireGoalInScope($goalId);
            $planId = getGoalPlanId($goalId);
        }

        $title = trim((string)($input['title'] ?? ''));
        if ($title === '') {
            jsonResponse(['success' => false, 'message' => '短期目标标题不能为空', 'code' => 400], 400);
        }

        $status = trim((string)($input['status'] ?? 'not_started'));
        $allowed = ['not_started', 'in_progress', 'mastered', 'not_mastered', 'discontinued'];
        if (!in_array($status, $allowed, true)) {
            $status = 'not_started';
        }
        $promptLevel = trim((string)($input['prompt_level'] ?? ''));
        $stepsIn = $input['steps'] ?? [];
        if (is_string($stepsIn)) { $stepsIn = json_decode($stepsIn, true) ?: []; }
        if (!is_array($stepsIn)) { $stepsIn = []; }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            if ($objId > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE iep_objectives SET title = ?, target_behavior = ?, criteria = ?,
                     measurement_method = ?, baseline_level = ?, target_level = ?, mastery_pct = ?,
                     start_date = ?, target_date = ?, status = ?, teaching_strategy = ?,
                     prompt_hierarchy = ?, sort_order = ?, updated_at = NOW()
                     WHERE id = ? AND deleted_at IS NULL'
                );
                $stmt->execute([
                    $title,
                    $input['target_behavior'] ?? null,
                    $input['criteria'] ?? null,
                    $input['measurement_method'] ?? null,
                    $input['baseline_level'] ?? null,
                    $input['target_level'] ?? null,
                    isset($input['mastery_pct']) ? floatval($input['mastery_pct']) : 80.00,
                    $input['start_date'] ?? null,
                    $input['target_date'] ?? null,
                    $status,
                    $input['teaching_strategy'] ?? null,
                    isset($input['prompt_hierarchy']) ? json_encode($input['prompt_hierarchy'], JSON_UNESCAPED_UNICODE) : null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0,
                    $objId
                ]);
            } else {
                $code = 'O-' . $planId . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
                $stmt = $pdo->prepare(
                    'INSERT INTO iep_objectives
                     (iep_plan_id, goal_id, objective_code, seq_no, title, target_behavior, criteria,
                      measurement_method, baseline_level, target_level, mastery_pct, start_date,
                      target_date, status, teaching_strategy, prompt_hierarchy, sort_order,
                      created_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
                );
                $stmt->execute([
                    $planId, $goalId, $code,
                    isset($input['seq_no']) ? intval($input['seq_no']) : 1,
                    $title,
                    $input['target_behavior'] ?? null,
                    $input['criteria'] ?? null,
                    $input['measurement_method'] ?? null,
                    $input['baseline_level'] ?? null,
                    $input['target_level'] ?? null,
                    isset($input['mastery_pct']) ? floatval($input['mastery_pct']) : 80.00,
                    $input['start_date'] ?? null,
                    $input['target_date'] ?? null,
                    $status,
                    $input['teaching_strategy'] ?? null,
                    isset($input['prompt_hierarchy']) ? json_encode($input['prompt_hierarchy'], JSON_UNESCAPED_UNICODE) : null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0,
                    intval($user['sub'] ?? 0) ?: null
                ]);
                $objId = intval($pdo->lastInsertId());
            }

            // 任务分析步骤：全量替换（步骤天然与目标强绑定，增量 diff 收益低于复杂度）
            $delStep = $pdo->prepare('DELETE FROM iep_objective_steps WHERE objective_id = ?');
            $delStep->execute([$objId]);
            if (!empty($stepsIn)) {
                $insStep = $pdo->prepare(
                    'INSERT INTO iep_objective_steps
                     (objective_id, step_no, title, description, teaching_prompt, is_critical, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)'
                );
                $n = 0;
                foreach ($stepsIn as $s) {
                    if (!is_array($s)) { continue; }
                    $stepTitle = trim((string)($s['title'] ?? ''));
                    if ($stepTitle === '') { continue; }
                    $n++;
                    $insStep->execute([
                        $objId, $n, $stepTitle,
                        $s['description'] ?? null,
                        $s['teaching_prompt'] ?? null,
                        !empty($s['is_critical']) ? 1 : 0,
                        $n
                    ]);
                }
            }

            $pdo->commit();
            auditLog('objective_save', 'iep', 'iep_objective', $objId, $title, null, null, '保存短期目标');

            jsonResponse(['success' => true, 'data' => ['id' => $objId], 'message' => '保存成功']);
        } catch (PDOException $e) {
            $pdo->rollBack();
            error_log('iep/objective_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.1 POST /api/iep/objective_delete - 软删除短期目标
    // ============================================================
    case 'objective_delete':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $objId = isset($input['id']) ? intval($input['id']) : 0;
        requireObjectiveInScope($objId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare('UPDATE iep_objectives SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$objId]);

            auditLog('objective_delete', 'iep', 'iep_objective', $objId, '', null, null, '删除短期目标');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            error_log('iep/objective_delete error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.1 GET /api/iep/objective_records - 短期目标的 trial 级达成数据
    // ============================================================
    case 'objective_records':
        requireAuth();
        requirePermission('record_view');

        $objId = isset($_GET['objective_id']) ? intval($_GET['objective_id']) : 0;
        requireObjectiveInScope($objId);

        $limit = isset($_GET['pageSize']) ? intval($_GET['pageSize']) : 100;
        if ($limit <= 0 || $limit > 500) { $limit = 100; }

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT r.id, r.objective_id, r.step_id, r.record_date, r.session_type, r.context,
                        r.trial_count, r.success_count, r.achievement_pct, r.prompt_level,
                        r.is_generalized, r.duration_minutes, r.notes, r.recorded_by,
                        u.real_name AS recorder_name, st.title AS step_title
                 FROM iep_objective_records r
                 LEFT JOIN users u   ON r.recorded_by = u.id
                 LEFT JOIN iep_objective_steps st ON r.step_id = st.id
                 WHERE r.objective_id = ? AND r.deleted_at IS NULL
                 ORDER BY r.record_date DESC, r.id DESC LIMIT ' . $limit
            );
            $stmt->execute([$objId]);
            jsonResponse(['success' => true, 'data' => $stmt->fetchAll(), 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('iep/objective_records error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.1 POST /api/iep/objective_record_add - 记录一次教学试次
    //     达成率由生成列自动计算，并在连续达标时自动标记「已掌握」
    // ============================================================
    case 'objective_record_add':
        requireAuth();
        requirePermission('record_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $user  = getCurrentUser();
        $objId = isset($input['objective_id']) ? intval($input['objective_id']) : 0;
        requireObjectiveInScope($objId);

        $trial   = isset($input['trial_count']) ? intval($input['trial_count']) : 1;
        $success = isset($input['success_count']) ? intval($input['success_count']) : 0;
        if ($trial <= 0 || $trial > 500) {
            jsonResponse(['success' => false, 'message' => '试次数须在 1~500 之间', 'code' => 400], 400);
        }
        if ($success < 0 || $success > $trial) {
            jsonResponse(['success' => false, 'message' => '成功数不能大于试次数', 'code' => 400], 400);
        }

        $recordDate = trim((string)($input['record_date'] ?? ''));
        if ($recordDate === '') { $recordDate = date('Y-m-d'); }

        $promptLevel = trim((string)($input['prompt_level'] ?? 'independent'));
        if (!in_array($promptLevel, ['independent', 'gesture', 'verbal', 'model', 'physical'], true)) {
            $promptLevel = 'independent';
        }
        $stepId = isset($input['step_id']) ? intval($input['step_id']) : 0;
        if ($stepId <= 0) { $stepId = null; }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            $ins = $pdo->prepare(
                'INSERT INTO iep_objective_records
                 (objective_id, step_id, record_date, session_type, context, trial_count, success_count,
                  prompt_level, is_generalized, duration_minutes, notes, recorded_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $objId, $stepId, $recordDate,
                $input['session_type'] ?? null,
                $input['context'] ?? null,
                $trial, $success, $promptLevel,
                !empty($input['is_generalized']) ? 1 : 0,
                isset($input['duration_minutes']) ? intval($input['duration_minutes']) : null,
                $input['notes'] ?? null,
                intval($user['sub'])
            ]);

            // 自动掌握判定：近 3 次记录（含本次）均达到该目标的掌握阈值 -> mastered
            // 这是「连续 3 天/3 次 ≥ mastery_pct」这一常用标准的直接落地，
            // 避免教师每次手工改状态，也让档案留痕与自动判定一致。
            $objStmt = $pdo->prepare('SELECT mastery_pct, status FROM iep_objectives WHERE id = ? AND deleted_at IS NULL');
            $objStmt->execute([$objId]);
            $obj = $objStmt->fetch(PDO::FETCH_ASSOC);
            $autoStatus = null;
            if ($obj && !in_array($obj['status'], ['discontinued'], true)) {
                $mastery = floatval($obj['mastery_pct']);
                $last = $pdo->prepare(
                    'SELECT achievement_pct FROM iep_objective_records
                     WHERE objective_id = ? AND deleted_at IS NULL
                     ORDER BY record_date DESC, id DESC LIMIT 3'
                );
                $last->execute([$objId]);
                $recent = array_map('floatval', $last->fetchAll(PDO::FETCH_COLUMN));
                $meets  = count($recent) >= 3;
                foreach ($recent as $pct) {
                    if ($pct < $mastery) { $meets = false; }
                }
                if ($meets) {
                    $autoStatus = 'mastered';
                } elseif ($obj['status'] === 'not_started' || $obj['status'] === 'mastered') {
                    $autoStatus = 'in_progress';
                }
                if ($autoStatus !== null) {
                    $upd = $pdo->prepare('UPDATE iep_objectives SET status = ?, updated_at = NOW() WHERE id = ?');
                    $upd->execute([$autoStatus, $objId]);
                }
            }

            $pdo->commit();

            jsonResponse([
                'success' => true,
                'data'    => [
                    'achievement_pct'   => $trial > 0 ? round($success * 100.0 / $trial, 2) : 0,
                    'objective_status'  => $autoStatus ?? ($obj['status'] ?? null)
                ],
                'message' => '记录成功'
            ]);
        } catch (PDOException $e) {
            $pdo->rollBack();
            error_log('iep/objective_record_add error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '记录失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.1 POST /api/iep/goal_rollup - 由短期目标数据汇总长期目标状态
    //     让长期目标的达成率不再依赖主观 0~5 打分
    // ============================================================
    case 'goal_rollup':
        requireAuth();
        requirePermission('goal_update');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $goalId = isset($input['goal_id']) ? intval($input['goal_id']) : 0;
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;

        if ($goalId > 0) {
            requireGoalInScope($goalId);
        } elseif ($planId > 0) {
            requireIepInScope($planId);
        } else {
            jsonResponse(['success' => false, 'message' => 'goal_id 或 plan_id 不能为空', 'code' => 400], 400);
        }

        try {
            $pdo    = getDB();
            $where  = 'r.objective_count > 0';
            $params = [];
            if ($goalId > 0) {
                $where   .= ' AND r.goal_id = ?';
                $params[] = $goalId;
            } else {
                $where   .= ' AND r.iep_plan_id = ?';
                $params[] = $planId;
            }

            $sel = $pdo->prepare(
                'SELECT goal_id, objective_count, mastered_count, avg_pct, suggested_status
                 FROM v_iep_goal_rollup r WHERE ' . $where
            );
            $sel->execute($params);
            $rows = $sel->fetchAll();

            $upd = $pdo->prepare(
                'UPDATE iep_goals SET progress_percentage = ?, status = ?, updated_at = NOW()
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $updated = [];
            foreach ($rows as $r) {
                $upd->execute([floatval($r['avg_pct']), $r['suggested_status'], intval($r['goal_id'])]);
                $updated[] = [
                    'goal_id'          => intval($r['goal_id']),
                    'objective_count'  => intval($r['objective_count']),
                    'mastered_count'   => intval($r['mastered_count']),
                    'avg_pct'          => floatval($r['avg_pct']),
                    'suggested_status' => $r['suggested_status']
                ];
            }

            jsonResponse([
                'success' => true,
                'data'    => ['updated' => $updated, 'count' => count($updated)],
                'message' => '汇总完成：更新 ' . count($updated) . ' 条长期目标'
            ]);
        } catch (PDOException $e) {
            error_log('iep/goal_rollup error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '汇总失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 GET /api/iep/related_services - 相关服务台账
    // ============================================================
    case 'related_services':
        requireAuth();
        requirePermission('iep_view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        requireIepInScope($planId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT * FROM iep_related_services
                 WHERE iep_plan_id = ? AND deleted_at IS NULL ORDER BY sort_order, id'
            );
            $stmt->execute([$planId]);
            jsonResponse(['success' => true, 'data' => $stmt->fetchAll(), 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('iep/related_services error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 POST /api/iep/related_service_save - 开具/更新一项相关服务
    // ============================================================
    case 'related_service_save':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $svcId  = isset($input['id']) ? intval($input['id']) : 0;
        requireIepInScope($planId);

        $svcName = trim((string)($input['service_name'] ?? ''));
        if ($svcName === '') {
            jsonResponse(['success' => false, 'message' => '服务名称不能为空', 'code' => 400], 400);
        }
        $status = trim((string)($input['status'] ?? 'planned'));
        if (!in_array($status, ['planned', 'active', 'completed', 'suspended'], true)) {
            $status = 'planned';
        }
        $planned   = isset($input['planned_sessions']) ? intval($input['planned_sessions']) : 0;
        $completed = isset($input['completed_sessions']) ? intval($input['completed_sessions']) : 0;
        if ($completed > $planned && $planned > 0) {
            jsonResponse(['success' => false, 'message' => '已完成次数不能大于计划次数', 'code' => 400], 400);
        }

        try {
            $pdo = getDB();
            if ($svcId > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE iep_related_services SET service_code = ?, service_name = ?, provider = ?,
                     provider_role = ?, frequency_per_week = ?, minutes_per_session = ?,
                     planned_sessions = ?, completed_sessions = ?, location = ?, start_date = ?,
                     end_date = ?, status = ?, remark = ?, sort_order = ?, updated_at = NOW()
                     WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
                );
                $stmt->execute([
                    $input['service_code'] ?? null, $svcName,
                    $input['provider'] ?? null, $input['provider_role'] ?? null,
                    isset($input['frequency_per_week']) ? floatval($input['frequency_per_week']) : 1.0,
                    isset($input['minutes_per_session']) ? intval($input['minutes_per_session']) : 40,
                    $planned, $completed,
                    $input['location'] ?? null, $input['start_date'] ?? null, $input['end_date'] ?? null,
                    $status, $input['remark'] ?? null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0,
                    $svcId, $planId
                ]);
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO iep_related_services
                     (iep_plan_id, service_code, service_name, provider, provider_role, frequency_per_week,
                      minutes_per_session, planned_sessions, completed_sessions, location, start_date,
                      end_date, status, remark, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    $planId, $input['service_code'] ?? null, $svcName,
                    $input['provider'] ?? null, $input['provider_role'] ?? null,
                    isset($input['frequency_per_week']) ? floatval($input['frequency_per_week']) : 1.0,
                    isset($input['minutes_per_session']) ? intval($input['minutes_per_session']) : 40,
                    $planned, $completed,
                    $input['location'] ?? null, $input['start_date'] ?? null, $input['end_date'] ?? null,
                    $status, $input['remark'] ?? null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0
                ]);
                $svcId = intval($pdo->lastInsertId());
            }

            auditLog('related_service_save', 'iep', 'iep_related_service', $svcId, $svcName, null, null, '保存相关服务');

            jsonResponse(['success' => true, 'data' => ['id' => $svcId], 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('iep/related_service_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 POST /api/iep/related_service_delete
    // ============================================================
    case 'related_service_delete':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $svcId  = isset($input['id']) ? intval($input['id']) : 0;
        requireIepInScope($planId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'UPDATE iep_related_services SET deleted_at = NOW()
                 WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$svcId, $planId]);
            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            error_log('iep/related_service_delete error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 GET /api/iep/meeting_participants - IEP 会议参与人
    // ============================================================
    case 'meeting_participants':
        requireAuth();
        requirePermission('iep_view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        requireIepInScope($planId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT * FROM iep_meeting_participants WHERE iep_plan_id = ? ORDER BY sort_order, id'
            );
            $stmt->execute([$planId]);
            jsonResponse(['success' => true, 'data' => $stmt->fetchAll(), 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('iep/meeting_participants error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 POST /api/iep/meeting_participant_save - 记录参会人与签到
    // ============================================================
    case 'meeting_participant_save':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $planId = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
        $mpId   = isset($input['id']) ? intval($input['id']) : 0;
        requireIepInScope($planId);

        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') {
            jsonResponse(['success' => false, 'message' => '参与人姓名不能为空', 'code' => 400], 400);
        }
        $pType = trim((string)($input['participant_type'] ?? 'school'));
        if (!in_array($pType, ['school', 'parent', 'student', 'specialist', 'external'], true)) {
            $pType = 'school';
        }
        $attend = trim((string)($input['attendance'] ?? 'present'));
        if (!in_array($attend, ['present', 'proxy', 'absent'], true)) {
            $attend = 'present';
        }
        $userId   = isset($input['user_id']) ? intval($input['user_id']) : 0;
        $parentId = isset($input['parent_id']) ? intval($input['parent_id']) : 0;

        try {
            $pdo = getDB();
            if ($mpId > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE iep_meeting_participants SET participant_type = ?, user_id = ?, parent_id = ?,
                     name = ?, role = ?, attendance = ?, proxy_note = ?, signed_at = ?, remark = ?,
                     sort_order = ? WHERE id = ? AND iep_plan_id = ?'
                );
                $stmt->execute([
                    $pType, $userId ?: null, $parentId ?: null, $name,
                    $input['role'] ?? null, $attend, $input['proxy_note'] ?? null,
                    $input['signed_at'] ?? null, $input['remark'] ?? null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0,
                    $mpId, $planId
                ]);
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO iep_meeting_participants
                     (iep_plan_id, participant_type, user_id, parent_id, name, role, attendance,
                      proxy_note, signed_at, remark, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    $planId, $pType, $userId ?: null, $parentId ?: null, $name,
                    $input['role'] ?? null, $attend, $input['proxy_note'] ?? null,
                    $input['signed_at'] ?? null, $input['remark'] ?? null,
                    isset($input['sort_order']) ? intval($input['sort_order']) : 0
                ]);
                $mpId = intval($pdo->lastInsertId());
            }

            jsonResponse(['success' => true, 'data' => ['id' => $mpId], 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('iep/meeting_participant_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // 6.2 GET /api/iep/meta - 特教专业字典（安置形式/相关服务/沟通方式）
    // ============================================================
    case 'meta':
        requireAuth();
        requirePermission('iep_view');

        try {
            $pdo = getDB();

            $placement = $pdo->query(
                "SELECT SUBSTRING(COLUMN_TYPE, 6, CHAR_LENGTH(COLUMN_TYPE) - 6) AS csv
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iep_plans' AND COLUMN_NAME = 'placement_type'"
            )->fetchColumn();
            $placementTypes = [];
            if ($placement) {
                foreach (explode(',', $placement) as $v) {
                    $placementTypes[] = trim($v, "'\" ");
                }
            }

            $services = $pdo->query(
                'SELECT code, name, category, description FROM dict_related_services
                 WHERE is_active = 1 ORDER BY sort_order, id'
            )->fetchAll();

            $comm = $pdo->query(
                "SELECT code, name, value FROM dict_common
                 WHERE category = 'communication_method' AND is_active = 1 ORDER BY sort_order, id"
            )->fetchAll();

            // v13：目标领域此前只在前端硬编码，dict_common 建了却无人消费，
            // 导致下拉与库里已有数据口径分裂。现统一由后端下发（name = 显示值，
            // 与 iep_goals.area 取值一致），前端常量仅作网络失败时的兜底。
            $goalAreas = $pdo->query(
                "SELECT name FROM dict_common
                 WHERE category = 'goal_area' AND is_active = 1 ORDER BY sort_order, id"
            )->fetchAll(PDO::FETCH_COLUMN);

            jsonResponse([
                'success' => true,
                'data'    => [
                    'placement_types'        => $placementTypes,
                    'related_services'       => $services,
                    'communication_methods'  => $comm,
                    'goal_areas'             => $goalAreas
                ],
                'message' => '获取成功'
            ]);
        } catch (PDOException $e) {
            error_log('iep/meta error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

require_once __DIR__ . '/progress_analysis.php';

// ============================================================================
// v7 进度智能内核（Progress Intelligence Core）
//   取数与算法全部下沉到 progress_analysis.php，本文件只负责鉴权、入参与输出，
//   保证「图上看到的」与「今日工作台将来看到的」是同一份口径。
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/iep/progress_series - 目标的历史进度数据点
//   修复 P0-0：iep_goal_progress 此前只有写入路径（iep/progress），
//   前端拿不到任何历史数据，进度图只能用「本次会话刚提交的那条」冒充趋势。
//   数据从进库那天起就存在，但从未被读过 —— 这是本模块最严重的功能性缺陷。
// ----------------------------------------------------------------------------
case 'progress_series':
    requireAuth();
    requirePermission('iep_view');

    $seriesGoalId = isset($_GET['goal_id']) ? intval($_GET['goal_id']) : 0;
    requireGoalInScope($seriesGoalId);

    $seriesPrefer = trim((string)($_GET['source'] ?? 'auto'));
    if (!in_array($seriesPrefer, ['auto', 'trial', 'rating'], true)) {
        $seriesPrefer = 'auto';
    }

    try {
        $pdo    = getDB();
        $series = pa_fetch_series($pdo, $seriesGoalId, $seriesPrefer);
        jsonResponse([
            'success' => true,
            'data'    => [
                'goal_id' => $seriesGoalId,
                'points'  => $series['points'],
                'source'  => $series['source'],
                'meta'    => $series['meta']
            ],
            'message' => '获取成功'
        ]);
    } catch (Throwable $e) {
        error_log('iep/progress_series error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
    }
    break;

// ----------------------------------------------------------------------------
// GET /api/iep/progress_analysis - 单目标或整计划的进度分析
//   返回：数据点 / aim line（取代硬编码 y=80）/ 趋势线 / 决策结论 / 干预调整点
// ----------------------------------------------------------------------------
case 'progress_analysis':
    requireAuth();
    requirePermission('iep_view');

    $paGoalId = isset($_GET['goal_id']) ? intval($_GET['goal_id']) : 0;
    $paPlanId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;

    if ($paGoalId <= 0 && $paPlanId <= 0) {
        jsonResponse(['success' => false, 'message' => 'goal_id 或 plan_id 不能为空', 'code' => 400], 400);
    }

    if ($paGoalId > 0) {
        requireGoalInScope($paGoalId);
    } else {
        requireIepInScope($paPlanId);
    }

    try {
        $pdo  = getDB();
        $list = [];

        if ($paGoalId > 0) {
            $one = pa_analyze_goal($pdo, $paGoalId);
            if ($one !== null) $list[] = $one;
        } else {
            $gStmt = $pdo->prepare(
                'SELECT id FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL ORDER BY area, sort_order'
            );
            $gStmt->execute([$paPlanId]);
            foreach ($gStmt->fetchAll(PDO::FETCH_COLUMN) as $gid) {
                $one = pa_analyze_goal($pdo, (int)$gid);
                if ($one !== null) $list[] = $one;
            }
        }

        // 计划级汇总：为「今日工作台 / 需关注目标」预留的统一统计口径
        $summary = ['adjust' => 0, 'watch' => 0, 'on_track' => 0, 'stale' => 0, 'mastered' => 0, 'nodata' => 0];
        foreach ($list as $it) {
            $lv = $it['decision']['level'] ?? 'nodata';
            if (isset($summary[$lv])) $summary[$lv]++;
        }

        jsonResponse([
            'success' => true,
            'data'    => [
                'goals'   => $list,
                'summary' => $summary
            ],
            'message' => '获取成功'
        ]);
    } catch (Throwable $e) {
        error_log('iep/progress_analysis error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '分析失败', 'code' => 500], 500);
    }
    break;

// ----------------------------------------------------------------------------
// GET /api/iep/adjustments - 干预调整留痕列表
// ----------------------------------------------------------------------------
case 'adjustments':
    requireAuth();
    requirePermission('iep_view');

    $adjPlanId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
    $adjGoalId = isset($_GET['goal_id']) ? intval($_GET['goal_id']) : 0;

    if ($adjPlanId <= 0 && $adjGoalId <= 0) {
        jsonResponse(['success' => false, 'message' => 'plan_id 或 goal_id 不能为空', 'code' => 400], 400);
    }
    if ($adjGoalId > 0) {
        requireGoalInScope($adjGoalId);
    } else {
        requireIepInScope($adjPlanId);
    }

    try {
        $pdo  = getDB();
        $bind = [];
        if ($adjGoalId > 0) {
            $sql = 'SELECT a.*, u.real_name AS decided_by_real_name, g.title AS goal_title
                      FROM iep_intervention_adjustments a
                      LEFT JOIN users u ON a.decided_by = u.id
                      LEFT JOIN iep_goals g ON a.goal_id = g.id
                     WHERE a.goal_id = ? AND a.deleted_at IS NULL';
            $bind[] = $adjGoalId;
        } elseif ($adjPlanId > 0) {
            $sql = 'SELECT a.*, u.real_name AS decided_by_real_name, g.title AS goal_title
                      FROM iep_intervention_adjustments a
                      LEFT JOIN users u ON a.decided_by = u.id
                      LEFT JOIN iep_goals g ON a.goal_id = g.id
                     WHERE a.iep_plan_id = ? AND a.deleted_at IS NULL';
            $bind[] = $adjPlanId;
        }
        $sql .= ' ORDER BY a.adjusted_at DESC, a.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($bind);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC), 'message' => '获取成功']);
    } catch (Throwable $e) {
        error_log('iep/adjustments error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
    }
    break;

// ----------------------------------------------------------------------------
// POST /api/iep/adjustment_save - 记录一次干预调整（DBI Step 4）
//   系统不替团队做决定：change_detail 必填且不得为空壳，
//   hypothesis 与 review_due_date 鼓励填写，用于闭合 Step 3 与 Step 5。
// ----------------------------------------------------------------------------
case 'adjustment_save':
    requireAuth();
    requirePermission('goal_update');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
    }

    $input   = getInput();
    $user    = getCurrentUser();
    $userId  = isset($user['sub']) ? intval($user['sub']) : 0;
    $adjId   = isset($input['id']) ? intval($input['id']) : 0;
    $planId2 = isset($input['plan_id']) ? intval($input['plan_id']) : 0;
    $goalId2 = isset($input['goal_id']) ? intval($input['goal_id']) : 0;

    if ($goalId2 > 0) {
        requireGoalInScope($goalId2);
        $planId2 = getGoalPlanId($goalId2);
    } elseif ($planId2 > 0) {
        requireIepInScope($planId2);
    } else {
        jsonResponse(['success' => false, 'message' => 'plan_id 或 goal_id 不能为空', 'code' => 400], 400);
    }

    $changeDetail = trim((string)($input['change_detail'] ?? ''));
    if ($changeDetail === '') {
        jsonResponse([
            'success' => false,
            'message' => '请写清「具体改了什么」——这是后续复盘的依据，不能留空',
            'code'    => 400
        ], 400);
    }

    $triggerType = trim((string)($input['trigger_type'] ?? 'team_decision'));
    if (!in_array($triggerType,
        ['below_aimline', 'plateau', 'regression', 'mastered', 'parent_request', 'team_decision', 'other'], true)) {
        $triggerType = 'team_decision';
    }
    $changeType = trim((string)($input['change_type'] ?? 'other'));
    if (!in_array($changeType,
        ['dosage', 'prompt_level', 'material', 'grouping', 'schedule', 'behavior_support',
         'reinforcement', 'task_analysis', 'environment', 'other'], true)) {
        $changeType = 'other';
    }
    $outcome = trim((string)($input['outcome'] ?? 'pending'));
    if (!in_array($outcome, ['effective', 'partially_effective', 'ineffective', 'pending'], true)) {
        $outcome = 'pending';
    }

    $adjustedAt = trim((string)($input['adjusted_at'] ?? ''));
    if ($adjustedAt === '') { $adjustedAt = date('Y-m-d'); }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $adjustedAt)) {
        jsonResponse(['success' => false, 'message' => '调整日期格式应为 YYYY-MM-DD', 'code' => 400], 400);
    }

    $reviewDue = trim((string)($input['review_due_date'] ?? ''));
    if ($reviewDue !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $reviewDue)) {
        jsonResponse(['success' => false, 'message' => '再监控到期日格式应为 YYYY-MM-DD', 'code' => 400], 400);
    }

    $objId2 = isset($input['objective_id']) ? intval($input['objective_id']) : 0;

    try {
        $pdo = getDB();

        if ($adjId > 0) {
            $stmt = $pdo->prepare(
                'UPDATE iep_intervention_adjustments SET
                    trigger_type = ?, trigger_detail = ?, hypothesis = ?,
                    change_type = ?, change_detail = ?, adjusted_at = ?,
                    review_due_date = ?, outcome = ?, outcome_note = ?, decided_by = ?
                 WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([
                $triggerType,
                trim((string)($input['trigger_detail'] ?? '')) ?: null,
                trim((string)($input['hypothesis'] ?? '')) ?: null,
                $changeType,
                $changeDetail,
                $adjustedAt,
                $reviewDue !== '' ? $reviewDue : null,
                $outcome,
                trim((string)($input['outcome_note'] ?? '')) ?: null,
                $userId,
                $adjId, $planId2
            ]);
            $newId = $adjId;
            $act   = 'update';
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO iep_intervention_adjustments
                 (iep_plan_id, goal_id, objective_id, adjusted_at, trigger_type, trigger_detail,
                  hypothesis, change_type, change_detail, decided_by, decided_by_name,
                  review_due_date, outcome, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $planId2,
                $goalId2 > 0 ? $goalId2 : null,
                $objId2 > 0 ? $objId2 : null,
                $adjustedAt,
                $triggerType,
                trim((string)($input['trigger_detail'] ?? '')) ?: null,
                trim((string)($input['hypothesis'] ?? '')) ?: null,
                $changeType,
                $changeDetail,
                $userId,
                $user['name'] ?? null,
                $reviewDue !== '' ? $reviewDue : null,
                $outcome,
                $userId
            ]);
            $newId = intval($pdo->lastInsertId());
            $act   = 'create';
        }

        auditLog($act, 'iep', 'intervention_adjustment', intval($newId), '', null, null,
                 '记录干预调整：' . mb_substr($changeDetail, 0, 40, 'UTF-8'));

        jsonResponse(['success' => true, 'data' => ['id' => $newId], 'message' => '保存成功']);
    } catch (Throwable $e) {
        error_log('iep/adjustment_save error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
    }
    break;

// ----------------------------------------------------------------------------
// POST /api/iep/adjustment_delete - 软删除干预调整记录
// ----------------------------------------------------------------------------
case 'adjustment_delete':
    requireAuth();
    requirePermission('goal_update');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
    }

    $input  = getInput();
    $delId  = isset($input['id']) ? intval($input['id']) : 0;
    if ($delId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误', 'code' => 400], 400);
    }

    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare('SELECT iep_plan_id FROM iep_intervention_adjustments WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$delId]);
        $row  = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            jsonResponse(['success' => false, 'message' => '记录不存在', 'code' => 404], 404);
        }
        requireIepInScope((int)$row['iep_plan_id']);

        $del = $pdo->prepare('UPDATE iep_intervention_adjustments SET deleted_at = NOW() WHERE id = ?');
        $del->execute([$delId]);

        auditLog('delete', 'iep', 'intervention_adjustment', $delId, '', null, null, '删除干预调整记录');
        jsonResponse(['success' => true, 'message' => '删除成功']);
    } catch (Throwable $e) {
        error_log('iep/adjustment_delete error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
    }
    break;

// ----------------------------------------------------------------------------
// GET /api/iep/consistency_check - IEP 内在一致性质检
//   把 IEP 质量量规固化成可执行规则：不属于或不完整的问题在提交审核前被拦下，
//   而不是等到上级审计或家长质疑时才被发现。
// ----------------------------------------------------------------------------
case 'consistency_check':
    requireAuth();
    requirePermission('iep_view');

    $ccPlanId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
    if ($ccPlanId <= 0) {
        jsonResponse(['success' => false, 'message' => 'plan_id 不能为空', 'code' => 400], 400);
    }
    requireIepInScope($ccPlanId);

    try {
        $pdo    = getDB();
        $result = pa_consistency_check($pdo, $ccPlanId);
        jsonResponse([
            'success' => true,
            'data'    => $result,
            'message' => $result['passed'] ? '通过一致性质检' : '存在必须处理的问题'
        ]);
    } catch (Throwable $e) {
        error_log('iep/consistency_check error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '质检失败', 'code' => 500], 500);
    }
    break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的IEP操作: ' . $action], 404);
}
