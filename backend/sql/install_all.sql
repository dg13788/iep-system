-- =====================================================================
-- IEP 系统 · 数据库一键安装入口
--
-- 用法（**必须在项目根目录执行**，路径写死为相对平台根目录）：
--     mysql -uroot <库名> < backend/sql/install_all.sql
--   例：
--     mysql -uroot iep_system < backend/sql/install_all.sql
--   Windows Laragon 例：
--     C:\soft\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysql.exe -uroot iep_system < backend/sql/install_all.sql
--
-- 设计说明（2026-10-13，ADR-038/039）：
--   1) 本文件只在「一个 mysql 会话」内按序 SOURCE 各迁移文件，取代原先
--      「一个一个独立导入 14 次」的做法，全新部署只需这一条命令。
--   2) 之所以能安全地放进同一会话，前提是各 update 文件里**不得出现**
--      `USE <库名>`：一旦某个文件把当前库切走，后续文件就会静默建到别的库，
--      目标库少表且零报错（历史上 update_v8.sql:12、update_v13.sql:17
--      各写了一句 `USE iep_system;`，已删除）。库名一律由命令行指定。
--   3) 各迁移文件本身幂等，本入口可重复执行；重复导入不会产生重复数据。
--
-- ⚠️ 本入口只适用于「空库首次安装」（2026-10-13 实测补记）
--   init.sql 不止建表，还带一份**最小花名册种子**（5 个班级 / 15 名学生 /
--   若干家长）。空库跑完是想要的；对着**已有演示数据的库**再跑一次，这些
--   种子会因为「按姓名判重」而与既有演示学生并存——实测学生数 18 → 33，
--   多出 15 个张伟/李芳/王强…，回归基线被污染。
--   已有库请只跑增量：`mysql -uroot <库名> < backend/sql/update_v16.sql`
--   （或按版本号只跑缺的那几个），不要重跑本入口。
--
-- 不在本入口内的文件（勿追加）：
--   init_demo_minimal.sql —— 管理控制台「系统初始化(mode=demo)」用的演示种子，
--                            全新部署不应自动灌入演示数据。
--
-- 安装后自检（建议执行）：
--     mysql -uroot <库名> < backend/sql/verify_install.sql
-- =====================================================================

SET NAMES utf8mb4;

SELECT '===== IEP 一键安装开始 =====' AS step;

SOURCE backend/sql/init.sql
SOURCE backend/sql/update_v3.sql
SOURCE backend/sql/update_v4.sql
SOURCE backend/sql/update_v5.sql
SOURCE backend/sql/update_v6.sql
SOURCE backend/sql/update_v7.sql
SOURCE backend/sql/update_v8.sql
SOURCE backend/sql/update_v9.sql
SOURCE backend/sql/update_v10.sql
SOURCE backend/sql/update_v11.sql
SOURCE backend/sql/update_v12.sql
SOURCE backend/sql/update_v13.sql
SOURCE backend/sql/update_v14.sql
SOURCE backend/sql/update_v15.sql
SOURCE backend/sql/update_v16.sql

SELECT '===== IEP 一键安装结束（请执行 verify_install.sql 自检）=====' AS step;
