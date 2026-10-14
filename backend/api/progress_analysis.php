<?php
/**
 * 进度智能内核（Progress Intelligence Core, PIC）
 *
 * 定位：把「已采集的数据」变成「可执行的决策」。
 * 这一层是纯函数 + 取数，不处理鉴权、不输出 HTTP，
 * 供 iep.php 的多个端点以及后续的「今日工作台」复用，避免出现第二份口径。
 *
 * 依据（外部基准，非自创）：
 *   - IDEA §300.320(a)(3)：IEP 必须说明进度如何测量、多久向家长报告一次
 *   - Endrew v. Douglas County (2017)：IEP 须「合理计算以取得适当进步」→ 实质性标准
 *   - NCII《Data-Based Individualization》(2013/2018)：DBI 五步循环
 *       ①循证干预 → ②进度监控+图表化 → ③诊断 → ④干预调整 → ⑤再监控
 *   - NCII 决策规则：图上出现连续 3~4 个数据点低于 aim line 时，应调整干预
 *   - Wisconsin DPI《Monitoring Progress of IEP Goals》(2020)：监控清单
 *   - Rubric for Evaluating IEPs：IEP 各组成部分必须「内在一致」
 *
 * 设计约束：
 *   1. 本文件不替教师做决定，只产出「证据 + 候选方向」，措辞必须是提示而非结论
 *   2. 所有计算均可解释：返回值里必须带上判据（用了哪几个点、阈值多少）
 *   3. 数据不足时明确返回 nodata，绝不硬套默认值伪装成有结论
 */

if (!function_exists('pa_days_between')) {

    // ========================================================================
    // 0. 基础工具
    // ========================================================================

    /** 两个日期之间相差天数（可为负） */
    function pa_days_between(string $from, string $to): int
    {
        try {
            $a = new DateTimeImmutable(substr($from, 0, 10));
            $b = new DateTimeImmutable(substr($to, 0, 10));
        } catch (Exception $e) {
            return 0;
        }
        $diff = $a->diff($b);
        return (int)$diff->format('%r%a');
    }

    /** 安全数值转换 */
    function pa_num($v): ?float
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return null;
        return (float)$v;
    }

    /** 今天是哪天（可被测试注入覆盖） */
    function pa_today(): string
    {
        return date('Y-m-d');
    }

    /**
     * 监控频率 → 期望采集间隔（天）
     * 「每次课」按每周约 2 次折算；该折算是近似值，返回值里会标注，避免假精确。
     */
    function pa_frequency_days(?string $freq): ?float
    {
        $map = [
            '每次课' => 3.0,
            '每天'   => 1.0,
            '每周2次' => 3.5,
            '每周1次' => 7.0,
            '每两周' => 14.0,
            '每月'   => 30.0,
        ];
        return $map[$freq] ?? null;
    }

    // ========================================================================
    // 1. 取数
    // ========================================================================

    /**
     * 取某目标的进度时间序列（按日期升序）
     *
     * 两条数据来源口径不同，必须显式区分，不能混着画一条线：
     *   A. goal_progress   —— iep_goal_progress 的 0~5 主观评级（只有 5 档，粗）
     *   B. objective_trial —— iep_objective_records 的离散试次（成功数/试次数 → 达成率）
     *
     * 默认优先 B：NCII 与课程本位测量均推荐「可计数的行为」而非主观评级；
     * 且实测演示数据中 B 的数据点约为 A 的 3 倍，趋势判断更可靠。
     *
     * @return array{points:array, source:string, meta:array}
     */
    function pa_fetch_series(PDO $pdo, int $goalId, string $prefer = 'auto', array $goal = []): array
    {
        // 达标判定层级：默认 independent（独立完成才叫掌握）。
        // 系统自己的掌握标准写的就是「连续 3 次 ≥80% 独立完成」，分母本就该是独立试次。
        $targetLevel = strtolower(trim((string)($goal['target_prompt_level'] ?? '')));
        if ($targetLevel === '') {
            $gstmt = $pdo->prepare('SELECT target_prompt_level FROM iep_goals WHERE id = ? LIMIT 1');
            $gstmt->execute([$goalId]);
            $targetLevel = strtolower(trim((string)($gstmt->fetchColumn() ?: '')));
        }
        if ($targetLevel === '') $targetLevel = 'independent';
        // ---- A：0~5 主观评级 ----
        $stmt = $pdo->prepare(
            'SELECT id, recorded_date, session_type, score, max_score, prompt_level, notes
               FROM iep_goal_progress
              WHERE goal_id = ?
              ORDER BY recorded_date ASC, id ASC'
        );
        $stmt->execute([$goalId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $ratingPoints = [];
        $observedMax  = null;
        foreach ($rows as $r) {
            $score = pa_num($r['score']);
            $max   = pa_num($r['max_score']);
            if ($score === null) continue;
            // 归一化到 0-100 百分位：有满分则按比例，否则视为已是百分制
            if ($max !== null && $max > 0) {
                $value = round($score * 100.0 / $max, 2);
                $observedMax = $observedMax === null ? $max : max($observedMax, $max);
            } else {
                $value = round($score, 2);
            }
            $ratingPoints[] = [
                'id'           => (int)$r['id'],
                'date'         => substr((string)$r['recorded_date'], 0, 10),
                'value'        => $value,
                'raw'          => ($max !== null && $max > 0)
                    ? sprintf('%s/%s', rtrim(rtrim(number_format($score, 2), '0'), '.'),
                                       rtrim(rtrim(number_format($max, 2), '0'), '.'))
                    : (string)$score,
                'prompt_level' => $r['prompt_level'],
                'session_type' => $r['session_type'],
            ];
        }

        // ---- B：离散试次（按辅助层级分组，主序列取「达标判定层级」）----
        // ADR-010 之所以要求按辅助层级分组落库，就是因为不同层级下的「成功」不是一个含义。
        // 但如果读取时又按日期 SUM 回一条混合线，撤提示的过程会被算术彻底抹平：
        //     肢体辅助下 8/10=80%  →  完全独立下 6/10=60%
        //   混合看是「退步 20 个百分点」，实则是撤除了全部辅助的巨大进步。
        // 因此这里按层级各自成列，主序列取 target_prompt_level，混合线仅作参考。
        $trialStmt = $pdo->prepare(
            'SELECT r.record_date, r.prompt_level,
                    SUM(r.trial_count)   AS trials,
                    SUM(r.success_count) AS successes
               FROM iep_objective_records r
               JOIN iep_objectives o ON r.objective_id = o.id
              WHERE o.goal_id = ? AND r.deleted_at IS NULL AND o.deleted_at IS NULL
              GROUP BY r.record_date, r.prompt_level
              ORDER BY r.record_date ASC'
        );
        $trialStmt->execute([$goalId]);

        $byLevel = [];   // level => date => ['trials','successes']
        $mixed   = [];   // date  => ['trials','successes']（全层级混合，仅作参考线）
        foreach ($trialStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $date  = substr((string)$r['record_date'], 0, 10);
            $level = strtolower(trim((string)($r['prompt_level'] ?: '')));
            if ($level === '') $level = 'unknown';
            $tr = (int)$r['trials'];
            $su = (int)$r['successes'];
            if (!isset($byLevel[$level][$date])) $byLevel[$level][$date] = ['trials' => 0, 'successes' => 0];
            $byLevel[$level][$date]['trials']    += $tr;
            $byLevel[$level][$date]['successes'] += $su;
            if (!isset($mixed[$date])) $mixed[$date] = ['trials' => 0, 'successes' => 0];
            $mixed[$date]['trials']    += $tr;
            $mixed[$date]['successes'] += $su;
        }

        $mkPoints = function (array $map, ?string $level) {
            $out = [];
            foreach ($map as $date => $v) {
                if ((int)$v['trials'] <= 0) continue;
                $out[] = [
                    'id'           => 0,
                    'date'         => $date,
                    'value'        => round((int)$v['successes'] * 100.0 / (int)$v['trials'], 2),
                    'raw'          => sprintf('%d/%d', (int)$v['successes'], (int)$v['trials']),
                    'prompt_level' => $level,
                    'session_type' => '试次记录',
                ];
            }
            usort($out, fn($a, $b) => strcmp($a['date'], $b['date']));
            return $out;
        };

        // 主序列：目标层级。若无该层级数据，回退到「最接近独立的已记录层级」并标注。
        $levelOrder = ['independent', 'verbal', 'gesture', 'model', 'physical'];
        $usedLevel  = null;
        $faded      = false;
        if (!empty($byLevel[$targetLevel])) {
            $usedLevel = $targetLevel;
        } else {
            foreach ($levelOrder as $lv) {
                if (!empty($byLevel[$lv])) { $usedLevel = $lv; $faded = true; break; }
            }
            if ($usedLevel === null && !empty($byLevel)) {
                $best = null; $bestN = -1;
                foreach ($byLevel as $lv => $m) {
                    if (count($m) > $bestN) { $bestN = count($m); $best = $lv; }
                }
                $usedLevel = $best; $faded = true;
            }
        }

        $trialPoints = $usedLevel !== null ? $mkPoints($byLevel[$usedLevel], $usedLevel) : [];
        $trialMixed  = $mkPoints($mixed, null);
        $levelSeries = [];
        foreach ($byLevel as $lv => $m) {
            $levelSeries[$lv] = $mkPoints($m, $lv);
        }

        if ($prefer === 'rating') {
            $use = $ratingPoints; $source = 'goal_progress';
        } elseif ($prefer === 'trial') {
            $use = $trialPoints;  $source = 'objective_trial';
        } elseif (count($trialPoints) > 0) {
            $use = $trialPoints;  $source = 'objective_trial';
        } else {
            $use = $ratingPoints; $source = 'goal_progress';
        }

        return [
            'points'       => $use,
            'points_mixed' => $trialMixed,          // 全辅助层级混合线：仅作参考，不用于判定
            'by_level'     => $levelSeries,         // 各辅助层级各自的序列：撤提示进展的证据
            'source'       => $source,
            'meta'         => [
                'rating_points'       => count($ratingPoints),
                'trial_points'        => count($trialPoints),
                'observed_max'        => $observedMax,
                'target_level'        => $targetLevel,
                'judged_level'        => ($source === 'objective_trial') ? $usedLevel : null,
                'judged_level_faded'  => ($source === 'objective_trial') ? $faded : null,
                'levels_available'    => array_keys($levelSeries),
                'trial_points_mixed'  => count($trialMixed),
            ],
        ];
    }

    /** 取目标定义（含 v7 新增的监控元数据） */
    function pa_fetch_goal(PDO $pdo, int $goalId): ?array
    {
        $stmt = $pdo->prepare(
            // direction / target_prompt_level 是 v11 新增的判定元信息：
            // 漏掉它们，方向会静默退化成 increase，递减型目标又被反向判定。
            'SELECT id, iep_plan_id, area, title, criteria, baseline, evaluation_method,
                    monitor_frequency, monitor_method, monitor_owner_id,
                    baseline_value, baseline_date, target_value, target_score,
                    direction, target_prompt_level, measurement_scale,
                    start_date, target_date, responsible_teacher_id, status
               FROM iep_goals WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$goalId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * 取该目标下短期目标「掌握阈值」的均值
     * 这才是真正的掌握标准（演示数据中 126 条短期目标统一为 80%），
     * 比 0-5 主观评级的满分更能代表「达成」。
     */
    function pa_fetch_mastery_pct(PDO $pdo, int $goalId): ?float
    {
        $stmt = $pdo->prepare(
            'SELECT AVG(mastery_pct) FROM iep_objectives
              WHERE goal_id = ? AND deleted_at IS NULL AND mastery_pct IS NOT NULL'
        );
        $stmt->execute([$goalId]);
        $v = $stmt->fetchColumn();
        return ($v === null || $v === false) ? null : (float)$v;
    }

    /** 取某目标下的干预调整记录 */
    function pa_fetch_adjustments(PDO $pdo, int $goalId, ?int $planId = null): array
    {
        if ($planId !== null) {
            $stmt = $pdo->prepare(
                'SELECT a.*, u.real_name AS decided_by_real_name
                   FROM iep_intervention_adjustments a
                   LEFT JOIN users u ON a.decided_by = u.id
                  WHERE a.iep_plan_id = ? AND (a.goal_id = ? OR a.goal_id IS NULL) AND a.deleted_at IS NULL
                  ORDER BY a.adjusted_at ASC, a.id ASC'
            );
            $stmt->execute([$planId, $goalId]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT a.*, u.real_name AS decided_by_real_name
                   FROM iep_intervention_adjustments a
                   LEFT JOIN users u ON a.decided_by = u.id
                  WHERE a.goal_id = ? AND a.deleted_at IS NULL
                  ORDER BY a.adjusted_at ASC, a.id ASC'
            );
            $stmt->execute([$goalId]);
        }
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // ========================================================================
    // 2. Aim line（目标线）—— 取代此前的硬编码 y=80
    //
    //    定义：从「起始基线」到「期末目标」的一条斜线，而不是一条水平线。
    //     - 起点值：优先 goal.baseline_value；缺失时回退到首个实测数据点（通行做法）
    //     - 起点日：baseline_date；缺失时回退到首个实测点日期或目标开始日
    //     - 终点值：target_value；缺失时回退 target_score
    //     - 终点日：goal.target_date；缺失时回退所属计划的 end_date
    // ========================================================================

    /**
     * 量纲显式化（ADR-003）：教师声明了量纲，就按声明把期末目标折算成百分制。
     *
     * 为什么补：系统此前只能拿 target_score 的数值去猜量纲（≤观测满分当原始分、
     * >10 当百分制），猜不出来就退回「统一 80% 掌握标准」。这等于让系统替
     * 教师决定「什么叫达成」，与个别化原则正面冲突：同一个 5 分，在 0-5
     * 评级制下是满分，在百分制下是 5% —— 猜错一次，目标线整条错。
     *
     * 口径：仅在显式声明（非 auto/other）且未直接填写 target_value 时折算；
     * 已填 target_value 的一律以显式百分制为准，优先级最高。
     * 默认 auto → 原样返回，走 pa_aim_line() 的历史反推，存量数据零变化。
     *
     * @param array $goal 会被就地补全 target_value（引用传递）
     */
    function pa_apply_declared_scale(array &$goal, ?float $observedMax, ?float $masteryPct): void
    {
        $scale = strtolower(trim((string)($goal['measurement_scale'] ?? 'auto')));
        if ($scale === '' || $scale === 'auto' || $scale === 'other') return;

        // 已直接给了百分制期末目标值 —— 它是最权威的，不再折算
        if (pa_num($goal['target_value'] ?? null) !== null) return;

        $ts = pa_num($goal['target_score'] ?? null);
        if ($ts === null) return;

        if ($scale === 'percent') {
            $goal['target_value'] = max(0.0, min(100.0, $ts));
            return;
        }

        if ($scale === 'rating_5') {
            // 0-5 评级制下「掌握」不等于「满分」：真正的标准是短期目标里写的
            // mastery_pct（演示数据中为 80%）；没有 mastery 才按 5 分制折算。
            $goal['target_value'] = ($masteryPct !== null && $masteryPct > 0)
                ? max(0.0, min(100.0, $masteryPct))
                : max(0.0, min(100.0, $ts * 100.0 / 5.0));
        }
    }

    function pa_aim_line(
        array   $goal,
        array   $points,
        ?array  $plan       = null,
        ?float  $observedMax = null,
        ?float  $masteryPct  = null
    ): array {
        $first = $points[0] ?? null;
        $targetScale = 'given';

        // 期末目标值：优先取已归一化的 target_value。
        // 缺失时按量纲回退 —— 实测 iep_goals.target_score 这一列历史上混用了两种量纲：
        //   演示数据中 68 个目标是「0-5 评分制」的 5 分，10 个目标是百分制的 100。
        // 若不区分，0-5 制的目标会被当成 5% 的目标线，画出来的线比硬编码 80 更离谱。
        // 判据：target_score 不超过观测到的满分 → 原始分，按比例折算；否则视为百分制。
        // 实测 iep_goals.target_score 这一列混用了两种量纲：演示数据中 68 个目标是
        // 「0-5 主观评级制」的 5 分，10 个目标是百分制的 100。若不区分，0-5 制的目标
        // 会被当成「5% 的目标」甚至「5/5=100% 必须全对」，两者都比原来的硬编码 80 更离谱。
        //
        // 取值优先级（每一档都可追溯到具体数据）：
        //   ① 显式填写的 target_value（百分制）
        //   ② target_score 明显是百分制（没有观测满分，或超过观测满分）
        //   ③ 短期目标掌握阈值的均值 mastery_pct —— 这才是真正的「掌握标准」
        //   ④ 按观测满分把 target_score 折算成百分制（兜底）
        $endValue = pa_num($goal['target_value'] ?? null);
        if ($endValue !== null) {
            $targetScale = 'target_value';
        } else {
            $ts = pa_num($goal['target_score'] ?? null);
            if ($ts !== null) {
                $rawScale = ($observedMax !== null && $observedMax > 0 && $ts <= $observedMax);
                if ($rawScale) {
                    // 确认是原始分量纲（如 0-5 制）：真正的掌握标准是短期目标的 mastery_pct，
                    // 而不是「拿满分」——5/5=100% 会把掌握标准顶到必须全对。
                    if ($masteryPct !== null && $masteryPct > 0) {
                        $endValue    = max(0.0, min(100.0, $masteryPct));
                        $targetScale = 'objectives_mastery_avg';
                    } else {
                        $endValue    = $ts * 100.0 / $observedMax;
                        $targetScale = sprintf('raw(%s/%s)', rtrim(rtrim(number_format($ts, 2), '0'), '.'),
                                                             rtrim(rtrim(number_format($observedMax, 2), '0'), '.'));
                    }
                } elseif ($ts > 10) {
                    // 明显是百分制（如 100）
                    $endValue    = max(0.0, min(100.0, $ts));
                    $targetScale = 'target_score(percent)';
                } elseif ($masteryPct !== null && $masteryPct > 0) {
                    // target_score 是小数值（0-5 / 0-10 制）但没有可核对的观测满分。
                    // 绝不把它当成百分位——否则 5 分的目标会被画成 5% 的目标线，
                    // 斜率还是负的，学生达成率 21% 也能被判「已达期末目标」。
                    $endValue    = max(0.0, min(100.0, $masteryPct));
                    $targetScale = 'objectives_mastery_avg(fallback)';
                } else {
                    // 量纲不可判定 → 不臆造。ADR-002 的精神同样适用于量纲：
                    // 宁可说「无法计算」，也不能画一条错的目标线。
                    return [
                        'valid'  => false,
                        'reason' => sprintf(
                            '期末目标量纲不可判定：target_score=%s 既不像百分制，也没有可核对的观测满分，'
                            . '无法安全折算成百分位。请直接填写「期末目标值（百分制）」，或补录带满分的评分记录。',
                            rtrim(rtrim(number_format($ts, 2), '0'), '.')
                        ),
                    ];
                }
            }
        }
        if ($endValue !== null) $endValue = max(0.0, min(100.0, $endValue));

        $endDate = !empty($goal['target_date']) ? substr((string)$goal['target_date'], 0, 10) : null;
        if ($endDate === null && !empty($plan['end_date'])) {
            $endDate = substr((string)$plan['end_date'], 0, 10);
        }

        $startValue = pa_num($goal['baseline_value'] ?? null);
        if ($startValue !== null) $startValue = max(0.0, min(100.0, $startValue));

        $startDate = !empty($goal['baseline_date']) ? substr((string)$goal['baseline_date'], 0, 10) : null;

        // 基线缺失 → 取前 3 个实测点的中位数作为起点。
        // 用中位数而非首点，是 NCII 推荐的抗离群做法：单次突发表现不应成为整年的起跑线。
        if ($startValue === null && count($points) > 0) {
            $vals = array_map(fn($p) => (float)$p['value'], array_slice($points, 0, 3));
            sort($vals);
            $n = count($vals);
            $startValue = ($n % 2 === 1)
                ? $vals[($n - 1) / 2]
                : ($vals[$n / 2 - 1] + $vals[$n / 2]) / 2.0;
            $startDate  = $startDate ?: $points[0]['date'];
        }
        // 没有显式基线、也没有任何数据点时，绝不臆造基线（此前会退化成 0，
        // 于是画出的目标线是一条从 0 起的假线，比原来的硬编码 80 更具误导性）。
        if ($startValue === null) {
            return [
                'valid'  => false,
                'reason' => '本目标还没有基线数据：请填写起始水平数值，或先采集至少一次进度数据'
                            . '（系统将取前 3 次数据的中位数作为基线，以避免单次波动造成误判）',
            ];
        }
        if ($startDate === null) {
            $startDate = !empty($goal['start_date']) ? substr((string)$goal['start_date'], 0, 10) : null;
        }

        if ($endValue === null || $endDate === null || $startDate === null) {
            return [
                'valid' => false,
                'reason' => '缺少期末目标值或有效日期区间，无法绘制目标线（请在目标中补全「期末目标值」与「达成截止日」）',
            ];
        }

        $span = pa_days_between($startDate, $endDate);
        if ($span === 0) {
            // 同一天起止：退化为水平线，但仍是「本目标自己的目标」，而非全局常量
            $slope = 0.0;
        } elseif ($span < 0) {
            return [
                'valid' => false,
                'reason' => '目标达成截止日早于基线日期，日期区间不合法',
            ];
        } else {
            $slope = ($endValue - $startValue) / $span; // 百分点 / 天
        }

        return [
            'valid'       => true,
            'start_date'  => $startDate,
            'start_value' => round($startValue, 2),
            'end_date'    => $endDate,
            'end_value'   => round($endValue, 2),
            'slope'       => round($slope, 4),
            'source'      => [
                'start'        => pa_num($goal['baseline_value'] ?? null) !== null ? 'baseline_value' : 'first_data_point',
                'end'          => pa_num($goal['target_value'] ?? null) !== null ? 'target_value' : 'target_score',
                'target_scale' => $targetScale,
            ],
        ];
    }

    /** 求 aim line 在任意日期上的取值（起止区间外做钳制） */
    function pa_aim_value_at(array $aim, string $date): ?float
    {
        if (empty($aim['valid'])) return null;
        $span = pa_days_between($aim['start_date'], $aim['end_date']);
        if ($span === 0) return (float)$aim['end_value'];
        $offset = pa_days_between($aim['start_date'], $date);
        if ($offset < 0) return (float)$aim['start_value'];
        if ($offset > $span) return (float)$aim['end_value'];
        return round((float)$aim['start_value'] + $offset * (float)$aim['slope'], 2);
    }

    // ========================================================================
    // 3. Trend line（趋势线）—— 最小二乘拟合最近 n 个点
    // ========================================================================

    function pa_trend_line(array $points, int $n = 4): ?array
    {
        $count = count($points);
        if ($count < 2) return null;

        $n = max(2, min(8, $n));           // 官方进度监控实践推荐 4~8 个点
        $use = array_slice($points, -$n);
        $k   = count($use);
        if ($k < 2) return null;

        // x 以「距首个点的天数」计，避免日期字符串参与运算
        $baseDate = $use[0]['date'];
        $xs = [];
        $ys = [];
        foreach ($use as $p) {
            $xs[] = (float)pa_days_between($baseDate, $p['date']);
            $ys[] = (float)$p['value'];
        }

        // 所有点同一天 → 无法定义斜率
        $unique = array_unique($xs);
        if (count($unique) < 2) return null;

        $mx = array_sum($xs) / $k;
        $my = array_sum($ys) / $k;
        $num = 0.0;
        $den = 0.0;
        for ($i = 0; $i < $k; $i++) {
            $dx = $xs[$i] - $mx;
            $num += $dx * ($ys[$i] - $my);
            $den += $dx * $dx;
        }
        if ($den == 0.0) return null;

        $slope     = $num / $den;            // 百分点 / 天
        $intercept = $my - $slope * $mx;

        return [
            'n'           => $k,
            'base_date'   => $baseDate,
            'start_date'  => $use[0]['date'],
            'end_date'    => $use[$k - 1]['date'],
            'slope'       => round($slope, 4),
            'intercept'   => round($intercept, 4),
            'start_value' => round($intercept + $slope * $xs[0], 2),
            'end_value'   => round($intercept + $slope * $xs[$k - 1], 2),
        ];
    }

    // ========================================================================
    // 4. 决策规则 —— 把图上的形状翻译成「要不要动、往哪几个方向动」
    //
    //    规则 A（4 点法则 / NCII）：最近 4 个数据点
    //        全部低于 aim line → adjust（须调整干预）
    //        3 个低于         → watch（列入观察）
    //        否则             → on_track
    //    规则 B（增速比）：trend 斜率 / aim 斜率
    //        < 0.5 → adjust；0.5~0.8 → watch；否则 ok
    //    规则 C（数据陈旧）：距上次采集 > 2 倍期望间隔 → stale（先补数据再判断）
    //    规则 D（倒退）：最近点在下降且低于前一点一定幅度 → watch
    //
    //    最终等级取各信号中最严重者。
    //    注意：系统不输出「应当改为 X」，只输出候选调整方向，决定权在 IEP 团队。
    // ========================================================================

    /** 等级严重度：显式排序表，用于「取各信号中最严重者」。
     *  原先靠 if/else 隐式覆盖，规则之间会互相吃掉对方的等级。 */
    function pa_level_severity(string $level): int
    {
        static $map = [
            'nodata'     => 0,
            'mastered'   => 1,
            'on_track'   => 2,
            'stale'      => 3,
            'watch'      => 4,
            'adjust'     => 5,
            'regression' => 6,
        ];
        return $map[$level] ?? 0;
    }

    /** 一个数据点背后有多少次试次 —— 从 raw（"成功数/总次数"）解析。
     *  解析不到返回 null：旧数据或非试次来源的进度记录，调用方按「未知」处理。 */
    function pa_point_trials(array $p): ?int
    {
        $raw = (string)($p['raw'] ?? '');
        if ($raw !== '' && preg_match('#^\s*\d+\s*/\s*(\d+)\s*$#', $raw, $m)) {
            $n = (int)$m[1];
            return $n > 0 ? $n : null;
        }
        return null;
    }

    /**
     * 倒退判定的幅度门槛 —— 随试次数缩放，而不是写死 8 个百分点。
     *
     * 为什么改（评估报告第七节排序第 3 位）：
     *   原实现「变动 ≥ 8pt 即判倒退」与这一格数据由多少次试次构成完全无关。
     *   但达成率的最小分辨率就是 100/n：
     *     · 一次练习 5 次试次 —— 多对一次就是 ±20pt，随手波动就能越线；
     *     · 一次练习 25 次试次 —— 一次成败只有 4pt，真掉 8pt 已是相当确定的下滑。
     *   培智课堂里「每节课 5 次试次」极常见，固定阈值等于把噪声当倒退；
     *   教师照着改方案，就会推翻本来有效的方法 —— 这是系统最不该犯的错。
     *
     * 口径：门槛 = max(8, ceil(100/n) × 2)，n 取最近两个数据点中较小的试次数。
     *   —— 即「至少相当于连续两次试次由成转败」，偶然一次波动不足以触发。
     *   试次数未知时退回 8pt 但不声称做了检验；n < 4 时判定「样本不足」不给倒退结论。
     *
     * @return array{0:float,1:bool,2:string} [门槛百分点, 样本是否足够, 口径来源]
     */
    function pa_regression_threshold(array $points): array
    {
        $recent = array_slice($points, -2);
        $ns     = [];
        foreach ($recent as $p) {
            $n = pa_point_trials($p);
            if ($n !== null) { $ns[] = $n; }
        }

        if ($ns === []) {
            return [8.0, true, 'fallback'];      // 试次数未知，沿用原口径
        }

        $n = min($ns);
        if ($n < 4) {
            return [101.0, false, 'insufficient']; // 分辨率 < 25pt，不判倒退
        }

        return [max(8.0, ceil(100.0 / $n) * 2), true, 'scaled'];
    }

    /**
     * 最小二乘斜率的 t 检验 —— 区分「趋势真的反了」与「看起来像反了」。
     *
     * 为什么补（评估报告第七节排序第 3 位）：
     *   规则 B 原先只要 ratio < 0 就判 regression。但斜率是从数据点估出来的
     *   统计量，不是事实本身：点少、试次少的时候，一次偶然波动就能把斜率
     *   拉成负的。教师看到「出现倒退，优先复核」就去推翻方案，结果推翻的
     *   可能是一个正在起效的方法 —— 这比漏报更伤。
     *
     *   专业上的做法（DBI / 单一被试设计的通行要求）是：方向性结论要过
     *   显著性检验，而不是看估计值的符号。本函数算斜率的 t 值并与
     *   df = n-2 的双尾 0.05 临界值比较。
     *
     * 口径：x 取距首个数据点的天数（等距采集时与序号等价，不等距时更准）。
     *
     * @return array{0:float,1:bool,2:int} [t 值, 是否显著, 样本点数]
     */
    function pa_slope_significance(array $points): array
    {
        // points 只有 date，没有现成的 x：这里用「距本序列首个数据点的天数」作为 x。
        // 等距采集时与序号等价；不等距（补课、请假）时天数才是正确的自变量。
        $xs   = [];
        $ys   = [];
        $base = null;
        foreach ($points as $p) {
            $d = substr((string)($p['date'] ?? ''), 0, 10);
            if ($d === '') { continue; }
            if ($base === null) { $base = $d; }
            $xs[] = (float)pa_days_between($base, $d);
            $ys[] = (float)$p['value'];
        }
        $n = count($xs);
        if ($n < 4) { return [0.0, false, $n]; }

        $mx = array_sum($xs) / $n;
        $my = array_sum($ys) / $n;

        $sxx = 0.0;
        $sxy = 0.0;
        $syy = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $dx = $xs[$i] - $mx;
            $dy = $ys[$i] - $my;
            $sxx += $dx * $dx;
            $sxy += $dx * $dy;
            $syy += $dy * $dy;
        }

        if ($sxx <= 0.0) { return [0.0, false, $n]; }   // x 无变化，斜率不可估

        $slope = $sxy / $sxx;
        $sse   = max(0.0, $syy - $slope * $sxy);
        $df    = $n - 2;
        $mse   = $sse / $df;
        if ($mse <= 0.0) {
            // 残差为 0：完美线性。方向上要么严格为 0、要么确实反了，
            // 此时任何非零斜率都应视为确定结论。
            return [$slope == 0.0 ? 0.0 : 99.0, $slope != 0.0, $n];
        }

        $se = sqrt($mse / $sxx);
        if ($se <= 0.0) { return [0.0, false, $n]; }

        $t = $slope / $se;
        $crit = pa_t_critical_95($df);
        return [$t, abs($t) >= $crit, $n];
    }

    /** t 分布双尾 0.05 临界值（df = n-2），够用的小样本段位表。 */
    function pa_t_critical_95(int $df): float
    {
        $table = [
            1 => 12.706, 2 => 4.303, 3 => 3.182, 4 => 2.776, 5 => 2.571,
            6 => 2.447, 7 => 2.365, 8 => 2.306, 9 => 2.262, 10 => 2.228,
            11 => 2.201, 12 => 2.179, 13 => 2.160, 14 => 2.145, 15 => 2.131,
            16 => 2.120, 17 => 2.110, 18 => 2.101, 19 => 2.093, 20 => 2.086,
            25 => 2.060, 30 => 2.042, 40 => 2.021, 60 => 2.000, 120 => 1.980,
        ];
        if ($df <= 0) { return 12.706; }
        if (isset($table[$df])) { return $table[$df]; }
        if ($df > 120) { return 1.960; }
        // 表内相邻两点线性插值，避免段位跳跃带来的判定抖动
        $keys = array_keys($table);
        $lo   = $keys[0];
        $hi   = $keys[count($keys) - 1];
        foreach ($keys as $k) {
            if ($k <= $df) { $lo = $k; }
            if ($k >= $df) { $hi = $k; break; }
        }
        if ($lo === $hi) { return $table[$lo]; }
        return $table[$lo] + ($table[$hi] - $table[$lo]) * ($df - $lo) / ($hi - $lo);
    }

    function pa_decide(array $points, ?array $aim, ?array $trend, ?string $monitorFrequency, string $direction = 'increase'): array
    {
        $reasons = [];
        $level   = 'nodata';
        $ruleHit = [];
        $dec     = ($direction === 'decrease') ? -1 : 1;

        // ---- 目标方向：决定所有比较的符号 ----
        //   increase（默认）：达成率越高越好 —— 低于目标线 = 不达标，达到 = 达标
        //   decrease：发生率越低越好 —— 高于目标线 = 不达标，低于 = 达标
        // 不建模方向时，「降低问题行为发生率」这类终点低于基线的目标会被 100% 反向判定：
        //   行为比基线还严重 → 判「已达标，建议提高要求」；真正好转 → 判「需关注」。
        $isBelow   = $dec > 0 ? (fn($v, $av) => $v <  $av) : (fn($v, $av) => $v >  $av);
        $isReached = $dec > 0 ? (fn($v, $tv) => $v >= $tv) : (fn($v, $tv) => $v <= $tv);
        $isWorse   = $dec > 0 ? (fn($a, $b)  => $a <  $b)  : (fn($a, $b)  => $a >  $b);
        $dirText   = $dec > 0 ? '达成率越高越好' : '发生率越低越好';
        $belowWord = $dec > 0 ? '低于' : '高于';

        $escalate = function (string $new) use (&$level) {
            if (pa_level_severity($new) > pa_level_severity($level)) $level = $new;
        };

        $mkEvidence = function (int $window, $belowCount, $ratio, $gap, $expected) use ($points, $direction, &$ruleHit) {
            // 斜率显著性检验的结果一并带上：教师/教研看到「倒退」时，
            // 应当同时看到这个结论是否过了显著性门槛（原则②可解释）。
            [$tVal, $significant] = pa_slope_significance($points);
            return [
                'points'          => count($points),
                'below_window'    => $window,
                'below_count'     => $belowCount,
                'trend_ratio'     => $ratio === null ? null : round($ratio, 3),
                'days_since_last' => $gap,
                'expected_days'   => $expected,
                'direction'       => $direction,
                // 倒退门槛随试次数缩放（见 pa_regression_threshold）：让教师看到
                // 「这条倒退不是随手一格波动，而是越过了 N 个百分点的线」——
                // 原则②「每个自动结论都可解释」的一部分。
                'regression_threshold' => pa_regression_threshold($points)[0],
                'slope_t'             => round($tVal, 2),
                'slope_significant'   => $significant,
                'rule_hit'        => $ruleHit,
            ];
        };

        if (count($points) === 0) {
            return [
                'level'      => 'nodata',
                'level_text' => '尚无数据',
                'reasons'    => ['本目标还没有任何进度记录，无法判断是否有效'],
                'evidence'   => ['points' => 0, 'direction' => $direction],
                'suggestions' => [
                    ['id' => 'nodata:record', 'type' => 'record',
                     'text' => '先按设定的监控频率采集至少 4 个数据点，才能做趋势判断']
                ],
            ];
        }

        // ---- 规则 C：数据陈旧 ----
        $last     = $points[count($points) - 1];
        $gap      = pa_days_between($last['date'], pa_today());
        $expected = pa_frequency_days($monitorFrequency);
        $stale    = false;
        if ($expected !== null && $gap > $expected * 2) {
            $reasons[] = sprintf(
                '距上次采集已 %d 天（设定频率约每 %.0f 天一次），数据已不足以支撑判断',
                $gap, $expected
            );
            $stale = true;
            $ruleHit[] = 'C';
            $escalate('stale');
        }

        // ---- DBI 4 点法则：不足 4 点不给结论 ----
        // 此前 1 个数据点就能得出「进展符合预期 / 暂未发现异常信号」，
        // 等于把「没有证据」伪装成「有结论」，违背 ADR-002。
        if (count($points) < 4) {
            $reasons[] = sprintf(
                '当前仅 %d 个数据点，按 DBI 4 点法则不足以做趋势判断（需 ≥ 4 点）',
                count($points)
            );
            $sug = [['id' => 'nodata:record', 'type' => 'record', 'text' => sprintf(
                '继续按监控频率采集，累计满 4 个数据点后才能给出判断（当前 %d 个）', count($points))]];
            if ($stale) {
                $sug[] = ['id' => 'nodata:record_overdue', 'type' => 'record',
                          'text' => '上次采集已逾期，请先补采缺失日期的数据'];
            }
            return [
                'level'       => 'nodata',
                'level_text'  => '数据不足',
                'reasons'     => $reasons,
                'evidence'    => $mkEvidence(count($points), null, null, $gap, $expected),
                'suggestions' => $sug,
            ];
        }

        // ---- 增速比：先算出来，Rule A 判断「尚未达标 vs 干预无效」时要参考 ----
        $ratio = null;
        if ($trend !== null && $aim !== null && !empty($aim['valid']) && abs((float)$aim['slope']) > 0.0001) {
            $ratio = (float)$trend['slope'] / (float)$aim['slope'];
        }

        // ---- 规则 D：倒退（方向敏感 + 随样本量缩放的幅度门槛）----
        // 门槛不再写死 8pt：达成率的最小分辨率是 100/n，固定阈值会让
        // 「每节课只做 5 次试次」的班级把一次偶然波动判成倒退。
        // 教师据此推翻原本有效的方法，是系统最不该犯的错。口径见
        // pa_regression_threshold()。
        $dropPct = null;
        if (count($points) >= 3) {
            $prev  = (float)$points[count($points) - 2]['value'];
            $prev2 = (float)$points[count($points) - 3]['value'];
            $lastV = (float)$last['value'];
            $monotone = $dec > 0 ? ($lastV <= $prev) : ($lastV >= $prev);
            if ($isWorse($lastV, $prev2) && $monotone) {
                $dropPct = abs($lastV - $prev2);
                [$dropThreshold, $enoughTrials] = pa_regression_threshold($points);
                if (!$enoughTrials) {
                    // 最近数据点只由 3 次以内试次构成：此时说「倒退了」证明不了，
                    // 比不说更糟（ADR-002 不臆造）。提示加密采集而非报警。
                    $reasons[] = sprintf(
                        '最近出现%s（%.0f → %.0f → %.0f），但最近数据点的试次数过少，'
                        . '无法区分真实倒退与随机波动——请先加密采集再判断',
                        $dec > 0 ? '回落' : '回升', $prev2, $prev, $lastV
                    );
                } elseif ($dropPct >= $dropThreshold) {
                    $reasons[] = sprintf(
                        '最近三次出现%s：%.0f → %.0f → %.0f（变动 %.0f 个百分点，'
                        . '超过本次样本量下 %.0f 个百分点的波动线）',
                        $dec > 0 ? '回落' : '回升', $prev2, $prev, $lastV, $dropPct, $dropThreshold
                    );
                    $ruleHit[] = 'D';
                    $escalate('regression');
                }
            }
        }

        // ---- 达成信号：达标即达标，先于 Rule A/B 短路 ----
        // 此前 mastered 只能从 on_track 晋升，而 Rule B 会先把已稳居目标之上的学生打成 adjust，
        // 导致「常年 95%（目标 80%）」的孩子收到「建议调整干预」——越优秀越报警。
        $targetValue = $aim['end_value'] ?? null;
        $reached = false;
        if ($targetValue !== null && $level !== 'regression') {
            foreach (array_slice($points, -3) as $p) {
                if ($isReached((float)$p['value'], (float)$targetValue)) { $reached = true; break; }
            }
        }
        if ($reached) {
            $reasons[] = sprintf(
                '最近已有数据点达到%s期末目标值 %.0f（%s），可考虑提升目标或转入泛化/维持期',
                $dec > 0 ? '或超过' : '或低于', (float)$targetValue, $dirText
            );
            $ruleHit[] = 'reached';
            if ($stale) {
                $reasons[] = '注意：数据已有一段时间未更新，转入维持期前建议先复核一次';
            }
            return [
                'level'      => 'mastered',
                'level_text' => '已达标，建议复核',
                'reasons'    => $reasons,
                'evidence'   => $mkEvidence(4, null, null, $gap, $expected),
                'suggestions' => pa_suggest_tagged('mastered', $points, $aim),
            ];
        }

        // ---- 规则 A：目标线比较（方向敏感）----
        $belowCount = 0;
        $window     = 0;
        if ($aim !== null && !empty($aim['valid'])) {
            $recent = array_slice($points, -4);
            $window = count($recent);
            foreach ($recent as $p) {
                $av = pa_aim_value_at($aim, $p['date']);
                if ($av !== null && $isBelow((float)$p['value'], $av)) $belowCount++;
            }
            if ($window >= 4 && $belowCount >= 4) {
                // 全低于目标线时，是否判「干预无效」取决于增速，而不是绝对位置。
                // 刚撤到更轻辅助层级、或刚起步的目标，低于目标线是常态；
                // 若正以合理速度接近，那是「尚未达标」，不该建议推翻方案。
                if ($ratio !== null && $ratio >= 0.8) {
                    $reasons[] = sprintf(
                        '最近 4 个数据点仍全部%s目标线（%d/%d），但正以约 %.0f%% 的所需速度接近——'
                        . '属「尚未达标」，不建议此时推翻方案', $belowWord, $belowCount, $window, $ratio * 100
                    );
                    $ruleHit[] = 'A';
                    $escalate('watch');
                } else {
                    $reasons[] = sprintf('最近 4 个数据点全部%s目标线（%d/%d），且增速不足', $belowWord, $belowCount, $window);
                    $ruleHit[] = 'A';
                    $escalate('adjust');
                }
            } elseif ($window >= 4 && $belowCount === 3) {
                $reasons[] = sprintf('最近 4 个数据点中有 3 个%s目标线（%d/%d）', $belowWord, $belowCount, $window);
                $ruleHit[] = 'A';
                $escalate('watch');
            } else {
                // 目标线附近或以上且未见异常信号 → 进展符合预期。
                // 注意用 escalate 而非直接赋值：若已判 stale（严重度更高），不应被覆盖回去。
                $escalate('on_track');
            }
        } else {
            $reasons[] = '目标缺少基线或期末目标值，无法计算目标线，本次仅做趋势判断';
            $escalate('watch');
        }

        // ---- 规则 B：增速比（不再用 max(0,…) 抹掉负号）----
        // 原实现把 ratio = −10.35（退步速度是所需速度的十倍）显示成「0%，明显偏慢」，
        // 既看不出是倒退，也看不出有多严重。
        if ($ratio !== null) {
            if ($ratio < 0) {
                // 方向性结论必须过显著性检验，不能只看估计值的符号：
                // 点少 / 试次少时一次偶然波动就能把斜率拉负，据此推翻方案更伤。
                [$tVal, $significant] = pa_slope_significance($points);
                if ($significant) {
                    $reasons[] = sprintf(
                        '趋势方向与所需方向相反：变化速度为所需速度的 %.1f 倍，但方向相反（%s），'
                        . '且斜率检验显著（t=%.2f）',
                        abs($ratio), $dec > 0 ? '在下滑而非上升' : '在上升而非下降', $tVal
                    );
                    $ruleHit[] = 'B';
                    $escalate('regression');
                } else {
                    // 看起来反了但证不实：说「倒退了」是在臆造结论（ADR-002）。
                    // 降级为「需关注」并明确要求先补数据，让教师有据可依。
                    $reasons[] = sprintf(
                        '趋势方向看起来与所需相反（%s），但当前样本量下不显著（t=%.2f）——'
                        . '先按监控频率继续采集，暂不据此推翻方案',
                        $dec > 0 ? '在下滑而非上升' : '在上升而非下降', $tVal
                    );
                    $ruleHit[] = 'B_weak';
                    $escalate('watch');
                }
            } elseif ($ratio < 0.5) {
                $reasons[] = sprintf('实际变化速度约为目标所需速度的 %.0f%%，明显偏慢', $ratio * 100);
                $ruleHit[] = 'B';
                $escalate('adjust');
            } elseif ($ratio < 0.8) {
                $reasons[] = sprintf('实际变化速度约为目标所需速度的 %.0f%%，略慢', $ratio * 100);
                $ruleHit[] = 'B';
                $escalate('watch');
            }
        }

        $levelTexts = [
            'adjust'    => '建议调整干预',
            'watch'     => '需关注',
            'on_track'  => '进展符合预期',
            'stale'     => '数据已过期',
            'mastered'  => '已达标，建议复核',
            'nodata'    => '尚无数据',
            'regression'=> '出现倒退，优先复核',
        ];

        return [
            'level'       => $level,
            'level_text'  => $levelTexts[$level] ?? $level,
            'reasons'     => $reasons ?: ['暂未发现异常信号'],
            'evidence'    => $mkEvidence($window, $belowCount, $ratio, $gap, $expected),
            'suggestions' => pa_suggest_tagged($level, $points, $aim),
        ];
    }

    /**
     * 候选调整方向（DBI Step 4 的维度菜单）
     * 明确边界：这里给的是「可考虑的方向」，不是「应当执行 X」。
     */
    function pa_suggest(string $level, array $points, ?array $aim): array
    {
        if ($level === 'mastered') {
            return [
                ['type' => 'generalization', 'text' => '转入泛化与维持：换场景、换人、换材料，检验是否稳定'],
                ['type' => 'raise_goal',     'text' => '适当提高目标要求或进入下一阶段目标'],
            ];
        }
        if ($level === 'stale' || $level === 'nodata') {
            return [['type' => 'record', 'text' => '先按监控频率补齐数据，再判断教学是否有效']];
        }
        if ($level === 'on_track') {
            return [['type' => 'keep', 'text' => '当前方案有效，继续按计划实施并记录数据']];
        }
        if ($level === 'regression') {
            // 倒退在 DBI 里是最急需处理的信号，优先级高于「数据不够」。
            // 先排除非教学因素（健康、出勤、家庭变故、人员更换），再谈改方法。
            return [
                ['type' => 'check_context', 'text' => '先排除非教学因素：近期出勤、健康、睡眠、家庭变故、任课或辅助人员是否更换'],
                ['type' => 'check_fidelity', 'text' => '核查实施忠实度：计划的辅助层级、强化与试次数是否真的按要求执行了'],
                ['type' => 'check_material', 'text' => '确认任务与材料未发生变化：换教具/换场景常造成短期回落'],
                ['type' => 'prompt_backup',  'text' => '必要时临时回到上一辅助层级稳住表现，再重新尝试撤除'],
                ['type' => 'record', 'text' => '加密采集（短期内提高监控频率），用新数据确认是趋势还是波动'],
            ];
        }

        // watch / adjust：给一组诊断方向的候选，顺序不表示优先级
        $menu = [
            ['type' => 'task_analysis', 'text' => '重做任务分析：把目标拆得更细，确认卡在哪一步'],
            ['type' => 'prompt_level',  'text' => '调整辅助层级：检查是否长期停留在同一提示层级未能撤除'],
            ['type' => 'dosage',        'text' => '增加剂量：提高练习频次或每次练习的试次数'],
            ['type' => 'material',      'text' => '更换材料与呈现方式：换教具、换示范方式、加入视觉支持'],
            ['type' => 'reinforcement', 'text' => '检查强化：强化物是否仍有吸引力、是否及时且与行为对应'],
            ['type' => 'grouping',      'text' => '调整组织形态：1:1 与小组练习的比例是否需要改变'],
            ['type' => 'environment',   'text' => '调整环境：减少干扰、调整座位与时间安排'],
        ];

        $out = [];
        $out[] = [
            'type' => 'diagnose',
            'text' => '先诊断（DBI 第 3 步）：确认「教了没有」与「学到了没有」——是执行不到位，还是方法不适合。'
                    . '一次只改变少量变量，改完至少再采集 4 个数据点再下结论。',
        ];

        // 有证据支持时，把相关方向排到前面
        $last = $points[count($points) - 1] ?? null;
        if ($last && $last['prompt_level'] && in_array($last['prompt_level'], ['physical', 'model'], true)) {
            $out[] = $menu[1];
        }
        foreach ($menu as $m) {
            if (count($out) >= 5) break;
            if (!in_array($m, $out, true)) $out[] = $m;
        }

        return $out;
    }

    /** 给候选方向打上稳定 id（格式 "<level>:<type>"），供教师采纳归因。
     *
     *  为什么必须补：此前 suggestions 只有 type/text，前端把它拼成一段纯文本
     *  （Today.tsx「可考虑的方向：…」），教师看了、照做了，但系统里
     *  **没有任何事件**能说明「教师因这条数据改变了教学决策」——
     *  北极星指标（教师每周因系统数据而改变教学决策的次数）因此
     *  在系统内不可度量，也无法据此迭代规则。
     *
     *  有了 id，登记调整时回传 suggestion_ids 落库，回路才闭合：
     *  系统给证据 → 教师采纳具体方向 → 留下归因 → 到期复核效果。
     */
    function pa_suggest_tagged(string $level, array $points, ?array $aim): array
    {
        $out = pa_suggest($level, $points, $aim);
        foreach ($out as $i => $s) {
            if (empty($out[$i]['id'])) {
                $out[$i]['id'] = $level . ':' . (string)($s['type'] ?? $i);
            }
        }
        return $out;
    }

    // ========================================================================
    // 5. 单目标完整分析（端点 / 今日工作台共用的唯一出口）
    // ========================================================================

    // ========================================================================
    // 5bis. 决策留痕（iep_decision_audit）
    //
    //    为什么补：v11 建了这张表，但代码从未写入——ADR 第二条
    //    「每个自动结论都可解释」在系统里没有留痕可查。教师问
    //    「为什么系统说这个孩子要调整干预」时，我们只能重新算一遍，
    //    而算的依据（用了哪几个点、哪条规则命中的）当时并没有存下来。
    //
    //    写在哪：pa_analyze_goal 是单目标分析的唯一入口，
    //    教师打开进度面板／今日工作台看到结论时必然经过它。
    //
    //    幂等：同一目标同一天同一结论只保留一条（UPDATE 刷新时间与判据），
    //    避免每次刷新页面都堆一条重复记录。
    // ========================================================================
    function pa_audit_decision(PDO $pdo, int $goalId, array $goal, array $decision, array $series): void
    {
        try {
            $level = (string)($decision['level'] ?? '');
            if ($level === '') return;

            $ev        = is_array($decision['evidence'] ?? null) ? $decision['evidence'] : [];
            $ruleHit   = $ev['rule_hit'] ?? [];
            if (!is_array($ruleHit)) $ruleHit = [$ruleHit];
            $reasons   = $decision['reasons'] ?? [];
            if (!is_array($reasons)) $reasons = [$reasons];

            $pointsUsed = isset($ev['points']) ? (int)$ev['points'] : count($decision['points'] ?? []);
            $dataSource = (string)($series['source'] ?? ($series['meta']['data_source'] ?? ''));
            $promptLevel = (string)($series['meta']['judged_level'] ?? $ev['judged_level'] ?? '');
            $direction  = (string)($goal['direction'] ?? 'increase');
            $reason     = implode('；', array_map(function ($r) { return (string)$r; }, $reasons));

            $now = date('Y-m-d H:i:s');
            $sel = $pdo->prepare(
                'SELECT id FROM iep_decision_audit
                 WHERE goal_id = ? AND DATE(decided_at) = CURDATE() AND level = ? LIMIT 1'
            );
            $sel->execute([$goalId, $level]);
            $exist = $sel->fetchColumn();

            if ($exist) {
                $up = $pdo->prepare(
                    'UPDATE iep_decision_audit
                     SET decided_at = ?, points_used = ?, data_source = ?, prompt_level = ?,
                         direction = ?, rule_hit = ?, reason = ?
                     WHERE id = ?'
                );
                $up->execute([$now, $pointsUsed, $dataSource, $promptLevel, $direction,
                              json_encode(array_values($ruleHit), JSON_UNESCAPED_UNICODE), $reason, (int)$exist]);
            } else {
                $ins = $pdo->prepare(
                    'INSERT INTO iep_decision_audit
                     (goal_id, decided_at, level, points_used, data_source, prompt_level, direction, rule_hit, reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([$goalId, $now, $level, $pointsUsed, $dataSource, $promptLevel, $direction,
                               json_encode(array_values($ruleHit), JSON_UNESCAPED_UNICODE), $reason]);
            }
        } catch (Throwable $e) {
            // 留痕失败不应影响本次分析结论的返回——审计是旁路，不是主流程
            error_log('pa_audit_decision error: ' . $e->getMessage());
        }
    }

    function pa_analyze_goal(PDO $pdo, int $goalId): ?array
    {
        $goal = pa_fetch_goal($pdo, $goalId);
        if ($goal === null) return null;

        $plan = null;
        if (!empty($goal['iep_plan_id'])) {
            $ps = $pdo->prepare('SELECT id, start_date, end_date, student_id FROM iep_plans WHERE id = ? LIMIT 1');
            $ps->execute([(int)$goal['iep_plan_id']]);
            $plan = $ps->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        $series       = pa_fetch_series($pdo, $goalId, 'auto', $goal);
        $points       = $series['points'];
        $mastery      = pa_fetch_mastery_pct($pdo, $goalId);
        // 量纲显式化：声明了量纲就按声明折算，未声明（auto）保持历史反推口径
        pa_apply_declared_scale($goal, $series['meta']['observed_max'] ?? null, $mastery);
        $aim          = pa_aim_line($goal, $points, $plan, $series['meta']['observed_max'] ?? null, $mastery);
        $trend        = pa_trend_line($points, 4);
        // 方向（increase/decrease）决定所有比较的符号；缺省按 increase，不臆造。
        $direction    = strtolower(trim((string)($goal['direction'] ?? 'increase')));
        if ($direction !== 'decrease') $direction = 'increase';
        $decision     = pa_decide($points, $aim, $trend, $goal['monitor_frequency'] ?? null, $direction);
        $adjustments  = pa_fetch_adjustments($pdo, $goalId, $plan['id'] ?? null);

        // 决策留痕：结论被教师看到的这一刻，把判据一并存下来（旁路，失败不影响返回）
        pa_audit_decision($pdo, $goalId, $goal, $decision, $series);

        return [
            'goal_id'   => (int)$goalId,
            'title'     => $goal['title'],
            'area'      => $goal['area'],
            'points'    => $points,
            'series'       => $series['meta'] + ['source' => $series['source']],
            // 撤提示的证据：各辅助层级各自的达成率序列，与判定用的目标层级并列输出。
            // 没有它，「撤除全部辅助」与「表现变差」在数据上完全无法区分。
            'points_mixed' => $series['points_mixed'],
            'by_level'     => $series['by_level'],
            'aim'       => $aim,
            'trend'     => $trend,
            'decision'  => $decision,
            'adjustments' => array_map(function ($a) {
                return [
                    'id'              => (int)$a['id'],
                    'date'            => substr((string)$a['adjusted_at'], 0, 10),
                    'trigger_type'    => $a['trigger_type'],
                    'trigger_detail'  => $a['trigger_detail'],
                    'change_type'     => $a['change_type'],
                    'change_detail'   => $a['change_detail'],
                    'hypothesis'      => $a['hypothesis'],
                    'outcome'         => $a['outcome'],
                    'review_due_date' => $a['review_due_date'] ? substr((string)$a['review_due_date'], 0, 10) : null,
                    'decided_by_name' => $a['decided_by_name'] ?: ($a['decided_by_real_name'] ?? null),
                ];
            }, $adjustments),
        ];
    }

    // ========================================================================
    // 6. IEP 内在一致性质检
    //
    //    为什么做：IDEA 与主流 IEP 质量量规均要求各组成部分「内在一致」——
    //    目标必须源自 PLAAFP，PLAAFP 必须源自评估。当前这一步完全依赖教师人工自查。
    //    把量规固化成系统内的自动检查，是把「事后审计」变成「事前阻断」。
    //
    //    level: error = 阻断提交审核；warn = 提示但不阻断
    // ========================================================================

    function pa_consistency_check(PDO $pdo, int $planId): array
    {
        $issues = [];

        $add = function (string $code, string $level, string $scope, string $title, string $detail, array $ref = []) use (&$issues) {
            $issues[] = [
                'code'   => $code,
                'level'  => $level,
                'scope'  => $scope,
                'title'  => $title,
                'detail' => $detail,
                'ref'    => $ref,
            ];
        };

        // ---------- 计划 ----------
        $ps = $pdo->prepare(
            'SELECT p.*, s.name AS student_name, s.birth_date
               FROM iep_plans p LEFT JOIN students s ON p.student_id = s.id
              WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1'
        );
        $ps->execute([$planId]);
        $plan = $ps->fetch(PDO::FETCH_ASSOC);
        if (!$plan) {
            return ['passed' => false, 'error_count' => 1, 'warn_count' => 0, 'issues' => [[
                'code' => 'PLN00', 'level' => 'error', 'scope' => 'plan',
                'title' => '计划不存在', 'detail' => '未找到该 IEP 计划', 'ref' => [],
            ]]];
        }

        // PLN01 安置形式（已有校验，这里纳入统一报告）
        if (empty($plan['placement_type'])) {
            $add('PLN01', 'error', 'plan', '缺少教育安置形式',
                'IEP 必须说明学生的教育安置形式（随班就读/特教班/资源教室/送教上门/特教学校）。');
        }

        // PLN02 至少一个长期目标
        $gs = $pdo->prepare(
            'SELECT id, area, title, criteria, baseline, evaluation_method, monitor_frequency,
                    monitor_method, monitor_owner_id, baseline_value, target_value, target_score,
                    target_date, responsible_teacher_id
               FROM iep_goals WHERE iep_plan_id = ? AND deleted_at IS NULL ORDER BY area, sort_order'
        );
        $gs->execute([$planId]);
        $goals = $gs->fetchAll(PDO::FETCH_ASSOC);

        if (count($goals) === 0) {
            $add('PLN02', 'error', 'plan', '没有任何长期目标',
                'IEP 至少要有一个可测量的年度目标，否则不构成一份有效的个别化教育计划。');
        }

        // PLN03 PLAAFP
        $strengthsSafe  = trim((string)($plan['strengths'] ?? ''));
        $needsSafe      = trim((string)($plan['needs'] ?? ''));
        if ($strengthsSafe === '' && $needsSafe === '') {
            $add('PLN03', 'error', 'plan', '缺少现状水平描述（PLAAFP）',
                '未填写学生的优势与需求。PLAAFP 是全部目标的上游依据，缺失则无法校验目标的内在一致性。');
        }

        // PLN04 会议日期（IEP 会议是法定程序）
        if (empty($plan['meeting_date'])) {
            $add('PLN04', 'error', 'plan', '未记录 IEP 会议日期',
                'IEP 须由团队会议制定并留痕，缺少会议日期将无法证明程序合规。');
        }

        // PLN05 会议参与人台账
        $mp = $pdo->prepare('SELECT COUNT(*) FROM iep_meeting_participants WHERE iep_plan_id = ?');
        $mp->execute([$planId]);
        if ((int)$mp->fetchColumn() === 0) {
            $add('PLN05', 'warn', 'plan', '未登记会议参与人',
                '建议补登参与人（含家长、特教教师、普教教师、相关服务人员），这是家长参与的证据之一。');
        }

        // PLN06 向家长报告频率
        if (empty($plan['progress_report_frequency'])) {
            $add('PLN06', 'warn', 'plan', '未设定向家长报告进度的频率',
                'IDEA 要求明确「多久向家长报告一次进度」，通常不低于每季度一次。');
        }

        // PLN07 转衔（年龄 ≥ 16 岁）
        //
        // Step 4 之后转衔已经是结构化实体（iep_transition_goals，升学/就业/独立生活，
        // 且要求可测量——这正是 IDEA 对中学后目标的硬性要求）。因此判据必须先看结构化目标：
        // 只填一段自由文本，等于把「可测量的中学后目标」退化成一句无法判定的话。
        if (!empty($plan['birth_date'])) {
            $age = (int)floor(pa_days_between(substr((string)$plan['birth_date'], 0, 10), pa_today()) / 365.25);
            if ($age >= 16) {
                $tgStmt = $pdo->prepare(
                    'SELECT COUNT(*) FROM iep_transition_goals
                      WHERE iep_plan_id = ? AND deleted_at IS NULL'
                );
                $tgStmt->execute([(int)$plan['id']]);
                $tgCount = (int)$tgStmt->fetchColumn();
                $hasText = trim((string)($plan['transition_plan'] ?? '')) !== '';

                if ($tgCount === 0 && !$hasText) {
                    $add('PLN07', 'error', 'plan', '已达转衔年龄但未填写转衔计划',
                        sprintf('学生现年 %d 岁，按规定应包含转衔服务与中学后目标，请补充「转衔计划」。', $age));
                } elseif ($tgCount === 0 && $hasText) {
                    $add('PLN07', 'warn', 'plan', '转衔计划仅有自由文本，未形成可测量的转衔目标',
                        'IDEA 要求中学后目标必须可测量。请把这段文本落成结构化的转衔目标'
                        . '（升学/就业/独立生活，写明达成标准与期限），否则无法判断转衔准备度。');
                }
            }
        }

        // PLN08 LRE 量化
        if ($plan['regular_class_hours'] === null && $plan['resource_room_hours'] === null) {
            $add('PLN08', 'warn', 'plan', '未量化普通班/资源教室时间',
                '建议填写每日普通班与资源教室时数，这是说明「最小限制环境」程度的关键量化依据。');
        }

        // PLN09 复审日期
        if (empty($plan['next_review_date'])) {
            $add('PLN09', 'warn', 'plan', '未设定复审日期',
                '缺少下次复审日期，系统将无法在到期前提醒。');
        }

        // PLN11 未关联来源评估
        if (empty($plan['source_assessment_id'])) {
            $add('PLN11', 'warn', 'plan', '未关联来源评估',
                '建议关联本计划所依据的评估记录，形成「评估 → PLAAFP → 目标」的可追溯链条。');
        }

        // PLN10 需求领域是否有目标覆盖
        if ($needsSafe !== '' && count($goals) > 0) {
            $map = [
                '认知'     => ['认知', '注意', '记忆', '配对', '分类', '数概念', '因果', '模仿', '感知'],
                '沟通'     => ['沟通', '语言', '表达', '理解', '言语', '发音', '口语', '交流', '构音', '口肌'],
                '社交'     => ['社交', '同伴', '互动', '轮流', '分享', '眼神', '共同注意'],
                '生活自理' => ['生活自理', '自理', '穿衣', '进食', '如厕', '洗漱', '穿脱', '进餐', '整理'],
                '运动'     => ['运动', '粗大', '精细', '平衡', '协调', '行走', '抓握', '感统', '感觉统合'],
                '情绪行为' => ['情绪', '行为', '问题行为', '自我管理', '冲动', '攻击', '刻板'],
                '学业'     => ['学业', '语文', '数学', '识字', '书写', '阅读', '计算'],
            ];
            $goalAreas = [];
            foreach ($goals as $g) { $goalAreas[$g['area']] = true; }

            $uncovered = [];
            foreach ($map as $area => $kws) {
                foreach ($kws as $kw) {
                    if (mb_strpos($needsSafe, $kw, 0, 'UTF-8') !== false) {
                        if (!isset($goalAreas[$area])) { $uncovered[$area] = true; }
                        break;
                    }
                }
            }
            if (!empty($uncovered)) {
                $add('PLN10', 'warn', 'plan', '部分需求领域没有对应目标',
                    '现状描述中提到了 ' . implode('、', array_keys($uncovered))
                    . '，但没有对应领域的长期目标。请确认是无意遗漏，还是有意为之。');
            }
        }

        // ---------- 目标 ----------
        $grouped = [];
        $push = function (string $code, string $level, string $title, array $titles, string $howToFix) use (&$grouped) {
            $grouped[$code] = [
                'code' => $code, 'level' => $level, 'title' => $title,
                'count' => count($titles), 'samples' => array_slice($titles, 0, 3), 'fix' => $howToFix,
            ];
        };

        $missBase = []; $missCriteria = []; $missFreq = []; $missMethod = [];
        $missTarget = []; $missOwner = []; $missDue = []; $dueOverflow = []; $noObjective = []; $noData = [];

        foreach ($goals as $g) {
            $t = $g['title'];
            if (trim((string)$g['baseline']) === '' && pa_num($g['baseline_value']) === null) $missBase[] = $t;
            if (trim((string)($g['criteria'] ?? '')) === '') $missCriteria[] = $t;
            if (empty($g['monitor_frequency'])) $missFreq[] = $t;
            if (trim((string)($g['monitor_method'] ?? '')) === '' && trim((string)($g['evaluation_method'] ?? '')) === '') $missMethod[] = $t;
            if (pa_num($g['target_value']) === null && pa_num($g['target_score']) === null) $missTarget[] = $t;
            if (empty($g['monitor_owner_id']) && empty($g['responsible_teacher_id'])) $missOwner[] = $t;
            if (empty($g['target_date'])) {
                $missDue[] = $t;
            } elseif (!empty($plan['end_date'])
                      && pa_days_between(substr((string)$g['target_date'], 0, 10), substr((string)$plan['end_date'], 0, 10)) < 0) {
                $dueOverflow[] = $t;
            }
        }

        if (!empty($missBase)) {
            $push('GOA01', 'error', '缺少基线数据', $missBase,
                '没有基线就无法判断「有没有进步」。请在目标里填写起始水平（文字描述或数值均可，建议同时给数值以便绘制目标线）。');
        }
        if (!empty($missCriteria)) {
            $push('GOA02', 'error', '缺少达成标准', $missCriteria,
                '目标必须写明「达到什么程度算达成」，否则无法客观判定，也不符合可测量要求。');
        }
        if (!empty($missTarget)) {
            $push('GOA05', 'error', '缺少期末目标值', $missTarget,
                '请填写期末目标值（0-100 归一），否则系统无法为每个学生绘制属于他自己的目标线。');
        }
        if (!empty($missFreq)) {
            $push('GOA03', 'error', '未设定监控频率', $missFreq,
                '进度监控频率是法定要件之一，也是后续「该何时采集数据」提醒的依据。');
        }
        if (!empty($missMethod)) {
            $push('GOA04', 'warn', '未说明测量方法', $missMethod,
                '测量方法应与确定基线时的方法一致，否则前后数据不可比。');
        }
        if (!empty($missOwner)) {
            $push('GOA06', 'warn', '未指定采集责任人', $missOwner,
                '明确谁负责采集、谁负责汇总，是进度监控清单里的必备项。');
        }
        if (!empty($missDue)) {
            $push('GOA07', 'warn', '缺少达成截止日', $missDue,
                '没有截止日就无法定义「应有的进步速度」，也无法画目标线。');
        }
        if (!empty($dueOverflow)) {
            $push('GOA08', 'warn', '目标截止日晚于计划结束日', $dueOverflow,
                '目标应在计划周期内达成，请核对日期。');
        }

        // GOA09 / GOA10 需要额外查询
        if (count($goals) > 0) {
            $ids = array_map('intval', array_column($goals, 'id'));
            $ph  = implode(',', array_fill(0, count($ids), '?'));

            $os = $pdo->prepare(
                "SELECT goal_id, COUNT(*) c FROM iep_objectives WHERE goal_id IN ($ph) AND deleted_at IS NULL GROUP BY goal_id"
            );
            $os->execute($ids);
            $objCount = [];
            foreach ($os->fetchAll(PDO::FETCH_ASSOC) as $r) { $objCount[(int)$r['goal_id']] = (int)$r['c']; }

            $pg = $pdo->prepare(
                "SELECT goal_id, COUNT(*) c FROM iep_goal_progress WHERE goal_id IN ($ph) GROUP BY goal_id"
            );
            $pg->execute($ids);
            $progCount = [];
            foreach ($pg->fetchAll(PDO::FETCH_ASSOC) as $r) { $progCount[(int)$r['goal_id']] = (int)$r['c']; }

            foreach ($goals as $g) {
                $gid = (int)$g['id'];
                if (($objCount[$gid] ?? 0) === 0) $noObjective[] = $g['title'];
                if (($progCount[$gid] ?? 0) === 0) $noData[] = $g['title'];
            }
        }

        if (!empty($noObjective)) {
            $push('GOA09', 'warn', '长期目标没有短期目标支撑', $noObjective,
                '长期目标建议拆解为短期目标，便于分步教学与过程性判定。');
        }
        if (!empty($noData)) {
            $push('GOA10', 'warn', '从未采集过进度数据', $noData,
                '进入执行后请按监控频率采集数据，否则无法判断是否有效、也无法在到期时出具有依据的进度报告。');
        }

        // GOA11 目标是否具有挑战性（Endrew 实质性标准）
        // 若「降低问题行为发生频率」类目标，期末值低于基线是正常的；
        // 但技能习得类目标若目标值不高于基线，等于宣布「维持现状即可」。
        $notAmbitious = [];
        foreach ($goals as $g) {
            $bv = pa_num($g['baseline_value'] ?? null);
            $tv = pa_num($g['target_value'] ?? null);
            if ($tv === null) $tv = pa_num($g['target_score'] ?? null);
            if ($bv !== null && $tv !== null && $tv <= $bv) $notAmbitious[] = $g['title'];
        }
        if (!empty($notAmbitious)) {
            $push('GOA11', 'warn', '期末目标不高于基线', $notAmbitious,
                'Endrew 判决要求 IEP 目标须「合理计算以取得适当进步」。若这是「降低问题行为频率」类目标属正常；'
                . '若是技能习得类目标，说明目标设定偏松，建议上调目标或缩短达成周期。');
        }

        foreach ($grouped as $g) {
            $add($g['code'], $g['level'], 'goal', $g['title'], $g['fix'],
                 ['count' => $g['count'], 'samples' => $g['samples']]);
        }

        $errors = array_values(array_filter($issues, fn($i) => $i['level'] === 'error'));
        $warns  = array_values(array_filter($issues, fn($i) => $i['level'] === 'warn'));

        return [
            'passed'      => count($errors) === 0,
            'error_count' => count($errors),
            'warn_count'  => count($warns),
            'issues'      => array_merge($errors, $warns),
        ];
    }

    // ========================================================================
    // 7. 今日工作台（Step 2：教师的一天）
    //
    //    立场声明：工作台不发明任何新口径。它只做两件事——
    //      (1) 把 Step 1 已算好的决策结论，按「教师今天要做什么」重新排序；
    //      (2) 把「该采集了」从教师的记忆，变成系统的排程（消费 monitor_frequency）。
    //    因此这里没有新的阈值、没有新的等级定义，判断全部复用 pa_decide / pa_analyze_goal。
    //    若将来发现工作台与进度图说法不一致，那说明有人在这里加了第二个口径 —— 是 bug，不是特性。
    // ========================================================================

    /**
     * IEP 计划级数据范围过滤 —— 全库唯一实现
     *
     * 为什么必须抽出来：这是安全边界，绝不能有两份。
     * 一旦工作台与列表各写一份，就会出现「列表看不到、工作台却能操作」的越权口子。
     *
     * @param array $scope getDataScope() 的返回值
     * @return array{0:string,1:array} [以 AND 开头的 SQL 片段, 绑定参数]；
     *                                 调用方需保证 SQL 中存在别名 p(iep_plans) 与 s(students)
     */
    /**
     * IEP 计划查询的统一范围过滤（ADR-009：全库仅此一份计划范围实现）
     *
     * 2026-10-15 整改：决策逻辑收敛到 config.php 的 dataScopeRule()——
     * 此前 assessments / parents 各有手写副本并已发生真实漂移（export 的
     * teacher 分支带 assessor_id、list 不带）。本函数保留为「计划」形态的
     * 入口：teacher 分支的「本人经手」对计划即 p.primary_teacher_id。
     * 输出 SQL 与参数顺序与整改前逐字节一致（单测 pa_scope_units 矩阵比对）。
     */
    function pa_plan_scope_clause(array $scope): array
    {
        return applyStudentKeyedScope($scope, 'p', ['owner_col' => 'p.primary_teacher_id']);
    }

    /** 需要每天被照看的计划状态（已批准、已签署、执行中） */
    function pa_active_plan_statuses(): array
    {
        return ['approved', 'signed', 'active'];
    }

    /** 不再需要采集数据的长期目标状态 */
    function pa_goal_closed_statuses(): array
    {
        return ['achieved', 'exceeded', 'discontinued'];
    }

    /** 日期加天数，返回 Y-m-d；失败返回原日期 */
    function pa_date_add(string $date, int $days): string
    {
        try {
            $d = new DateTimeImmutable(substr($date, 0, 10));
            return $d->modify(($days >= 0 ? '+' : '') . $days . ' day')->format('Y-m-d');
        } catch (Exception $e) {
            return substr($date, 0, 10);
        }
    }

    /**
     * 组装「教师的一天」三块内容
     *
     * @param PDO    $pdo
     * @param array  $scope   getDataScope() 返回值
     * @param string $today   Y-m-d（可由测试注入）
     * @param array|null $user 当前用户（用于「我的草稿」过滤）
     * @param bool $canRecord 当前用户能否真正执行「记录试次」这一动作
     *
     * 为什么 readonly 要看「能否执行」而不是「能看到多少」：
     * 督导/教研员的数据范围是 all（能看到全校），但他们没有 record_create 权限。
     * 若只按数据范围判断，他们打开首页会看到 74 条「去记录」的待办却一个都点不动 ——
     * 那是把别人的待办清单当成自己的首页，比没有更糟。
     * 现在改为：看得到（信息对督导有价值），但标记为不可执行，前端不给出操作入口。
     *
     * @return array{
     *   today:string, generated_at:string, scope_type:string, readonly:bool,
     *   due:array, attention:array, upcoming:array, counts:array, note:string
     * }
     */
    function pa_workbench(PDO $pdo, array $scope, string $today, ?array $user = null, bool $canRecord = true): array
    {
        $base = [
            'today'        => $today,
            'generated_at' => date('Y-m-d H:i:s'),
            'scope_type'   => $scope['type'] ?? 'viewer',
            'readonly'     => !$canRecord,
            'due'          => [],
            'attention'    => [],
            'upcoming'     => [],
            'counts'       => ['due' => 0, 'attention' => 0, 'upcoming' => 0, 'overdue' => 0],
            'note'         => '',
        ];

        // 家长 / 无数据范围的账号：教学待办对其没有意义，直接返回空
        $type = $scope['type'] ?? 'viewer';
        if (in_array($type, ['parent', 'viewer', 'none'], true)) {
            $base['readonly'] = true;
            $base['note']     = '当前账号为家长视角或无数据范围，不提供教学待办。';
            return $base;
        }

        if (!$canRecord) {
            // 督导 / 教研员：信息照给（逾期采集情况本身就是管理信号），但不给操作入口
            $base['note'] = '当前账号无「记录试次」权限，以下仅作查看，不能代教师录入。';
        }

        [$scopeClause, $scopeParams] = pa_plan_scope_clause($scope);
        $userId = isset($user['sub']) ? intval($user['sub']) : 0;

        // ------------------------------------------------------------------
        // 1. 执行中的计划
        // ------------------------------------------------------------------
        $actSt   = pa_active_plan_statuses();
        $actPh   = implode(',', array_fill(0, count($actSt), '?'));
        $planSql = "SELECT p.id, p.student_id, s.name AS student_name, s.class_id,
                           sc.name AS class_name, p.title, p.status, p.created_by,
                           p.start_date, p.end_date, p.next_review_date, p.meeting_date,
                           p.primary_teacher_id
                      FROM iep_plans p
                      JOIN students s ON s.id = p.student_id AND s.deleted_at IS NULL
                      LEFT JOIN student_classes sc ON sc.id = s.class_id
                     WHERE p.deleted_at IS NULL AND p.status IN ($actPh)" . $scopeClause . "
                     ORDER BY sc.name, s.name";
        $planStmt = $pdo->prepare($planSql);
        $planStmt->execute(array_merge($actSt, $scopeParams));
        $plans = $planStmt->fetchAll(PDO::FETCH_ASSOC);

        $planIds = [];
        $planMap = [];
        foreach ($plans as $p) {
            $pid          = (int)$p['id'];
            $planIds[]    = $pid;
            $planMap[$pid] = $p;
        }

        $due       = [];
        $attention = [];
        $goalSeen  = [];
        // 有短期目标 / 无短期目标的长期目标分别计数：
        // 「长期目标下面没有短期目标」是 IEP 自身的缺陷（无法采集离散试次、无法判断进展），
        // 系统必须如实暴露，而不是让它悄悄从待采清单里消失。
        $goalHasObj = [];
        $goalAll    = [];

        if (!empty($planIds)) {
            // ----------------------------------------------------------------
            // 2. 长期目标 × 短期目标 × 末次采集日期
            // ----------------------------------------------------------------
            $inPh  = implode(',', array_fill(0, count($planIds), '?'));
            $goalSql = "SELECT g.id AS goal_id, g.iep_plan_id, g.title AS goal_title, g.area,
                               g.status AS goal_status, g.monitor_frequency, g.monitor_method,
                               g.monitor_owner_id, g.start_date AS goal_start, g.target_date,
                               o.id AS objective_id, o.title AS objective_title,
                               o.status AS obj_status, o.mastery_pct, o.measurement_method,
                               (SELECT MAX(r.record_date) FROM iep_objective_records r
                                 WHERE r.objective_id = o.id AND r.deleted_at IS NULL) AS last_date,
                               (SELECT COUNT(*) FROM iep_objective_records r
                                 WHERE r.objective_id = o.id AND r.deleted_at IS NULL) AS rec_count
                          FROM iep_goals g
                          LEFT JOIN iep_objectives o
                                 ON o.goal_id = g.id AND o.deleted_at IS NULL
                         WHERE g.iep_plan_id IN ($inPh) AND g.deleted_at IS NULL
                         ORDER BY g.iep_plan_id, g.sort_order, g.id, o.sort_order, o.id";
            $goalStmt = $pdo->prepare($goalSql);
            $goalStmt->execute($planIds);
            $rows = $goalStmt->fetchAll(PDO::FETCH_ASSOC);

            $closed = pa_goal_closed_statuses();

            foreach ($rows as $r) {
                $gid = (int)$r['goal_id'];
                $pid = (int)$r['iep_plan_id'];
                if (!isset($planMap[$pid])) { continue; }
                $plan = $planMap[$pid];

                if (!in_array((string)$r['goal_status'], $closed, true)) {
                    $goalAll[$gid] = true;
                }
                if ($r['objective_id'] !== null) { $goalHasObj[$gid] = true; }

                // ---- 今日待采：只排「还需要练」的短期目标 ----
                $objStatus = (string)($r['obj_status'] ?? '');
                $needTrial = $r['objective_id'] !== null
                             && !in_array($objStatus, ['mastered', 'discontinued'], true)
                             && !in_array((string)$r['goal_status'], $closed, true);

                if ($needTrial) {
                    $freq  = (string)($r['monitor_frequency'] ?? '');
                    $every = pa_frequency_days($freq);
                    if ($every === null) { $every = 7.0; }   // 未设定频率时按周排，并在返回里标注
                    $everyI = (int)round($every);

                    $lastDate = $r['last_date'] ? substr((string)$r['last_date'], 0, 10) : null;
                    // 从未采集：以计划起始日（无则目标起始日）为起算点，第一天就算「该采了」
                    $anchor   = $lastDate ?: ($plan['start_date'] ? substr((string)$plan['start_date'], 0, 10)
                                : ($r['goal_start'] ? substr((string)$r['goal_start'], 0, 10) : $today));
                    $dueDate  = pa_date_add($anchor, $everyI);
                    $over     = pa_days_between($dueDate, $today);   // >0 逾期 N 天；0 今天；<0 尚未到期

                    if ($over >= -2) {
                        $due[] = [
                            'student_id'   => (int)$plan['student_id'],
                            'student_name' => $plan['student_name'],
                            'class_name'   => $plan['class_name'],
                            'plan_id'      => $pid,
                            'goal_id'      => $gid,
                            'goal_title'   => $r['goal_title'],
                            'area'         => $r['area'],
                            'objective_id' => (int)$r['objective_id'],
                            'objective_title' => $r['objective_title'],
                            'mastery_pct'  => pa_num($r['mastery_pct']),
                            // 如实标注该目标目前靠什么方式在记数据。
                            // 此前恒为 'trial'，但前端类型已声明 'trial'|'rating'——
                            // 一个从未有过试次记录的目标仍被标成 trial，
                            // 会让教师误以为它已在按试次采集，掩盖「其实没数据」。
                            'record_mode'  => ((int)($r['rec_count'] ?? 0) > 0) ? 'trial' : 'rating',
                            'frequency'    => $freq !== '' ? $freq : null,
                            'frequency_defaulted' => ($freq === '' || pa_frequency_days($freq) === null),
                            'expected_days' => $everyI,
                            'last_date'    => $lastDate,
                            'record_count' => (int)$r['rec_count'],
                            'due_date'     => $dueDate,
                            'days_overdue' => $over,
                            'state'        => $over > 0 ? 'overdue' : ($over === 0 ? 'due' : 'soon'),
                        ];
                    }
                }

                // ---- 需要关注：每个长期目标只算一次 ----
                if (!isset($goalSeen[$gid]) && !in_array((string)$r['goal_status'], ['discontinued'], true)) {
                    $goalSeen[$gid] = true;
                    $a = pa_analyze_goal($pdo, $gid);
                    // 2026-10-14 审计修复：原过滤只收 adjust/watch/mastered，
                    // 把 regression（倒退）排除在教师主视角之外。倒退在
                    // pa_level_weight() 里严重度为 6（全表最高），却恰恰是
                    // 「最该改变教学决策」的信号——它被吞掉直接压低北极星指标
                    // （教师每周因系统数据而改变教学决策的次数）。
                    if ($a !== null && in_array($a['decision']['level'], ['adjust', 'watch', 'mastered', 'regression'], true)) {
                        $attention[] = [
                            'student_id'   => (int)$plan['student_id'],
                            'student_name' => $plan['student_name'],
                            'class_name'   => $plan['class_name'],
                            'plan_id'      => $pid,
                            'goal_id'      => $gid,
                            'goal_title'   => $a['title'],
                            'area'         => $a['area'],
                            'level'        => $a['decision']['level'],
                            'level_text'   => $a['decision']['level_text'],
                            'reasons'      => array_slice($a['decision']['reasons'], 0, 3),
                            'evidence'     => $a['decision']['evidence'],
                            'suggestions'  => array_slice($a['decision']['suggestions'], 0, 3),
                            'points'       => count($a['points']),
                            'last_date'    => $a['points'] ? $a['points'][count($a['points']) - 1]['date'] : null,
                        ];
                    }
                }
            }
        }

        // 排序：逾期越久越靠前；同逾期量按学生名稳定
        usort($due, function ($x, $y) {
            if ($x['days_overdue'] !== $y['days_overdue']) { return $y['days_overdue'] <=> $x['days_overdue']; }
            return strcmp((string)$x['student_name'], (string)$y['student_name']);
        });

        // 排序权重与 pa_level_weight() 对齐：倒退(6) 最紧急、排最前。
        // 原数组缺 regression，使其落到默认权重 9（排到最后）——最严重的信号
        // 反而最晚被看到（ADR-048 同族：值算对了但排序把它藏起来）。
        $levelWeight = ['regression' => 0, 'adjust' => 1, 'watch' => 2, 'mastered' => 3];
        usort($attention, function ($x, $y) use ($levelWeight) {
            $wx = $levelWeight[$x['level']] ?? 9;
            $wy = $levelWeight[$y['level']] ?? 9;
            if ($wx !== $wy) { return $wx <=> $wy; }
            return strcmp((string)$x['student_name'], (string)$y['student_name']);
        });

        // ------------------------------------------------------------------
        // 3. 临期事项：复审 / 审批 / 家长签署 / 干预调整待复核
        // ------------------------------------------------------------------
        $upcoming = [];

        foreach ($plans as $p) {
            $nrd = $p['next_review_date'] ? substr((string)$p['next_review_date'], 0, 10) : null;
            $eod = $p['end_date'] ? substr((string)$p['end_date'], 0, 10) : null;
            $ref = $nrd ?: $eod;
            if ($ref !== null) {
                $left = pa_days_between($today, $ref);   // >0 还有 N 天；<0 已过期
                if ($left <= 30) {
                    $upcoming[] = [
                        'kind'         => 'review_due',
                        'plan_id'      => (int)$p['id'],
                        'student_id'   => (int)$p['student_id'],
                        'student_name' => $p['student_name'],
                        'class_name'   => $p['class_name'],
                        'title'        => $p['title'],
                        'date'         => $ref,
                        'days_left'    => $left,
                        'severity'     => $left < 0 ? 'overdue' : ($left <= 14 ? 'soon' : 'info'),
                        'text'         => $left < 0
                            ? sprintf('复审日期已过 %d 天（原定 %s）', abs($left), $ref)
                            : sprintf('距复审还有 %d 天（%s）', $left, $ref),
                    ];
                }
            }
        }

        // 审批流与家长签署（未生效的计划）
        $flowSt = ['draft', 'reviewing', 'rejected', 'approved'];
        $flowPh = implode(',', array_fill(0, count($flowSt), '?'));
        $flowSql = "SELECT p.id, p.student_id, s.name AS student_name, sc.name AS class_name,
                           p.title, p.status, p.created_by, p.updated_at,
                           EXISTS(SELECT 1 FROM parent_signatures ps
                                   WHERE ps.iep_plan_id = p.id AND ps.is_revoked = 0) AS has_signature
                      FROM iep_plans p
                      JOIN students s ON s.id = p.student_id AND s.deleted_at IS NULL
                      LEFT JOIN student_classes sc ON sc.id = s.class_id
                     WHERE p.deleted_at IS NULL AND p.status IN ($flowPh)" . $scopeClause;
        $flowStmt = $pdo->prepare($flowSql);
        $flowStmt->execute(array_merge($flowSt, $scopeParams));

        foreach ($flowStmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $item = [
                'plan_id'      => (int)$p['id'],
                'student_id'   => (int)$p['student_id'],
                'student_name' => $p['student_name'],
                'class_name'   => $p['class_name'],
                'title'        => $p['title'],
                'date'         => null,
                'days_left'    => null,
                'severity'     => 'info',
            ];
            if ($p['status'] === 'reviewing') {
                $item['kind']     = 'approval';
                $item['severity'] = 'soon';
                $item['text']     = '已提交，等待审批';
            } elseif ($p['status'] === 'rejected') {
                $item['kind']     = 'approval';
                $item['severity'] = 'overdue';
                $item['text']     = '审批被打回，需修改后重新提交';
            } elseif ($p['status'] === 'approved' && !$p['has_signature']) {
                $item['kind']     = 'parent_sign';
                $item['severity'] = 'soon';
                $item['text']     = '已批准，等待家长签署';
            } elseif ($p['status'] === 'draft' && $userId > 0 && (int)$p['created_by'] === $userId) {
                $item['kind'] = 'draft';
                $item['text'] = '我创建的草稿，尚未提交审核';
            } else {
                continue;
            }
            $upcoming[] = $item;
        }

        // 干预调整待复核 —— DBI 第 5 步「再监控」的到期提醒
        // 没有这一步，「改了教法」与「改了有没有用」之间就断了，调整会变成一次性动作。
        $adjSql = "SELECT a.id, a.iep_plan_id, a.goal_id, a.adjusted_at, a.change_type,
                          a.change_detail, a.review_due_date,
                          g.title AS goal_title,
                          p.student_id, s.name AS student_name, sc.name AS class_name
                     FROM iep_intervention_adjustments a
                     JOIN iep_goals g  ON g.id = a.goal_id
                     JOIN iep_plans p  ON p.id = a.iep_plan_id
                     JOIN students s   ON s.id = p.student_id AND s.deleted_at IS NULL
                     LEFT JOIN student_classes sc ON sc.id = s.class_id
                    WHERE a.deleted_at IS NULL
                      AND (a.outcome IS NULL OR a.outcome = '')
                      AND a.review_due_date IS NOT NULL
                      AND a.review_due_date <= ?" . $scopeClause;
        $adjStmt = $pdo->prepare($adjSql);
        $adjStmt->execute(array_merge([$today], $scopeParams));
        foreach ($adjStmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
            $left = pa_days_between($today, substr((string)$a['review_due_date'], 0, 10));
            $upcoming[] = [
                'kind'          => 'adjustment_review',
                'plan_id'       => (int)$a['iep_plan_id'],
                'goal_id'       => (int)$a['goal_id'],
                'adjustment_id' => (int)$a['id'],
                'student_id'    => (int)$a['student_id'],
                'student_name'  => $a['student_name'],
                'class_name'    => $a['class_name'],
                'title'         => $a['goal_title'],
                'date'          => substr((string)$a['review_due_date'], 0, 10),
                'days_left'     => $left,
                'severity'      => $left < 0 ? 'overdue' : 'soon',
                'text'          => $left < 0
                    ? sprintf('干预调整的效果复核已逾期 %d 天，需补记效果', abs($left))
                    : '干预调整到了复核效果的时间',
            ];
        }

        $sevOrder = ['overdue' => 0, 'soon' => 1, 'info' => 2];
        usort($upcoming, function ($x, $y) use ($sevOrder) {
            $sx = $sevOrder[$x['severity']] ?? 3;
            $sy = $sevOrder[$y['severity']] ?? 3;
            if ($sx !== $sy) { return $sx <=> $sy; }
            $dx = $x['days_left'] ?? 0;
            $dy = $y['days_left'] ?? 0;
            return $dx <=> $dy;
        });

        $base['due']       = $due;
        $base['attention'] = $attention;
        $base['upcoming']  = $upcoming;
        $base['counts']    = [
            'due'       => count($due),
            'overdue'   => count(array_filter($due, fn($d) => $d['days_overdue'] > 0)),
            'attention' => count($attention),
            'upcoming'  => count($upcoming),
            // 未闭合的长期目标中，完全没有短期目标的条数（IEP 自身缺陷，需补建）
            'no_objective_goals' => count(array_diff_key($goalAll, $goalHasObj)),
        ];

        return $base;
    }
}
