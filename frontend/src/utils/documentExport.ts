/**
 * IEP System - Document Export (PDF & Word)
 * 文档导出工具：支持PDF和Word格式导出
 *
 * 导出右侧滑出面板的所有详细内容：
 * - 基本信息、评分/目标详情、对比数据、建议、签名确认等
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

/* ==================================================================== */
/*  Style Constants                                                      */
/* ==================================================================== */

const COLORS = {
  primary: '#977653',
  primaryLight: '#F5F0EB',
  dark: '#1E293B',
  gray: '#64748B',
  lightGray: '#94A3B8',
  border: '#E2E8F0',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
};

/* ==================================================================== */
/*  PDF Export — IEP Detail                                              */
/* ==================================================================== */

export function exportIEPDetailToPDF(plan: any, goals: any[], filename: string): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ── Header ──
  doc.setFillColor(159, 118, 83);
  doc.rect(0, 0, pageW, 60, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('个别化教育计划 (IEP)', margin, 38);
  doc.setFontSize(10);
  doc.text(`生成日期: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, pageW - margin - 140, 38);

  y = 80;

  // ── Basic Info ──
  doc.setTextColor(COLORS.dark as any);
  doc.setFontSize(14);
  doc.text('基本信息', margin, y);
  y += 18;

  const basicRows = [
    ['计划编号', plan.plan_code, '计划标题', plan.title],
    ['学生姓名', plan.student_name, '学号', plan.student_number],
    ['所在班级', plan.student_class, '学年/学期', `${plan.academic_year} ${plan.semester}`],
    ['开始日期', plan.start_date, '结束日期', plan.end_date],
    ['主要制定人', plan.primary_teacher, '团队成员', (plan.team_members || []).join('、') || '—'],
    ['目标数量', `${plan.goals_count} 个`, '当前进度', `${plan.progress_percent}%`],
    ['状态', plan.status, '', ''],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: basicRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, textColor: COLORS.dark as any },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 80 },
      1: { cellWidth: 160 },
      2: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 80 },
      3: { cellWidth: 160 },
    },
    alternateRowStyles: { fillColor: [247, 246, 244] },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // ── Goals ──
  if (goals.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(COLORS.dark as any);
    doc.text('长短期目标', margin, y);
    y += 18;

    goals.forEach((goal: any, idx: number) => {
      // Check page break
      if (y > doc.internal.pageSize.getHeight() - margin - 100) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(10);
      doc.setTextColor(COLORS.primary as any);
      doc.text(`目标 ${idx + 1}: ${goal.title || '—'}`, margin, y);
      y += 14;

      const goalRows = [
        ['领域', goal.area || '—', '类型', goal.goal_type || '—'],
        ['状态', goal.status || '—', '进度', `${goal.progress_percent || 0}%`],
        ['责任人', goal.responsible_teacher_name || goal.responsible_teacher || '—', '', ''],
        ['描述', goal.description || '—', '', ''],
        ['成功标准', goal.criteria || '—', '', ''],
        ['教学策略', goal.teaching_strategies || '—', '', ''],
        ['基线数据', goal.baseline || '—', '', ''],
        ['目标分数', `${goal.target_score || 0}`, '当前分数', `${goal.current_score || 0}`],
        ['开始日期', goal.start_date || '—', '截止日期', goal.target_date || '—'],
      ];

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        body: goalRows,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.dark as any },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 70 },
          1: { cellWidth: 180 },
          2: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 70 },
          3: { cellWidth: 180 },
        },
        alternateRowStyles: { fillColor: [250, 251, 252] },
      });

      y = (doc as any).lastAutoTable.finalY + 12;
    });
  }

  // ── Signature ──
  if (y > doc.internal.pageSize.getHeight() - margin - 80) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(14);
  doc.setTextColor(COLORS.dark as any);
  doc.text('签名确认', margin, y);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(COLORS.gray as any);
  doc.text('家长签名: ________________________     日期: ________________________', margin, y);
  y += 30;
  doc.text('教师签名: ________________________     日期: ________________________', margin, y);

  // ── Footer on every page ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(`启智IEP管理系统  —  第 ${i} / ${pageCount} 页`, margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`${filename}.pdf`);
}

/* ==================================================================== */
/*  PDF Export — Evaluation Report                                       */
/* ==================================================================== */

export function exportEvaluationToPDF(
  record: any,
  template: any,
  comparisonData: any[],
  grade: { label: string; color: string },
  pct: number,
  filename: string,
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ── Header ──
  doc.setFillColor(159, 118, 83);
  doc.rect(0, 0, pageW, 60, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('评估报告', margin, 38);
  doc.setFontSize(10);
  doc.text(`生成日期: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, pageW - margin - 140, 38);

  y = 80;

  // ── Basic Info ──
  doc.setTextColor(COLORS.dark as any);
  doc.setFontSize(14);
  doc.text('基本信息', margin, y);
  y += 18;

  const infoRows = [
    ['学生姓名', record.studentName || '—', '学号', record.studentNo || '—'],
    ['班级', record.className || '—', '评估日期', record.assessmentDate || '—'],
    ['评估者', record.assessor || '—', '评估类型', record.assessmentType || '—'],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, textColor: COLORS.dark as any },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 80 },
      1: { cellWidth: 160 },
      2: { fontStyle: 'bold', textColor: COLORS.primary as any, cellWidth: 80 },
      3: { cellWidth: 160 },
    },
    alternateRowStyles: { fillColor: [247, 246, 244] },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // ── Total Score ──
  doc.setFontSize(14);
  doc.setTextColor(COLORS.dark as any);
  doc.text('评估总分', margin, y);
  y += 18;

  doc.setFontSize(11);
  doc.setTextColor(COLORS.dark as any);
  doc.text(`总分: ${record.totalScore || 0} / ${record.maxScore || 0}`, margin, y);
  doc.text(`评级: ${grade.label || '—'}`, margin + 200, y);
  doc.text(`百分比: ${pct}%`, margin + 360, y);
  y += 20;

  // ── Dimension Scores ──
  if (template && template.dimensions) {
    doc.setFontSize(14);
    doc.setTextColor(COLORS.dark as any);
    doc.text('各维度得分', margin, y);
    y += 18;

    const dimHeader = [['维度', '得分', '满分', '百分比', '等级']];
    const dimBody = template.dimensions.map((dim: any) => {
      const dimMax = dim.items.reduce((s: number, it: any) => s + (it.maxScore || 0), 0);
      const dimScore = Math.round((record.totalScore || 0) * (dimMax / (record.maxScore || 1)));
      const dimPct = Math.round((dimScore / dimMax) * 100) || 0;
      const gLabel = dimPct >= 80 ? '优秀' : dimPct >= 60 ? '良好' : dimPct >= 40 ? '合格' : '需加强';
      return [dim.name, String(dimScore), String(dimMax), `${dimPct}%`, gLabel];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: dimHeader,
      body: dimBody,
      theme: 'striped',
      headStyles: { fillColor: [159, 118, 83], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, textColor: COLORS.dark as any },
      alternateRowStyles: { fillColor: [250, 251, 252] },
    });

    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // ── Cross-period Comparison ──
  if (comparisonData && comparisonData.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - margin - 120) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(14);
    doc.setTextColor(COLORS.dark as any);
    doc.text('与上期评估对比', margin, y);
    y += 18;

    const compHeader = [['维度', '当前得分', '上期得分', '变化']];
    const compBody = comparisonData.map((item: any) => [
      item.dimension,
      String(item.current),
      String(item.previous),
      item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '0',
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: compHeader,
      body: compBody,
      theme: 'striped',
      headStyles: { fillColor: [159, 118, 83], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, textColor: COLORS.dark as any },
      alternateRowStyles: { fillColor: [250, 251, 252] },
    });

    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // ── Recommendations ──
  if (record.recommendations) {
    if (y > doc.internal.pageSize.getHeight() - margin - 80) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(14);
    doc.setTextColor(COLORS.dark as any);
    doc.text('评估建议', margin, y);
    y += 18;

    doc.setFontSize(9);
    doc.setTextColor(COLORS.gray as any);

    // Wrap text
    const splitText = doc.splitTextToSize(record.recommendations, pageW - margin * 2);
    doc.text(splitText, margin, y);
    y += (splitText.length * 12) + 20;
  }

  // ── Signature ──
  if (y > doc.internal.pageSize.getHeight() - margin - 80) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(14);
  doc.setTextColor(COLORS.dark as any);
  doc.text('签名确认', margin, y);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(COLORS.gray as any);
  doc.text(`评估者签名 (${record.assessor || '—'}): ________________________     日期: ________________________`, margin, y);
  y += 30;
  doc.text('家长签名: ________________________     日期: ________________________', margin, y);

  // ── Footer ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(`启智IEP管理系统  —  第 ${i} / ${pageCount} 页`, margin, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`${filename}.pdf`);
}

/* ==================================================================== */
/*  Word Export — IEP Detail                                             */
/* ==================================================================== */

export function exportIEPDetailToWord(plan: any, goals: any[], filename: string): void {
  const now = format(new Date(), 'yyyy年MM月dd日 HH:mm');

  let goalsHtml = '';
  goals.forEach((goal: any, idx: number) => {
    goalsHtml += `
      <h3 style="color:#977653;font-size:12pt;margin-top:16px;margin-bottom:6px;">目标 ${idx + 1}: ${escapeHtml(goal.title || '—')}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:10px;" border="1" bordercolor="#E2E8F0">
        <tr style="background:#F5F0EB;"><td style="padding:4px 8px;width:15%;color:#977653;font-weight:bold;">领域</td><td style="padding:4px 8px;width:35%;">${escapeHtml(goal.area || '—')}</td><td style="padding:4px 8px;width:15%;color:#977653;font-weight:bold;">类型</td><td style="padding:4px 8px;width:35%;">${escapeHtml(goal.goal_type || '—')}</td></tr>
        <tr><td style="padding:4px 8px;color:#977653;font-weight:bold;">状态</td><td style="padding:4px 8px;">${escapeHtml(goal.status || '—')}</td><td style="padding:4px 8px;color:#977653;font-weight:bold;">进度</td><td style="padding:4px 8px;">${goal.progress_percent || 0}%</td></tr>
        <tr style="background:#FAFBFC;"><td style="padding:4px 8px;color:#977653;font-weight:bold;">责任人</td><td style="padding:4px 8px;" colspan="3">${escapeHtml(goal.responsible_teacher_name || goal.responsible_teacher || '—')}</td></tr>
        <tr><td style="padding:4px 8px;color:#977653;font-weight:bold;">描述</td><td style="padding:4px 8px;" colspan="3">${escapeHtml(goal.description || '—')}</td></tr>
        <tr style="background:#FAFBFC;"><td style="padding:4px 8px;color:#977653;font-weight:bold;">成功标准</td><td style="padding:4px 8px;" colspan="3">${escapeHtml(goal.criteria || '—')}</td></tr>
        <tr><td style="padding:4px 8px;color:#977653;font-weight:bold;">教学策略</td><td style="padding:4px 8px;" colspan="3">${escapeHtml(goal.teaching_strategies || '—')}</td></tr>
        <tr style="background:#FAFBFC;"><td style="padding:4px 8px;color:#977653;font-weight:bold;">基线数据</td><td style="padding:4px 8px;" colspan="3">${escapeHtml(goal.baseline || '—')}</td></tr>
        <tr><td style="padding:4px 8px;color:#977653;font-weight:bold;">目标分数</td><td style="padding:4px 8px;">${goal.target_score || 0}</td><td style="padding:4px 8px;color:#977653;font-weight:bold;">当前分数</td><td style="padding:4px 8px;">${goal.current_score || 0}</td></tr>
      </table>
    `;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IEP详情 - ${escapeHtml(plan.student_name || '')}</title>
  <style>
    body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 10.5pt; line-height: 1.6; color: #1E293B; }
    h1 { font-size: 18pt; color: #977653; border-bottom: 2px solid #977653; padding-bottom: 8px; }
    h2 { font-size: 14pt; color: #1E293B; margin-top: 20px; border-left: 4px solid #977653; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { border: 1px solid #E2E8F0; padding: 5px 10px; }
    .header { background: #977653; color: white; padding: 20px 30px; }
    .header h1 { color: white; border: none; margin: 0; }
    .footer { margin-top: 40px; border-top: 1px solid #E2E8F0; padding-top: 10px; font-size: 9pt; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>个别化教育计划 (IEP)</h1>
    <p style="margin:4px 0 0 0;font-size:10pt;">启智IEP管理系统  |  生成日期: ${now}</p>
  </div>

  <h2>基本信息</h2>
  <table>
    <tr style="background:#F5F0EB;"><td style="width:15%;color:#977653;font-weight:bold;">计划编号</td><td style="width:35%;">${escapeHtml(plan.plan_code || '—')}</td><td style="width:15%;color:#977653;font-weight:bold;">计划标题</td><td style="width:35%;">${escapeHtml(plan.title || '—')}</td></tr>
    <tr><td style="color:#977653;font-weight:bold;">学生姓名</td><td>${escapeHtml(plan.student_name || '—')}</td><td style="color:#977653;font-weight:bold;">学号</td><td>${escapeHtml(plan.student_number || '—')}</td></tr>
    <tr style="background:#F5F0EB;"><td style="color:#977653;font-weight:bold;">所在班级</td><td>${escapeHtml(plan.student_class || '—')}</td><td style="color:#977653;font-weight:bold;">学年/学期</td><td>${escapeHtml(plan.academic_year || '—')} ${escapeHtml(plan.semester || '')}</td></tr>
    <tr><td style="color:#977653;font-weight:bold;">开始日期</td><td>${escapeHtml(plan.start_date || '—')}</td><td style="color:#977653;font-weight:bold;">结束日期</td><td>${escapeHtml(plan.end_date || '—')}</td></tr>
    <tr style="background:#F5F0EB;"><td style="color:#977653;font-weight:bold;">主要制定人</td><td>${escapeHtml(plan.primary_teacher || '—')}</td><td style="color:#977653;font-weight:bold;">团队成员</td><td>${escapeHtml((plan.team_members || []).join('、') || '—')}</td></tr>
    <tr><td style="color:#977653;font-weight:bold;">目标数量</td><td>${plan.goals_count || 0} 个</td><td style="color:#977653;font-weight:bold;">当前进度</td><td>${plan.progress_percent || 0}%</td></tr>
    <tr style="background:#F5F0EB;"><td style="color:#977653;font-weight:bold;">状态</td><td colspan="3">${escapeHtml(plan.status || '—')}</td></tr>
  </table>

  <h2>长短期目标 (${goals.length} 个)</h2>
  ${goalsHtml || '<p style="color:#94A3B8;">暂无目标数据</p>'}

  <h2>签名确认</h2>
  <table>
    <tr><td style="width:50%;padding:20px;">家长签名: ________________________<br/>日期: ________________________</td><td style="width:50%;padding:20px;">教师签名: ________________________<br/>日期: ________________________</td></tr>
  </table>

  <div class="footer">
    <p>本文件由启智IEP管理系统自动生成，仅供教育参考使用。</p>
  </div>
</body>
</html>`;

  downloadWord(html, filename);
}

/* ==================================================================== */
/*  Word Export — Evaluation Report                                      */
/* ==================================================================== */

export function exportEvaluationToWord(
  record: any,
  template: any,
  comparisonData: any[],
  grade: { label: string; color: string },
  pct: number,
  filename: string,
): void {
  const now = format(new Date(), 'yyyy年MM月dd日 HH:mm');

  // Dimension scores table
  let dimHtml = '';
  if (template && template.dimensions) {
    dimHtml = '<table><tr style="background:#977653;color:white;"><td style="padding:5px 10px;font-weight:bold;">维度</td><td style="padding:5px 10px;font-weight:bold;">得分</td><td style="padding:5px 10px;font-weight:bold;">满分</td><td style="padding:5px 10px;font-weight:bold;">百分比</td><td style="padding:5px 10px;font-weight:bold;">等级</td></tr>';
    template.dimensions.forEach((dim: any, i: number) => {
      const dimMax = dim.items.reduce((s: number, it: any) => s + (it.maxScore || 0), 0);
      const dimScore = Math.round((record.totalScore || 0) * (dimMax / (record.maxScore || 1)));
      const dimPct = Math.round((dimScore / dimMax) * 100) || 0;
      const gLabel = dimPct >= 80 ? '优秀' : dimPct >= 60 ? '良好' : dimPct >= 40 ? '合格' : '需加强';
      const bg = i % 2 === 0 ? '' : 'background:#FAFBFC;';
      dimHtml += `<tr style="${bg}"><td style="padding:4px 10px;">${escapeHtml(dim.name)}</td><td style="padding:4px 10px;">${dimScore}</td><td style="padding:4px 10px;">${dimMax}</td><td style="padding:4px 10px;">${dimPct}%</td><td style="padding:4px 10px;">${gLabel}</td></tr>`;
    });
    dimHtml += '</table>';
  }

  // Comparison table
  let compHtml = '';
  if (comparisonData && comparisonData.length > 0) {
    compHtml = '<table><tr style="background:#977653;color:white;"><td style="padding:5px 10px;font-weight:bold;">维度</td><td style="padding:5px 10px;font-weight:bold;">当前得分</td><td style="padding:5px 10px;font-weight:bold;">上期得分</td><td style="padding:5px 10px;font-weight:bold;">变化</td></tr>';
    comparisonData.forEach((item: any, i: number) => {
      const changeStr = item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '0';
      const bg = i % 2 === 0 ? '' : 'background:#FAFBFC;';
      compHtml += `<tr style="${bg}"><td style="padding:4px 10px;">${escapeHtml(item.dimension)}</td><td style="padding:4px 10px;">${item.current}</td><td style="padding:4px 10px;">${item.previous}</td><td style="padding:4px 10px;">${changeStr}</td></tr>`;
    });
    compHtml += '</table>';
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>评估报告 - ${escapeHtml(record.studentName || '')}</title>
  <style>
    body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 10.5pt; line-height: 1.6; color: #1E293B; }
    h1 { font-size: 18pt; color: #977653; border-bottom: 2px solid #977653; padding-bottom: 8px; }
    h2 { font-size: 14pt; color: #1E293B; margin-top: 20px; border-left: 4px solid #977653; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
    td { border: 1px solid #E2E8F0; }
    .header { background: #977653; color: white; padding: 20px 30px; }
    .header h1 { color: white; border: none; margin: 0; }
    .footer { margin-top: 40px; border-top: 1px solid #E2E8F0; padding-top: 10px; font-size: 9pt; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>评估报告</h1>
    <p style="margin:4px 0 0 0;font-size:10pt;">启智IEP管理系统  |  生成日期: ${now}</p>
  </div>

  <h2>基本信息</h2>
  <table>
    <tr style="background:#F5F0EB;"><td style="width:15%;color:#977653;font-weight:bold;">学生姓名</td><td style="width:35%;">${escapeHtml(record.studentName || '—')}</td><td style="width:15%;color:#977653;font-weight:bold;">学号</td><td style="width:35%;">${escapeHtml(record.studentNo || '—')}</td></tr>
    <tr><td style="color:#977653;font-weight:bold;">班级</td><td>${escapeHtml(record.className || '—')}</td><td style="color:#977653;font-weight:bold;">评估日期</td><td>${escapeHtml(record.assessmentDate || '—')}</td></tr>
    <tr style="background:#F5F0EB;"><td style="color:#977653;font-weight:bold;">评估者</td><td>${escapeHtml(record.assessor || '—')}</td><td style="color:#977653;font-weight:bold;">评估类型</td><td>${escapeHtml(record.assessmentType || '—')}</td></tr>
  </table>

  <h2>评估总分</h2>
  <table>
    <tr style="background:#F5F0EB;"><td style="width:25%;color:#977653;font-weight:bold;">总分</td><td style="width:25%;">${record.totalScore || 0} / ${record.maxScore || 0}</td><td style="width:25%;color:#977653;font-weight:bold;">百分比</td><td style="width:25%;">${pct}%</td></tr>
    <tr><td style="color:#977653;font-weight:bold;">评级</td><td colspan="3" style="font-weight:bold;">${escapeHtml(grade.label || '—')}</td></tr>
  </table>

  <h2>各维度得分</h2>
  ${dimHtml || '<p style="color:#94A3B8;">暂无维度数据</p>'}

  <h2>与上期评估对比</h2>
  ${compHtml || '<p style="color:#94A3B8;">暂无对比数据</p>'}

  <h2>评估建议</h2>
  <p style="padding:10px;background:#F7F6F4;border:1px solid #E2E8F0;border-radius:4px;">${escapeHtml(record.recommendations || '暂无评估建议')}</p>

  <h2>签名确认</h2>
  <table>
    <tr><td style="width:50%;padding:20px;">评估者签名 (${escapeHtml(record.assessor || '—')}): ________________________<br/>日期: ________________________</td><td style="width:50%;padding:20px;">家长签名: ________________________<br/>日期: ________________________</td></tr>
  </table>

  <div class="footer">
    <p>本文件由启智IEP管理系统自动生成，仅供教育参考使用。</p>
  </div>
</body>
</html>`;

  downloadWord(html, filename);
}

/* ==================================================================== */
/*  Helpers                                                              */
/* ==================================================================== */

function downloadWord(html: string, filename: string): void {
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
  saveAs(blob, `${filename}.doc`);
}

function escapeHtml(text: string): string {
  if (!text) return '—';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
