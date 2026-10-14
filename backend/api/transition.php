<?php
/**
 * 转衔与家长闭环（Step 4）
 *
 * 端点：
 *   GET  /api/transition/overview          ?plan_id=            转衔目标 + 服务 + 家长意见
 *   POST /api/transition/goal_save         { plan_id, goal }    保存转衔目标
 *   POST /api/transition/goal_delete       { id }
 *   POST /api/transition/service_save      { plan_id, service }
 *   POST /api/transition/service_delete    { id }
 *   POST /api/transition/parent_input_save { plan_id, ... }     家长意见征集（参与证据）
 *   GET  /api/transition/quarterly_report  ?plan_id=&from=&to=  季度进度报告（四要素）
 *
 * 依据：
 *   - IDEA：转衔目标须可测量；仅一段自由文本的 transition_plan 不满足要求。
 *   - 安大略审计：38–95% 档案无家长咨询证据属程序性违规。
 *     故家长意见作为结构化证据入库，而不是只留一个签名。
 *
 * 权限：读 iep.view；写 iep.edit（教师）或 parents.communication_create（家长自助）
 * 归属：一律 requireIepInScope()，不另写一套（ADR-009）
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/progress_analysis.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

/** 计划归属校验 + 取回计划行 */
function tr_require_plan(PDO $pdo, int $planId): array
{
    requireIepInScope($planId);
    $st = $pdo->prepare(
        'SELECT p.*, s.name AS student_name
           FROM iep_plans p JOIN students s ON s.id = p.student_id
          WHERE p.id = ? AND p.deleted_at IS NULL'
    );
    $st->execute([$planId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) jsonResponse(['success' => false, 'message' => '计划不存在'], 404);
    return $row;
}

/**
 * 写权限：教师（iep.edit）或家长自助（parents.communication_create）任一即可，
 * 但两者都必须先通过数据范围校验——范围校验在调用方已完成。
 */
function tr_require_write(): void
{
    if (checkPermission('iep.edit')) return;
    if (checkPermission('parents.communication_create')) return;
    jsonResponse(['success' => false, 'message' => '无权访问：缺少权限 iep.edit', 'code' => 403], 403);
}

/** 转衔目标的达成状态 → 季度报告里给家长看的说法（不新造口径，映射自 Step1 决策等级） */
function tr_on_track_label(string $level): string
{
    static $map = [
        'mastered' => 'achieved',
        'on_track' => 'on_track',
        'watch'    => 'watch',
        'adjust'   => 'behind',
        'stale'    => 'unknown',
        'nodata'   => 'unknown',
    ];
    return $map[$level] ?? 'unknown';
}

switch ($action) {

    // ============================================================
    // GET /api/transition/overview - 转衔目标 / 服务 / 家长意见
    // ============================================================
    case 'overview':
        requireAuth();
        requirePermission('iep.view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo = getDB();
            tr_require_plan($pdo, $planId);

            $g = $pdo->prepare(
                'SELECT g.*, u.real_name AS responsible_name
                   FROM iep_transition_goals g
                   LEFT JOIN users u ON g.responsible_id = u.id
                  WHERE g.iep_plan_id = ? AND g.deleted_at IS NULL
                  ORDER BY g.category, g.sort_order, g.id'
            );
            $g->execute([$planId]);

            $s = $pdo->prepare(
                'SELECT * FROM iep_transition_services
                  WHERE iep_plan_id = ? AND deleted_at IS NULL
                  ORDER BY sort_order, id'
            );
            $s->execute([$planId]);

            $p = $pdo->prepare(
                'SELECT * FROM parent_meeting_inputs
                  WHERE iep_plan_id = ? AND deleted_at IS NULL
                  ORDER BY submitted_at DESC'
            );
            $p->execute([$planId]);

            $sig = $pdo->prepare(
                'SELECT id, parent_id, signing_purpose, signed_at, is_revoked
                   FROM parent_signatures WHERE iep_plan_id = ? ORDER BY signed_at DESC'
            );
            $sig->execute([$planId]);

            jsonResponse([
                'success' => true,
                'data'    => [
                    'goals'        => $g->fetchAll(PDO::FETCH_ASSOC),
                    'services'     => $s->fetchAll(PDO::FETCH_ASSOC),
                    'parent_inputs'=> $p->fetchAll(PDO::FETCH_ASSOC),
                    'signatures'   => $sig->fetchAll(PDO::FETCH_ASSOC),
                ],
                'message' => '获取成功',
            ]);
        } catch (PDOException $e) {
            error_log('[transition] overview ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    // ============================================================
    // POST /api/transition/goal_save - 保存转衔目标
    // ============================================================
    case 'goal_save':
        requireAuth();
        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo = getDB();
            tr_require_plan($pdo, $planId);
            tr_require_write();

            $g     = $in['goal'] ?? [];
            $id    = intval($g['id'] ?? 0);
            $title = trim((string)($g['title'] ?? ''));
            if ($title === '') jsonResponse(['success' => false, 'message' => '目标标题不能为空'], 400);

            $cat = (string)($g['category'] ?? '');
            if (!in_array($cat, ['升学', '就业', '独立生活'], true)) {
                jsonResponse(['success' => false, 'message' => '转衔领域必须为 升学 / 就业 / 独立生活'], 400);
            }

            $fields = [
                $planId,
                $cat,
                $title,
                trim((string)($g['target_behavior'] ?? '')),
                trim((string)($g['criteria'] ?? '')),
                trim((string)($g['baseline'] ?? '')),
                (isset($g['baseline_value']) && is_numeric($g['baseline_value']))
                    ? max(0, min(100, floatval($g['baseline_value']))) : null,
                trim((string)($g['baseline_date'] ?? '')) ?: null,
                (isset($g['target_value']) && is_numeric($g['target_value']))
                    ? max(0, min(100, floatval($g['target_value']))) : null,
                trim((string)($g['start_date'] ?? '')) ?: null,
                trim((string)($g['target_date'] ?? '')) ?: null,
                in_array((string)($g['monitor_frequency'] ?? ''),
                    ['每次课', '每天', '每周2次', '每周1次', '每两周', '每月'], true)
                    ? (string)$g['monitor_frequency'] : null,
                intval($g['responsible_id'] ?? 0) ?: null,
                in_array((string)($g['status'] ?? ''),
                    ['not_started', 'in_progress', 'achieved', 'partially_achieved', 'discontinued'], true)
                    ? (string)$g['status'] : 'not_started',
                intval($g['sort_order'] ?? 0),
            ];

            $act = 'update';
            if ($id > 0) {
                // 更新前确认该目标确实属于本计划（防越权改他人数据）
                $chk = $pdo->prepare(
                    'SELECT id FROM iep_transition_goals WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
                );
                $chk->execute([$id, $planId]);
                if (!$chk->fetchColumn()) {
                    jsonResponse(['success' => false, 'message' => '目标不存在或不属于该计划'], 404);
                }
                $st = $pdo->prepare(
                    'UPDATE iep_transition_goals SET iep_plan_id=?, category=?, title=?, target_behavior=?,
                     criteria=?, baseline=?, baseline_value=?, baseline_date=?, target_value=?, start_date=?,
                     target_date=?, monitor_frequency=?, responsible_id=?, status=?, sort_order=?,
                     updated_at=NOW() WHERE id=?'
                );
                $st->execute(array_merge($fields, [$id]));
            } else {
                $act = 'create';
                $st = $pdo->prepare(
                    'INSERT INTO iep_transition_goals (iep_plan_id, category, title, target_behavior,
                     criteria, baseline, baseline_value, baseline_date, target_value, start_date,
                     target_date, monitor_frequency, responsible_id, status, sort_order, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())'
                );
                $st->execute($fields);
                $id = (int)$pdo->lastInsertId();
            }

            // 转衔目标属于法定内容，任何增删改都要留痕（ADR-018 审计覆盖）
            auditLog($act, 'transition', 'transition_goal', (int)$id, $title, null, null,
                     '转衔目标' . ($act === 'create' ? '新增' : '修改'));

            jsonResponse(['success' => true, 'data' => ['id' => $id], 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('[transition] goal_save ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/transition/goal_delete
    // ============================================================
    case 'goal_delete':
        requireAuth();
        $in  = getInput();
        $id  = intval($in['id'] ?? 0);
        $pid = intval($in['plan_id'] ?? 0);
        if ($id <= 0 || $pid <= 0) jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        try {
            $pdo = getDB();
            tr_require_plan($pdo, $pid);
            tr_require_write();
            $st = $pdo->prepare(
                'UPDATE iep_transition_goals SET deleted_at = NOW()
                  WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
            );
            $st->execute([$id, $pid]);
            if ($st->rowCount() === 0) {
                // 不静默返回成功：记录不存在或不属于该计划时，必须让调用方知道没删成，
                // 否则越权删除会被伪装成"操作成功"。
                jsonResponse(['success' => false, 'message' => '记录不存在或不属于该计划'], 404);
            }
            auditLog('delete', 'transition', 'transition_goal', (int)$id, '', null, null, '删除转衔目标');
            jsonResponse(['success' => true, 'data' => ['deleted' => 1], 'message' => '已删除']);
        } catch (PDOException $e) {
            error_log('[transition] goal_delete ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/transition/service_save / service_delete
    // ============================================================
    case 'service_save':
        requireAuth();
        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);
        try {
            $pdo = getDB();
            tr_require_plan($pdo, $planId);
            tr_require_write();

            $sv   = $in['service'] ?? [];
            $id   = intval($sv['id'] ?? 0);
            $name = trim((string)($sv['service_name'] ?? ''));
            if ($name === '') jsonResponse(['success' => false, 'message' => '服务名称不能为空'], 400);

            $args = [
                $planId, $name,
                trim((string)($sv['provider'] ?? '')),
                trim((string)($sv['start_date'] ?? '')) ?: null,
                trim((string)($sv['end_date'] ?? '')) ?: null,
                trim((string)($sv['frequency'] ?? '')),
                trim((string)($sv['outcome_note'] ?? '')),
                intval($sv['sort_order'] ?? 0),
            ];
            if ($id > 0) {
                $chk = $pdo->prepare(
                    'SELECT id FROM iep_transition_services WHERE id=? AND iep_plan_id=? AND deleted_at IS NULL'
                );
                $chk->execute([$id, $planId]);
                if (!$chk->fetchColumn()) jsonResponse(['success' => false, 'message' => '服务不存在'], 404);
                $st = $pdo->prepare(
                    'UPDATE iep_transition_services SET iep_plan_id=?, service_name=?, provider=?, start_date=?,
                     end_date=?, frequency=?, outcome_note=?, sort_order=?, updated_at=NOW() WHERE id=?'
                );
                $st->execute(array_merge($args, [$id]));
                $svAct = 'update';
            } else {
                $st = $pdo->prepare(
                    'INSERT INTO iep_transition_services (iep_plan_id, service_name, provider, start_date,
                     end_date, frequency, outcome_note, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())'
                );
                $st->execute($args);
                $id    = (int)$pdo->lastInsertId();
                $svAct = 'create';
            }
            auditLog($svAct, 'transition', 'transition_service', (int)$id, $name, null, null,
                     '转衔服务' . ($svAct === 'create' ? '新增' : '修改'));
            jsonResponse(['success' => true, 'data' => ['id' => $id], 'message' => '保存成功']);
        } catch (PDOException $e) {
            error_log('[transition] service_save ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    case 'service_delete':
        requireAuth();
        $in  = getInput();
        $id  = intval($in['id'] ?? 0);
        $pid = intval($in['plan_id'] ?? 0);
        if ($id <= 0 || $pid <= 0) jsonResponse(['success' => false, 'message' => '参数错误'], 400);
        try {
            $pdo = getDB();
            tr_require_plan($pdo, $pid);
            tr_require_write();
            $st = $pdo->prepare(
                'UPDATE iep_transition_services SET deleted_at = NOW()
                  WHERE id = ? AND iep_plan_id = ? AND deleted_at IS NULL'
            );
            $st->execute([$id, $pid]);
            if ($st->rowCount() === 0) {
                // 不静默返回成功：记录不存在或不属于该计划时，必须让调用方知道没删成，
                // 否则越权删除会被伪装成"操作成功"。
                jsonResponse(['success' => false, 'message' => '记录不存在或不属于该计划'], 404);
            }
            auditLog('delete', 'transition', 'transition_service', (int)$id, '', null, null, '删除转衔服务');
            jsonResponse(['success' => true, 'data' => ['deleted' => 1], 'message' => '已删除']);
        } catch (PDOException $e) {
            error_log('[transition] service_delete ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '删除失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/transition/parent_input_save - 家长意见（参与证据）
    // ============================================================
    case 'parent_input_save':
        requireAuth();
        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        $strengths = trim((string)($in['strengths'] ?? ''));
        $concerns  = trim((string)($in['concerns'] ?? ''));
        $expects   = trim((string)($in['expectations'] ?? ''));
        $support   = trim((string)($in['support_at_home'] ?? ''));
        if ($strengths === '' && $concerns === '' && $expects === '' && $support === '') {
            jsonResponse(['success' => false, 'message' => '请至少填写一项内容'], 400);
        }

        try {
            $pdo  = getDB();
            $plan = tr_require_plan($pdo, $planId);
            tr_require_write();

            $user  = getCurrentUser() ?: [];
            $uid   = isset($user['id']) ? (int)$user['id'] : null;
            $src   = (string)($in['source'] ?? '');
            $allow = ['parent_portal', 'teacher_proxy', 'paper', 'phone'];
            if (!in_array($src, $allow, true)) {
                // 家长账号自助提交 → parent_portal；其余一律记为教师代录
                $src = checkPermission('iep.edit') ? 'teacher_proxy' : 'parent_portal';
            }

            $st = $pdo->prepare(
                'INSERT INTO parent_meeting_inputs
                   (iep_plan_id, parent_id, parent_name, relation, meeting_date, strengths, concerns,
                    expectations, support_at_home, source, submitted_by, submitted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
            );
            $st->execute([
                $planId,
                isset($in['parent_id']) ? (intval($in['parent_id']) ?: null) : null,
                trim((string)($in['parent_name'] ?? '')) ?: null,
                trim((string)($in['relation'] ?? '')) ?: null,
                trim((string)($in['meeting_date'] ?? '')) ?: ($plan['meeting_date'] ?? null),
                $strengths, $concerns, $expects, $support,
                $src, $uid,
            ]);
            $newInputId = (int)$pdo->lastInsertId();
            // 家长意见是「家长参与」的法定证据，写入即留痕（ADR-018）
            auditLog('create', 'transition', 'parent_meeting_input', $newInputId,
                     trim((string)($in['parent_name'] ?? '')), null, null,
                     '记录家长意见（来源：' . $src . '）');
            jsonResponse([
                'success' => true,
                'data'    => ['id' => $newInputId, 'source' => $src],
                'message' => '家长意见已记录（作为参与证据存档）',
            ]);
        } catch (PDOException $e) {
            error_log('[transition] parent_input_save ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '保存失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // GET /api/transition/quarterly_report - 季度进度报告
    // 四要素：基线 / 当前 / 目标 / 是否 on track
    // 全部取自 Step 1 的决策引擎，本步不新造任何判定口径。
    // ============================================================
    case 'quarterly_report':
        requireAuth();
        requirePermission('iep.view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo  = getDB();
            $plan = tr_require_plan($pdo, $planId);
            $from = trim((string)($_GET['from'] ?? ''));
            $to   = trim((string)($_GET['to'] ?? '')) ?: pa_today();

            $st = $pdo->prepare(
                'SELECT id, title, area, baseline_value, target_value, target_date, monitor_frequency, status
                   FROM iep_goals
                  WHERE iep_plan_id = ? AND deleted_at IS NULL
                  ORDER BY area, sort_order, id'
            );
            $st->execute([$planId]);
            $goals = $st->fetchAll(PDO::FETCH_ASSOC);

            $rows  = [];
            $count = ['achieved' => 0, 'on_track' => 0, 'watch' => 0, 'behind' => 0, 'unknown' => 0];

            foreach ($goals as $g) {
                $an = pa_analyze_goal($pdo, (int)$g['id']);
                if (!$an) continue;

                $points = $an['points'] ?? [];
                if ($from !== '') {
                    $points = array_values(array_filter(
                        $points, fn($p) => ($p['date'] ?? '') >= $from
                    ));
                }
                $points = array_values(array_filter(
                    $points, fn($p) => ($p['date'] ?? '') <= $to
                ));

                $cur    = $points ? (float)end($points)['value'] : null;
                $dec    = $an['decision'] ?? [];
                $level  = (string)($dec['level'] ?? 'nodata');
                $label  = tr_on_track_label($level);
                $count[$label] = ($count[$label] ?? 0) + 1;

                $rows[] = [
                    'goal_id'        => (int)$g['id'],
                    'title'          => $g['title'],
                    'area'           => $g['area'],
                    'baseline_value' => $g['baseline_value'] !== null ? (float)$g['baseline_value'] : null,
                    'current_value'  => $cur,
                    'target_value'   => $g['target_value'] !== null ? (float)$g['target_value'] : null,
                    'target_date'    => $g['target_date'],
                    'on_track'       => $label,
                    'decision_text'  => $dec['level_text'] ?? '',
                    'reasons'        => $dec['reasons'] ?? [],
                    'data_points'    => count($points),
                    'last_date'      => $points ? end($points)['date'] : null,
                ];
            }

            jsonResponse([
                'success' => true,
                'data'    => [
                    'plan'    => [
                        'id'           => (int)$plan['id'],
                        'title'        => $plan['title'] ?? '',
                        'student_name' => $plan['student_name'] ?? '',
                        'start_date'   => !empty($plan['start_date']) ? substr((string)$plan['start_date'], 0, 10) : null,
                        'end_date'     => !empty($plan['end_date']) ? substr((string)$plan['end_date'], 0, 10) : null,
                        'status'       => $plan['status'] ?? '',
                    ],
                    'period'  => ['from' => $from !== '' ? $from : null, 'to' => $to],
                    'goals'   => $rows,
                    'summary' => $count,
                    'note'    => '「是否按预期进展」直接取自进度决策引擎的判定结论，未另设口径；' .
                                 '无数据的目标一律记为 unknown，不推测。',
                ],
                'message' => '获取成功',
            ]);
        } catch (PDOException $e) {
            error_log('[transition] quarterly_report ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '生成失败'], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的转衔操作: ' . $action], 404);
}
