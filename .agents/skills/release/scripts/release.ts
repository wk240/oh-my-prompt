#!/usr/bin/env node
/**
 * 发布脚本 - 用于打包Chrome扩展
 *
 * 功能：
 * 1. 检查版本号一致性（manifest.json vs package.json）
 * 2. 构建生产版本
 * 3. 打包dist目录为zip文件（文件名带v前缀）
 * 4. 输出zip文件路径供上传Chrome Web Store
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/release.ts -> release/ -> skills/ -> .claude/ -> project root
const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

// ANSI颜色码
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

function runCommand(command: string, description: string): boolean {
  try {
    log('cyan', `▶ ${description}...`);
    execSync(command, { stdio: 'inherit', cwd: rootDir });
    log('green', `✓ ${description}完成`);
    return true;
  } catch (error) {
    log('red', `✗ ${description}失败`);
    return false;
  }
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath: string, data: object) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function checkVersions(): { manifestVersion: string; packageVersion: string } {
  const manifest = readJson(path.join(rootDir, 'manifest.json'));
  const pkg = readJson(path.join(rootDir, 'package.json'));

  // package.json版本格式: 1.3.5.0, manifest.json: 1.3.5
  const manifestVersion = manifest.version;
  const packageVersion = pkg.version.split('.').slice(0, 3).join('.');

  if (manifestVersion !== packageVersion) {
    log('yellow', `⚠ 版本号不一致:`);
    log('yellow', `  manifest.json: ${manifestVersion}`);
    log('yellow', `  package.json:  ${pkg.version}`);
    log('yellow', `  建议先运行: npm run version v<new-version>`);
  }

  return { manifestVersion, packageVersion: pkg.version };
}

function createZip(version: string): string {
  const distDir = path.join(rootDir, 'dist');
  const releasesDir = path.join(rootDir, 'releases');
  // 文件名格式: oh-my-prompt-v{版本号}.zip
  const zipName = `oh-my-prompt-v${version}.zip`;
  const zipPath = path.join(releasesDir, zipName);

  // 创建releases目录
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true });
  }

  // 检查dist目录是否存在
  if (!fs.existsSync(distDir)) {
    log('red', '✗ dist目录不存在，请先构建');
    return '';
  }

  // Windows使用PowerShell压缩
  const isWindows = process.platform === 'win32';
  const command = isWindows
    ? `powershell -Command "Compress-Archive -Path '${distDir}/*' -DestinationPath '${zipPath}' -Force"`
    : `cd "${distDir}" && zip -r "${zipPath}" .`;

  if (runCommand(command, '打包zip')) {
    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log('green', `✓ 打包完成: ${zipPath}`);
    log('cyan', `  文件大小: ${sizeMB} MB`);
    return zipPath;
  }
  return '';
}

function main() {
  log('cyan', '\n========================================');
  log('cyan', '    Oh My Prompt 发布流程');
  log('cyan', '========================================\n');

  // 1. 检查版本
  const { manifestVersion } = checkVersions();
  const displayVersion = `v${manifestVersion}`;
  log('green', `\n当前版本: ${displayVersion}\n`);

  // 2. 构建
  if (!runCommand('npm run build', '构建生产版本')) {
    process.exit(1);
  }

  // 3. 打包
  const zipPath = createZip(manifestVersion);
  if (!zipPath) {
    process.exit(1);
  }

  // 4. 输出下一步指引
  log('cyan', '\n========================================');
  log('green', '✓ 发布准备完成！');
  log('cyan', '========================================\n');
  log('yellow', '下一步操作:');
  log('reset', `  1. 上传zip到Chrome Web Store: ${zipPath}`);
  log('reset', `  2. 或在Chrome中加载测试: chrome://extensions`);
  log('reset', `     (开发者模式 -> 加载已解压的扩展程序 -> dist目录)\n`);
}

main();