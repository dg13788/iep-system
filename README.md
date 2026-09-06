---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: f1d3afed55c6dae22e7f096a5ad1b1bb_7ca2722ca99511f187fd525400826444
    ReservedCode1: 1VhLAQ8+nzlOS5SUAQG8jn2Is44/QhM/JRa+WCCEvroDQghhoWKTvwQkc7+g9D2idQBLJZFVkSXi5l4/UfWqMPCWaorevv04K6feA4TwI5+s3PyxIWddBz9pqhzDONNF16MYNgp2qZoMhPMt6d4CfBgTwqQoYNmcy746gqSolZ1EnfurCd/k6MB291k=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: f1d3afed55c6dae22e7f096a5ad1b1bb_7ca2722ca99511f187fd525400826444
    ReservedCode2: 1VhLAQ8+nzlOS5SUAQG8jn2Is44/QhM/JRa+WCCEvroDQghhoWKTvwQkc7+g9D2idQBLJZFVkSXi5l4/UfWqMPCWaorevv04K6feA4TwI5+s3PyxIWddBz9pqhzDONNF16MYNgp2qZoMhPMt6d4CfBgTwqQoYNmcy746gqSolZ1EnfurCd/k6MB291k=
---

---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: f1d3afed55c6dae22e7f096a5ad1b1bb_764f828aa99411f1aed8525400dcc5b3
    ReservedCode1: Puj0QdG1J829IhR4hhCInxIseTbfFeCd0rzX/Ofh1cxSYwvD6070KWOgHROKLeCe74NdXL1oC4HFQS13Ycsp3Bc5LeJHeIEXsZKXgWFppZ/JRhVIgYEoG+Tuy/MyymiQ6Iy6/fqcGkMgvF+UzpadQoyuNK7u1LHqSpk1gVZyxkdnxGiQy4vftwsjZGE=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: f1d3afed55c6dae22e7f096a5ad1b1bb_764f828aa99411f1aed8525400dcc5b3
    ReservedCode2: Puj0QdG1J829IhR4hhCInxIseTbfFeCd0rzX/Ofh1cxSYwvD6070KWOgHROKLeCe74NdXL1oC4HFQS13Ycsp3Bc5LeJHeIEXsZKXgWFppZ/JRhVIgYEoG+Tuy/MyymiQ6Iy6/fqcGkMgvF+UzpadQoyuNK7u1LHqSpk1gVZyxkdnxGiQy4vftwsjZGE=
---

---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: f1d3afed55c6dae22e7f096a5ad1b1bb_87bb933ea99111f1bf99525400e6dd8f
    ReservedCode1: RLsKP6fZ57EsEBuTPRzcbVgf2Ym6fbKve9kbZQAHwgGVu5lzZFybrOfxpqO3yLT22HemFhaN822G2TBpTyzGq2SwOcwqN/G6C0pxWyuut7l3Cu4nouwUGzh7FBWInGG08hotOEVSvZtoPd6/Hri6TytER5tpDXISgxUtYO2nhQ0mhopqVrtrL8kmJcU=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: f1d3afed55c6dae22e7f096a5ad1b1bb_87bb933ea99111f1bf99525400e6dd8f
    ReservedCode2: RLsKP6fZ57EsEBuTPRzcbVgf2Ym6fbKve9kbZQAHwgGVu5lzZFybrOfxpqO3yLT22HemFhaN822G2TBpTyzGq2SwOcwqN/G6C0pxWyuut7l3Cu4nouwUGzh7FBWInGG08hotOEVSvZtoPd6/Hri6TytER5tpDXISgxUtYO2nhQ0mhopqVrtrL8kmJcU=
---

# IEP 特教个别化教育计划管理系统（IEP System）

基于 **React 19 + TypeScript + PHP 8 + MySQL 8** 的前后端分离个别化教育计划（Individualized Education Program, IEP）管理系统，面向特殊教育学校（培智学校）的多角色协作场景，覆盖 IEP 全生命周期管理。

> 本项目为开源发布版。默认演示账号仅用于本地演示，任何生产 / 公网部署前请务必修改默认密码。

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
├── frontend/                前端项目（React 19 + Vite）
│   ├── src/                 源代码
│   ├── public/              静态资源
│   └── package.json         依赖配置
├── backend/                 后端项目（PHP 8 + MySQL 8）
│   ├── api/                 RESTful API 接口（含公共配置 config.php）
│   ├── config/              JWT 密钥目录（jwt.secret 不纳入版本控制）
│   ├── logs/                运行日志（不纳入版本控制）
│   └── sql/                 数据库初始化脚本（init.sql / update_v3.sql）
├── docs/                    技术文档与部署手册
└── tools/                   本地开发 / 回测工具（不纳入版本控制）
```

## 快速开始

### 环境要求

- Node.js 18+ / npm
- PHP 8.0+（启用 pdo_mysql 扩展）
- MySQL 8.0

### 1. 初始化数据库

```bash
mysql -u root -p < backend/sql/init.sql
```

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

## 部署说明

- 本地部署：`docs/IEP系统本地部署手册.md`
- 虚拟主机部署：`docs/IEP系统_虚拟主机部署手册.md`
- 云服务器部署：`docs/IEP系统_云服务器部署手册.md`
- 完整技术文档：`docs/iep_technical_doc_v101.md`

## 安全设计

- JWT 认证 + 服务端二次校验用户真实性（防伪造 Token 越权）
- RBAC 权限组 + 四层数据范围隔离（全域 / 本班 / 相关学生 / 本人）
- 单记录级越权防护、CORS 白名单、审计日志
- 数据库凭据与 JWT 密钥均通过环境变量注入，不硬编码

## 版本历史

| 版本 | 日期 | 主要更新 |
|------|------|---------|
| V1.01 | 2026-05 | 数据权限 v4 重构、科任教师 IEP 参与、权限组配置、PDF/Word 导出、安全修复 |

## 开源协议

本项目采用 [MIT License](LICENSE)。Copyright (c) 2026 特教IEP。
*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
*（内容由AI生成，仅供参考）*
