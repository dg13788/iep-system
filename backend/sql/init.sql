-- ========================================================
-- IEP System V1.0 - Complete Database Initialization Script
-- 28 Tables + Default Data
-- MySQL 8.0+ / InnoDB / utf8mb4
-- ========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------
-- 1. Dictionary: Disability Types
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS dict_disability_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL COMMENT '障碍编码',
    name VARCHAR(100) NOT NULL COMMENT '障碍名称',
    description VARCHAR(500) COMMENT '描述说明',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用:1是0否',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='障碍类型字典表';

-- --------------------------------------------------------
-- 2. Dictionary: Common
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS dict_common (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50) NOT NULL COMMENT '字典分类',
    code VARCHAR(50) NOT NULL COMMENT '字典编码',
    name VARCHAR(100) NOT NULL COMMENT '字典名称',
    value VARCHAR(255) COMMENT '字典值',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_category_code (category, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用字典表';

-- --------------------------------------------------------
-- 3. RBAC: Roles
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    description VARCHAR(255) COMMENT '角色描述',
    is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统内置角色',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- --------------------------------------------------------
-- 4. RBAC: Permissions
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '权限名称',
    code VARCHAR(100) NOT NULL COMMENT '权限编码，格式: module.action',
    module VARCHAR(50) COMMENT '所属模块',
    description VARCHAR(255) COMMENT '权限描述',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_code (code),
    INDEX idx_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- --------------------------------------------------------
-- 5. RBAC: Role Permissions
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL COMMENT '角色ID',
    permission_id INT NOT NULL COMMENT '权限ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_role_permission (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表';

-- --------------------------------------------------------
-- 6. System: Modules
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '模块名称',
    code VARCHAR(50) NOT NULL COMMENT '模块编码',
    parent_id INT DEFAULT 0 COMMENT '父模块ID，0为顶级',
    icon VARCHAR(100) COMMENT '图标类名',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    routes JSON COMMENT '路由配置',
    permissions JSON COMMENT '权限配置',
    description VARCHAR(255) COMMENT '模块描述',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_code (code),
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统模块表';

-- --------------------------------------------------------
-- 7. Permission Groups
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS permission_groups (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '权限组ID',
    name VARCHAR(50) NOT NULL COMMENT '权限组名称',
    description VARCHAR(200) DEFAULT '' COMMENT '描述',
    data_scope_type ENUM('all', 'class_only', 'teacher_related', 'own_only', 'none') NOT NULL DEFAULT 'none' COMMENT '数据范围类型',
    iep_level ENUM('none', 'view', 'participate', 'full') NOT NULL DEFAULT 'none' COMMENT 'IEP权限级别',
    menu_permissions JSON COMMENT '可访问的菜单列表',
    feature_permissions JSON COMMENT '功能权限编码列表',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    is_system TINYINT(1) DEFAULT 0 COMMENT '系统内置=1不可删除',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限组表';

-- --------------------------------------------------------
-- 8. Users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL COMMENT '登录账号',
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt密码哈希',
    real_name VARCHAR(100) COMMENT '真实姓名',
    phone VARCHAR(50) COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    avatar VARCHAR(500) COMMENT '头像URL',
    role_id INT COMMENT '角色ID，关联roles.id',
    permission_group_id INT COMMENT '权限组ID，关联permission_groups.id',
    department VARCHAR(100) COMMENT '部门',
    last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
    login_ip VARCHAR(45) COMMENT '最后登录IP',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username),
    INDEX idx_phone (phone),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_group_id (permission_group_id),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- --------------------------------------------------------
-- 8. Student Classes
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '班级名称',
    grade VARCHAR(50) COMMENT '年级',
    teacher_id INT COMMENT '班主任ID，关联users.id',
    assistant_teacher_id INT COMMENT '副班主任ID',
    capacity INT DEFAULT 12 COMMENT '班级容量',
    description VARCHAR(255) COMMENT '班级描述',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '软删除时间，v4数据权限过滤依赖此字段',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_teacher_id (teacher_id),
    KEY idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='班级表';

-- --------------------------------------------------------
-- 9. Students
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '学生姓名',
    gender CHAR(1) NOT NULL DEFAULT '男' COMMENT '性别:男/女',
    birth_date DATE COMMENT '出生日期',
    id_card VARCHAR(18) COMMENT '身份证号',
    disability_type_id INT COMMENT '障碍类型ID，关联dict_disability_types.id',
    disability_level VARCHAR(50) COMMENT '障碍等级',
    disability_card_no VARCHAR(100) COMMENT '残疾证号',
    class_id INT COMMENT '班级ID，关联student_classes.id',
    guardian_name VARCHAR(100) COMMENT '监护人姓名',
    guardian_phone VARCHAR(50) COMMENT '监护人电话',
    guardian_relation VARCHAR(50) COMMENT '监护人关系',
    emergency_contact VARCHAR(100) COMMENT '紧急联系人',
    emergency_phone VARCHAR(50) COMMENT '紧急联系电话',
    address TEXT COMMENT '家庭住址',
    health_info TEXT COMMENT '健康状况',
    allergy_info TEXT COMMENT '过敏信息',
    medication_info TEXT COMMENT '用药信息',
    photo_url VARCHAR(500) COMMENT '照片URL',
    status ENUM('在读','休学','毕业','转衔') DEFAULT '在读' COMMENT '学籍状态',
    enrollment_date DATE COMMENT '入学日期',
    graduation_date DATE COMMENT '毕业日期',
    remarks TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_name (name),
    INDEX idx_class_id (class_id),
    INDEX idx_status (status),
    INDEX idx_disability_type_id (disability_type_id),
    INDEX idx_guardian_phone (guardian_phone),
    INDEX idx_class_status (class_id, status),
    INDEX idx_disability_status (disability_type_id, status),
    INDEX idx_created_at (created_at),
    CONSTRAINT fk_stu_class FOREIGN KEY (class_id) REFERENCES student_classes(id) ON DELETE SET NULL,
    CONSTRAINT fk_stu_disability FOREIGN KEY (disability_type_id) REFERENCES dict_disability_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生档案表';

-- --------------------------------------------------------
-- 10. Student Attachments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '文件存储路径',
    file_size INT DEFAULT 0 COMMENT '文件大小(字节)',
    file_type VARCHAR(50) COMMENT '文件MIME类型',
    category VARCHAR(50) COMMENT '附件分类',
    description VARCHAR(255) COMMENT '描述',
    is_confidential TINYINT(1) DEFAULT 0 COMMENT '是否保密',
    uploaded_by INT COMMENT '上传人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_student_id (student_id),
    CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生附件表';

-- --------------------------------------------------------
-- 11. Assessments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    template_id INT COMMENT '使用的评估模板ID',
    assessor_id INT NOT NULL COMMENT '评估人ID，关联users.id',
    assessment_date DATE NOT NULL COMMENT '评估日期',
    assessment_type VARCHAR(50) COMMENT '评估类型',
    total_score INT DEFAULT 0 COMMENT '总得分',
    max_score INT DEFAULT 0 COMMENT '满分',
    score_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT '得分百分比',
    summary TEXT COMMENT '评估总结',
    recommendations TEXT COMMENT '建议',
    status ENUM('draft','completed','archived') DEFAULT 'draft' COMMENT '状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_student_id (student_id),
    INDEX idx_assessor_id (assessor_id),
    INDEX idx_assessment_date (assessment_date),
    CONSTRAINT fk_ass_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_assessor FOREIGN KEY (assessor_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评估记录表';

-- --------------------------------------------------------
-- 12. Assessment Items
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assessment_id INT NOT NULL COMMENT '评估记录ID，关联assessments.id',
    dimension VARCHAR(100) NOT NULL COMMENT '评估维度',
    item_name VARCHAR(200) NOT NULL COMMENT '项目名称',
    item_description TEXT COMMENT '项目描述',
    score INT DEFAULT 0 COMMENT '得分',
    max_score INT DEFAULT 5 COMMENT '满分',
    score_level VARCHAR(20) COMMENT '等级',
    notes TEXT COMMENT '备注',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_assessment_id (assessment_id),
    CONSTRAINT fk_ai_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评估项目明细表';

-- --------------------------------------------------------
-- 13. Assessment Templates
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT '模板名称',
    category VARCHAR(50) COMMENT '模板分类',
    description TEXT COMMENT '模板描述',
    target_disability_types JSON COMMENT '适用障碍类型',
    applicable_age_min INT COMMENT '最小适用年龄',
    applicable_age_max INT COMMENT '最大适用年龄',
    is_system TINYINT(1) DEFAULT 1 COMMENT '是否系统模板',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统评估模板表';

-- --------------------------------------------------------
-- 14. Assessment Templates Custom
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_templates_custom (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL COMMENT '模板名称',
    category VARCHAR(50) COMMENT '模板分类',
    description TEXT COMMENT '模板描述',
    target_disability_types JSON COMMENT '适用障碍类型',
    applicable_age_min INT COMMENT '最小适用年龄',
    applicable_age_max INT COMMENT '最大适用年龄',
    created_by INT NOT NULL COMMENT '创建人ID',
    status ENUM('draft','published','archived') DEFAULT 'draft' COMMENT '状态',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自定义评估模板表';

-- --------------------------------------------------------
-- 15. Template Items Custom
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_items_custom (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL COMMENT '模板ID，关联assessment_templates_custom.id',
    dimension VARCHAR(100) NOT NULL COMMENT '评估维度',
    item_name VARCHAR(200) NOT NULL COMMENT '项目名称',
    item_description TEXT COMMENT '项目描述',
    max_score INT DEFAULT 5 COMMENT '满分',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_template_id (template_id),
    CONSTRAINT fk_tic_template FOREIGN KEY (template_id) REFERENCES assessment_templates_custom(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自定义模板项表';

-- --------------------------------------------------------
-- 16. IEP Plans
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS iep_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    plan_code VARCHAR(100) COMMENT '计划编号',
    title VARCHAR(200) NOT NULL COMMENT '计划标题',
    academic_year VARCHAR(20) NOT NULL COMMENT '学年',
    semester VARCHAR(20) COMMENT '学期',
    start_date DATE NOT NULL COMMENT '开始日期',
    end_date DATE NOT NULL COMMENT '结束日期',
    primary_teacher_id INT NOT NULL COMMENT '主要负责人ID，关联users.id',
    team_members JSON COMMENT '团队成员列表',
    strengths TEXT COMMENT '学生优势',
    needs TEXT COMMENT '学生需求',
    priorities TEXT COMMENT '优先事项',
    adaptations TEXT COMMENT '教学调整方案',
    assistive_tech TEXT COMMENT '辅助技术/工具',
    transition_plan TEXT COMMENT '转衔计划',
    status ENUM('draft','reviewing','approved','rejected','signed','active','completed','archived') DEFAULT 'draft' COMMENT '计划状态',
    progress_summary TEXT COMMENT '进度总结',
    created_by INT NOT NULL COMMENT '创建人ID，关联users.id',
    approved_by INT COMMENT '审批人ID，关联users.id',
    approved_at TIMESTAMP NULL COMMENT '审批时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_student_id (student_id),
    INDEX idx_status (status),
    INDEX idx_primary_teacher (primary_teacher_id),
    CONSTRAINT fk_iep_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_iep_primary_teacher FOREIGN KEY (primary_teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_iep_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_iep_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IEP计划表';

-- --------------------------------------------------------
-- 17. IEP Goals
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS iep_goals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id INT NOT NULL COMMENT 'IEP计划ID，关联iep_plans.id',
    goal_code VARCHAR(100) COMMENT '目标编码',
    area VARCHAR(100) NOT NULL COMMENT '领域:认知/沟通/社交/生活自理/运动/情绪行为/学业',
    title VARCHAR(200) NOT NULL COMMENT '目标标题',
    description TEXT COMMENT '目标描述',
    target_behavior TEXT COMMENT '目标行为描述',
    criteria TEXT COMMENT '达成标准',
    evaluation_method VARCHAR(200) COMMENT '评估方法',
    baseline VARCHAR(500) COMMENT '基线水平',
    target_score INT DEFAULT 5 COMMENT '目标分数',
    current_score INT DEFAULT 0 COMMENT '当前分数',
    progress_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT '进度百分比',
    start_date DATE COMMENT '开始日期',
    target_date DATE COMMENT '目标日期',
    priority ENUM('high','medium','low') DEFAULT 'medium' COMMENT '优先级',
    status ENUM('not_started','in_progress','achieved','partially_achieved','discontinued','exceeded') DEFAULT 'not_started' COMMENT '目标状态',
    teaching_strategies TEXT COMMENT '教学策略',
    resources TEXT COMMENT '所需资源',
    responsible_teacher_id INT COMMENT '责任教师ID，关联users.id',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_iep_plan_id (iep_plan_id),
    INDEX idx_area (area),
    INDEX idx_status (status),
    INDEX idx_responsible_teacher (responsible_teacher_id),
    CONSTRAINT fk_goal_plan FOREIGN KEY (iep_plan_id) REFERENCES iep_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_goal_teacher FOREIGN KEY (responsible_teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IEP目标表';

-- --------------------------------------------------------
-- 18. IEP Goal Progress
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS iep_goal_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id INT NOT NULL COMMENT '目标ID，关联iep_goals.id',
    recorded_date DATE NOT NULL COMMENT '记录日期',
    session_type VARCHAR(50) COMMENT '教学场景类型',
    score INT DEFAULT 0 COMMENT '得分',
    max_score INT DEFAULT 5 COMMENT '满分',
    prompt_level VARCHAR(50) COMMENT '提示等级',
    is_generalized TINYINT(1) DEFAULT 0 COMMENT '是否泛化',
    generalization_context VARCHAR(255) COMMENT '泛化场景描述',
    notes TEXT COMMENT '备注说明',
    recorded_by INT NOT NULL COMMENT '记录人ID，关联users.id',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_goal_id (goal_id),
    INDEX idx_recorded_date (recorded_date),
    CONSTRAINT fk_progress_goal FOREIGN KEY (goal_id) REFERENCES iep_goals(id) ON DELETE CASCADE,
    CONSTRAINT fk_progress_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IEP目标达成进度表';

-- --------------------------------------------------------
-- 19. IEP Approval Logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS iep_approval_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id INT NOT NULL COMMENT 'IEP计划ID，关联iep_plans.id',
    approver_id INT NOT NULL COMMENT '审批人ID',
    approver_type ENUM('user','parent') DEFAULT 'user' COMMENT '审批人类型',
    approver_role VARCHAR(50) COMMENT '审批人角色',
    approver_name VARCHAR(100) COMMENT '审批人姓名',
    action ENUM('submit','review','approve','reject','revise','sign','withdraw') NOT NULL COMMENT '操作动作',
    comment TEXT COMMENT '审批意见',
    previous_status VARCHAR(50) COMMENT '操作前状态',
    new_status VARCHAR(50) COMMENT '操作后状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_iep_plan_id (iep_plan_id),
    CONSTRAINT fk_al_plan FOREIGN KEY (iep_plan_id) REFERENCES iep_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IEP审批流程日志表';

-- --------------------------------------------------------
-- 20. Teaching Records
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS teaching_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL COMMENT '教师ID，关联users.id',
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    iep_goal_id INT COMMENT '关联IEP目标ID，关联iep_goals.id',
    record_date DATE NOT NULL COMMENT '记录日期',
    session_type VARCHAR(50) COMMENT '教学场景类型',
    subject VARCHAR(100) COMMENT '学科/领域',
    teaching_content TEXT COMMENT '教学内容',
    teaching_method VARCHAR(200) COMMENT '教学方法',
    student_performance TEXT COMMENT '学生表现',
    difficulties TEXT COMMENT '遇到的困难',
    adjustments TEXT COMMENT '调整措施',
    materials_used TEXT COMMENT '使用材料',
    homework TEXT COMMENT '课后作业/延伸',
    next_plan TEXT COMMENT '下一步计划',
    effectiveness_score INT COMMENT '效果评分',
    duration_minutes INT COMMENT '教学时长(分钟)',
    is_key_record TINYINT(1) DEFAULT 0 COMMENT '是否关键记录',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    INDEX idx_teacher_id (teacher_id),
    INDEX idx_student_id (student_id),
    INDEX idx_iep_goal_id (iep_goal_id),
    INDEX idx_record_date (record_date),
    CONSTRAINT fk_tr_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tr_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_tr_goal FOREIGN KEY (iep_goal_id) REFERENCES iep_goals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教学记录表';

-- --------------------------------------------------------
-- 21. Parents
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '家长姓名',
    phone VARCHAR(50) NOT NULL COMMENT '手机号',
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt密码哈希',
    email VARCHAR(100) COMMENT '邮箱',
    avatar VARCHAR(500) COMMENT '头像URL',
    relation VARCHAR(50) COMMENT '与学生关系',
    address TEXT COMMENT '家庭住址',
    wechat_openid VARCHAR(100) COMMENT '微信OpenID',
    last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
    login_ip VARCHAR(45) COMMENT '最后登录IP',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间(软删除)',
    UNIQUE KEY uk_phone (phone),
    UNIQUE KEY uk_wechat (wechat_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家长账号表';

-- --------------------------------------------------------
-- 22. Student Parents
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    parent_id INT NOT NULL COMMENT '家长ID，关联parents.id',
    relation VARCHAR(50) COMMENT '关系说明',
    is_primary TINYINT(1) DEFAULT 0 COMMENT '是否主要联系人',
    can_sign TINYINT(1) DEFAULT 1 COMMENT '是否有签名权限',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_student_parent (student_id, parent_id),
    CONSTRAINT fk_sp_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_sp_parent FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生家长关联表';

-- --------------------------------------------------------
-- 23. Parent Signatures
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_signatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    iep_plan_id INT NOT NULL COMMENT 'IEP计划ID，关联iep_plans.id',
    parent_id INT NOT NULL COMMENT '家长ID，关联parents.id',
    signature_type ENUM('handwritten','digital','fingerprint') DEFAULT 'handwritten' COMMENT '签名类型',
    signature_data MEDIUMTEXT COMMENT '签名数据(Base64)',
    signature_hash VARCHAR(255) COMMENT '签名哈希校验',
    ip_address VARCHAR(45) COMMENT '签名IP地址',
    device_info VARCHAR(255) COMMENT '设备信息',
    signing_purpose VARCHAR(200) COMMENT '签名用途',
    is_revoked TINYINT(1) DEFAULT 0 COMMENT '是否撤销',
    revoked_reason VARCHAR(255) COMMENT '撤销原因',
    revoked_at TIMESTAMP NULL COMMENT '撤销时间',
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '签名时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_plan_parent (iep_plan_id, parent_id),
    INDEX idx_iep_plan_id (iep_plan_id),
    INDEX idx_parent_id (parent_id),
    CONSTRAINT fk_sig_plan FOREIGN KEY (iep_plan_id) REFERENCES iep_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_sig_parent FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家长电子签名记录表';

-- --------------------------------------------------------
-- 24. Parent Communications
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_communications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '学生ID，关联students.id',
    teacher_id INT NOT NULL COMMENT '教师ID，关联users.id',
    parent_id INT COMMENT '家长ID，关联parents.id',
    communication_type VARCHAR(50) COMMENT '沟通类型',
    content TEXT NOT NULL COMMENT '沟通内容',
    teacher_feedback TEXT COMMENT '教师反馈',
    parent_feedback TEXT COMMENT '家长反馈',
    follow_up TEXT COMMENT '后续跟进计划',
    is_confidential TINYINT(1) DEFAULT 0 COMMENT '是否保密',
    communication_date DATE NOT NULL COMMENT '沟通日期',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_student_id (student_id),
    INDEX idx_teacher_id (teacher_id),
    INDEX idx_parent_id (parent_id),
    CONSTRAINT fk_pc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pc_parent FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家校沟通记录表';

-- --------------------------------------------------------
-- 25. Audit Logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT COMMENT '操作用户ID',
    username VARCHAR(100) COMMENT '操作用户名',
    user_type ENUM('system','user','parent') DEFAULT 'user' COMMENT '用户类型',
    action VARCHAR(50) NOT NULL COMMENT '操作动作',
    module VARCHAR(50) COMMENT '操作模块',
    target_type VARCHAR(50) COMMENT '操作对象类型',
    target_id INT COMMENT '操作对象ID',
    target_name VARCHAR(200) COMMENT '操作对象名称',
    old_value JSON COMMENT '变更前值',
    new_value JSON COMMENT '变更后值',
    change_summary TEXT COMMENT '变更摘要',
    ip VARCHAR(45) COMMENT '操作IP',
    user_agent TEXT COMMENT '浏览器UA',
    request_method VARCHAR(10) COMMENT '请求方法',
    request_path VARCHAR(500) COMMENT '请求路径',
    alert_level ENUM('low','medium','high','critical') DEFAULT 'low' COMMENT '告警级别',
    alert_reason VARCHAR(255) COMMENT '告警原因',
    is_resolved TINYINT(1) DEFAULT 0 COMMENT '是否已处理',
    resolved_by INT COMMENT '处理人ID',
    resolved_at TIMESTAMP NULL COMMENT '处理时间',
    resolution_note TEXT COMMENT '处理备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_module (module),
    INDEX idx_created_at (created_at),
    INDEX idx_alert_level (alert_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';

-- --------------------------------------------------------
-- 26. System Events
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL COMMENT '事件类型',
    event_name VARCHAR(200) NOT NULL COMMENT '事件名称',
    source_module VARCHAR(50) COMMENT '来源模块',
    source_id INT COMMENT '来源对象ID',
    payload JSON COMMENT '事件载荷数据',
    status ENUM('pending','processing','completed','failed','retrying') DEFAULT 'pending' COMMENT '处理状态',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    max_retries INT DEFAULT 3 COMMENT '最大重试次数',
    error_message TEXT COMMENT '错误信息',
    processed_at TIMESTAMP NULL COMMENT '处理时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_event_type (event_type),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统事件表';

-- --------------------------------------------------------
-- 27. Notifications
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    recipient_type ENUM('user','parent') NOT NULL COMMENT '接收者类型',
    recipient_id INT NOT NULL COMMENT '接收者ID',
    sender_type ENUM('system','user','parent') DEFAULT 'system' COMMENT '发送者类型',
    sender_id INT COMMENT '发送者ID',
    sender_name VARCHAR(100) COMMENT '发送者名称',
    title VARCHAR(200) NOT NULL COMMENT '通知标题',
    content TEXT COMMENT '通知内容',
    notification_type VARCHAR(50) COMMENT '通知类型',
    module VARCHAR(50) COMMENT '关联模块',
    target_type VARCHAR(50) COMMENT '目标对象类型',
    target_id INT COMMENT '目标对象ID',
    target_url VARCHAR(500) COMMENT '目标链接URL',
    is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读',
    read_at TIMESTAMP NULL COMMENT '阅读时间',
    priority ENUM('low','normal','high','urgent') DEFAULT 'normal' COMMENT '优先级',
    expires_at TIMESTAMP NULL COMMENT '过期时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_recipient (recipient_type, recipient_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统通知表';

-- --------------------------------------------------------
-- 28. Teacher-Class relation (科任教师授课班级关联表)
--     v4 数据权限 teacher_related 依赖此表
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL COMMENT '教师user_id',
    class_id INT NOT NULL COMMENT '班级id',
    subject VARCHAR(50) DEFAULT NULL COMMENT '任教科目',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否有效',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_teacher_class (teacher_id, class_id),
    KEY idx_teacher (teacher_id),
    KEY idx_class (class_id),
    CONSTRAINT fk_teacher_classes_teacher FOREIGN KEY (teacher_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_classes_class FOREIGN KEY (class_id) REFERENCES student_classes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师授课班级关联表';

-- --------------------------------------------------------
-- 29. Data Scope Log (数据权限访问审计表)
--     v4 数据权限：记录每次数据范围过滤行为，满足合规审计要求
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_scope_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL DEFAULT 0 COMMENT '操作用户id',
    username VARCHAR(100) DEFAULT NULL COMMENT '操作用户名',
    scope_type VARCHAR(32) NOT NULL COMMENT '数据范围类型 all/class_teacher/teacher/parent/viewer',
    module VARCHAR(50) DEFAULT NULL COMMENT '访问模块 students/iep/assessments/teaching',
    record_count INT NOT NULL DEFAULT 0 COMMENT '本次返回记录数',
    ip VARCHAR(64) DEFAULT NULL COMMENT '来源IP',
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
    KEY idx_user (user_id),
    KEY idx_scope (scope_type),
    KEY idx_module (module),
    KEY idx_accessed (accessed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据权限访问审计表';

-- --------------------------------------------------------
-- 30. DB Migrations
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS db_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE COMMENT '迁移版本号',
    description VARCHAR(255) COMMENT '迁移描述',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '应用时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库迁移记录表';

SET FOREIGN_KEY_CHECKS = 1;

-- ========================================================
-- DEFAULT DATA
-- ========================================================

-- --------------------------------------------------------
-- 1. Roles (6 system roles)
-- --------------------------------------------------------
INSERT INTO roles (id, name, code, description, is_system, is_active) VALUES
(1, '超级管理员', 'admin', '系统配置、用户管理、权限分配、所有数据访问', 1, 1),
(2, '教学主任', 'director', '教学管理监督、IEP审批、评估审核、报表查看', 1, 1),
(3, '班主任', 'class_teacher', '班级学生管理、IEP制定、教学记录、家校沟通', 1, 1),
(4, '科任教师', 'teacher', '教学记录、目标进度录入、学生查看', 1, 1),
(5, '家长', 'parent', '查看子女IEP、电子签名、家校沟通反馈', 1, 1),
(6, '只读用户', 'viewer', '查看数据，无操作权限', 1, 1);

-- --------------------------------------------------------
-- 2. Permissions (42 permissions)
-- --------------------------------------------------------
INSERT INTO permissions (id, name, code, module, description, is_active) VALUES
-- Student module
(1, '学生查看', 'students.view', 'students', '查看学生列表和详情', 1),
(2, '学生创建', 'students.create', 'students', '创建学生档案', 1),
(3, '学生编辑', 'students.edit', 'students', '编辑学生信息', 1),
(4, '学生删除', 'students.delete', 'students', '删除学生档案', 1),
(5, '学生导出', 'students.export', 'students', '导出学生数据', 1),
(6, '班级管理', 'students.class_manage', 'students', '管理班级信息', 1),
-- Assessment module
(7, '评估查看', 'assessments.view', 'assessments', '查看评估记录', 1),
(8, '评估创建', 'assessments.create', 'assessments', '创建评估记录', 1),
(9, '评估编辑', 'assessments.edit', 'assessments', '编辑评估记录', 1),
(10, '评估删除', 'assessments.delete', 'assessments', '删除评估记录', 1),
(11, '评估审核', 'assessments.audit', 'assessments', '审核评估记录', 1),
(12, '评估模板查看', 'assessments.template_view', 'assessments', '查看评估模板', 1),
(13, '评估模板管理', 'assessments.template_manage', 'assessments', '管理评估模板', 1),
-- IEP module
(14, 'IEP查看', 'iep.view', 'iep', '查看IEP计划', 1),
(15, 'IEP创建', 'iep.create', 'iep', '创建IEP计划', 1),
(16, 'IEP编辑', 'iep.edit', 'iep', '编辑IEP计划', 1),
(17, 'IEP删除', 'iep.delete', 'iep', '删除IEP计划', 1),
(18, 'IEP审批', 'iep.approve', 'iep', '审批IEP计划', 1),
(19, 'IEP签名', 'iep.sign', 'iep', '家长签名IEP', 1),
(20, '目标管理', 'iep.goal_manage', 'iep', '管理IEP目标', 1),
(21, '进度记录', 'iep.progress', 'iep', '记录目标进度', 1),
-- Teaching module
(22, '教学记录查看', 'teaching.view', 'teaching', '查看教学记录', 1),
(23, '教学记录创建', 'teaching.create', 'teaching', '创建教学记录', 1),
(24, '教学记录编辑', 'teaching.edit', 'teaching', '编辑教学记录', 1),
(25, '教学记录删除', 'teaching.delete', 'teaching', '删除教学记录', 1),
-- Template module
(26, '模板查看', 'templates.view', 'templates', '查看模板', 1),
(27, '模板创建', 'templates.create', 'templates', '创建模板', 1),
(28, '模板编辑', 'templates.edit', 'templates', '编辑模板', 1),
(29, '模板删除', 'templates.delete', 'templates', '删除模板', 1),
(30, '模板项目管理', 'templates.item_manage', 'templates', '管理模板项目', 1),
-- Parents module
(31, '家长查看', 'parents.view', 'parents', '查看家长信息', 1),
(32, '家长创建', 'parents.create', 'parents', '创建家长账号', 1),
(33, '家长编辑', 'parents.edit', 'parents', '编辑家长信息', 1),
(34, '家长删除', 'parents.delete', 'parents', '删除家长账号', 1),
(35, '沟通记录查看', 'parents.communication_view', 'parents', '查看沟通记录', 1),
(36, '沟通记录创建', 'parents.communication_create', 'parents', '创建沟通记录', 1),
-- Reports module
(37, '仪表盘', 'reports.dashboard', 'reports', '查看仪表盘', 1),
(38, '学生统计', 'reports.students', 'reports', '查看学生统计', 1),
(39, '评估统计', 'reports.assessments', 'reports', '查看评估统计', 1),
(40, 'IEP统计', 'reports.iep', 'reports', '查看IEP统计', 1),
(41, '教学统计', 'reports.teaching', 'reports', '查看教学统计', 1),
-- System module
(42, '系统管理', 'system.manage', 'system', '系统管理权限', 1);

-- --------------------------------------------------------
-- 3. Role-Permissions Mapping
-- --------------------------------------------------------
-- Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6),
(1, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12), (1, 13),
(1, 14), (1, 15), (1, 16), (1, 17), (1, 18), (1, 19), (1, 20), (1, 21),
(1, 22), (1, 23), (1, 24), (1, 25),
(1, 26), (1, 27), (1, 28), (1, 29), (1, 30),
(1, 31), (1, 32), (1, 33), (1, 34), (1, 35), (1, 36),
(1, 37), (1, 38), (1, 39), (1, 40), (1, 41), (1, 42);

-- Director: view all + approve + audit + reports
INSERT INTO role_permissions (role_id, permission_id) VALUES
(2, 1), (2, 5), (2, 7), (2, 11), (2, 12),
(2, 14), (2, 17), (2, 18),
(2, 22), (2, 23), (2, 24), (2, 25),
(2, 26), (2, 27), (2, 28), (2, 29),
(2, 31), (2, 32), (2, 33), (2, 35), (2, 36),
(2, 37), (2, 38), (2, 39), (2, 40), (2, 41);

-- Class teacher: full students, iep, teaching, parents
INSERT INTO role_permissions (role_id, permission_id) VALUES
(3, 1), (3, 2), (3, 3), (3, 5),
(3, 7), (3, 8), (3, 9),
(3, 14), (3, 15), (3, 16), (3, 17), (3, 20), (3, 21),
(3, 22), (3, 23), (3, 24), (3, 25),
(3, 26), (3, 27), (3, 28),
(3, 31), (3, 32), (3, 33), (3, 35), (3, 36),
(3, 37);

-- Teacher: view + create teaching, progress
INSERT INTO role_permissions (role_id, permission_id) VALUES
(4, 1),
(4, 7),
(4, 14), (4, 20), (4, 21),
(4, 22), (4, 23), (4, 24),
(4, 31), (4, 35);

-- Parent: view own children IEP, sign, communication
INSERT INTO role_permissions (role_id, permission_id) VALUES
(5, 14), (5, 19), (5, 36);

-- Viewer: view only
INSERT INTO role_permissions (role_id, permission_id) VALUES
(6, 1), (6, 7), (6, 14), (6, 22), (6, 26), (6, 37);

-- --------------------------------------------------------
-- 4. Default Admin User (password: admin123)
-- --------------------------------------------------------
INSERT INTO users (id, username, password_hash, real_name, phone, email, role_id, department, is_active, created_at, updated_at) VALUES
(1, 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '系统管理员', '13800000000', 'admin@iep.edu', 1, '信息中心', 1, NOW(), NOW());

-- --------------------------------------------------------
-- 5. Permission Groups
-- --------------------------------------------------------
INSERT INTO permission_groups (id, name, description, data_scope_type, iep_level, menu_permissions, feature_permissions, sort_order, is_system) VALUES
-- 超级管理员 - 全部权限
(1, '超级管理员', '系统最高权限，可管理所有数据和系统设置', 'all', 'full',
 '["dashboard","students","evaluation","iep","teaching","templates","parents","system"]',
 '["data_overview","statistics_view","student_view","student_create","student_edit","student_delete","class_manage","student_export","eval_view","eval_create","eval_edit","eval_delete","report_generate","report_export","iep_view","iep_create","iep_edit","iep_delete","iep_approve","signature_manage","goal_update","record_view","record_create","record_edit","record_delete","template_view","template_create","template_edit","template_delete","system_template_edit","parent_view","parent_manage","signature_send","communication_record","notification_send","user_view","user_manage","role_manage","audit_log","system_settings"]',
 1, 1);

-- --------------------------------------------------------
-- 5b. 权限组 2-6（v4 数据权限基线）
--     修复说明：原 init.sql 仅种子化 1 个权限组，导致
--     director/teacher/viewer 等角色登录后 permission_group_id
--     指向不存在的记录，getDataScope() 退化为 none，系统不可用。
-- --------------------------------------------------------
INSERT IGNORE INTO permission_groups (id, name, description, data_scope_type, iep_level, menu_permissions, feature_permissions, sort_order, is_system) VALUES
-- 2. 教学主任：全部数据范围，IEP 完全权限，无系统设置
(2, '教学主任', '负责教学管理和IEP审批', 'all', 'full',
 '["dashboard","students","evaluation","iep","teaching","templates","parents"]',
 JSON_ARRAY('data_overview','statistics_view',
            'student_view','student_create','student_edit','student_delete','class_manage','student_export',
            'eval_view','eval_create','eval_edit','eval_delete','report_generate','report_export',
            'iep_view','iep_create','iep_edit','iep_delete','iep_approve','signature_manage','goal_update',
            'record_view','record_create','record_edit','record_delete',
            'template_view','template_create','template_edit','template_delete','system_template_edit',
            'parent_view','parent_manage','signature_send','communication_record','notification_send'),
 2, 1),

-- 3. 班主任：仅本班数据，IEP 完全权限
(3, '班主任', '负责班级学生的IEP制定和教学实施', 'class_only', 'full',
 '["dashboard","students","evaluation","iep","teaching","parents"]',
 JSON_ARRAY('data_overview','statistics_view',
            'student_view','student_create','student_edit','student_export',
            'eval_view','eval_create','eval_edit','report_generate','report_export',
            'iep_view','iep_create','iep_edit','iep_approve','signature_manage','goal_update',
            'record_view','record_create','record_edit',
            'template_view',
            'parent_view','signature_send','communication_record','notification_send'),
 3, 1),

-- 4. 科任教师：仅所教学生数据，IEP 参与权限
(4, '科任教师', '负责所教学生的教学记录和IEP目标更新', 'teacher_related', 'participate',
 '["dashboard","students","evaluation","iep","teaching"]',
 JSON_ARRAY('data_overview',
            'student_view',
            'eval_view','eval_create','eval_edit',
            'iep_view','iep_edit','goal_update',
            'record_view','record_create','record_edit',
            'template_view'),
 4, 1),

-- 5. 家长组：仅本人关联学生，IEP 只读
(5, '家长', '可查看孩子的IEP信息和签名确认', 'own_only', 'view',
 '["iep","parents"]',
 JSON_ARRAY('iep_view','parent_view'),
 5, 1),

-- 6. 只读用户：全部数据范围，无编辑权限
(6, '只读用户', '可查看大部分数据，无编辑权限', 'all', 'none',
 '["dashboard","students","evaluation","iep","teaching","templates","parents"]',
 JSON_ARRAY('data_overview','statistics_view',
            'student_view','student_export',
            'eval_view','report_generate','report_export',
            'iep_view',
            'record_view',
            'template_view',
            'parent_view'),
 6, 1);

-- Update admin user's permission_group_id
UPDATE users SET permission_group_id = 1 WHERE id = 1;

-- --------------------------------------------------------
-- 5c. 演示账号（全部初始密码 admin123）
--     修复说明：原 init.sql 仅种子化 admin 一个账号且密码为 password，
--     与开发技术文档第 4.2 节声称的 6 个测试账号不符，部署后无法登录。
--     密码哈希 = bcrypt('admin123')
-- --------------------------------------------------------
INSERT IGNORE INTO users (id, username, password_hash, real_name, phone, email, role_id, permission_group_id, department, is_active, created_at, updated_at) VALUES
(2, 'director1', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '张主任', '13800000002', 'director@iep.edu',  2, 2, '教导处',   1, NOW(), NOW()),
(3, 'teacher1',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '李老师', '13800000003', 'teacher1@iep.edu', 3, 3, '一年级组', 1, NOW(), NOW()),
(4, 'teacher2',  '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '王老师', '13800000004', 'teacher2@iep.edu', 4, 4, '二年级组', 1, NOW(), NOW()),
(5, 'viewer1',   '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '赵督导', '13800000005', 'viewer@iep.edu',   6, 6, '督导室',   1, NOW(), NOW());

-- 统一 admin 初始密码为 admin123，与文档一致
UPDATE users SET password_hash = '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC' WHERE username = 'admin';

-- 注意：演示账号的数据范围关联（teacher1 任班主任、teacher2 授课班级）原位于此处，
-- 但因 student_classes 数据在后续"9. Sample Classes"才插入，此处执行会导致
-- UPDATE 影响0行、INSERT 违反外键被 IGNORE 静默跳过（种子顺序缺陷）。
-- 已将该关联语句移动至"9. Sample Classes"插入之后执行，见 init.sql 末尾修复段。

-- --------------------------------------------------------
-- 6. Disability Types
-- --------------------------------------------------------
INSERT INTO dict_disability_types (code, name, description, sort_order, is_active) VALUES
('intellectual', '智力障碍', '智力发育迟缓或障碍', 1, 1),
('autism', '自闭症谱系障碍', '自闭症谱系障碍/孤独症', 2, 1),
('cerebral_palsy', '脑瘫', '脑性瘫痪', 3, 1),
('down_syndrome', '唐氏综合征', '21三体综合征', 4, 1),
('multiple', '多重障碍', '两种及以上障碍', 5, 1),
('hearing', '听力障碍', '听力损失或耳聋', 6, 1),
('visual', '视力障碍', '视力损失或失明', 7, 1);

-- --------------------------------------------------------
-- 7. Common Dictionary Data
-- --------------------------------------------------------
INSERT INTO dict_common (category, code, name, value, sort_order, is_active) VALUES
('gender', 'male', '男', '男', 1, 1),
('gender', 'female', '女', '女', 2, 1),
('semester', 'fall', '上学期', '上学期', 1, 1),
('semester', 'spring', '下学期', '下学期', 2, 1),
('assessment_type', 'initial', '初期评估', '初期评估', 1, 1),
('assessment_type', 'midterm', '中期评估', '中期评估', 2, 1),
('assessment_type', 'final', '末期评估', '末期评估', 3, 1),
('assessment_type', 'annual', '年度评估', '年度评估', 4, 1),
('goal_area', 'cognitive', '认知', '认知领域', 1, 1),
('goal_area', 'communication', '沟通', '沟通领域', 2, 1),
('goal_area', 'social', '社交', '社交领域', 3, 1),
('goal_area', 'daily_living', '生活自理', '生活自理领域', 4, 1),
('goal_area', 'motor', '运动', '运动领域', 5, 1),
('goal_area', 'behavior', '情绪行为', '情绪行为领域', 6, 1),
('goal_area', 'academic', '学业', '学业领域', 7, 1),
('session_type', 'individual', '个别化教学', '个别化教学', 1, 1),
('session_type', 'group', '小组教学', '小组教学', 2, 1),
('session_type', 'class', '班级教学', '班级教学', 3, 1),
('session_type', 'home', '家庭训练', '家庭训练', 4, 1),
('communication_type', 'phone', '电话沟通', '电话沟通', 1, 1),
('communication_type', 'visit', '家访', '家访', 2, 1),
('communication_type', 'meeting', '面谈', '面谈', 3, 1),
('communication_type', 'online', '线上沟通', '线上沟通', 4, 1),
('disability_level', 'mild', '轻度', '轻度', 1, 1),
('disability_level', 'moderate', '中度', '中度', 2, 1),
('disability_level', 'severe', '重度', '重度', 3, 1);

-- --------------------------------------------------------
-- 8. System Modules
-- --------------------------------------------------------
INSERT INTO modules (name, code, parent_id, icon, sort_order, is_active, created_at, updated_at) VALUES
('学生管理', 'students', 0, 'students', 1, 1, NOW(), NOW()),
('评估管理', 'assessments', 0, 'assessments', 2, 1, NOW(), NOW()),
('IEP管理', 'iep', 0, 'iep', 3, 1, NOW(), NOW()),
('教学记录', 'teaching', 0, 'teaching', 4, 1, NOW(), NOW()),
('模板管理', 'templates', 0, 'templates', 5, 1, NOW(), NOW()),
('家校协作', 'parents', 0, 'parents', 6, 1, NOW(), NOW()),
('统计报表', 'reports', 0, 'reports', 7, 1, NOW(), NOW()),
('权限管理', 'permissions', 0, 'permissions', 8, 1, NOW(), NOW());

-- --------------------------------------------------------
-- 9. Sample Classes
-- --------------------------------------------------------
INSERT INTO student_classes (name, grade, capacity, description, is_active, created_at, updated_at) VALUES
('一年级1班', '一年级', 10, '培智一年级1班', 1, NOW(), NOW()),
('一年级2班', '一年级', 10, '培智一年级2班', 1, NOW(), NOW()),
('二年级1班', '二年级', 12, '培智二年级1班', 1, NOW(), NOW()),
('二年级2班', '二年级', 12, '培智二年级2班', 1, NOW(), NOW()),
('三年级1班', '三年级', 12, '培智三年级1班', 1, NOW(), NOW()),
('四年级1班', '四年级', 10, '培智四年级1班', 1, NOW(), NOW()),
('五年级1班', '五年级', 10, '培智五年级1班', 1, NOW(), NOW()),
('六年级1班', '六年级', 10, '培智六年级1班', 1, NOW(), NOW()),
('七年级1班', '七年级', 12, '培智七年级1班', 1, NOW(), NOW()),
('八年级1班', '八年级', 12, '培智八年级1班', 1, NOW(), NOW()),
('九年级1班', '九年级', 12, '培智九年级1班', 1, NOW(), NOW());

-- --------------------------------------------------------
-- 10. Sample Students
-- --------------------------------------------------------
INSERT INTO students (name, gender, birth_date, disability_type_id, disability_level, class_id, guardian_name, guardian_phone, guardian_relation, address, status, enrollment_date, created_at, updated_at) VALUES
('张伟', '男', '2015-03-15', 1, '中度', 1, '张大明', '13800138001', '父亲', '北京市海淀区XX路1号', '在读', '2021-09-01', NOW(), NOW()),
('李芳', '女', '2014-07-22', 2, '中度', 1, '李红', '13800138002', '母亲', '北京市海淀区XX路2号', '在读', '2021-09-01', NOW(), NOW()),
('王强', '男', '2013-11-08', 1, '轻度', 3, '王刚', '13800138003', '父亲', '北京市海淀区XX路3号', '在读', '2020-09-01', NOW(), NOW()),
('赵敏', '女', '2015-01-18', 3, '中度', 2, '赵丽', '13800138004', '母亲', '北京市海淀区XX路4号', '在读', '2021-09-01', NOW(), NOW()),
('刘洋', '男', '2014-05-30', 4, '轻度', 3, '刘建国', '13800138005', '父亲', '北京市海淀区XX路5号', '在读', '2020-09-01', NOW(), NOW()),
('陈静', '女', '2016-09-12', 1, '重度', 1, '陈华', '13800138006', '母亲', '北京市海淀区XX路6号', '在读', '2022-09-01', NOW(), NOW()),
('杨波', '男', '2013-08-25', 5, '中度', 4, '杨志', '13800138007', '父亲', '北京市海淀区XX路7号', '在读', '2020-09-01', NOW(), NOW()),
('黄丽', '女', '2015-12-03', 2, '轻度', 2, '黄梅', '13800138008', '母亲', '北京市海淀区XX路8号', '在读', '2021-09-01', NOW(), NOW()),
('周杰', '男', '2014-04-17', 1, '中度', 3, '周国强', '13800138009', '父亲', '北京市海淀区XX路9号', '在读', '2020-09-01', NOW(), NOW()),
('吴婷', '女', '2016-02-28', 6, '中度', 1, '吴敏', '13800138010', '母亲', '北京市海淀区XX路10号', '在读', '2022-09-01', NOW(), NOW()),
('孙磊', '男', '2013-06-14', 7, '轻度', 4, '孙伟', '13800138011', '父亲', '北京市海淀区XX路11号', '在读', '2020-09-01', NOW(), NOW()),
('朱琳', '女', '2015-10-09', 1, '轻度', 2, '朱红', '13800138012', '母亲', '北京市海淀区XX路12号', '在读', '2021-09-01', NOW(), NOW()),
('马涛', '男', '2014-08-01', 2, '重度', 1, '马军', '13800138013', '父亲', '北京市海淀区XX路13号', '在读', '2021-09-01', NOW(), NOW()),
('胡雪', '女', '2016-01-22', 3, '中度', 1, '胡丽', '13800138014', '母亲', '北京市海淀区XX路14号', '在读', '2022-09-01', NOW(), NOW()),
('林峰', '男', '2013-03-19', 1, '中度', 4, '林志强', '13800138015', '父亲', '北京市海淀区XX路15号', '在读', '2020-09-01', NOW(), NOW());

-- --------------------------------------------------------
-- 10b. 演示账号数据范围关联修复段（原位于第5c节，因 student_classes
--      数据尚未插入导致 UPDATE 无效、INSERT IGNORE 违反外键被静默跳过。
--      现将关联语句移至样本班级/学生插入之后执行，保证教师-班级数据范围可观测）
-- --------------------------------------------------------
-- teacher1(班主任, class_only) 任一年级1班班主任
UPDATE student_classes SET teacher_id = 3 WHERE id = 1;
-- teacher2(科任, teacher_related) 授课二年级1班(id=3)、二年级2班(id=4)
INSERT IGNORE INTO teacher_classes (teacher_id, class_id, subject, is_active) VALUES
(4, 3, '生活语文', 1),
(4, 4, '生活数学', 1);

-- --------------------------------------------------------
-- 10c. 家长测试账号修复段
--      README 声明 6 个测试账号，其中 parent1 缺失（原 init.sql 未种子化
--      users 中的 parent1，也未种子化 parents/student_parents 表）。
--      此处补齐：users 表插入 parent1（权限组5 家长, own_only），
--      parents 表插入家长账号（用于 parent-login，手机号登录），
--      student_parents 关联家长与学生张伟(id=1)。
-- --------------------------------------------------------
INSERT IGNORE INTO users (id, username, password_hash, real_name, phone, email, role_id, permission_group_id, department, is_active, created_at, updated_at) VALUES
(6, 'parent1', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', '陈家长', '13800000006', 'parent1@iep.edu', 5, 5, '家长', 1, NOW(), NOW());

INSERT INTO parents (name, phone, password_hash, email, relation, address, is_active, created_at, updated_at) VALUES
('陈家长', '13800000006', '$2y$10$w6w4GqEuWwSSvQBVm2dv7OXlj3At/MWiSFevhm.GItpQnAdX9IFWC', 'parent1@iep.edu', '父亲', '北京市海淀区XX路1号', 1, NOW(), NOW());

INSERT INTO student_parents (student_id, parent_id, relation, is_primary, can_sign, created_at)
SELECT 1, id, '父亲', 1, 1, NOW() FROM parents WHERE phone = '13800000006';

-- --------------------------------------------------------
-- 11. DB Migration Record
-- --------------------------------------------------------
INSERT INTO db_migrations (version, description, applied_at) VALUES
('1.0.0', 'Initial database setup with 28 tables and default data', NOW());

-- Done
