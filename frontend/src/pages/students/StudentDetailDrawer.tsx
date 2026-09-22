import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Trash2, MapPin, Phone, User, Calendar, FileText, Stethoscope, Pill, AlertTriangle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useDrawerA11y } from '@/hooks/useDrawerA11y';
import type { Student, ClassItem } from './data';
import { statusBadgeClass, disabilityBadgeColors } from './data';
import SafetyTab from './SafetyTab';
import CommunicationTab from './CommunicationTab';
import InterventionTab from './InterventionTab';

interface StudentDetailDrawerProps {
  open: boolean;
  student: Student | null;
  classes: ClassItem[];
  onClose: () => void;
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
}

export default function StudentDetailDrawer({
  open,
  student,
  classes,
  onClose,
  onEdit,
  onDelete,
}: StudentDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // P3-1 修复：补充 Esc 关闭能力
  useDrawerA11y(open, onClose);

  if (!student) return null;

  const InfoItem = ({ label, value }: { label: string; value: string }) => (
    <div className="py-2">
      <p className="text-xs text-[#94A3B8] mb-0.5">{label}</p>
      <p className="text-sm text-[#1E293B] font-medium">{value || '-'}</p>
    </div>
  );

  const tabContentClass = 'space-y-4';

  return (
    <>
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
              className="fixed right-0 top-0 h-full w-full sm:w-[720px] bg-[#F7F6F4] z-50 flex flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label={`学生详情 - ${student?.name ?? ''}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E2E8F0] flex-shrink-0">
                <h2 className="text-lg font-semibold text-[#1E293B]">学生详情</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-[#94A3B8] hover:bg-[#F7F6F4] hover:text-[#1E293B] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Profile Header */}
                <div className="bg-white px-6 py-5 border-b border-[#E2E8F0]">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600 flex-shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-[#1E293B]">{student.name}</h3>
                        <Badge className={`${statusBadgeClass[student.status]} text-xs font-medium`}>
                          {student.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#64748B] mt-1">
                        {student.student_no} · {student.gender} · {student.age}岁
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F0F2F5] text-[#405680]">
                          {student.class_name}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          disabilityBadgeColors[student.disability_type] || 'bg-[#F0F2F5] text-[#64748B]'
                        }`}>
                          {student.disability_type}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F5F0EB] text-[#5C4832]">
                          {student.disability_level}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-[#64748B] border-[#E2E8F0] hover:bg-[#F7F6F4]"
                        onClick={() => onEdit(student)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-danger-500 border-danger-200 hover:bg-danger-50"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="px-6 py-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-white border border-[#E2E8F0] mb-4">
                      <TabsTrigger value="basic" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">基本信息</TabsTrigger>
                      <TabsTrigger value="disability" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">障碍信息</TabsTrigger>
                      <TabsTrigger value="guardian" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">监护人信息</TabsTrigger>
                      <TabsTrigger value="other" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">其他信息</TabsTrigger>
                      <TabsTrigger value="attachments" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">附件管理</TabsTrigger>
                      <TabsTrigger value="parents" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">关联家长</TabsTrigger>
                      <TabsTrigger value="safety" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">安全档案</TabsTrigger>
                      <TabsTrigger value="communication" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">沟通方式</TabsTrigger>
                      <TabsTrigger value="intervention" className="text-sm data-[state=active]:bg-primary-500 data-[state=active]:text-white">行为干预</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Basic Info */}
                    <AnimatePresence mode="wait">
                      <TabsContent value="basic" className="mt-0">
                        <motion.div
                          key="basic"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <User className="w-4 h-4 text-primary-500" />
                              学籍信息
                            </h4>
                            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                              <InfoItem label="学号" value={student.student_no} />
                              <InfoItem label="姓名" value={student.name} />
                              <InfoItem label="性别" value={student.gender} />
                              <InfoItem label="出生日期" value={student.birth_date} />
                              <InfoItem label="身份证号" value={student.id_card} />
                              <InfoItem label="入学日期" value={student.enrollment_date} />
                              <InfoItem label="班级" value={student.class_name} />
                              <InfoItem label="学籍状态" value={student.status} />
                            </div>
                          </div>
                        </motion.div>
                      </TabsContent>

                      {/* Tab 2: Disability Info */}
                      <TabsContent value="disability" className="mt-0">
                        <motion.div
                          key="disability"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <Stethoscope className="w-4 h-4 text-primary-500" />
                              障碍信息
                            </h4>
                            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                              <InfoItem label="主要障碍类型" value={student.disability_type} />
                              <InfoItem label="伴随障碍" value={student.secondary_disability || '无'} />
                              <InfoItem label="障碍程度" value={student.disability_level} />
                              <InfoItem label="残疾证号" value={student.disability_card_no || '-'} />
                              <InfoItem label="诊断日期" value={student.diagnosis_date || '-'} />
                              <InfoItem label="诊断机构" value={student.diagnosis_org || '-'} />
                            </div>
                            {student.diagnosis_note && (
                              <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                                <p className="text-xs text-[#94A3B8] mb-1">诊断说明</p>
                                <p className="text-sm text-[#1E293B]">{student.diagnosis_note}</p>
                              </div>
                            )}
                          </div>
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary-500" />
                              特殊需求
                            </h4>
                            <p className="text-sm text-[#1E293B]">{student.special_needs || '无特殊需求记录'}</p>
                          </div>
                        </motion.div>
                      </TabsContent>

                      {/* Tab 3: Guardian Info */}
                      <TabsContent value="guardian" className="mt-0">
                        <motion.div
                          key="guardian"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-primary-500" />
                              家庭住址
                            </h4>
                            <p className="text-sm text-[#1E293B]">{student.address || '-'}</p>
                          </div>
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <Users className="w-4 h-4 text-primary-500" />
                              监护人信息
                            </h4>
                            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                              <InfoItem label="监护人姓名" value={student.guardian_name} />
                              <InfoItem label="与监护人关系" value={student.guardian_relation} />
                              <InfoItem label="监护人电话" value={student.guardian_phone} />
                              <InfoItem label="监护人2姓名" value={student.guardian2_name || '-'} />
                              <InfoItem label="监护人2电话" value={student.guardian2_phone || '-'} />
                            </div>
                          </div>
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <Phone className="w-4 h-4 text-primary-500" />
                              紧急联系
                            </h4>
                            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                              <InfoItem label="紧急联系人" value={student.emergency_contact || '-'} />
                              <InfoItem label="紧急联系电话" value={student.emergency_phone || '-'} />
                            </div>
                          </div>
                        </motion.div>
                      </TabsContent>

                      {/* Tab 4: Other Info */}
                      <TabsContent value="other" className="mt-0">
                        <motion.div
                          key="other"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-warning-500" />
                              过敏史
                            </h4>
                            <p className="text-sm text-[#1E293B]">{student.allergy_info || '无过敏史记录'}</p>
                          </div>
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <Stethoscope className="w-4 h-4 text-primary-500" />
                              既往病史
                            </h4>
                            <p className="text-sm text-[#1E293B]">{student.health_info || '无病史记录'}</p>
                          </div>
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                              <Pill className="w-4 h-4 text-primary-500" />
                              用药信息
                            </h4>
                            <p className="text-sm text-[#1E293B]">{student.medication_info || '无用药记录'}</p>
                          </div>
                          {student.remarks && (
                            <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                              <h4 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary-500" />
                                备注
                              </h4>
                              <p className="text-sm text-[#1E293B]">{student.remarks}</p>
                            </div>
                          )}
                        </motion.div>
                      </TabsContent>

                      {/* Tab 5: Attachments */}
                      <TabsContent value="attachments" className="mt-0">
                        <motion.div
                          key="attachments"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 text-center">
                            <FileText className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                            <p className="text-[#64748B] font-medium mb-1">暂无附件</p>
                            <p className="text-[#94A3B8] text-sm mb-4">该学生还没有上传任何附件</p>
                            <Button size="sm" className="bg-primary-500 hover:bg-primary-600 text-white">
                              上传附件
                            </Button>
                          </div>
                        </motion.div>
                      </TabsContent>

                      {/* Tab 6: Related Parents */}
                      <TabsContent value="parents" className="mt-0">
                        <motion.div
                          key="parents"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
                            <h4 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
                              <Users className="w-4 h-4 text-primary-500" />
                              关联家长
                            </h4>
                            <div className="space-y-4">
                              <div className="flex items-center gap-4 p-3 bg-[#F7F6F4] rounded-lg">
                                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-600">
                                  {student.guardian_name[0]}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-[#1E293B]">{student.guardian_name}</p>
                                  <p className="text-xs text-[#94A3B8]">{student.guardian_relation} · {student.guardian_phone}</p>
                                </div>
                                <Badge className="bg-success-50 text-success-600 border border-success-50 text-xs">主要监护人</Badge>
                              </div>
                              {student.guardian2_name && (
                                <div className="flex items-center gap-4 p-3 bg-[#F7F6F4] rounded-lg">
                                  <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center text-sm font-bold text-secondary-600">
                                    {student.guardian2_name[0]}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-[#1E293B]">{student.guardian2_name}</p>
                                    <p className="text-xs text-[#94A3B8]">第二监护人 · {student.guardian2_phone}</p>
                                  </div>
                                </div>
                              )}
                              {student.emergency_contact && (
                                <div className="flex items-center gap-4 p-3 bg-[#F7F6F4] rounded-lg">
                                  <div className="w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center text-sm font-bold text-warning-600">
                                    {student.emergency_contact[0]}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-[#1E293B]">{student.emergency_contact}</p>
                                    <p className="text-xs text-[#94A3B8]">紧急联系人 · {student.emergency_phone}</p>
                                  </div>
                                  <Badge className="bg-warning-50 text-warning-600 border border-warning-50 text-xs">紧急</Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </TabsContent>

                      {/* Tab 7: 安全档案（v4 特教内核 6.4） */}
                      <TabsContent value="safety" className="mt-0">
                        <motion.div
                          key="safety"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <SafetyTab studentId={Number(student.id)} studentName={student.name} />
                        </motion.div>
                      </TabsContent>

                      {/* Tab 8: 沟通方式（v4 特教内核 6.5） */}
                      <TabsContent value="communication" className="mt-0">
                        <motion.div
                          key="communication"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <CommunicationTab studentId={Number(student.id)} />
                        </motion.div>
                      </TabsContent>

                      {/* Tab 9: 行为干预 BIP（v4 特教内核 6.5） */}
                      <TabsContent value="intervention" className="mt-0">
                        <motion.div
                          key="intervention"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={tabContentClass}
                        >
                          <InterventionTab studentId={Number(student.id)} studentName={student.name} />
                        </motion.div>
                      </TabsContent>
                    </AnimatePresence>
                  </Tabs>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6 text-danger-500" />
            </div>
            <DialogTitle className="text-lg font-semibold text-[#1E293B]">确认删除</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              确定要删除学生 <strong className="text-[#1E293B]">{student.name}</strong> 的档案吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-danger-500 hover:bg-danger-600 text-white"
              onClick={() => { onDelete(student); setDeleteDialogOpen(false); onClose(); }}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
