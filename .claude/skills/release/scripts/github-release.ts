#!/usr/bin/env node
/**
 * GitHub Release 发布脚本
 *
 * 用法: npm run github-release
 *       npm run publish (别名)
 *
 * 前置条件:
 * 1. 已运行 npm run version <new-version>
 * 2. 已运行 npm run release (构建并打包)
 * 3. git 状态干净
 * 4. gh CLI 已安装并认证
 *
 * 功能:
 * 1. 检查前置条件
 * 2. 创建 git tag (如果不存在)
 * 3. 使用 gh CLI 创建 GitHub Release
 * 4. 上传 zip 文件作为 release asset
 * 5. 从 commits 自动生成 release notes
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/github-release.ts -> release/ -> skills/ -> .claude/ -> project root
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

function runCommand(command: string, description: string, options?: { ignoreError?: boolean }): boolean {
  try {
    log('cyan', `▶ ${description}...`);
    execSync(command, { stdio: 'inherit', cwd: rootDir });
    log('green', `✓ ${description}完成`);
    return true;
  } catch (error) {
    if (options?.ignoreError) {
      log('yellow', `⚠ ${description}跳过`);
      return false;
    }
    log('red', `✗ ${description}失败`);
    return false;
  }
}

function runCommandSilent(command: string): string {
  try {
    return execSync(command, { cwd: rootDir, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function checkGitStatus(): boolean {
  const status = runCommandSilent('git status --porcelain --ignore-submodules=dirty');
  if (status) {
    log('red', '✗ Git 状态不干净，请先提交更改');
    log('yellow', '未提交的文件:');
    console.log(status);
    return false;
  }
  return true;
}

function checkGhCli(): boolean {
  try {
    execSync('gh --version', { stdio: 'pipe', cwd: rootDir });
    return true;
  } catch {
    log('red', '✗ gh CLI 未安装');
    log('cyan', '安装: https://cli.github.com/');
    return false;
  }
}

function getZipPath(version: string): string | null {
  const releasesDir = path.join(rootDir, 'releases');
  const zipName = `oh-my-prompt-v${version}.zip`;
  const zipPath = path.join(releasesDir, zipName);

  if (fs.existsSync(zipPath)) {
    return zipPath;
  }
  return null;
}

function generateReleaseNotes(version: string): string {
  // 获取上一个 tag
  const lastTag = runCommandSilent('git describe --tags --abbrev=0 HEAD^');

  // 获取 commits 范围
  const commitRange = lastTag ? `${lastTag}..HEAD` : 'HEAD~10..HEAD';
  const commits = runCommandSilent(`git log ${commitRange} --oneline --no-merges`);

  if (!commits) {
    return `Release ${version}`;
  }

  // 格式化 release notes
  const lines = commits.split('\n').filter(Boolean);
  const formatted = lines.map(line => {
    // 提取 commit 类型和描述
    const match = line.match(/^(\w+): (.+)$/);
    if (match) {
      const [, type, desc] = match;
      const typeLabel: Record<string, string> = {
        feat: '🚀 Features',
        fix: '🐛 Bug Fixes',
        refactor: '🔧 Refactor',
        docs: '📚 Docs',
        chore: '📦 Chores',
        perf: '⚡ Performance',
        test: '🧪 Tests',
      };
      const label = typeLabel[type] || '📝 Other';
      return { label, desc };
    }
    return { label: '📝 Other', desc: line };
  });

  // 按类型分组
  const grouped: Record<string, string[]> = {};
  for (const { label, desc } of formatted) {
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(desc);
  }

  // 生成 markdown
  let notes = `## What's Changed\n\n`;
  for (const [label, items] of Object.entries(grouped)) {
    notes += `### ${label}\n`;
    for (const item of items) {
      notes += `- ${item}\n`;
    }
    notes += '\n';
  }

  return notes.trim();
}

function createRelease(version: string, zipPath: string): boolean {
  const tagName = `v${version}`;
  const releaseTitle = `Oh My Prompt ${tagName}`;

  // 检查 tag 是否已存在
  const existingTag = runCommandSilent(`git tag -l "${tagName}"`);
  if (existingTag) {
    log('yellow', `⚠ Tag ${tagName} 已存在`);
  } else {
    // 创建 tag
    if (!runCommand(`git tag ${tagName}`, '创建 git tag')) {
      return false;
    }
    // 推送 tag
    if (!runCommand(`git push origin ${tagName}`, '推送 tag 到 GitHub')) {
      return false;
    }
  }

  // 生成 release notes
  const releaseNotes = generateReleaseNotes(version);

  // 创建 release 并上传 asset
  const releaseCommand = `gh release create ${tagName} "${zipPath}" --title "${releaseTitle}" --notes "${releaseNotes}"`;

  if (!runCommand(releaseCommand, '创建 GitHub Release')) {
    // 如果 release 已存在，尝试更新
    log('yellow', '尝试更新已有 release...');
    const updateCommand = `gh release upload ${tagName} "${zipPath}" --clobber`;
    if (!runCommand(updateCommand, '上传 zip 文件', { ignoreError: true })) {
      return false;
    }
  }

  return true;
}

function main() {
  log('cyan', '\n========================================');
  log('cyan', '    GitHub Release 发布流程');
  log('cyan', '========================================\n');

  // 1. 检查 git 状态
  log('cyan', '▶ 检查前置条件...\n');
  if (!checkGitStatus()) {
    process.exit(1);
  }

  // 2. 检查 gh CLI
  if (!checkGhCli()) {
    process.exit(1);
  }

  // 3. 获取当前版本
  const manifest = readJson(path.join(extensionDir, 'manifest.json'));
  const version = manifest.version;
  const displayVersion = `v${version}`;
  log('green', `✓ 当前版本: ${displayVersion}\n`);

  // 4. 检查 zip 文件
  const zipPath = getZipPath(version);
  if (!zipPath) {
    log('red', `✗ zip 文件不存在: releases/oh-my-prompt-${displayVersion}.zip`);
    log('cyan', '请先运行: npm run release');
    process.exit(1);
  }
  log('green', `✓ 找到 zip: ${zipPath}\n`);

  // 5. 创建 release
  if (!createRelease(version, zipPath)) {
    process.exit(1);
  }

  // 6. 输出结果
  log('cyan', '\n========================================');
  log('green', '✓ GitHub Release 发布完成！');
  log('cyan', '========================================\n');

  const repoUrl = runCommandSilent('git remote get-url origin')
    .replace('git@github.com:', 'https://github.com/')
    .replace('.git', '');

  log('yellow', 'Release 地址:');
  log('reset', `  ${repoUrl}/releases/tag/${displayVersion}\n`);
  log('cyan', '下一步:');
  log('reset', `  1. 在 Chrome Web Store 上传 zip 文件`);
  log('reset', `  2. 更新 Store 的版本说明\n`);
}

main();
