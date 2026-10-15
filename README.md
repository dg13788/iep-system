# IEP 特教个别化教育计划管理系统（IEP System）

基于 **React 19 + TypeScript + PHP 8 + MySQL 8** 的前后端分离个别化教育计划（Individualized Education Program, IEP）管理系统，面向特殊教育学校（培智学校）的多角色协作场景，覆盖 IEP 全生命周期管理。

> 本项目为**开源骨架版**：仓库只保留可复现系统所必需的源码、数据库脚本与部署文档，
> 密钥、日志、数据库备份、演示数据包、内部过程文档与构建产物一律不入库。
>
> 默认演示账号仅用于本地演示，任何生产 / 公网部署前请务必修改默认密码。

## 功能特性

- 今日工作台：以「教师的一天」为主视角组织待办、复审与审批（首屏；原统计仪表盘降级为二级页面）
- 进度决策内核（PIC）：试次记录按辅助层级分组、撤提示证据、目标线（aim line）、达标判定与倒退识别；数据点不足 4 个时只返回「继续采集」，不输出结论
- 学生管理：完整档案、班级管理、数据权限隔离（全域 / 本班 / 相关学生 / 本人）
- 评估管理：评估模板库（模板 / 维度 / 条目可配置）、跨期对比、维度得分聚合、评估类型以数据字典为唯一口径
- IEP 管理：5 步向导制定、目标追踪、Canvas 电子签名；目标起草助手仅产出草稿，保留「AI 建议 → 教师定稿」差异留痕
- 教学记录：快速记录、日历视图、反思记录
- 模板管理：评估模板与条目配置
- 家校协作：家长自助登录（独立入口）、结构化家长意见、签名、沟通记录
- 转衔与校级协同：可测量转衔目标、轻量校内协同（仅本范围，不含多校租户）
- 系统管理：权限组管理、审计日志、数据字典
- 数据导入导出：学生 / IEP / 评估 / 教学 / 家长数据批量导入导出（Excel/PDF）
- 开放 API：只读能力，默认关闭（`IEP_OPENAPI=1` 方启用）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + shadcn/ui + Vite |
| 后端 | PHP 8 + MySQL 8 + JWT (HS256) |
| 架构 | 前后端分离，RESTful API，RBAC 权限组 + 数据范围控制 |

## 目录结构

```
iep/
├── README.md
├── LICENSE
├── .env.example              环境变量样例（真实 .env 不入库）
├── .gitignore
├── server_router.php         PHP 内置服务器路由（本地一键运行）
├── frontend/                 前端项目（React 19 + Vite）
│   ├── src/                  源代码
│   │   ├── pages/            页面（今日工作台 / 仪表盘 / 学生 / 评估 / IEP / 教学 / 家校 / 校级协同…）
│   │   ├── services/         API 客户端
│   │   └── ...
│   └── package.json          依赖配置
├── backend/                  后端项目（PHP 8 + MySQL 8）
│   ├── api/                  RESTful API 接口（含公共配置 config.php）
│   │   │                    进度决策内核 progress_analysis / 今日工作台 workbench / 转衔 transition /
│   │   │                    校级协同 school / 开放接口 openapi / 目标起草 goal_drafting 等
│   ├── config/               密钥目录（jwt.secret 不入库，首次运行自动生成）
│   └── sql/                  数据库脚本（init.sql + update_v3~v14.sql）
```
> 注：完整开发技术文档（数据库设计 / API 规范 / 权限体系）为专有资产，不随开源仓库发布。

## 快速开始

### 环境要求

- Node.js 18+ / npm
- PHP 8.0+（启用 pdo_mysql 扩展）
- MySQL 8.0

### 1. 初始化数据库

全新安装：先执行建表基线，再按序执行增量迁移（迁移脚本均幂等，可重复执行）：

```bash
mysql -u root -p < backend/sql/init.sql
mysql -u root -p iep_system < backend/sql/update_v3.sql
mysql -u root -p iep_system < backend/sql/update_v4.sql
mysql -u root -p iep_system < backend/sql/update_v5.sql
mysql -u root -p iep_system < backend/sql/update_v6.sql
mysql -u root -p iep_system < backend/sql/update_v7.sql
mysql -u root -p iep_system < backend/sql/update_v8.sql
mysql -u root -p iep_system < backend/sql/update_v9.sql
mysql -u root -p iep_system < backend/sql/update_v10.sql
mysql -u root -p iep_system < backend/sql/update_v11.sql
mysql -u root -p iep_system < backend/sql/update_v12.sql
mysql -u root -p iep_system < backend/sql/update_v13.sql
mysql -u root -p iep_system < backend/sql/update_v14.sql
```

| 脚本 | 说明 |
|------|------|
| `init.sql` | 建库基线：31 张表 + 角色 / 权限组 / 默认账号 |
| `update_v3.sql` | 权限组管理改造（硬编码角色 → 后台可配置权限组） |
| `update_v4.sql` | 特教专业内核：短期目标达成记录、安置形式、相关服务、GB/T 26341 残疾等级、安全档案 |
| `update_v5.sql` | 深度审查遗留项整改 |
| `update_v6.sql` | 管理控制台权限（权限组 1 追加 `admin` 菜单） |
| `update_v7.sql` | 进度智能内核 PIC（Step 1）：监控频率 / 方法 / 责任人、数值化基线、期末目标值、干预调整实体、评估 → IEP 溯源字段 |
| `update_v8.sql` | 「教师的一天」今日工作台（Step 2）：为教学岗权限组开通「今日」菜单 |
| `update_v9.sql` | 评估 → IEP 因果链闭合 + 目标起草助手留痕（Step 3） |
| `update_v10.sql` | 转衔与家长闭环（Step 4）：可测量转衔目标、结构化家长意见 |
| `update_v11.sql` | PIC 教学法修订：目标方向显式建模（递增 / 递减）、达标判定的目标辅助层级 |
| `update_v12.sql` | 权限码治理：孤儿码显式授予、消除超管直通造成的隐式特权、新旧权限码别名接通 |
| `update_v13.sql` | 目标领域口径统一：`dict_common.goal_area` 字典经接口下发、前端消费 |
| `update_v14.sql` | 模板条目外键修正（改指 `assessment_templates`）+ 校本模板并入主库 + 在用模板条目补全 |
| `init_demo_minimal.sql` | 可选：最小演示数据集（管理控制台「初始化演示数据」调用） |

### 2. 配置后端环境变量

后端配置通过**环境变量注入**，无需修改代码：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | 数据库主机 | localhost |
| `DB_NAME` | 数据库名 | iep_system |
| `DB_USER` | 数据库用户 | root |
| `DB_PASS` | 数据库密码 | 必填，无默认 |
| `JWT_SECRET` | JWT 签名密钥（≥32 字符） | 自动生成 |
| `JWT_EXPIRE_DAYS` | Token 有效期（天） | 7 |
| `IEP_DEBUG` | 开发调试开关（true/false） | false |
| `ALLOWED_ORIGINS` | 允许的跨域来源（逗号分隔） | 仅同源 |

将 `backend/api/` 部署到 Web 服务器（Nginx / Apache + PHP-FPM），并在服务配置或 dotenv 中注入上述变量（参考仓库根目录 `.env.example`）。

> JWT 密钥优先级：环境变量 `JWT_SECRET` > 密钥文件 `backend/config/jwt.secret` > 首次运行自动生成。`jwt.secret` 已加入 `.gitignore`，不会随源码发布，系统首次运行会自动生成新密钥。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认 API 地址为相对路径 `/api`（前后端同域部署开箱可用）；前后端分离部署时通过构建期环境变量覆盖：

```bash
VITE_API_BASE_URL=https://api.example.com/api npm run build
```

### 4. 生产构建

```bash
cd frontend
npm run build   # 产物在 frontend/dist
```

`frontend/dist` 与 `node_modules` 不纳入版本控制（见 `.gitignore`），部署时自行构建或由 CI 生成。

### 5. 本地一键运行（可选）

用 PHP 内置服务器同时托管 API 与前端构建产物：

```bash
cd frontend && npm run build && cd ..
php -S 0.0.0.0:8080 server_router.php
```

访问 `http://localhost:8080` 即可（`/api/*` 自动转发到 `backend/api/index.php`，其余路径回落到 SPA）。

## 默认账号（仅限本地演示）

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 超级管理员 |
| director1 | admin123 | 教学主任 |
| teacher1 | admin123 | 班主任 |
| teacher2 | admin123 | 科任教师 |
| parent1 | admin123 | 家长 |
| viewer1 | admin123 | 只读用户 |

> 安全提醒：上述账号种子化于 `backend/sql/init.sql`，仅用于本地功能演示。任何公网 / 生产部署后必须立即修改默认密码并启用强密码策略。
>
> 家长账号另有独立的「家长自助登录」入口（手机号 + 密码，`/api/auth/parent-login`），与上方统一登录入口相互独立；家长登录后只能看到自己关联的学生。

## 开源骨架版说明

以下内容属于运行产物或内部过程资产，已通过 `.gitignore` 排除，**不在开源范围内**：

| 类别 | 排除内容 |
|------|----------|
| 密钥与环境变量 | `.env`、`backend/config/jwt.secret` |
| 运行日志与审计脚本 | `backend/logs/` |
| 数据库备份（含真实数据） | `backend/backups/` |
| 依赖与构建产物 | `node_modules/`、`frontend/dist/` |
| 演示数据包与生成脚本 | `demo_data/`、`backend/tools/`、`backend/sql/seed_demo_v4.py`、根目录 `tools/`（本地回测路由与脚本，不属于交付成品） |
| 内部过程文档 | 审计 / 回测 / 审查 / 整改 / 补齐 / 参评 / 交付说明 / 计划 / 截图 |
| 二进制派生文档 | `docs/*.docx`（以同名 Markdown 为准） |
| 过时部署手册 | `docs/IEP系统*部署手册.md`（早期 FlyEnv / 宝塔版，与环境变量方案不一致） |
| 完整开发技术文档 | `docs/iep_technical_doc_v101.md`（数据库 / API / 权限设计蓝图，作为专有资产不公开） |
| 本地安装脚本与临时日志 | `install_iep_local.bat`、`build_log.txt`、`run_*.txt` 等 |

> 若你的本地仓库中这些文件已被 Git 跟踪，开源前请执行 `git rm -r --cached <路径>` 将其从索引中移除（不会删除磁盘文件）。

## 部署说明

- 本地演示：见上文「5. 本地一键运行（可选）」

> 旧版 FlyEnv / 虚拟主机 / 宝塔部署手册未包含在骨架版中：它们描述的是
> 早期 `iep-backend/` 目录结构与在 `config.php` 中改写 `define('DB_PASS')` 的做法，
> 与当前「环境变量注入」方案不一致，故不作为开源内容发布。
> 完整开发技术文档（`docs/iep_technical_doc_v101.md`）为专有资产，不随开源仓库发布。

### 生产部署要点

生产环境建议使用 **Nginx + PHP-FPM**（PHP 内置服务器为单进程串行模型，仅供本地演示，
且无法启用 HTTPS，不适用于公网）：

1. 将 `backend/api/` 部署为 `/api` 路径，将 `frontend/dist/` 作为站点根目录；
2. SPA 路由需配置回落到 `index.html`（`try_files $uri $uri/ /index.html`）；
3. 通过 PHP-FPM 进程池注入环境变量，后端 `config.php` 会自动读取：

```ini
; /etc/php/8.3/fpm/pool.d/iep.conf
[iep]
user  = www-data
group = www-data
listen = /run/php/php8.3-fpm.sock

env[DB_HOST]    = localhost
env[DB_NAME]    = iep_system
env[DB_USER]    = iep_app
env[DB_PASS]    = <你的数据库密码>
env[JWT_SECRET] = <32 位以上随机字符串>
env[IEP_DEBUG]  = false
```

4. 为学生敏感数据启用 HTTPS，并配置 `audit_logs` 表定期归档。

## 安全设计

- JWT 认证 + 服务端二次校验用户真实性（防伪造 Token 越权）
- RBAC 权限组 + 四层数据范围隔离（全域 / 本班 / 相关学生 / 本人）
- 单记录级越权防护、CORS 白名单、审计日志
- 数据库凭据与 JWT 密钥均通过环境变量注入，不硬编码

## 版本历史

| 版本 | 日期 | 主要更新 |
|------|------|---------|
| V1.00 | 2025-01-15 | 初始版本：8 大功能模块、RBAC 角色权限（6 角色 / 42 项权限）、JWT 认证、Canvas 电子签名 |
| V1.01 | 2025-02-20 | 数据权限与安全增强版：Data Scope V2、科任教师 IEP 参与 V3、权限组可配置 V3、SHA256 签名防篡改 |
| V1.1.0 | 2026-10-12 | 教学决策系统版：进度决策内核 PIC（试次按辅助层级分组、撤提示证据、目标线、达标 / 倒退判定，数据点不足 4 个不出结论）、今日工作台、评估 → IEP 因果链与目标起草助手（仅草稿）、转衔与家长闭环、轻量校级协同、只读开放 API（默认关闭）；评估类型 / 目标领域以数据字典为唯一口径；权限码治理与审计补强；数据库迁移至 v14 |
| V1.2.0 | 2026-10-14 | 教师端体验与安全护栏版：全页面响应式适配（11 条路由 × 3 档视口真实浏览器体检，界面问题 46 → 0）、触控达标（触屏按钮 44px / 勾选类 24px，桌面保持紧凑）、不可逆删除统一二次确认（删除学生档案 / IEP 计划 / 教学记录 / 干预计划 / 相关服务）、页签窄屏横滑、表格首列吸附与防侧滑返回、中文窗口化分页、路由级代码分割首屏 906KB → 94KB、Toast 避让顶栏、登录页可达性、滚动位置管理 |
| V1.3.0 | 2026-10-14 | 设计 token 化与一键换肤版：3400 余处硬编码色值收口到 ~90 个语义 token（ink / line / surface / brand / success\|warning\|danger\|info\|violet），命名按用途而非颜色；四套校准过对比度的整体主题（明亮 / 夜间 / 暖阳护眼 / 高对比），顶栏一键切换、登录页同样可换、点选即生效并持久化；首屏防闪烁（内联脚本抢在样式表之前设置主题）；token 用 rgb 三元组以便拼透明度修饰；补齐 Tailwind v3 缺失的 aria-invalid / has-focus 变体（表单校验红框与日历焦点高亮此前一直未生效）；构建产物类名存在性校验，杜绝「类名无效 → 样式静默消失」 |
| V1.3.1 | 2026-10-14 | 键盘可达性与家长签名链路修复版（真实浏览器深度实测 33 项）：自研抽屉焦点管理（打开即移入焦点、Tab 圈禁不逃逸、关闭后焦点归还触发按钮）；主题面板键盘分流（方向键切换不收起面板、焦点不丢失，鼠标点选才收起，重点当前项也能收起）；手写表单校验态接入控件（aria-invalid + aria-describedby + role=alert，错误文案与输入框真正关联）；修复家长签名链路两处断点——useDataScopeConfig 的 parentName 恒为 null、签名板被 readOnly 挡死，导致「等待家长签名」成为死状态、家长永远无法签字；canvas 签名笔迹改为读取主题 token（此前赋 CSS 变量字符串会被静默忽略） |
| V1.3.2 | 2026-10-14 | 焦点管理系统性加固版（真实浏览器焦点审计 11 项驱动）：上一轮 useDialogFocus 只接了 1 个组件，本轮将焦点三件套补齐到 8 个自研弹层（学生详情 / IEP 详情三面板 / 添加目标模态 / 试次与目标编辑抽屉 / 服务会议抽屉 / 评估抽屉 / 评估起草抽屉 / 移动端侧栏），并给最裸的起草抽屉补上 role=dialog + aria-modal + aria-label；hook 三处硬化——上层对话框文档级判定让位（Radix 确认框 portal 到 body 外也会被识别）、400ms 焦点守护窗口（下拉菜单关闭时 rAF 归还焦点晚于抽屉挂载、会抢走刚移入的焦点）、关闭后归还目标当场重定（prev 捕获到瞬逝菜单项曾导致焦点掉回 body）；换肤面板按 APG 菜单按钮惯例分流（键盘打开移焦点、指针打开不抢）；全量回归无波及（深度探针 32/32、六角色冒烟 94/94、四主题 163/163、交互 16/16、全页面体检 P0/P1=0） |
| V1.3.3 | 2026-10-14 | 系统级审计整改版（三路独立审计 + 主审复核）：修两处 P0——签名状态机闭环（此前家长可给草稿/审核中/已驳回计划盖出「已签署」法律记录，唯独 sign 分支无审批前置校验）、全校统计报表鉴权（此前仅校验登录，家长与科任教师可取全校在校学生数/障碍分布/教学趋势，现按 action 映射 reports.* 权限）；修 P1 倒退信号可见性——regression 在判定权重中最紧急（6），却在工作台过滤、排序权重、计划级汇总键、前端配色文案四处被静默丢弃，实测今日工作台因此漏掉 5 个倒退目标，现全部补齐并置顶；新增双向对照回归资产（越权者被拒 + 有权者仍可访问），并修正回测脚本自身 3 处假阳性。全量回归：审计回测 14/14、api_smoke 全过、六角色冒烟 94/94、四主题 163/163、焦点 11/11、类名校验 283/283 |
| V1.3.4 | 2026-10-15 | 决策回路闭环版（按评估报告第七节排序推进）：①补采纳反馈回路——建议带稳定 id（`<level>:<type>`）、登记干预调整时可勾选采纳了哪几条并落库 adopted/suggestion_ids、新增 `GET /api/iep/decision_feedback` 统计端点，北极星指标「教师每周因系统数据而改变教学决策的次数」在系统内终于有可计数事件；②evidence 判据上屏——规则命中（A 目标线 / B 增速 / C 陈旧 / D 倒退 / reached）、倒退门槛、斜率 t 值随结论返回并渲染，原则②「可解释」从数据层走到界面；③倒退判定加统计检验——原固定 8pt 阈值与样本量无关，5 次试次的班级一次偶然波动就会误报，现门槛随试次数缩放（max(8, ceil(100/n)×2)）且方向性结论须过斜率 t 检验（df=n-2，双尾 0.05），实测倒退从 5 例降到 1 例（仅保留统计显著者）；④补量纲列 measurement_scale 与 LRE 叙述字段（lre_narrative / lre_removal_reason），默认 auto 保证存量口径零变化；⑤清工程债——5 处 PDOException 原文外泄改为只进日志、transition 五个写端点补审计日志、删除计划改为级联软删内容类子表（家长签名与会议参与人作为法定凭据保留）。新增回测资产：`audit_20261015_fixes.py`（14 项）、`audit_20261015_units.php`（11 项口径边界）。全量回归：新断言 14/14、单元 11/11、api_smoke 全过、六角色冒烟 94/94、四主题 163/163、焦点 11/11、深度 32/32+1 跳过、交互 16/16、短语 25/25、v15 30/30、v14 28/28、全页面体检 P0=0/P1=0/P2=4 |
| V1.3.5 | 2026-10-15 | 范围过滤统一版（ADR-009 收官，评估报告第七节第 5 项剩余部分）：审计发现数据范围过滤有 3 套并行实现 + 6 处内联复制且已真实漂移——assessments export 的 teacher 分支带 `a.assessor_id`（教师可导出本人经手的评估）、list 却不带（同一教师「列表里没有、导出里有」）。本轮把策略收敛为单一决策核心 `dataScopeRule()`（scope type → 访问规则，零 SQL）+ 两家 SQL 渲染器（学生键控 `applyStudentKeyedScope()` / 家长实体 `applyParentListScope()`）：`pa_plan_scope_clause` 改为委托（15 组 scope 矩阵逐字节比对不变）、`applyStudentScope` 改薄包装、6 处内联块全部收敛、学生导入班级守卫收敛到新增 `isClassInScope()`、删除零调用死代码 `applyDataScope()`。顺带堵一处 fail-open——旧 teaching 内联块对未知 scope 类型无分支匹配即空条件全量可见，新核心一律 fail-closed。修一处重构引入的 500 并固化其盲区回归：parents/communications 的 count 查询缺 students JOIN（旧代码用自包含 EXISTS 绕开，与兄弟端点结构不一致），该「教师×家校沟通」组合此前无任何探针覆盖、全套回归全绿它却 500，现补 `verify_scope_parity.py`（5 角色×5 端点可见性矩阵 25 项硬断言）。新增 `pa_scope_units.php`（98 项：新旧实现矩阵比对 + 四调用点期望 SQL + fail-closed 全覆盖）。全量回归：单测 98/98、口径 11/11、可见性矩阵 25/25、api_smoke 全过、v14 28/28、v15 30/30、六角色 94/94、四主题 163/163、焦点 11/11、深度 32/32、交互 16/16、短语 25/25、全页面体检 P0=0/P1=0/P2=4；改前改后活库角色级数量逐项一致 |
| V1.3.6 | 2026-10-15 | 工程债与专业缺口收尾版（评估报告第七节第 5 项完结 + 第四/五节剩余项）：①GOA11 方向敏感——「期末目标不高于基线」判据此前不读 `direction`，库内 6 条降频目标（如违纪频次 70→20）被一律误报「缺乏挑战性」，现仅对递增方向应用；②达标判定改持续达标——原「最近 3 点任意 1 点触及期末值」即判 mastered，学年中期一次偶然达标就让教师提前上调目标、学生回落后再没人信系统，现要求最近 3 点全部达到，单点触及落回目标线比较判 on_track；③孤立目标补外键与可见性——v21 给评估→IEP 溯源四列（iep_goals / iep_plans 的 source_assessment_id、source_assessment_item_id、assessments.iep_plan_id）补外键（ON DELETE SET NULL，置空后由 PLN11/新增 GOA12 两条 warn 把关联缺失变成教师可见信号），GOA12 定为 warn 而非 error 的边界：前端手工建目标不走起草链路、无法携带关联，此刻升 error 会造出「点了提交却永远过不了」的死校验；④修一处全新部署 P0——install_all.sql 的 SOURCE 清单漏了 v19/v20 两个迁移文件（正是 ADR-039 警告的硬编码清单漂移），全新部署拿到少 5 列（adopted/suggestion_ids/measurement_scale/lre_narrative/lre_removal_reason）的库、相关端点直接 500 而安装零报错，现补齐至 v21 并把 5 列 + 4 条外键写进 verify_install 自检（C3/C9，含删列反证）；⑤异常吞没收敛——全库 209 个 catch 中 20 个完全静默（无日志无响应）逐一补日志，5 个导入的行级失败从「只给用户通用文案」补上服务端留痕；⑥goal_draft 三个写端点（generate/adopt/save_plaafp）补审计日志，与 iep.php 既有口径对齐；⑦iep 导入事务口径对齐其余四个导入——从五个导入中唯一的逐行提交改为整批事务 + 行级 SAVEPOINT（行内「计划+审批留痕」两条语句要么都成要么都不成），批级异常整体回滚；⑧school.php overview 消除两处 N+1（逐计划查目标、逐目标查责任人姓名改两次 IN 批量）；⑨update_v14.sql 裸 DROP FOREIGN KEY 补存在性守卫（半途失败的库原先重放必死在 1091、后续语句全部不执行）。新增回测资产：`pa_rules_units.php`（9 项，事务内构造用完回滚）、`verify_v16_debt_round.py`（14 项）。全量回归：开发版与便携版逐项一致——判据单测 9/9、本轮 API 14/14、范围单测 98/98、可见性矩阵 25/25、api_smoke 全过、v14 28/28、v15 30/30、六角色 94/94、四主题 163/163、焦点 11/11、深度 32/32+1 跳过、交互 16/16、短语 25/25、全页面体检 P0=0/P1=0/P2=4；临时空库跑通 install_all 全链 + 自检 INSTALL_VERIFY: OK |
| V1.3.7 | 2026-10-15 | 可读性与可用性四联修复版（用户实测反馈驱动，真实浏览器 22 项验证）：①全站字号升一档——Tailwind 默认 xs=12px / sm=14px 在高分屏上偏小，而全站 748 处 `text-sm` + 598 处 `text-xs`，逐组件打补丁必漂移，改为在 `theme.extend.fontSize` 统一到 sm=15px / xs=13px（含配套行高）一次生效，四主题 163/163 无溢出无挤压。②IEP 详情抽屉「关不掉」P0——根因是 React Router 7 的 `setSearchParams` 属 transition 更新：`closeDetail` 同步提交 `detailOpen=false` 后 URL 参数仍停在旧值 `'1'`，深链 effect 在该过渡窗口读到旧参数又把抽屉打开，表现为点 × / Esc / 点遮罩都立刻弹回、全屏遮罩挡住侧栏导航。修法取「已处理参数 ref」——同一 `plan` 参数只自动展开一次，用户主动关闭后同参数不再重开（深链是进入手段，不是持续约束）；另补 Today 页兜底：`#?plan=N`（plan 挂在根路由的老链接）此前无人接管，点了静静停在今日页，现 replace 到 `/iep`。③新增学生字段规范——前端 `utils/validators.ts`（身份证 GB 11643 校验位算法 + 出生日期真实性 + 中国大陆手机号规范）与后端 `students_valid_id_card` / `students_valid_phone` 双端同口径，create / update 均接入；并修一处「校验生效但用户看不见」的缺陷：`errors.id_card` / `emergency_phone` 在校验函数里赋值却从未渲染到 JSX，此前只弹一句笼统 toast。④评估模板选择器重构（37 个模板重点）——抽 `components/assessment/TemplatePicker`（搜索 + 分类 chips 带计数 + 渐进披露 + 空态 + 手机/抽屉分组列表两变体），主页面与录入抽屉共用一份分类映射（原先各维护一份）；卡顿主因是 37 张卡逐个 motion stagger（第 37 张延迟 2.4s+），现已去除并改为默认展示 9 张 + 展开全部；抽屉列表改按分类分组 + 固定高度滚动。全页面体检扫出本轮自身两处触控回归（chips 32px、展开按钮 36px 低于 44px 标准）已修。新增回测资产 `verify_v17_student_validation.py`（14 项）与浏览器 `verify_v17_fixes.js`（22 项）。全量回归开发版与便携版（8080）逐项一致：四修复 22/22、学生校验 14/14、范围矩阵 98/98、判据单测 9/9、v14 28/28、v15 30/30、债务轮 14/14、可见性矩阵 25/25、api_smoke 全过、六角色 94/94、四主题 163/163、焦点 11/11、深度 32/32、交互 16/16、短语 25/25、全页面体检 P0=0/P1=0/P2=4 |
| V1.3.8 | 2026-10-16 | 真实浏览器全站巡检与幽灵字段修复版（发现—回测—确认—修复，8 轮探针）：①**P0 幽灵字段**——学生档案表单里的「诊断日期 / 诊断机构 / 医学诊断说明」填完点保存会提示「已更新」，重新打开却全是空的，实测确认数据被静默丢弃；根因是三层各自都"对"却凑成丢数据：库内无落点 → `services/students.ts` 的 `WRITABLE_FIELDS` 据此剔除（那行注释本身是正确的防御）→ 界面照收。修法取「补落点」而非「删输入框」（诊断机构与日期是 IEP 合规依据）：新增 `update_v22.sql` 补 `diagnosis_date(DATE)` / `diagnosis_org(VARCHAR100)` / `diagnosis_note(TEXT)` 三列（幂等 + 版本登记 + 自检），后端 create/update 白名单放开，前端 `WRITABLE_FIELDS` 与 `adaptStudent` 读取映射同步（后者此前把三字段硬编码为空串，等于"存了也读不出"），并修 `students/list` 查询——它用显式列而非 `s.*`，而编辑抽屉的数据源正是 list，导致详情接口看得到、列表/编辑看不到。②**P1 超长输入变成 500「创建失败」**——后端只校验非空与格式、不管长度，超长文本捅到 MySQL strict mode 抛 22001 后被 catch 兜成 500，且异常被静默吞掉无从追查；现加 `students_field_limits()` 按 schema 逐字段拦截，返回 400 并说清「姓名内容过长（最多 100 字，当前 300 字）」，前端补 `maxLength`，PDO 兜底分支识别 22001 归为 400 且一律 `error_log` 留痕。③**P1 便携版升级通路**——快照只在首次运行导入，老版本换新包后代码新、库结构旧，新代码写不存在的列直接 500；新增 `tools/upgrade.php` 并在 `launch.php` 启动流程挂接（按版本号补应用未登记迁移，失败只告警不阻断），快照重新导出含新列（真实演练：删列后启动可自动补回）。**方法论**：本轮自曝并推翻 5 处假缺陷——非法身份证样例恰好合法（校验位算错）、空态提示行被当成数据行、同 hash 的 `page.goto` 是 no-op 导致列表未刷新、sleep 4.5s 后错过 3 秒即消失的 toast、把构建输出重定向后 `$LASTEXITCODE` 被污染而误判 `tsc` 成功（实为 TS2339 失败，dist 仍是旧产物）。回归：修复复测 11/11、权限越权 12/12、分页与可见性 10/10、双口径 15/16（唯一失败即上述 no-op 假缺陷，已用真重载证伪）、全角色路由体检 80~100 次无运行时缺陷。遗留观察项（未改，如实记录）：Windows 下 PHP 内置服务器串行处理（6 并发/单请求耗时比 5.31，`PHP_CLI_SERVER_WORKERS` 实测无效，属平台限制）；后端仍在校验无落点的 `guardian2_phone`（死校验，UI 未渲染该字段）；Dashboard 等处 `pageSize` 硬编码 200，数据超量后统计会静默失真 |
| V1.3.9 | 2026-10-16 | 幽灵字段家族清剿与统计口径修订版（对应便携版 v1.14，V1.3.8 三项遗留项全部处置）：①**幽灵字段家族第三、四组**——沿用 V1.3.8 的判定法（「表单 state 字段 × 渲染输入框 × 库列」三方对账 + `updateField()` 与 `WRITABLE_FIELDS` 差集）做全量比对，又挖出两组同一病根的字段：**第二监护人**（表单摆着「监护人2姓名/电话」两个输入框、还带手机号格式校验，学生详情抽屉也认真展示，但库里没有 `guardian2_name`/`guardian2_phone` 两列——更讽刺的是后端 `students.php` 还在校验 `guardian2_phone` 格式，校验一个永远存不进去的字段；且表单 state 有值却漏渲染输入框，属半成品形态，取「补列+补输入框」而非删功能）与**伴随障碍/特殊需求说明**（「障碍信息」区的伴随障碍、「其他信息」区的特殊需求说明多行框，详情抽屉同样展示，库里同样无落点）。新增 `update_v23.sql`（两列）与 `update_v24.sql`（两列，均幂等 + 版本登记 + 自检），后端 create（27 字段）/update（29 字段）白名单与前端 `WRITABLE_FIELDS`（29 字段）同步放开，`students/list` 显式列补全，输入框补齐（`maxLength` + 手机号校验 + aria 错误关联）；浏览器复测探针 `stage9_ghost2.js` 16/16（填→存→整页重载→回显→详情 tab 展示全通过）。修法口径：培智学校家校沟通频次远高于普通学校（每日接送、康复配合、情绪通报），第二监护人是真实联络对象；伴随障碍（脑瘫、自闭症特质、情绪行为障碍等共病）直接决定教学策略与辅助方式——留着不存的输入框，就是向教师征收纯粹的文书税。②**P1 pageSize 200 假全量导致统计静默失真**——Dashboard/Evaluation/Parents/System/Teaching 五页 10 处调用点写死 `pageSize:200`，学生/评估数超 200 后统计数字静默偏小且无任何提示；新增 `utils/fetchAllPages.ts`（首页取 total → 自动翻页 → 顺序拼接，maxPages 50 护栏、不足一页提前收尾），10 处全部切换，计算逻辑保持前端单份防并行实现漂移。③**便携版升级器基线语义修正**——`SNAPSHOT_BASELINE` 填成「当前快照版本」会让该版本迁移永远被跳过（已登记即视为已应用），正确语义是「最老在役快照版本」= 当前版本-1；由 21 抬到 22，删列+删登记实战演练通过（启动自动补回并登记）。④**全系统静态对账（同模式全域排查）**——9 个模块 create/update 白名单与库列全对齐；死校验扫描归零（`guardian2_phone` 补列后校验复活）；SQL 注入面干净（表名经 `adminReadableTables()` 白名单 fail-closed，值全部走 `?`/`quote()`）；openapi 开关 fail-closed（`OPENAPI_DISABLED` 实测拒绝）；`templates.ts` 的 icon/color 确认为纯展示字段（幽灵字段误报，排除）。⑤**开发库迁移欠账清偿**——开发库此前停在 v21（3306 端口被便携版占用），而代码已在写新列，不补即同类 500 隐患；临时以 3307 端口起开发库补应用 v22/v23/v24（幂等实测：重跑全部走「跳过」分支，7 列 + 3 条登记落库）。全量回归约 800 项断言 0 失败：API/PHP 10 脚本（api_smoke 全过、v14 28/28、v15 30/30、audit 14/14、范围矩阵 98/98、可见性矩阵 25/25、判据单测 9/9、债务轮 14/14、学生校验 14/14、口径边界 11/11）+ 浏览器 13 探针（stage1 100、stage9 16/16、v17 23/23、焦点 11/11、四主题 163/163 且控制台 0 错、深链 32+1 跳过、交互 16/16、短语 25/25、全页面体检 P0=0/P1=0/P2=4、六角色冒烟 94/94 等）。遗留观察项（自 V1.3.8 延续，平台限制无解，如实记录）：Windows 下 PHP 内置服务器串行处理（6 并发/单请求耗时比 5.31，`PHP_CLI_SERVER_WORKERS` 在 Windows 实测无效）——便携版面向单校单机场景可接受，多用户并发部署应换 php-cgi/FPM 或 IIS/Apache |

## 开源协议

本项目采用 [MIT License](LICENSE)。Copyright (c) 2026 特教IEP。
