#!/usr/bin/env node
/**
 * 版本更新脚本
 *
 * 用法: npm run version <new-version>
 * 例如: npm run version v1.4.0
 *       npm run version v1-4-0
 *
 * 功能：
 * 同步更新所有版本号位置（统一 x.y.z 格式）：
 * 1. package.json
 * 2. manifest.json
 * 3. VERSION 文件
 * 4. BUILD.md 文档引用
 * 5. package-lock.json（自动更新）
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/version.ts -> release/ -> skills/ -> .claude/ -> project root
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');
const extensionDir = path.join(rootDir, 'packages', 'extension');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath: string, data: object) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * 解析版本号，支持多种格式：
 * - v1.3.9 -> [1, 3, 9]
 * - v1-3-9 -> [1, 3, 9]
 * - 1.3.9 -> [1, 3, 9]
 * - 1-3-9 -> [1, 3, 9]
 */
function parseVersion(input: string): string[] | null {
  // 移除 v 前缀
  let version = input.startsWith('v') ? input.slice(1) : input;

  // 支持点号或连分隔符
  const parts = version.split(/[.-]/);

  if (parts.length < 3 || parts.length > 4) return null;
  if (!parts.every(p => /^\d+$/.test(p))) return null;

  return parts;
}

/**
 * 更新文件中的版本号引用
 */
function updateVersionInFile(filePath: string, oldVersion: string, newVersion: string): boolean {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(
    new RegExp(oldVersion.replace(/\./g, '\\.'), 'g'),
    newVersion
  );

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    return true;
  }
  return false;
}

function main() {
  const inputVersion = process.argv[2];

  if (!inputVersion) {
    log('red', '错误: 请提供版本号');
    log('cyan', '用法: npm run version <new-version>');
    log('cyan', '例如: npm run version v1.4.0');
    log('cyan', '      npm run version v1-4-0');
    process.exit(1);
  }

  const parts = parseVersion(inputVersion);

  if (!parts) {
    log('red', `错误: 版本号格式无效 "${inputVersion}"`);
    log('cyan', '版本号格式应为: vx.y.z 或 vx-y-z (例如 v1.4.0 或 v1-4-0)');
    process.exit(1);
  }

  // 统一使用 x.y.z 格式
  const version = parts.slice(0, 3).join('.');
  const displayVersion = `v${version}`;

  log('cyan', `\n更新版本号: ${displayVersion}\n`);

  const updatedFiles: string[] = [];

  // 1. 更新 package.json
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = readJson(pkgPath);
  const oldPackageVersion = pkg.version;
  pkg.version = version;
  writeJson(pkgPath, pkg);
  log('green', `✓ package.json: ${oldPackageVersion} → ${version}`);
  updatedFiles.push('package.json');

  // 2. 更新 extension package.json
  const extensionPkgPath = path.join(extensionDir, 'package.json');
  const extensionPkg = readJson(extensionPkgPath);
  const oldExtensionPackageVersion = extensionPkg.version;
  extensionPkg.version = version;
  writeJson(extensionPkgPath, extensionPkg);
  log('green', `✓ packages/extension/package.json: ${oldExtensionPackageVersion} → ${version}`);
  updatedFiles.push('packages/extension/package.json');

  // 3. 更新 manifest.json (在 packages/extension/ 目录下)
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  const oldManifestVersion = manifest.version;
  manifest.version = version;
  writeJson(manifestPath, manifest);
  log('green', `✓ packages/extension/manifest.json: ${oldManifestVersion} → ${version}`);
  updatedFiles.push('packages/extension/manifest.json');

  // 4. 更新 VERSION 文件
  const versionPath = path.join(rootDir, 'VERSION');
  if (fs.existsSync(versionPath)) {
    const oldVersionContent = fs.readFileSync(versionPath, 'utf-8').trim();
    fs.writeFileSync(versionPath, version + '\n');
    log('green', `✓ VERSION: ${oldVersionContent} → ${version}`);
    updatedFiles.push('VERSION');
  }

  // 5. 更新 BUILD.md 文档中的版本引用
  const buildMdPath = path.join(rootDir, 'BUILD.md');
  if (fs.existsSync(buildMdPath)) {
    // 同时更新可能的4位和3位版本号引用
    const oldVersion4 = oldPackageVersion; // 可能是4位格式
    const oldVersion3 = oldManifestVersion; // 3位格式
    let updated = false;

    // 先尝试更新旧版本号引用
    if (oldVersion4 !== version) {
      updated = updateVersionInFile(buildMdPath, oldVersion4, version) || updated;
    }
    if (oldVersion3 !== version) {
      updated = updateVersionInFile(buildMdPath, oldVersion3, version) || updated;
    }

    if (updated) {
      log('green', `✓ BUILD.md: 版本引用已更新`);
      updatedFiles.push('BUILD.md');
    }
  }

  // 6. 更新 package-lock.json
  log('cyan', `\n▶ 更新 package-lock.json...`);
  try {
    execSync('npm install --ignore-scripts', { stdio: 'inherit', cwd: rootDir });
    log('green', `✓ package-lock.json 已同步`);
    updatedFiles.push('package-lock.json');
  } catch (error) {
    log('yellow', `⚠ package-lock.json 更新失败，请手动运行 npm install`);
  }

  log('cyan', `\n========================================`);
  log('green', `✓ 版本号同步完成 (${updatedFiles.length} 个文件)`);
  log('cyan', `========================================\n`);

  log('cyan', `下一步:`);
  log('reset', `  1. git add ${updatedFiles.join(' ')}`);
  log('reset', `  2. git commit -m "chore: bump version to ${displayVersion}"`);
  log('reset', `  3. npm run release (构建并打包)\n`);
}

main();
