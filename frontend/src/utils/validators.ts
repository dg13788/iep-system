/**
 * 学生档案敏感字段校验规范（2026-10-15 新增，与后端 students.php 同口径）
 *
 * 背景：「新增学生」此前对身份证号与各类电话只校验「非空」，
 * 错号、少位、假号都能落库，后续学籍上报/家校联系全是坑。
 * 前后端同一套规则，后端为权威（前端只为即时反馈）。
 */

/** 18 位身份证校验位字符表（GB 11643-1999 加权模 11 算法） */
const ID_CHECK_CHARS = '10X98765432';
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];

/** 中国电话：手机号 1[3-9]xxxxxxxxx，或带区号固话 0xx-xxxxxxx / 0xxx-xxxxxxxx */
const PHONE_RE = /^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/;

/** 身份证中的出生日期是否真实存在且不在未来 */
function idBirthValid(id: string): boolean {
  let y: number, m: number, d: number;
  if (id.length === 18) {
    y = Number(id.slice(6, 10));
    m = Number(id.slice(10, 12));
    d = Number(id.slice(12, 14));
  } else {
    // 15 位旧版：出生日期为 6 位 YYMMDD，世纪按 19xx 解释
    y = 1900 + Number(id.slice(6, 8));
    m = Number(id.slice(8, 10));
    d = Number(id.slice(10, 12));
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  return dt.getTime() <= Date.now();
}

/** 18 位校验位是否正确 */
function id18ChecksumOk(id: string): boolean {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = id.charCodeAt(i);
    if (c < 48 || c > 57) return false; // 前 17 位必须全是数字
    sum += (c - 48) * ID_WEIGHTS[i];
  }
  return ID_CHECK_CHARS[sum % 11] === id[17].toUpperCase();
}

/**
 * 身份证号是否合法：18 位（含校验位）或 15 位旧版（纯数字），出生日期真实。
 * 空值视为「未填写」——由调用方决定是否必填，此处不判。
 */
export function isValidIdCard(v: string): boolean {
  const s = (v || '').trim();
  if (!s) return false;
  if (/^\d{15}$/.test(s)) return idBirthValid(s);
  if (/^\d{17}[\dXx]$/.test(s)) return id18ChecksumOk(s) && idBirthValid(s);
  return false;
}

/** 身份证号字段级错误文案（空 = 通过） */
export function idCardError(v: string): string | null {
  const s = (v || '').trim();
  if (!s) return null;
  if (isValidIdCard(s)) return null;
  return '身份证号格式不正确（18 位居民身份证，末位可为 X；或 15 位旧版编号）';
}

/** 电话是否合法：手机号或带区号固话。空值由调用方判必填。 */
export function isValidPhone(v: string): boolean {
  return PHONE_RE.test((v || '').trim());
}

/** 电话字段级错误文案（空 = 通过） */
export function phoneError(v: string): string | null {
  const s = (v || '').trim();
  if (!s) return null;
  if (isValidPhone(s)) return null;
  return '电话格式不正确（手机号 11 位，或带区号固话如 0755-1234567）';
}

/** 提交前规范化：身份证号统一大写（末位 X 小写落库后与纸质件不一致） */
export function normalizeIdCard(v: string): string {
  return (v || '').trim().toUpperCase();
}
