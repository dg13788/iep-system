import { useEffect, useState } from 'react';
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
import { getDataScopeConfig, filterByDataScope, isReadOnly } from '@/utils/dataScope';

// Student reference data for data scope filtering
const allStudents = [
  { id: 's1', name: '王小明', class: '特教一班', classId: 'c1' },
  { id: 's2', name: '李小红', class: '特教一班', classId: 'c1' },
  { id: 's3', name: '张小刚', class: '特教二班', classId: 'c2' },
  { id: 's4', name: '刘小美', class: '特教二班', classId: 'c2' },
  { id: 's5', name: '陈小军', class: '特教三班', classId: 'c3' },
  { id: 's6', name: '赵小芳', class: '特教三班', classId: 'c3' },
  { id: 's7', name: '孙小亮', class: '特教一班', classId: 'c1' },
  { id: 's8', name: '周小静', class: '特教二班', classId: 'c2' },
  { id: 's9', name: '吴小强', class: '特教一班', classId: 'c1' },
  { id: 's10', name: '马小丽', class: '特教三班', classId: 'c3' },
];

// Compute scope-aware stat cards
const dataScopeConfig = getDataScopeConfig();
const readOnly = isReadOnly();

const scopedStudents = filterByDataScope(
  allStudents,
  (s) => s.id,
  (s) => s.classId,
);

const studentRatio = scopedStudents.length / allStudents.length;

const scopeStatCards = [
  { title: '学生总数', value: scopedStudents.length, trend: '12.5%', trendUp: true, icon: Users, bgColor: 'bg-primary-50', iconColor: 'text-primary-500' },
  { title: 'IEP计划数', value: Math.max(1, Math.round(189 * studentRatio)), trend: '8.3%', trendUp: true, icon: FileText, bgColor: 'bg-info-50', iconColor: 'text-info-500' },
  { title: '评估记录', value: Math.max(1, Math.round(412 * studentRatio)), trend: '15.2%', trendUp: true, icon: ClipboardCheck, bgColor: 'bg-success-50', iconColor: 'text-success-500' },
  { title: '教学记录', value: Math.max(1, Math.round(1256 * studentRatio)), trend: '6.7%', trendUp: true, icon: BookOpen, bgColor: 'bg-warning-50', iconColor: 'text-warning-500' },
  { title: '待审批事项', value: dataScopeConfig.type === 'own_only' ? 0 : Math.max(1, Math.round(8 * studentRatio)), trend: null, trendUp: null, icon: Bell, bgColor: 'bg-danger-50', iconColor: 'text-danger-500' },
  { title: '本月目标达成', value: dataScopeConfig.type === 'own_only' ? '1/4' : `${Math.max(1, Math.round(45 * studentRatio))}/${Math.max(1, Math.round(60 * studentRatio))}`, trend: '75%', trendUp: true, icon: Target, bgColor: 'bg-purple-50', iconColor: 'text-purple-500' },
];

// Animation variants
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

// Stat cards data
const statCards = [
  { title: '学生总数', value: 256, trend: '12.5%', trendUp: true, icon: Users, bgColor: 'bg-primary-50', iconColor: 'text-primary-500' },
  { title: 'IEP计划数', value: 189, trend: '8.3%', trendUp: true, icon: FileText, bgColor: 'bg-info-50', iconColor: 'text-info-500' },
  { title: '评估记录', value: 412, trend: '15.2%', trendUp: true, icon: ClipboardCheck, bgColor: 'bg-success-50', iconColor: 'text-success-500' },
  { title: '教学记录', value: 1256, trend: '6.7%', trendUp: true, icon: BookOpen, bgColor: 'bg-warning-50', iconColor: 'text-warning-500' },
  { title: '待审批事项', value: 8, trend: null, trendUp: null, icon: Bell, bgColor: 'bg-danger-50', iconColor: 'text-danger-500' },
  { title: '本月目标达成', value: '45/60', trend: '75%', trendUp: true, icon: Target, bgColor: 'bg-purple-50', iconColor: 'text-purple-500' },
];

// Quick actions data
const quickActions = [
  { label: '快速记教学', icon: BookPlus, color: 'bg-primary-500', action: 'teaching' },
  { label: '新建评估', icon: ClipboardPlus, color: 'bg-success-500', action: 'evaluation' },
  { label: '新建IEP', icon: FilePlus, color: 'bg-info-500', action: 'iep' },
  { label: '查看待办', icon: ListChecks, color: 'bg-warning-500', action: 'todos' },
];

// Pie chart data - disability types
const disabilityData = [
  { name: '智力发育迟缓', value: 98, color: '#977653' },
  { name: '自闭症谱系', value: 62, color: '#405680' },
  { name: '唐氏综合征', value: 34, color: '#10B981' },
  { name: '脑瘫', value: 28, color: '#F59E0B' },
  { name: '多重障碍', value: 18, color: '#EF4444' },
  { name: '其他', value: 16, color: '#8B5CF6' },
];

// Line chart data - IEP trends
const iepTrendData = [
  { month: '8月', created: 28, completed: 22 },
  { month: '9月', created: 32, completed: 26 },
  { month: '10月', created: 35, completed: 30 },
  { month: '11月', created: 30, completed: 28 },
  { month: '12月', created: 38, completed: 34 },
  { month: '1月', created: 26, completed: 20 },
];

// Bar chart data - class IEP completion
const classIepData = [
  { class: '特教一班', total: 42, completed: 35, inProgress: 7 },
  { class: '特教二班', total: 38, completed: 30, inProgress: 8 },
  { class: '特教三班', total: 35, completed: 28, inProgress: 7 },
  { class: '康复一班', total: 30, completed: 22, inProgress: 8 },
  { class: '学前融合班', total: 25, completed: 20, inProgress: 5 },
  { class: '生活技能班', total: 19, completed: 15, inProgress: 4 },
];

// Radar chart data - student development profile
const developmentProfileData = [
  { domain: '认知', current: 65, previous: 55 },
  { domain: '沟通', current: 48, previous: 40 },
  { domain: '社交', current: 72, previous: 68 },
  { domain: '生活自理', current: 80, previous: 70 },
  { domain: '运动', current: 60, previous: 58 },
  { domain: '情绪行为', current: 75, previous: 65 },
  { domain: '学业', current: 55, previous: 45 },
];

// Goal progress data - IEP goal achievement over time
const goalProgressData = [
  { month: '9月', goal1: 30, goal2: 25, goal3: 40, goal4: 20 },
  { month: '10月', goal1: 45, goal2: 40, goal3: 50, goal4: 35 },
  { month: '11月', goal1: 55, goal2: 50, goal3: 60, goal4: 48 },
  { month: '12月', goal1: 65, goal2: 62, goal3: 70, goal4: 55 },
  { month: '1月', goal1: 72, goal2: 70, goal3: 78, goal4: 65 },
  { month: '2月', goal1: 80, goal2: 75, goal3: 85, goal4: 72 },
];

// IEP review reminders data
const reviewReminders = [
  { student: '王小明', daysLeft: 15, status: 'urgent', message: '距下次IEP检视还有15天' },
  { student: '李小红', daysLeft: 30, status: 'warning', message: '距下次IEP检视还有30天' },
  { student: '张小刚', daysLeft: 45, status: 'normal', message: '距下次IEP检视还有45天' },
  { student: '陈小华', daysLeft: 60, status: 'normal', message: '距下次IEP检视还有60天' },
];

// Recent activity data
const recentActivity = [
  { time: '10分钟前', user: '张老师', action: '完成了', object: '王小明的认知评估', type: 'evaluation' },
  { time: '30分钟前', user: '李老师', action: '创建了', object: '特教一班的新IEP计划', type: 'iep' },
  { time: '1小时前', user: '王老师', action: '更新了', object: '李小红的生活自理目标', type: 'update' },
  { time: '2小时前', user: '赵家长', action: '签名确认', object: '张小明的IEP计划', type: 'signature' },
  { time: '3小时前', user: '陈老师', action: '录入', object: '康复一班的运动评估', type: 'record' },
];

const activityTypeColors: Record<string, string> = {
  evaluation: 'bg-success-500',
  iep: 'bg-primary-500',
  update: 'bg-warning-500',
  signature: 'bg-secondary-500',
  record: 'bg-info-500',
};

// Pending tasks data
const pendingTasks = [
  { label: 'IEP计划待审批', count: 5, color: 'warning', icon: Clock, bgColor: 'bg-warning-50', iconColor: 'text-warning-500', borderColor: 'border-warning-500' },
  { label: '评估待录入', count: 12, color: 'info', icon: ClipboardList, bgColor: 'bg-info-50', iconColor: 'text-info-500', borderColor: 'border-info-500' },
  { label: '家长签名待确认', count: 8, color: 'secondary', icon: PenTool, bgColor: 'bg-secondary-50', iconColor: 'text-secondary-500', borderColor: 'border-secondary-500' },
  { label: '教学记录待填写', count: 3, color: 'danger', icon: AlertCircle, bgColor: 'bg-danger-50', iconColor: 'text-danger-500', borderColor: 'border-danger-500' },
];

// Recent students data
const recentStudents = [
  { name: '王小明', id: 'XH2023001', class: '特教一班', updateTime: '10分钟前', updateAction: '认知评估完成', status: '在读' },
  { name: '李小红', id: 'XH2023002', class: '特教二班', updateTime: '1小时前', updateAction: 'IEP目标更新', status: '在读' },
  { name: '张小明', id: 'XH2023003', class: '康复一班', updateTime: '2小时前', updateAction: '家长已签名', status: '在读' },
  { name: '陈小华', id: 'XH2023004', class: '特教一班', updateTime: '昨天', updateAction: '教学记录录入', status: '在读' },
  { name: '刘小芳', id: 'XH2023005', class: '学前融合班', updateTime: '昨天', updateAction: '评估记录创建', status: '在读' },
];

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

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState('');

  // Scope-aware filtering for list data
  const scopedStudentNames = new Set(scopedStudents.map((s) => s.name));

  const filteredReviewReminders = reviewReminders.filter((r) =>
    scopedStudentNames.has(r.student)
  );

  const filteredRecentActivity = recentActivity.filter((a) => {
    // Extract student name from activity object (e.g., "王小明的认知评估")
    for (const name of scopedStudentNames) {
      if (a.object.includes(name)) return true;
    }
    // For class-level activities, show if user has class access
    if (a.object.includes('特教一班') && dataScopeConfig.classIds?.includes('c1')) return true;
    if (a.object.includes('特教二班') && dataScopeConfig.classIds?.includes('c2')) return true;
    if (a.object.includes('特教三班') && dataScopeConfig.classIds?.includes('c3')) return true;
    return false;
  });

  const filteredRecentStudents = recentStudents.filter((s) =>
    scopedStudentNames.has(s.name)
  );

  useEffect(() => {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = weekdays[now.getDay()];
    setCurrentDate(`${year}年${month}月${day}日 ${weekday}`);
  }, []);

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
        toast('待办事项', {
          description: '您有 5 项IEP待审批、12 项评估待录入、8 项签名待确认',
        });
        break;
      default:
        toast('功能开发中', {
          description: `「${action}」功能即将上线，敬请期待`,
        });
    }
  };

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

  return (
    <div className="space-y-6">
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.8, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
          >
            <svg width="100" height="80" viewBox="0 0 100 80" fill="none" className="opacity-60">
              <circle cx="75" cy="25" r="15" fill="#F59E0B" opacity="0.3" />
              <rect x="10" y="35" width="50" height="30" rx="4" fill="#977653" opacity="0.2" />
              <rect x="20" y="50" width="30" height="20" rx="3" fill="#405680" opacity="0.15" />
              <path d="M5 70 L95 70" stroke="#977653" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            </svg>
          </motion.div>
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
        {/* 4A: Pie Chart - Disability Types */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">学生障碍类型分布</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700">本学期</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataScopeConfig.type === 'all' ? disabilityData : disabilityData.map((d) => ({ ...d, value: Math.max(1, Math.round(d.value * studentRatio)) }))}
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
                  {scopedStudents.length}
                </text>
                <text x="50%" y="58%" textAnchor="middle" dominantBaseline="central" className="text-xs fill-[#94A3B8]">
                  {dataScopeConfig.type === 'all' ? '总人数' : '权限范围内'}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2">
            {(dataScopeConfig.type === 'all' ? disabilityData : disabilityData.map((d) => ({ ...d, value: Math.max(1, Math.round(d.value * studentRatio)) }))).map((item, index) => (
              <div key={index} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[#64748B]">{item.name}</span>
                <span className="text-[#1E293B] font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 4B: Area Chart - IEP Trends */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">近6个月IEP完成趋势</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700">近6个月</span>
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

        {/* 4C: Bar Chart - Class IEP Completion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-5"
        >
          <h3 className="text-base font-semibold text-[#1E293B] mb-4">各班级IEP完成情况</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataScopeConfig.type === 'all' ? classIepData : classIepData.filter((d) => {
                const classMap: Record<string, string> = { '特教一班': 'c1', '特教二班': 'c2', '特教三班': 'c3' };
                const cid = classMap[d.class];
                return cid && dataScopeConfig.classIds.includes(cid);
              })} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
          </div>
        </motion.div>
      </div>

      {/* Section 5: Charts Row 2 (Radar + IEP Progress + Evaluation Completion) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 5A: Radar Chart - Student Development Profile */}
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
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={developmentProfileData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 12, fill: '#64748B' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Radar
                  name="上期评估"
                  dataKey="previous"
                  stroke="#D4C4B0"
                  strokeWidth={2}
                  fill="#D4C4B0"
                  fillOpacity={0.2}
                />
                <Radar
                  name="本期评估"
                  dataKey="current"
                  stroke="#977653"
                  strokeWidth={2.5}
                  fill="#977653"
                  fillOpacity={0.35}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 5B: IEP Goal Progress Tracking */}
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
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={goalProgressData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGoal1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#977653" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#977653" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGoal2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#405680" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#405680" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGoal3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGoal4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area type="monotone" dataKey="goal1" name="认知目标" stroke="#977653" strokeWidth={2} fill="url(#colorGoal1)" dot={{ r: 3, fill: '#977653' }} />
                <Area type="monotone" dataKey="goal2" name="沟通目标" stroke="#405680" strokeWidth={2} fill="url(#colorGoal2)" dot={{ r: 3, fill: '#405680' }} />
                <Area type="monotone" dataKey="goal3" name="社交目标" stroke="#10B981" strokeWidth={2} fill="url(#colorGoal3)" dot={{ r: 3, fill: '#10B981' }} />
                <Area type="monotone" dataKey="goal4" name="生活自理目标" stroke="#F59E0B" strokeWidth={2} fill="url(#colorGoal4)" dot={{ r: 3, fill: '#F59E0B' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Section 6: IEP Review Reminders & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 6A: IEP Review Reminders */}
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
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {filteredReviewReminders.map((item, index) => (
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
        </motion.div>

        {/* 6B: Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="bg-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[#1E293B]">最近活动</h3>
            <button className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer">
              查看全部
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-4"
          >
            {filteredRecentActivity.map((activity, index) => (
              <motion.div
                key={index}
                variants={staggerItem}
                className="flex items-start gap-3"
              >
                <div className="relative flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full ${activityTypeColors[activity.type]} flex-shrink-0 mt-1.5`} />
                  {index < filteredRecentActivity.length - 1 && (
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
        </motion.div>
      </div>

      {/* Section 7: Pending Tasks */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="bg-white rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1E293B]">待处理事项</h3>
          <button className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer">
            查看全部
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(dataScopeConfig.type === 'all' ? pendingTasks : pendingTasks.map((t) => ({
            ...t,
            count: t.label === 'IEP计划待审批' && dataScopeConfig.type === 'own_only' ? 0 : Math.max(0, Math.round(t.count * studentRatio)),
          }))).map((task, index) => {
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

      {/* Section 8: Recent Students Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        className="bg-white rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1E293B]">最近更新的学生档案</h3>
          <button className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-0.5 cursor-pointer">
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
              {filteredRecentStudents.map((student, index) => (
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
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-600">
                      <CheckCircle2 className="w-3 h-3" />
                      {student.status}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
