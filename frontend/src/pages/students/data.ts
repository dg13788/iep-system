export type Gender = '男' | '女';

/**
 * 与数据库 students.status ENUM('在读','休学','毕业','转衔') 严格一致。
 * 回测发现前端原定义为「转学」，写入时会被 MySQL 拒绝，故以数据库为准修正。
 */
export type StudentStatus = '在读' | '休学' | '毕业' | '转衔';

export type DisabilityLevel = '轻度' | '中度' | '重度' | '极重度';

export interface Student {
  id: string;
  name: string;
  student_no: string;
  gender: Gender;
  birth_date: string;
  id_card: string;
  disability_type: string;
  disability_level: DisabilityLevel;
  disability_card_no: string;
  class_id: string;
  class_name: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_relation: string;
  guardian2_name: string;
  guardian2_phone: string;
  emergency_contact: string;
  emergency_phone: string;
  address: string;
  health_info: string;
  allergy_info: string;
  medication_info: string;
  enrollment_date: string;
  status: StudentStatus;
  remarks: string;
  age: number;
  diagnosis_date: string;
  diagnosis_org: string;
  diagnosis_note: string;
  secondary_disability: string;
  special_needs: string;
}

export interface ClassItem {
  id: string;
  name: string;
  grade: string;
  teacher: string;
  capacity: number;
  student_count: number;
  description: string;
  status: 'active' | 'inactive';
  room: string;
}

export const DISABILITY_TYPES = [
  '智力障碍',
  '自闭症谱系障碍',
  '脑瘫',
  '唐氏综合征',
  '多重障碍',
  '听力障碍',
  '视力障碍',
  '言语障碍',
] as const;

export const DISABILITY_LEVELS: DisabilityLevel[] = ['轻度', '中度', '重度', '极重度'];

export const STUDENT_STATUSES: StudentStatus[] = ['在读', '休学', '毕业', '转衔'];

export const GUARDIAN_RELATIONS = ['父亲', '母亲', '祖父', '祖母', '外祖父', '外祖母', '其他亲属'] as const;

export const statusBadgeClass: Record<StudentStatus, string> = {
  '在读': 'bg-success-50 text-success-600 border border-success-50',
  '休学': 'bg-warning-50 text-warning-600 border border-warning-50',
  '毕业': 'bg-primary-50 text-primary-600 border border-primary-50',
  '转衔': 'bg-danger-50 text-danger-600 border border-danger-50',
};

export const disabilityBadgeColors: Record<string, string> = {
  '智力障碍': 'bg-[#FEF2F2] text-[#DC2626]',
  '自闭症谱系障碍': 'bg-[#EFF6FF] text-[#2563EB]',
  '脑瘫': 'bg-[#F5F3FF] text-[#7C3AED]',
  '唐氏综合征': 'bg-[#FFF7ED] text-[#EA580C]',
  '多重障碍': 'bg-[#FDF2F8] text-[#DB2777]',
  '听力障碍': 'bg-[#ECFDF5] text-[#059669]',
  '视力障碍': 'bg-[#FFFBEB] text-[#D97706]',
  '言语障碍': 'bg-[#F0FDFA] text-[#0D9488]',
};
