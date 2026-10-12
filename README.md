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

## 开源协议

本项目采用 [MIT License](LICENSE)。Copyright (c) 2026 特教IEP。
