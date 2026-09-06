/**
 * IEP System - Data Export Utilities
 * 数据导出工具函数
 */

/**
 * 将数据数组导出为CSV文件
 * @param data 数据数组（对象数组）
 * @param columns 列定义 [{ key: '字段名', label: '显示标题' }]
 * @param filename 文件名（不含扩展名）
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: string; label: string }[],
  filename: string,
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // BOM for Excel UTF-8 support
  let csvContent = '\uFEFF';

  // Header row
  csvContent += columns.map((c) => `"${c.label}"`).join(',') + '\n';

  // Data rows
  data.forEach((row) => {
    const values = columns.map((col) => {
      const val = row[col.key];
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""'); // Escape double quotes
      return `"${str}"`;
    });
    csvContent += values.join(',') + '\n';
  });

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${formatDate(new Date())}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 将评估记录导出为CSV（专用格式）
 */
export function exportEvaluations(
  records: any[],
  filename: string = '评估记录',
): void {
  exportToCSV(records, [
    { key: 'studentName', label: '学生姓名' },
    { key: 'evalType', label: '评估类型' },
    { key: 'domain', label: '评估领域' },
    { key: 'score', label: '得分' },
    { key: 'maxScore', label: '满分' },
    { key: 'percentage', label: '百分比' },
    { key: 'evaluator', label: '评估人' },
    { key: 'date', label: '评估日期' },
    { key: 'notes', label: '备注' },
  ], filename);
}

/**
 * 将学生列表导出为CSV
 */
export function exportStudents(
  students: any[],
  filename: string = '学生列表',
): void {
  exportToCSV(students, [
    { key: 'name', label: '姓名' },
    { key: 'gender', label: '性别' },
    { key: 'age', label: '年龄' },
    { key: 'class_name', label: '班级' },
    { key: 'disability_type', label: '障碍类型' },
    { key: 'disability_level', label: '障碍等级' },
    { key: 'guardian_name', label: '监护人' },
    { key: 'guardian_phone', label: '联系电话' },
    { key: 'admission_date', label: '入学日期' },
    { key: 'status', label: '状态' },
  ], filename);
}

/**
 * 将IEP计划导出为CSV
 */
export function exportIEPPlans(
  plans: any[],
  filename: string = 'IEP计划',
): void {
  exportToCSV(plans, [
    { key: 'student_name', label: '学生姓名' },
    { key: 'title', label: '计划标题' },
    { key: 'status_label', label: '状态' },
    { key: 'primary_teacher', label: '主责教师' },
    { key: 'goals_count', label: '目标数' },
    { key: 'completed_goals', label: '已完成' },
    { key: 'progress', label: '进度' },
    { key: 'start_date', label: '开始日期' },
    { key: 'end_date', label: '结束日期' },
  ], filename);
}

/**
 * 将教学记录导出为CSV
 */
export function exportTeachingRecords(
  records: any[],
  filename: string = '教学记录',
): void {
  exportToCSV(records, [
    { key: 'date', label: '日期' },
    { key: 'student_name', label: '学生姓名' },
    { key: 'teacher', label: '教师' },
    { key: 'subject', label: '科目' },
    { key: 'topic', label: '主题' },
    { key: 'type', label: '课型' },
    { key: 'goal_title', label: '关联目标' },
    { key: 'effectiveness', label: '效果' },
    { key: 'content', label: '教学内容摘要' },
  ], filename);
}

/**
 * 将家长沟通记录导出为CSV
 */
export function exportCommunications(
  records: any[],
  filename: string = '沟通记录',
): void {
  exportToCSV(records, [
    { key: 'date', label: '日期' },
    { key: 'student_name', label: '学生姓名' },
    { key: 'parent_name', label: '家长' },
    { key: 'teacher', label: '教师' },
    { key: 'type', label: '沟通方式' },
    { key: 'topic', label: '主题' },
    { key: 'summary', label: '摘要' },
  ], filename);
}

/**
 * 将审计日志导出为CSV
 */
export function exportAuditLogs(
  logs: any[],
  filename: string = '审计日志',
): void {
  exportToCSV(logs, [
    { key: 'timestamp', label: '时间' },
    { key: 'user_name', label: '用户' },
    { key: 'user_role', label: '角色' },
    { key: 'module', label: '模块' },
    { key: 'action', label: '操作' },
    { key: 'target', label: '对象' },
    { key: 'description', label: '描述' },
    { key: 'status', label: '状态' },
  ], filename);
}

// Helper: format date as YYYYMMDD_HHMMSS
function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
