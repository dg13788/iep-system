<?php
/**
 * 今日工作台（Step 2：教师的一天）
 *
 * 定位：这是「IEP 文档系统」到「教学决策系统」的主视角切换点。
 * 它不新增任何业务实体，只做两件事：
 *   1) 把 Step 1 已算好的决策结论，按「教师今天要做什么」重新排序；
 *   2) 把「该采集了」从教师的记忆变成系统的排程。
 * 所有判断口径均来自 progress_analysis.php，本文件不含任何阈值与等级定义。
 *
 * Endpoints:
 *   GET  /api/workbench/today     - 今日待采 / 需要关注 / 临期事项
 *   POST /api/workbench/trial_save - 试次计数器批量落库（按辅助层级分组，一次会话一条/组）
 *
 * 设计约束（与 Step 1 一致）：
 *   - 不替教师做决定：只给证据与排序，不给"应当执行 X"
 *   - 数据范围 fail-closed：家长 / 只读账号不返回待办
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/progress_analysis.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {

    // ============================================================
    // GET /api/workbench/today - 今日工作台
    // ============================================================
    case 'today':
        requireAuth();

        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $user  = getCurrentUser();
        $scope = getDataScope();
        $today = isset($_GET['today']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$_GET['today'])
               ? (string)$_GET['today']
               : date('Y-m-d');

        try {
            $pdo = getDB();
            // readonly 由「能否执行动作」决定，而不是「能看到多少」（见 pa_workbench 注释）
            $wb  = pa_workbench($pdo, $scope, $today, $user, checkPermission('record_create'));

            // 与列表查询保持同一审计口径
            logDataScopeAccess('workbench', $scope['type'] ?? 'viewer', $wb['counts']['due']);

            jsonResponse([
                'success' => true,
                'data'    => $wb,
                'message' => '获取成功'
            ]);
        } catch (PDOException $e) {
            error_log('workbench/today error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '工作台加载失败', 'code' => 500], 500);
        }
        break;

    // ============================================================
    // POST /api/workbench/trial_save - 试次计数器落库
    //
    // 为什么单独开一个端点而不是复用 objective_record_add：
    //   计数器一次会话会点很多下，每一下的辅助层级可能不同。
    //   若把不同辅助层级的结果混进一条记录，达成率仍可算，
    //   但"这次成功是在哪一级提示下完成的"就永久丢失了 ——
    //   而这恰恰是判断"该不该撤提示"的唯一依据。
    //   所以按辅助层级分组，每组写一条，既不多写行也不丢信息。
    // ============================================================
    case 'trial_save':
        requireAuth();
        requirePermission('record_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误', 'code' => 405], 405);
        }

        $input  = getInput();
        $user   = getCurrentUser();
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;
        $objId  = isset($input['objective_id']) ? intval($input['objective_id']) : 0;
        requireObjectiveInScope($objId);

        $recordDate = trim((string)($input['record_date'] ?? ''));
        if ($recordDate === '') { $recordDate = date('Y-m-d'); }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $recordDate)) {
            jsonResponse(['success' => false, 'message' => '记录日期格式应为 YYYY-MM-DD', 'code' => 400], 400);
        }

        $sessionType = trim((string)($input['session_type'] ?? ''));
        $context     = trim((string)($input['context'] ?? ''));
        $notes       = trim((string)($input['notes'] ?? ''));

        $groups = $input['groups'] ?? null;
        if (!is_array($groups) || empty($groups)) {
            jsonResponse(['success' => false, 'message' => '没有要保存的试次', 'code' => 400], 400);
        }

        $allowed = ['independent', 'gesture', 'verbal', 'model', 'physical'];
        $clean   = [];
        foreach ($groups as $g) {
            if (!is_array($g)) { continue; }
            $level = trim((string)($g['prompt_level'] ?? 'independent'));
            if (!in_array($level, $allowed, true)) { $level = 'independent'; }
            $trial   = intval($g['trial_count'] ?? 0);
            $success = intval($g['success_count'] ?? 0);
            if ($trial <= 0) { continue; }
            if ($success < 0) { $success = 0; }
            if ($success > $trial) { $success = $trial; }
            if ($trial > 500) { $trial = 500; }
            $clean[$level] = [
                'trial'   => ($clean[$level]['trial'] ?? 0) + $trial,
                'success' => ($clean[$level]['success'] ?? 0) + $success,
            ];
        }

        if (empty($clean)) {
            jsonResponse(['success' => false, 'message' => '没有有效的试次数据', 'code' => 400], 400);
        }

        try {
            $pdo = getDB();
            $pdo->beginTransaction();

            $ins = $pdo->prepare(
                'INSERT INTO iep_objective_records
                 (objective_id, step_id, record_date, session_type, context, trial_count, success_count,
                  prompt_level, is_generalized, duration_minutes, notes, recorded_by)
                 VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)'
            );

            $totTrial = 0;
            $totSucc  = 0;
            foreach ($clean as $level => $g) {
                $ins->execute([
                    $objId, $recordDate,
                    $sessionType !== '' ? $sessionType : null,
                    $context !== '' ? $context : null,
                    $g['trial'], $g['success'], $level,
                    $notes !== '' ? $notes : null,
                    $userId
                ]);
                $totTrial += $g['trial'];
                $totSucc  += $g['success'];
            }

            // 自动掌握判定：近 3 次记录（含本次）均达标 -> mastered
            // 与 objective_record_add 保持同一口径，避免两条写入通路给出不同状态
            $objStmt = $pdo->prepare('SELECT mastery_pct, status, goal_id FROM iep_objectives WHERE id = ? AND deleted_at IS NULL');
            $objStmt->execute([$objId]);
            $obj = $objStmt->fetch(PDO::FETCH_ASSOC);

            $autoStatus  = null;
            $goalId      = 0;
            if ($obj && !in_array($obj['status'], ['discontinued'], true)) {
                $goalId  = intval($obj['goal_id']);
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

            // 录入后立刻回流一句判断：这次记录之后，系统对这个目标的看法是什么
            // 这是「数据回流」最容易感知的一环 —— 教师按下保存，就能看到结论更新
            $analysis = null;
            if ($goalId > 0) {
                $a = pa_analyze_goal($pdo, $goalId);
                if ($a !== null) {
                    $analysis = [
                        'goal_id'    => $goalId,
                        'level'      => $a['decision']['level'],
                        'level_text' => $a['decision']['level_text'],
                        'reasons'    => array_slice($a['decision']['reasons'], 0, 2),
                        'points'     => count($a['points']),
                    ];
                }
            }

            jsonResponse([
                'success' => true,
                'data'    => [
                    'objective_id'     => $objId,
                    'goal_id'          => $goalId,
                    'record_date'      => $recordDate,
                    'trial_count'      => $totTrial,
                    'success_count'    => $totSucc,
                    'achievement_pct'  => $totTrial > 0 ? round($totSucc * 100.0 / $totTrial, 2) : 0,
                    'objective_status' => $autoStatus ?? ($obj['status'] ?? null),
                    'rows'             => count($clean),
                    'analysis'         => $analysis,
                ],
                'message' => '已记录 ' . $totTrial . ' 个试次'
            ]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            error_log('workbench/trial_save error: ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '记录失败', 'code' => 500], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的今日工作台操作: ' . $action, 'code' => 404], 404);
}
