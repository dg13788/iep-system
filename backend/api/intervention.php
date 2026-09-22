<?php
/**
 * Intervention Module - 行为干预计划（BIP）与行为事件台账
 *
 * 对应《IEP系统_部署运行与深度审查报告_20260917》6.5：
 *   针对自闭症谱系与重度智力障碍学生，BIP（前因 A — 行为 B — 后果 C 分析、
 *   强化策略、危机处置流程）与沟通方式一样属于不可缺失的专业要素。
 *   当前系统只有 IEP 目标里的 area='情绪行为'，无法承载一份完整的 BIP。
 *
 * Endpoints:
 *   GET  /api/intervention/bip_list      - 学生/范围下的 BIP 列表
 *   GET  /api/intervention/bip_get       - BIP 详情（含 ABC 分析与替代行为）
 *   POST /api/intervention/bip_save      - 新建/更新 BIP
 *   POST /api/intervention/bip_delete    - 软删除 BIP
 *   GET  /api/intervention/incidents     - 行为事件台账
 *   POST /api/intervention/incident_add  - 登记一次行为事件（检验干预有效性）
 */

require_once __DIR__ . '/config.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/intervention/bip_list - BIP 列表
    // ============================================================
    case 'bip_list':
        requireAuth();
        requirePermission('iep_view');

        $studentId = isset($_GET['student_id']) ? intval($_GET['student_id']) : 0;

        try {
            $pdo = getDB();

            if ($studentId > 0) {
                requireStudentInScope($studentId);
                // applyStudentScope() 返回的是不含 AND 的条件片段，拼接时必须自行补上
                // （与 students.php 的 $scopeClause = ' AND ' . $scopeSql 惯例一致）
                [$scopeSql, $scopeParams] = applyStudentScope('s');
                $scopeClause = ' AND ' . $scopeSql;
                $stmt = $pdo->prepare(
                    'SELECT b.id, b.plan_code, b.student_id, b.target_behavior, b.behavior_function,
                            b.status, b.start_date, b.next_review_date,
                            COUNT(r.id) AS incident_count
                     FROM behavior_intervention_plans b
                     INNER JOIN students s ON s.id = b.student_id
                     LEFT JOIN bip_incident_records r ON r.bip_id = b.id
                     WHERE b.deleted_at IS NULL AND b.student_id = ? ' . $scopeClause . '
                     GROUP BY b.id ORDER BY b.status, b.id DESC'
                );
                $stmt->execute(array_merge([$studentId], $scopeParams));
            } else {
                [$scopeSql, $scopeParams] = applyStudentScope('s');
                $scopeClause = ' AND ' . $scopeSql;
                $limit = isset($_GET['pageSize']) ? intval($_GET['pageSize']) : 50;
                if ($limit <= 0 || $limit > 200) { $limit = 50; }
                $stmt = $pdo->prepare(
                    'SELECT b.id, b.plan_code, b.student_id, b.target_behavior, b.behavior_function,
                            b.status, b.start_date, b.next_review_date,
                            COUNT(r.id) AS incident_count, s.name AS student_name
                     FROM behavior_intervention_plans b
                     INNER JOIN students s ON s.id = b.student_id
                     LEFT JOIN bip_incident_records r ON r.bip_id = b.id
                     WHERE b.deleted_at IS NULL ' . $scopeClause . '
                     GROUP BY b.id ORDER BY b.status, b.id DESC LIMIT ' . $limit
                );
                $stmt->execute($scopeParams);
            }

            jsonResponse(['success' => true, 'data' => $stmt->fetchAll(), 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('intervention/bip_list error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // GET /api/intervention/bip_get - BIP 详情
    // ============================================================
    case 'bip_get':
        requireAuth();
        requirePermission('iep_view');

        $bipId = isset($_GET['id']) ? intval($_GET['id']) : 0;
        requireBipInScope($bipId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT b.*, s.name AS student_name
                 FROM behavior_intervention_plans b
                 INNER JOIN students s ON s.id = b.student_id
                 WHERE b.id = ? AND b.deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$bipId]);
            $row = $stmt->fetch();
            if (!$row) {
                jsonResponse(['success' => false, 'message' => 'BIP 不存在', 'code' => 404], 404);
            }
            jsonResponse(['success' => true, 'data' => $row, 'message' => '获取成功']);
        } catch (PDOException $e) {
            error_log('intervention/bip_get error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/intervention/bip_save - 新建/更新 BIP
    // ============================================================
    case 'bip_save':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $user  = getCurrentUser();
        $bipId = isset($input['id']) ? intval($input['id']) : 0;

        if ($bipId > 0) {
            requireBipInScope($bipId);
            $st = getDB()->prepare('SELECT student_id FROM behavior_intervention_plans WHERE id = ?');
            $st->execute([$bipId]);
            $studentId = intval($st->fetchColumn());
        } else {
            $studentId = isset($input['student_id']) ? intval($input['student_id']) : 0;
            requireStudentInScope($studentId);
        }

        $targetBehavior = trim((string)($input['target_behavior'] ?? ''));
        if ($targetBehavior === '') {
            jsonResponse(['success' => false, 'message' => '目标行为不能为空', 'code' => 400], 400);
        }
        $status = trim((string)($input['status'] ?? 'draft'));
        if (!in_array($status, ['draft', 'active', 'revised', 'closed'], true)) {
            $status = 'draft';
        }
        $iepPlanId = isset($input['iep_plan_id']) ? intval($input['iep_plan_id']) : 0;
        if ($iepPlanId > 0) {
            requireIepInScope($iepPlanId);
        }

        try {
            $pdo = getDB();

            if ($bipId > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE behavior_intervention_plans SET
                        student_id = ?, iep_plan_id = ?, target_behavior = ?, behavior_function = ?,
                        antecedent = ?, behavior_desc = ?, consequence = ?, setting_events = ?,
                        replacement_behavior = ?, prevention_strategy = ?, reinforcement_strategy = ?,
                        reinforcement_schedule = ?, consequence_strategy = ?, crisis_procedure = ?,
                        start_date = ?, review_cycle_days = ?, next_review_date = ?, status = ?,
                        updated_at = NOW()
                     WHERE id = ? AND deleted_at IS NULL'
                );
                $stmt->execute([
                    $studentId, $iepPlanId ?: null, $targetBehavior,
                    $input['behavior_function'] ?? null,
                    $input['antecedent'] ?? null, $input['behavior_desc'] ?? null,
                    $input['consequence'] ?? null, $input['setting_events'] ?? null,
                    $input['replacement_behavior'] ?? null, $input['prevention_strategy'] ?? null,
                    $input['reinforcement_strategy'] ?? null, $input['reinforcement_schedule'] ?? null,
                    $input['consequence_strategy'] ?? null, $input['crisis_procedure'] ?? null,
                    $input['start_date'] ?? null,
                    isset($input['review_cycle_days']) ? intval($input['review_cycle_days']) : 30,
                    $input['next_review_date'] ?? null, $status, $bipId
                ]);
            } else {
                $code = 'BIP-' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
                $stmt = $pdo->prepare(
                    'INSERT INTO behavior_intervention_plans
                     (student_id, iep_plan_id, plan_code, target_behavior, behavior_function,
                      antecedent, behavior_desc, consequence, setting_events, replacement_behavior,
                      prevention_strategy, reinforcement_strategy, reinforcement_schedule,
                      consequence_strategy, crisis_procedure, start_date, review_cycle_days,
                      next_review_date, status, created_by)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
                );
                $stmt->execute([
                    $studentId, $iepPlanId ?: null, $code, $targetBehavior,
                    $input['behavior_function'] ?? null,
                    $input['antecedent'] ?? null, $input['behavior_desc'] ?? null,
                    $input['consequence'] ?? null, $input['setting_events'] ?? null,
                    $input['replacement_behavior'] ?? null, $input['prevention_strategy'] ?? null,
                    $input['reinforcement_strategy'] ?? null, $input['reinforcement_schedule'] ?? null,
                    $input['consequence_strategy'] ?? null, $input['crisis_procedure'] ?? null,
                    $input['start_date'] ?? null,
                    isset($input['review_cycle_days']) ? intval($input['review_cycle_days']) : 30,
                    $input['next_review_date'] ?? null, $status,
                    intval($user['sub'] ?? 0) ?: null
                ]);
                $bipId = intval($pdo->lastInsertId());
            }

            auditLog('bip_save', 'intervention', 'bip', $bipId, $targetBehavior, null, null, '保存行为干预计划');

            jsonResponse(['success' => true, 'data' => ['id' => $bipId], 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('intervention/bip_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/intervention/bip_delete - 软删除 BIP
    // ============================================================
    case 'bip_delete':
        requireAuth();
        requirePermission('iep_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $bipId = isset($input['id']) ? intval($input['id']) : 0;
        requireBipInScope($bipId);

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare('UPDATE behavior_intervention_plans SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$bipId]);

            auditLog('bip_delete', 'intervention', 'bip', $bipId, '', null, null, '删除行为干预计划');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            error_log('intervention/bip_delete error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // GET /api/intervention/incidents - 行为事件台账
    // ============================================================
    case 'incidents':
        requireAuth();
        requirePermission('record_view');

        $bipId = isset($_GET['bip_id']) ? intval($_GET['bip_id']) : 0;
        requireBipInScope($bipId);

        $limit = isset($_GET['pageSize']) ? intval($_GET['pageSize']) : 100;
        if ($limit <= 0 || $limit > 300) { $limit = 100; }

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'SELECT r.*, u.real_name AS reporter_name
                 FROM bip_incident_records r
                 LEFT JOIN users u ON r.reported_by = u.id
                 WHERE r.bip_id = ? ORDER BY r.occurred_at DESC, r.id DESC LIMIT ' . $limit
            );
            $stmt->execute([$bipId]);

            $rows = $stmt->fetchAll();

            // 附带趋势：有效性与强度均值，用于判断干预是否奏效（BIP 复核依据）
            $stat = $pdo->prepare(
                'SELECT COUNT(*) AS cnt, AVG(effectiveness) AS avg_effect, AVG(duration_minutes) AS avg_minutes,
                        SUM(has_injury) AS injury_count
                 FROM bip_incident_records WHERE bip_id = ?'
            );
            $stat->execute([$bipId]);

            jsonResponse([
                'success' => true,
                'data'    => ['list' => $rows, 'stat' => $stat->fetch()],
                'message' => '获取成功'
            ]);
        } catch (PDOException $e) {
            error_log('intervention/incidents error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/intervention/incident_add - 登记行为事件
    // ============================================================
    case 'incident_add':
        requireAuth();
        requirePermission('record_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input = getInput();
        $user  = getCurrentUser();
        $bipId = isset($input['bip_id']) ? intval($input['bip_id']) : 0;
        requireBipInScope($bipId);

        $occurredAt = trim((string)($input['occurred_at'] ?? ''));
        if ($occurredAt === '') {
            jsonResponse(['success' => false, 'message' => '发生时间不能为空', 'code' => 400], 400);
        }
        $intensity = trim((string)($input['intensity'] ?? '中度'));
        if (!in_array($intensity, ['轻度', '中度', '重度'], true)) {
            $intensity = '中度';
        }
        $effectiveness = isset($input['effectiveness']) ? intval($input['effectiveness']) : null;
        if ($effectiveness !== null && ($effectiveness < 1 || $effectiveness > 5)) {
            jsonResponse(['success' => false, 'message' => '干预有效性须为 1~5', 'code' => 400], 400);
        }

        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO bip_incident_records
                 (bip_id, occurred_at, location, activity, antecedent, behavior, consequence,
                  intensity, duration_minutes, has_injury, intervention_used, effectiveness, reported_by)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $stmt->execute([
                $bipId, $occurredAt,
                $input['location'] ?? null, $input['activity'] ?? null,
                $input['antecedent'] ?? null, $input['behavior'] ?? null, $input['consequence'] ?? null,
                $intensity,
                isset($input['duration_minutes']) ? intval($input['duration_minutes']) : null,
                !empty($input['has_injury']) ? 1 : 0,
                $input['intervention_used'] ?? null,
                $effectiveness,
                intval($user['sub'] ?? 0) ?: null
            ]);

            jsonResponse(['success' => true, 'data' => ['id' => intval($pdo->lastInsertId())], 'message' => '登记成功']);
        } catch (PDOException $e) {
            error_log('intervention/incident_add error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '登记失败', 'code' => 500], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的行为干预操作: ' . $action]);
}
