import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users,
  FileText,
  ClipboardCheck,
  BookOpen,
  Bell,
  Target,
  TrendingUp,
  UserPlus,
  FilePlus,
  ClipboardPlus,
  BookPlus,
  ListChecks,
  Clock,
  ClipboardList,
  PenTool,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useDataScopeConfig, useIsReadOnly, filterByDataScope } from '@/utils/dataScope';
import { fetchStudents } from '@/services/students';
import { fetchIEPList } from '@/services/iep';
import { fetchAssessments } from '@/services/evaluation';
import { fetchTeachingRecords } from '@/services/teaching';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

// Quick actions data
const quickActions = [
  { label: '快速记教学', icon: BookPlus, color: 'bg-primary-500', action: 'teaching' },
  { label: '新建评估', icon: ClipboardPlus, color: 'bg-success-500', action: 'evaluation' },
  { label: '新建IEP', icon: FilePlus, color: 'bg-info-500', action: 'iep' },
  { label: '查看待办', icon: ListChecks, color: 'bg-warning-500', action: 'todos' },
];

const DISABILITY_PALETTE = ['#977653', '#405680', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#EC4899'];

const statusBorderColors: Record<string, string> = {
  urgent: 'border-l-danger-500',
  warning: 'border-l-warning-500',
  normal: 'border-l-success-500',
};

const statusBadgeColors: Record<string, string> = {
  urgent: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  normal: 'bg-success-50 text-success-600',
};

const activityTypeColors: Record<string, string> = {
  evaluation: 'bg-success-500',
  iep: 'bg-primary-500',
  update: 'bg-warning-500',
  signature: 'bg-secondary-500',
  record: 'bg-info-500',
};

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-[#E2E8F0] p-3">
      {label && <p className="text-sm font-medium text-[#1E293B] mb-1.5">{label}</p>}
      {payload.map((entry, index) => (
        <p key={index} className="text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-[#64748B]">{entry.name}：</span>
          <span className="font-medium text-[#1E293B]">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** 把 ISO/数据库时间转成「X天前 / 今天 / X月X日」的相对展示 */
function relativeTime(raw?: string | null): string {
  if (!raw) return '—';
  const t = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return '—';
  const diff = Date.now() - t.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 0) return '刚刚';
  if (diff < day) return '今天';
  if (diff < 2 * day) return '昨天';
  if (diff < 30 * day) return `${Math.floor(diff / day)}天前`;
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState('');

  // P0-2 修复：在组件内订阅 authStore 求值，避免模块顶层冻结
  const dataScopeConfig = useDataScopeConfig();
  const readOnly = useIsReadOnly();

  // 真实数据（后端按数据权限范围已做过滤；下列计数即当前账号可见范围）
  const [students, setStudents] = useState<any[]>([]);
  const [ieps, setIeps] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [teaching, setTeaching] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    setCurrentDate(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`);

    let alive = true;
    setLoading(true);
    Promise.all([
      fetchStudents({ page: 1, pageSize: 200, sort_field: 'created_at', sort_order: 'desc' }).then((r) => r.list).catch(() => []),
      fetchIEPList({ page: 1, pageSize: 200 }).then((r) => r.list).catch(() => []),
      fetchAssessments({ page: 1, pageSize: 200 }).then((r) => r.list).catch(() => []),
      fetchTeachingRecords({ page: 1, pageSize: 200 }).then((r) => r.list).catch(() => []),
    ]).then(([s, i, a, t]) => {
      if (!alive) return;
      setStudents(s);
      setIeps(i);
      setAssessments(a);
      setTeaching(t);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const studentCount = students.length;
  const iepCount = ieps.length;
  const assessmentCount = assessments.length;
  const teachingCount = teaching.length;

  // 待审批 IEP（草稿 / 审核中）
  const pendingApproval = ieps.filter((p) => ['draft', 'reviewing'].includes(String(p.status))).length;
  // 目标达成：已生效/已完成 IEP 占比
  const goalDone = ieps.filter((p) => ['active', 'completed'].includes(String(p.status))).length;
  const goalAchievement = `${goalDone}/${iepCount}`;

  // 真实残疾类型分布
  const disabilityData = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach((s) => {
      const k = s.disability_type || '未标注';
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({ name, value, color: DISABILITY_PALETTE[i % DISABILITY_PALETTE.length] }));
  }, [students]);

  // 真实近 6 个月 IEP 制定 / 完成趋势（按 created_at 归桶）
  const iepTrendData = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${d.getMonth() + 1}月` });
    }
    return buckets.map((b) => ({
      month: b.label,
      created: ieps.filter((p) => p.created_at && String(p.created_at).startsWith(b.key)).length,
      completed: ieps.filter((p) => p.status === 'completed' && p.created_at && String(p.created_at).startsWith(b.key)).length,
    }));
  }, [ieps]);

  // 真实各班级 IEP 完成情况
  const classIepData = useMemo(() => {
    const map: Record<string, { class: string; total: number; completed: number; inProgress: number }> = {};
    ieps.forEach((p) => {
      const c = p.class_name || '未分配班级';
      if (!map[c]) map[c] = { class: c, total: 0, completed: 0, inProgress: 0 };
      map[c].total += 1;
      if (p.status === 'completed') map[c].completed += 1;
      else map[c].inProgress += 1;
    });
    return Object.values(map);
  }, [ieps]);

  // 雷达图 / 目标进度图：当前无真实数据源（需后端 /api/stats 聚合），不再编造数字
  const developmentProfileData: any[] = [];
  const goalProgressData: any[] = [];

  // 最近更新的学生档案（真实）
  const recentStudents = useMemo(() => {
    return [...students]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        id: s.student_no || s.id,
        class: s.class_name || '—',
        updateTime: relativeTime(s.created_at),
        updateAction: '建档',
        status: s.status || '在读',
      }));
  }, [students]);

  // 待处理事项（真实派生）
  const assessmentPending = assessments.filter((a) => a.status !== 'completed').length;
  const signPending = ieps.filter((p) => p.signature_status === '待签名').length;
  const pendingTasks = [
    { label: 'IEP计划待审批', count: pendingApproval, color: 'warning', icon: Clock, bgColor: 'bg-warning-50', iconColor: 'text-warning-500', borderColor: 'border-warning-500' },
    { label: '评估待录入', count: assessmentPending, color: 'info', icon: ClipboardList, bgColor: 'bg-info-50', iconColor: 'text-info-500', borderColor: 'border-info-500' },
    { label: '家长签名待确认', count: signPending, color: 'secondary', icon: PenTool, bgColor: 'bg-secondary-50', iconColor: 'text-secondary-500', borderColor: 'border-secondary-500' },
    { label: '教学记录', count: teachingCount, color: 'danger', icon: AlertCircle, bgColor: 'bg-danger-50', iconColor: 'text-danger-500', borderColor: 'border-danger-500' },
  ];

  // 最近活动（真实派生，按 created_at 倒序）
  const recentActivity = useMemo(() => {
    const items: any[] = [];
    assessments.slice(0, 8).forEach((a) => items.push({ user: a.student_name || '学生', action: '完成了', object: `${a.student_name || ''}的${a.assessment_type || '评估'}`, time: relativeTime(a.created_at), type: 'evaluation' }));
    ieps.slice(0, 8).forEach((p) => items.push({ user: p.student_name || '学生', action: p.status === 'completed' ? '完成了' : '创建了', object: `${p.student_name || ''}的IEP计划`, time: relativeTime(p.created_at), type: 'iep' }));
    return items
      .sort((a, b) => new Date(b.time === '今天' ? Date.now() : 0).getTime() - new Date(a.time === '今天' ? Date.now() : 0).getTime())
      .slice(0, 6);
  }, [assessments, ieps]);

  // IEP 检视提醒（真实派生：待审批 IEP 即需关注）
  const reviewReminders = useMemo(() => {
    return ieps
      .filter((p) => ['draft', 'reviewing'].includes(String(p.status)))
      .slice(0, 5)
      .map((p) => ({
        student: p.student_name || '学生',
        daysLeft: '—',
        status: 'warning' as const,
        message: `${p.student_name || '学生'}的IEP计划待审批`,
      }));
  }, [ieps]);

  const scopeStatCards = useMemo(() => [
    { title: '学生总数', value: studentCount, trend: null, trendUp: null, icon: Users, bgColor: 'bg-primary-50', iconColor: 'text-primary-500' },
    { title: 'IEP计划数', value: iepCount, trend: null, trendUp: null, icon: FileText, bgColor: 'bg-info-50', iconColor: 'text-info-500' },
    { title: '评估记录', value: assessmentCount, trend: null, trendUp: null, icon: ClipboardCheck, bgColor: 'bg-success-50', iconColor: 'text-success-500' },
    { title: '教学记录', value: teachingCount, trend: null, trendUp: null, icon: BookOpen, bgColor: 'bg-warning-50', iconColor: 'text-warning-500' },
    { title: '待审批事项', value: pendingApproval, trend: null, trendUp: null, icon: Bell, bgColor: 'bg-danger-50', iconColor: 'text-danger-500' },
    { title: '本月目标达成', value: goalAchievement, trend: null, trendUp: null, icon: Target, bgColor: 'bg-purple-50', iconColor: 'text-purple-500' },
  ], [studentCount, iepCount, assessmentCount, teachingCount, pendingApproval, goalAchievement]);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case '快速记教学':
        navigate('/teaching');
        break;
      case '新建评估':
        navigate('/evaluation');
        break;
      case '新建IEP':
        navigate('/iep');
        break;
      case '查看待办':
        navigate('/iep');
        break;
      default:
        toast('功能开发中', { description: `「${action}」功能即将上线，敬请期待` });
    }
  };

  return (
    <div className="space-y-6">
      {/* 数据披露横幅：本页统计均来自真实业务数据；雷达图与目标进度图暂无后端聚合接口，显示为空态而非编造数字 */}
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#64748B] flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-success-500 flex-shrink-0" />
        <span>本页统计均取自真实业务数据（按当前账号数据权限范围）。其中「学生发展侧面图」「IEP目标达成进度」两项暂无后端聚合接口，显示为真实空态，待对接 <code className="px-1 rounded bg-[#EEF2F6]">/api/stats</code> 后补全。</span>
      </div>

      {/* Section 1: Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="relative overflow-hidden rounded-xl border border-primary-200 px-6 py-4"
        style={{ background: 'linear-gradient(135deg, #F5F0EB 0%, #F0EDE8 100%)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">
              欢迎回来，{user?.name || '老师'}！
            </h2>
            <p className="text-sm text-[#64748B] mt-1">
              今天是 {currentDate}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Section 2: Stat Cards */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        {scopeStatCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={index}
              variants={staggerItem}
              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
              className="bg-white rounded-xl p-5 cursor-pointer transition-shadow duration-150"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-[13px] text-[#64748B]">{card.title}</span>
                <div className={`w-10 h-10 rounded-full ${card.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
              </div>
              <div className="text-[28px] font-bold text-[#1E293B] leading-tight">
                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </div>
              {card.trend && (
                <div className="flex items-center gap-1 mt-1.5 text-[13px]">
                  {card.trendUp !== null && (
                    <TrendingUp className={`w-3.5 h-3.5 ${card.trendUp ? 'text-success-500' : 'text-danger-500'} ${!card.trendUp ? 'rotate-180' : ''}`} />
                  )}
                  <span className={card.trendUp ? 'text-success-500' : 'text-danger-500'}>
                    {card.trend}
                  </span>
                  {card.title !== '本月目标达成' && (
                    <span className="text-[#94A3B8]">较上月</span>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Section 3: Quick Actions - hidden for readOnly users */}
      {!readOnly && (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="bg-white rounded-xl p-4"
        >
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={index}
                  variants={staggerItem}
                  whileHover={{ scale: 1.02, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleQuickAction(action.label)}
                  className={`${action.color} text-white flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-medium transition-all cursor-pointer hover:opacity-90`}
                >
                  <Icon className="w-4 h-4" />
                  {action.label}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Section 4: Charts Row 1 (3 charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 4A: Pie Chart - Disability Types (真实数据) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">学生障碍类型分布</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700">真实数据</span>
          </div>
          <div className="h-[260px]">
            {disabilityData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-[#94A3B8]">暂无学生数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={disabilityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1200}
                  >
                    {disabilityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" className="text-2xl font-bold fill-[#1E293B]">
                    {studentCount}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" dominantBaseline="central" className="text-xs fill-[#94A3B8]">
                    总人数
                  </text>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2">
            {disabilityData.map((item, index) => (
              <div key={index} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[#64748B]">{item.name}</span>
                <span className="text-[#1E293B] font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 4B: Area Chart - IEP Trends (真实数据) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">近6个月IEP完成趋势</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700">真实数据</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={iepTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C1AC96" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#C1AC96" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="created" name="制定数" stroke="#977653" strokeWidth={2} fill="url(#colorCreated)" dot={{ r: 4, fill: '#977653' }} activeDot={{ r: 6 }} />
                <Area type="monotone" dataKey="completed" name="完成数" stroke="#10B981" strokeWidth={2} fill="url(#colorCompleted)" dot={{ r: 4, fill: '#10B981' }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 4C: Bar Chart - Class IEP Completion (真实数据) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <h3 className="text-base font-semibold text-[#1E293B] mb-4">各班级IEP完成情况</h3>
          <div className="h-[260px]">
            {classIepData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-[#94A3B8]">暂无IEP数据</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classIepData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="class" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="completed" name="已完成" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inProgress" name="进行中" fill="#977653" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Section 5: Charts Row 2 (Radar + IEP Progress) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 5A: Radar Chart - Student Development Profile (暂无真实数据源) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">学生发展侧面图</h3>
            <p className="text-xs text-[#94A3B8] mt-1">认知/沟通/社交/自理/运动/情绪/学业 — 7大领域能力评估</p>
          </div>
          <div className="h-[280px] flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-[#CBD5E1] mb-3" />
            <p className="text-sm text-[#64748B] font-medium">暂无聚合数据</p>
            <p className="text-xs text-[#94A3B8] mt-1">需后端 /api/stats 提供各领域均值，<br />当前不展示编造数值</p>
          </div>
        </motion.div>

        {/* 5B: IEP Goal Progress Tracking (暂无真实数据源) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5 lg:col-span-2"
        >
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">IEP目标达成进度</h3>
            <p className="text-xs text-[#94A3B8] mt-1">各目标领域得分变化趋势（%）</p>
          </div>
          <div className="h-[280px] flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-10 h-10 text-[#CBD5E1] mb-3" />
            <p className="text-sm text-[#64748B] font-medium">暂无聚合数据</p>
            <p className="text-xs text-[#94A3B8] mt-1">需后端 /api/stats 按目标领域聚合，<br />当前不展示编造数值</p>
          </div>
        </motion.div>
      </div>

      {/* Section 6: IEP Review Reminders & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 6A: IEP Review Reminders (真实派生) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">IEP定期检视提醒</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-danger-50 text-danger-600">需关注</span>
          </div>
          {reviewReminders.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-6 text-center">当前没有待审批的 IEP 计划 🎉</p>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-3"
            >
              {reviewReminders.map((item, index) => (
                <motion.div
                  key={index}
                  variants={staggerItem}
                  whileHover={{ x: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                  className={`border border-[#E2E8F0] rounded-lg p-3.5 border-l-4 ${statusBorderColors[item.status]} bg-white transition-all cursor-pointer`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary-700">
                          {item.student[0]}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">{item.student}</div>
                        <div className="text-xs text-[#94A3B8]">{item.message}</div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[item.status]}`}>
                      {item.daysLeft}天
                    </span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* 6B: Recent Activity (真实派生) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">最近活动</h3>
            <button
              type="button"
              onClick={() => navigate('/system')}
              className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer"
            >
              查看全部
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-6 text-center">暂无活动记录</p>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-4"
            >
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={index}
                  variants={staggerItem}
                  className="flex items-start gap-3"
                >
                  <div className="relative flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full ${activityTypeColors[activity.type] || 'bg-[#94A3B8]'} flex-shrink-0 mt-1.5`} />
                    {index < recentActivity.length - 1 && (
                      <div className="w-px h-6 bg-[#E2E8F0] mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1E293B]">
                      <span className="font-medium">{activity.user}</span>
                      <span className="text-[#64748B]">{activity.action}</span>
                      <span className="text-primary-600 cursor-pointer hover:underline">{activity.object}</span>
                    </p>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{activity.time}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Section 7: Pending Tasks (真实派生) */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="bg-white rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1E293B]">待处理事项</h3>
          <button
            type="button"
            onClick={() => navigate('/iep')}
            className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer"
          >
            查看全部
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pendingTasks.map((task, index) => {
            const Icon = task.icon;
            return (
              <motion.div
                key={index}
                variants={staggerItem}
                whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                className="border border-[#E2E8F0] rounded-lg p-4 cursor-pointer hover:border-primary-200 transition-all duration-150"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${task.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${task.iconColor}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-[#1E293B]">{task.count}</div>
                    <div className="text-sm text-[#64748B]">{task.label}</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Section 8: Recent Students Table (真实数据) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="bg-white rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1E293B]">最近更新的学生档案</h3>
          <button
            type="button"
            onClick={() => navigate('/students')}
            className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer"
          >
            查看全部
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="text-left py-3 px-4 text-[13px] font-semibold text-[#94A3B8]">头像</th>
                <th className="text-left py-3 px-4 text-[13px] font-semibold text-[#94A3B8]">姓名</th>
                <th className="text-left py-3 px-4 text-[13px] font-semibold text-[#94A3B8]">班级</th>
                <th className="text-left py-3 px-4 text-[13px] font-semibold text-[#94A3B8]">最近更新</th>
                <th className="text-left py-3 px-4 text-[13px] font-semibold text-[#94A3B8]">状态</th>
              </tr>
            </thead>
            <motion.tbody
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {recentStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-[#94A3B8]">暂无学生档案</td>
                </tr>
              ) : (
                recentStudents.map((student, index) => (
                  <motion.tr
                    key={index}
                    variants={staggerItem}
                    whileHover={{ backgroundColor: '#F7F6F4' }}
                    className="border-b border-[#E2E8F0] transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary-700">
                          {student.name[0]}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="text-sm font-medium text-[#1E293B]">{student.name}</div>
                        <div className="text-xs text-[#94A3B8]">{student.id}</div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        {student.class}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-[#1E293B]">
                        <span>{student.updateTime}</span>
                        <span className="text-[#94A3B8]">·</span>
                        <span>{student.updateAction}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-600">
                        {student.status}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </motion.tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
