<?php
/**
 * 轻量校级协同（Step 5）
 *
 * 端点：
 *   GET /api/school/overview  ?limit=  本班/本范围目标健康度、逾期采集清单、质检未通过清单
 *
 * 明确不做（方案已裁定）：
 *   多校租户、区域数据看板、跨机构数据上报、智能课表、活动运营。
 *   本模块的定位是"教研组长/教导主任看一眼本范围的教学健康度"，
 *   不是给上级做的统计大屏。
 *
 * 一切统计都走 pa_plan_scope_clause()：教导主任看到的是自己范围内的，
 * 普通教师看到的只是自己班——同一份代码，不做第二套口径（ADR-009）。
 *
 * 权限：reports.iep 或 reports.dashboard 任一
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/progress_analysis.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

function sc_require_view(): void
{
    if (checkPermission('reports.iep')) return;
    if (checkPermission('reports.dashboard')) return;
    jsonResponse(['success' => false, 'message' => '无权访问：缺少权限 reports.iep', 'code' => 403], 403);
}

switch ($action) {

    // ============================================================
    // GET /api/school/overview
    // ============================================================
    case 'overview':
        requireAuth();
        sc_require_view();

        $limit = isset($_GET['limit']) ? max(1, min(200, intval($_GET['limit']))) : 60;

        try {
            $pdo   = getDB();
            $scope = getDataScope();
            [$clause, $params] = pa_plan_scope_clause($scope);

            // ---- 范围内的计划 ----
            $sql = 'SELECT p.id, p.title, p.student_id, p.status, p.primary_teacher_id,
                           s.name AS student_name, s.class_id,
                           c.name AS class_name,
                           u.real_name AS teacher_name
                      FROM iep_plans p
                      JOIN students s ON s.id = p.student_id
                      LEFT JOIN student_classes c ON c.id = s.class_id
                      LEFT JOIN users u ON u.id = p.primary_teacher_id
                     WHERE p.deleted_at IS NULL
                       AND p.status IN (\'' . implode("','", pa_active_plan_statuses()) . '\')' . $clause . '
                     ORDER BY p.id
                     LIMIT ' . $limit;
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $plans = $st->fetchAll(PDO::FETCH_ASSOC);

            $today    = pa_today();
            $byClass  = [];
            $overdue  = [];
            $qcFailed = [];
            $totals   = ['on_track' => 0, 'watch' => 0, 'behind' => 0, 'unknown' => 0, 'achieved' => 0];

            foreach ($plans as $p) {
                $pid = (int)$p['id'];
                $cid = $p['class_id'] !== null ? (int)$p['class_id'] : 0;
                $cname = $p['class_name'] ?: '未分班';
                if (!isset($byClass[$cid])) {
                    $byClass[$cid] = [
                        'class_id'   => $cid,
                        'class_name' => $cname,
                        'students'   => [],
                        'goals'      => 0,
                        'on_track'   => 0, 'watch' => 0, 'behind' => 0, 'unknown' => 0, 'achieved' => 0,
                        'overdue'    => 0,
                    ];
                }
                if (!in_array((int)$p['student_id'], $byClass[$cid]['students'], true)) {
                    $byClass[$cid]['students'][] = (int)$p['student_id'];
                }

                // ---- 目标健康度：逐个目标问决策引擎（不另算一套）----
                $gs = $pdo->prepare(
                    'SELECT id, title, monitor_frequency, responsible_teacher_id
                       FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL'
                );
                $gs->execute([$pid]);
                foreach ($gs->fetchAll(PDO::FETCH_ASSOC) as $g) {
                    $an = pa_analyze_goal($pdo, (int)$g['id']);
                    if (!$an) continue;
                    $lvl   = (string)($an['decision']['level'] ?? 'nodata');
                    $label = ['mastered' => 'achieved', 'on_track' => 'on_track', 'watch' => 'watch',
                              'adjust' => 'behind', 'stale' => 'unknown', 'nodata' => 'unknown'][$lvl] ?? 'unknown';
                    $byClass[$cid][$label] = ($byClass[$cid][$label] ?? 0) + 1;
                    $byClass[$cid]['goals']++;
                    $totals[$label] = ($totals[$label] ?? 0) + 1;

                    // ---- 逾期采集：按监控频率与末次采集日期 ----
                    $days = pa_frequency_days($g['monitor_frequency'] ?? null);
                    $pts  = $an['points'] ?? [];
                    $last = $pts ? end($pts)['date'] : null;
                    $ownerId   = (int)($g['responsible_teacher_id'] ?: $p['primary_teacher_id'] ?: 0);
                    $ownerName = $p['teacher_name'] ?: '未指定责任人';
                    if ($ownerId > 0) {
                        $qn = $pdo->prepare('SELECT real_name FROM users WHERE id = ?');
                        $qn->execute([$ownerId]);
                        $nm = $qn->fetchColumn();
                        if ($nm) $ownerName = (string)$nm;
                    }
                    if (!isset($overdue[$ownerId])) {
                        $overdue[$ownerId] = [
                            'teacher_id'   => $ownerId,
                            'teacher_name' => $ownerName,
                            'overdue_goals'=> 0,
                            'max_days'     => 0,
                            'never'        => 0,
                        ];
                    }
                    if ($last === null) {
                        // 从未采集：只要目标已开始就算欠采（无锚点则用计划起始日）
                        $overdue[$ownerId]['never']++;
                        $overdue[$ownerId]['overdue_goals']++;
                    } elseif ($days !== null) {
                        $gap = pa_days_between($last, $today);
                        if ($gap > $days) {
                            $overdue[$ownerId]['overdue_goals']++;
                            $overdue[$ownerId]['max_days'] = max($overdue[$ownerId]['max_days'], (int)($gap - $days));
                            $byClass[$cid]['overdue']++;
                        }
                    }
                }

                // ---- 质检未通过 ----
                $ck = pa_consistency_check($pdo, $pid);
                if (($ck['error_count'] ?? 0) > 0) {
                    $qcFailed[] = [
                        'plan_id'      => $pid,
                        'student_name' => $p['student_name'],
                        'class_name'   => $cname,
                        'teacher_name' => $p['teacher_name'],
                        'error_count'  => (int)$ck['error_count'],
                        'warn_count'   => (int)($ck['warn_count'] ?? 0),
                        'top_issues'   => array_slice(
                            array_map(fn($i) => $i['title'] ?? '', array_filter(
                                $ck['issues'] ?? [], fn($i) => ($i['level'] ?? '') === 'error'
                            )), 0, 3
                        ),
                    ];
                }
            }

            // 逾期清单按逾期数降序
            usort($overdue, fn($a, $b) => $b['overdue_goals'] <=> $a['overdue_goals']);
            $overdue = array_values(array_filter($overdue, fn($x) => $x['overdue_goals'] > 0));

            $classes = array_values($byClass);
            foreach ($classes as &$c) {
                $c['student_count'] = count($c['students']);
                unset($c['students']);
                $c['health'] = $c['goals'] > 0
                    ? round(100.0 * ($c['on_track'] + $c['achieved']) / $c['goals'], 1)
                    : null;
            }
            unset($c);
            usort($classes, fn($a, $b) => ($a['health'] ?? 999) <=> ($b['health'] ?? 999));

            jsonResponse([
                'success' => true,
                'data'    => [
                    'scope_type'   => $scope['type'] ?? 'viewer',
                    'today'        => $today,
                    'plan_count'   => count($plans),
                    'classes'      => $classes,
                    'overdue'      => $overdue,
                    'qc_failed'    => $qcFailed,
                    'totals'       => $totals,
                    'note'         => '健康度 =（按预期进展 + 已达成）/ 目标总数，' .
                                      '判定完全取自进度决策引擎；无数据目标计入 unknown，不按达标处理。' .
                                      '本视图不含多校/区域级统计——那是明确不做的范围。',
                ],
                'message' => '获取成功',
            ]);
        } catch (PDOException $e) {
            error_log('[school] overview ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '获取失败'], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的校级协同操作: ' . $action], 404);
}
