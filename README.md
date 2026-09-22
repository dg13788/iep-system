# IEP 特教个别化教育计划管理系统（IEP System）

基于 **React 19 + TypeScript + PHP 8 + MySQL 8** 的前后端分离个别化教育计划（Individualized Education Program, IEP）管理系统，面向特殊教育学校（培智学校）的多角色协作场景，覆盖 IEP 全生命周期管理。

> 本项目为**开源骨架版**：仓库只保留可复现系统所必需的源码、数据库脚本与部署文档，
> 密钥、日志、数据库备份、演示数据包、内部过程文档与构建产物一律不入库。
>
> 默认演示账号仅用于本地演示，任何生产 / 公网部署前请务必修改默认密码。

## 功能特性

- 仪表盘：数据统计、雷达图、快捷操作
- 学生管理：完整档案、班级管理、数据权限隔离
- 评估管理：7 大能力领域评估、跨期对比
- IEP 管理：5 步向导制定、目标追踪、Canvas 电子签名
- 教学记录：快速记录、日历视图、反思记录
- 模板管理：评估模板、IEP 模板
- 家校协作：家长签名、沟通记录
- 系统管理：权限组管理、审计日志
- 数据导入导出：学生 / IEP / 评估 / 教学 / 家长数据批量导入导出（Excel/PDF）

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
│   └── package.json          依赖配置
├── backend/                  后端项目（PHP 8 + MySQL 8）
│   ├── api/                  RESTful API 接口（含公共配置 config.php）
│   ├── config/               密钥目录（jwt.secret 不入库，首次运行自动生成）
│   └── sql/                  数据库脚本（init.sql + update_v3~v6.sql）
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
```

| 脚本 | 说明 |
|------|------|
| `init.sql` | 建库基线：31 张表 + 角色 / 权限组 / 默认账号 |
| `update_v3.sql` | 权限组管理改造（硬编码角色 → 后台可配置权限组） |
| `update_v4.sql` | 特教专业内核：短期目标达成记录、安置形式、相关服务、GB/T 26341 残疾等级、安全档案 |
| `update_v5.sql` | 深度审查遗留项整改 |
| `update_v6.sql` | 管理控制台权限（权限组 1 追加 `admin` 菜单） |
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

## 开源骨架版说明

以下内容属于运行产物或内部过程资产，已通过 `.gitignore` 排除，**不在开源范围内**：

| 类别 | 排除内容 |
|------|----------|
| 密钥与环境变量 | `.env`、`backend/config/jwt.secret` |
| 运行日志与审计脚本 | `backend/logs/` |
| 数据库备份（含真实数据） | `backend/backups/` |
| 依赖与构建产物 | `node_modules/`、`frontend/dist/` |
| 演示数据包与生成脚本 | `demo_data/`、`backend/tools/`、`backend/sql/seed_demo_v4.py` |
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

## 开源协议

本项目采用 [MIT License](LICENSE)。Copyright (c) 2026 特教IEP。
