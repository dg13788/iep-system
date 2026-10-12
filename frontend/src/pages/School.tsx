import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ClipboardX,
  Loader2,
  RefreshCw,
  School as SchoolIcon,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fetchSchoolOverview, type SchoolOverview } from '@/services/school';

/**
 * 轻量校级协同（Step 5）
 *
 * 这个页面只回答三个问题：
 *   1. 各个班的目标，有多少在按预期走？
 *   2. 谁该采集却没采集？
 *   3. 哪些 IEP 还过不了质检？
 *
 * 刻意不做：多校租户、区域数据看板、跨机构上报、智能课表、活动运营。
 * 那是一条与免费普惠 SaaS 正面碰撞的路，本系统不占优势。
 *
 * 页面呈现的一切判定都来自后端决策引擎，这里不重算任何百分比。
 */

export default function School() {
  const [data, setData] = useState<SchoolOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchSchoolOverview(60));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-[#94A3B8]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        正在汇总本范围教学健康度…
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals ?? {};
  const totalGoals = Object.values(t).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
            <SchoolIcon className="w-5 h-5 text-[#475569]" />
            教学健康度
          </h1>
          <p className="mt-1 text-xs text-[#64748B]">
            {data.today} · 范围内 {data.plan_count} 个在执行的计划、{totalGoals} 个目标
            <span className="ml-1 text-[#94A3B8]">（数据范围：{data.scope_type}）</span>
          </p>
        </div>
        <Button variant="outline" className="h-8" onClick={() => void load()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          刷新
        </Button>
      </div>

      {/* 汇总 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="已达成" value={t.achieved ?? 0} dot="#059669" />
        <Stat label="按预期" value={t.on_track ?? 0} dot="#2563EB" />
        <Stat label="需观察" value={t.watch ?? 0} dot="#D97706" />
        <Stat label="不及预期" value={t.behind ?? 0} dot="#DC2626" />
        <Stat label="数据不足" value={t.unknown ?? 0} dot="#94A3B8" />
      </div>

      {/* 班级健康度 */}
      <section className="border border-[#E2E8F0] rounded-lg">
        <div className="px-4 py-3 border-b border-[#F1F5F9]">
          <span className="text-sm font-semibold text-[#1E293B]">班级目标健康度</span>
          <span className="ml-2 text-[11px] text-[#94A3B8]">
            健康度 =（按预期进展 + 已达成）/ 目标总数
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#94A3B8] border-b border-[#F1F5F9]">
                <th className="text-left py-2 px-4 font-normal">班级</th>
                <th className="text-right py-2 font-normal">学生</th>
                <th className="text-right py-2 font-normal">目标</th>
                <th className="text-right py-2 font-normal">按预期</th>
                <th className="text-right py-2 font-normal">需观察</th>
                <th className="text-right py-2 font-normal">不及预期</th>
                <th className="text-right py-2 font-normal">无数据</th>
                <th className="text-right py-2 font-normal">逾期采集</th>
                <th className="text-right py-2 px-4 font-normal">健康度</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c.class_id} className="border-b border-[#F8FAFC]">
                  <td className="py-2 px-4 text-[#1E293B]">{c.class_name}</td>
                  <td className="py-2 text-right text-[#64748B]">{c.student_count}</td>
                  <td className="py-2 text-right text-[#64748B]">{c.goals}</td>
                  <td className="py-2 text-right text-[#2563EB]">{c.on_track + c.achieved}</td>
                  <td className="py-2 text-right text-[#D97706]">{c.watch}</td>
                  <td className="py-2 text-right text-[#DC2626]">{c.behind}</td>
                  <td className="py-2 text-right text-[#94A3B8]">{c.unknown}</td>
                  <td className="py-2 text-right text-[#B45309]">{c.overdue}</td>
                  <td className="py-2 px-4 text-right">
                    {c.health === null ? (
                      <span className="text-[#94A3B8]">—</span>
                    ) : (
                      <span
                        className={cn(
                          'font-semibold',
                          c.health >= 60 ? 'text-[#059669]'
                            : c.health >= 30 ? 'text-[#D97706]' : 'text-[#DC2626]',
                        )}
                      >
                        {c.health}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 逾期采集 */}
        <section className="border border-[#E2E8F0] rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F1F5F9]">
            <ClipboardX className="w-4 h-4 text-[#B45309]" />
            <span className="text-sm font-semibold text-[#1E293B]">逾期未采集</span>
            <span className="text-[11px] text-[#94A3B8]">{data.overdue.length} 人</span>
          </div>
          {data.overdue.length === 0 ? (
            <p className="px-4 py-4 text-xs text-[#94A3B8]">范围内没有逾期未采集的目标</p>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {data.overdue.map((o) => (
                <div key={o.teacher_id} className="px-4 py-2.5 flex items-center gap-2">
                  <span className="flex-1 text-xs text-[#1E293B]">{o.teacher_name}</span>
                  <span className="text-[11px] text-[#B45309]">
                    {o.overdue_goals} 个目标
                    {o.max_days > 0 ? ` · 最长超期 ${o.max_days} 天` : ''}
                  </span>
                  {o.never > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FEF3C7] text-[#92400E]">
                      {o.never} 个从未采集
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 质检未通过 */}
        <section className="border border-[#E2E8F0] rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F1F5F9]">
            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
            <span className="text-sm font-semibold text-[#1E293B]">质检未通过</span>
            <span className="text-[11px] text-[#94A3B8]">{data.qc_failed.length} 个计划</span>
          </div>
          {data.qc_failed.length === 0 ? (
            <p className="px-4 py-4 text-xs text-[#94A3B8]">范围内没有质检未通过的计划</p>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {data.qc_failed.map((q) => (
                <div key={q.plan_id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#1E293B]">{q.student_name}</span>
                    <span className="text-[10px] text-[#94A3B8]">{q.class_name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FEE2E2] text-[#B91C1C]">
                      {q.error_count} 项必须处理
                    </span>
                    {q.warn_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FEF3C7] text-[#B45309]">
                        {q.warn_count} 项建议完善
                      </span>
                    )}
                  </div>
                  {q.top_issues.length > 0 && (
                    <p className="mt-1 text-[11px] text-[#64748B] truncate">
                      <AlertTriangle className="w-3 h-3 inline mr-1 text-[#B45309]" />
                      {q.top_issues.join('；')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{data.note}</p>
    </div>
  );
}

function Stat({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="border border-[#E2E8F0] rounded-lg p-3">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-[11px] text-[#64748B]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-[#1E293B]">{value}</p>
    </div>
  );
}
