<?php
/**
 * 目标起草领域服务（Step 3：评估 → IEP 因果链闭合）
 *
 * 设计立场（与 Step 1 同源，勿改）：
 *  - ADR-002 绝不臆造缺失数据：没有评估就返回原因，不生成"看起来对"的草案。
 *  - ADR-007 AI/引擎只出草稿，且必须留痕「建议了什么 vs 教师定了什么」。
 *  - ADR-008 学生数据不出校：本引擎是**确定性规则引擎**，不调用任何外部大模型。
 *    外部/本地 LLM 只作为可选适配器（gd_llm_available()），默认关闭。
 *
 * 为什么不是接一个大模型：
 *   1) 数据不出校是相对普惠 SaaS 的结构性优势，一次 API 调用就废掉；
 *   2) 目标草案要进入法定文书，每个要素必须能指回具体评估条目，
 *      模型给的漂亮句子无法溯源，审计时说不清；
 *   3) 离线可用——村小/特校网络环境不保证。
 *   模型的合理位置是**改写润色**（教师定稿后可选），不是生成依据。
 *
 * 所有阈值都是常量且带出处注释，禁止散落魔法数字。
 */

if (!function_exists('gd_num')) {

    /** 掌握线：与系统内既有 126 条短期目标 mastery_pct 默认值一致（非新造常量） */
    define('GD_MASTERY_PCT', 80.0);
    /** 发展中：低于掌握线但已过半，属于"推一把能过"的区间 */
    define('GD_EMERGING_PCT', 60.0);
    /** 同维度内条目得分率极差超过此值 → 该维度内部差异过大，按维度立目标会失真，改为按条目立 */
    define('GD_UNEVEN_SPREAD', 35.0);
    /** 单次最多生成的目标草案数：超过则需要 IEP 团队做优先级取舍，不替他们决定 */
    define('GD_MAX_DRAFTS', 6);

    /**
     * 评估维度 → IEP 目标领域
     * 依据：《培智学校义务教育课程标准（2016）》十门课程的领域划分。
     * 未收录的维度返回 null —— 不做猜测映射，交由教师归类（并在草案里标注待确认）。
     */
    function gd_area_of_dimension(string $dim): ?string
    {
        static $map = [
            // 生活数学
            '数与运算' => 'academic', '常见的量' => 'academic', '图形与几何' => 'academic',
            '统计'     => 'academic', '综合性学习' => 'academic',
            // 生活语文
            '识字与写字' => 'life_chinese', '阅读' => 'life_chinese', '倾听与说话' => 'life_chinese',
            // 生活适应
            '个人生活' => 'daily_living', '家庭生活' => 'daily_living',
            '学校生活' => 'daily_living', '社区生活' => 'daily_living',
            '生活自理' => 'daily_living',
            // 沟通
            '沟通交往' => 'communication',
            // 情绪行为（含行为功能）
            '情绪行为' => 'behavior', '逃避要求' => 'behavior', '获取实物' => 'behavior',
            '获取关注' => 'behavior', '感觉寻求' => 'behavior',
            // 社会适应
            '社会适应' => 'social',
            // 运动与康复
            '运动能力' => 'motor',
            // 认知
            '认知发展' => 'cognitive', '学业准备' => 'cognitive',
            // 转衔
            '升学准备' => 'transition', '就业准备' => 'transition', '自我决定' => 'transition',
        ];
        return $map[$dim] ?? null;
    }

    /** 安全取数值 */
    function gd_num($v): ?float
    {
        if ($v === null || $v === '' || !is_numeric($v)) return null;
        return (float)$v;
    }

    /**
     * score_level 属于哪套量纲。
     * 存量数据里混用了两套：辅助层级制（独立/提示下完成/部分辅助/大量辅助）
     * 与评级制（优秀/良好/待加强）。混用本身是数据缺陷，这里如实分类而非清洗。
     */
    function gd_level_scale(?string $level): string
    {
        $l = trim((string)$level);
        if ($l === '') return 'unknown';
        if (in_array($l, ['独立', '提示下完成', '部分辅助', '大量辅助'], true)) return 'prompt';
        if (in_array($l, ['优秀', '良好', '待加强'], true)) return 'rating';
        return 'other';
    }

    /** 辅助层级 → 排序权重（越小越独立），用于归纳"当前在什么提示水平下完成" */
    function gd_prompt_rank(?string $level): int
    {
        static $r = ['独立' => 0, '提示下完成' => 1, '部分辅助' => 2, '大量辅助' => 3];
        $l = trim((string)$level);
        return $r[$l] ?? 99;
    }

    /**
     * 取某学生的评估（默认最近一次已完成评估）。
     * 关键：画像必须限定在**单次评估内**。跨评估平均会把"前测 1 分 + 后测 5 分"
     * 平均成 3 分，那既不是前测也不是后测，是编造的第三个数据。
     */
    function gd_fetch_assessment(PDO $pdo, int $studentId, ?int $assessmentId = null): ?array
    {
        if ($assessmentId !== null && $assessmentId > 0) {
            $st = $pdo->prepare(
                'SELECT a.*, t.name AS template_name, u.real_name AS assessor_name
                   FROM assessments a
                   LEFT JOIN assessment_templates t ON a.template_id = t.id
                   LEFT JOIN users u ON a.assessor_id = u.id
                  WHERE a.id = ? AND a.student_id = ? AND a.deleted_at IS NULL'
            );
            $st->execute([$assessmentId, $studentId]);
        } else {
            $st = $pdo->prepare(
                'SELECT a.*, t.name AS template_name, u.real_name AS assessor_name
                   FROM assessments a
                   LEFT JOIN assessment_templates t ON a.template_id = t.id
                   LEFT JOIN users u ON a.assessor_id = u.id
                  WHERE a.student_id = ? AND a.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM assessment_items ai WHERE ai.assessment_id = a.id)
                  ORDER BY a.assessment_date DESC, a.id DESC
                  LIMIT 1'
            );
            $st->execute([$studentId]);
        }
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** 取单次评估的全部条目 */
    function gd_fetch_items(PDO $pdo, int $assessmentId): array
    {
        $st = $pdo->prepare(
            'SELECT id, dimension, item_name, item_description, score, max_score, score_level, notes, sort_order
               FROM assessment_items
              WHERE assessment_id = ?
              ORDER BY sort_order ASC, id ASC'
        );
        $st->execute([$assessmentId]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 维度画像：把条目归纳为可立目标的领域，并给出每条归纳的依据。
     *
     * @return array{assessment:array, items:array, dimensions:array, summary:array}
     */
    function gd_profile(array $assessment, array $items): array
    {
        $byDim = [];
        foreach ($items as $it) {
            $score = gd_num($it['score']);
            $max   = gd_num($it['max_score']);
            $pct   = ($score !== null && $max !== null && $max > 0) ? round($score * 100.0 / $max, 2) : null;
            $dim   = trim((string)$it['dimension']) ?: '未分类';

            $norm = [
                'item_id'     => (int)$it['id'],
                'item_name'   => (string)$it['item_name'],
                'score'       => $score,
                'max_score'   => $max,
                'pct'         => $pct,
                'level'       => trim((string)($it['score_level'] ?? '')),
                'level_scale' => gd_level_scale($it['score_level'] ?? null),
                'notes'       => trim((string)($it['notes'] ?? '')),
            ];

            if (!isset($byDim[$dim])) {
                $byDim[$dim] = ['dimension' => $dim, 'items' => []];
            }
            $byDim[$dim]['items'][] = $norm;
        }

        $dimensions = [];
        foreach ($byDim as $dim => $d) {
            $pcts = array_values(array_filter(
                array_map(fn($x) => $x['pct'], $d['items']),
                fn($p) => $p !== null
            ));
            $n = count($pcts);
            if ($n === 0) {
                // 全条目都没有可换算的得分 → 该维度无法归纳，如实标注而不是给 0
                $dimensions[] = [
                    'dimension' => $dim,
                    'item_count' => count($d['items']),
                    'avg_pct'    => null,
                    'band'       => 'unknown',
                    'reason'     => '该维度条目缺少可换算的得分（score/max_score 缺失或 max_score 为 0），无法归纳，需教师人工判断。',
                    'items'      => $d['items'],
                ];
                continue;
            }

            $avg   = round(array_sum($pcts) / $n, 2);
            $minP  = min($pcts);
            $maxP  = max($pcts);
            $spread = round($maxP - $minP, 2);

            // 辅助层级分布（仅统计 prompt 量纲的条目）
            $promptMix = [];
            $scales    = [];
            foreach ($d['items'] as $x) {
                if ($x['level'] === '') continue;
                $scales[$x['level_scale']] = true;
                if ($x['level_scale'] === 'prompt') {
                    $promptMix[$x['level']] = ($promptMix[$x['level']] ?? 0) + 1;
                }
            }

            // 分级：掌握线用系统既有 80%，不是新造的
            if ($avg >= GD_MASTERY_PCT) {
                $band   = 'mastered';
                $reason = sprintf('平均得分率 %.1f%% ≥ 掌握线 %.0f%%（该阈值与本系统短期目标既有掌握阈值一致）。', $avg, GD_MASTERY_PCT);
            } elseif ($avg >= GD_EMERGING_PCT) {
                $band   = 'emerging';
                $reason = sprintf('平均得分率 %.1f%% 介于 %.0f%%–%.0f%% 之间，属于发展中：尚未达掌握线，但已有基础。', $avg, GD_EMERGING_PCT, GD_MASTERY_PCT);
            } else {
                $band   = 'priority';
                $reason = sprintf('平均得分率 %.1f%% < %.0f%%，与掌握线差距最大，属于优先需求。', $avg, GD_EMERGING_PCT);
            }

            // 内部差异过大 → 按维度立目标会失真
            $uneven = $spread >= GD_UNEVEN_SPREAD && $n >= 2;
            if ($uneven) {
                $reason .= sprintf(' 注意：该维度内条目得分极差 %.1f 个百分点（%.1f%%–%.1f%%），差异过大，' .
                                   '按维度整体立目标会掩盖具体缺口，建议按条目分别立目标。', $spread, $minP, $maxP);
            }

            $dimensions[] = [
                'dimension'    => $dim,
                'item_count'   => $n,
                'avg_pct'      => $avg,
                'min_pct'      => $minP,
                'max_pct'      => $maxP,
                'spread'       => $spread,
                'uneven'       => $uneven,
                'band'         => $band,
                'reason'       => $reason,
                'area'         => gd_area_of_dimension($dim),
                'area_known'   => gd_area_of_dimension($dim) !== null,
                'prompt_mix'   => $promptMix,
                'level_scales' => array_keys($scales),
                'scale_mixed'  => count($scales) > 1,
                'items'        => $d['items'],
            ];
        }

        // 需求优先在前（得分率低者优先），同级按维度名稳定排序
        usort($dimensions, function ($a, $b) {
            $aw = $a['avg_pct'] ?? 999;
            $bw = $b['avg_pct'] ?? 999;
            if ($aw !== $bw) return $aw <=> $bw;
            return strcmp($a['dimension'], $b['dimension']);
        });

        $strengthDims = array_values(array_filter($dimensions, fn($d) => ($d['band'] ?? '') === 'mastered'));
        $needsDims    = array_values(array_filter($dimensions, fn($d) => in_array($d['band'] ?? '', ['priority', 'emerging'], true)));
        $unknownDims  = array_values(array_filter($dimensions, fn($d) => ($d['band'] ?? '') === 'unknown'));

        return [
            'assessment' => [
                'id'            => (int)$assessment['id'],
                'date'          => substr((string)$assessment['assessment_date'], 0, 10),
                'type'          => (string)($assessment['assessment_type'] ?? ''),
                'template_name' => (string)($assessment['template_name'] ?? ''),
                'assessor_name' => (string)($assessment['assessor_name'] ?? ''),
                'item_count'    => count($items),
            ],
            'items'      => array_map(function ($it) {
                $s = gd_num($it['score']); $m = gd_num($it['max_score']);
                return [
                    'item_id'   => (int)$it['id'],
                    'dimension' => trim((string)$it['dimension']) ?: '未分类',
                    'item_name' => (string)$it['item_name'],
                    'score'     => $s, 'max_score' => $m,
                    'pct'       => ($s !== null && $m !== null && $m > 0) ? round($s * 100.0 / $m, 2) : null,
                    'level'     => trim((string)($it['score_level'] ?? '')),
                ];
            }, $items),
            'dimensions' => $dimensions,
            'summary'    => [
                'dimension_count' => count($dimensions),
                'strength_dims'   => array_map(fn($d) => $d['dimension'], $strengthDims),
                'needs_dims'      => array_map(fn($d) => $d['dimension'], $needsDims),
                'unknown_dims'    => array_map(fn($d) => $d['dimension'], $unknownDims),
            ],
        ];
    }

    /**
     * PLAAFP 初稿（Present Level of Academic Achievement and Functional Performance）
     *
     * 每一句都必须能指回具体维度与得分；写不出依据的形容词一律不写。
     * 返回的 caveats 用于提醒教师"这句话是引擎写的，需你核实"。
     */
    function gd_plaafp(array $profile, array $student): array
    {
        $a      = $profile['assessment'];
        $dims   = $profile['dimensions'];
        $name   = trim((string)($student['name'] ?? '该生'));
        $src    = sprintf('%s（%s，评估 ID %d，%d 个条目）',
            $a['template_name'] ?: '评估', $a['date'], $a['id'], $a['item_count']);

        $strengthSentences = [];
        $needSentences     = [];
        $evidence          = [];

        foreach ($dims as $d) {
            if (($d['band'] ?? '') === 'unknown') {
                $needSentences[] = sprintf('「%s」维度条目缺少可换算得分，本次评估无法判断其当前水平，需补充评估或人工判断。', $d['dimension']);
                continue;
            }
            $avg = $d['avg_pct'];
            $detail = sprintf('「%s」%d 个条目平均得分率 %.1f%%', $d['dimension'], $d['item_count'], $avg);

            if ($d['band'] === 'mastered') {
                $strengthSentences[] = sprintf('%s，已达掌握线（%.0f%%）。', $detail, GD_MASTERY_PCT);
            } elseif ($d['band'] === 'emerging') {
                $needSentences[] = sprintf('%s，处于发展中，尚未达到掌握线 %.0f%%，差距 %.1f 个百分点。',
                    $detail, GD_MASTERY_PCT, GD_MASTERY_PCT - $avg);
            } else {
                $needSentences[] = sprintf('%s，与掌握线 %.0f%% 差距 %.1f 个百分点，属于优先干预领域。',
                    $detail, GD_MASTERY_PCT, GD_MASTERY_PCT - $avg);
            }

            // 辅助层级信息（若该维度采集的是辅助层级而非分数等级）
            if (!empty($d['prompt_mix'])) {
                arsort($d['prompt_mix']);
                $mix = [];
                foreach ($d['prompt_mix'] as $lv => $c) $mix[] = "{$lv} {$c} 项";
                $strengthSentences[] = sprintf('「%s」当前完成水平：%s。', $d['dimension'], implode('、', $mix));
            }

            $evidence[] = [
                'dimension' => $d['dimension'],
                'band'      => $d['band'],
                'avg_pct'   => $avg,
                'reason'    => $d['reason'],
                'item_ids'  => array_map(fn($x) => $x['item_id'], $d['items']),
            ];
        }

        $caveats = [];
        if ($profile['summary']['unknown_dims']) {
            $caveats[] = '部分维度无法归纳，详见正文；这些领域不能据此下结论。';
        }
        $mixedScale = array_values(array_filter($dims, fn($d) => !empty($d['scale_mixed'])));
        if ($mixedScale) {
            $caveats[] = sprintf('以下维度混用了「辅助层级」与「分数等级」两套评分口径：%s。' .
                '两套口径不可直接比较，本段描述已分开处理，建议后续统一采集口径。',
                implode('、', array_map(fn($d) => $d['dimension'], $mixedScale)));
        }

        return [
            'strengths_text' => $strengthSentences
                ? ('优势与已有基础：' . implode(' ', $strengthSentences))
                : '本次评估未发现已达掌握线（≥' . GD_MASTERY_PCT . '%）的领域。',
            'needs_text' => $needSentences
                ? ('需求与差距：' . implode(' ', $needSentences))
                : '本次评估各维度均已达掌握线，无需新立年度目标。',
            'source_text' => '数据来源：' . $src . '。',
            'evidence'    => $evidence,
            'caveats'     => $caveats,
        ];
    }

    /**
     * 目标草案（SMART 四要素齐全，且每一要素都有出处）
     *
     *  - 基线 baseline：取该维度/条目的真实得分率（不编）
     *  - 条件 condition：由当前辅助层级推导；无层级数据时标注待确认
     *  - 标准 criteria：默认掌握线 80%，但**明确标注这是系统默认阈值、需 IEP 团队确认**
     *  - 时间 time：取 IEP 计划的结束日期；计划无结束日期则标注待确认
     */
    function gd_draft_goals(array $profile, array $plan): array
    {
        $dims    = $profile['dimensions'];
        $aId     = $profile['assessment']['id'];
        $aDate   = $profile['assessment']['date'];
        $endDate = !empty($plan['end_date']) ? substr((string)$plan['end_date'], 0, 10) : null;

        $drafts = [];
        foreach ($dims as $d) {
            if (in_array($d['band'] ?? '', ['mastered', 'unknown'], true)) continue;

            // 内部差异过大 → 按条目立，而不是按维度立
            if (!empty($d['uneven'])) {
                foreach ($d['items'] as $it) {
                    if ($it['pct'] === null || $it['pct'] >= GD_MASTERY_PCT) continue;
                    $drafts[] = gd_build_draft($it['item_name'], $d, [$it], $aId, $aDate, $endDate, true);
                }
                continue;
            }

            // 按维度立：行为名取该维度得分最低的条目（缺口最大者最能代表该维度需求）
            $cands = array_values(array_filter($d['items'], fn($x) => $x['pct'] !== null));
            if (!$cands) continue;
            usort($cands, fn($x, $y) => ($x['pct'] <=> $y['pct']) ?: ($x['item_id'] <=> $y['item_id']));
            $drafts[] = gd_build_draft($cands[0]['item_name'], $d, $d['items'], $aId, $aDate, $endDate, false);
        }

        // 按需求紧迫度排序（得分率低在前）
        usort($drafts, fn($x, $y) => ($x['baseline_value'] <=> $y['baseline_value']));

        $truncated = false;
        if (count($drafts) > GD_MAX_DRAFTS) {
            $drafts    = array_slice($drafts, 0, GD_MAX_DRAFTS);
            $truncated = true;
        }

        return [
            'drafts'    => $drafts,
            'truncated' => $truncated,
            'note'      => $truncated
                ? sprintf('需求领域多于 %d 个，已按得分率从低到高取前 %d 个。' .
                          '年度目标数量需 IEP 团队按学生实际承受能力取舍，引擎不代为决定。', GD_MAX_DRAFTS, GD_MAX_DRAFTS)
                : null,
        ];
    }

    /** 构造单条目标草案 */
    function gd_build_draft(
        string $behavior,
        array $dim,
        array $evidenceItems,
        int $aId,
        string $aDate,
        ?string $endDate,
        bool $fromItem
    ): array {
        $pcts = array_values(array_filter(array_map(fn($x) => $x['pct'], $evidenceItems), fn($p) => $p !== null));
        $base = $pcts ? round(array_sum($pcts) / count($pcts), 2) : null;

        // 条件：从当前辅助层级推导。取最依赖辅助的层级（最保守描述）
        $condText = null;
        $ranks    = array_filter(array_map(fn($x) => gd_prompt_rank($x['level'] ?? ''), $evidenceItems), fn($r) => $r < 99);
        if ($ranks) {
            $worst = max($ranks);
            $condText = [0 => '在无需提示的情况下', 1 => '在口头提示下', 2 => '在部分肢体辅助下', 3 => '在全程肢体辅助下'][$worst] ?? null;
            $condFrom = sprintf('由评估条目记录的辅助层级推导（该组条目中最依赖辅助者为「%s」）',
                [0 => '独立', 1 => '提示下完成', 2 => '部分辅助', 3 => '大量辅助'][$worst] ?? '—');
        } else {
            $condFrom = '该组条目未记录辅助层级，条件需教师补充';
        }

        $area = $dim['area'];

        return [
            'area'              => $area,
            'area_confirmed'    => $area !== null,
            'dimension'         => $dim['dimension'],
            'title'             => trim($behavior),
            'target_behavior'   => trim($behavior),
            'criteria'          => sprintf('连续 3 次数据采集，达成率均 ≥ %.0f%%', GD_MASTERY_PCT),
            'baseline'          => sprintf('依据 %s 评估：%s 得分率 %.1f%%', $aDate, $dim['dimension'], $base ?? 0),
            'baseline_value'    => $base,
            'baseline_date'     => $aDate,
            'target_value'      => GD_MASTERY_PCT,
            'target_value_note' => sprintf('%.0f%% 为本系统默认掌握阈值（与既有短期目标掌握阈值一致），' .
                                           '是否适用于本生须由 IEP 团队确认后调整。', GD_MASTERY_PCT),
            'condition_text'    => $condText,
            'condition_from'    => $condFrom,
            'evaluation_method' => '单次会话离散试次记录（成功数 / 试次数），按辅助层级分别记录',
            'monitor_frequency' => '每周1次',
            'monitor_frequency_note' => '默认每周 1 次，需按目标性质与教学安排确认。',
            'target_date'       => $endDate,
            'priority'          => ($base !== null && $base < GD_EMERGING_PCT) ? 'high' : 'medium',
            'assessment_id'     => $aId,
            'assessment_item_id'=> $fromItem ? ($evidenceItems[0]['item_id'] ?? null) : null,
            'evidence_item_ids' => array_map(fn($x) => $x['item_id'], $evidenceItems),
            'drafted_from'      => $fromItem ? 'item' : 'dimension',
            'reason'            => $dim['reason'],
            'needs_confirm'     => array_values(array_filter([
                $area === null ? '目标领域（该评估维度未收录于课程映射表，需人工归类）' : null,
                $condText === null ? '完成条件（评估未记录辅助层级）' : null,
                $endDate === null ? '达成期限（IEP 计划未设结束日期）' : null,
                '期末目标值（当前为系统默认掌握阈值）',
            ])),
        ];
    }

    /**
     * LLM 适配器可用性：默认关闭。
     * 仅当管理员显式配置了**本地/私有化**端点（env GD_LLM_ENDPOINT 指向内网地址）才返回 true。
     * 任何指向公网的配置一律拒绝——学生数据不出校是硬约束，不是偏好。
     */
    function gd_llm_available(): bool
    {
        $ep = getenv('GD_LLM_ENDPOINT');
        if (!$ep) return false;
        $host = parse_url($ep, PHP_URL_HOST);
        if (!$host) return false;
        $ip   = gethostbyname($host);
        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) return false; // 解析不出 → 视为不可用
        if (!filter_var($ip, FILTER_VALIDATE_IP)) return false;
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    /**
     * 落库留痕：记录引擎给了什么。
     * 采纳时再回填 final_json / edited_fields，从而得到「建议 vs 定稿」的差异。
     */
    function gd_persist_draft(
        PDO $pdo,
        int $planId,
        ?int $assessmentId,
        ?int $itemId,
        string $kind,
        array $draft,
        ?int $userId
    ): int {
        $st = $pdo->prepare(
            'INSERT INTO iep_goal_drafts
               (iep_plan_id, assessment_id, assessment_item_id, draft_kind, source,
                engine_version, draft_json, created_by)
             VALUES (?, ?, ?, ?, "rule", "gd1", ?, ?)'
        );
        $st->execute([
            $planId,
            $assessmentId,
            $itemId,
            $kind,
            json_encode($draft, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $userId,
        ]);
        return (int)$pdo->lastInsertId();
    }

    /**
     * 采纳：写入真实目标 + 回填留痕 + 建立双向溯源。
     *
     * @return array{goal_id:int, draft_id:int, edited_fields:array}
     */
    function gd_adopt_draft(PDO $pdo, int $draftId, array $final, int $planId, ?int $userId): array
    {
        $st = $pdo->prepare('SELECT * FROM iep_goal_drafts WHERE id = ? AND deleted_at IS NULL');
        $st->execute([$draftId]);
        $draft = $st->fetch(PDO::FETCH_ASSOC);
        if (!$draft) throw new RuntimeException('草案不存在或已删除');
        if ((int)$draft['iep_plan_id'] !== $planId) throw new RuntimeException('草案不属于该计划');
        if ((int)$draft['adopted'] === 1) throw new RuntimeException('该草案已被采纳，不能重复采纳');

        $draftJson = json_decode((string)$draft['draft_json'], true) ?: [];

        // 与草案逐字段比对，记录被教师改过什么（教研数据：哪类字段最常被改，就说明引擎哪里不准）
        $watch  = ['title', 'area', 'target_behavior', 'criteria', 'baseline_value',
                   'target_value', 'baseline_date', 'target_date', 'monitor_frequency',
                   'evaluation_method', 'priority'];
        $edited = [];
        foreach ($watch as $f) {
            $dv = $draftJson[$f] ?? null;
            $fv = $final[$f] ?? null;
            if (is_numeric($dv) || is_numeric($fv)) {
                if (gd_num($dv) !== gd_num($fv)) $edited[] = $f;
            } elseif ((string)($dv ?? '') !== (string)($fv ?? '')) {
                $edited[] = $f;
            }
        }

        $assessmentId = $draft['assessment_id'] !== null ? (int)$draft['assessment_id'] : null;
        $itemId       = $draft['assessment_item_id'] !== null ? (int)$draft['assessment_item_id'] : null;

        $ins = $pdo->prepare(
            'INSERT INTO iep_goals
               (iep_plan_id, goal_code, area, title, description, target_behavior, criteria,
                evaluation_method, monitor_frequency, baseline, baseline_value, baseline_date,
                baseline_value_is_derived, target_value, target_value_is_derived,
                source_assessment_id, source_assessment_item_id,
                start_date, target_date, priority, status, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
        );
        $ins->execute([
            $planId,
            $final['goal_code'] ?? ('G' . str_pad((string)$draftId, 4, '0', STR_PAD_LEFT)),
            $final['area'] ?? '未分类',
            $final['title'] ?? '',
            $final['description'] ?? ($draftJson['baseline'] ?? ''),
            $final['target_behavior'] ?? ($final['title'] ?? ''),
            $final['criteria'] ?? '',
            $final['evaluation_method'] ?? '',
            $final['monitor_frequency'] ?? '每周1次',
            $final['baseline'] ?? ($draftJson['baseline'] ?? ''),
            gd_num($final['baseline_value'] ?? null),
            !empty($final['baseline_date']) ? $final['baseline_date'] : null,
            gd_num($final['target_value'] ?? null),
            $assessmentId,
            $itemId,
            !empty($final['start_date']) ? $final['start_date'] : null,
            !empty($final['target_date']) ? $final['target_date'] : null,
            $final['priority'] ?? 'medium',
            $final['status'] ?? 'not_started',
            (int)($final['sort_order'] ?? 0),
        ]);
        $goalId = (int)$pdo->lastInsertId();

        $upd = $pdo->prepare(
            'UPDATE iep_goal_drafts
                SET goal_id = ?, final_json = ?, edited_fields = ?, adopted = 1,
                    adopted_at = NOW()
              WHERE id = ?'
        );
        $upd->execute([
            $goalId,
            json_encode($final, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $edited ? implode(',', $edited) : null,
            $draftId,
        ]);

        // 双向溯源：这次评估支撑了这个计划（仅在尚未关联时回填，不覆盖既有归属）
        if ($assessmentId !== null) {
            $pdo->prepare(
                'UPDATE assessments SET iep_plan_id = ? WHERE id = ? AND iep_plan_id IS NULL'
            )->execute([$planId, $assessmentId]);
            $pdo->prepare(
                'UPDATE iep_plans SET source_assessment_id = ? WHERE id = ? AND source_assessment_id IS NULL'
            )->execute([$assessmentId, $planId]);
        }

        return ['goal_id' => $goalId, 'draft_id' => $draftId, 'edited_fields' => $edited];
    }
}
