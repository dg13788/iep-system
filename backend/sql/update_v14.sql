-- ============================================================
-- v14（2026-10-12）：模板条目表外键指错父表 + 补全在用模板条目
--
-- 背景（真实浏览器冒烟实测发现，P0）：
--   template_items_custom.template_id 的外键指向 assessment_templates_custom，
--   但模板的列表/新建/编辑（templates.php、assessments.php）全部走
--   assessment_templates。两张表的 id 空间重叠（1-7 各有一套、内容不同）：
--   ① 在「模板管理」给任意模板添加条目 → 外键失败（除 1-7 号外全灭）；
--   ② 读取 1-7 号模板条目 → 拿到的是另一张表里同名 id 的条目，张冠李戴；
--   ③ 演示数据 45 条评估使用的 101/102/103/122/123 在主库有模板、无条目，
--      教师端「录入评估」选真实模板后无条目可打分。
--
-- 迁移（幂等，可重复执行）。注意顺序：必须先摘旧外键再改挂 id——
-- UPDATE 同样受外键约束，先改 id 会直接 1452。
--   1) 7 个校本自定义模板并入主库 assessment_templates（按 name 去重）；
--   2) 摘掉指向 assessment_templates_custom 的旧外键；
--   3) 条目按 name 改挂主库新 id；
--   4) 外键改指 assessment_templates(id)；
--   5) 从 assessment_items 真实条目派生 101/102/103/122/123 的模板条目定义。
-- ============================================================

-- 1) 校本模板并入主库（name 已存在则跳过，保证幂等）
INSERT INTO assessment_templates
  (name, category, description, target_disability_types,
   applicable_age_min, applicable_age_max, is_system, is_active, created_at, updated_at)
SELECT c.name, c.category, c.description, c.target_disability_types,
       c.applicable_age_min, c.applicable_age_max, 0, 1, NOW(), NOW()
FROM assessment_templates_custom c
WHERE NOT EXISTS (
  SELECT 1 FROM assessment_templates t WHERE t.name = c.name
);

-- 2) 摘旧外键（改挂 id 前必须摘掉，否则 UPDATE 触发 1452）
--    2026-10-15 补守卫：原为裸 `DROP FOREIGN KEY`。mysql 批处理遇错即停，
--    若某库历史上只执行到一半（FK 已摘、新键未加），重放本文件会死在
--    1091，后续 3) 4) 5) 全部不执行——「补一半」的库再也补不完整。
--    守卫后：不存在就跳过摘除，由 4) 负责把键补回。
SET @has_tic_fk := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'template_items_custom'
      AND CONSTRAINT_NAME = 'fk_tic_template'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql_drop_tic := IF(@has_tic_fk = 1,
    'ALTER TABLE template_items_custom DROP FOREIGN KEY fk_tic_template',
    "SELECT 'fk_tic_template 不存在，跳过摘除（由第 4 步补回）'");
PREPARE st_drop_tic FROM @sql_drop_tic; EXECUTE st_drop_tic; DEALLOCATE PREPARE st_drop_tic;

-- 3) 条目改挂主库 id（仅当 template_id 仍落在 custom 表 id 范围内时才会匹配，天然幂等）
UPDATE template_items_custom tic
JOIN assessment_templates_custom c ON tic.template_id = c.id
JOIN assessment_templates t ON t.name = c.name
SET tic.template_id = t.id;

-- 4) 外键改指主库（守卫：上一步已摘则不存在、直接加；已存在则跳过，避免 1826 中断）
SET @has_tic_fk2 := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'template_items_custom'
      AND CONSTRAINT_NAME = 'fk_tic_template'
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
);
SET @sql_add_tic := IF(@has_tic_fk2 = 0,
    'ALTER TABLE template_items_custom ADD CONSTRAINT fk_tic_template
       FOREIGN KEY (template_id) REFERENCES assessment_templates (id) ON DELETE CASCADE',
    "SELECT 'fk_tic_template 已存在，跳过'");
PREPARE st_add_tic FROM @sql_add_tic; EXECUTE st_add_tic; DEALLOCATE PREPARE st_add_tic;

-- 5) 从真实评估条目派生 5 个在用模板的条目定义（不新编内容，先删后插幂等）
DELETE FROM template_items_custom WHERE template_id IN (101, 102, 103, 122, 123);

INSERT INTO template_items_custom
  (template_id, dimension, item_name, item_description, max_score, sort_order)
SELECT template_id, dimension, item_name, descr, max_score,
       ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY first_sort, dimension, item_name)
FROM (
  SELECT a.template_id AS template_id, ai.dimension AS dimension, ai.item_name AS item_name,
         MIN(ai.item_description) AS descr, MAX(ai.max_score) AS max_score,
         MIN(ai.sort_order) AS first_sort
  FROM assessment_items ai
  JOIN assessments a ON ai.assessment_id = a.id
  WHERE a.deleted_at IS NULL
    AND a.template_id IN (101, 102, 103, 122, 123)
  GROUP BY a.template_id, ai.dimension, ai.item_name
) x;
