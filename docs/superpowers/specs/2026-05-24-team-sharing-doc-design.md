# Team Sharing Documentation Design

## Overview

Add a quick-start guide documentation for team sharing functionality at http://localhost:3000/docs.

## Requirements

- **Target audience:** Both regular users and team administrators
- **Document type:** Quick-start guide (basic operation steps, no deep explanations)
- **Coverage:** Create team, join team, view prompts, invite members, permission management, prompt sync/import
- **Organization:** Single Markdown file `team-sharing.md`

## Design

### File Location

- **Path:** `packages/web-app/app/docs/content/team-sharing.md`
- **Format:** Markdown with gray-matter frontmatter

### Frontmatter

```yaml
---
title: 团队共享快速入门
description: 了解如何使用团队共享功能，与他人协作管理提示词
---
```

### Document Structure

1. **简介** - Purpose and use cases
2. **创建团队** - Steps for creating a team (owner role)
3. **加入团队** - Two methods: invite code and invite link (member role)
4. **查看团队提示词** - Web App and Extension viewing methods
5. **同步提示词到团队** - Share personal prompts to team
6. **从团队导入提示词** - Import team prompts to personal library
7. **权限说明** - Role permission table (owner/admin/member)
8. **管理团队成员** - View members, invite, refresh invite code
9. **团队设置** - Update team name, delete team

### Writing Style

- Concise and direct, avoid lengthy explanations
- Use first person ("你") for guidance
- Step-by-step format, one step per paragraph
- Use text placeholders for screenshots (to be added later)
- Permission requirements highlighted per section

### Content Preview

Full content preview confirmed in brainstorming session. Key sections include:

- **创建团队:** Navigate to /team → Click "创建团队" → Enter name → Confirm
- **加入团队:** Two methods with clear steps
- **查看团队提示词:** Web App (team page) + Extension (dropdown menu)
- **权限说明:** Permission table with owner/admin/member roles
- **管理团队成员:** Invite by code or email, refresh invite code
- **团队设置:** Update name (owner/admin), delete team (owner only)

## Implementation Notes

- Document will be automatically rendered at `/docs/team-sharing` by existing docs system
- Uses gray-matter for metadata extraction
- Uses marked for Markdown-to-HTML conversion
- Styled by existing prose classes in `[slug]/page.tsx`

## Related Documents

- Existing team management design: `2026-05-21-team-management-design.md`
- Existing docs: getting-started, import-export, platform-support, vision-api, faq