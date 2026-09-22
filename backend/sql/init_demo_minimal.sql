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
