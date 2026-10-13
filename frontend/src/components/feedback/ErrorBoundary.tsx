import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * 全局错误边界
 *
 * 此前全项目没有任何错误边界：某个页面渲染抛异常时 React 会卸载整棵树，
 * 用户看到的是一片白（和"系统坏了"无法区分），且无从恢复，只能手动刷新。
 *
 * 设计取舍：
 *  - 兜底界面必须说清"你的数据还在"。特殊教育台账是教师一笔一笔录进去的，
 *    崩溃时最恐惧的是"我刚记的东西没了"，而渲染异常并不影响已落库的数据。
 *  - 提供「重试」与「返回首页」两条出路，不把用户困死。
 *  - 技术细节默认折叠（给排查用的，不该吓到教师），但必须能展开，
 *    否则教师报障时我们拿不到任何信息。
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? null });
    // 生产环境应替换为上报；此处保留控制台，便于教师报障时附带
    console.error('[IEP] 界面渲染异常', error, info);
  }

  private retry = () => {
    this.setState({ error: null, stack: null });
  };

  private goHome = () => {
    window.location.hash = '#/';
    this.setState({ error: null, stack: null });
  };

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[100dvh] bg-[#F7F6F4] flex items-center justify-center p-4">
        <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-card border border-[#E2E8F0] p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#DC2626]" />
          </div>
          <h1 className="mt-4 text-base font-semibold text-[#1E293B]">
            这个页面出了点问题
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
            已经保存的数据不受影响，仍在系统里。可以先重试，若反复出现请把下面的信息发给系统管理员。
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.retry}
              className="min-tap-h inline-flex items-center gap-1.5 rounded-lg bg-[#1E293B] px-4 text-sm font-medium text-white hover:bg-[#334155] press cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              重试
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="min-tap-h inline-flex items-center rounded-lg border border-[#E2E8F0] px-4 text-sm text-[#475569] hover:bg-[#F7F6F4] press cursor-pointer"
            >
              返回首页
            </button>
          </div>

          <details className="mt-5 text-left">
            <summary className="cursor-pointer select-none text-xs text-[#94A3B8] hover:text-[#64748B]">
              技术细节（报障时请附上）
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#F8FAFC] p-3 text-[11px] leading-relaxed text-[#64748B] whitespace-pre-wrap break-all">
              {error.message}
              {stack ? `\n\n${stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
