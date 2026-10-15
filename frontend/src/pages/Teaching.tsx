import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchTeachingRecords, fetchStudentOptions, createTeachingRecord,
  updateTeachingRecord, deleteTeachingRecord, type StudentOption,
} from '@/services/teaching';
import { fetchIEPList, fetchGoalsForPlans } from '@/services/iep';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import {
  Search, BookPlus, LayoutList, Calendar as CalendarIcon,
  Star, Eye, Pencil, ChevronLeft, ChevronRight,
  X, RotateCcw, Zap,
  BookOpen,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { filterByDataScope, useIsReadOnly, useDataScopeConfig } from '@/utils/dataScope';
import { fetchAllPages } from '@/utils/fetchAllPages';
import ImportExportActions from '@/components/io/ImportExportActions';
import Pagination from '@/components/ui/pagination';
import { useConfirm } from '@/components/feedback/ConfirmProvider';

/* ------------------------------------------------------------------ */
/*  ID Mapping for Data Scope                                          */
/* ------------------------------------------------------------------ */
const teacherNameToId: Record<string, string> = {
  '王老师': 't1', '李老师': 't2', '张老师': 't3', '赵老师': 't4',
};
const normalizeStudentId = (sid: string): string => sid.replace('-', '');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TeachingRecord {
  id: string;
  date: string;
  student_id: string;
  student_name: string;
  iep_goal: string;
  teacher: string;
  session_type: '个训' | '小组' | '集体' | '生活实践';
  subject: string;
  teaching_content: string;
  teaching_method: string;
  student_performance: string;
  difficulties: string;
  adjustments: string;
  materials_used: string;
  homework: string;
  next_plan: string;
  effectiveness_score: number;
  duration_minutes: number;
  is_key_record: boolean;
  /** 修复(探索实测 2026-10-13)：关联 IEP 目标 id，提交时传后端；仅提交链路使用 */
  iep_goal_id?: number;
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */
// 修复(P2)：原文件在此处定义了三份编造数据——STUDENTS / TEACHERS / IEP_GOALS。
// 其中 IEP_GOALS 是「关联 IEP 目标」下拉的**唯一**选项来源，TEACHERS 从未被使用，
// STUDENTS 在学生列表为空时兜底出现在学生下拉里。教学记录会直接落库，
// 选中「王小明」「提升语言表达能力」这类编造值即产生脏数据。
// 现已全部移除：学生下拉只渲染真实数据（为空时禁用），IEP 目标改为按所选学生
// 拉取真实计划目标，教师默认值取当前登录用户真实姓名。
const SUBJECTS =['语言训练', '社交训练', '生活自理', '认知训练', '感觉统合', '精细动作', '音乐治疗', '美术创作'];
const SESSION_TYPES: Array<'个训' | '小组' | '集体' | '生活实践'> = ['个训', '小组', '集体', '生活实践'];

// 修复（三维度回测 0919 · P2-1）：此处原有的本地 mock 数据生成函数（仅声明、从未渲染）已整体删除，避免被误读为真实数据源。
// 用户 / 审计日志 / 教学记录一律来自后端真实接口。

// 修复（三维度回测 0919 · P2-1）：此处原有一份本地假教学记录常量（仅声明、从未渲染），
// 易被误读为真实数据源，已删除。教学记录一律来自后端真实接口。

const SESSION_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  '个训': { label: '个训', className: 'bg-primary-50 text-primary-700' },
  '小组': { label: '小组', className: 'bg-info-50 text-info-600' },
  '集体': { label: '集体', className: 'bg-success-50 text-success-600' },
  '生活实践': { label: '生活实践', className: 'bg-warning-50 text-warning-600' },
};

const SUBJECT_COLORS: Record<string, string> = {
  '语言训练': 'rgb(var(--brand))',
  '社交训练': 'rgb(var(--info))',
  '生活自理': 'rgb(var(--success))',
  '认知训练': 'rgb(var(--warning))',
  '感觉统合': 'rgb(var(--violet))',
  '精细动作': 'rgb(var(--danger))',
  '音乐治疗': 'rgb(var(--info))',
  '美术创作': 'rgb(var(--warning))',
};

/* ------------------------------------------------------------------ */
/*  Score Slider Component                                             */
/* ------------------------------------------------------------------ */
function ScoreSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value || 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setLocalValue(v);
    onChange(v);
  };

  const colorClass =
    localValue >= 80 ? 'text-success' :
    localValue >= 60 ? 'text-warning' :
    localValue >= 40 ? 'text-warning' :
    'text-danger';

  const bgColorClass =
    localValue >= 80 ? 'accent-success' :
    localValue >= 60 ? 'accent-warning' :
    localValue >= 40 ? 'accent-warning' :
    'accent-danger';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2">0</span>
        <span className={cn("text-2xl font-bold transition-colors", colorClass)}>
          {localValue}
        </span>
        <span className="text-sm text-ink-2">100</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={localValue}
        onChange={handleChange}
        className={cn("w-full h-3 cursor-pointer", bgColorClass)}
        style={{ accentColor: localValue >= 80 ? 'rgb(var(--success))' : localValue >= 60 ? 'rgb(var(--warning))' : localValue >= 40 ? 'rgb(var(--warning))' : 'rgb(var(--danger))' }}
      />
      <div className="flex justify-between text-xs text-ink-3">
        <span>需加强</span>
        <span>一般</span>
        <span>良好</span>
        <span>优秀</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Star Rating Component                                              */
/* ------------------------------------------------------------------ */
function StarRating({
  value,
  onChange,
  size = 20,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const labels = ['', '差', '一般', '良好', '优秀', '杰出'];

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(s)}
          onMouseEnter={() => !readOnly && setHover(s)}
          onMouseLeave={() => setHover(0)}
          className={cn(
            'p-0.5 rounded transition-all flex items-center justify-center min-h-11 min-w-11 lg:min-h-5 lg:min-w-5',
            !readOnly && 'cursor-pointer hover:bg-warning-50',
          )}
        >
          <Star
            size={size}
            className={cn(
              'transition-colors',
              (hover ? s <= hover : s <= value)
                ? 'fill-warning text-warning'
                : 'text-ink-4',
              !readOnly && (hover ? s <= hover : s <= value) && 'scale-110',
            )}
            style={{ transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          />
        </button>
      ))}
      {value > 0 && <span className="ml-1 text-xs text-ink-3">{labels[value]}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Calendar View                                                      */
/* ------------------------------------------------------------------ */
function CalendarView({
  records,
  onSelectDay,
  onSelectRecord,
}: {
  records: TeachingRecord[];
  onSelectDay: (date: string) => void;
  onSelectRecord?: (record: TeachingRecord) => void;
}) {
  // 修复(P2)：初始月份原硬编码为 new Date(2025, 0, 1)，在 2026 年打开会停在
  // 2025 年 1 月，当月的教学记录一条都看不到，需手动翻 20 个月才能回到现在。
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0, Sun=6

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const recordsByDate = useMemo(() => {
    const map: Record<string, TeachingRecord[]> = {};
    records.forEach((r) => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [records]);

  const todayStr = new Date().toISOString().split('T')[0];
  const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  const days: { date: number; dateStr: string; isCurrentMonth: boolean }[] = [];
  // Previous month padding
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevDays - i;
    const ds = new Date(year, month - 1, d).toISOString().split('T')[0];
    days.push({ date: d, dateStr: ds, isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: d, dateStr: ds, isCurrentMonth: true });
  }
  // Next month padding
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const ds = new Date(year, month + 1, d).toISOString().split('T')[0];
    days.push({ date: d, dateStr: ds, isCurrentMonth: false });
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-line">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-canvas transition-colors cursor-pointer">
            <ChevronLeft size={18} className="text-ink-2" />
          </button>
          <span className="text-base font-semibold text-ink min-w-[120px] text-center">
            {year}年 {month + 1}月
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-canvas transition-colors cursor-pointer">
            <ChevronRight size={18} className="text-ink-2" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs">今天</Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-line">
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center text-sm font-semibold text-ink-3">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const dayRecords = recordsByDate[day.dateStr] || [];
          const isToday = day.dateStr === todayStr;
          return (
            <motion.div
              key={`${day.dateStr}-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.01, duration: 0.2 }}
              onClick={() => dayRecords.length > 0 && onSelectDay(day.dateStr)}
              className={cn(
                'min-h-[100px] border-b border-r border-line p-1.5 transition-colors relative',
                day.isCurrentMonth ? 'bg-surface' : 'bg-canvas/50',
                dayRecords.length > 0 && day.isCurrentMonth && 'cursor-pointer hover:bg-canvas',
              )}
            >
              <div className="flex items-center justify-center w-7 h-7 text-sm mb-1">
                {isToday ? (
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-brand text-ink-on-dark font-medium text-xs">
                    {day.date}
                  </span>
                ) : (
                  <span className={cn('text-sm', !day.isCurrentMonth && 'text-ink-4')}>
                    {day.date}
                  </span>
                )}
              </div>
              {dayRecords.slice(0, 3).map((r, ri) => (
                <div
                  key={ri}
                  // 修复(P3)：该条目带 cursor-pointer 视觉上暗示可点击，但原来没有任何 onClick，
                  // 点了毫无反应。现在点击直接打开该条教学记录详情。
                  onClick={() => onSelectRecord?.(r)}
                  role={onSelectRecord ? 'button' : undefined}
                  tabIndex={onSelectRecord ? 0 : undefined}
                  onKeyDown={onSelectRecord ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRecord(r); } } : undefined}
                  title="点击查看该条教学记录"
                  className="text-xs truncate px-1.5 py-0.5 rounded mb-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: `${SUBJECT_COLORS[r.subject] || 'rgb(var(--brand))'}15`,
                    color: SUBJECT_COLORS[r.subject] || 'rgb(var(--brand))',
                    borderLeft: `2px solid ${SUBJECT_COLORS[r.subject] || 'rgb(var(--brand))'}`,
                  }}
                >
                  {r.student_name} · {r.subject.slice(0, 4)}
                </div>
              ))}
              {dayRecords.length > 3 && (
                <div className="text-xs text-ink-3 px-1.5">+{dayRecords.length - 3} 条</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Day Records Panel (side drawer for calendar)                       */
/* ------------------------------------------------------------------ */
function DayRecordsPanel({
  date,
  records,
  open,
  onClose,
  onViewRecord,
}: {
  date: string;
  records: TeachingRecord[];
  open: boolean;
  onClose: () => void;
  onViewRecord: (r: TeachingRecord) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0">
        <SheetHeader className="p-4 border-b border-line">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">{date} 教学记录</SheetTitle>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-canvas cursor-pointer">
              <X size={18} className="text-ink-3" />
            </button>
          </div>
          <SheetDescription>共 {records.length} 条记录</SheetDescription>
        </SheetHeader>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <AnimatePresence>
            {records.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
                className="p-3 rounded-lg border border-line bg-canvas/50 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => onViewRecord(r)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-ink">{r.student_name}</span>
                  <Badge className={cn('text-xs', SESSION_TYPE_CONFIG[r.session_type]?.className)}>
                    {r.session_type}
                  </Badge>
                </div>
                <div className="text-xs text-ink-2 mb-1">{r.subject} · {r.teacher}</div>
                <div className="text-xs text-ink-3 line-clamp-2">{r.teaching_content}</div>
                <div className="flex items-center justify-between mt-2">
                  <StarRating value={r.effectiveness_score} size={14} readOnly />
                  <span className="text-xs text-ink-3">{r.duration_minutes}分钟</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Record Form Drawer                                                 */
/* ------------------------------------------------------------------ */
function RecordFormDrawer({
  open,
  onClose,
  record,
  onSave,
  initialMode = 'full',
  students = [],
}: {
  open: boolean;
  onClose: () => void;
  record: TeachingRecord | null;
  onSave: (data: Partial<TeachingRecord>) => Promise<void>;
  initialMode?: 'quick' | 'full';
  students: StudentOption[];
}) {
  const [recordMode, setRecordMode] = useState<'quick' | 'full'>(initialMode);

  // 修复(P2)：教师默认值原为编造的「王老师」，落库后无法追溯真实授课人。
  // 改为取当前登录用户真实姓名；取不到时留空，由用户填写。
  const currentUserName = useAuthStore((s) => s.user?.name ?? '');

  // 修复(P2)：IEP 目标下拉原为写死的 8 条编造目标，改为按所选学生拉取真实计划目标。
  const [goalOptions, setGoalOptions] = useState<Array<{ value: string; label: string }>>([]);
  // 修复(探索实测 2026-10-13)：下拉 value 用目标标题，但保存 payload 从未携带
  // iep_goal_id——教师明明关联了目标，落库的教学记录却与 IEP 目标脱钩，
  // 目标视角的「教学记录证据链」断裂。此处保存 title→id 映射供提交时补挂。
  const goalIdByTitle = useRef<Record<string, string>>({});
  const [goalLoading, setGoalLoading] = useState(false);

  const [form, setForm] = useState<Partial<TeachingRecord>>({
    student_name: '',
    date: new Date().toISOString().split('T')[0],
    session_type: '个训',
    subject: '',
    iep_goal: '',
    teacher: currentUserName,
    teaching_content: '',
    teaching_method: '',
    student_performance: '',
    difficulties: '',
    adjustments: '',
    materials_used: '',
    homework: '',
    next_plan: '',
    effectiveness_score: 0,
    duration_minutes: 30,
    is_key_record: false,
  });

  // Reset form and mode when record changes or drawer opens
  useState(() => {
    if (record) {
      setForm({ ...record });
      setRecordMode('full');
    } else {
      setForm({
        student_name: '',
        date: new Date().toISOString().split('T')[0],
        session_type: '个训',
        subject: '',
        iep_goal: '',
        teacher: currentUserName,
        teaching_content: '',
        teaching_method: '',
        student_performance: '',
        difficulties: '',
        adjustments: '',
        materials_used: '',
        homework: '',
        next_plan: '',
        effectiveness_score: 0,
        duration_minutes: 30,
        is_key_record: false,
      });
      setRecordMode(initialMode);
    }
  });

  const isEditing = !!record;

  // 依赖做成稳定标量，避免 students 数组每次渲染都新建导致 effect 自激
  const studentsKey = useMemo(() => students.map((s) => String(s.id)).join(','), [students]);

  // 按所选学生拉取真实 IEP 目标：GET /iep/list?student_id= → GET /iep/get?id=
  useEffect(() => {
    let cancelled = false;
    if (!form.student_name) {
      setGoalOptions([]);
      setGoalLoading(false);
      return;
    }
    const student = students.find((s) => s.name === form.student_name);
    if (!student) {
      setGoalOptions([]);
      setGoalLoading(false);
      return;
    }
    setGoalLoading(true);
    (async () => {
      try {
        const { list } = await fetchIEPList({ student_id: String(student.id), pageSize: 20 });
        if (cancelled) return;
        const planIds = list.map((p) => p.id);
        const goals = planIds.length > 0 ? await fetchGoalsForPlans(planIds, 5) : [];
        if (cancelled) return;
        const seen = new Set<string>();
        const idMap: Record<string, string> = {};
        setGoalOptions(
          goals
            .filter((g) => !!g.title && !seen.has(g.title))
            .map((g) => {
              seen.add(g.title);
              idMap[g.title] = String(g.id);
              return { value: g.title, label: g.title };
            }),
        );
        goalIdByTitle.current = idMap;
      } catch {
        if (!cancelled) setGoalOptions([]);
      } finally {
        if (!cancelled) setGoalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.student_name, studentsKey]);

  const update = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (recordMode === 'quick') {
      // Quick mode validation: only student and iep_goal are required
      if (!form.student_name) {
        toast.error('请选择学生');
        return;
      }
      if (!form.iep_goal) {
        toast.error('请选择IEP目标');
        return;
      }
      if (!form.effectiveness_score || form.effectiveness_score === 0) {
        toast.error('请输入进度评分');
        return;
      }
      // Fill in defaults for optional fields
      const quickData: Partial<TeachingRecord> = {
        ...form,
        date: new Date().toISOString().split('T')[0],
        // 修复(P2)：原为 `|| '王老师'`，教师为空时会把编造姓名写进真实教学记录，
        // 事后无法追溯真实授课人。改为回落到当前登录用户真实姓名（仍为空则留空）。
        teacher: form.teacher || currentUserName || '',
        session_type: (form.session_type || '个训') as '个训' | '小组' | '集体' | '生活实践',
        subject: form.subject || SUBJECTS[0],
        teaching_content: form.teaching_content || `${form.student_name} 的 ${form.iep_goal} 训练记录。`,
        teaching_method: form.teaching_method || '示范教学',
        student_performance: form.student_performance || '整体表现良好，配合度较高。',
        difficulties: form.difficulties || '',
        adjustments: form.adjustments || '',
        materials_used: form.materials_used || '',
        homework: form.homework || '',
        next_plan: form.next_plan || '',
        duration_minutes: form.duration_minutes || 30,
        is_key_record: form.is_key_record || false,
        // 修复(探索实测 2026-10-13)：把所选 IEP 目标 id 带给父组件提交，
        // 否则教师关联的目标只留在 UI，落库记录与 IEP 目标脱钩
        iep_goal_id: form.iep_goal && goalIdByTitle.current[form.iep_goal]
          ? Number(goalIdByTitle.current[form.iep_goal])
          : undefined,
      };
      try {
        await onSave(quickData);
        toast.success(isEditing ? '教学记录已更新' : '快速记录已保存');
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      }
    } else {
      // Full mode validation
      if (!form.student_name || !form.teaching_content) {
        toast.error('请填写必填字段');
        return;
      }
      try {
        await onSave(form);
        toast.success(isEditing ? '教学记录已更新' : '教学记录已添加');
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className={cn(
        "p-0 overflow-y-auto",
        recordMode === 'quick' ? "w-[480px] sm:max-w-[480px]" : "w-[720px] sm:max-w-[720px]"
      )}>
        <SheetHeader className="p-6 border-b border-line">
          <SheetTitle className="text-xl">
            {isEditing ? '编辑教学记录' : recordMode === 'quick' ? '快速记录' : '录入教学记录'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? '修改教学记录信息'
              : recordMode === 'quick'
                ? '3步完成日常记录，快速又方便'
                : '填写日常教学记录、反思与效果评估'}
          </SheetDescription>
        </SheetHeader>

        {/* Mode Toggle Tabs */}
        {!isEditing && (
          <div className="px-6 pt-4">
            <div className="inline-flex rounded-lg border border-line overflow-hidden w-full">
              <button
                type="button"
                onClick={() => setRecordMode('quick')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  recordMode === 'quick'
                    ? 'bg-warning text-ink-on-dark'
                    : 'bg-surface text-ink-2 hover:bg-canvas'
                )}
              >
                <Zap size={16} /> 快速记录
              </button>
              <button
                type="button"
                onClick={() => setRecordMode('full')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  recordMode === 'full'
                    ? 'bg-brand text-ink-on-dark'
                    : 'bg-surface text-ink-2 hover:bg-canvas'
                )}
              >
                <BookPlus size={16} /> 完整记录
              </button>
            </div>
          </div>
        )}

        {recordMode === 'quick' ? (
          /* ======================== */
          /*  Quick Mode Form         */
          /* ======================== */
          <div className="p-6 space-y-8">
            {/* Student Select */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-3"
            >
              <label className="block text-base font-semibold text-ink">
                学生 <span className="text-danger">*</span>
              </label>
              <Select value={form.student_name} onValueChange={(v) => update('student_name', v)}>
                <SelectTrigger className="w-full h-12 text-base">
                  <SelectValue placeholder="选择学生" />
                </SelectTrigger>
                <SelectContent>
                  {students.length > 0 ? students.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : <div className="px-2 py-2 text-xs text-ink-3">暂无可选学生</div>}
                </SelectContent>
              </Select>
            </motion.div>

            {/* IEP Goal Select */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-3"
            >
              <label className="block text-base font-semibold text-ink">
                IEP 目标 <span className="text-danger">*</span>
              </label>
              <Select
                value={form.iep_goal}
                onValueChange={(v) => update('iep_goal', v)}
                disabled={!form.student_name || goalOptions.length === 0}
              >
                <SelectTrigger className="w-full h-12 text-base">
                  <SelectValue placeholder="选择IEP目标" />
                </SelectTrigger>
                <SelectContent>
                  {goalOptions.length > 0 ? (
                    goalOptions.map((g) => (<SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>))
                  ) : (
                    <div className="px-2 py-2 text-xs text-ink-3">
                      {!form.student_name ? '请先选择学生' : goalLoading ? '正在加载该学生的 IEP 目标…' : '该学生暂无 IEP 目标'}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </motion.div>

            {/* Score / Progress Slider */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-3"
            >
              <label className="block text-base font-semibold text-ink">
                进度评分 <span className="text-danger">*</span>
                <span className="ml-2 text-xs text-ink-3 font-normal">0-100 分</span>
              </label>
              <div className="p-4 rounded-xl bg-canvas border border-line">
                <ScoreSlider
                  value={form.effectiveness_score || 0}
                  onChange={(v) => update('effectiveness_score', v)}
                />
              </div>
            </motion.div>

            {/* Key Notes */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              <label className="block text-base font-semibold text-ink">
                关键备注 <span className="text-ink-3 font-normal text-sm">（可选）</span>
              </label>
              <Textarea
                value={form.teaching_content || ''}
                onChange={(e) => update('teaching_content', e.target.value)}
                placeholder="简短描述今天的教学要点..."
                className="min-h-[80px] text-base"
              />
            </motion.div>

            {/* Is Key Record Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="flex items-center justify-between p-4 rounded-xl bg-canvas border border-line"
            >
              <div className="flex items-center gap-3">
                <Star size={20} className={cn(
                  form.is_key_record ? 'fill-warning text-warning' : 'text-ink-4'
                )} />
                <div>
                  <div className="text-sm font-semibold text-ink">标记为关键记录</div>
                  <div className="text-xs text-ink-3">关键记录会高亮显示，便于后续回顾</div>
                </div>
              </div>
              <Switch
                checked={form.is_key_record || false}
                onCheckedChange={(v) => update('is_key_record', v)}
              />
            </motion.div>
          </div>
        ) : (
          /* ======================== */
          /*  Full Mode Form          */
          /* ======================== */
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-line">基本信息</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">学生 <span className="text-danger">*</span></label>
                  <Select value={form.student_name} onValueChange={(v) => update('student_name', v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择学生" /></SelectTrigger>
                    <SelectContent>
                      {students.length > 0 ? students.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : <div className="px-2 py-2 text-xs text-ink-3">暂无可选学生</div>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">记录日期 <span className="text-danger">*</span></label>
                  <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">记录类型 <span className="text-danger">*</span></label>
                  <Select value={form.session_type} onValueChange={(v) => update('session_type', v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </motion.div>

            {/* IEP Goal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-line">IEP目标关联</h3>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">关联IEP目标（可选）</label>
                <Select
                  value={form.iep_goal}
                  onValueChange={(v) => update('iep_goal', v)}
                  disabled={!form.student_name || goalOptions.length === 0}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择IEP目标" /></SelectTrigger>
                  <SelectContent>
                    {goalOptions.length > 0 ? (
                      goalOptions.map((g) => (<SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>))
                    ) : (
                      <div className="px-2 py-2 text-xs text-ink-3">
                        {!form.student_name ? '请先选择学生' : goalLoading ? '正在加载该学生的 IEP 目标…' : '该学生暂无 IEP 目标'}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>

            {/* Subject */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-line">教学内容</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">学科/领域 <span className="text-danger">*</span></label>
                    <Select value={form.subject} onValueChange={(v) => update('subject', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="选择学科" /></SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">时长（分钟）</label>
                    <Input type="number" value={form.duration_minutes} onChange={(e) => update('duration_minutes', Number(e.target.value))} min={5} max={240} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">教学过程描述 <span className="text-danger">*</span></label>
                  <Textarea
                    value={form.teaching_content}
                    onChange={(e) => update('teaching_content', e.target.value)}
                    placeholder="描述本次教学的具体过程、使用的教具、学生的反应..."
                    className="min-h-[120px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">教学方法</label>
                  <Input value={form.teaching_method} onChange={(e) => update('teaching_method', e.target.value)} placeholder="如：示范教学、游戏教学、情景教学..." />
                </div>
              </div>
            </motion.div>

            {/* Reflection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-line">教学反思</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">教学效果 <span className="text-danger">*</span></label>
                  <StarRating
                    value={form.effectiveness_score || 0}
                    onChange={(v) => update('effectiveness_score', v)}
                    size={28}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">学生表现 <span className="text-danger">*</span></label>
                  <Textarea
                    value={form.student_performance}
                    onChange={(e) => update('student_performance', e.target.value)}
                    placeholder="描述学生在本次教学中的表现、进步、困难..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">遇到的困难</label>
                    <Textarea
                      value={form.difficulties}
                      onChange={(e) => update('difficulties', e.target.value)}
                      placeholder="学生遇到的困难..."
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">调整策略</label>
                    <Textarea
                      value={form.adjustments}
                      onChange={(e) => update('adjustments', e.target.value)}
                      placeholder="针对困难的调整策略..."
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Other */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-line">其他</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">使用教具</label>
                    <Input value={form.materials_used} onChange={(e) => update('materials_used', e.target.value)} placeholder="使用的教学材料..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">课后作业</label>
                    <Input value={form.homework} onChange={(e) => update('homework', e.target.value)} placeholder="布置的课后作业..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">下次计划</label>
                  <Input value={form.next_plan} onChange={(e) => update('next_plan', e.target.value)} placeholder="下次教学的计划安排..." />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_key_record || false}
                    onCheckedChange={(v) => update('is_key_record', v)}
                  />
                  <label className="text-sm text-ink">标记为关键记录</label>
                  {form.is_key_record && <Star size={16} className="fill-warning text-warning" />}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        <SheetFooter className="border-t border-line p-6">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSave}
            className={cn(
              'text-ink-on-dark',
              recordMode === 'quick'
                ? 'bg-warning hover:bg-warning-strong'
                : 'bg-brand hover:bg-brand-strong'
            )}
          >
            {recordMode === 'quick' ? (
              <><Zap size={16} className="mr-1" /> 快速保存</>
            ) : (
              <>{isEditing ? '保存修改' : '提交记录'}</>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Record Detail Drawer                                               */
/* ------------------------------------------------------------------ */
function RecordDetailDrawer({
  open,
  onClose,
  record,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  record: TeachingRecord | null;
  onEdit: (r: TeachingRecord) => void;
}) {
  if (!record) return null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 overflow-y-auto">
        <SheetHeader className="p-6 border-b border-line">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={SESSION_TYPE_CONFIG[record.session_type]?.className}>
              {record.session_type}
            </Badge>
            {record.is_key_record && (
              <Badge className="bg-warning-50 text-warning-600">
                <Star size={12} className="fill-warning text-warning mr-1" />
                关键记录
              </Badge>
            )}
          </div>
          <SheetTitle className="text-lg">{record.subject} · {record.student_name}</SheetTitle>
          <SheetDescription>
            {record.date} · {record.teacher} · {record.duration_minutes}分钟
          </SheetDescription>
        </SheetHeader>

        <div className="p-6 space-y-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-sm font-bold text-brand-ink">
                {record.student_name[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">{record.student_name}</div>
                <div className="text-xs text-ink-3">{record.iep_goal}</div>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
            <div className="p-4 rounded-lg bg-canvas">
              <h4 className="text-sm font-semibold text-ink mb-2">教学过程</h4>
              <p className="text-sm text-ink-2 leading-relaxed">{record.teaching_content}</p>
            </div>
            <div className="p-4 rounded-lg bg-canvas">
              <h4 className="text-sm font-semibold text-ink mb-2">教学方法</h4>
              <p className="text-sm text-ink-2">{record.teaching_method || '—'}</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
            <h4 className="text-sm font-semibold text-ink">教学反思</h4>
            <div className="flex items-center gap-2">
              <StarRating value={record.effectiveness_score} size={18} readOnly />
              <span className="text-sm text-ink-2">{record.effectiveness_score} 分</span>
            </div>
            <div className="p-4 rounded-lg bg-canvas">
              <div className="text-xs text-ink-3 mb-1">学生表现</div>
              <p className="text-sm text-ink-2">{record.student_performance}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-canvas">
                <div className="text-xs text-ink-3 mb-1">遇到的困难</div>
                <p className="text-sm text-ink-2">{record.difficulties || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-canvas">
                <div className="text-xs text-ink-3 mb-1">调整策略</div>
                <p className="text-sm text-ink-2">{record.adjustments || '—'}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
            <h4 className="text-sm font-semibold text-ink">其他信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-canvas">
                <div className="text-xs text-ink-3 mb-1">使用教具</div>
                <p className="text-sm text-ink-2">{record.materials_used || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-canvas">
                <div className="text-xs text-ink-3 mb-1">课后作业</div>
                <p className="text-sm text-ink-2">{record.homework || '—'}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-canvas">
              <div className="text-xs text-ink-3 mb-1">下次计划</div>
              <p className="text-sm text-ink-2">{record.next_plan || '—'}</p>
            </div>
          </motion.div>
        </div>

        <SheetFooter className="border-t border-line p-6">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button onClick={() => onEdit(record)} className="bg-brand hover:bg-brand-strong text-ink-on-dark">
            <Pencil size={16} className="mr-1" /> 编辑
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Teaching Page                                                 */
/* ------------------------------------------------------------------ */
export default function Teaching() {
  // P0-2 修复：改为订阅 authStore，登录/权限变化后自动刷新
  const config = useDataScopeConfig();
  const readOnly = useIsReadOnly();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [records, setRecords] = useState<TeachingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);

  // 从后端加载真实教学记录与学生选项（后端已按数据范围过滤）
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // 2026-10-16：教学记录表是客户端分页，pageSize:200 会让第 201 条起的
        // 记录静默消失（后端已按数据范围过滤，这里只解决「取不全」）
        const [list, options] = await Promise.all([
          fetchAllPages((page, pageSize) => fetchTeachingRecords({ page, pageSize })),
          fetchStudentOptions(),
        ]);
        if (!active) return;
        // 后端已完成数据范围过滤，这里按 teacher 名称做前端兜底过滤（保持原语义）
        const scoped = filterByDataScope(
          list,
          (r) => normalizeStudentId(r.student_id),
          undefined,
          (r) => teacherNameToId[r.teacher] || undefined,
        );
        setRecords(scoped);
        setStudentOptions(options);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '教学记录加载失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [sessionTypeFilter, setSessionTypeFilter] = useState('all');
  const [keyOnlyFilter, setKeyOnlyFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Drawer states
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TeachingRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<TeachingRecord | null>(null);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');

  // Quick record mode state
  const [recordMode, setRecordMode] = useState<'quick' | 'full'>('quick');

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (search && !r.student_name.includes(search) && !r.teacher.includes(search) && !r.teaching_content.includes(search)) return false;
      if (studentFilter !== 'all' && r.student_name !== studentFilter) return false;
      if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
      if (sessionTypeFilter !== 'all' && r.session_type !== sessionTypeFilter) return false;
      if (keyOnlyFilter && !r.is_key_record) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
  }, [records, search, studentFilter, subjectFilter, sessionTypeFilter, keyOnlyFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelect = (id: string) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === paginatedRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(paginatedRecords.map((r) => r.id)));
    }
  };

  const handleSaveRecord = async (data: Partial<TeachingRecord>) => {
    const studentName = data.student_name || '';
    const opt = studentOptions.find((o) => o.name === studentName);
    if (!opt) {
      toast.error('请选择有效学生');
      return;
    }
    const payload = {
      student_id: Number(opt.id),
      record_date: data.date || new Date().toISOString().split('T')[0],
      session_type: data.session_type,
      subject: data.subject,
      teaching_content: data.teaching_content,
      teaching_method: data.teaching_method,
      student_performance: data.student_performance,
      difficulties: data.difficulties,
      adjustments: data.adjustments,
      materials_used: data.materials_used,
      homework: data.homework,
      next_plan: data.next_plan,
      effectiveness_score: data.effectiveness_score,
      duration_minutes: data.duration_minutes,
      is_key_record: data.is_key_record,
      // 修复(探索实测 2026-10-13)：子组件构造数据时已带所选 IEP 目标 id（iep_goal_id），
      // 否则教师关联的目标只留在 UI，落库记录与 IEP 目标脱钩，目标视角证据链断裂
      iep_goal_id: (data as Partial<TeachingRecord> & { iep_goal_id?: number | null }).iep_goal_id ?? undefined,
    };
    try {
      if (editingRecord) {
        await updateTeachingRecord(editingRecord.id, payload);
      } else {
        await createTeachingRecord(payload);
      }
      const refreshed = await fetchTeachingRecords({ pageSize: 200 });
      const scoped = filterByDataScope(
        refreshed.list,
        (r) => normalizeStudentId(r.student_id),
        undefined,
        (r) => teacherNameToId[r.teacher] || undefined,
      );
      setRecords(scoped);
      setEditingRecord(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
      throw e;
    }
  };

  const confirm = useConfirm();

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '删除这条教学记录？',
      description: (
        <>
          删除后该次授课的试次与评分将一并消失，
          <b className="text-danger-strong">不可撤销</b>
          ，也会影响目标掌握度的统计。
        </>
      ),
      confirmText: '删除记录',
    });
    if (!ok) return;
    try {
      await deleteTeachingRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast.success('记录已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleDaySelect = (date: string) => {
    setSelectedDay(date);
    setDayPanelOpen(true);
  };

  const handleViewRecord = (r: TeachingRecord) => {
    setDetailRecord(r);
    setDetailOpen(true);
  };

  const dayRecords = useMemo(() => {
    return records.filter((r) => r.date === selectedDay);
  }, [records, selectedDay]);

  const handleEditFromDetail = (r: TeachingRecord) => {
    setDetailOpen(false);
    setEditingRecord(r);
    setFormOpen(true);
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6"
      >
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold text-ink leading-tight whitespace-nowrap">教学记录</h1>
          <p className="text-sm text-ink-2 mt-1">日常教学记录、反思与效果评估</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Record Button */}
          {!readOnly && (
            <>
              <Button
                onClick={() => {
                  setEditingRecord(null);
                  setRecordMode('quick');
                  setFormOpen(true);
                }}
                className="h-11 lg:h-10 bg-warning hover:bg-warning-strong text-ink-on-dark gap-2"
              >
                <Zap size={18} /> 快速记录
              </Button>
              {/* Full Record Button */}
              <Button
                onClick={() => {
                  setEditingRecord(null);
                  setRecordMode('full');
                  setFormOpen(true);
                }}
                className="h-11 lg:h-10 bg-brand hover:bg-brand-strong text-ink-on-dark gap-2"
              >
                <BookPlus size={18} /> 录入教学记录
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface rounded-lg p-4 mb-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              placeholder="搜索学生、教师、内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[240px] pl-9"
            />
          </div>
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="学生" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部学生</SelectItem>
              {studentOptions.length > 0 ? studentOptions.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : <div className="px-2 py-2 text-xs text-ink-3">暂无可选学生</div>}
            </SelectContent>
          </Select>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="学科" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部学科</SelectItem>
              {SUBJECTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={sessionTypeFilter} onValueChange={setSessionTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="记录类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {SESSION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[130px]" />
            <span className="text-ink-3">-</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[130px]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
            <label className="flex items-center gap-1.5 text-sm text-ink-2 cursor-pointer whitespace-nowrap">
              <Checkbox checked={keyOnlyFilter} onCheckedChange={(v) => setKeyOnlyFilter(v === true)} />
              仅关键记录
            </label>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStudentFilter('all'); setSubjectFilter('all'); setSessionTypeFilter('all'); setKeyOnlyFilter(false); setDateFrom(''); setDateTo(''); }}>
              <RotateCcw size={14} className="mr-1" /> 重置
            </Button>
            <ImportExportActions
              module="teaching"
              filenameBase="教学记录"
              readOnly={readOnly}
              exportParams={{
                student_id:
                  studentFilter !== 'all'
                    ? Number(studentOptions.find((o) => o.name === studentFilter)?.id) || undefined
                    : undefined,
                session_type: sessionTypeFilter !== 'all' ? sessionTypeFilter : undefined,
                start_date: dateFrom || undefined,
                end_date: dateTo || undefined,
              }}
              onImported={() => {
                void (async () => {
                  try {
                    const refreshed = await fetchTeachingRecords({ pageSize: 200 });
                    const scoped = filterByDataScope(
                      refreshed.list,
                      (r) => normalizeStudentId(r.student_id),
                      undefined,
                      (r) => teacherNameToId[r.teacher] || undefined,
                    );
                    setRecords(scoped);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : '导入后刷新失败');
                  }
                })();
              }}
            />
          </div>
        </div>
      </motion.div>

      {/* View Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex justify-end mb-4"
      >
        <div className="inline-flex rounded-md border border-line overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer min-h-11 lg:min-h-8',
              viewMode === 'list' ? 'bg-brand text-ink-on-dark' : 'bg-surface text-ink-2 hover:bg-canvas',
            )}
          >
            <LayoutList size={16} /> 列表
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer min-h-11 lg:min-h-8',
              viewMode === 'calendar' ? 'bg-brand text-ink-on-dark' : 'bg-surface text-ink-2 hover:bg-canvas',
            )}
          >
            <CalendarIcon size={16} /> 日历
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-canvas hover:bg-canvas">
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedRecords.size === paginatedRecords.length && paginatedRecords.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">日期</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">学生</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">IEP目标</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">记录类型</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">效果评分</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold">关键</TableHead>
                    <TableHead className="text-xs text-ink-3 font-semibold text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16">
                        <BookOpen size={48} className="mx-auto text-ink-4 mb-3" />
                        <h4 className="text-base font-semibold text-ink mb-1">暂无教学记录</h4>
                        <p className="text-sm text-ink-2 mb-3">{readOnly ? '暂无可见的教学记录' : '点击上方按钮录入第一条记录'}</p>
                        {!readOnly && (
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              onClick={() => { setEditingRecord(null); setRecordMode('quick'); setFormOpen(true); }}
                              className="bg-warning hover:bg-warning-strong text-ink-on-dark"
                            >
                              <Zap size={16} className="mr-1" /> 快速记录
                            </Button>
                            <Button
                              onClick={() => { setEditingRecord(null); setRecordMode('full'); setFormOpen(true); }}
                              className="bg-brand hover:bg-brand-strong text-ink-on-dark"
                            >
                              <BookPlus size={16} className="mr-1" /> 录入教学记录
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRecords.map((record, idx) => (
                      <motion.tr
                        key={record.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="border-b border-line hover:bg-canvas transition-colors"
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRecords.has(record.id)}
                            onCheckedChange={() => toggleSelect(record.id)}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-ink">{record.date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-brand-ink">
                              {record.student_name[0]}
                            </div>
                            <span className="text-sm font-medium text-ink">{record.student_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-ink-2 max-w-[200px] truncate" title={record.iep_goal}>
                          {record.iep_goal}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs font-normal', SESSION_TYPE_CONFIG[record.session_type]?.className)}>
                            {record.session_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StarRating value={record.effectiveness_score} size={14} readOnly />
                        </TableCell>
                        <TableCell>
                          {record.is_key_record ? (
                            <Star size={16} className="fill-warning text-warning" />
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label="查看记录" title="查看" className="h-11 w-11 lg:h-8 lg:w-8 p-0" onClick={() => handleViewRecord(record)}>
                              <Eye size={14} className="text-ink-2" />
                            </Button>
                            {!readOnly && (
                              <>
                                <Button variant="ghost" size="sm" aria-label="编辑记录" title="编辑" className="h-11 w-11 lg:h-8 lg:w-8 p-0" onClick={() => { setEditingRecord(record); setFormOpen(true); }}>
                                  <Pencil size={14} className="text-ink-2" />
                                </Button>
                                <Button variant="ghost" size="sm" aria-label="删除记录" title="删除" className="h-11 w-11 lg:h-8 lg:w-8 p-0" onClick={() => handleDelete(record.id)}>
                                  <X size={14} className="text-danger" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {paginatedRecords.length > 0 && (
                <Pagination
                  className="px-4 py-3 border-t border-line"
                  page={currentPage}
                  totalPages={totalPages}
                  onChange={setCurrentPage}
                  summary={`共 ${filteredRecords.length} 条`}
                  trailing={
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                    >
                      <SelectTrigger className="w-[92px] h-10 lg:h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 条/页</SelectItem>
                        <SelectItem value="20">20 条/页</SelectItem>
                        <SelectItem value="50">50 条/页</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="calendar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CalendarView
              records={filteredRecords}
              onSelectDay={handleDaySelect}
              onSelectRecord={handleViewRecord}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawers */}
      <RecordFormDrawer
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingRecord(null); }}
        record={editingRecord}
        onSave={handleSaveRecord}
        initialMode={recordMode}
        students={studentOptions}
      />
      <RecordDetailDrawer
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailRecord(null); }}
        record={detailRecord}
        onEdit={handleEditFromDetail}
      />
      <DayRecordsPanel
        date={selectedDay}
        records={dayRecords}
        open={dayPanelOpen}
        onClose={() => setDayPanelOpen(false)}
        onViewRecord={(r) => { setDetailRecord(r); setDetailOpen(true); }}
      />
    </div>
  );
}
