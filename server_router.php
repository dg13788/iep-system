<?php
/**
 * IEP System - PHP built-in server router
 * Usage: php -S 0.0.0.0:8080 server_router.php
 * - /api/*  -> backend/api/index.php (front controller with $_GET['path'])
 * - static  -> frontend/dist/* (served manually since dist is not doc root)
 * - else    -> SPA fallback -> index.html
 */
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$distRoot = __DIR__ . '/frontend/dist';

// 修复(P1-7/P2-10)：全局安全响应头。
// - API 与静态资源统一带 nosniff / 禁止被内嵌 iframe / Referrer 与权限策略收敛；
// - HTML 页面额外带 CSP（脚本仅限同源；Google Fonts 走 style/font 白名单；
//   内联事件处理器会被 CSP 拦截，字体优雅降级到 index.css 的本地兜底字体栈，
//   不影响功能——校园内网本就到不了 fonts.googleapis.com）。
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');

// 1) API routing: /api/auth/login -> path=auth/login
if (preg_match('#^/api(/.*)?$#', $uri)) {
    $path = trim(substr($uri, 4), '/');
    if ($path === '') {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Not Found']);
        return true;
    }
    $_GET['path'] = $path;
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/backend/api/index.php';
    return true;
}

$types = [
    'js'=>'application/javascript','mjs'=>'application/javascript','css'=>'text/css',
    'html'=>'text/html; charset=UTF-8','htm'=>'text/html; charset=UTF-8',
    'png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','gif'=>'image/gif',
    'svg'=>'image/svg+xml','webp'=>'image/webp','ico'=>'image/x-icon',
    'ttf'=>'font/ttf','otf'=>'font/otf','woff'=>'font/woff','woff2'=>'font/woff2',
    'eot'=>'application/vnd.ms-fontobject','json'=>'application/json','txt'=>'text/plain; charset=UTF-8',
    'map'=>'application/json'
];

// 2) Static files under frontend/dist
if ($uri === '/' || $uri === '') {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($distRoot . '/index.html');
    return true;
}
$file   = realpath($distRoot . '/' . ltrim($uri, '/'));
$realDist = realpath($distRoot);
if ($file !== false && strpos($file, $realDist) === 0 && is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    readfile($file);
    return true;
}

// 3) SPA fallback
header('Content-Type: text/html; charset=UTF-8');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
readfile($distRoot . '/index.html');
return true;
