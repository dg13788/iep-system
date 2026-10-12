<?php
/**
 * 开放生态与知识沉淀（Step 6）
 *
 * 端点：
 *   GET /api/openapi/manifest            只读能力清单（**默认关闭**，需 IEP_OPENAPI=1）
 *   GET /api/openapi/export ?dataset=&format=  数据集导出（教研/沉淀用）
 *
 * 三条硬约束：
 *   1. 对外开放**默认关闭**。本地部署、默认拒绝，是相对云端 SaaS 的结构性优势，
 *      不是需要被"打开才完整"的功能。
 *   2. 只提供**只读**能力，且一律走数据范围过滤（pa_plan_scope_clause）。
 *   3. 导出的每一行都带可读上下文（学生/班级/日期），不做"只有 ID 的流水"——
 *      否则导出的数据离开系统就失去意义，沉淀不下来。
 *
 * 权限：export 需 reports.iep 或 reports.dashboard；manifest 需 reports.iep
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/progress_analysis.php';
require_once __DIR__ . '/io_engine.php';

$path   = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts  = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

/** 数据集白名单：表 → [中文名, 说明, SQL(含范围占位), 列] */
function oa_datasets(): array
{
    return [
        'adjustments' => [
            'name' => '干预调整记录',
            'desc' => 'DBI 第 3–5 步留痕：什么时候改了教法、为什么改、依据是什么',
            'cols' => ['调整ID', '计划ID', '学生', '班级', '目标', '调整日期', '触发信号', '调整类型',
                       '具体调整', '假设', '复核到期日', '决策人', '记录时间'],
            'sql'  => 'SELECT a.id, a.iep_plan_id, s.name, c.name, g.title, a.adjusted_at,
                              a.trigger_type, a.change_type, a.change_detail, a.hypothesis,
                              a.review_due_date, a.decided_by_name, a.created_at
                         FROM iep_intervention_adjustments a
                         JOIN iep_plans p ON p.id = a.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                         LEFT JOIN student_classes c ON c.id = s.class_id
                         LEFT JOIN iep_goals g ON g.id = a.goal_id
                         LEFT JOIN users u ON u.id = a.created_by
                        WHERE a.deleted_at IS NULL',
        ],
        'goal_drafts' => [
            'name' => '目标草案留痕',
            'desc' => '教研数据：引擎建议了什么、教师最终定了什么、改了哪些字段',
            'cols' => ['草案ID', '计划ID', '学生', '类型', '来源', '引擎版本', '是否被采纳', '被修改字段', '生成时间', '采纳时间'],
            'sql'  => 'SELECT d.id, d.iep_plan_id, s.name, d.draft_kind, d.source, d.engine_version,
                              d.adopted, d.edited_fields, d.created_at, d.adopted_at
                         FROM iep_goal_drafts d
                         JOIN iep_plans p ON p.id = d.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                        WHERE d.deleted_at IS NULL',
        ],
        'transition_goals' => [
            'name' => '转衔目标',
            'desc' => '升学/就业/独立生活三类可测量目标',
            'cols' => ['ID', '计划ID', '学生', '领域', '目标', '达成标准', '当前水平%', '期末目标%', '达成期限', '状态'],
            'sql'  => 'SELECT g.id, g.iep_plan_id, s.name, g.category, g.title, g.criteria,
                              g.baseline_value, g.target_value, g.target_date, g.status
                         FROM iep_transition_goals g
                         JOIN iep_plans p ON p.id = g.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                        WHERE g.deleted_at IS NULL',
        ],
        'transition_services' => [
            'name' => '转衔服务',
            'desc' => '升学/就业衔接服务的提供方与频次',
            'cols' => ['ID', '计划ID', '学生', '服务名称', '提供方', '开始', '结束', '频次'],
            'sql'  => 'SELECT v.id, v.iep_plan_id, s.name, v.service_name, v.provider,
                              v.start_date, v.end_date, v.frequency
                         FROM iep_transition_services v
                         JOIN iep_plans p ON p.id = v.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                        WHERE v.deleted_at IS NULL',
        ],
        'parent_inputs' => [
            'name' => '家长意见征集',
            'desc' => '家长参与的证据（安大略审计：缺此证据属程序性违规）',
            'cols' => ['ID', '计划ID', '学生', '家长', '关系', '来源', '优势', '关切', '期望', '家庭支持', '提交时间'],
            'sql'  => 'SELECT m.id, m.iep_plan_id, s.name, m.parent_name, m.relation, m.source,
                              m.strengths, m.concerns, m.expectations, m.support_at_home, m.submitted_at
                         FROM parent_meeting_inputs m
                         JOIN iep_plans p ON p.id = m.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                        WHERE m.deleted_at IS NULL',
        ],
        'goal_progress' => [
            'name' => '目标进度序列',
            'desc' => '每个数据点的日期/得分/满分/辅助层级，是画目标线与判决策的原始依据',
            'cols' => ['ID', '计划ID', '学生', '目标', '日期', '得分', '满分', '百分位', '辅助层级', '场次'],
            'sql'  => 'SELECT r.id, g.iep_plan_id, s.name, g.title, r.recorded_date,
                              r.score, r.max_score,
                              ROUND(r.score * 100.0 / NULLIF(r.max_score, 0), 2),
                              r.prompt_level, r.session_type
                         FROM iep_goal_progress r
                         JOIN iep_goals g ON g.id = r.goal_id
                         JOIN iep_plans p ON p.id = g.iep_plan_id
                         JOIN students s ON s.id = p.student_id
                        WHERE g.deleted_at IS NULL',
        ],
    ];
}

switch ($action) {

    // ============================================================
    // GET /api/openapi/manifest - 只读能力清单（默认关闭）
    // ============================================================
    case 'manifest':
        requireAuth();
        if (!getenv('IEP_OPENAPI')) {
            // 默认关闭：本地部署的数据不出校是硬约束，开放必须由管理员显式开启
            jsonResponse([
                'success' => false,
                'message' => '对外只读接口默认关闭。如需开放，请在服务端设置环境变量 IEP_OPENAPI=1 并自行评估数据范围。',
                'code'    => 'OPENAPI_DISABLED',
            ], 403);
        }
        requirePermission('reports.iep');

        $ds = oa_datasets();
        $list = [];
        foreach ($ds as $key => $d) {
            $list[] = ['key' => $key, 'name' => $d['name'], 'desc' => $d['desc'], 'columns' => $d['cols']];
        }
        jsonResponse([
            'success' => true,
            'data'    => [
                'version'     => '1.0',
                'read_only'   => true,
                'scope_note'  => '所有数据集均按当前账号的数据范围过滤；不提供任何写能力。',
                'datasets'    => $list,
                'export'      => '/api/openapi/export?dataset=<key>&format=csv|json|md|xlsx',
            ],
            'message' => '获取成功',
        ]);
        break;

    // ============================================================
    // GET /api/openapi/export - 数据集导出
    // ============================================================
    case 'export':
        requireAuth();
        // 「默认关闭」这条硬约束此前只加在 manifest 上，恰好漏了唯一会外泄数据的
        // 这个端点——管理员以为没开，含学生姓名的 6 个数据集其实一直可以导出。
        if (!getenv('IEP_OPENAPI')) {
            jsonResponse([
                'success' => false,
                'message' => '对外只读接口默认关闭。如需开放，请在服务端设置环境变量 IEP_OPENAPI=1 并自行评估数据范围。',
                'code'    => 'OPENAPI_DISABLED',
            ], 403);
        }
        if (!checkPermission('reports.iep') && !checkPermission('reports.dashboard')) {
            jsonResponse(['success' => false, 'message' => '无权访问：缺少权限 reports.iep', 'code' => 403], 403);
        }

        $key   = (string)($_GET['dataset'] ?? '');
        $ds    = oa_datasets();
        if (!isset($ds[$key])) {
            jsonResponse([
                'success' => false,
                'message' => '未知数据集：' . $key . '，可选：' . implode(', ', array_keys($ds)),
            ], 400);
        }
        $format = strtolower((string)($_GET['format'] ?? 'csv'));
        if (!in_array($format, ['csv', 'json', 'md', 'xlsx'], true)) {
            jsonResponse(['success' => false, 'message' => '不支持的导出格式'], 400);
        }

        try {
            $pdo   = getDB();
            $scope = getDataScope();
            [$clause, $params] = pa_plan_scope_clause($scope);

            // 每个数据集 SQL 都用别名 p 指代 iep_plans、s 指代 students，范围子句可直接套用
            $sql = $ds[$key]['sql'] . $clause . ' ORDER BY 1 DESC LIMIT 5000';
            $st  = $pdo->prepare($sql);
            $st->execute($params);
            $rows = $st->fetchAll(PDO::FETCH_NUM);

            // 含学生姓名的数据集离开系统必须留痕：谁、什么时候、导走了多少行。
            logDataScopeAccess('openapi_export', $scope['type'] ?? 'none', count($rows));
            io_download($format, $ds[$key]['name'], $ds[$key]['cols'], $rows);
            exit;
        } catch (PDOException $e) {
            error_log('[openapi] export ' . $e->getMessage());
            jsonResponse(['success' => false, 'message' => '导出失败'], 500);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的开放接口操作: ' . $action], 404);
}
