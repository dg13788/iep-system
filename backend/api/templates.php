<?php
/**
 * Templates Module - Assessment Template Endpoints
 * 
 * Endpoints:
 *   GET  /api/templates/list          - Template list
 *   GET  /api/templates/get           - Get template detail
 *   GET  /api/templates/types         - Template types
 *   GET  /api/templates/items         - Get template items
 *   POST /api/templates/create        - Create template
 *   POST /api/templates/update        - Update template
 *   POST /api/templates/delete        - Delete template
 *   POST /api/templates/add_item      - Add template item
 *   POST /api/templates/update_item   - Update template item
 *   POST /api/templates/delete_item   - Delete template item
 *   POST /api/templates/reorder_items - Reorder template items
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/io_engine.php';

$path = isset($_GET['path']) ? trim($_GET['path'], '/') : '';
$parts = explode('/', $path);
$action = isset($parts[1]) ? $parts[1] : '';

switch ($action) {
    // ============================================================
    // GET /api/templates/list - Template list
    // ============================================================
    case 'list':
        requireAuth();

        [$page, $pageSize, $offset] = getPagination();
        $type = isset($_GET['type']) ? trim($_GET['type']) : '';

        try {
            $pdo = getDB();
            $params = [];

            $sql = 'SELECT id, name, category AS type, description, is_system, is_active, created_by, created_at FROM assessment_templates WHERE is_active = 1';
            if (!empty($type)) {
                $sql .= ' AND category = ?';
                $params[] = $type;
            }

            // Count
            $countStmt = $pdo->prepare(str_replace('id, name, category AS type, description, is_system, is_active, created_by, created_at', 'COUNT(*)', $sql));
            $countStmt->execute($params);
            $total = intval($countStmt->fetchColumn());

            $sql .= ' ORDER BY is_system DESC, created_at DESC LIMIT ' . $offset . ', ' . $pageSize;
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $list = $stmt->fetchAll();

            jsonResponse([
                'success' => true,
                'data'    => ['list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize],
                'message' => '查询成功'
            ]);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '查询失败']);
        }
        break;

    // ============================================================
    // GET /api/templates/get - Get template detail
    // ============================================================
    case 'get':
        requireAuth();

        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, name, category AS type, description, target_disability_types, 
                        applicable_age_min, applicable_age_max, is_system, is_active, created_by, created_at 
                 FROM assessment_templates WHERE id = ? AND is_active = 1 LIMIT 1'
            );
            $stmt->execute([$id]);
            $template = $stmt->fetch();

            if (!$template) {
                jsonResponse(['success' => false, 'message' => '模板不存在']);
            }

            jsonResponse(['success' => true, 'data' => $template, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/templates/types - Template types
    // ============================================================
    case 'types':
        requireAuth();

        try {
            $pdo = getDB();
            $stmt = $pdo->query('SELECT DISTINCT category AS type FROM assessment_templates WHERE is_active = 1 ORDER BY category');
            $types = $stmt->fetchAll(PDO::FETCH_COLUMN);
            jsonResponse(['success' => true, 'data' => $types, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // GET /api/templates/items - Get template items
    // ============================================================
    case 'items':
        requireAuth();

        $templateId = isset($_GET['template_id']) ? intval($_GET['template_id']) : 0;
        if ($templateId <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'SELECT id, dimension, item_name, item_description, max_score, sort_order 
                 FROM template_items_custom 
                 WHERE template_id = ? ORDER BY sort_order, id'
            );
            $stmt->execute([$templateId]);
            $items = $stmt->fetchAll();
            jsonResponse(['success' => true, 'data' => $items, 'message' => '获取成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '获取失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/create - Create template
    // ============================================================
    case 'create':
        requireAuth();
        requirePermission('template_create');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $name = isset($input['name']) ? trim($input['name']) : '';
        $type = isset($input['type']) ? trim($input['type']) : '';

        if (empty($name) || empty($type)) {
            jsonResponse(['success' => false, 'message' => '模板名称和类型不能为空']);
        }

        $description = isset($input['description']) ? trim($input['description']) : '';
        $targetDisabilityTypes = isset($input['target_disability_types']) ? trim($input['target_disability_types']) : null;
        $ageMin = isset($input['applicable_age_min']) ? intval($input['applicable_age_min']) : null;
        $ageMax = isset($input['applicable_age_max']) ? intval($input['applicable_age_max']) : null;
        $user = getCurrentUser();
        $createdBy = isset($user['sub']) ? intval($user['sub']) : 0;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO assessment_templates (name, category, description, target_disability_types, 
                 applicable_age_min, applicable_age_max, is_system, is_active, created_by, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW())'
            );
            $stmt->execute([$name, $type, $description, $targetDisabilityTypes, $ageMin, $ageMax, $createdBy]);

            $templateId = $pdo->lastInsertId();

            auditLog('create', 'templates', 'template', intval($templateId), $name, null, null, '创建评估模板');

            jsonResponse(['success' => true, 'data' => ['id' => $templateId], 'message' => '创建成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '创建失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/update - Update template
    // ============================================================
    case 'update':
        requireAuth();
        requirePermission('template_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        $updatableFields = ['name', 'category', 'description', 'target_disability_types', 
                            'applicable_age_min', 'applicable_age_max', 'is_active'];

        $updates = [];
        $values = [];

        foreach ($updatableFields as $field) {
            if (isset($input[$field])) {
                $updates[] = $field . ' = ?';
                $val = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
                $values[] = ($val === '' || $val === null) ? null : $val;
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE assessment_templates SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE id = ? AND is_system = 0');
            $stmt->execute($values);

            auditLog('update', 'templates', 'template', $id, '', null, null, '更新评估模板');

            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/delete - Delete template
    // ============================================================
    case 'delete':
        requireAuth();
        requirePermission('template_delete');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE assessment_templates SET is_active = 0, updated_at = NOW() WHERE id = ? AND is_system = 0');
            $stmt->execute([$id]);

            auditLog('delete', 'templates', 'template', $id, '', null, null, '删除评估模板');

            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/add_item - Add template item
    // ============================================================
    case 'add_item':
        requireAuth();
        requirePermission('template_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $templateId = isset($input['template_id']) ? intval($input['template_id']) : 0;
        $dimension = isset($input['dimension']) ? trim($input['dimension']) : '';
        $itemName = isset($input['item_name']) ? trim($input['item_name']) : '';

        if ($templateId <= 0 || empty($dimension) || empty($itemName)) {
            jsonResponse(['success' => false, 'message' => '模板ID、维度和项目名称不能为空']);
        }

        $itemDescription = isset($input['item_description']) ? trim($input['item_description']) : '';
        $maxScore = isset($input['max_score']) ? intval($input['max_score']) : 5;
        $sortOrder = isset($input['sort_order']) ? intval($input['sort_order']) : 0;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO template_items_custom (template_id, dimension, item_name, item_description, max_score, sort_order, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())'
            );
            $stmt->execute([$templateId, $dimension, $itemName, $itemDescription, $maxScore, $sortOrder]);

            $itemId = $pdo->lastInsertId();
            jsonResponse(['success' => true, 'data' => ['id' => $itemId], 'message' => '添加成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '添加失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/update_item - Update template item
    // ============================================================
    case 'update_item':
        requireAuth();
        requirePermission('template_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        $updatableFields = ['dimension', 'item_name', 'item_description', 'max_score', 'sort_order'];
        $updates = [];
        $values = [];

        foreach ($updatableFields as $field) {
            if (isset($input[$field])) {
                $updates[] = $field . ' = ?';
                $val = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
                $values[] = ($val === '' || $val === null) ? null : $val;
            }
        }

        if (empty($updates)) {
            jsonResponse(['success' => false, 'message' => '没有需要更新的字段']);
        }

        $values[] = $id;

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE template_items_custom SET ' . implode(', ', $updates) . ' WHERE id = ?');
            $stmt->execute($values);
            jsonResponse(['success' => true, 'message' => '更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '更新失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/delete_item - Delete template item
    // ============================================================
    case 'delete_item':
        requireAuth();
        requirePermission('template_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if ($id <= 0) {
            jsonResponse(['success' => false, 'message' => '参数错误']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('DELETE FROM template_items_custom WHERE id = ?');
            $stmt->execute([$id]);
            jsonResponse(['success' => true, 'message' => '删除成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '删除失败']);
        }
        break;

    // ============================================================
    // POST /api/templates/reorder_items - Reorder template items
    // ============================================================
    case 'reorder_items':
        requireAuth();
        requirePermission('template_edit');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['success' => false, 'message' => '请求方式错误']);
        }

        $input = getInput();
        $ids = isset($input['ids']) ? (is_string($input['ids']) ? json_decode($input['ids'], true) : $input['ids']) : [];

        if (!is_array($ids) || empty($ids)) {
            jsonResponse(['success' => false, 'message' => 'ID数组不能为空']);
        }

        try {
            $pdo = getDB();
            $stmt = $pdo->prepare('UPDATE template_items_custom SET sort_order = ? WHERE id = ?');

            foreach ($ids as $index => $id) {
                $stmt->execute([$index, intval($id)]);
            }

            jsonResponse(['success' => true, 'message' => '排序更新成功']);
        } catch (PDOException $e) {
            jsonResponse(['success' => false, 'message' => '排序更新失败']);
        }
        break;

    default:
        jsonResponse(['success' => false, 'message' => '未知的模板操作: ' . $action]);
}
