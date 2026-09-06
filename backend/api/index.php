<?php
/**
 * IEP System - Unified API Entry Point
 * Route dispatch to module files
 * 
 * URL format: /api/module/action
 * Example: /api/students/list, /api/iep/create
 */

require_once __DIR__ . '/config.php';

// Parse URL path
$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$module = isset($parts[0]) ? $parts[0] : '';
$action = isset($parts[1]) ? $parts[1] : '';

// Route mapping: module name => file name
$moduleFiles = [
    'auth'          => 'auth.php',
    'students'      => 'students.php',
    'assessments'   => 'assessments.php',
    'iep'           => 'iep.php',
    'teaching'      => 'teaching.php',
    'templates'     => 'templates.php',
    'parents'       => 'parents.php',
    'system'        => 'system.php',
    'permissions'   => 'system.php',
    'reports'       => 'system.php',
    'registry'      => 'system.php',
    // 修复 P0-7：权限组管理模块此前未注册，导致 /api/permission_groups/*
    // 全部返回「未知的接口模块」，v4 权限组功能完全不可达。
    'permission_groups' => 'permission_groups.php',
];

// Handle module routing
if (isset($moduleFiles[$module])) {
    $file = __DIR__ . '/' . $moduleFiles[$module];
    if (file_exists($file)) {
        require_once $file;
        exit;
    }
}

// Unknown module
jsonResponse(['success' => false, 'message' => '未知的接口模块: ' . $module]);
