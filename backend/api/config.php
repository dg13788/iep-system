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
}

// 修复（对应报告 7.3「让错误可观测」）：原先仅在生产分支配置 error_log，
// 导致开发模式下所有 error_log() 写到了 stderr（内置服务器下几乎看不到），
// 而大量 catch 块又只返回泛化文案 —— 排障只能靠反推 SQL。
// 现在无论何种模式都统一落盘，保证 PDOException 的真实原因始终可查。
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../logs/php_errors.log');

// ============================================================
// Database Configuration - Read from environment variables
// Production: Set via web server config, .env file, or secrets manager
// NEVER hard-code credentials in production environments
// ============================================================
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'iep_system');
define('DB_USER', getenv('DB_USER') ?: 'root');
// 修复(P1)：原写法 `getenv('DB_PASS') ?: 'your_password'` 会把「合法但为空」的密码
// （本机 Laragon / 部分容器环境的 root 空密码）误判为未配置，从而兜底成 'your_password'
// 导致连不上库。现改为区分「环境变量未设置」与「显式设置为空字符串」。
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'your_password');
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
// 修复(P1-1)：原签名只有 1 个形参，但代码中有 10 处按
// `jsonResponse($data, 403)` 传入 HTTP 状态码。PHP 对用户自定义函数的
// 多余实参静默丢弃，导致全系统永远返回 HTTP 200 —— 401/403/404 全部伪装成
// 成功响应，前端 api.ts / App.tsx 中写好的全局 401 拦截器成为死代码，
// Token 过期无法统一登出。现增加 $statusCode 形参并真正下发状态码。
function jsonResponse(array $data, int $statusCode = 200): void {
    if (!headers_sent()) {
        http_response_code($statusCode);
    }
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
    // 修复(P2-9)：原实现的取值顺序有缺陷——
    //   1) elseif function_exists('getallheaders') 在 Apache/Nginx 下恒真，
    //      其后的 HTTP_X_AUTHORIZATION 分支永远不可达（死代码）；
    //   2) str_replace('Bearer ', ...) 大小写敏感，客户端发 "bearer xxx" 即解析失败。
    // 改为依次收集所有来源、统一剥离大小写不敏感的 Bearer 前缀。
    $candidates = [];
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $candidates[] = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $candidates[] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach (['Authorization', 'authorization'] as $k) {
            if (isset($headers[$k])) {
                $candidates[] = $headers[$k];
                break;
            }
        }
    }
    if (isset($_SERVER['HTTP_X_AUTHORIZATION'])) {
        $candidates[] = $_SERVER['HTTP_X_AUTHORIZATION'];
    }

    $token = '';
    foreach ($candidates as $candidate) {
        $candidate = trim((string)$candidate);
        if ($candidate === '') { continue; }
        $token = preg_replace('/^bearer\s+/i', '', $candidate);
        if ($token !== '') { break; }
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
        // 补齐(P1-1)：上一轮修复给 jsonResponse 补了 $statusCode 形参，
        // 并把 requirePermission 改成了 403，但 requireAuth 这处遗漏了，
        // 导致「未登录」虽能阻断业务，HTTP 仍是 200 —— 前端 request.ts 的
        // 401 拦截器依旧收不到信号，Token 过期无法触发统一登出。现在补齐。
        jsonResponse(['success' => false, 'message' => '未登录或Token已过期', 'code' => 401], 401);
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
        // 修复(P1-1)：返回真正的 403
        jsonResponse(['success' => false, 'message' => '无权访问：缺少权限 ' . $permissionCode, 'code' => 403], 403);
    }
}

// ============================================================
// Require System Administrator (permission_group_id = 1)
// ============================================================
/**
 * 系统管理员专属守卫（2026-09-20 新增，用于「管理控制台」全部端点）。
 *
 * 与 requirePermission() 的区别：
 *   - checkPermission() 对 pg=1 无条件放行，且权限可被 feature_permissions 配置；
 *   - 「所有数据 / 初始化 / 一键备份」属高危运维能力，**不可**通过给非管理员
 *     组配 feature 来获得，因此这里硬校验 permission_group_id === 1。
 *
 * fail-closed 行为：
 *   - 未登录          → 401（由 requireAuth 抛出）
 *   - 登录但非 pg=1   → 403，并写入审计日志（越权尝试可追溯）
 *   - 用户上下文缺失  → 403
 *
 * @return array 通过校验的用户 payload
 */
function requireSystemAdmin(): array {
    $user = requireAuth();

    $pg = intval($user['permission_group_id'] ?? 0);
    if ($pg !== 1) {
        $deniedPg = $pg;
        auditLog(
            'denied',
            'admin',
            'system',
            0,
            '',
            null,
            ['permission_group_id' => $deniedPg],
            '非系统管理员尝试访问管理控制台（已阻断）'
        );
        jsonResponse([
            'success' => false,
            'message' => '仅限系统管理员操作：当前账号权限组无权访问管理控制台',
            'code'    => 403,
        ], 403);
    }

    return $user;
}

/**
 * 校验当前管理员的登录密码（用于初始化 / 恢复备份等不可逆操作前的二次确认）。
 *
 * 只信任数据库中的 password_hash，不接受任何前端传入的身份声明。
 *
 * @param array $user requireSystemAdmin() 返回的 payload
 * @param string $password 前端传入的明文密码
 * @return bool 校验通过返回 true
 */
function verifyCurrentAdminPassword(array $user, string $password): bool {
    if ($password === '') {
        return false;
    }
    $userId = intval($user['sub'] ?? 0);
    if ($userId <= 0) {
        return false;
    }
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$userId]);
        $hash = $stmt->fetchColumn();
        if (!$hash) {
            return false;
        }
        return password_verify($password, (string) $hash);
    } catch (PDOException $e) {
        error_log('verifyCurrentAdminPassword error: ' . $e->getMessage());
        return false; // 数据库异常 fail-closed
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
    string $changeSummary = '',
    ?array $actorOverride = null
): void {
    try {
        // 修复(P1-4)：登录等无 Token 场景下，getCurrentUser() 返回 null，
        // 审计一律记成 user_id=0 / username='system'，登录事件完全不可追溯。
        // 新增 $actorOverride：调用方显式传入 [user_id, username, user_type]。
        if ($actorOverride !== null) {
            $userId = intval($actorOverride['user_id'] ?? 0);
            $username = (string)($actorOverride['username'] ?? 'system');
            $userType = (string)($actorOverride['user_type'] ?? 'user');
        } else {
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
        $parentId = 0;
        try {
            $pdo = getDB();
            // 修复(P1-6)：原实现存在两类缺陷——
            //   1) 用「手机号相等」做 users→parents 软关联：教师与家长手机号恰好相同
            //      （教师子弟在校就读在培智学校并不罕见）即获得该生完整读写权；
            //      家长换号后关联又静默断裂，家长什么都看不到且不报错。
            //   2) 把 users.id 直接当 parents.id 返回（ID 空间混淆）：
            //      users.id=6 会命中 parents.id=6 这个完全无关的人。
            // 现改为显式外键 users.parent_ref_id（v5 迁移新增）；
            // 无映射一律 fail-closed 返回空集，绝不回退到手机号猜测。
            $stmt = $pdo->prepare('SELECT parent_ref_id FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            if ($row && !empty($row['parent_ref_id'])) {
                $parentId = intval($row['parent_ref_id']);
                $stmt = $pdo->prepare('SELECT student_id FROM student_parents WHERE parent_id = ?');
                $stmt->execute([$parentId]);
                $studentIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
        } catch (PDOException $e) {
            error_log('Data scope own_only error: ' . $e->getMessage());
            $studentIds = [];
            $parentId = 0;
        }
        return [
            'type' => 'parent',
            'teacher_id' => 0,
            'parent_id' => $parentId,
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
 * 学生表专用的数据范围 SQL 片段（根因修复）
 *
 * 修复(P0-2)：此前「学生下拉数据源」等端点完全没有范围过滤，根因是
 * 范围过滤逻辑被复制粘贴在 6 个 PHP 文件的各处 case 里，漏抄一处即全量泄露。
 * 本函数把「学生表」的范围条件收敛为唯一实现，供 list / export / options
 * 等所有读取学生名单的端点复用，杜绝再次漏写。
 *
 * 注意：不能直接用 applyDataScope()，该函数按「含 student_id 列的业务表」
 * 生成条件（teacher/parent 分支用 student_id），而学生表的主键是 id，
 * 直接套用会生成不存在的列导致 SQL 报错。
 *
 * @param string $alias 学生表别名，例如 's'
 * @return array [0]=SQL 条件（不含 WHERE/AND），[1]=绑定参数
 */
function applyStudentScope(string $alias = 's'): array {
    $scope = getDataScope();
    $p = $alias !== '' ? $alias . '.' : '';
    $type = $scope['type'] ?? 'viewer';

    if ($type === 'all') {
        return ['1=1', []];
    }

    // fail-closed：无关联班级/学生时一律拒绝
    $classIds = array_map('intval', $scope['class_ids'] ?? []);
    $studentIds = array_map('intval', $scope['student_ids'] ?? []);

    if ($type === 'class_teacher') {
        if (empty($classIds)) {
            return [$p . 'id = -1', []];
        }
        $ph = implode(',', array_fill(0, count($classIds), '?'));
        return [$p . 'class_id IN (' . $ph . ')', $classIds];
    }

    if ($type === 'teacher') {
        $conds = [];
        $params = [];
        if (!empty($classIds)) {
            $ph = implode(',', array_fill(0, count($classIds), '?'));
            $conds[] = $p . 'class_id IN (' . $ph . ')';
            $params = array_merge($params, $classIds);
        }
        if (!empty($studentIds)) {
            $ph = implode(',', array_fill(0, count($studentIds), '?'));
            $conds[] = $p . 'id IN (' . $ph . ')';
            $params = array_merge($params, $studentIds);
        }
        if (empty($conds)) {
            return [$p . 'id = -1', []];
        }
        return ['(' . implode(' OR ', $conds) . ')', $params];
    }

    if ($type === 'parent') {
        if (empty($studentIds)) {
            return [$p . 'id = -1', []];
        }
        $ph = implode(',', array_fill(0, count($studentIds), '?'));
        return [$p . 'id IN (' . $ph . ')', $studentIds];
    }

    // viewer / none / 未知类型
    return [$p . 'id = -1', []];
}

/**
 * 断言指定 IEP 目标（iep_goals）所属学生在数据范围内，否则返回 403
 *
 * 修复(P0-5)：iep/progress 只校验了 goal_update 功能权限，
 * 未校验目标所属学生是否在数据范围内，导致教师可对「读不到也改不了」的
 * 他人学生 IEP 写入达成度数据，直接污染达成率统计。
 */
function requireGoalInScope(int $goalId, ?array $scope = null): void {
    if ($goalId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误', 'code' => 400], 400);
    }
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare(
            'SELECT ig.iep_plan_id, iep.student_id
             FROM iep_goals ig
             INNER JOIN iep_plans iep ON ig.iep_plan_id = iep.id
             WHERE ig.id = ? AND ig.deleted_at IS NULL AND iep.deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$goalId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log('requireGoalInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败', 'code' => 500], 500);
        return;
    }
    if (!$row) {
        jsonResponse(['success' => false, 'message' => 'IEP目标不存在', 'code' => 404], 404);
        return;
    }
    requireStudentInScope(intval($row['student_id']), $scope);
}

/**
 * 断言指定的 IEP 目标 ID 存在且返回其计划 ID（供写操作复用）
 */
function getGoalPlanId(int $goalId): int {
    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT iep_plan_id FROM iep_goals WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$goalId]);
        return intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('getGoalPlanId error: ' . $e->getMessage());
        return 0;
    }
}

/**
 * 断言指定「短期目标」(iep_objectives) 所属学生在数据范围内，否则 403
 *
 * v4：短期目标是 iep/progress 之外的第二条写入教学数据通路，
 * 必须与长期目标走同一套范围校验，否则会成为新的越权入口。
 */
function requireObjectiveInScope(int $objectiveId, ?array $scope = null): void {
    if ($objectiveId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误', 'code' => 400], 400);
    }
    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare(
            'SELECT iep.student_id
             FROM iep_objectives o
             INNER JOIN iep_plans iep ON o.iep_plan_id = iep.id
             WHERE o.id = ? AND o.deleted_at IS NULL AND iep.deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$objectiveId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log('requireObjectiveInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败', 'code' => 500], 500);
        return;
    }
    if (!$row) {
        jsonResponse(['success' => false, 'message' => '短期目标不存在', 'code' => 404], 404);
        return;
    }
    requireStudentInScope(intval($row['student_id']), $scope);
}

/**
 * 返回指定短期目标所属的 IEP 计划 ID（0 表示不存在）
 */
function getObjectivePlanId(int $objectiveId): int {
    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare(
            'SELECT iep_plan_id FROM iep_objectives WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$objectiveId]);
        return intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('getObjectivePlanId error: ' . $e->getMessage());
        return 0;
    }
}

/**
 * 断言指定「行为干预计划」(behavior_intervention_plans) 所属学生在数据范围内，否则 403
 */
function requireBipInScope(int $bipId, ?array $scope = null): void {
    if ($bipId <= 0) {
        jsonResponse(['success' => false, 'message' => '参数错误', 'code' => 400], 400);
    }
    try {
        $pdo  = getDB();
        $stmt = $pdo->prepare(
            'SELECT student_id FROM behavior_intervention_plans
             WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$bipId]);
        $studentId = intval($stmt->fetchColumn());
    } catch (PDOException $e) {
        error_log('requireBipInScope error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => '数据校验失败', 'code' => 500], 500);
        return;
    }
    if ($studentId <= 0) {
        jsonResponse(['success' => false, 'message' => '行为干预计划不存在', 'code' => 404], 404);
        return;
    }
    requireStudentInScope($studentId, $scope);
}

/**
 * 判断当前用户是否可以查看指定学生的敏感字段（身份证号 / 监护人电话 / 住址 / 残疾证号）
 *
 * 修复(P0-6)：只读用户（督导、教研员）被配成 data_scope_type=all，
 * 可见全校学生完整档案（身份证、监护人电话、住址），且具备 student_export
 * 导出权限 —— 一旦账号泄露即为全校残障儿童敏感信息批量泄露。
 *
 * 设计取舍：只读用户「可见全校」本身是合理的（督导需做全校统计），
 * 真正缺失的是「敏感字段分级」。因此保留其范围，但剥夺敏感字段明文。
 *
 * 放行规则：
 *   1) 具备 student_view_sensitive 权限（管理员/主任/班主任/科任教师）
 *   2) 家长本人查看自己的孩子
 * 其余一律脱敏。
 */
function canViewSensitiveStudent(int $studentId): bool {
    if ($studentId <= 0) {
        return false;
    }
    $user = getCurrentUser();
    if (!$user) {
        return false;
    }
    if (checkPermission('student_view_sensitive')) {
        return true;
    }
    // 家长看自己的孩子
    if (($user['type'] ?? 'user') === 'parent') {
        $scope = getDataScope();
        $ids = array_map('intval', $scope['student_ids'] ?? []);
        return in_array($studentId, $ids, true);
    }
    return false;
}

/**
 * 对学生记录做敏感字段脱敏（保留业务可用性：班主任仍能联系家长？不 —— 无权限即不展示）
 *
 * 脱敏策略：
 *   - 身份证号 id_card：保留前 6 位 + **** + 后 2 位
 *   - 手机号 guardian_phone / emergency_phone：保留前 3 位 + **** + 后 4 位
 *   - 姓名 guardian_name：保留姓 + *
 *   - 住址 address、残疾证号 disability_card_no、健康/过敏信息：整段屏蔽
 */
function maskStudentSensitive(array $row): array {
    $maskIdCard = function ($v) {
        if (!is_string($v) || $v === '') return $v;
        $len = strlen($v);
        if ($len <= 8) return str_repeat('*', $len);
        return substr($v, 0, 6) . str_repeat('*', max(0, $len - 8)) . substr($v, -2);
    };
    $maskPhone = function ($v) {
        if (!is_string($v) || $v === '') return $v;
        $len = strlen($v);
        if ($len <= 7) return str_repeat('*', $len);
        return substr($v, 0, 3) . '****' . substr($v, -4);
    };
    $maskName = function ($v) {
        if (!is_string($v) || $v === '') return $v;
        $first = mb_substr($v, 0, 1, 'UTF-8');
        return $first . str_repeat('*', max(1, mb_strlen($v, 'UTF-8') - 1));
    };

    foreach (['id_card', 'disability_card_no'] as $f) {
        if (array_key_exists($f, $row)) $row[$f] = $maskIdCard((string) $row[$f]);
    }
    foreach (['guardian_phone', 'emergency_phone'] as $f) {
        if (array_key_exists($f, $row)) $row[$f] = $maskPhone((string) $row[$f]);
    }
    if (array_key_exists('guardian_name', $row)) {
        $row['guardian_name'] = $maskName((string) $row['guardian_name']);
    }
    foreach (['address', 'health_info', 'allergy_info', 'medical_history', 'family_info'] as $f) {
        if (array_key_exists($f, $row) && $row[$f] !== null && $row[$f] !== '') {
            $row[$f] = '[敏感信息已脱敏]';
        }
    }
    $row['_sensitive_masked'] = true;
    return $row;
}

/**
 * 批量按权限脱敏学生列表
 */
function maskStudentList(array $rows): array {
    $out = [];
    foreach ($rows as $r) {
        $sid = intval($r['id'] ?? 0);
        $out[] = canViewSensitiveStudent($sid) ? $r : maskStudentSensitive($r);
    }
    return $out;
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
// 登录失败限流（暴力破解防护）
// ============================================================
// 修复(P1-3)：原实现无任何登录失败限流，可对任意账号无限次撞库
// （实测连续 12 次错误密码全部返回 200，无锁定、无告警）。
// 现按「账号 + 来源IP」双维度统计：15 分钟内失败 10 次即锁定 15 分钟，
// 返回 HTTP 429 与 Retry-After。计数器落盘于 logs/ratelimit/，
// 该目录同时写入 .htaccess 拒绝 Web 访问。
function iepRateLimitDir(): string {
    $dir = __DIR__ . '/../logs/ratelimit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    if (is_dir($dir) && !is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "# 禁止通过 Web 访问限流计数文件\n<RequireAll>\n    Require all denied\n</RequireAll>\n");
    }
    return $dir;
}

function iepRateLimitFile(string $scope, string $identity): string {
    return iepRateLimitDir() . '/' . $scope . '_' . md5($identity) . '.json';
}

/**
 * 检查登录是否被限流
 * @return array [是否允许, 还需等待秒数]
 */
function checkLoginRateLimit(string $username): array {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $now = time();
    $retryAfter = 0;
    foreach ([
        iepRateLimitFile('login_u', strtolower($username)),
        iepRateLimitFile('login_ip', $ip),
    ] as $file) {
        if (!is_file($file)) {
            continue;
        }
        $data = json_decode((string) @file_get_contents($file), true);
        if (!is_array($data)) {
            continue;
        }
        $until = intval($data['locked_until'] ?? 0);
        if ($until > $now) {
            $retryAfter = max($retryAfter, $until - $now);
        }
    }
    return [$retryAfter === 0, $retryAfter];
}

/**
 * 记录一次登录失败，达到阈值则锁定
 */
function recordLoginFailure(string $username): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $window = 900;      // 统计窗口 15 分钟
    $maxFail = 10;      // 窗口内最大失败次数
    $lockSeconds = 900; // 锁定 15 分钟
    $now = time();

    foreach ([
        iepRateLimitFile('login_u', strtolower($username)),
        iepRateLimitFile('login_ip', $ip),
    ] as $file) {
        $data = ['fails' => [], 'locked_until' => 0];
        if (is_file($file)) {
            $existing = json_decode((string) @file_get_contents($file), true);
            if (is_array($existing)) {
                $data = $existing;
            }
        }
        $fails = array_values(array_filter(
            (array) ($data['fails'] ?? []),
            function ($t) use ($now, $window) { return intval($t) > $now - $window; }
        ));
        $fails[] = $now;
        $data['fails'] = $fails;
        if (count($fails) >= $maxFail) {
            $data['locked_until'] = $now + $lockSeconds;
        }
        @file_put_contents($file, json_encode($data), LOCK_EX);
    }
}

/**
 * 登录成功后清空失败计数
 */
function clearLoginFailures(string $username): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    foreach ([
        iepRateLimitFile('login_u', strtolower($username)),
        iepRateLimitFile('login_ip', $ip),
    ] as $file) {
        if (is_file($file)) {
            @unlink($file);
        }
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
