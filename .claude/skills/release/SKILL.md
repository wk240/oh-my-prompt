---
name: release
description: >
  发布 Oh My Prompt 新版本到 GitHub Release。MUST trigger when the user says:
  "release", "发布", "publish", "发布版本", "发版", "上线", "release version",
  "新版本", "推送版本", "/release", "/publish", or asks about how to release
  a new version of the extension. Handles version bump, build, zip packaging,
  and GitHub release creation with auto-generated release notes.
---

# Oh My Prompt 发布流程

> 自动化 Chrome 扩展版本发布到 GitHub Release。

## 概述

本 Skill 管理 Oh My Prompt Chrome 扩展的完整发布流程，从版本号更新到 GitHub Release 创建。

**完整流程**：
```
确认版本 → 预览说明 → CHANGELOG → version → git commit → release → github-release
    ↓         ↓         ↓          ↓          ↓           ↓            ↓
  输入版本   用户确认   同步变更记录  更新版本号  提交更改    构建打包zip   发布到GitHub
```

## 前置条件检查

发布前必须确认：

| 条件 | 检查命令 | 失败处理 |
|------|----------|----------|
| gh CLI 已安装 | `gh --version` | 安装: https://cli.github.com/ |
| gh CLI 已认证 | `gh auth status` | 运行: `gh auth login` |
| git 状态干净 | `git status --porcelain` | 先提交更改 |
| 在 master 分支 | `git branch --show-current` | 切换到 master |

## 执行流程

### 第一步：确认版本信息

1. 询问用户要发布的版本号（如 `v1.4.0`）
2. 检查当前版本：
   - 读取 `manifest.json` 的 `version` 字段
   - 读取 `package.json` 的 `version` 字段
3. 验证新版本号 > 当前版本

**版本号格式**：
- 输入支持：`v1.4.0`, `v1-4-0`, `1.4.0`, `1-4-0`
- 内部统一：`x.y.z`（3位）

### 第二步：预览发布说明（用户确认）

**重要**：此步骤必须在执行任何更改前完成，确保用户对发布内容有充分了解。

1. **获取变更范围**：
   ```bash
   # 获取上一个 tag
   git describe --tags --abbrev=0 HEAD^

   # 获取 commits 范围（如果无上一个 tag，使用 HEAD~10）
   git log <last-tag>..HEAD --oneline --no-merges
   ```

2. **生成 Release Notes**：
   - 按类型分组 commits：feat, fix, refactor, docs, chore, perf, test
   - 使用 emoji 标识类型：
     - feat → 🚀 Features
     - fix → 🐛 Bug Fixes
     - refactor → 🔧 Refactor
     - docs → 📚 Docs
     - chore → 📦 Chores
     - perf → ⚡ Performance
     - test → 🧪 Tests

   **格式示例**：
   ```markdown
   ## What's Changed

   ### 🚀 Features
   - feat: 添加新功能 A
   - feat: 支持平台 B

   ### 🐛 Bug Fixes
   - fix: 修复问题 C

   ### 📦 Chores
   - chore: bump version to v1.4.0
   ```

3. **用户确认**：
   使用 AskUserQuestion 展示生成的 release notes，让用户确认：
   - 选项1：确认发布（继续执行）
   - 选项2：修改说明（用户提供修改内容）
   - 选项3：取消发布（终止流程）

   **注意**：用户确认后才开始执行版本号更新等操作。

### 第三步：同步 CHANGELOG.md

**重要**：CHANGELOG.md 必须在版本号更新前同步，确保版本记录完整。

1. **读取当前 CHANGELOG.md** 确认最新版本记录

2. **检查是否需要更新**：
   - 如果 CHANGELOG 最新版本 < 新版本号 → 需要添加新版本记录
   - 如果 CHANGELOG 最新版本 == 新版本号 → 跳过此步骤

3. **生成 CHANGELOG 条目**：
   - 使用与 Release Notes 相同的 commit 分组
   - **双语格式**（项目约定）：
     ```markdown
     ## [1.4.0] - 2026-05-08

     ### Added / 新增
     - **[EN]** Release skill for GitHub release workflow
     - **[CN]** 发布技能自动化 GitHub Release 流程

     ### Fixed / 修复
     - **[EN]** Pre-cache folder handle to preserve user gesture
     - **[CN]** 预缓存文件夹句柄以保留用户手势

     ### Changed / 变更
     - **[EN]** Removed deprecated popup pages
     - **[CN]** 移除废弃的 popup 页面
     ```

4. **使用 Edit 工具更新 CHANGELOG.md**：
   - 在文件开头（`# Changelog` 标题后）插入新版本条目
   - 保持双语格式一致性

### 第四步：版本号同步

运行版本更新脚本：

```bash
npm run version <new-version>
```

此脚本会更新：
- `package.json` — npm 版本
- `manifest.json` — Chrome 扩展版本
- `VERSION` — 版本文件（如存在）
- `BUILD.md` — 文档中的版本引用
- `package-lock.json` — 自动同步

### 第五步：Git 提交

提交版本号更改：

```bash
git add package.json manifest.json package-lock.json VERSION BUILD.md CHANGELOG.md
git commit -m "chore: bump version to v<版本号>"
```

如果用户需要，可额外提交其他更改。

### 第六步：构建与打包

运行构建打包脚本：

```bash
npm run release
```

此脚本会：
1. 检查版本号一致性
2. 执行 `npm run build` 构建生产版本
3. 打包 `dist/` 为 `releases/oh-my-prompt-v{版本号}.zip`

**输出位置**：`releases/oh-my-prompt-v{版本号}.zip`

### 第七步：GitHub Release

运行 GitHub 发布脚本：

```bash
npm run github-release
```

此脚本会：
1. 检查前置条件（git clean、gh CLI）
2. 创建 git tag（如不存在）
3. 推送 tag 到 GitHub
4. 自动生成 release notes（从 commits）
5. 创建 GitHub Release 并上传 zip

**Release Notes 格式**：
```markdown
## What's Changed

### 🚀 Features
- feat: 添加新功能 A
- feat: 支持平台 B

### 🐛 Bug Fixes
- fix: 修复问题 C

### 📦 Chores
- chore: bump version to v1.4.0
```

### 第八步：后续操作提示

发布完成后提示用户：

```
✓ GitHub Release 发布完成！

Release 地址: https://github.com/xxx/oh-my-prompt/releases/tag/v1.4.0

下一步:
  1. 在 Chrome Web Store 上传 zip 文件
  2. 更新 Store 的版本说明
```

## 快速模式

如果用户只说"发布"或"/release"且当前版本已准备好：

1. 直接检查 git 状态
2. 直接运行 `npm run github-release`
3. 跳过版本号更新步骤

## 回滚处理

如果发布失败：

| 失败阶段 | 回滚操作 |
|----------|----------|
| 版本号更新后 | `git checkout -- package.json manifest.json package-lock.json` |
| Git commit 后 | `git reset --soft HEAD~1` |
| Tag 创建后 | `git tag -d v<版本号>; git push origin --delete v<版本号>` |
| Release 创建后 | `gh release delete v<版本号>` |

## 命令速查

| 命令 | 用途 |
|------|------|
| `npm run version v1.4.0` | 更新版本号 |
| `npm run release` | 构建并打包 zip |
| `npm run github-release` | 发布到 GitHub |
| `npm run publish` | 同上（别名） |

## 文件清单

发布涉及的文件：

```
package.json          # npm 版本
manifest.json         # Chrome 扩展版本
package-lock.json     # 锁文件
VERSION               # 版本记录（可选）
BUILD.md              # 文档引用（可选）
CHANGELOG.md          # 版本变更记录（重要）
dist/                 # 构建输出
releases/             # zip 输出目录
.claude/skills/release/scripts/
  version.ts          # 版本更新脚本
  release.ts          # 构建打包脚本
  github-release.ts   # GitHub 发布脚本
```

## 自检清单

发布前：
- [ ] gh CLI 已安装并认证
- [ ] git 状态干净
- [ ] 在 master 分支
- [ ] 版本号已确认
- [ ] CHANGELOG.md 已同步

发布后：
- [ ] GitHub Release 已创建
- [ ] zip 文件已上传为 asset
- [ ] tag 已推送
- [ ] release notes 已生成
- [ ] CHANGELOG.md 版本记录已添加