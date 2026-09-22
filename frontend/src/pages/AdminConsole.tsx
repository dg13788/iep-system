/**
 * 系统管理员控制台（2026-09-20 新增）
 *
 * 仅限 permission_group_id = 1（超级管理员）访问：
 *   - 侧边栏入口按 hasMenu('admin') 过滤，仅该组可见；
 *   - 路由经 RouteGuard(menuKey="admin") 守卫，越权访问直接重定向；
 *   - 后端每个端点还有 requireSystemAdmin() 硬校验，前端被绕过也进不去。
 *
 * 四个页签：
 *   1) 数据总览 —— 表行数、库容量、备份概况、运行环境
 *   2) 全量数据 —— 按白名单表只读查阅并导出 CSV（绕过数据范围，仅管理员）
 *   3) 备份恢复 —— 一键备份 / 下载 / 删除 / 恢复（恢复需密码 + 确认短语）
 *   4) 系统初始化 —— 清空业务数据或重建最小演示数据（需密码 + 输入「初始化系统」）
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Database, ShieldAlert, Download, Trash2, RefreshCw, HardDriveDownload,
  AlertTriangle, Loader2, Search, ChevronLeft, ChevronRight, Table2, RotateCcw,
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
} from '@/services/admin';
import type {
  AdminOverview,
  AdminTableOption,
  AdminAllData,
  AdminBackupFile,
} from '@/services/admin';

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
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try { await downloadAdminBackup(b.file); } catch (e) { toast.error(e instanceof Error ? e.message : '下载失败'); }
                  }}>
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRestoreTarget(b.file); setConfirm(''); setPassword(''); }}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[#DC2626]" onClick={() => handleDelete(b.file)}>
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
            <div>
              <Label className="text-xs">请输入文件名以确认：{restoreTarget}</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={restoreTarget ?? ''} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={restoring || confirm !== restoreTarget || password === ''}
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
function InitTab({ onChanged }: { onChanged: () => void }) {
  const [mode, setMode] = useState<'reset' | 'demo'>('reset');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [running, setRunning] = useState(false);

  const canRun = password !== '' && confirm === '初始化系统';

  const handleInit = async () => {
    setRunning(true);
    try {
      const r = await initSystem({ mode, password, confirm });
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
            初始化会清空全部业务数据（学生 / 班级 / IEP / 评估 / 教学记录 / 行为干预 / 家长签名 / 家校沟通等），
            <b>但会保留账号、角色、权限组与字典表</b>，因此不会导致无法登录。
            执行前系统会自动再落一份备份；若自动备份失败，初始化会被中止、数据保持原样。
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-4 space-y-4">
        <div>
          <Label className="text-xs">初始化模式</Label>
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
                  <b>{m === 'reset' ? '清空业务数据' : '清空并重建最小演示数据'}</b>
                  <span className="block text-[#94A3B8]">
                    {m === 'reset' ? '初始化为空系统，等待录入真实数据' : '写入 3 个班级 + 6 名学生 + 对应家长，便于演示'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">登录密码（二次确认）</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="当前管理员登录密码" />
          </div>
          <div>
            <Label className="text-xs">请输入「初始化系统」四个字以确认</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="初始化系统" />
          </div>
        </div>

        <Button variant="destructive" disabled={!canRun || running} onClick={handleInit} className="gap-1.5">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          执行初始化
        </Button>
      </div>
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
          <p className="text-xs text-[#94A3B8]">系统管理员专属：所有数据 · 一键备份 · 系统初始化</p>
        </div>
        <Badge className="ml-auto bg-[#FEF3C7] text-[#B45309]">权限组：超级管理员</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5"><Database className="w-3.5 h-3.5" />数据总览</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Table2 className="w-3.5 h-3.5" />全量数据</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5"><HardDriveDownload className="w-3.5 h-3.5" />备份恢复</TabsTrigger>
          <TabsTrigger value="init" className="gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />系统初始化</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab onBackupsChanged={bump} />
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          <AllDataTab />
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
