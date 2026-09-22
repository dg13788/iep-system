import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchTeachingRecords, fetchStudentOptions, createTeachingRecord,
  updateTeachingRecord, deleteTeachingRecord, type StudentOption,
} from '@/services/teaching';
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
import ImportExportActions from '@/components/io/ImportExportActions';

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
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */
const STUDENTS = ['王小明', '李小红', '张小刚', '赵小芳', '陈小华', '刘小军', '孙小丽', '周小强'];
const TEACHERS = ['王老师', '李老师', '张老师', '赵老师'];
const IEP_GOALS = [
  '提升语言表达能力（词组到短句）',
  '增强社交互动技能',
  '提高生活自理能力（穿衣）',
  '改善精细动作协调性',
  '培养情绪管理能力',
  '提升注意力持续时间',
  '增强数概念理解',
  '改善大肌肉运动能力',
];
const SUBJECTS = ['语言训练', '社交训练', '生活自理', '认知训练', '感觉统合', '精细动作', '音乐治疗', '美术创作'];
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
  '语言训练': '#977653',
  '社交训练': '#3B82F6',
  '生活自理': '#10B981',
  '认知训练': '#F59E0B',
  '感觉统合': '#8B5CF6',
  '精细动作': '#EC4899',
  '音乐治疗': '#06B6D4',
  '美术创作': '#F97316',
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
    localValue >= 80 ? 'text-[#10B981]' :
    localValue >= 60 ? 'text-[#F59E0B]' :
    localValue >= 40 ? 'text-[#F97316]' :
    'text-[#EF4444]';

  const bgColorClass =
    localValue >= 80 ? 'accent-[#10B981]' :
    localValue >= 60 ? 'accent-[#F59E0B]' :
    localValue >= 40 ? 'accent-[#F97316]' :
    'accent-[#EF4444]';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#64748B]">0</span>
        <span className={cn("text-2xl font-bold transition-colors", colorClass)}>
          {localValue}
        </span>
        <span className="text-sm text-[#64748B]">100</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={localValue}
        onChange={handleChange}
        className={cn("w-full h-3 cursor-pointer", bgColorClass)}
        style={{ accentColor: localValue >= 80 ? '#10B981' : localValue >= 60 ? '#F59E0B' : localValue >= 40 ? '#F97316' : '#EF4444' }}
      />
      <div className="flex justify-between text-xs text-[#94A3B8]">
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
            'p-0.5 rounded transition-all',
            !readOnly && 'cursor-pointer hover:bg-warning-50',
          )}
        >
          <Star
            size={size}
            className={cn(
              'transition-colors',
              (hover ? s <= hover : s <= value)
                ? 'fill-[#F59E0B] text-[#F59E0B]'
                : 'text-[#CBD5E1]',
              !readOnly && (hover ? s <= hover : s <= value) && 'scale-110',
            )}
            style={{ transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          />
        </button>
      ))}
      {value > 0 && <span className="ml-1 text-xs text-[#94A3B8]">{labels[value]}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Calendar View                                                      */
/* ------------------------------------------------------------------ */
function CalendarView({
  records,
  onSelectDay,
}: {
  records: TeachingRecord[];
  onSelectDay: (date: string) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 0, 1));

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
    <div className="bg-white rounded-xl shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[#F7F6F4] transition-colors cursor-pointer">
            <ChevronLeft size={18} className="text-[#64748B]" />
          </button>
          <span className="text-base font-semibold text-[#1E293B] min-w-[120px] text-center">
            {year}年 {month + 1}月
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[#F7F6F4] transition-colors cursor-pointer">
            <ChevronRight size={18} className="text-[#64748B]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs">今天</Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-[#E2E8F0]">
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center text-sm font-semibold text-[#94A3B8]">
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
                'min-h-[100px] border-b border-r border-[#E2E8F0] p-1.5 transition-colors relative',
                day.isCurrentMonth ? 'bg-white' : 'bg-[#F7F6F4]/50',
                dayRecords.length > 0 && day.isCurrentMonth && 'cursor-pointer hover:bg-[#F7F6F4]',
              )}
            >
              <div className="flex items-center justify-center w-7 h-7 text-sm mb-1">
                {isToday ? (
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-[#977653] text-white font-medium text-xs">
                    {day.date}
                  </span>
                ) : (
                  <span className={cn('text-sm', !day.isCurrentMonth && 'text-[#CBD5E1]')}>
                    {day.date}
                  </span>
                )}
              </div>
              {dayRecords.slice(0, 3).map((r, ri) => (
                <div
                  key={ri}
                  className="text-xs truncate px-1.5 py-0.5 rounded mb-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: `${SUBJECT_COLORS[r.subject] || '#977653'}15`,
                    color: SUBJECT_COLORS[r.subject] || '#977653',
                    borderLeft: `2px solid ${SUBJECT_COLORS[r.subject] || '#977653'}`,
                  }}
                >
                  {r.student_name} · {r.subject.slice(0, 4)}
                </div>
              ))}
              {dayRecords.length > 3 && (
                <div className="text-xs text-[#94A3B8] px-1.5">+{dayRecords.length - 3} 条</div>
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
        <SheetHeader className="p-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">{date} 教学记录</SheetTitle>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-[#F7F6F4] cursor-pointer">
              <X size={18} className="text-[#94A3B8]" />
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
                className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F7F6F4]/50 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => onViewRecord(r)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[#1E293B]">{r.student_name}</span>
                  <Badge className={cn('text-xs', SESSION_TYPE_CONFIG[r.session_type]?.className)}>
                    {r.session_type}
                  </Badge>
                </div>
                <div className="text-xs text-[#64748B] mb-1">{r.subject} · {r.teacher}</div>
                <div className="text-xs text-[#94A3B8] line-clamp-2">{r.teaching_content}</div>
                <div className="flex items-center justify-between mt-2">
                  <StarRating value={r.effectiveness_score} size={14} readOnly />
                  <span className="text-xs text-[#94A3B8]">{r.duration_minutes}分钟</span>
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

  const [form, setForm] = useState<Partial<TeachingRecord>>({
    student_name: '',
    date: new Date().toISOString().split('T')[0],
    session_type: '个训',
    subject: '',
    iep_goal: '',
    teacher: '王老师',
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
        teacher: '王老师',
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
        teacher: form.teacher || '王老师',
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
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
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
            <div className="inline-flex rounded-lg border border-[#E2E8F0] overflow-hidden w-full">
              <button
                type="button"
                onClick={() => setRecordMode('quick')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  recordMode === 'quick'
                    ? 'bg-[#F97316] text-white'
                    : 'bg-white text-[#64748B] hover:bg-[#F7F6F4]'
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
                    ? 'bg-[#977653] text-white'
                    : 'bg-white text-[#64748B] hover:bg-[#F7F6F4]'
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
              <label className="block text-base font-semibold text-[#1E293B]">
                学生 <span className="text-[#EF4444]">*</span>
              </label>
              <Select value={form.student_name} onValueChange={(v) => update('student_name', v)}>
                <SelectTrigger className="w-full h-12 text-base">
                  <SelectValue placeholder="选择学生" />
                </SelectTrigger>
                <SelectContent>
                  {students.length > 0 ? students.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
              <label className="block text-base font-semibold text-[#1E293B]">
                IEP 目标 <span className="text-[#EF4444]">*</span>
              </label>
              <Select value={form.iep_goal} onValueChange={(v) => update('iep_goal', v)}>
                <SelectTrigger className="w-full h-12 text-base">
                  <SelectValue placeholder="选择IEP目标" />
                </SelectTrigger>
                <SelectContent>
                  {IEP_GOALS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
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
              <label className="block text-base font-semibold text-[#1E293B]">
                进度评分 <span className="text-[#EF4444]">*</span>
                <span className="ml-2 text-xs text-[#94A3B8] font-normal">0-100 分</span>
              </label>
              <div className="p-4 rounded-xl bg-[#F7F6F4] border border-[#E2E8F0]">
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
              <label className="block text-base font-semibold text-[#1E293B]">
                关键备注 <span className="text-[#94A3B8] font-normal text-sm">（可选）</span>
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
              className="flex items-center justify-between p-4 rounded-xl bg-[#F7F6F4] border border-[#E2E8F0]"
            >
              <div className="flex items-center gap-3">
                <Star size={20} className={cn(
                  form.is_key_record ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-[#CBD5E1]'
                )} />
                <div>
                  <div className="text-sm font-semibold text-[#1E293B]">标记为关键记录</div>
                  <div className="text-xs text-[#94A3B8]">关键记录会高亮显示，便于后续回顾</div>
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
              <h3 className="text-sm font-semibold text-[#1E293B] mb-3 pb-2 border-b border-[#E2E8F0]">基本信息</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学生 <span className="text-[#EF4444]">*</span></label>
                  <Select value={form.student_name} onValueChange={(v) => update('student_name', v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择学生" /></SelectTrigger>
                    <SelectContent>
                      {students.length > 0 ? students.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">记录日期 <span className="text-[#EF4444]">*</span></label>
                  <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">记录类型 <span className="text-[#EF4444]">*</span></label>
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
              <h3 className="text-sm font-semibold text-[#1E293B] mb-3 pb-2 border-b border-[#E2E8F0]">IEP目标关联</h3>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1.5">关联IEP目标（可选）</label>
                <Select value={form.iep_goal} onValueChange={(v) => update('iep_goal', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择IEP目标" /></SelectTrigger>
                  <SelectContent>
                    {IEP_GOALS.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
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
              <h3 className="text-sm font-semibold text-[#1E293B] mb-3 pb-2 border-b border-[#E2E8F0]">教学内容</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学科/领域 <span className="text-[#EF4444]">*</span></label>
                    <Select value={form.subject} onValueChange={(v) => update('subject', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="选择学科" /></SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">时长（分钟）</label>
                    <Input type="number" value={form.duration_minutes} onChange={(e) => update('duration_minutes', Number(e.target.value))} min={5} max={240} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教学过程描述 <span className="text-[#EF4444]">*</span></label>
                  <Textarea
                    value={form.teaching_content}
                    onChange={(e) => update('teaching_content', e.target.value)}
                    placeholder="描述本次教学的具体过程、使用的教具、学生的反应..."
                    className="min-h-[120px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教学方法</label>
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
              <h3 className="text-sm font-semibold text-[#1E293B] mb-3 pb-2 border-b border-[#E2E8F0]">教学反思</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">教学效果 <span className="text-[#EF4444]">*</span></label>
                  <StarRating
                    value={form.effectiveness_score || 0}
                    onChange={(v) => update('effectiveness_score', v)}
                    size={28}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">学生表现 <span className="text-[#EF4444]">*</span></label>
                  <Textarea
                    value={form.student_performance}
                    onChange={(e) => update('student_performance', e.target.value)}
                    placeholder="描述学生在本次教学中的表现、进步、困难..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">遇到的困难</label>
                    <Textarea
                      value={form.difficulties}
                      onChange={(e) => update('difficulties', e.target.value)}
                      placeholder="学生遇到的困难..."
                      className="min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">调整策略</label>
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
              <h3 className="text-sm font-semibold text-[#1E293B] mb-3 pb-2 border-b border-[#E2E8F0]">其他</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">使用教具</label>
                    <Input value={form.materials_used} onChange={(e) => update('materials_used', e.target.value)} placeholder="使用的教学材料..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1.5">课后作业</label>
                    <Input value={form.homework} onChange={(e) => update('homework', e.target.value)} placeholder="布置的课后作业..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1.5">下次计划</label>
                  <Input value={form.next_plan} onChange={(e) => update('next_plan', e.target.value)} placeholder="下次教学的计划安排..." />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_key_record || false}
                    onCheckedChange={(v) => update('is_key_record', v)}
                  />
                  <label className="text-sm text-[#1E293B]">标记为关键记录</label>
                  {form.is_key_record && <Star size={16} className="fill-[#F59E0B] text-[#F59E0B]" />}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        <SheetFooter className="border-t border-[#E2E8F0] p-6">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSave}
            className={cn(
              'text-white',
              recordMode === 'quick'
                ? 'bg-[#F97316] hover:bg-[#EA580C]'
                : 'bg-[#977653] hover:bg-[#7A5F42]'
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
        <SheetHeader className="p-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={SESSION_TYPE_CONFIG[record.session_type]?.className}>
              {record.session_type}
            </Badge>
            {record.is_key_record && (
              <Badge className="bg-warning-50 text-warning-600">
                <Star size={12} className="fill-[#F59E0B] text-[#F59E0B] mr-1" />
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
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-sm font-bold text-[#977653]">
                {record.student_name[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1E293B]">{record.student_name}</div>
                <div className="text-xs text-[#94A3B8]">{record.iep_goal}</div>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <h4 className="text-sm font-semibold text-[#1E293B] mb-2">教学过程</h4>
              <p className="text-sm text-[#64748B] leading-relaxed">{record.teaching_content}</p>
            </div>
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <h4 className="text-sm font-semibold text-[#1E293B] mb-2">教学方法</h4>
              <p className="text-sm text-[#64748B]">{record.teaching_method || '—'}</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
            <h4 className="text-sm font-semibold text-[#1E293B]">教学反思</h4>
            <div className="flex items-center gap-2">
              <StarRating value={record.effectiveness_score} size={18} readOnly />
              <span className="text-sm text-[#64748B]">{record.effectiveness_score} 分</span>
            </div>
            <div className="p-4 rounded-lg bg-[#F7F6F4]">
              <div className="text-xs text-[#94A3B8] mb-1">学生表现</div>
              <p className="text-sm text-[#64748B]">{record.student_performance}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#F7F6F4]">
                <div className="text-xs text-[#94A3B8] mb-1">遇到的困难</div>
                <p className="text-sm text-[#64748B]">{record.difficulties || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F4]">
                <div className="text-xs text-[#94A3B8] mb-1">调整策略</div>
                <p className="text-sm text-[#64748B]">{record.adjustments || '—'}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
            <h4 className="text-sm font-semibold text-[#1E293B]">其他信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#F7F6F4]">
                <div className="text-xs text-[#94A3B8] mb-1">使用教具</div>
                <p className="text-sm text-[#64748B]">{record.materials_used || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F6F4]">
                <div className="text-xs text-[#94A3B8] mb-1">课后作业</div>
                <p className="text-sm text-[#64748B]">{record.homework || '—'}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F7F6F4]">
              <div className="text-xs text-[#94A3B8] mb-1">下次计划</div>
              <p className="text-sm text-[#64748B]">{record.next_plan || '—'}</p>
            </div>
          </motion.div>
        </div>

        <SheetFooter className="border-t border-[#E2E8F0] p-6">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button onClick={() => onEdit(record)} className="bg-[#977653] hover:bg-[#7A5F42] text-white">
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
        const [listResult, options] = await Promise.all([
          fetchTeachingRecords({ pageSize: 200 }),
          fetchStudentOptions(),
        ]);
        if (!active) return;
        // 后端已完成数据范围过滤，这里按 teacher 名称做前端兜底过滤（保持原语义）
        const scoped = filterByDataScope(
          listResult.list,
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

  const handleDelete = async (id: string) => {
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
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-[28px] font-bold text-[#1E293B] leading-tight">教学记录</h1>
          <p className="text-sm text-[#64748B] mt-1">日常教学记录、反思与效果评估</p>
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
                className="h-10 bg-[#F97316] hover:bg-[#EA580C] text-white gap-2"
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
                className="h-10 bg-[#977653] hover:bg-[#7A5F42] text-white gap-2"
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
        className="bg-white rounded-lg p-4 mb-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
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
              {studentOptions.length > 0 ? studentOptions.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)) : STUDENTS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
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
            <span className="text-[#94A3B8]">-</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[130px]" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1.5 text-sm text-[#64748B] cursor-pointer">
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
        <div className="inline-flex rounded-md border border-[#E2E8F0] overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer',
              viewMode === 'list' ? 'bg-[#977653] text-white' : 'bg-white text-[#64748B] hover:bg-[#F7F6F4]',
            )}
          >
            <LayoutList size={16} /> 列表
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer',
              viewMode === 'calendar' ? 'bg-[#977653] text-white' : 'bg-white text-[#64748B] hover:bg-[#F7F6F4]',
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
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F7F6F4] hover:bg-[#F7F6F4]">
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedRecords.size === paginatedRecords.length && paginatedRecords.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">日期</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">学生</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">IEP目标</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">记录类型</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">效果评分</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold">关键</TableHead>
                    <TableHead className="text-xs text-[#94A3B8] font-semibold text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-16">
                        <BookOpen size={48} className="mx-auto text-[#CBD5E1] mb-3" />
                        <h4 className="text-base font-semibold text-[#1E293B] mb-1">暂无教学记录</h4>
                        <p className="text-sm text-[#64748B] mb-3">{readOnly ? '暂无可见的教学记录' : '点击上方按钮录入第一条记录'}</p>
                        {!readOnly && (
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              onClick={() => { setEditingRecord(null); setRecordMode('quick'); setFormOpen(true); }}
                              className="bg-[#F97316] hover:bg-[#EA580C] text-white"
                            >
                              <Zap size={16} className="mr-1" /> 快速记录
                            </Button>
                            <Button
                              onClick={() => { setEditingRecord(null); setRecordMode('full'); setFormOpen(true); }}
                              className="bg-[#977653] hover:bg-[#7A5F42] text-white"
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
                        className="border-b border-[#E2E8F0] hover:bg-[#F7F6F4] transition-colors"
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRecords.has(record.id)}
                            onCheckedChange={() => toggleSelect(record.id)}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-[#1E293B]">{record.date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center text-xs font-bold text-[#977653]">
                              {record.student_name[0]}
                            </div>
                            <span className="text-sm font-medium text-[#1E293B]">{record.student_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-[#64748B] max-w-[200px] truncate" title={record.iep_goal}>
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
                            <Star size={16} className="fill-[#F59E0B] text-[#F59E0B]" />
                          ) : (
                            <span className="text-[#CBD5E1]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleViewRecord(record)}>
                              <Eye size={14} className="text-[#64748B]" />
                            </Button>
                            {!readOnly && (
                              <>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingRecord(record); setFormOpen(true); }}>
                                  <Pencil size={14} className="text-[#64748B]" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(record.id)}>
                                  <X size={14} className="text-[#EF4444]" />
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
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0]">
                  <div className="text-sm text-[#64748B]">
                    共 {filteredRecords.length} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                    >
                      上一页
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          'w-8 h-8 rounded-md text-sm transition-colors cursor-pointer',
                          currentPage === p ? 'bg-[#977653] text-white' : 'text-[#64748B] hover:bg-[#F7F6F4]',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(currentPage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10条</SelectItem>
                      <SelectItem value="20">20条</SelectItem>
                      <SelectItem value="50">50条</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
            <CalendarView records={filteredRecords} onSelectDay={handleDaySelect} />
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
