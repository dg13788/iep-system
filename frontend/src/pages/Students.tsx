import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import StudentList from './students/StudentList';
import StudentFormDrawer from './students/StudentFormDrawer';
import StudentDetailDrawer from './students/StudentDetailDrawer';
import ClassManagement from './students/ClassManagement';
import type { Student, ClassItem, StudentStatus } from './students/data';
import { isReadOnly } from '@/utils/dataScope';
import {
  fetchStudents,
  fetchClasses,
  createStudent,
  updateStudent,
  deleteStudent,
  buildStudentPayload,
} from '@/services/students';
import { fetchTeacherOptions, type TeacherOption } from '@/services/iep';

export default function Students() {
  // 只读判断来自后端下发的 IEP 参与级别（不再按用户名硬编码猜测）
  const readOnly = isReadOnly();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  // 加载状态：loading 首屏骨架，refreshing 后台刷新，error 失败信息
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'classes'>('list');

  // Form drawer state
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail drawer state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  /** 拉取学生列表（数据范围由后端 SQL 施加，前端不再二次过滤） */
  const loadStudents = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetchStudents({
        page: 1,
        pageSize: 500,
        sort_field: 'created_at',
        sort_order: 'desc',
      });
      setStudents(res.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '学生列表加载失败');
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /** 首屏：并行加载学生、班级、教师下拉 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStudents(true);
      if (cancelled) return;
      try {
        const [cls, tch] = await Promise.all([fetchClasses(), fetchTeacherOptions()]);
        if (cancelled) return;
        setClasses(cls);
        setTeachers(tch);
      } catch {
        // 班级/教师下拉失败不阻塞主列表，仅留空
        if (!cancelled) {
          setClasses([]);
          setTeachers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStudents]);

  const reload = useCallback(() => {
    void loadStudents(false);
  }, [loadStudents]);

  const handleAdd = useCallback(() => {
    if (readOnly) return;
    setEditingStudent(null);
    setFormOpen(true);
  }, [readOnly]);

  const handleEdit = useCallback((student: Student) => {
    if (readOnly) return;
    setEditingStudent(student);
    setFormOpen(true);
    setDetailOpen(false);
  }, [readOnly]);

  const handleDelete = useCallback(
    async (student: Student) => {
      if (readOnly) return;
      try {
        await deleteStudent(student.id);
        toast.success('学生档案已删除');
        if (detailStudent?.id === student.id) {
          setDetailOpen(false);
          setDetailStudent(null);
        }
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '删除失败');
      }
    },
    [readOnly, detailStudent, reload],
  );

  /** 批量删除：逐个调用后端，统计成败后一次性反馈 */
  const handleBatchDelete = useCallback(
    async (ids: string[]) => {
      if (readOnly || ids.length === 0) return;
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          await deleteStudent(id);
          ok++;
        } catch {
          fail++;
        }
      }
      if (fail === 0) toast.success(`已删除 ${ok} 份学生档案`);
      else toast.error(`删除完成：成功 ${ok} 条，失败 ${fail} 条`);
      reload();
    },
    [readOnly, reload],
  );

  /** 批量变更学籍状态：逐个调用 /students/update */
  const handleBatchStatus = useCallback(
    async (ids: string[], status: StudentStatus) => {
      if (readOnly || ids.length === 0) return;
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          await updateStudent(id, { status });
          ok++;
        } catch {
          fail++;
        }
      }
      if (fail === 0) toast.success(`已将 ${ok} 名学生变更为「${status}」`);
      else toast.error(`操作完成：成功 ${ok} 条，失败 ${fail} 条`);
      reload();
    },
    [readOnly, reload],
  );

  const handleViewDetail = useCallback((student: Student) => {
    setDetailStudent(student);
    setDetailOpen(true);
  }, []);

  /** 表单提交：新增走 create，编辑走 update，成功后刷新列表 */
  const handleSubmit = useCallback(
    async (student: Student) => {
      if (readOnly) return;
      setSubmitting(true);
      try {
        const payload = buildStudentPayload(student);
        if (editingStudent) {
          await updateStudent(editingStudent.id, payload);
          toast.success('学生档案已更新');
        } else {
          await createStudent(payload);
          toast.success('学生档案已创建');
        }
        setFormOpen(false);
        setEditingStudent(null);
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSubmitting(false);
      }
    },
    [readOnly, editingStudent, reload],
  );

  const handleSwitchToClasses = useCallback(() => setView('classes'), []);
  const handleBackToList = useCallback(() => setView('list'), []);

  return (
    <div>
      {view === 'list' ? (
        <StudentList
          students={students}
          classes={classes}
          readOnly={readOnly}
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRetry={reload}
          onBatchDelete={handleBatchDelete}
          onBatchStatus={handleBatchStatus}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewDetail={handleViewDetail}
          onSwitchToClasses={handleSwitchToClasses}
          onImported={reload}
        />
      ) : (
        <ClassManagement
          classes={classes}
          teachers={teachers}
          readOnly={readOnly}
          onBack={handleBackToList}
          setClasses={setClasses}
          onReload={reload}
        />
      )}

      <StudentFormDrawer
        open={formOpen}
        student={editingStudent}
        classes={classes}
        submitting={submitting}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <StudentDetailDrawer
        open={detailOpen}
        student={detailStudent}
        classes={classes}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
