/**
 * fetchAllPages —— 全量分页拉取工具
 *
 * 背景（2026-10-16 全系统梳理发现）：
 *   多个页面用 `pageSize: 200` 一次性拉「全量」数据后在前端做统计/渲染，
 *   例如 Dashboard 的四张统计卡、Evaluation 的学生下拉、Parents 的家长列表、
 *   System 的审计日志、Teaching 的教学记录表。数据量一旦超过 200：
 *     - 统计数字静默失真（Dashboard 显示 200，实际 260）
 *     - 下拉选项静默缺人（Evaluation 选不到第 201 个学生）
 *     - 表格静默少行（Parents/System/Teaching 看不到尾部数据）
 *   界面没有任何提示，是最难被发现的一类缺陷。
 *
 * 做法：利用所有 list 接口都返回的 total 字段，自动翻页取完为止。
 * 计算逻辑仍然只有前端一份（不在后端并行实现一份统计，避免「并行实现必漂移」），
 * 只是把数据喂饱——这与 ADR-001 计算下沉不冲突：需要下沉的是判定逻辑，
 * 而这里的 breakdown 统计保持单一口径即可。
 *
 * 安全护栏：
 *   - maxPages 上限防止后端 total 异常时的无限翻页（200×50=10000 条，
 *     远超一所培智学校的规模；真到了这个量级，本工具会明确截断而非假圆满）
 *   - 某页返回不足一页时提前收尾（后端 total 与实际不符时的兜底）
 */

export interface PageResult<T> {
  list: T[];
  total?: number;
}

export interface FetchAllOptions {
  /** 每页条数，默认 200（与既有调用点一致） */
  pageSize?: number;
  /** 最多翻多少页，默认 50（即 10000 条上限） */
  maxPages?: number;
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 200;
  const maxPages = options.maxPages ?? 50;

  const first = await fetchPage(1, pageSize);
  const all: T[] = [...first.list];

  const total = typeof first.total === 'number' ? first.total : all.length;
  const pages = Math.min(Math.ceil(total / pageSize), maxPages);

  for (let p = 2; p <= pages; p++) {
    const r = await fetchPage(p, pageSize);
    all.push(...r.list);
    // 防御：后端 total 与实际返回不符时，拿到不足一页就停，避免空转
    if (r.list.length < pageSize) break;
  }
  return all;
}
