# Team Sharing Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team sharing quick-start guide documentation at http://localhost:3000/docs/team-sharing

**Architecture:** Single Markdown file with gray-matter frontmatter, automatically rendered by existing docs system (gray-matter for metadata, marked for HTML conversion)

**Tech Stack:** Markdown, gray-matter, marked, Next.js App Router

---

## File Structure

**Create:**
- `packages/web-app/app/docs/content/team-sharing.md` - Team sharing quick-start guide

**No modifications needed:**
- Existing docs system (`page.tsx`, `lib.ts`, `[slug]/page.tsx`) will automatically handle new file

---

### Task 1: Create Team Sharing Documentation

**Files:**
- Create: `packages/web-app/app/docs/content/team-sharing.md`

- [ ] **Step 1: Create Markdown file with frontmatter and full content**

```markdown
---
title: 团队共享快速入门
description: 了解如何使用团队共享功能，与他人协作管理提示词
---

## 简介

团队共享功能让你可以与他人协作管理提示词。创建团队后，团队成员可以共享提示词，方便团队协作和知识沉淀。

适用场景：
- 设计团队共享常用提示词模板
- 多人协作维护提示词库
- 团队知识管理和传承

## 创建团队

**权限要求：** 任何登录用户都可以创建团队

1. 进入团队页面（http://localhost:3000/team）
2. 点击右上角"创建团队"按钮
3. 输入团队名称，点击确认

创建成功后，你自动成为团队的 owner（拥有者），拥有最高管理权限。

## 加入团队

团队成员可以通过两种方式加入团队。

### 通过邀请码加入

**权限要求：** 任何登录用户都可以通过邀请码加入

1. 获取团队的邀请码（由团队 owner 或 admin 提供）
2. 进入团队页面（http://localhost:3000/team）
3. 点击"加入团队"按钮
4. 输入邀请码，点击确认

加入成功后，你默认成为团队的 member（成员）。

### 通过邀请链接加入

**权限要求：** 任何登录用户都可以通过邀请链接加入

1. 收到邀请链接（由团队 owner 或 admin 发送）
2. 点击邀请链接
3. 在预览页面确认加入

加入成功后，你默认成为团队的 member（成员）。

## 查看团队提示词

加入团队后，你可以查看团队成员共享的提示词。

### 在 Web App 查看

1. 进入团队页面（http://localhost:3000/team）
2. 点击团队卡片进入团队详情
3. 查看"共享提示词"列表

### 在 Extension 查看

团队提示词会同步到 Extension 的下拉菜单中：

1. 在支持的平台输入框旁点击下拉菜单
2. 选择"团队提示词"分类
3. 选择需要的提示词插入

## 同步提示词到团队

**权限要求：** 所有团队成员都可以同步提示词到团队

你可以将自己创建的提示词共享到团队，让其他成员使用。

1. 在 Extension 侧边栏选择要共享的提示词
2. 点击提示词的"共享到团队"按钮
3. 选择目标团队
4. 确认共享

共享成功后，团队成员可以在团队提示词列表中看到这个提示词。

## 从团队导入提示词

你可以将团队提示词导入到自己的个人提示词库。

1. 在团队提示词列表中选择要导入的提示词
2. 点击"导入到个人"按钮
3. 确认导入

导入成功后，提示词会出现在你的个人分类中，你可以自由编辑和使用。

## 权限说明

团队有三种角色，权限不同：

| 角色 | 权限 |
|------|------|
| **owner**（拥有者） | 最高权限：删除团队、管理成员、刷新邀请码、更新团队设置、共享提示词 |
| **admin**（管理员） | 管理权限：邀请成员、更新团队设置、刷新邀请码、共享提示词 |
| **member**（成员） | 基础权限：查看团队提示词、共享提示词、导入提示词 |

创建团队的用户自动成为 owner。其他成员加入后默认为 member，可以由 owner 或 admin 升级为 admin。

## 管理团队成员

**权限要求：** 需要 owner 或 admin 权限

### 查看成员列表

1. 进入团队详情页面
2. 点击"成员管理"标签
3. 查看团队成员列表（包括角色和加入时间）

### 邀请新成员

有两种邀请方式：

**方式 1：分享邀请码**
1. 在团队详情页面查看或刷新邀请码
2. 将邀请码发送给要邀请的用户
3. 用户通过邀请码加入团队

**方式 2：直接邀请**
1. 在成员管理页面点击"邀请成员"
2. 输入用户的邮箱地址
3. 系统发送邀请链接给用户

### 刷新邀请码

如果邀请码泄露或需要更新，可以刷新邀请码：

1. 进入团队详情页面
2. 点击"刷新邀请码"按钮
3. 新邀请码立即生效，旧邀请码失效

## 团队设置

**权限要求：** 需要 owner 或 admin 权限

### 更新团队名称

1. 进入团队详情页面
2. 点击"团队设置"标签
3. 修改团队名称
4. 点击保存

### 删除团队

**权限要求：** 仅 owner 可以删除团队

1. 进入团队详情页面
2. 点击"团队设置"标签
3. 点击"删除团队"按钮
4. 确认删除

删除团队后，所有团队数据（包括共享提示词）将被永久删除，无法恢复。
```

- [ ] **Step 2: Verify file creation**

Run: `ls packages/web-app/app/docs/content/team-sharing.md`
Expected: File exists

- [ ] **Step 3: Test documentation page rendering**

Run: `npm run web:dev` (if not already running)
Navigate to: http://localhost:3000/docs
Expected: "团队共享快速入门" appears in docs list

Navigate to: http://localhost:3000/docs/team-sharing
Expected: Full documentation content renders correctly

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/app/docs/content/team-sharing.md
git commit -m "docs: add team sharing quick-start guide"
```