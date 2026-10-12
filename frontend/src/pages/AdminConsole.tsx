/**
 * 系统管理员控制台（2026-09-20 新增；v15 数据导入/初始化整改）
 *
 * 仅限 permission_group_id = 1（超级管理员）访问：
 *   - 侧边栏入口按 hasMenu('admin') 过滤，仅该组可见；
 *   - 路由经 RouteGuard(menuKey="admin") 守卫，越权访问直接重定向；
 *   - 后端每个端点还有 requireSystemAdmin() 硬校验，前端被绕过也进不去。
 *
 * 五个页签：
 *   1) 数据总览 —— 表行数、库容量、备份概况、运行环境
 *   2) 全量数据 —— 按白名单表只读查阅并导出 CSV（绕过数据范围，仅管理员）
 *   3) 数据导入 —— 下载模板 → 上传 → 预检报告 → 确认导入（v15 新增，
 *      复用各业务模块既有 import 端点；预检 dry_run 不落库）
 *   4) 备份恢复 —— 一键备份 / 下载 / 删除 / 恢复（恢复需密码 + 确认短语=文件名）
 *   5) 系统初始化 —— 清空所有数据或重建最小演示数据（需密码 + 输入「系统初始化」）
 *
 * v15 交互铁律（ADR-034）：不可逆操作的确认短语必须「可自证」——
 *   一键复制、输入不符时实时说明差异、按钮禁用时列出未满足的条件。
 *   禁止「静默禁用」：v14 及以前确认短语「初始化系统」与页签名「系统初始化」
 *   用字相同顺序相反，管理员按页签输入后按钮无提示禁用，实测直接卡死。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Database, ShieldAlert, Download, Trash2, RefreshCw, HardDriveDownload,
  AlertTriangle, Loader2, ChevronLeft, ChevronRight, Table2, RotateCcw,
  Copy, Check, Upload, FileUp, ListChecks, FileDown,
} from 'lucide-react';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchAdminOverview,
  fetchAdminTables,
  fetchAdminAllData,
  fetchAdminBackups,
  createAdminBackup,
  deleteAdminBackup,
  restoreAdminBackup,
  initSystem,
  downloadAdminTableCsv,
  downloadAdminBackup,
  downloadImportTemplate,
  fetchImportTemplateColumns,
  importModuleData,
  isPrecheckResult,
  IMPORT_MODULES,
} from '@/services/admin';
import type {
  AdminOverview,
  AdminTableOption,
  AdminAllData,
  AdminBackupFile,
  ImportModule,
  ImportPrecheckResult,
  ImportExecuteResult,
} from '@/services/admin';

/* ============================================================
 * 通用：确认短语输入（一键复制 + 实时差异提示）
 * ADR-034：确认短语必须与界面呈现给用户的字面一致，且可自证。
 * ============================================================ */
function ConfirmPhraseInput({
  phrase,
  value,
  onChange,
  label,
  placeholder,
}: {
  phrase: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      toast.success('已复制到剪贴板，可直接粘贴');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板 API 不可用（非安全上下文等）时退回选中输入框内容
      toast.error('复制失败，请手动输入：' + phrase);
    }
  };

  const matched = value === phrase;
  const touched = value !== '';

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-[#977653] hover:text-[#7c6244]"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制短语'}
        </button>
      </div>
      <div className="flex gap-2 mt-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? phrase}
          className={matched ? 'border-[#16A34A] focus-visible:ring-[#16A34A]' : touched ? 'border-[#DC2626]' : ''}
        />
        {matched && <Check className="w-4 h-4 text-[#16A34A] self-center flex-shrink-0" />}
      </div>
      {touched && !matched && (
        <p className="text-xs text-[#DC2626] mt-1">
          与「{phrase}」不一致（当前输入：{value || '空'}），请照「{phrase}」输入或点右上角复制
        </p>
      )}
      {matched && <p className="text-xs text-[#16A34A] mt-1">确认短语正确</p>}
    </div>
  );
}

/* ============================================================
 * 数据总览
 * ============================================================ */
function OverviewTab({ onBackupsChanged }: { onBackupsChanged: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAdminOverview());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '总览加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBackup = async () => {
    setBacking(true);
    try {
      const r = await createAdminBackup();
      toast.success(`备份完成：${r.file}（${r.size_mb}MB / ${r.tables} 表 / ${r.rows} 行）`);
      await load();
      onBackupsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '备份失败');
    } finally {
      setBacking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[#94A3B8]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 正在统计…
      </div>
    );
  }
  if (!data) return null;

  const cards = [
    { label: '在校学生', value: data.metrics.student_count ?? 0 },
    { label: '班级', value: data.metrics.class_count ?? 0 },
    { label: 'IEP 计划', value: data.metrics.iep_count ?? 0 },
    { label: '启用账号', value: data.metrics.user_count ?? 0 },
    { label: '数据库容量', value: `${data.db_size_mb} MB` },
    { label: '备份文件', value: `${data.backup_count} 个 / ${data.backup_size_mb} MB` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-3">
            <p className="text-xs text-[#94A3B8]">{c.label}</p>
            <p className="text-lg font-semibold text-[#1E293B] mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white border border-[#E2E8F0] rounded-lg px-4 py-3">
        <Button onClick={handleBackup} disabled={backing} className="gap-1.5">
          {backing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
          一键备份
        </Button>
        <span className="text-xs text-[#64748B]">
          最近备份：{data.last_backup ? `${data.last_backup}（${data.last_backup_at}）` : '暂无'}
        </span>
        <span className="text-xs text-[#94A3B8] ml-auto">
          PHP {data.env.php_version} · MySQL {String(data.env.db_version).split('-')[0]} · 备份目录
          {data.env.backup_dir_writable ? '可写' : <span className="text-[#DC2626]">不可写</span>}
        </span>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#F1F5F9] flex items-center gap-2">
          <Database className="w-4 h-4 text-[#977653]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">核心业务数据行数</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#F1F5F9]">
          {Object.entries(data.table_counts).map(([t, n]) => (
            <div key={t} className="bg-white px-4 py-2.5">
              <p className="text-xs text-[#94A3B8]">{data.table_labels[t] ?? t}</p>
              <p className="text-sm font-medium text-[#1E293B]">{n ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 全量数据
 * ============================================================ */
function AllDataTab() {
  const [tables, setTables] = useState<AdminTableOption[]>([]);
  const [table, setTable] = useState<string>('students');
  const [result, setResult] = useState<AdminAllData | null>(null);
  const [page, setPage] = useState(1);
  const [withDeleted, setWithDeleted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdminTables()
      .then(setTables)
      .catch(() => toast.error('表清单加载失败'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await fetchAdminAllData({ table, page, pageSize: 20, with_deleted: withDeleted ? 1 : 0 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '查询失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [table, page, withDeleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white border border-[#E2E8F0] rounded-lg px-4 py-3">
        <Select value={table} onValueChange={(v) => { setTable(v); setPage(1); }}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t.table} value={t.table}>
                {t.label}（{t.count ?? '—'}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch id="wd" checked={withDeleted} onCheckedChange={(v) => { setWithDeleted(v); setPage(1); }} />
          <Label htmlFor="wd" className="text-xs text-[#64748B]">含已删除</Label>
        </div>

        <Button
          variant="outline"
          className="gap-1.5"
          onClick={async () => {
            try {
              await downloadAdminTableCsv(table);
              toast.success('已导出 CSV');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : '导出失败');
            }
          }}
        >
          <Download className="w-4 h-4" /> 导出本表 CSV
        </Button>

        <span className="text-xs text-[#94A3B8] ml-auto">
          共 {result?.total ?? 0} 行 · 仅管理员可见 · 单次最多 100 行
        </span>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#94A3B8]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 查询中…
          </div>
        ) : !result || result.list.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#94A3B8]">该表暂无数据</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.list.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map((c) => {
                    const v = row[c];
                    const text = v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return (
                      <TableCell key={c} className="text-xs whitespace-nowrap max-w-[260px] truncate" title={text}>
                        {text}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs text-[#64748B]">{page} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
 * 数据导入（v15 新增）
 * 流程：选模块 → 下载模板/查看列格式 → 选文件 → 预检（不落库）→ 确认导入
 * ============================================================ */
function ImportTab() {
  const [module, setModule] = useState<ImportModule>('students');
  const [columns, setColumns] = useState<string[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [precheck, setPrecheck] = useState<ImportPrecheckResult | null>(null);
  const [prechecking, setPrechecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportExecuteResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeMeta = IMPORT_MODULES.find((m) => m.module === module)!;

  // 切换模块时拉取模板表头（列名以后端为唯一口径，界面不另存一份）
  useEffect(() => {
    let alive = true;
    setColumnsLoading(true);
    setColumns([]);
    fetchImportTemplateColumns(module)
      .then((cols) => { if (alive) setColumns(cols); })
      .catch(() => { if (alive) setColumns([]); })
      .finally(() => { if (alive) setColumnsLoading(false); });
    return () => { alive = false; };
  }, [module]);

  const resetFlow = () => {
    setFile(null);
    setPrecheck(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePrecheck = async () => {
    if (!file) return;
    setPrechecking(true);
    setPrecheck(null);
    setResult(null);
    try {
      const r = await importModuleData(module, file, true);
      if (!isPrecheckResult(r)) {
        throw new Error('预检返回异常，请重试');
      }
      setPrecheck(r);
      if (r.would_insert === 0) {
        toast.warning(`预检完成：没有可导入的行（${r.would_skip} 行将被跳过）`);
      } else {
        toast.success(`预检完成：${r.would_insert} 行可导入，${r.would_skip} 行跳过（未写入任何数据）`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '预检失败');
    } finally {
      setPrechecking(false);
    }
  };

  const handleImport = async () => {
    if (!file || !precheck) return;
    setImporting(true);
    try {
      const r = await importModuleData(module, file, false);
      if (isPrecheckResult(r)) {
        throw new Error('导入返回异常，请重试');
      }
      setResult(r);
      setPrecheck(null);
      toast.success(`导入完成：成功 ${r.inserted} 条${r.failed > 0 ? `，跳过 ${r.failed} 条` : ''}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 步骤 1：选择模块 */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-[#977653]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">第一步：选择导入模块</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {IMPORT_MODULES.map((m) => (
            <button
              key={m.module}
              type="button"
              onClick={() => { setModule(m.module); resetFlow(); }}
              className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                module === m.module
                  ? 'border-[#977653] bg-[#FDF6E9] text-[#1E293B]'
                  : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]'
              }`}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block text-[#94A3B8] mt-0.5 leading-snug">{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              try {
                await downloadImportTemplate(module);
                toast.success(`已下载「${activeMeta.label}」导入模板`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : '模板下载失败');
              }
            }}
          >
            <FileDown className="w-3.5 h-3.5" /> 下载导入模板（{activeMeta.label}）
          </Button>
          <span className="text-xs text-[#94A3B8]">模板只有一行表头，按列填写后上传</span>
        </div>

        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
          <p className="text-xs text-[#64748B] mb-1.5">
            模板列格式（来自系统当前口径，改模板只需改后端一处）：
          </p>
          {columnsLoading ? (
            <span className="text-xs text-[#94A3B8]">加载中…</span>
          ) : columns.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {columns.map((c, i) => (
                <Badge key={c} variant="outline" className="text-xs font-normal">
                  {i + 1}. {c}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[#94A3B8]">列格式加载失败，可点上方按钮下载模板查看</span>
          )}
        </div>
      </div>

      {/* 步骤 2：选择文件 */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#977653]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">第二步：选择填好的文件（csv / xlsx / xls）</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPrecheck(null); setResult(null); }}
            className="max-w-md text-xs"
          />
          <Button onClick={handlePrecheck} disabled={!file || prechecking} className="gap-1.5">
            {prechecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            开始预检（不写入数据）
          </Button>
          {file && (
            <span className="text-xs text-[#64748B]">
              已选择：{file.name}（{(file.size / 1024).toFixed(1)} KB）
            </span>
          )}
        </div>
      </div>

      {/* 步骤 3：预检报告 */}
      {precheck && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-[#977653]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">第三步：预检报告</h3>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="px-3 py-2 rounded-md bg-[#F0FDF4] border border-[#BBF7D0]">
              <p className="text-xs text-[#15803D]">可导入</p>
              <p className="text-lg font-semibold text-[#15803D]">{precheck.would_insert} 行</p>
            </div>
            <div className="px-3 py-2 rounded-md bg-[#FEF2F2] border border-[#FECACA]">
              <p className="text-xs text-[#B91C1C]">将跳过</p>
              <p className="text-lg font-semibold text-[#B91C1C]">{precheck.would_skip} 行</p>
            </div>
          </div>
          {precheck.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              {precheck.errors.map((err, i) => (
                <p key={i} className="text-xs text-[#B91C1C] leading-relaxed">{err}</p>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleImport}
              disabled={importing || precheck.would_insert === 0}
              className="gap-1.5"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              确认导入 {precheck.would_insert} 行
            </Button>
            <Button variant="outline" onClick={resetFlow} disabled={importing}>重新选择文件</Button>
            <span className="text-xs text-[#94A3B8]">预检未写入任何数据；确认后才会真正落库</span>
          </div>
        </div>
      )}

      {/* 步骤 4：导入结果 */}
      {result && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#16A34A]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">导入结果</h3>
          </div>
          <p className="text-xs text-[#64748B]">
            成功 <b className="text-[#15803D]">{result.inserted}</b> 条 · 跳过 <b className="text-[#B91C1C]">{result.failed}</b> 条 · 共 {result.total} 行
          </p>
          {result.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-[#B91C1C] leading-relaxed">{err}</p>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={resetFlow}>再导入一个文件</Button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 备份恢复
 * ============================================================ */
function BackupTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [list, setList] = useState<AdminBackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await fetchAdminBackups());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '备份清单加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await createAdminBackup();
      toast.success(`备份完成：${r.file}（${r.size_mb}MB）`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '备份失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (file: string) => {
    try {
      await deleteAdminBackup(file);
      toast.success('已删除：' + file);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const r = await restoreAdminBackup({ file: restoreTarget, password, confirm });
      toast.success(`已从 ${r.restored_from} 恢复（恢复前自动备份：${r.pre_backup}）`);
      setRestoreTarget(null);
      setPassword('');
      setConfirm('');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败');
    } finally {
      setRestoring(false);
    }
  };

  const phraseOk = restoreTarget !== null && confirm === restoreTarget;
  const reasons: string[] = [];
  if (password === '') reasons.push('登录密码');
  if (!phraseOk) reasons.push('确认短语（须与文件名一致）');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-white border border-[#E2E8F0] rounded-lg px-4 py-3">
        <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
          一键备份
        </Button>
        <span className="text-xs text-[#64748B]">
          纯 PHP 导出整库 SQL，不依赖 mysqldump；恢复前会自动再留一份当前状态
        </span>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">文件名</TableHead>
              <TableHead className="text-xs">大小</TableHead>
              <TableHead className="text-xs">创建时间</TableHead>
              <TableHead className="text-xs text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-xs text-[#94A3B8]">加载中…</TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-xs text-[#94A3B8]">暂无备份文件</TableCell></TableRow>
            ) : list.map((b) => (
              <TableRow key={b.file}>
                <TableCell className="text-xs font-mono">{b.file}</TableCell>
                <TableCell className="text-xs">{b.size_mb} MB</TableCell>
                <TableCell className="text-xs">{b.created_at}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="sm" title="下载" onClick={async () => {
                    try { await downloadAdminBackup(b.file); } catch (e) { toast.error(e instanceof Error ? e.message : '下载失败'); }
                  }}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" title="恢复" onClick={() => { setRestoreTarget(b.file); setConfirm(''); setPassword(''); }}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[#DC2626]" title="删除" onClick={() => handleDelete(b.file)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={restoreTarget !== null} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#B45309]">
              <AlertTriangle className="w-4 h-4" /> 恢复备份：{restoreTarget}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              恢复会<b>整库覆盖</b>当前数据（含账号与权限）。请先确认这份备份是正确的。
              系统会先自动备份当前状态，再执行恢复；若恢复失败将自动回滚。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">登录密码（二次确认）</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入当前管理员登录密码" />
            </div>
            <ConfirmPhraseInput
              phrase={restoreTarget ?? ''}
              value={confirm}
              onChange={setConfirm}
              label="请输入备份文件名以确认"
            />
            {reasons.length > 0 && (
              <p className="text-xs text-[#94A3B8]">还需完成：{reasons.join('、')}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={restoring || !phraseOk || password === ''}
              onClick={handleRestore}
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} 确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
 * 系统初始化
 * ============================================================ */
const INIT_PHRASE = '系统初始化';

function InitTab({ onChanged }: { onChanged: () => void }) {
  const [mode, setMode] = useState<'reset' | 'demo'>('reset');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<{
    mode: string; backup: string; cleared: number; seeded: number;
  } | null>(null);

  const phraseOk = confirm === INIT_PHRASE;
  const canRun = password !== '' && phraseOk;
  const reasons: string[] = [];
  if (password === '') reasons.push('登录密码');
  if (!phraseOk) reasons.push(`确认短语「${INIT_PHRASE}」`);

  const handleInit = async () => {
    setRunning(true);
    try {
      const r = await initSystem({ mode, password, confirm });
      setReport({ mode: r.mode, backup: r.backup, cleared: r.cleared, seeded: r.seeded });
      toast.success(`初始化完成：清空 ${r.cleared} 张表${mode === 'demo' ? '，并写入最小演示数据' : ''}（初始化前备份：${r.backup}）`);
      setPassword('');
      setConfirm('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '初始化失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-[#DC2626] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#7F1D1D] leading-relaxed">
          <p className="font-semibold mb-1">不可逆操作，请务必先做备份</p>
          <p>
            初始化会清空全部业务数据（学生 / 班级 / IEP / 评估 / 教学记录 / 行为干预 / 转衔 /
            干预调整 / 目标草稿 / 家长签名 / 家校沟通 / 家长会议意见等），
            <b>但会保留账号、角色、权限组、字典与评估模板</b>，因此不会导致无法登录。
            执行前系统会自动再落一份备份；若自动备份失败，初始化会被中止、数据保持原样。
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-4">
        <div>
          <Label className="text-xs">初始化模式（「清空所有数据」= 选「清空业务数据」）</Label>
          <div className="flex gap-4 mt-2">
            {(['reset', 'demo'] as const).map((m) => (
              <label key={m} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="init-mode"
                  className="mt-0.5"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span className="text-xs">
                  <b>{m === 'reset' ? '清空所有数据（清空业务数据）' : '清空并重建最小演示数据'}</b>
                  <span className="block text-[#94A3B8]">
                    {m === 'reset'
                      ? '业务数据全部清空，等待录入真实数据；账号/权限/字典/模板保留'
                      : '写入 3 个班级 + 6 名学生 + 对应家长，便于演示'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">登录密码（二次确认）</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="当前管理员登录密码" className="mt-1" />
          </div>
          <ConfirmPhraseInput
            phrase={INIT_PHRASE}
            value={confirm}
            onChange={setConfirm}
            label={`请输入「${INIT_PHRASE}」以确认`}
          />
        </div>

        {!canRun && (
          <p className="text-xs text-[#94A3B8]">还需完成：{reasons.join('、')}</p>
        )}

        <Button variant="destructive" disabled={!canRun || running} onClick={handleInit} className="gap-1.5">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          执行初始化
        </Button>
      </div>

      {report && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#16A34A]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">本次初始化报告</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-[#94A3B8]">模式</p>
              <p className="text-sm font-medium">{report.mode === 'demo' ? '清空并重建演示数据' : '清空业务数据'}</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">清空业务表</p>
              <p className="text-sm font-medium">{report.cleared} 张</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">演示种子语句</p>
              <p className="text-sm font-medium">{report.seeded} 条</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">初始化前自动备份</p>
              <button
                type="button"
                className="text-sm font-medium text-[#977653] hover:underline font-mono"
                onClick={async () => {
                  try { await downloadAdminBackup(report.backup); } catch { toast.error('下载失败'); }
                }}
              >
                {report.backup}（点击下载）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 页面
 * ============================================================ */
export default function AdminConsole() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1E293B] flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">管理控制台</h1>
          <p className="text-xs text-[#94A3B8]">系统管理员专属：所有数据 · 数据导入 · 一键备份 · 系统初始化</p>
        </div>
        <Badge className="ml-auto bg-[#FEF3C7] text-[#B45309]">权限组：超级管理员</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5"><Database className="w-3.5 h-3.5" />数据总览</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Table2 className="w-3.5 h-3.5" />全量数据</TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5"><Upload className="w-3.5 h-3.5" />数据导入</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5"><HardDriveDownload className="w-3.5 h-3.5" />备份恢复</TabsTrigger>
          <TabsTrigger value="init" className="gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />系统初始化</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab onBackupsChanged={bump} />
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          <AllDataTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>
        <TabsContent value="backup" className="mt-4">
          <BackupTab refreshKey={refreshKey} onChanged={bump} />
        </TabsContent>
        <TabsContent value="init" className="mt-4">
          <InitTab onChanged={bump} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
