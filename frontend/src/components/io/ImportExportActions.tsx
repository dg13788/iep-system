/**
 * 通用导入导出按钮组（对接后端 io_engine 接口）
 *
 * 渲染两个按钮：
 *   - 导出：下拉菜单选择 csv / xlsx / docx / pdf / markdown / json
 *   - 导入：选择文件（csv / xlsx / xls）上传，结果 toast 提示并触发 onImported 刷新
 */
import { useRef, useState } from 'react';
import { Download, Upload, FileDown, FileUp, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  EXPORT_FORMAT_OPTIONS,
  ioExportDownload,
  ioImportUpload,
  type ExportFormat,
  type ImportResult,
} from '@/utils/ioExport';

interface ImportExportActionsProps {
  /** 后端模块名：students / iep / teaching / assessments / parents */
  module: string;
  /** 导出透传给后端 export 接口的过滤参数 */
  exportParams?: Record<string, unknown>;
  /** 下载文件名前缀（默认「{模块}数据」） */
  filenameBase?: string;
  /** 导入成功（含部分失败）后的刷新回调 */
  onImported?: () => void;
  /** 只读模式：不显示导入入口 */
  readOnly?: boolean;
  /** 是否显示导入按钮 */
  showImport?: boolean;
  /** 按钮尺寸 */
  size?: 'sm' | 'default';
  /** 导出按钮变体 */
  variant?: 'outline' | 'ghost' | 'secondary' | 'default';
}

const MODULE_LABEL: Record<string, string> = {
  students: '学生数据',
  iep: 'IEP计划',
  teaching: '教学记录',
  assessments: '评估数据',
  parents: '家长沟通',
};

export default function ImportExportActions({
  module,
  exportParams,
  filenameBase,
  onImported,
  readOnly = false,
  showImport = true,
  size = 'sm',
  variant = 'outline',
}: ImportExportActionsProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const base = filenameBase || MODULE_LABEL[module] || module;

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await ioExportDownload(module, format, exportParams, base);
      toast.success(`已导出 ${format.toUpperCase()} 文件`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const result: ImportResult = await ioImportUpload(module, file);
      const parts: string[] = [];
      if (result.inserted) parts.push(`新增 ${result.inserted}`);
      if (result.updated) parts.push(`更新 ${result.updated}`);
      if (result.failed) parts.push(`失败 ${result.failed}`);
      const summary = parts.length ? `（${parts.join('，')}）` : '';
      if (result.success) {
        if (result.failed) {
          toast.warning(`导入完成，部分失败${summary}`);
        } else {
          toast.success(`导入成功${summary}`);
        }
      } else {
        toast.error(result.message || '导入失败');
      }
      if (onImported) onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {showImport && !readOnly && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
          <Button
            variant={variant}
            size={size}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="导入 csv / xlsx / xls"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="ml-1">导入</span>
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} disabled={exporting !== null}>
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="ml-1">{exporting ? `导出中` : '导出'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-[#94A3B8] font-normal">导出格式</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {EXPORT_FORMAT_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              disabled={exporting !== null}
              onSelect={(e) => {
                e.preventDefault();
                void handleExport(opt.value);
              }}
              className="cursor-pointer"
            >
              {exporting === opt.value ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#977653]" />
              ) : (
                <FileDown className="w-4 h-4 mr-2 text-[#977653]" />
              )}
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 成功/警告图标占位，保持图标集引用以避免 tree-shaking 告警 */}
      <span className="hidden">
        <CheckCircle2 />
        <AlertTriangle />
        <FileUp />
      </span>
    </div>
  );
}
