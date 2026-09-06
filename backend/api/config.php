<?php
/**
 * IEP System - Configuration & Helper Functions
 * DB config, JWT secret, constants, helper functions
 */

// ============================================================
// Error Reporting - controlled by environment variable
// Set IEP_DEBUG=true in development; never enable in production
// ============================================================
$debugMode = getenv('IEP_DEBUG') === 'true';
if ($debugMode) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', __DIR__ . '/../logs/php_errors.log');
}

// ============================================================
// Database Configuration - Read from environment variables
// Production: Set via web server config, .env file, or secrets manager
// NEVER hard-code credentials in production environments
// ============================================================
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'iep_system');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: 'your_password');
define('DB_CHARSET', 'utf8mb4');

// ============================================================
// JWT Configuration
//
// 安全修复(P1-2)：原实现在环境变量缺失时使用硬编码常量
// 'iep_system_jwt_secret_key_change_in_production_2024' 作为签名密钥。
// 该密钥已随源码公开，任何人都可伪造任意用户的 JWT，直接接管管理员会话。
//
// 现改为三级降级策略，确保密钥永远不可预测：
//   1) 环境变量 JWT_SECRET（推荐，容器 / 云主机）
//   2) 密钥文件 backend/config/jwt.secret（虚拟主机无法设环境变量时使用，
//      目录已用 .htaccess 拒绝 Web 访问）
//   3) 首次运行时自动生成 256 位随机密钥并落盘持久化
// ============================================================
function iepGetJwtSecret(): string {
    $env = getenv('JWT_SECRET');
    if (is_string($env) && strlen($env) >= 32) {
        return $env;
    }

    $keyDir  = __DIR__ . '/../config';
    $keyFile = $keyDir . '/jwt.secret';

    // 已生成过则直接读取
    if (is_file($keyFile) && is_readable($keyFile)) {
        $existing = trim((string) file_get_contents($keyFile));
        if (strlen($existing) >= 32) {
            return $existing;
        }
    }

    // 首次运行：生成 256 位随机密钥并持久化
    $secret = bin2hex(random_bytes(32));
    if (!is_dir($keyDir)) {
        @mkdir($keyDir, 0750, true);
    }
    if (is_dir($keyDir) && is_writable($keyDir)) {
        @file_put_contents($keyFile, $secret, LOCK_EX);
        @chmod($keyFile, 0640);
        // 阻止 Web 直接访问密钥文件
        if (!is_file($keyDir . '/.htaccess')) {
            @file_put_contents($keyDir . '/.htaccess', "# 禁止通过 Web 访问配置与密钥文件\n<RequireAll>\n    Require all denied\n</RequireAll>\n");
        }
    }
    return $secret;
}

define('JWT_SECRET', iepGetJwtSecret());
define('JWT_EXPIRE_DAYS', intval(getenv('JWT_EXPIRE_DAYS') ?: '7'));

// ============================================================
// CORS Headers - Configurable via environment variables
// Set ALLOWED_ORIGINS=comma,separated,list in production
// Example: ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
// ============================================================
//
// 安全修复(P1-3)：原实现存在两处缺陷
//   1) 未配置 ALLOWED_ORIGINS 时，无条件反射请求方的 Origin；
//   2) 配置了白名单但校验不通过时，$origin 被置空，
//      随后 `$origin ?: '*'` 又回退成通配符 '*' —— 白名单形同虚设。
// 二者叠加后均等价于 `Access-Control-Allow-Origin: *` 且
// `Access-Control-Allow-Credentials: true`，任意站点可在受害者已登录的
// 前提下跨域读取全部 API 响应（学生敏感档案、IEP、家长信息）。
//
// 现策略：
//   - 配置了白名单：仅精确匹配时才回显 Origin，绝不回退通配符；
//   - 未配置白名单：仅允许同源（Origin 的 host 与 HTTP_HOST 一致）；
//   - 不匹配时完全不发送 ACAO 头，由浏览器按同源策略拦截。
//
$allowedOriginsRaw = getenv('ALLOWED_ORIGINS');
$allowedOrigins = [];
if (is_string($allowedOriginsRaw) && trim($allowedOriginsRaw) !== '') {
    foreach (explode(',', $allowedOriginsRaw) as $o) {
        $o = trim($o);
        if ($o !== '') {
            $allowedOrigins[] = $o;
        }
    }
}
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigin = null;

if ($requestOrigin !== '') {
    if (!empty($allowedOrigins)) {
        if (in_array($requestOrigin, $allowedOrigins, true)) {
            $allowedOrigin = $requestOrigin;
        }
    } else {
        // 未配置白名单：仅放行同源请求
        $originHost = parse_url($requestOrigin, PHP_URL_HOST);
        $httpHost = $_SERVER['HTTP_HOST'] ?? '';
        // 去掉 Host 头中可能携带的端口号
        $httpHostName = preg_replace('/:\d+$/', '', (string) $httpHost);
        if ($originHost !== null && $originHost !== false
            && $httpHostName !== '' && strcasecmp((string) $originHost, $httpHostName) === 0) {
            $allowedOrigin = $requestOrigin;
        }
    }
}

if ($allowedOrigin !== null) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
// Database Connection Function
// ============================================================
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
            $pdo = new PDO($dsn, DB_USER, DB_PASS);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => 'Database connection failed']);
            exit;
        }
    }
    return $pdo;
}

// ============================================================
// JSON Response Helper
// ============================================================
function jsonResponse(array $data): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================
// JWT Encode Function (HS256)
// ============================================================
function jwtEncode(array $payload): string {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload['iat'] = time();
    $payload['exp'] = time() + (JWT_EXPIRE_DAYS * 86400);

    $base64Header = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64Payload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($payload)));

    $signature = hash_hmac('sha256', $base64Header . "." . $base64Payload, JWT_SECRET, true);
    $base64Signature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    return $base64Header . "." . $base64Payload . "." . $base64Signature;
}

// ============================================================
// JWT Decode Function
// ============================================================
function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) return null;

    $signature = hash_hmac('sha256', $parts[0] . "." . $parts[1], JWT_SECRET, true);
    $base64Signature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    if (!hash_equals($base64Signature, $parts[2])) return null;
    return $payload;
}

// ============================================================
// Get Current User from JWT Bearer Token
// ============================================================
function getCurrentUser(): ?array {
    $token = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $token = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $token = str_replace('Bearer ', '', $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    } elseif (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) {
            $token = str_replace('Bearer ', '', $headers['Authorization']);
        }
    } elseif (isset($_SERVER['HTTP_X_AUTHORIZATION'])) {
        $token = str_replace('Bearer ', '', $_SERVER['HTTP_X_AUTHORIZATION']);
    }

    if (empty($token)) return null;
    $payload = jwtDecode($token);
    if (!$payload) return null;

    // 信任边界修复(P1-1)：JWT payload 中的 sub / permission_group_id
    // 不再被直接信任。必须回查数据库做二次校验：
    //   1) sub 指向的用户必须真实存在（杜绝伪造不存在用户越权）；
    //   2) 用户必须处于启用状态 is_active=1（禁用/删除用户旧 Token 即时失效）；
    //   3) permission_group_id 以数据库权威值为准，覆盖 JWT 声明
    //      （防止篡改权限组声明提升权限越权）。
    // 校验结果按 sub+type 在本请求内缓存，避免同一请求重复查库。
    return validateUserAgainstDB($payload);
}

/**
 * 信任边界修复(P1-1)：按 JWT sub 回查数据库二次校验用户真实性。
 *
 * 原实现仅验签 + exp，直接信任 JWT payload 中的权限组与用户 ID，
 * 使用真实密钥伪造 token（sub 指向不存在用户 / 篡改 permission_group_id）
 * 即可越权访问全量数据，且禁用用户旧 token 在过期前仍有效。
 *
 * 现策略（fail-closed）：
 *   - sub<=0 直接拒绝；
 *   - 按 type（user / parent）分别回查 users / parents 表；
 *   - 用户不存在、已禁用（is_active=0）、或数据库异常 → 一律拒绝；
 *   - 校验通过后，以数据库中的 permission_group_id / role_id 覆盖
 *     JWT 声明，后续 checkPermission / getDataScope 读取到的均为权威值。
 *
 * @param array $payload jwtDecode 解出的 payload
 * @return array|null 校验通过返回（权限组已用权威值覆盖）的 payload，否则 null
 */
function validateUserAgainstDB(array $payload): ?array {
    static $cache = [];
    $sub = isset($payload['sub']) ? intval($payload['sub']) : 0;
    if ($sub <= 0) {
        return null;
    }

    $userType = isset($payload['type']) ? $payload['type'] : 'user';
    $cacheKey = $userType . ':' . $sub;
    if (array_key_exists($cacheKey, $cache)) {
        // 缓存命中：必须返回缓存中已用 DB 权威值覆盖后的 payload，
        // 不能返回调用方传入的原始 $payload，否则同一请求内二次调用
        // （requireAuth 后 checkPermission 再次 getCurrentUser）会绕过
        // 权限组覆盖，导致伪造声明 pg=1 被误判为 admin。
        return $cache[$cacheKey];
    }

    $valid = false;
    try {
        $pdo = getDB();
        if ($userType === 'parent') {
            // 家长账号：parents 表（parent-login 签发，sub = parents.id）
            $stmt = $pdo->prepare(
                'SELECT id, is_active FROM parents WHERE id = ? AND deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute([$sub]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $valid = $row !== false && (int) $row['is_active'] === 1;
            if ($valid) {
                // 家长权限组固定为 5（登录签发时写死）
                $payload['permission_group_id'] = 5;
                $payload['role_id'] = 5;
            }
        } else {
            // 普通用户：users 表
            $stmt = $pdo->prepare(
                'SELECT id, is_active, permission_group_id, role_id FROM users WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$sub]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $valid = $row !== false && (int) $row['is_active'] === 1;
            if ($valid) {
                // 权限组以数据库权威值为准，覆盖 JWT 声明（防篡改越权）
                $dbPg = (int) ($row['permission_group_id'] ?? $row['role_id'] ?? 0);
                $payload['permission_group_id'] = $dbPg;
                $payload['role_id'] = (int) $row['role_id'];
            }
        }
    } catch (PDOException $e) {
        error_log('validateUserAgainstDB error: ' . $e->getMessage());
        $valid = false; // 数据库异常时 fail-closed，拒绝访问
    }

    $cache[$cacheKey] = $valid ? $payload : null;
    return $cache[$cacheKey];
}

// ============================================================
// Require Authentication
// ============================================================
function requireAuth(): array {
    $user = getCurrentUser();
    if (!$user) {
        jsonResponse(['success' => false, 'message' => '未登录或Token已过期']);
    }
    return $user;
}

// ============================================================
// Check Permission (RBAC v3 - Permission Group Based)
// ============================================================
function checkPermission(string $permissionCode): bool {
    $user = getCurrentUser();
    if (!$user) return false;

    // Get permission_group_id from JWT payload or database
    $pgId = 0;
    if (isset($user['permission_group_id'])) {
        $pgId = intval($user['permission_group_id']);
    } elseif (isset($user['role_id'])) {
        // Fallback: map from role_id (backward compatibility)
        $pgId = intval($user['role_id']);
    }

    // Admin (permission_group_id = 1) always has all permissions
    if ($pgId === 1) {
        return true;
    }

    if ($pgId <= 0) return false;

    try {
        $pdo = getDB();
        // Query feature_permissions JSON field from permission_groups
        $stmt = $pdo->prepare(
            'SELECT feature_permissions FROM permission_groups WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$pgId]);
        $group = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$group || empty($group['feature_permissions'])) {
            return false;
        }

        $features = json_decode($group['feature_permissions'], true);
        if (!is_array($features)) {
            return false;
        }

        return in_array($permissionCode, $features, true);
    } catch (PDOException $e) {
        error_log('CheckPermission error: ' . $e->getMessage());
        return false;
    }
}

// ============================================================
// Require Permission (returns 403 if no permission)
// ============================================================
function requirePermission(string $permissionCode): void {
    if (!checkPermission($permissionCode)) {
        jsonResponse(['success' => false, 'message' => '无权访问：缺少权限 ' . $permissionCode]);
    }
}

// ============================================================
// Audit Log Function
// ============================================================
function auditLog(
    string $action,
    string $module = '',
    string $targetType = '',
    int $targetId = 0,
    string $targetName = '',
    $oldValue = null,
    $newValue = null,
    string $changeSummary = ''
): void {
    try {
        $user = getCurrentUser();
        $userId = $user ? intval($user['sub']) : 0;
        $username = $user ? ($user['name'] ?? $user['username'] ?? '') : 'system';
        $userType = 'user';

        // Determine user type
        if (isset($user['type']) && $user['type'] === 'parent') {
            $userType = 'parent';
        } elseif ($userId === 0) {
            $userType = 'system';
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $requestMethod = $_SERVER['REQUEST_METHOD'] ?? '';
        $requestPath = ($_SERVER['REQUEST_URI'] ?? '');

        $pdo = getDB();
        $stmt = $pdo->prepare(
            'INSERT INTO audit_logs 
             (user_id, username, user_type, action, module, target_type, target_id, target_name, 
              old_value, new_value, change_summary, ip, user_agent, request_method, request_path, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            $userId, $username, $userType, $action, $module, $targetType, $targetId, $targetName,
            $oldValue ? json_encode($oldValue) : null,
            $newValue ? json_encode($newValue) : null,
            $changeSummary, $ip, $userAgent, $requestMethod, $requestPath
        ]);
    } catch (PDOException $e) {
        // Silently fail - don't break the API for audit logging
        error_log('Audit log error: ' . $e->getMessage());
    }
}

// ============================================================
// Data Scope Functions (Role-based Data Permission Control)
// International-standard IEP system - Core security feature
// ============================================================

/**
 * Get data scope for current user based on permission group
 * Returns array with 'type' and role-specific filters
 * Types: all, class_teacher, teacher, parent, viewer
 *
 * v3: Now reads from permission_groups.data_scope_type instead of hard-coded role_id
 */
function getDataScope(): array {
    $user = getCurrentUser();
    if (!$user) {
        return ['type' => 'none', 'teacher_id' => 0, 'parent_id' => 0, 'class_ids' => [], 'student_ids' => []];
    }

    $userId = isset($user['sub']) ? intval($user['sub']) : 0;
    $userType = $user['type'] ?? 'user';

    // Parent users always see their own children only (handled separately)
    if ($userType === 'parent') {
        $parentId = $userId;
        $studentIds = [];
        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('SELECT student_id FROM student_parents WHERE parent_id = ?');
            $stmt->execute([$parentId]);
            $studentIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {
            error_log('Data scope parent error: ' . $e->getMessage());
        }
        return [
            'type' => 'parent',
            'teacher_id' => 0,
            'parent_id' => $parentId,
            'class_ids' => [],
            'student_ids' => $studentIds
        ];
    }

    // Get user's permission_group_id
    $pgId = 0;
    if (isset($user['permission_group_id'])) {
        $pgId = intval($user['permission_group_id']);
    } elseif (isset($user['role_id'])) {
        // Fallback: backward compatibility
        $pgId = intval($user['role_id']);
    }

    // Query permission group configuration
    $scopeType = 'none';
    try {
        $pdo = getDB();
        if ($pgId > 0) {
            $stmt = $pdo->prepare('SELECT data_scope_type FROM permission_groups WHERE id = ? LIMIT 1');
            $stmt->execute([$pgId]);
            $pg = $stmt->fetch(PDO::FETCH_ASSOC);
            $scopeType = $pg['data_scope_type'] ?? 'none';
        }
    } catch (PDOException $e) {
        error_log('Data scope query error: ' . $e->getMessage());
    }

    // All data scope
    if ($scopeType === 'all') {
        return ['type' => 'all', 'teacher_id' => 0, 'parent_id' => 0, 'class_ids' => [], 'student_ids' => []];
    }

    // Class only: class teacher logic (user's own classes)
    if ($scopeType === 'class_only') {
        $classIds = [];
        try {
            $pdo = getDB();
            // 注意：student_classes 表无 deleted_at 字段，此处不可用软删条件过滤
            $stmt = $pdo->prepare('SELECT id FROM student_classes WHERE teacher_id = ?');
            $stmt->execute([$userId]);
            $classIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {
            error_log('Data scope class_only error: ' . $e->getMessage());
        }
        return [
            'type' => 'class_teacher',
            'teacher_id' => $userId,
            'parent_id' => 0,
            'class_ids' => $classIds,
            'student_ids' => []
        ];
    }

    // Teacher related: see students they teach (through teacher_classes and iep_goals)
    if ($scopeType === 'teacher_related') {
        $classIds = [];
        $studentIds = [];
        try {
            $pdo = getDB();
            // Classes they teach
            $stmt = $pdo->prepare('SELECT class_id FROM teacher_classes WHERE teacher_id = ?');
            $stmt->execute([$userId]);
            $classIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

            // Students whose IEP goals they are responsible for
            $stmt = $pdo->prepare('
                SELECT DISTINCT iep.student_id
                FROM iep_goals ig
                INNER JOIN iep_plans iep ON ig.iep_plan_id = iep.id
                WHERE ig.responsible_teacher_id = ? AND iep.deleted_at IS NULL
            ');
            $stmt->execute([$userId]);
            $studentIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {
            error_log('Data scope teacher_related error: ' . $e->getMessage());
        }
        return [
            'type' => 'teacher',
            'teacher_id' => $userId,
            'parent_id' => 0,
            'class_ids' => $classIds,
            'student_ids' => $studentIds
        ];
    }

    // Own only: parent-like logic (users sees only their own records)
    if ($scopeType === 'own_only') {
        $studentIds = [];
        try {
            $pdo = getDB();
            // own_only 语义：仅可见与本人直接关联的学生。
            // 系统内 users→students 的合法关联途径为：
            //   1) 班主任（class_only，通过 student_classes.teacher_id）
            //   2) 科任教师（teacher_related，通过 teacher_classes / iep_goals.responsible_teacher_id）
            //   3) 家长（own_only，走 type='parent' 分支，通过 student_parents）
            // 普通用户使用 own_only 时无上述任何关联，按最小权限原则返回空集（fail-closed）。
            // 注意：原实现引用了不存在的 student_users 表，且 fallback 将 sp.parent_id 与 u.id 错误关联，已移除。
            $stmt = $pdo->prepare('
                SELECT sp.student_id
                FROM student_parents sp
                INNER JOIN parents p ON sp.parent_id = p.id
                WHERE p.phone = (SELECT phone FROM users WHERE id = ? LIMIT 1)
            ');
            $stmt->execute([$userId]);
            $studentIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {
            error_log('Data scope own_only error: ' . $e->getMessage());
        }
        return [
            'type' => 'parent',
            'teacher_id' => 0,
            'parent_id' => $userId,
            'class_ids' => [],
            'student_ids' => $studentIds
        ];
    }

    // None / default: viewer (no data access)
    return ['type' => 'viewer', 'teacher_id' => $userId, 'parent_id' => 0, 'class_ids' => [], 'student_ids' => []];
}

/**
 * Apply data scope to a SQL query
 * Returns WHERE clause and params array
 */
function applyDataScope(string $tableAlias = ''): array {
    $scope = getDataScope();
    $prefix = $tableAlias ? $tableAlias . '.' : '';

    switch ($scope['type']) {
        case 'all':
            return ['', []];

        case 'class_teacher':
            if (empty($scope['class_ids'])) {
                return [$prefix . 'class_id = -1', []]; // No classes assigned
            }
            $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
            return [$prefix . 'class_id IN (' . $placeholders . ')', $scope['class_ids']];

        case 'teacher':
            $conditions = [];
            $params = [];
            if (!empty($scope['class_ids'])) {
                $placeholders = implode(',', array_fill(0, count($scope['class_ids']), '?'));
                $conditions[] = $prefix . 'class_id IN (' . $placeholders . ')';
                $params = array_merge($params, $scope['class_ids']);
            }
            if (!empty($scope['student_ids'])) {
                $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
                $conditions[] = $prefix . 'student_id IN (' . $placeholders . ')';
                $params = array_merge($params, $scope['student_ids']);
            }
            if (empty($conditions)) {
                return [$prefix . 'id = -1', []]; // No access
            }
            return ['(' . implode(' OR ', $conditions) . ')', $params];

        case 'parent':
            if (empty($scope['student_ids'])) {
                return [$prefix . 'student_id = -1', []]; // No children
            }
            $placeholders = implode(',', array_fill(0, count($scope['student_ids']), '?'));
            return [$prefix . 'student_id IN (' . $placeholders . ')', $scope['student_ids']];

        case 'viewer':
        default:
            return [$prefix . 'id = -1', []]; // No access by default
    }
}

/**
 * 判断指定学生是否落在当前用户的数据范围内（fail-closed）
 *
 * 安全修复(P0-2)：系统此前仅对「列表查询」施加数据范围过滤，
 * 而 get / update / delete 等单记录操作完全未做范围校验，
 * 任何教师只要猜到学生 id 即可读取并篡改全校学生敏感档案。
 * 本函数提供统一的单记录范围判定，供各模块在写操作前调用。
 *
 * @param int $studentId 目标学生 id
 * @param array|null $scope 可选，复用已获取的 scope，避免重复查询
 * @return bool 在范围内返回 true；范围外、查询异常一律返回 false
 */
function isStudentInScope(int $studentId, ?array $scope = null): bool {
    if ($studentId <= 0) {
        return false;
    }
    if ($scope === null) {
        $scope = getDataScope();
    }

    $type = $scope['type'] ?? 'viewer';

    // 全域可见
    if ($type === 'all') {
        return true;
    }

    // 只读用户 / 无权限：一律拒绝
    if ($type === 'viewer' || $type === 'none') {
        return false;
    }

    // 先看 student_ids 命中（teacher / parent 类型）
    if (in_array($type, ['teacher', 'parent'], true)) {
        $studentIds = array_map('intval', $scope['student_ids'] ?? []);
        if (in_array($studentId, $studentIds, true)) {
            return true;
        }
    }

    // 再看班级归属（class_teacher / teacher 类型）
    if (in_array($type, ['class_teacher', 'teacher'], true)) {
        $classIds = array_map('intval', $scope['class_ids'] ?? []);
        if (empty($classIds)) {
            return false; // fail-closed：无关联班级即无权
        }
        try {
            $pdo = getDB();
            $placeholders = implode(',', array_fill(0, count($classIds), '?'));
            $stmt = $pdo->prepare("SELECT 1 FROM students WHERE id = ? AND class_id IN ($placeholders) AND deleted_at IS NULL LIMIT 1");
            $stmt->execute(array_merge([$studentId], $classIds));
            return (bool) $stmt->fetchColumn();
        } catch (PDOException $e) {
            error_log('isStudentInScope error: ' . $e->getMessage());
            return false; // 异常时拒绝，绝不 fail-open
        }
    }

    return false;
}

/**
 * 断言指定学生在数据范围内，否则直接返回 403 并终止请求
 */
function requireStudentInScope(int $studentId, ?array $scope = null): void {
    if (!isStudentInScope($studentId, $scope)) {
        jsonResponse([
            'success' => false,
            'message' => '无权访问该学生数据：超出您的数据范围',
            'code' => 403
        ], 403);
    }
}

/**
 * 断言指定的班级在数据范围内，否则返回 403
 * 用于创建学生等尚无 student_id 可校验的场景（防跨班创建学生档案）
 */
function requireClassInScope(int $classId, ?array $scope = null): void {
    if ($classId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误'], 400);
    }
    $scope = $scope ?? getDataScope();
    if ($scope['type'] === 'all') {
        return;
    }
    $classIds = array_map('intval', $scope['class_ids'] ?? []);
    if (!in_array($classId, $classIds, true)) {
        jsonResponse([
            'success' => false,
            'message' => '无权访问该班级数据：超出您的数据范围',
            'code' => 403
        ], 403);
    }
}

/**
 * 断言指定 IEP 计划所属学生在数据范围内，否则返回 403
 */
function requireIepInScope(int $planId, ?array $scope = null): void {
    if ($planId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误'], 400);
    }
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT student_id FROM iep_plans WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$planId]);
        $studentId = intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('requireIepInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败'], 500);
        return;
    }
    if ($studentId <= 0) {
        jsonResponse(['success' => false, 'message' => 'IEP计划不存在'], 404);
    }
    requireStudentInScope($studentId, $scope);
}

/**
 * 断言指定评估记录所属学生在数据范围内，否则返回 403
 */
function requireAssessmentInScope(int $assessmentId, ?array $scope = null): void {
    if ($assessmentId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误'], 400);
    }
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT student_id FROM assessments WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$assessmentId]);
        $studentId = intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('requireAssessmentInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败'], 500);
        return;
    }
    if ($studentId <= 0) {
        jsonResponse(['success' => false, 'message' => '评估记录不存在'], 404);
    }
    requireStudentInScope($studentId, $scope);
}

/**
 * 断言指定教学记录所属学生在数据范围内，否则返回 403
 */
function requireTeachingInScope(int $recordId, ?array $scope = null): void {
    if ($recordId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误'], 400);
    }
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT student_id FROM teaching_records WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$recordId]);
        $studentId = intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('requireTeachingInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败'], 500);
        return;
    }
    if ($studentId <= 0) {
        jsonResponse(['success' => false, 'message' => '教学记录不存在'], 404);
    }
    requireStudentInScope($studentId, $scope);
}

/**
 * Log data scope access for auditing
 */
function logDataScopeAccess(string $module, string $scopeType, int $recordCount): void {
    try {
        $user = getCurrentUser();
        $userId = $user ? intval($user['sub']) : 0;
        $username = $user ? ($user['name'] ?? $user['username'] ?? '') : 'system';

        $pdo = getDB();
        $stmt = $pdo->prepare(
            'INSERT INTO data_scope_log 
             (user_id, username, scope_type, module, record_count, ip, accessed_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([
            $userId, $username, $scopeType, $module, $recordCount,
            $_SERVER['REMOTE_ADDR'] ?? ''
        ]);
    } catch (PDOException $e) {
        error_log('Data scope log error: ' . $e->getMessage());
    }
}

// ============================================================
// Get Request Input (supports both form-data and JSON)
// ============================================================
function getInput(): array {
    $input = [];
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (strpos($contentType, 'application/json') !== false) {
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true) ?: [];
    } else {
        $input = $_POST;
    }

    return $input;
}

// ============================================================
// Pagination Helper
// ============================================================
function getPagination(): array {
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $pageSize = isset($_GET['pageSize']) ? min(100, max(1, intval($_GET['pageSize']))) : 20;
    $offset = ($page - 1) * $pageSize;
    return [$page, $pageSize, $offset];
}
