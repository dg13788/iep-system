import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  User,
  ChevronLeft,
  GraduationCap,
  MapPin,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { ClassItem } from './data';
import type { TeacherOption } from '@/services/iep';
import { createClass, updateClass, deleteClass } from '@/services/students';

interface ClassManagementProps {
  classes: ClassItem[];
  /** 真实教师下拉（来自 GET /system/users），替代原有的写死名单 */
  teachers?: TeacherOption[];
  readOnly?: boolean;
  onBack: () => void;
  setClasses?: React.Dispatch<React.SetStateAction<ClassItem[]>>;
  /** 变更后重新拉取班级（并连带刷新学生列表，保证班级名同步） */
  onReload?: () => void;
}

const gradeOptions = ['学前', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '康复组'];

export default function ClassManagement({
  classes,
  teachers = [],
  readOnly = false,
  onBack,
  setClasses,
  onReload,
}: ClassManagementProps) {
  /** 姓名 → 用户ID（后端 student_classes.teacher_id 存的是 users.id） */
  const teacherIdByName = (name: string): number | null => {
    const hit = teachers.find((t) => t.name === name);
    return hit ? hit.id : null;
  };
  const [formOpen, setFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<Partial<ClassItem>>({
    name: '', grade: '一年级', teacher: '', capacity: 12, description: '', room: '', status: 'active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setForm({ name: '', grade: '一年级', teacher: '', capacity: 12, description: '', room: '', status: 'active' });
    setErrors({});
  };

  const handleAdd = () => {
    if (readOnly) return;
    resetForm();
    setEditingClass(null);
    setFormOpen(true);
  };

  const handleEdit = (cls: ClassItem) => {
    if (readOnly) return;
    setForm({ ...cls });
    setEditingClass(cls);
    setFormOpen(true);
  };

  const handleDeleteClick = (cls: ClassItem) => {
    if (readOnly) return;
    setDeleteTarget(cls);
    setDeleteDialogOpen(true);
  };

  /**
   * 修复说明：原实现只改本地 state，刷新后班级复原（假删除）。
   * 现改为调用后端 /students/class_delete 真实落库。
   * 后端会拒绝删除仍有在读学生的班级，需把该错误提示给用户。
   */
  const confirmDelete = async () => {
    if (readOnly) return;
    if (!deleteTarget) return;
    try {
      await deleteClass(deleteTarget.id);
      toast.success('班级已删除');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      onReload?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name?.trim()) newErrors.name = '请输入班级名称';
    // 教师下拉依赖 user_manage 权限，无权限时列表为空，此时不强制要求
    if (teachers.length > 0 && !form.teacher) newErrors.teacher = '请选择班主任';
    if (!form.capacity || form.capacity < 1) newErrors.capacity = '请输入有效容量';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 修复说明：原实现只改本地 state（含 `c${Date.now()}` 这种前端伪造ID），
   * 刷新后即丢失。现改为调用后端 /students/class_create 与 /students/class_update。
   * 注意：room 字段在 student_classes 表中不存在，只保留在本地展示层。
   */
  const handleSubmit = async () => {
    if (readOnly) return;
    if (!validate()) return;

    const teacherId = teacherIdByName(form.teacher || '');
    const payload = {
      name: (form.name || '').trim(),
      grade: form.grade || '',
      teacher_id: teacherId,
      capacity: Number(form.capacity) || 12,
      description: form.description || '',
    };

    try {
      if (editingClass) {
        await updateClass(editingClass.id, payload);
        // 同步本地展示（后端不保存 room 字段）
        setClasses?.((prev) =>
          prev.map((c) =>
            c.id === editingClass.id
              ? { ...c, ...form, capacity: Number(form.capacity) } as ClassItem
              : c
          )
        );
        toast.success('班级信息已更新');
      } else {
        await createClass(payload);
        toast.success('班级已创建');
      }
      setFormOpen(false);
      onReload?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const inputClass = 'h-10 bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]';
  const selectClass = 'h-10 bg-[#F7F6F4] border-[#E2E8F0]';

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 text-[#64748B] border-[#E2E8F0] hover:bg-[#F7F6F4]"
            onClick={onBack}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-[28px] font-bold text-[#1E293B] tracking-tight">班级管理</h1>
            <p className="text-sm text-[#64748B] mt-1">管理班级信息、班主任分配与容量设置</p>
          </div>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            className="h-10 px-4 bg-primary-500 hover:bg-primary-600 text-white"
            onClick={handleAdd}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            新增班级
          </Button>
        )}
      </motion.div>

      {/* Class Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {classes.map((cls, idx) => (
          <motion.div
            key={cls.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.06 }}
            className="bg-white rounded-lg border border-[#E2E8F0] p-6 transition-all duration-150 hover:border-primary-300 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#1E293B]">{cls.name}</h3>
                <span className="text-xs text-[#94A3B8] mt-0.5 inline-block">{cls.grade}</span>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center text-[#64748B] hover:bg-[#F7F6F4] hover:text-primary-500 transition-colors"
                    title="编辑"
                    onClick={() => handleEdit(cls)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center text-[#64748B] hover:bg-danger-50 hover:text-danger-500 transition-colors"
                    title="删除"
                    onClick={() => handleDeleteClick(cls)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="mb-4">
              <span className="text-3xl font-bold text-[#1E293B]">{cls.student_count}</span>
              <span className="text-sm text-[#64748B] ml-1">名学生</span>
              <span className="text-xs text-[#94A3B8] ml-2">/ 容量 {cls.capacity}人</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <User className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>班主任：{cls.teacher || '未分配'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <MapPin className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>{cls.room || '未分配教室'}</span>
              </div>
            </div>

            {cls.description && (
              <p className="text-xs text-[#94A3B8] mt-3 pt-3 border-t border-[#E2E8F0] line-clamp-2">
                {cls.description}
              </p>
            )}

            <div className="mt-4 pt-3 border-t border-[#E2E8F0]">
              <div className="w-full bg-[#F0F2F5] rounded-full h-2">
                <div
                  className="bg-primary-400 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (cls.student_count / cls.capacity) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                已使用 {cls.student_count}/{cls.capacity} 容量
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {classes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <GraduationCap className="w-16 h-16 text-[#CBD5E1] mb-4" />
          <p className="text-[#64748B] font-medium mb-1">
            {readOnly ? '暂无可见班级' : '暂无班级'}
          </p>
          <p className="text-[#94A3B8] text-sm mb-4">
            {readOnly ? '您没有查看班级的权限' : '点击上方按钮添加第一个班级'}
          </p>
          {!readOnly && (
            <Button className="bg-primary-500 hover:bg-primary-600 text-white" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              新增班级
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Form Drawer */}
      {!readOnly && (
        <AnimatePresence>
          {formOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-50 bg-black/50"
                onClick={() => setFormOpen(false)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-[#F7F6F4] z-50 flex flex-col"
              >
                <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E2E8F0] flex-shrink-0">
                  <h2 className="text-lg font-semibold text-[#1E293B]">
                    {editingClass ? '编辑班级' : '新增班级'}
                  </h2>
                  <button
                    onClick={() => setFormOpen(false)}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[#94A3B8] hover:bg-[#F7F6F4] hover:text-[#1E293B] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">
                        班级名称<span className="text-danger-500 ml-0.5">*</span>
                      </Label>
                      <Input
                        value={form.name || ''}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="如：启智一班"
                        className={inputClass}
                      />
                      {errors.name && <p className="text-danger-500 text-xs mt-1">{errors.name}</p>}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">所在年级</Label>
                      <Select
                        value={form.grade || '一年级'}
                        onValueChange={(v) => setForm((p) => ({ ...p, grade: v }))}
                      >
                        <SelectTrigger className={selectClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {gradeOptions.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">
                        班主任<span className="text-danger-500 ml-0.5">*</span>
                      </Label>
                      <Select
                        value={form.teacher || ''}
                        onValueChange={(v) => setForm((p) => ({ ...p, teacher: v }))}
                      >
                        <SelectTrigger className={selectClass}>
                          <SelectValue placeholder="请选择班主任" />
                        </SelectTrigger>
                        <SelectContent>
                          {teachers.length === 0 ? (
                            <SelectItem value="__none__" disabled>暂无可选教师</SelectItem>
                          ) : (
                            teachers.map((t) => (
                              <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {errors.teacher && <p className="text-danger-500 text-xs mt-1">{errors.teacher}</p>}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">教室位置</Label>
                      <Input
                        value={form.room || ''}
                        onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))}
                        placeholder="如：教学楼101"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">
                        容量上限<span className="text-danger-500 ml-0.5">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={form.capacity || ''}
                        onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) }))}
                        placeholder="请输入容量上限"
                        className={inputClass}
                      />
                      {errors.capacity && <p className="text-danger-500 text-xs mt-1">{errors.capacity}</p>}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-[#1E293B] mb-1.5 block">班级描述</Label>
                      <Textarea
                        value={form.description || ''}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="请输入班级描述"
                        rows={3}
                        className="bg-[#F7F6F4] border-[#E2E8F0] focus:border-[#3B82F6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.15)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-[#E2E8F0] flex-shrink-0">
                  <Button variant="ghost" onClick={() => setFormOpen(false)} className="text-[#64748B]">
                    取消
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    className="bg-primary-500 hover:bg-primary-600 text-white"
                  >
                    {editingClass ? '保存' : '创建'}
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      {/* Delete Confirmation */}
      {!readOnly && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-[400px]">
            <DialogHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-3">
                <Trash2 className="w-6 h-6 text-danger-500" />
              </div>
              <DialogTitle className="text-lg font-semibold text-[#1E293B]">确认删除</DialogTitle>
              <DialogDescription className="text-[#64748B]">
                确定要删除班级 <strong className="text-[#1E293B]">{deleteTarget?.name}</strong> 吗？该操作不可撤销。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button className="bg-danger-500 hover:bg-danger-600 text-white" onClick={confirmDelete}>
                确认删除
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
