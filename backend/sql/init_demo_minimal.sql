-- ============================================================
-- 修复(P2)：本文件原先没有声明客户端字符集。在 character_set_client=gbk 的环境
-- （中文 Windows 上 mysql 客户端的默认值）下导入，会直接报
-- ERROR 1267 Illegal mix of collations (utf8mb4_0900_ai_ci,IMPLICIT)
-- and (gbk_chinese_ci,COERCIBLE)，整份演示数据写不进去。这里显式声明 utf8mb4。
SET NAMES utf8mb4;

-- ============================================================
-- 系统初始化后的最小演示数据集（mode=demo 时写入）
--
-- 设计原则：
--   1) 只写最基础的花名册数据（班级 + 学生 + 家长 + 关联），
--      不动账号 / 角色 / 权限 / 字典——那些是系统的骨架，初始化不碰；
--   2) 障碍类型按名称子查询取值，避免依赖具体 id；
--   3) 班主任取 users 表中真实存在的教师账号，避免指向空 id。
-- ============================================================

-- 班级（3 个，班主任依次指派给现有教师账号）
INSERT INTO student_classes (name, grade, teacher_id, capacity, description, is_active, created_at, updated_at)
SELECT '启智一班', '二年级', (SELECT id FROM users WHERE username = 'teacher1' LIMIT 1), 12, '初始化演示班级', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM student_classes WHERE name = '启智一班');

INSERT INTO student_classes (name, grade, teacher_id, capacity, description, is_active, created_at, updated_at)
SELECT '启智二班', '二年级', (SELECT id FROM users WHERE username = 'teacher3' LIMIT 1), 12, '初始化演示班级', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM student_classes WHERE name = '启智二班');

INSERT INTO student_classes (name, grade, teacher_id, capacity, description, is_active, created_at, updated_at)
SELECT '启智三班', '三年级', (SELECT id FROM users WHERE username = 'teacher4' LIMIT 1), 12, '初始化演示班级', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM student_classes WHERE name = '启智三班');

-- 学生（6 名，覆盖常见障碍类型）
INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生甲', '男', '2018-03-12', (SELECT id FROM dict_disability_types WHERE name = '智力障碍' LIMIT 1), '三级',
       (SELECT id FROM student_classes WHERE name = '启智一班' LIMIT 1),
       '甲家长', '13800000001', '父亲', '甲家长', '13800000001',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生甲');

INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生乙', '女', '2018-05-20', (SELECT id FROM dict_disability_types WHERE name = '自闭症谱系障碍' LIMIT 1), '二级',
       (SELECT id FROM student_classes WHERE name = '启智一班' LIMIT 1),
       '乙家长', '13800000002', '母亲', '乙家长', '13800000002',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生乙');

INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生丙', '男', '2017-11-02', (SELECT id FROM dict_disability_types WHERE name = '脑瘫' LIMIT 1), '三级',
       (SELECT id FROM student_classes WHERE name = '启智二班' LIMIT 1),
       '丙家长', '13800000003', '父亲', '丙家长', '13800000003',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生丙');

INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生丁', '女', '2017-08-16', (SELECT id FROM dict_disability_types WHERE name = '唐氏综合征' LIMIT 1), '三级',
       (SELECT id FROM student_classes WHERE name = '启智二班' LIMIT 1),
       '丁家长', '13800000004', '母亲', '丁家长', '13800000004',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生丁');

INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生戊', '男', '2016-12-25', (SELECT id FROM dict_disability_types WHERE name = '多重障碍' LIMIT 1), '二级',
       (SELECT id FROM student_classes WHERE name = '启智三班' LIMIT 1),
       '戊家长', '13800000005', '父亲', '戊家长', '13800000005',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生戊');

INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id,
                      guardian_name, guardian_phone, guardian_relation, emergency_contact, emergency_phone,
                      status, enrollment_date, remarks, created_at, updated_at)
SELECT '示例学生己', '女', '2016-09-09', (SELECT id FROM dict_disability_types WHERE name = '听力障碍' LIMIT 1), '四级',
       (SELECT id FROM student_classes WHERE name = '启智三班' LIMIT 1),
       '己家长', '13800000007', '母亲', '己家长', '13800000007',
       '在读', CURDATE(), '初始化写入的演示学生', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = '示例学生己');

-- 家长档案（与学生一一对应）
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '甲家长', '13800000001', '__PENDING__', '父亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000001');
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '乙家长', '13800000002', '__PENDING__', '母亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000002');
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '丙家长', '13800000003', '__PENDING__', '父亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000003');
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '丁家长', '13800000004', '__PENDING__', '母亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000004');
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '戊家长', '13800000005', '__PENDING__', '父亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000005');
INSERT INTO parents (name, phone, password_hash, relation, is_active, created_at, updated_at)
SELECT '己家长', '13800000007', '__PENDING__', '母亲', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM parents WHERE phone = '13800000007');

-- 学生-家长关联
INSERT INTO student_parents (student_id, parent_id, relation, is_primary, can_sign, created_at)
SELECT s.id, p.id, p.relation, 1, 1, NOW()
FROM students s
JOIN parents p ON p.phone = s.guardian_phone
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM student_parents sp WHERE sp.student_id = s.id AND sp.parent_id = p.id
  );

-- ============================================================
-- 追加段：演示教师账号（2026-10-13）
--
-- 为什么要补这段：演示数据生成器 gen_demo_v3.py 的 TEACHERS 按固定 id 引用
-- 教师账号（3=李老师、4=王老师 来自 init.sql，另加 9~18 共 10 人）。其中
-- 9~18 历史上只存在于开发活库里 —— 它们是演示账号，不是回归测试残留
-- （用户名 teacher3~teacher12，姓名与生成器 TEACHERS 字典逐一对应）。
--
-- 后果：「从零重建演示库」这条路从未走通过。空库跑生成器必然在
-- teacher_classes 上报 ERROR 1452（teacher_id=9 不存在），随后
-- iep_plans.primary_teacher_id 失败、iep_goals / iep_objectives /
-- assessment_items 等 20 余张表全部级联失败（实测 26 个错误，根因只有 1 个）。
-- 于是只能靠 dump 活库来造演示数据 —— 库的状态又与代码脱钩，
-- 与 ADR-040（字典只存在于演示数据生成器里）是同一类病。
--
-- 做法：id 固定 9~18 以匹配生成器硬编码引用，username 唯一键保证幂等。
-- 统一密码 admin123（与既有演示账号一致），role_id=3 班主任 / permission_group_id=3。
INSERT INTO users (id, username, password_hash, real_name, role_id, permission_group_id, department, is_active, created_at, updated_at)
VALUES
  (9,  'teacher3',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '周雨薇', 3, 3, '特教组', 1, NOW(), NOW()),
  (10, 'teacher4',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '刘志远', 3, 3, '特教组', 1, NOW(), NOW()),
  (11, 'teacher5',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '郑晓琳', 3, 3, '特教组', 1, NOW(), NOW()),
  (12, 'teacher6',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '何俊峰', 3, 3, '特教组', 1, NOW(), NOW()),
  (13, 'teacher7',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '高文博', 3, 3, '特教组', 1, NOW(), NOW()),
  (14, 'teacher8',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '邓海燕', 3, 3, '特教组', 1, NOW(), NOW()),
  (15, 'teacher9',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '许志强', 3, 3, '特教组', 1, NOW(), NOW()),
  (16, 'teacher10', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '潘丽华', 3, 3, '特教组', 1, NOW(), NOW()),
  (17, 'teacher11', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '曾宪明', 3, 3, '特教组', 1, NOW(), NOW()),
  (18, 'teacher12', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '唐美玲', 3, 3, '特教组', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE id = id;

-- 幂等自证：这段必须能重复执行且不产生重复账号。
SELECT CONCAT('[seed] 演示教师账号数（应为 10 + init.sql 的 6 = 16）: ',
              (SELECT COUNT(*) FROM users)) AS check_result;
