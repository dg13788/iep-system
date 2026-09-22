import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { Student, ClassItem } from './data';
import { DISABILITY_TYPES, DISABILITY_LEVELS, STUDENT_STATUSES, GUARDIAN_RELATIONS } from './data';

interface StudentFormDrawerProps {
  open: boolean;
  student: Student | null;
  classes: ClassItem[];
  /** 提交进行中：禁用按钮，防止重复提交 */
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (student: Student) => void;
}

const emptyStudent: Omit<Student, 'id' | 'age'> = {
  name: '',
  student_no: '',
  gender: '男',
  birth_date: '',
  id_card: '',
  disability_type: '',
  disability_level: '轻度',
  disability_card_no: '',
  class_id: '',
  class_name: '',
  guardian_name: '',
  guardian_phone: '',
  guardian_relation: '父亲',
  guardian2_name: '',
  guardian2_phone: '',
  emergency_contact: '',
  emergency_phone: '',
  address: '',
  health_info: '',
  allergy_info: '',
  medication_info: '',
  enrollment_date: '',
  status: '在读',
  remarks: '',
  diagnosis_date: '',
  diagnosis_org: '',
  diagnosis_note: '',
  secondary_disability: '',
  special_needs: '',
};

function generateStudentNo() {
  const prefix = 'XH';
  const year = new Date().getFullYear();
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}${year}${random}`;
}

export default function StudentFormDrawer({
  open,
  student,
  classes,
  submitting = false,
  onClose,
  onSubmit,
}: StudentFormDrawerProps) {
  const isEdit = !!student;
  const [form, setForm] = useState<Omit<Student, 'id' | 'age'>>({ ...emptyStudent, student_no: generateStudentNo() });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // P3-1 修复：补充 Esc 关闭能力
  useDrawerA11y(open, onClose);

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name,
        student_no: student.student_no,
        gender: student.gender,
        birth_date: student.birth_date,
        id_card: student.id_card,
        disability_type: student.disability_type,
        disability_level: student.disability_level,
        disability_card_no: student.disability_card_no,
        class_id: student.class_id,
        class_name: student.class_name,
        guardian_name: student.guardian_name,
        guardian_phone: student.guardian_phone,
        guardian_relation: student.guardian_relation,
        guardian2_name: student.guardian2_name,
        guardian2_phone: student.guardian2_phone,
        emergency_contact: student.emergency_contact,
        emergency_phone: student.emergency_phone,
        address: student.address,
        health_info: student.health_info,
        allergy_info: student.allergy_info,
        medication_info: student.medication_info,
        enrollment_date: student.enrollment_date,
        status: student.status,
        remarks: student.remarks,
        diagnosis_date: student.diagnosis_date,
        diagnosis_org: student.diagnosis_org,
        diagnosis_note: student.diagnosis_note,
        secondary_disability: student.secondary_disability,
        special_needs: student.special_needs,
      });
    } else {
      setForm({ ...emptyStudent, student_no: generateStudentNo() });
    }
    setErrors({});
  }, [student, open]);

  const updateField = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'class_id') {
        const cls = classes.find((c) => c.id === value);
        next.class_name = cls?.name || '';
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = '请输入学生姓名';
    if (!form.gender) newErrors.gender = '请选择性别';
    if (!form.birth_date) newErrors.birth_date = '请选择出生日期';
    if (!form.enrollment_date) newErrors.enrollment_date = '请选择入学日期';
    if (!form.class_id) newErrors.class_id = '请选择班级';
    if (!form.disability_type) newErrors.disability_type = '请选择障碍类型';
    if (!form.guardian_name.trim()) newErrors.guardian_name = '请输入监护人姓名';
    if (!form.guardian_phone.trim()) newErrors.guardian_phone = '请输入监护人电话';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast.error('请填写必填项');
      return;
    }
    const birth = new Date(form.birth_date);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

    const submitted: Student = {
      ...form,
      id: student?.id || `s${Date.now()}`,
      age,
    };
    // 提示与关闭由父容器统一处理（提交是异步的真实接口调用），
    // 避免本地先弹「成功」而接口实际失败造成误导。
    if (submitting) return;
    onSubmit(submitted);
  };

  /**
   * 修复说明：「保存草稿」原本只弹一个 toast 就关闭，数据根本没有落库。
   * students 表也没有草稿状态字段，因此这里改为走与提交相同的持久化流程。
   */
  const handleSaveDraft = () => {
    if (submitting) return;
    handleSubmit();
  };

  const sectionClass = 'bg-white rounded-lg border border-[#E2E8F0] p-5';
  const labelClass = 'text-sm font-medium text-[#1E293B] mb-1.5 block';
  const requiredClass = 'text-danger-500 ml-0.5';
  const errorClass = 'text-danger-500 text-xs mt-1';
  const inputClass = 'h-10 bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]';
  const selectClass = 'h-10 bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="fixed right-0 top-0 h-full w-full sm:w-[640px] bg-[#F7F6F4] z-50 flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? '编辑学生档案' : '新增学生档案'}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E2E8F0] flex-shrink-0">
              <h2 className="text-lg font-semibold text-[#1E293B]">
                {isEdit ? '编辑学生档案' : '新增学生档案'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-md flex items-center justify-center text-[#94A3B8] hover:bg-[#F7F6F4] hover:text-[#1E293B] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Section 1: Basic Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={sectionClass}
              >
                <h3 className="text-base font-semibold text-[#1E293B] mb-4">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      学生姓名<span className={requiredClass}>*</span>
                    </Label>
                    <Input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="请输入姓名"
                      className={inputClass}
                    />
                    {errors.name && <p className={errorClass}>{errors.name}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>学号</Label>
                    <Input
                      value={form.student_no}
                      onChange={(e) => updateField('student_no', e.target.value)}
                      placeholder="自动生成"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      性别<span className={requiredClass}>*</span>
                    </Label>
                    <RadioGroup
                      value={form.gender}
                      onValueChange={(v) => updateField('gender', v)}
                      className="flex gap-4 h-10 items-center"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="男" id="male" />
                        <Label htmlFor="male" className="text-sm text-[#1E293B] cursor-pointer">男</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="女" id="female" />
                        <Label htmlFor="female" className="text-sm text-[#1E293B] cursor-pointer">女</Label>
                      </div>
                    </RadioGroup>
                    {errors.gender && <p className={errorClass}>{errors.gender}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      出生日期<span className={requiredClass}>*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.birth_date}
                      onChange={(e) => updateField('birth_date', e.target.value)}
                      className={inputClass}
                    />
                    {errors.birth_date && <p className={errorClass}>{errors.birth_date}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>身份证号</Label>
                    <Input
                      value={form.id_card}
                      onChange={(e) => updateField('id_card', e.target.value)}
                      placeholder="请输入身份证号"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      入学日期<span className={requiredClass}>*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.enrollment_date}
                      onChange={(e) => updateField('enrollment_date', e.target.value)}
                      className={inputClass}
                    />
                    {errors.enrollment_date && <p className={errorClass}>{errors.enrollment_date}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      班级<span className={requiredClass}>*</span>
                    </Label>
                    <Select value={form.class_id} onValueChange={(v) => updateField('class_id', v)}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue placeholder="请选择班级" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.class_id && <p className={errorClass}>{errors.class_id}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      学籍状态<span className={requiredClass}>*</span>
                    </Label>
                    <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>

              {/* Section 2: Disability Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={sectionClass}
              >
                <h3 className="text-base font-semibold text-[#1E293B] mb-4">障碍信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      主要障碍类型<span className={requiredClass}>*</span>
                    </Label>
                    <Select value={form.disability_type} onValueChange={(v) => updateField('disability_type', v)}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {DISABILITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.disability_type && <p className={errorClass}>{errors.disability_type}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>伴随障碍</Label>
                    <Input
                      value={form.secondary_disability}
                      onChange={(e) => updateField('secondary_disability', e.target.value)}
                      placeholder="请输入伴随障碍（如有）"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>障碍程度</Label>
                    <Select value={form.disability_level} onValueChange={(v) => updateField('disability_level', v)}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISABILITY_LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>残疾证号</Label>
                    <Input
                      value={form.disability_card_no}
                      onChange={(e) => updateField('disability_card_no', e.target.value)}
                      placeholder="请输入残疾证号"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>诊断日期</Label>
                    <Input
                      type="date"
                      value={form.diagnosis_date}
                      onChange={(e) => updateField('diagnosis_date', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>诊断机构</Label>
                    <Input
                      value={form.diagnosis_org}
                      onChange={(e) => updateField('diagnosis_org', e.target.value)}
                      placeholder="请输入诊断机构"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className={labelClass}>诊断说明</Label>
                    <Textarea
                      value={form.diagnosis_note}
                      onChange={(e) => updateField('diagnosis_note', e.target.value)}
                      placeholder="请输入医学诊断说明"
                      rows={4}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Section 3: Guardian Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={sectionClass}
              >
                <h3 className="text-base font-semibold text-[#1E293B] mb-4">监护人信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className={labelClass}>家庭住址</Label>
                    <Input
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="请输入家庭住址"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      监护人姓名<span className={requiredClass}>*</span>
                    </Label>
                    <Input
                      value={form.guardian_name}
                      onChange={(e) => updateField('guardian_name', e.target.value)}
                      placeholder="请输入监护人姓名"
                      className={inputClass}
                    />
                    {errors.guardian_name && <p className={errorClass}>{errors.guardian_name}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>监护人关系</Label>
                    <Select value={form.guardian_relation} onValueChange={(v) => updateField('guardian_relation', v)}>
                      <SelectTrigger className={selectClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GUARDIAN_RELATIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>
                      监护人电话<span className={requiredClass}>*</span>
                    </Label>
                    <Input
                      value={form.guardian_phone}
                      onChange={(e) => updateField('guardian_phone', e.target.value)}
                      placeholder="请输入电话"
                      className={inputClass}
                    />
                    {errors.guardian_phone && <p className={errorClass}>{errors.guardian_phone}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>紧急联系人</Label>
                    <Input
                      value={form.emergency_contact}
                      onChange={(e) => updateField('emergency_contact', e.target.value)}
                      placeholder="请输入紧急联系人"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className={labelClass}>紧急联系电话</Label>
                    <Input
                      value={form.emergency_phone}
                      onChange={(e) => updateField('emergency_phone', e.target.value)}
                      placeholder="请输入紧急联系电话"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className={labelClass}>特殊需求说明</Label>
                    <Textarea
                      value={form.special_needs}
                      onChange={(e) => updateField('special_needs', e.target.value)}
                      placeholder="请输入特殊需求说明"
                      rows={3}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Section 4: Other Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={sectionClass}
              >
                <h3 className="text-base font-semibold text-[#1E293B] mb-4">其他信息</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label className={labelClass}>过敏史</Label>
                    <Textarea
                      value={form.allergy_info}
                      onChange={(e) => updateField('allergy_info', e.target.value)}
                      placeholder="请输入过敏史（食物、药物等）"
                      rows={2}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                  <div>
                    <Label className={labelClass}>既往病史</Label>
                    <Textarea
                      value={form.health_info}
                      onChange={(e) => updateField('health_info', e.target.value)}
                      placeholder="请输入既往病史"
                      rows={2}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                  <div>
                    <Label className={labelClass}>用药信息</Label>
                    <Textarea
                      value={form.medication_info}
                      onChange={(e) => updateField('medication_info', e.target.value)}
                      placeholder="请输入长期用药信息"
                      rows={2}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                  <div>
                    <Label className={labelClass}>备注</Label>
                    <Textarea
                      value={form.remarks}
                      onChange={(e) => updateField('remarks', e.target.value)}
                      placeholder="其他需要记录的信息"
                      rows={2}
                      className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-[#E2E8F0] flex-shrink-0">
              <Button variant="ghost" onClick={onClose} disabled={submitting} className="text-[#64748B]">
                取消
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={submitting}
                  className="border-[#E2E8F0] text-[#64748B] hover:bg-[#F7F6F4]"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  保存草稿
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-primary-500 hover:bg-primary-600 text-white"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  提交
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence } from 'framer-motion';
