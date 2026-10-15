<?php
/**
 * 目标起草助手接口（Step 3：评估 → IEP 因果链闭合）
 *
 * 端点：
 *   GET  /api/goal_draft/profile   - 维度画像（优势/需求归纳，每条带依据）
 *   GET  /api/goal_draft/plaafp    - PLAAFP 初稿（只读生成，不落库）
 *   POST /api/goal_draft/generate  - 生成目标草案并落库留痕（有副作用，故用 POST）
 *   GET  /api/goal_draft/drafts    - 查某计划的历史草案与采纳情况
 *   POST /api/goal_draft/adopt     - 采纳草案为正式目标（写 iep_goals + 溯源 + 留痕）
 *   POST /api/goal_draft/save_plaafp - 采纳 PLAAFP 初稿到计划（标记起草来源）
 *
 * 权限：读 iep.view + assessments.view；写 iep.goal_manage
 * 计划归属：一律走 pa_plan_scope_clause()，不另写一套（ADR-009）
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/progress_analysis.php';
require_once __DIR__ . '/goal_drafting.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

/**
 * 失败响应：默认只给通用文案。
 * 仅当环境变量 IEP_DEBUG 打开时附带异常信息——生产环境不暴露内部细节。
 */
function gd_fail(Throwable $e, string $msg): void
{
    $body = ['success' => false, 'message' => $msg];
    if (getenv('IEP_DEBUG')) {
        $body['debug'] = get_class($e) . ': ' . $e->getMessage();
    }
    error_log('[goal_draft] ' . $msg . ' ' . $e->getMessage());
    jsonResponse($body, 500);
}

/**
 * 回给前端的失败文案：只放行业务异常，数据库错误一律换成通用文案。
 *
 * 为什么需要：起草助手原先直接把 $e->getMessage() 回给客户端。
 * 业务异常（评估不存在、计划不匹配）的消息可以给人看；但异常一旦从 PDO
 * 层冒上来，原文会带表名、字段、SQL 片段与服务器路径 —— 那等于把库表
 * 设计贴给调用方。这里做一道闸：认得出就原样给，认不出回通用文案，
 * 详情只进日志（ADR-018 统一口径）。
 */
function gd_user_message(Throwable $e): string
{
    $msg = $e->getMessage();
    if ($msg === '') return '请求无法完成，请稍后重试';

    if (stripos($msg, 'SQLSTATE') !== false || stripos($msg, 'SQL syntax') !== false) {
        error_log('[goal_draft] 拦截数据库异常原文外泄');
        return '数据处理出错，请稍后重试';
    }
    return $msg;
}

/**
 * 校验计划在当前用户数据范围内，并返回计划与学生。
 * 归属校验复用 config.php 的 requireIepInScope()（学生级范围判定全库唯一实现），
 * 这里只负责取回行数据，不另写一套范围过滤（ADR-009）。
 */
function gd_require_plan(PDO $pdo, int $planId): array
{
    requireIepInScope($planId);
    $st = $pdo->prepare(
        'SELECT p.*, s.name AS student_name
           FROM iep_plans p
           JOIN students s ON s.id = p.student_id
          WHERE p.id = ? AND p.deleted_at IS NULL'
    );
    $st->execute([$planId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        jsonResponse(['success' => false, 'message' => '计划不存在'], 404);
    }
    return $row;
}

/** 解析并校验评估归属（评估必须属于该计划的学生） */
function gd_resolve_assessment(PDO $pdo, int $studentId, $assessmentIdParam): ?array
{
    $aid = ($assessmentIdParam !== null && $assessmentIdParam !== '' && is_numeric($assessmentIdParam))
        ? (int)$assessmentIdParam : null;
    $a = gd_fetch_assessment($pdo, $studentId, $aid);
    if ($aid !== null && $a !== null && (int)$a['student_id'] !== $studentId) {
        jsonResponse(['success' => false, 'message' => '评估不属于该学生'], 403);
    }
    return $a;
}

switch ($action) {

    // ============================================================
    // GET /api/goal_draft/profile - 维度画像
    // ============================================================
    case 'profile':
        requireAuth();
        requirePermission('iep.view');
        requirePermission('assessments.view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo  = getDB();
            $plan = gd_require_plan($pdo, $planId);
            $a    = gd_resolve_assessment($pdo, (int)$plan['student_id'], $_GET['assessment_id'] ?? null);
            if (!$a) {
                jsonResponse([
                    'success' => true,
                    'data'    => [
                        'has_assessment' => false,
                        'reason'         => '该学生尚无带条目的评估记录，无法归纳优势与需求。' .
                                            '请先完成一次评估再据此起草目标——引擎不会在无数据时生成"看起来合理"的草案。',
                    ],
                    'message' => '无可用评估',
                ]);
            }
            $items   = gd_fetch_items($pdo, (int)$a['id']);
            $profile = gd_profile($a, $items);
            jsonResponse(['success' => true, 'data' => array_merge(['has_assessment' => true], $profile), 'message' => '获取成功']);
        } catch (PDOException $e) {
            gd_fail($e, '获取失败');
        }
        break;

    // ============================================================
    // GET /api/goal_draft/plaafp - PLAAFP 初稿（只读，不落库）
    // ============================================================
    case 'plaafp':
        requireAuth();
        requirePermission('iep.view');
        requirePermission('assessments.view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo  = getDB();
            $plan = gd_require_plan($pdo, $planId);
            $a    = gd_resolve_assessment($pdo, (int)$plan['student_id'], $_GET['assessment_id'] ?? null);
            if (!$a) {
                jsonResponse(['success' => false, 'message' => '该学生尚无带条目的评估记录，无法生成 PLAAFP 初稿'], 200);
            }
            $items   = gd_fetch_items($pdo, (int)$a['id']);
            $profile = gd_profile($a, $items);
            $plaafp  = gd_plaafp($profile, ['name' => $plan['student_name']]);
            jsonResponse([
                'success' => true,
                'data'    => array_merge($plaafp, [
                    'assessment'   => $profile['assessment'],
                    'current'      => [
                        'strengths' => (string)($plan['strengths'] ?? ''),
                        'needs'     => (string)($plan['needs'] ?? ''),
                    ],
                ]),
                'message' => '获取成功',
            ]);
        } catch (PDOException $e) {
            gd_fail($e, '获取失败');
        }
        break;

    // ============================================================
    // POST /api/goal_draft/generate - 生成目标草案并落库留痕
    // 用 POST 而非 GET：本操作会写入 iep_goal_drafts（留痕本身是有价值的数据）
    // ============================================================
    case 'generate':
        requireAuth();
        requirePermission('iep.view');
        requirePermission('assessments.view');
        requirePermission('iep.goal_manage');

        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo  = getDB();
            $plan = gd_require_plan($pdo, $planId);
            $user = getCurrentUser() ?: [];
            $uid  = isset($user['id']) ? (int)$user['id'] : null;

            $a = gd_resolve_assessment($pdo, (int)$plan['student_id'], $in['assessment_id'] ?? null);
            if (!$a) {
                jsonResponse(['success' => false, 'message' => '该学生尚无带条目的评估记录，无法起草目标'], 200);
            }

            $items   = gd_fetch_items($pdo, (int)$a['id']);
            $profile = gd_profile($a, $items);
            $res     = gd_draft_goals($profile, $plan);

            // 逐条落库留痕（即使教师最终不采纳，"引擎建议过什么"也是教研数据）
            foreach ($res['drafts'] as &$d) {
                $d['draft_id'] = gd_persist_draft(
                    $pdo, $planId, (int)$a['id'], $d['assessment_item_id'], 'goal', $d, $uid
                );
            }
            unset($d);

            // 审计留痕：一次生成调用记一条。逐条草案已在 iep_goal_drafts
            // 内溯源到 created_by，此处再逐条记审计会淹没日志。
            auditLog('generate', 'goal_draft', 'iep_plan', $planId, (string)$plan['title'], null, null,
                sprintf('规则引擎生成 %d 条目标草案（来源评估 #%d）', count($res['drafts']), (int)$a['id']));

            jsonResponse([
                'success' => true,
                'data'    => [
                    'assessment' => $profile['assessment'],
                    'drafts'     => $res['drafts'],
                    'truncated'  => $res['truncated'],
                    'note'       => $res['note'],
                    'engine'     => ['source' => 'rule', 'version' => 'gd1', 'llm_available' => gd_llm_available()],
                ],
                'message' => '草案已生成',
            ]);
        } catch (PDOException $e) {
            gd_fail($e, '生成失败');
        } catch (RuntimeException $e) {
            jsonResponse(['success' => false, 'message' => gd_user_message($e), 'code' => 400], 400);
        }
        break;

    // ============================================================
    // GET /api/goal_draft/drafts - 历史草案与采纳情况
    // ============================================================
    case 'drafts':
        requireAuth();
        requirePermission('iep.view');

        $planId = isset($_GET['plan_id']) ? intval($_GET['plan_id']) : 0;
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        try {
            $pdo = getDB();
            gd_require_plan($pdo, $planId);
            $st = $pdo->prepare(
                'SELECT d.id, d.assessment_id, d.assessment_item_id, d.goal_id, d.draft_kind, d.source,
                        d.engine_version, d.draft_json, d.final_json, d.edited_fields, d.adopted,
                        d.rejected_reason, d.created_at, d.adopted_at, u.real_name AS created_by_name
                   FROM iep_goal_drafts d
                   LEFT JOIN users u ON d.created_by = u.id
                  WHERE d.iep_plan_id = ? AND d.deleted_at IS NULL
                  ORDER BY d.id DESC'
            );
            $st->execute([$planId]);
            $rows = $st->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['draft_json'] = json_decode((string)$r['draft_json'], true);
                $r['final_json'] = $r['final_json'] ? json_decode((string)$r['final_json'], true) : null;
            }
            unset($r);
            jsonResponse(['success' => true, 'data' => $rows, 'message' => '获取成功']);
        } catch (PDOException $e) {
            gd_fail($e, '获取失败');
        }
        break;

    // ============================================================
    // POST /api/goal_draft/adopt - 采纳草案为正式目标
    // ============================================================
    case 'adopt':
        requireAuth();
        requirePermission('iep.goal_manage');

        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        $draftId = intval($in['draft_id'] ?? 0);
        if ($planId <= 0 || $draftId <= 0) jsonResponse(['success' => false, 'message' => '参数错误'], 400);

        $final = $in['final'] ?? null;
        if (!is_array($final)) jsonResponse(['success' => false, 'message' => '缺少定稿内容 final'], 400);

        try {
            $pdo = getDB();
            gd_require_plan($pdo, $planId);
            $user = getCurrentUser() ?: [];
            $uid  = isset($user['id']) ? (int)$user['id'] : null;

            $pdo->beginTransaction();
            $r = gd_adopt_draft($pdo, $draftId, $final, $planId, $uid);
            $pdo->commit();

            // 审计留痕：草案→正式目标是「AI 建议→教师定稿」链路的关键一跳
            //（ADR-007），edited_fields 即差异证据，必须进审计。
            auditLog('adopt', 'goal_draft', 'iep_goal', (int)$r['goal_id'], '', null, null,
                sprintf('采纳草案 #%d 为正式目标（%s）', (int)$r['draft_id'],
                    $r['edited_fields']
                        ? ('调整字段：' . implode('、', $r['edited_fields']))
                        : '与草案完全一致'));

            jsonResponse([
                'success' => true,
                'data'    => [
                    'goal_id'       => $r['goal_id'],
                    'draft_id'      => $r['draft_id'],
                    'edited_fields' => $r['edited_fields'],
                    'edited_note'   => $r['edited_fields']
                        ? ('已记录您对草案的调整：' . implode('、', $r['edited_fields']))
                        : '与草案完全一致，未作修改。',
                ],
                'message' => '已采纳为正式目标',
            ]);
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '采纳失败'], 500);
        } catch (RuntimeException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => gd_user_message($e), 'code' => 400], 400);
        }
        break;

    // ============================================================
    // POST /api/goal_draft/save_plaafp - 采纳 PLAAFP 初稿到计划
    // ============================================================
    case 'save_plaafp':
        requireAuth();
        requirePermission('iep.edit');

        $in     = getInput();
        $planId = intval($in['plan_id'] ?? 0);
        if ($planId <= 0) jsonResponse(['success' => false, 'message' => '缺少 plan_id'], 400);

        $strengths = trim((string)($in['strengths'] ?? ''));
        $needs     = trim((string)($in['needs'] ?? ''));
        if ($strengths === '' && $needs === '') {
            jsonResponse(['success' => false, 'message' => '优势与需求不能同时为空'], 400);
        }

        try {
            $pdo  = getDB();
            $plan = gd_require_plan($pdo, $planId);
            $user = getCurrentUser() ?: [];
            $uid  = isset($user['id']) ? (int)$user['id'] : null;

            $pdo->beginTransaction();
            $st = $pdo->prepare(
                'UPDATE iep_plans SET strengths = ?, needs = ?, plaafp_draft_source = "rule", updated_at = NOW()
                  WHERE id = ?'
            );
            $st->execute([$strengths, $needs, $planId]);

            // 留痕：记录引擎原文与教师定稿的差异
            gd_persist_draft(
                $pdo, $planId,
                isset($in['assessment_id']) ? (int)$in['assessment_id'] : null,
                null, 'plaafp',
                ['strengths' => (string)($in['draft_strengths'] ?? ''), 'needs' => (string)($in['draft_needs'] ?? '')],
                $uid
            );
            $draftId = (int)$pdo->lastInsertId();
            $upd = $pdo->prepare(
                'UPDATE iep_goal_drafts SET final_json = ?, edited_fields = ?, adopted = 1, adopted_at = NOW() WHERE id = ?'
            );
            $edited = [];
            if ((string)($in['draft_strengths'] ?? '') !== $strengths) $edited[] = 'strengths';
            if ((string)($in['draft_needs'] ?? '') !== $needs) $edited[] = 'needs';
            $upd->execute([
                json_encode(['strengths' => $strengths, 'needs' => $needs], JSON_UNESCAPED_UNICODE),
                $edited ? implode(',', $edited) : null,
                $draftId,
            ]);
            $pdo->commit();

            // 审计留痕：PLAAFP 是计划的核心叙述字段，引擎初稿→教师定稿的
            // 采纳动作与差异字段进审计（ADR-007）。
            auditLog('save_plaafp', 'goal_draft', 'iep_plan', $planId, (string)$plan['title'], null, null,
                sprintf('采纳 PLAAFP 初稿（%s）',
                    $edited ? ('调整字段：' . implode('、', $edited)) : '与初稿完全一致'));

            jsonResponse([
                'success' => true,
                'data'    => ['draft_id' => $draftId, 'edited_fields' => $edited],
                'message' => 'PLAAFP 已写入计划',
            ]);
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => '保存失败'], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的目标起草操作: ' . $action], 404);
}
