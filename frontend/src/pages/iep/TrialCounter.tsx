import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  PROMPT_LEVELS,
  saveTrials,
  type DueItem,
  type PromptLevel,
  type TrialGroup,
  type TrialSaveResult,
} from '@/services/workbench';

/**
 * 试次计数器
 *
 * 为什么做成「大按钮 + 记住提示层级」而不是再画一个表单：
 * 一线教师在个训课上手里拿着教具，一只手要扶孩子的手，另一只手要点屏幕。
 * 原路径是「进 IEP → 找计划 → 切进度追踪 → 打开表单 → 填四项 → 提交」共 5 步；
 * 现在从工作台点开直接是「选提示层级 → 点成功/失败 → 保存」2 步。
 *
 * 关键设计：一次会话里不同提示层级下的成功不是一个含义，
 * 所以按层级分组落库，而不是合成一个达成率 —— 否则「该不该撤提示」就永远判断不了。
 */

interface TrialCounterProps {
  item: DueItem;
  onClose: () => void;
  onSaved: () => void;
}

type Tap = { level: PromptLevel; ok: boolean };

/**
 * 触觉反馈：成功一下短振，失败两下。
 * 个训课上教师的眼睛在孩子身上，不在屏幕上——
 * 手上的反馈能让他不看屏幕也知道自己点中的是"成功"还是"失败"。
 * 不支持振动的设备（多数 PC / iPad）静默跳过。
 */
function buzz(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 12 : [18, 45, 18]);
  } catch {
    /* 振动不可用时不影响记录 */
  }
}

export default function TrialCounter({ item, onClose, onSaved }: TrialCounterProps) {
  const [level, setLevel] = useState<PromptLevel>('independent');
  const [taps, setTaps] = useState<Tap[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TrialSaveResult | null>(null);
  const [notes, setNotes] = useState('');

  const tap = useCallback(
    (ok: boolean) => {
      setTaps((p) => [...p, { level, ok }]);
      buzz(ok);
    },
    [level],
  );

  // 键盘快捷键：个训课上单手也能记。S=成功，F=失败，Backspace=撤销
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 's') { tap(true); }
      else if (k === 'f') { tap(false); }
      else if (e.key === 'Backspace') { setTaps((p) => p.slice(0, -1)); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap, onClose]);

  const total = taps.length;
  const success = taps.filter((t) => t.ok).length;
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;

  const groups = useMemo<TrialGroup[]>(() => {
    const map = new Map<PromptLevel, { trial: number; ok: number }>();
    for (const t of taps) {
      const cur = map.get(t.level) ?? { trial: 0, ok: 0 };
      map.set(t.level, { trial: cur.trial + 1, ok: cur.ok + (t.ok ? 1 : 0) });
    }
    // 按辅助层级由多到少排序：教师最关心「还在哪一级卡着」
    const order: PromptLevel[] = ['physical', 'model', 'verbal', 'gesture', 'independent'];
    return order
      .filter((l) => map.has(l))
      .map((l) => ({
        prompt_level: l,
        trial_count: map.get(l)!.trial,
        success_count: map.get(l)!.ok,
      }));
  }, [taps]);

  const handleSave = useCallback(async () => {
    if (total === 0) {
      toast.error('还没有记录任何试次');
      return;
    }
    setSaving(true);
    try {
      const r = await saveTrials({
        objective_id: item.objective_id,
        groups,
        notes: notes || undefined,
      });
      setResult(r);
      toast.success(`已记录 ${r.trial_count} 个试次，达成率 ${r.achievement_pct}%`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [groups, item.objective_id, notes, onSaved, total]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-overlay/40 p-0 sm:p-4">
      {/* 移动端是底部抽屉：底部留出 iPhone home indicator 的安全区，
          否则「保存本次试次」会被系统手势条压住 */}
      <div className="w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl shadow-float pb-safe">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <p className="text-[11px] text-ink-3">
              {item.class_name ? `${item.class_name} · ` : ''}{item.student_name}
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-ink truncate">
              {item.objective_title}
            </h3>
            <p className="mt-0.5 text-xs text-ink-2 truncate">
              长期目标：{item.goal_title}
              {item.mastery_pct !== null ? `　掌握标准 ${item.mastery_pct}%` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md text-ink-3 hover:bg-surface-2 cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <SaveResultView result={result} onClose={onClose} onAgain={() => { setResult(null); setTaps([]); }} />
        ) : (
          <div className="px-5 py-4">
            {/* 辅助层级选择 */}
            <p className="text-xs font-medium text-ink-2 mb-2">
              本次试次的辅助层级（记完可随时切换）
            </p>
            {/* 层级按钮加大到 44px：戴老花镜、手上沾着教具时也要能点准 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {PROMPT_LEVELS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setLevel(p.value)}
                  title={p.hint}
                  aria-pressed={level === p.value}
                  className={cn(
                    // 触控尺寸的断点跟着桌面断点 lg 走：iPad 竖屏(768)仍是手指操作
                    'h-11 lg:h-9 px-4 rounded-full text-xs border press cursor-pointer',
                    level === p.value
                      ? 'bg-surface-inverse text-ink-on-dark border-ink'
                      : 'bg-surface text-ink-2 border-line-2 hover:bg-canvas',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 两个大按钮 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => tap(true)}
                className="h-32 lg:h-28 rounded-xl bg-success-soft border-2 border-success-soft hover:bg-success-soft shadow-card press flex flex-col items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-8 h-8 text-success-strong" />
                <span className="text-base font-semibold text-success-strong">成功</span>
                <span className="text-[10px] text-success">快捷键 S</span>
              </button>
              <button
                type="button"
                onClick={() => tap(false)}
                className="h-32 lg:h-28 rounded-xl bg-danger-soft border-2 border-danger-line hover:bg-danger-soft shadow-card press flex flex-col items-center justify-center gap-1 cursor-pointer"
              >
                <X className="w-8 h-8 text-danger-strong" />
                <span className="text-base font-semibold text-danger-strong">失败</span>
                <span className="text-[10px] text-danger">快捷键 F</span>
              </button>
            </div>

            {/* 本次计数 */}
            <div className="mt-4 border border-line rounded-lg p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-ink-2">本次已记</span>
                {/* key 变化触发回弹：让"我点到了"这件事被看见。
                    tabular 等宽数字，避免数字跳动时整行宽度跟着抖 */}
                <span
                  key={`${total}-${success}`}
                  className="animate-pop text-base sm:text-sm font-semibold text-ink tabular"
                >
                  {total} 试次 · {success} 成功 · {pct}%
                </span>
              </div>

              {total > 0 && (
                <div className="mt-2 space-y-1.5">
                  {groups.map((g) => {
                    const label = PROMPT_LEVELS.find((p) => p.value === g.prompt_level)?.label ?? g.prompt_level;
                    const gp = Math.round((g.success_count / g.trial_count) * 100);
                    return (
                      <div key={g.prompt_level} className="flex items-center gap-2 text-[11px]">
                        <span className="w-14 shrink-0 text-ink-2">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-info"
                            style={{ width: `${gp}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-ink-2">
                          {g.success_count}/{g.trial_count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {total > 0 && (
                <button
                  type="button"
                  onClick={() => setTaps((p) => p.slice(0, -1))}
                  className="mt-2 min-tap-h flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-2 press cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  撤销最后一次（Backspace）
                </button>
              )}
            </div>

            {/* 备注（可选） */}
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注（可选）：换了新教具 / 今天情绪不好 / 换了个训室"
              className="mt-3 w-full h-9 px-3 rounded-md border border-line text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:border-line-2"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} className="h-11 lg:h-9 flex-1 sm:flex-none press">
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || total === 0}
                className="h-11 lg:h-9 flex-1 sm:flex-none press"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? '保存中…' : '保存本次试次'}
              </Button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              同一层级的多试次会合并成一条记录，不同层级分开存 ——
              这样日后才能判断「该不该撤掉提示」。系统不会替你判断是否掌握，
              只会在连续 3 次达到掌握标准时把短期目标标记为已掌握，你可以随时改回。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * 保存后的回流：让教师立刻看到「这次记录之后，系统怎么看」
 * ============================================================ */

function SaveResultView({
  result,
  onClose,
  onAgain,
}: {
  result: TrialSaveResult;
  onClose: () => void;
  onAgain: () => void;
}) {
  const a = result.analysis;
  return (
    <div className="px-5 py-5">
      <div className="rounded-lg bg-success-soft border border-success-soft p-4">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-success-strong">{result.achievement_pct}%</span>
          <span className="text-xs text-ink-2">
            {result.trial_count} 试次 / {result.success_count} 成功 · 写入 {result.rows} 条
          </span>
        </div>
        {result.objective_status === 'mastered' && (
          <p className="mt-2 text-xs text-success-strong">
            近 3 次均达到掌握标准，该短期目标已自动标记为「已掌握」。
          </p>
        )}
      </div>

      {a && (
        <div className="mt-4 rounded-lg border border-line p-4">
          <p className="text-xs font-semibold text-ink">
            录入后系统对该长期目标的判断：{a.level_text}
          </p>
          <ul className="mt-2 space-y-1">
            {a.reasons.map((r, i) => (
              <li key={i} className="text-[11px] text-ink-2 leading-relaxed">
                · {r}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-ink-3">
            依据：累计 {a.points} 个数据点。结论由规则生成，最终判断仍以 IEP 团队为准。
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onAgain} className="h-9">
          再记一次
        </Button>
        <Button onClick={onClose} className="h-9">
          完成
        </Button>
      </div>
    </div>
  );
}
