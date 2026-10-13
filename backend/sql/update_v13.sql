-- ============================================================
-- v13：目标领域口径统一（dict_common.goal_area ↔ 前端常量）
-- ============================================================
-- 背景（2026-10-12 真实浏览器冒烟 + 数据核对发现）：
--   1. dict_common 里 goal_area 的 10 条课标课程（生活语文/生活数学/…）
--      从来没有被任何后端接口下发、也没有被前端消费——字典建了等于没建。
--   2. 前端 IEPWizard 的目标领域下拉硬编码 7 个通用领域，
--      而演示数据中约 43% 的目标用的是下拉里选不到的领域
--      （生活数学 6 / 生活语文 4 / 生活适应 4 / 劳动技能 2 / 职业转衔 2 = 18/42）。
--   3. 结果是：教师走界面新建目标，永远无法复现系统里已有的数据；
--      GOAL_AREA_COLORS 缺这些键，进度条与标签一律 fallback 成灰色。
--
-- 处理：补齐「职业转衔」（业务在用但字典缺失），并把字段语义固定下来——
--   dict_common.name  = 界面显示值（与 iep_goals.area 取值一致）
--   dict_common.value = 课标归属说明（仅用于分组展示，不是显示名）

-- 显式指定连接字符集，避免与表（utf8mb4_0900_ai_ci）比较时触发 collation 混用错误
SET NAMES utf8mb4;

-- ---------- 1. 补齐演示数据在用、但字典缺失的「职业转衔」 ----------
INSERT INTO dict_common (category, code, name, value, sort_order, is_active, created_at)
SELECT 'goal_area', 'vocational_transition', '职业转衔', '转衔领域', 21, 1, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT 1) z
    WHERE EXISTS (SELECT 1 FROM dict_common d WHERE d.category = 'goal_area' AND d.name = '职业转衔')
);

-- ---------- 2. 统一：通用 7 领域的 name 去掉「领域」后缀，与业务取值一致 ----------
-- iep_goals.area 实际取值为「情绪行为 / 生活自理 / 沟通」等（不带后缀），
-- 而字典 name 是「情绪行为领域」。保留 value 承载原后缀文案，name 与业务对齐。
UPDATE dict_common SET name = REPLACE(name, '领域', '')
WHERE category = 'goal_area' AND name LIKE '%领域';

-- ---------- 3. 去重保险：同 category+code 若出现重复，保留 id 最小者 ----------
DELETE d FROM dict_common d
JOIN dict_common d2
  ON d.category = d2.category AND d.code = d2.code AND d2.id < d.id
WHERE d.category = 'goal_area';

-- ---------- 4. 核验：goal_area 现应为 18 条（7 通用 + 10 课标 + 1 转衔） ----------
-- SELECT name, value, sort_order FROM dict_common WHERE category='goal_area' ORDER BY sort_order;
-- 与业务在用取值对齐核验（返回 0 行 = 完全覆盖）：
-- SELECT DISTINCT g.area FROM iep_goals g
--   WHERE g.area IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM dict_common d WHERE d.category='goal_area' AND d.name = g.area);
