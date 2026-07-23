// 何を: ユーザー入力パスを LIBRARY_ROOT 配下に限定する防御関数
// なぜ: §35.4 — パストラバーサル（../ / %2F%2E%2E / 絶対パス）を構造的に排除
import path from 'node:path';

/**
 * rel を LIBRARY_ROOT 配下の絶対パスに解決する。
 * 境界外の場合は null を返す（呼び出し元が 403 を返すこと）。
 * @param {string} libraryRoot - 絶対パスの書庫ルート
 * @param {string} rel - クライアントから受け取った相対パス
 * @returns {string|null} 安全な絶対パス、または null
 */
export function resolveSafe(libraryRoot, rel) {
  if (typeof rel !== 'string' || !rel) return null;
  // null バイト防御
  if (rel.includes('\0')) return null;
  // URL エンコードデコード（%2F%2E%2E 等の遡上を防ぐ）
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  // 二重エンコード防御（%252F 等）
  if (decoded.includes('%')) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }
  // Windows ドライブレター・UNC パスの明示拒否
  // （Linux では path.resolve が "C:\..." を相対パスとして扱い root 内に解決してしまうため）
  if (/^[a-zA-Z]:[\\/]/.test(decoded) || decoded.startsWith('\\\\')) return null;
  const root = path.resolve(libraryRoot);
  const abs = path.resolve(root, decoded);
  // root の外（root 自体は許可、root/../ は拒否）
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}
