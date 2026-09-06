<?php
/**
 * io_engine.php — IEP 系统统一导入导出引擎
 *
 * 纯 PHP 实现，无 composer 依赖。依赖：Phar(PharData 读写 zip)、GD(渲染中文 PDF)、mbstring/iconv(编码)、SimpleXML(解析 xlsx)。
 *
 * 导出格式：csv / xlsx / docx / pdf / markdown(md) / json
 * 导入格式：csv / xlsx / xls（含 HTML/XML/CSV 伪装的 .xls 检测 + 真实 BIFF8 基础子集解析）
 *
 * 对外入口：
 *   io_export($format, $headers, $rows)         => string 二进制/文本内容（调用方负责发送）
 *   io_export_mime($format) / io_export_ext($format)
 *   io_parse_import($tmpPath, $ext)             => ['header'=>[], 'rows'=>[], 'error'=>null|string]
 *
 * 数据范围与权限校验由各表单模块在调用前完成（fail-closed），本引擎不越权。
 */
if (defined('IO_ENGINE_LOADED')) { return; }
define('IO_ENGINE_LOADED', true);

define('IO_SIMHEI', 'C:/Windows/Fonts/simhei.ttf');

/* ==================== 通用工具 ==================== */

function io_is_utf8($s) {
    return preg_match('//u', (string)$s) === 1;
}

/** 转 UTF-8：自动识别 UTF-8 / GBK 系编码 */
function io_to_utf8($s) {
    $s = (string)$s;
    if (io_is_utf8($s)) { return $s; }
    if (function_exists('mb_convert_encoding')) {
        foreach (['GB18030', 'GBK', 'GB2312'] as $enc) {
            $r = @mb_convert_encoding($s, 'UTF-8', $enc);
            if ($r !== false && io_is_utf8($r)) { return $r; }
        }
    }
    if (function_exists('iconv')) {
        $r = @iconv('GB18030', 'UTF-8//IGNORE', $s);
        if ($r !== false && io_is_utf8($r)) { return $r; }
    }
    return $s;
}

/** XML 转义 */
function io_xml_esc($s) {
    return htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

/** 数字格式化：整数不带小数点，浮点去尾噪 */
function io_num_str($v) {
    if (is_int($v)) { return (string)$v; }
    if (is_float($v)) {
        if (abs($v - round($v)) < 1e-9) { return (string)(int)round($v); }
        $s = rtrim(rtrim(sprintf('%.10F', $v), '0'), '.');
        return $s === '-0' || $s === '' ? '0' : $s;
    }
    return (string)$v;
}

/** 简单可读文件名 */
function io_safe_filename($base) {
    $base = preg_replace('/[\\\\\/:*?"<>|\r\n]+/u', '_', (string)$base);
    $base = trim($base, " .");
    return $base === '' ? 'export' : $base;
}

/* ==================== 导出：CSV ==================== */

function io_build_csv($headers, $rows) {
    $lines = [];
    $csvline = function ($fields) {
        $out = [];
        foreach ($fields as $f) {
            $f = (string)$f;
            if (strpbrk($f, ",\"\r\n") !== false) {
                $f = '"' . str_replace('"', '""', $f) . '"';
            }
            $out[] = $f;
        }
        return implode(',', $out);
    };
    $lines[] = $csvline($headers);
    foreach ($rows as $r) {
        $lines[] = $csvline(array_values((array)$r));
    }
    // UTF-8 BOM，Excel 打开中文不乱码
    return "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
}

/* ==================== 导出：JSON ==================== */

function io_build_json($headers, $rows) {
    $data = ['headers' => array_values($headers), 'rows' => array_map(function ($r) {
        return array_values((array)$r);
    }, $rows), 'count' => count($rows)];
    return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}

/* ==================== 导出：Markdown ==================== */

function io_build_markdown($headers, $rows) {
    $h = array_map('io_xml_esc', array_values($headers));
    $md = '| ' . implode(' | ', $h) . " |\n";
    $md .= '|' . implode('|', array_fill(0, count($h), ' --- ')) . "|\n";
    foreach ($rows as $r) {
        $cells = array_map(function ($v) {
            $s = (string)$v;
            $s = str_replace('|', '\\|', $s);
            $s = str_replace(["\r\n", "\r", "\n"], '<br>', $s);
            return $s;
        }, array_values((array)$r));
        $md .= '| ' . implode(' | ', $cells) . " |\n";
    }
    return $md;
}

/* ==================== 导出分发 ==================== */

function io_export($format, $headers, $rows) {
    $format = strtolower((string)$format);
    switch ($format) {
        case 'csv':     return io_build_csv($headers, $rows);
        case 'json':    return io_build_json($headers, $rows);
        case 'md':
        case 'markdown': return io_build_markdown($headers, $rows);
        case 'xlsx':    return io_build_xlsx($headers, $rows);
        case 'docx':    return io_build_docx($headers, $rows);
        case 'pdf':     return io_build_pdf($headers, $rows);
        default:        return null;
    }
}

function io_export_mime($format) {
    switch (strtolower((string)$format)) {
        case 'csv': return 'text/csv; charset=UTF-8';
        case 'json': return 'application/json; charset=UTF-8';
        case 'md':
        case 'markdown': return 'text/markdown; charset=UTF-8';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'pdf': return 'application/pdf';
        default: return 'application/octet-stream';
    }
}

function io_export_ext($format) {
    switch (strtolower((string)$format)) {
        case 'md': case 'markdown': return 'md';
        default: return strtolower((string)$format);
    }
}

/* ==================== 下载响应辅助 ==================== */

/**
 * 发送文件下载响应并结束请求。
 * $headers: 表头（字符串数组）；$rows: 行数据（关联数组数组，或与表头等长的值数组）。
 */
function io_download($format, $filenameBase, $headers, $rows) {
    $content = io_export($format, $headers, $rows);
    if ($content === null) {
        jsonResponse(['success' => false, 'message' => '不支持的导出格式: ' . $format]);
    }
    // 表头默认带 BOM，避免 Excel 打开 CSV 中文乱码
    $filename = preg_replace('/[\\\\\/:*?"<>|]/', '_', $filenameBase) . '.' . io_export_ext($format);
    header('Content-Type: ' . io_export_mime($format));
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($content));
    header('X-Content-Type-Options: nosniff');
    echo $content;
    exit;
}

/*__IO_NEXT__*/

/* ==================== 导入：CSV ==================== */

function io_parse_csv_file($path) {
    $raw = file_get_contents($path);
    if ($raw === false) { return ['error' => '无法读取上传文件']; }
    // 去 BOM
    if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) { $raw = substr($raw, 3); }
    $raw = io_to_utf8($raw);
    // 统一换行
    $raw = str_replace(["\r\n", "\r"], "\n", $raw);
    $lines = explode("\n", $raw);
    $rows = [];
    $cur = [];
    $field = '';
    $inQ = false;
    $flush = function () use (&$rows, &$cur, &$field) {
        $cur[] = $field;
        $field = '';
        $rows[] = $cur;
        $cur = [];
    };
    foreach ($lines as $line) {
        $len = strlen($line);
        if ($len === 0 && $field === '' && $cur === []) { continue; } // 空行跳过
        for ($i = 0; $i < $len; $i++) {
            $c = $line[$i];
            if ($inQ) {
                if ($c === '"') {
                    if ($i + 1 < $len && $line[$i + 1] === '"') { $field .= '"'; $i++; }
                    else { $inQ = false; }
                } else { $field .= $c; }
                continue;
            }
            if ($c === '"') { $inQ = true; continue; }
            if ($c === ',') { $cur[] = $field; $field = ''; continue; }
            $field .= $c;
        }
        if (!$inQ) { $flush(); }
        else { $field .= "\n"; }
    }
    if (!$inQ && $field !== '') { $flush(); }
    if (!$inQ && $cur !== []) { $flush(); }
    // 去除末尾空行
    while ($rows && count($rows[count($rows) - 1]) === 1 && trim($rows[count($rows) - 1][0]) === '') {
        array_pop($rows);
    }
    return io_header_from_rows($rows);
}

/* ==================== 导出：XLSX（PharData + SimpleXML 手写 OOXML） ==================== */

function io_build_xlsx($headers, $rows) {
    $tmp = @tempnam(sys_get_temp_dir(), 'iep_xlsx_');
    if ($tmp === false) { return null; }
    $zipPath = $tmp . '.zip';
    @unlink($tmp);

    $header = array_values($headers);
    $ncols = count($header);
    $dataRows = [];
    foreach ($rows as $r) {
        $dataRows[] = array_values((array)$r);
    }

    // 共享字符串：收集所有单元格文本
    $shared = [];
    $sharedIdx = [];
    $sst = '';
    $addShared = function ($v) use (&$shared, &$sharedIdx) {
        $v = (string)$v;
        if (!isset($sharedIdx[$v])) {
            $sharedIdx[$v] = count($shared);
            $shared[] = $v;
        }
        return $sharedIdx[$v];
    };
    // 先遍历一遍构造 shared strings xml
    foreach ($header as $h) { $addShared($h); }
    foreach ($dataRows as $row) { foreach ($row as $c) { $addShared($c); } }
    $sst = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' . (count($header) + count($dataRows) * $ncols) . '" uniqueCount="' . count($shared) . '">';
    foreach ($shared as $s) {
        $sst .= '<si><t>' . io_xml_esc($s) . '</t></si>';
    }
    $sst .= '</sst>';

    // sheet1.xml
    $colLetters = [];
    for ($c = 0; $c < $ncols; $c++) { $colLetters[$c] = io_col_letter($c + 1); }
    $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
    $sheet .= '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    $sheet .= '<sheetData>';
    // 表头行
    $sheet .= '<row r="1">';
    foreach ($header as $i => $h) {
        $idx = $addShared($h);
        $sheet .= '<c r="' . $colLetters[$i] . '1" t="s" s="1"><v>' . $idx . '</v></c>';
    }
    $sheet .= '</row>';
    // 数据行
    foreach ($dataRows as $rn => $row) {
        $rnum = $rn + 2;
        $sheet .= '<row r="' . $rnum . '">';
        foreach ($row as $i => $cell) {
            if ($i >= $ncols) { break; }
            $v = (string)$cell;
            $ref = $colLetters[$i] . $rnum;
            if ($v === '') {
                $sheet .= '<c r="' . $ref . '"/>';
            } elseif (is_numeric($v)) {
                $sheet .= '<c r="' . $ref . '"><v>' . io_num_str((float)$v) . '</v></c>';
            } else {
                $idx = $addShared($v);
                $sheet .= '<c r="' . $ref . '" t="s"><v>' . $idx . '</v></c>';
            }
        }
        $sheet .= '</row>';
    }
    $sheet .= '</sheetData></worksheet>';

    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        . '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        . '</Types>';

    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        . '</Relationships>';

    $workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheets><sheet name="' . io_xml_esc('数据') . '" sheetId="1" r:id="rId1"/></sheets></workbook>';

    $workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        . '</Relationships>';

    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        . '</styleSheet>';

    $coreProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        . '<dc:creator>IEP</dc:creator><dc:title>' . io_xml_esc('IEP 数据导出') . '</dc:title>'
        . '<cp:lastModifiedBy>IEP</cp:lastModifiedBy>'
        . '</cp:coreProperties>';

    $entries = [
        '[Content_Types].xml' => $contentTypes,
        '_rels/.rels' => $rels,
        'docProps/core.xml' => $coreProps,
        'xl/workbook.xml' => $workbook,
        'xl/_rels/workbook.xml.rels' => $workbookRels,
        'xl/worksheets/sheet1.xml' => $sheet,
        'xl/sharedStrings.xml' => $sst,
        'xl/styles.xml' => $styles,
    ];

    $ok = io_zip_write($zipPath, $entries);
    if (!$ok) { @unlink($zipPath); return null; }
    $bin = @file_get_contents($zipPath);
    @unlink($zipPath);
    return $bin === false ? null : $bin;
}

/** PharData 打包 zip */
function io_zip_write($zipPath, $entries) {
    try {
        @unlink($zipPath);
        $phar = new PharData($zipPath);
        foreach ($entries as $name => $content) {
            $phar[$name] = $content;
        }
        unset($phar);
        return file_exists($zipPath) && filesize($zipPath) > 0;
    } catch (Throwable $e) {
        return false;
    }
}

/** 列字母：1->A, 27->AA */
function io_col_letter($n) {
    $s = '';
    while ($n > 0) {
        $n--;
        $s = chr(65 + ($n % 26)) . $s;
        $n = intdiv($n, 26);
    }
    return $s;
}

/* ==================== 导出：DOCX（PharData 手写 WordprocessingML） ==================== */

function io_build_docx($headers, $rows) {
    $tmp = @tempnam(sys_get_temp_dir(), 'iep_docx_');
    if ($tmp === false) { return null; }
    $zipPath = $tmp . '.zip';
    @unlink($tmp);

    $header = array_values($headers);
    $ncols = count($header);

    // document.xml：标题 + 表格
    $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n";
    $xml .= '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    $xml .= '<w:body>';
    // 标题
    $xml .= '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>' . io_xml_esc('IEP 数据导出') . '</w:t></w:r></w:p>';
    $xml .= '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">' . io_xml_esc('共 ' . count($rows) . ' 条记录') . '</w:t></w:r></w:p>';
    // 表格
    $xml .= '<w:tbl><w:tblPr>'
        . '<w:tblW w:w="5000" w:type="pct"/>'
        . '<w:tblBorders>'
        . '<w:top w:val="single" w:sz="4" w:color="000000"/>'
        . '<w:left w:val="single" w:sz="4" w:color="000000"/>'
        . '<w:bottom w:val="single" w:sz="4" w:color="000000"/>'
        . '<w:right w:val="single" w:sz="4" w:color="000000"/>'
        . '<w:insideH w:val="single" w:sz="4" w:color="000000"/>'
        . '<w:insideV w:val="single" w:sz="4" w:color="000000"/>'
        . '</w:tblBorders>'
        . '</w:tblPr>';

    $cell = function ($text, $bold = false) {
        return '<w:tc><w:tcPr><w:tcW w:w="' . (5000 / max(1, 0)) . '" w:type="pct"/></w:tcPr>'
            . '<w:p><w:r><w:rPr>' . ($bold ? '<w:b/>' : '') . '</w:rPr>'
            . '<w:t xml:space="preserve">' . io_xml_esc($text) . '</w:t></w:r></w:p></w:tc>';
    };

    // 表头
    $xml .= '<w:tr>';
    foreach ($header as $h) {
        $xml .= '<w:tc><w:tcPr><w:tcW w:type="auto"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr>'
            . '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' . io_xml_esc($h) . '</w:t></w:r></w:p></w:tc>';
    }
    $xml .= '</w:tr>';

    foreach ($rows as $row) {
        $vals = array_values((array)$row);
        $xml .= '<w:tr>';
        foreach ($vals as $i => $v) {
            if ($i >= $ncols) { break; }
            $xml .= '<w:tc><w:tcPr><w:tcW w:type="auto"/></w:tcPr>'
                . '<w:p><w:r><w:t xml:space="preserve">' . io_xml_esc($v) . '</w:t></w:r></w:p></w:tc>';
        }
        $xml .= '</w:tr>';
    }
    $xml .= '</w:tbl>';
    // 页脚空白段
    $xml .= '<w:p/>';
    $xml .= '</w:body></w:document>';

    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        . '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        . '</Types>';

    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        . '</Relationships>';

    $documentRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        . '</Relationships>';

    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        . '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="SimSun" w:eastAsia="宋体" w:hAnsi="SimSun"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>'
        . '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        . '</w:styles>';

    $coreProps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n"
        . '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        . '<dc:creator>IEP</dc:creator><dc:title>' . io_xml_esc('IEP 数据导出') . '</dc:title>'
        . '</cp:coreProperties>';

    $entries = [
        '[Content_Types].xml' => $contentTypes,
        '_rels/.rels' => $rels,
        'docProps/core.xml' => $coreProps,
        'word/document.xml' => $xml,
        'word/_rels/document.xml.rels' => $documentRels,
        'word/styles.xml' => $styles,
    ];

    $ok = io_zip_write($zipPath, $entries);
    if (!$ok) { @unlink($zipPath); return null; }
    $bin = @file_get_contents($zipPath);
    @unlink($zipPath);
    return $bin === false ? null : $bin;
}

/* ==================== 导出：PDF（GD 渲染中文图片嵌入 PDF） ==================== */

function io_build_pdf($headers, $rows) {
    if (!function_exists('imagecreatetruecolor')) { return null; }
    if (!file_exists(IO_SIMHEI)) { return null; }
    $font = IO_SIMHEI;

    $header = array_values($headers);
    $ncols = count($header);
    $data = [];
    foreach ($rows as $r) { $data[] = array_values((array)$r); }

    // 计算列宽（按内容长度估算，像素）
    $pad = 10;
    $maxTotal = 1150;
    $colW = [];
    $total = 0;
    for ($i = 0; $i < $ncols; $i++) {
        $w = max(60, (mb_strlen((string)$header[$i], 'UTF-8') * 16 + $pad * 2));
        foreach ($data as $row) {
            $s = isset($row[$i]) ? (string)$row[$i] : '';
            $len = mb_strlen($s, 'UTF-8');
            $w = max($w, $len * 16 + $pad * 2);
            if ($w > 260) { $w = 260; break; }
        }
        $colW[$i] = $w;
        $total += $w;
    }
    if ($total > $maxTotal) {
        $scale = $maxTotal / $total;
        foreach ($colW as $i => $w) { $colW[$i] = max(40, (int)($w * $scale)); }
    }
    $tableW = array_sum($colW);

    $fontSize = 11;
    $rowH = 26;
    $headerH = 30;
    $margin = 40;
    $imgW = $tableW + $margin * 2;
    $usableH = 1050 - 80; // 每页可用内容高度
    $rowsPerPage = max(1, intdiv($usableH, $rowH));

    $images = []; // 每页 GD 图像
    $startRow = 0;
    $pageIdx = 0;
    do {
        $endRow = min(count($data), $startRow + $rowsPerPage);
        $nDraw = $endRow - $startRow;
        $imgH = $headerH + $nDraw * $rowH + $margin * 2;
        $im = imagecreatetruecolor($imgW, $imgH);
        if (!$im) { foreach ($images as $im2) { @imagedestroy($im2); } return null; }
        $white = imagecolorallocate($im, 255, 255, 255);
        $black = imagecolorallocate($im, 30, 30, 30);
        $grey = imagecolorallocate($im, 245, 245, 245);
        $headerBg = imagecolorallocate($im, 217, 226, 243);
        $border = imagecolorallocate($im, 120, 120, 120);
        imagefilledrectangle($im, 0, 0, $imgW, $imgH, $white);

        $y = $margin;
        // 表头
        imagefilledrectangle($im, $margin, $y, $margin + $tableW, $y + $headerH, $headerBg);
        $cx = $margin;
        for ($i = 0; $i < $ncols; $i++) {
            imagerectangle($im, $cx, $y, $cx + $colW[$i], $y + $headerH, $border);
            imagettftext($im, $fontSize, 0, $cx + $pad, $y + ($headerH / 2) + 5, $black, $font, (string)$header[$i]);
            $cx += $colW[$i];
        }
        $y += $headerH;
        // 数据行
        for ($r = $startRow; $r < $endRow; $r++) {
            $row = $data[$r];
            if (($r - $startRow) % 2 === 1) {
                imagefilledrectangle($im, $margin, $y, $margin + $tableW, $y + $rowH, $grey);
            }
            $cx = $margin;
            for ($i = 0; $i < $ncols; $i++) {
                imagerectangle($im, $cx, $y, $cx + $colW[$i], $y + $rowH, $border);
                $s = isset($row[$i]) ? (string)$row[$i] : '';
                if ($s !== '') {
                    imagettftext($im, $fontSize, 0, $cx + $pad, $y + ($rowH / 2) + 5, $black, $font, $s);
                }
                $cx += $colW[$i];
            }
            $y += $rowH;
        }
        $images[] = $im;
        $pageIdx++;
        $startRow = $endRow;
    } while ($startRow < count($data));

    // 转 JPEG（内存）
    $jpegs = [];
    foreach ($images as $im) {
        ob_start();
        imagejpeg($im, null, 88);
        $jpegs[] = ob_get_clean();
        imagedestroy($im);
    }

    // 构建 PDF：A4 横向自适应图片尺寸
    return io_pdf_from_jpegs($jpegs, $imgW, $imgH, $tableW);
}

/** 将一页页 JPEG 嵌入 PDF（DCTDecode XObject），中文字形已在图片中 */
function io_pdf_from_jpegs($jpegs, $imgW, $imgH, $tableW) {
    $pageW = 595.276; // A4 宽 pt
    $pageH = 841.890; // A4 高 pt
    $scale = $pageW / ($tableW + 80);
    $dispW = ($tableW + 80) * $scale;
    $dispH = $imgH * $scale;

    $objects = [];
    $object = function ($num, $body) use (&$objects) {
        $objects[$num] = $body;
    };

    $nPages = count($jpegs);
    $imgObjBase = 4;
    $pageObjStart = $imgObjBase + $nPages;
    // 1: catalog, 2: pages, 3..: 保留 images 从4开始，pages 在 images 后
    $catalogNum = 1; $pagesNum = 2;
    $pageNums = [];
    $imgNums = [];
    $contentNums = [];
    for ($i = 0; $i < $nPages; $i++) {
        $imgNums[$i] = $imgObjBase + $i;
        $contentNums[$i] = $imgObjBase + $nPages + $i;
        $pageNums[$i] = $imgObjBase + $nPages * 2 + $i;
    }
    $lastNum = $pageNums[$nPages - 1];

    // 图像对象
    for ($i = 0; $i < $nPages; $i++) {
        $len = strlen($jpegs[$i]);
        $object($imgNums[$i],
            "<< /Type /XObject /Subtype /Image /Width {$imgW} /Height {$imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {$len} >>\nstream\n" . $jpegs[$i] . "\nendstream");
    }
    // 内容流（缩放绘制图片铺满页面）
    for ($i = 0; $i < $nPages; $i++) {
        $content = "q {$dispW} 0 0 {$dispH} 0 0 cm /Im{$i} Do Q";
        $len = strlen($content);
        $object($contentNums[$i], "<< /Length {$len} >>\nstream\n{$content}\nendstream");
    }
    // 页面对象
    $kids = [];
    for ($i = 0; $i < $nPages; $i++) {
        $res = "<< /XObject << /Im{$i} {$imgNums[$i]} 0 R >> >>";
        $object($pageNums[$i],
            "<< /Type /Page /Parent {$pagesNum} 0 R /MediaBox [0 0 {$pageW} {$pageH}] /Resources {$res} /Contents {$contentNums[$i]} 0 R >>");
        $kids[] = "{$pageNums[$i]} 0 R";
    }
    // Pages
    $object($pagesNum, "<< /Type /Pages /Kids [" . implode(' ', $kids) . "] /Count {$nPages} >>");
    // Catalog
    $object($catalogNum, "<< /Type /Catalog /Pages {$pagesNum} 0 R >>");

    ksort($objects);
    $pdf = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $num => $body) {
        $offsets[$num] = strlen($pdf);
        $pdf .= "{$num} 0 obj\n{$body}\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . ($lastNum + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($i = 1; $i <= $lastNum; $i++) {
        $pdf .= sprintf("%010d 00000 n \n", isset($offsets[$i]) ? $offsets[$i] : 0);
    }
    $pdf .= "trailer\n<< /Size " . ($lastNum + 1) . " /Root {$catalogNum} 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}

/* ==================== 导入：XLSX ==================== */

function io_parse_xlsx_file($path) {
    try {
        $phar = new PharData($path);
        $get = function ($name) use ($phar) {
            return isset($phar[$name]) ? file_get_contents($phar[$name]->getPathname()) : null;
        };

        // shared strings
        $shared = [];
        $ssXml = $get('xl/sharedStrings.xml');
        if ($ssXml !== null) {
            $ssXml = str_replace(['<r>', '</r>'], '', $ssXml);
            if (preg_match_all('/<si>(.*?)<\/si>/s', $ssXml, $m)) {
                foreach ($m[1] as $si) {
                    if (preg_match('/<t[^>]*>(.*?)<\/t>/s', $si, $tm)) {
                        $shared[] = html_entity_decode($tm[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
                    } else {
                        $shared[] = '';
                    }
                }
            }
        }

        $sheetXml = $get('xl/worksheets/sheet1.xml');
        if ($sheetXml === null) { return ['error' => 'XLSX 缺少 sheet1.xml']; }
        // 去命名空间前缀，简化解析
        $sheetXml = preg_replace('/xmlns[^=]*="[^"]*"/', '', $sheetXml, 1);
        $sheetXml = preg_replace('/<(\/?)([a-z0-9]+):/', '<$1', $sheetXml);

        $rows = [];
        if (preg_match_all('/<row[^>]*>(.*?)<\/row>/s', $sheetXml, $rm)) {
            foreach ($rm[1] as $rowXml) {
                $cells = [];
                $maxCol = -1;
                if (preg_match_all('/<c\s+([^>]*?)(?:\/>|>(.*?)<\/c>)/s', $rowXml, $cm, PREG_SET_ORDER)) {
                    foreach ($cm as $mm) {
                        $attrs = $mm[1];
                        $inner = isset($mm[2]) ? $mm[2] : '';
                        // 列索引（r="A1"）
                        $colIdx = 0;
                        if (preg_match('/r="([A-Z]+)\d+"/', $attrs, $rm2)) {
                            $letters = strtoupper($rm2[1]);
                            $len = strlen($letters);
                            for ($k = 0; $k < $len; $k++) { $colIdx = $colIdx * 26 + (ord($letters[$k]) - 64); }
                            $colIdx--;
                        }
                        // 类型
                        $t = '';
                        if (preg_match('/t="(\w+)"/', $attrs, $tm3)) { $t = $tm3[1]; }
                        // 值
                        $val = '';
                        if (preg_match('/<v>(.*?)<\/v>/s', $inner, $vm)) {
                            $val = html_entity_decode($vm[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
                        } elseif (preg_match('/<t>(.*?)<\/t>/s', $inner, $tm2)) {
                            $val = html_entity_decode($tm2[1], ENT_QUOTES | ENT_XML1, 'UTF-8');
                        }
                        if ($t === 's' && $val !== '' && is_numeric($val)) {
                            $val = isset($shared[(int)$val]) ? $shared[(int)$val] : '';
                        }
                        $cells[$colIdx] = $val;
                        if ($colIdx > $maxCol) { $maxCol = $colIdx; }
                    }
                }
                $final = [];
                for ($k = 0; $k <= $maxCol; $k++) { $final[] = isset($cells[$k]) ? $cells[$k] : ''; }
                $rows[] = $final;
            }
        }
        unset($phar);
        // 跳过完全空行
        $rows = array_values(array_filter($rows, function ($r) {
            foreach ($r as $v) { if (trim((string)$v) !== '') { return true; } }
            return false;
        }));
        if (!$rows) { return ['header' => [], 'rows' => [], 'error' => null]; }
        return io_header_from_rows($rows);
    } catch (Throwable $e) {
        return ['error' => 'XLSX 解析失败: ' . $e->getMessage()];
    }
}

/* ==================== 导入：XLS（BIFF8 + 伪装格式检测） ==================== */

function io_parse_xls_file($path) {
    $raw = file_get_contents($path);
    if ($raw === false) { return ['error' => '无法读取 XLS 文件']; }
    $head = substr($raw, 0, 4096);
    $isUtf16Le = strpos($head, "\xFF\xFE") === 0 || strpos($head, "<\0") !== false;

    // 伪装格式检测：SpreadsheetML XML / HTML / CSV 文本
    $lower = strtolower($head);
    $isSml = strpos($lower, '<ss:workbook') !== false
        || strpos($lower, 'urn:schemas-microsoft-com:office:spreadsheet') !== false
        || strpos($lower, 'mso-application') !== false;
    if ($isSml) {
        return io_parse_xml_xls($raw);
    }
    if (strpos($lower, '<html') !== false || strpos($lower, '<table') !== false || strpos($lower, '<div') !== false) {
        return io_parse_html_xls($raw);
    }
    if (strpos($lower, '<?xml') !== false || strpos($lower, '<workbook') !== false || strpos($lower, '<ss:workbook') !== false) {
        return io_parse_xml_xls($raw);
    }
    // OLE2 魔数（真实 BIFF8）
    if (substr($raw, 0, 8) === "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") {
        $stream = io_ole2_extract_workbook($raw);
        if ($stream === null) { return ['error' => '无法从 OLE2 复合文档中提取 Workbook 流']; }
        return io_biff8_parse($stream);
    }
    // 纯文本：尝试按 CSV / TSV 处理
    if ($isUtf16Le) {
        $raw = str_replace("\x00", '', $raw);
    }
    if (strpos($raw, "\t") !== false && strpos($raw, ',') === false) {
        return io_parse_dsv($raw, "\t");
    }
    return io_parse_csv_file_from_raw($raw);
}

function io_parse_csv_file_from_raw($raw) {
    if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) { $raw = substr($raw, 3); }
    $raw = io_to_utf8($raw);
    $raw = str_replace(["\r\n", "\r"], "\n", $raw);
    $lines = explode("\n", $raw);
    $rows = [];
    $cur = [];
    $field = '';
    $inQ = false;
    foreach ($lines as $line) {
        $len = strlen($line);
        if ($len === 0 && $field === '' && $cur === []) { continue; } // 空行跳过
        for ($i = 0; $i < $len; $i++) {
            $c = $line[$i];
            if ($inQ) {
                if ($c === '"') {
                    if ($i + 1 < $len && $line[$i + 1] === '"') { $field .= '"'; $i++; }
                    else { $inQ = false; }
                } else { $field .= $c; }
                continue;
            }
            if ($c === '"') { $inQ = true; continue; }
            if ($c === ',') { $cur[] = $field; $field = ''; continue; }
            $field .= $c;
        }
        if (!$inQ) { $cur[] = $field; $field = ''; $rows[] = $cur; $cur = []; }
        else { $field .= "\n"; }
    }
    if ($field !== '') { $cur[] = $field; $rows[] = $cur; }
    return io_header_from_rows($rows);
}

function io_parse_dsv($raw, $delim) {
    $raw = io_to_utf8($raw);
    $raw = str_replace(["\r\n", "\r"], "\n", $raw);
    $rows = [];
    foreach (explode("\n", $raw) as $line) {
        $line = rtrim($line);
        if ($line === '') { continue; }
        $rows[] = explode($delim, $line);
    }
    return io_header_from_rows($rows);
}

/** 解析伪装成 HTML 的 .xls */
function io_parse_html_xls($raw) {
    $raw = io_to_utf8($raw);
    $rows = [];
    if (preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $raw, $rm)) {
        foreach ($rm[1] as $tr) {
            $cells = [];
            if (preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/is', $tr, $cm)) {
                foreach ($cm[1] as $c) {
                    $c = preg_replace('/<[^>]+>/', '', $c);
                    $cells[] = trim(html_entity_decode($c, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                }
            }
            if ($cells !== []) { $rows[] = $cells; }
        }
    }
    if (!$rows) { return ['error' => 'HTML 格式 XLS 中未找到表格行']; }
    return io_header_from_rows($rows);
}

/** 解析伪装成 XML（SpreadsheetML / HTML table xml）的 .xls */
function io_parse_xml_xls($raw) {
    $raw = io_to_utf8($raw);
    $rows = [];
    if (preg_match_all('/<Row[^>]*>(.*?)<\/Row>/is', $raw, $rm) || preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $raw, $rm2)) {
        $trs = isset($rm[1]) && $rm[1] ? $rm[1] : $rm2[1];
        foreach ($trs as $tr) {
            $cells = [];
            if (preg_match_all('/<Cell[^>]*>(.*?)<\/Cell>/is', $tr, $cm) || preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/is', $tr, $cm2)) {
                $tcs = isset($cm[1]) && $cm[1] ? $cm[1] : $cm2[1];
                foreach ($tcs as $c) {
                    if (preg_match('/<Data[^>]*>(.*?)<\/Data>/is', $c, $dm)) { $c = $dm[1]; }
                    $c = preg_replace('/<[^>]+>/', '', $c);
                    $cells[] = trim(html_entity_decode($c, ENT_QUOTES | ENT_XML1, 'UTF-8'));
                }
            }
            if ($cells !== []) { $rows[] = $cells; }
        }
    }
    if (!$rows) { return ['error' => 'XML 格式 XLS 中未找到表格行']; }
    return io_header_from_rows($rows);
}

/* -------- OLE2 复合文档：提取 Workbook/Book 流 -------- */

function io_ole2_extract_workbook($raw) {
    $len = strlen($raw);
    if ($len < 512) { return null; }
    $sectorShift = unpack('v', substr($raw, 30, 2))[1];
    $miniSectorShift = unpack('v', substr($raw, 32, 2))[1];
    $numFatSectors = unpack('V', substr($raw, 44, 4))[1];
    $firstDirSector = unpack('V', substr($raw, 48, 4))[1];
    $miniCutoff = unpack('V', substr($raw, 56, 4))[1];
    $firstMiniFatSector = unpack('V', substr($raw, 60, 4))[1];
    $numMiniFatSectors = unpack('V', substr($raw, 64, 4))[1];
    $firstDifatSector = unpack('V', substr($raw, 68, 4))[1];
    $numDifatSectors = unpack('V', substr($raw, 72, 4))[1];
    $sectorSize = 1 << $sectorShift;
    $miniSectorSize = 1 << $miniSectorShift;
    if ($sectorSize < 512 || $len < 512 + $sectorSize * 2) { return null; }

    // 读取 DIFAT：前 109 个直接给出 + 额外 DIFAT 扇区链
    $difat = [];
    $maxSector = intdiv($len, $sectorSize);
    for ($i = 0; $i < 109; $i++) {
        $v = unpack('V', substr($raw, 76 + $i * 4, 4))[1];
        if ($v < $maxSector) { $difat[] = $v; }
    }
    $difatSector = $firstDifatSector;
    $guard = 0;
    while ($difatSector !== 0xFFFFFFFE && $difatSector !== 0xFFFFFFFF && $difatSector < $maxSector && $guard < $numDifatSectors + 2 && $guard < 64) {
        $off = 512 + $difatSector * $sectorSize;
        if ($off + $sectorSize > $len) { break; }
        $chunk = substr($raw, $off, $sectorSize);
        $n = intdiv($sectorSize, 4) - 1;
        for ($i = 0; $i < $n; $i++) {
            $v = unpack('V', substr($chunk, $i * 4, 4))[1];
            if ($v < $maxSector) { $difat[] = $v; }
        }
        $difatSector = unpack('V', substr($chunk, $n * 4, 4))[1];
        $guard++;
    }

    // 读取 FAT
    $fat = [];
    foreach ($difat as $fs) {
        $off = 512 + $fs * $sectorSize;
        if ($off + $sectorSize > $len) { continue; }
        $chunk = substr($raw, $off, $sectorSize);
        $n = intdiv($sectorSize, 4);
        for ($i = 0; $i < $n; $i++) {
            $fat[] = unpack('V', substr($chunk, $i * 4, 4))[1];
        }
    }

    $readChain = function ($startSector) use ($raw, $len, $fat, $sectorSize) {
        $out = '';
        $s = $startSector;
        $guard = 0;
        while ($s !== 0xFFFFFFFE && $s !== 0xFFFFFFFF && $s < count($fat) && $s >= 0 && $guard < 100000) {
            $off = 512 + $s * $sectorSize;
            if ($off + $sectorSize > $len) { break; }
            $out .= substr($raw, $off, $sectorSize);
            $s = isset($fat[$s]) ? $fat[$s] : 0xFFFFFFFE;
            $guard++;
        }
        return $out;
    };

    // 目录
    $dirStream = $readChain($firstDirSector);
    if ($dirStream === '') { return null; }
    $entries = [];
    $nEntries = intdiv(strlen($dirStream), 128);
    $targetStream = null;
    for ($i = 0; $i < $nEntries; $i++) {
        $e = substr($dirStream, $i * 128, 128);
        $name = '';
        $nameLen = unpack('v', substr($e, 64, 2))[1];
        if ($nameLen > 0) {
            $nameRaw = substr($e, 0, $nameLen - 2);
            $name = mb_convert_encoding($nameRaw, 'UTF-8', 'UTF-16LE');
        }
        $type = ord($e[66]);
        $start = unpack('V', substr($e, 116, 4))[1];
        $size = unpack('V', substr($e, 120, 4))[1];
        if ($type === 2) { // stream
            if ($name === 'Workbook' || $name === 'Book') {
                $targetStream = ['start' => $start, 'size' => $size];
                break;
            }
        }
    }
    if ($targetStream === null) { return null; }

    if ($targetStream['size'] < $miniCutoff) {
        // 小型流：需先从 Root Entry 取 mini stream，再用 mini FAT
        $rootStart = null; $rootSize = 0;
        for ($i = 0; $i < $nEntries; $i++) {
            $e = substr($dirStream, $i * 128, 128);
            if (ord($e[66]) === 5) { // root
                $rootStart = unpack('V', substr($e, 116, 4))[1];
                $rootSize = unpack('V', substr($e, 120, 4))[1];
                break;
            }
        }
        if ($rootStart !== null) {
            $miniStream = $readChain($rootStart);
            // mini FAT
            $miniFat = [];
            $mfs = $firstMiniFatSector;
            $guard = 0;
            while ($mfs !== 0xFFFFFFFE && $mfs !== 0xFFFFFFFF && $mfs < count($fat) && $guard < 100) {
                $off = 512 + $mfs * $sectorSize;
                $chunk = substr($raw, $off, $sectorSize);
                $n = intdiv($sectorSize, 4);
                for ($k = 0; $k < $n; $k++) { $miniFat[] = unpack('V', substr($chunk, $k * 4, 4))[1]; }
                $mfs = isset($fat[$mfs]) ? $fat[$mfs] : 0xFFFFFFFE;
                $guard++;
            }
            $out = '';
            $s = $targetStream['start'];
            $guard = 0;
            while ($s !== 0xFFFFFFFE && $s !== 0xFFFFFFFF && $guard < 100000) {
                $off = $s * $miniSectorSize;
                $out .= substr($miniStream, $off, $miniSectorSize);
                $s = isset($miniFat[$s]) ? $miniFat[$s] : 0xFFFFFFFE;
                $guard++;
            }
            return substr($out, 0, $targetStream['size']);
        }
    }
    return $readChain($targetStream['start']);
}

/* -------- BIFF8 记录解析（基础子集） -------- */

function io_biff8_parse($stream) {
    $rows = [];
    $pos = 0;
    $len = strlen($stream);
    $sst = [];           // 共享字符串表
    $currentRow = null;  // ['row'=>int, 'cells'=>[col=>val]]
    $rowNum = 0;
    $guard = 0;

    $commitRow = function () use (&$rows, &$currentRow, &$rowNum) {
        if ($currentRow !== null) {
            // 补齐列
            $maxCol = 0;
            foreach (array_keys($currentRow['cells']) as $c) { $maxCol = max($maxCol, $c); }
            $vals = [];
            for ($c = 0; $c <= $maxCol; $c++) { $vals[] = isset($currentRow['cells'][$c]) ? $currentRow['cells'][$c] : ''; }
            $rows[] = $vals;
            $currentRow = null;
        }
    };

    while ($pos + 4 <= $len && $guard++ < 200000) {
        $opcode = unpack('v', substr($stream, $pos, 2))[1];
        $rlen = unpack('v', substr($stream, $pos + 2, 2))[1];
        $pos += 4;
        if ($pos + $rlen > $len) { break; }
        $data = substr($stream, $pos, $rlen);
        $pos += $rlen;

        switch ($opcode) {
            case 0x00FC: // SST
                if ($rlen >= 8) {
                    $p = 8;
                    $n = unpack('V', substr($data, 4, 4))[1];
                    for ($i = 0; $i < $n && $p + 3 <= $rlen; $i++) {
                        $cch = unpack('v', substr($data, $p, 2))[1];
                        $flags = ord($data[$p + 2]);
                        $need = ($flags & 0x01) ? $cch * 2 : $cch;
                        if ($cch > 4000 || $p + 3 + $need > $rlen) {
                            // 可能命中了上一字符串后的 1 字节规范对齐位：跳过该 pad 重读
                            if ($p + 4 <= $rlen) {
                                $p += 1;
                                $cch = unpack('v', substr($data, $p, 2))[1];
                                $flags = ord($data[$p + 2]);
                                $need = ($flags & 0x01) ? $cch * 2 : $cch;
                                if ($cch > 4000 || $p + 3 + $need > $rlen) { break; }
                            } else { break; }
                        }
                        $p += 3;
                        $is16 = ($flags & 0x01) === 0x01;
                        if ($is16) {
                            $s = substr($data, $p, $cch * 2);
                            $s = mb_convert_encoding($s, 'UTF-8', 'UTF-16LE');
                            $p += $cch * 2;
                        } else {
                            $s = substr($data, $p, $cch);
                            $p += $cch;
                        }
                        // rich text / asian phonetic 附加字节
                        if ($flags & 0x08) { $p += 4; }
                        if ($flags & 0x04) { $p += 2; }
                        $sst[] = $s;
                    }
                }
                break;
            case 0x0200: // DIMENSIONS
                $rowNum = unpack('v', substr($data, 0, 2))[1];
                break;
            case 0x020B: // INDEX
                break;
            case 0x0000: // DIMENSION(older)
                break;
            case 0x0208: // ROW
                break;
            case 0x027E: // RK
                if ($rlen >= 10) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    $rk = unpack('V', substr($data, 6, 4))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $currentRow['cells'][$c] = io_rk_value($rk);
                }
                break;
            case 0x00BD: // MULRK
                if ($rlen >= 8) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $cFirst = unpack('v', substr($data, 2, 2))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $n = intdiv($rlen - 6, 6);
                    for ($i = 0; $i < $n; $i++) {
                        $rk = unpack('V', substr($data, 4 + $i * 6, 4))[1];
                        $currentRow['cells'][$cFirst + $i] = io_rk_value($rk);
                    }
                }
                break;
            case 0x0203: // NUMBER
                if ($rlen >= 14) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $d = unpack('d', substr($data, 6, 8))[1];
                    $currentRow['cells'][$c] = io_num_str($d);
                }
                break;
            case 0x00FD: // LABELSST
                if ($rlen >= 10) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    $idx = unpack('V', substr($data, 6, 4))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $currentRow['cells'][$c] = isset($sst[$idx]) ? $sst[$idx] : '';
                }
                break;
            case 0x0204: // LABEL (BIFF8 仍可能遇到)
                if ($rlen >= 6) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    $cch = unpack('v', substr($data, 6, 2))[1];
                    $flags = ord($data[8]);
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $str = substr($data, 9, $cch * (($flags & 0x01) ? 2 : 1));
                    $currentRow['cells'][$c] = ($flags & 0x01) ? mb_convert_encoding($str, 'UTF-8', 'UTF-16LE') : $str;
                }
                break;
            case 0x0006: // FORMULA：取缓存值（前 8 字节）
                if ($rlen >= 14) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $b = substr($data, 6, 8);
                    if ($b[0] === "\xFF" && $b[1] === "\xFF") {
                        // 特殊结果：字符串/布尔/错误
                        $currentRow['cells'][$c] = '';
                    } else {
                        $d = unpack('d', $b)[1];
                        $currentRow['cells'][$c] = io_num_str($d);
                    }
                }
                break;
            case 0x0205: // BOOLERR
                if ($rlen >= 9) {
                    $r = unpack('v', substr($data, 0, 2))[1];
                    $c = unpack('v', substr($data, 2, 2))[1];
                    if ($currentRow === null || $currentRow['row'] !== $r) { $commitRow(); $currentRow = ['row' => $r, 'cells' => []]; }
                    $bval = ord($data[6]);
                    $currentRow['cells'][$c] = $bval === 0 ? 'FALSE' : 'TRUE';
                }
                break;
            case 0x000A: // EOF：一个 sheet 结束；首个含数据的工作表即为目标
                $commitRow();
                if (!empty($rows)) { break 2; }
                break;
            case 0x0009: // BOF：跳到下一工作表? 简单处理：忽略
                break;
            default:
                break;
        }
    }
    $commitRow();
    // 去除空行
    $rows = array_values(array_filter($rows, function ($r) {
        foreach ($r as $v) { if (trim((string)$v) !== '') { return true; } }
        return false;
    }));
    if (!$rows) { return ['header' => [], 'rows' => [], 'error' => null]; }
    return io_header_from_rows($rows);
}

/** RK 数值解码 */
function io_rk_value($rk) {
    $isInt = ($rk & 0x02) === 0x02;
    $isDiv100 = ($rk & 0x01) === 0x01;
    if ($isInt) {
        $v = ($rk >> 2) & 0x3FFFFFFF;
        if ($rk & 0x80000000) { $v -= 0x40000000; } // 有符号
        $v = ($rk & 0x80000000) ? ($v - 0x40000000) : $v;
        // 上面的做法不严谨，用标准方式：
        $v = ($rk >> 2);
        if ($rk & 0x80000000) { $v -= 0x40000000; }
        if ($isDiv100) { return io_num_str($v / 100); }
        return io_num_str($v);
    } else {
        $d = unpack('d', pack('V', $rk) . "\x00\x00\x00\x00")[1];
        // RK 浮点：前 30 位为尾数高30位（去掉2个标志位）
        $raw = $rk & 0xFFFFFFFC;
        $u64 = (($raw & 0xFFFFFFFF) << 0) | 0; // 低位
        // 标准解码：64位 = raw << 32 ? 不对。RK 存 double 的高 30 位
        $bytes = pack('V', $raw) . "\x00\x00\x00\x00";
        $d = unpack('d', $bytes)[1];
        if ($isDiv100) { return io_num_str($d / 100); }
        return io_num_str($d);
    }
}

/* ==================== 导入入口 ==================== */

/**
 * 解析上传文件为表头+行数据
 * @param string $tmpPath 上传文件临时路径
 * @param string $ext     扩展名（csv/xlsx/xls）
 * @return array{header:array, rows:array, error:?string}
 */
function io_parse_import($tmpPath, $ext) {
    $ext = strtolower(ltrim((string)$ext, '.'));
    if (!is_file($tmpPath)) { return ['header' => [], 'rows' => [], 'error' => '上传文件不存在']; }
    switch ($ext) {
        case 'csv':
            return io_parse_csv_file($tmpPath);
        case 'xlsx':
            return io_parse_xlsx_file($tmpPath);
        case 'xls':
            return io_parse_xls_file($tmpPath);
        default:
            return ['header' => [], 'rows' => [], 'error' => '不支持的导入格式: ' . $ext . '（仅支持 csv / xlsx / xls）'];
    }
}

/* ==================== 通用导入结果整理 ==================== */

/** 第一行作表头，其余作数据 */
function io_header_from_rows($rows) {
    if (!$rows) { return ['header' => [], 'rows' => [], 'error' => null]; }
    $header = array_map('io_to_utf8', array_values($rows[0]));
    $data = [];
    for ($i = 1; $i < count($rows); $i++) {
        $data[] = array_map('io_to_utf8', array_values($rows[$i]));
    }
    return ['header' => $header, 'rows' => $data, 'error' => null];
}

/* ==================== 通用导入执行辅助 ==================== */

/**
 * 解析上传文件并返回标准结构（兼容各模块 import action）
 * @param string|null $tmpPath 上传临时文件
 * @param string      $ext     扩展名（csv/xlsx/xls，可带点）
 * @return array{header:array, rows:array, error:?string}
 */
function io_parse_upload(?string $tmpPath, string $ext): array {
    if (empty($_FILES['file'])) {
        return ['header' => [], 'rows' => [], 'error' => '未接收到上传文件（字段名应为 file）'];
    }
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $msg = match ($file['error']) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => '上传文件超过大小限制',
            UPLOAD_ERR_PARTIAL => '文件上传不完整',
            UPLOAD_ERR_NO_FILE => '未选择文件',
            default => '文件上传失败（错误码 ' . $file['error'] . '）',
        };
        return ['header' => [], 'rows' => [], 'error' => $msg];
    }
    if (($file['size'] ?? 0) > 10 * 1024 * 1024) {
        return ['header' => [], 'rows' => [], 'error' => '文件超过 10MB 大小限制'];
    }
    return io_parse_import($file['tmp_name'], $ext);
}

/**
 * 将导入表头（中文列名）映射为字段键，并检查必填列是否齐全
 * @param array $header       解析出的表头（中文）
 * @param array $columnMap    中文列名 => ['field'=>字段键, 'required'=>bool]
 * @return array{colIndex:array, missing:array} colIndex: 字段键=>列索引（缺失可选列为 -1）
 */
function io_map_columns(array $header, array $columnMap): array {
    $colIndex = [];
    $headerNorm = array_map(function ($h) { return trim((string)$h); }, $header);
    $missing = [];
    foreach ($columnMap as $cn => $spec) {
        $idx = array_search($cn, $headerNorm, true);
        if ($idx !== false) {
            $colIndex[$spec['field']] = $idx;
        } elseif (!empty($spec['required'])) {
            $missing[] = $cn;
        } else {
            // 可选列缺失：占位 -1，io_extract_row 统一返回默认空串，
            // 避免调用方访问未定义数组键产生 Warning 污染 JSON 响应
            $colIndex[$spec['field']] = -1;
        }
    }
    return ['colIndex' => $colIndex, 'missing' => $missing];
}

/**
 * 从一行导入数据中按列索引映射提取字段值
 * @param array $row       行数据（索引数组）
 * @param array $colIndex  io_map_columns 返回的字段键=>列索引（-1 表示缺列）
 * @return array 字段键=>值
 */
function io_extract_row(array $row, array $colIndex): array {
    $out = [];
    foreach ($colIndex as $field => $idx) {
        $out[$field] = ($idx >= 0 && isset($row[$idx])) ? trim((string)$row[$idx]) : '';
    }
    return $out;
}

/**
 * 按学生姓名查找学生 id（名称可能重复，取范围外一律不返回）
 * @param PDO  $pdo
 * @param string $name
 * @return int 命中唯一在读学生返回 id，否则 0
 */
function io_lookup_student_by_name(PDO $pdo, string $name): int {
    $name = trim($name);
    if ($name === '') { return 0; }
    $stmt = $pdo->prepare('SELECT id FROM students WHERE name = ? AND deleted_at IS NULL AND status = "在读" ORDER BY id DESC LIMIT 2');
    $stmt->execute([$name]);
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (count($rows) === 1) { return intval($rows[0]); }
    return 0; // 0 或重复名 → 需明确报错，避免误导入
}

/**
 * 按班级名称查找班级 id（名称应唯一）
 */
function io_lookup_class_by_name(PDO $pdo, string $name): int {
    $name = trim($name);
    if ($name === '') { return 0; }
    $stmt = $pdo->prepare('SELECT id FROM student_classes WHERE name = ? LIMIT 1');
    $stmt->execute([$name]);
    $id = intval($stmt->fetchColumn());
    return $id > 0 ? $id : 0;
}

/**
 * 按障碍类型名称查找 dict_disability_types id
 */
function io_lookup_disability_by_name(PDO $pdo, string $name): int {
    $name = trim($name);
    if ($name === '') { return 0; }
    $stmt = $pdo->prepare('SELECT id FROM dict_disability_types WHERE name = ? LIMIT 1');
    $stmt->execute([$name]);
    $id = intval($stmt->fetchColumn());
    return $id > 0 ? $id : 0;
}

/**
 * 将日期字符串规范化为 YYYY-MM-DD，空串返回 null，非法返回 false
 */
function io_normalize_date(string $v) {
    $v = trim($v);
    if ($v === '') { return null; }
    // 兼容 2024/1/5、2024-1-5、2024.1.5
    $v = str_replace(['/', '.'], '-', $v);
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $v, $m)) {
        $y = (int)$m[1]; $mo = (int)$m[2]; $d = (int)$m[3];
        if (checkdate($mo, $d, $y)) { return sprintf('%04d-%02d-%02d', $y, $mo, $d); }
    }
    return false;
}

/*__IO_NEXT__*/
