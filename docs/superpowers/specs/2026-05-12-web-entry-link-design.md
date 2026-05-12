# 云端同步模块"进入Web端"入口设计

## 背景

侧边栏云端同步模块（UnifiedSyncSection）允许用户登录、上传/下载云端数据。需要添加一个入口让用户跳转到Web端备份管理页面查看更多详情。

## 需求

- **入口位置**: 云端同步区块标题旁（与"云端同步"标题并排）
- **按钮样式**: 文字链接，样式与"退出"按钮一致
- **链接文字**: "进入Web端"
- **显示条件**: 仅在已登录状态下显示
- **目标页面**: Web端备份管理页 (`/backup`)

## 技术设计

### 文件变更

**`packages/extension/src/sidepanel/settings/UnifiedSyncSection.tsx`**

1. 添加导入：
   ```typescript
   import { WEB_APP_URL } from '@/lib/config'
   ```

2. 在云端同步区块标题行（约第339-384行）添加链接，位于状态灯之后、退出按钮之前：
   ```typescript
   <a
     href={`${WEB_APP_URL}/backup`}
     target="_blank"
     rel="noopener noreferrer"
     className="text-sm text-gray-500 hover:text-gray-700"
   >
     进入Web端
   </a>
   ```

3. 添加分隔符（可选，与"退出"按钮之间）：
   ```typescript
   <span className="text-sm text-gray-300">|</span>
   ```

### 环境配置

- `WEB_APP_URL` 已通过 vite alias 自动切换：
  - 开发环境: `http://localhost:3000`（来自 `config.dev.ts`）
  - 生产环境: `https://oh-my-prompt.com`（来自 `config.prod.ts`）

### UI结构

```
[☁️ 云端同步 ○]                    [进入Web端 | 退出]

状态: ✓ 已登录
上次同步: 2026-05-12 10:30

[上传到云端]  [下载到本地]
```

## 无需变更

- 无新增消息类型
- 无状态管理变更
- 无API调用
- 无测试变更（纯UI链接）

## 验收标准

1. 已登录状态下，云端同步区块标题旁显示"进入Web端"链接
2. 未登录状态下，不显示该链接
3. 点击链接在浏览器新标签页打开 `${WEB_APP_URL}/backup`
4. 开发环境指向 localhost:3000，生产环境指向 oh-my-prompt.com