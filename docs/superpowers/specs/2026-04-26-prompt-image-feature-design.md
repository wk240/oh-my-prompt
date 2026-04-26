# 提示词示例图片功能设计

**日期**: 2026-04-26
**状态**: 待实现
**范围**: 用户自定义提示词添加示例图片支持

---

## 功能概述

为用户自定义提示词添加示例图片功能，图片存储于用户配置的本地文件夹，支持多种图片来源和展示位置。

### 核心需求

| 项目 | 决定 |
|------|------|
| 存储方案 | 本地文件夹存储 |
| 图片来源 | 本地上传、网络URL下载、资源库收藏自动下载 |
| 展示位置 | 下拉菜单列表 + 弹窗详情页 |
| 图片必填性 | 可选 |
| 收藏时下载 | 已配置文件夹→自动下载，未配置→提示先配置 |
| 未配置降级 | 允许无图保存，之后可补充图片 |
| 列表样式 | 保持列表样式，左侧加60x40px缩略图 |

---

## 数据结构

### Prompt 类型扩展

```typescript
export interface Prompt {
  id: string
  name: string
  nameEn?: string
  content: string
  contentEn?: string
  categoryId: string
  description?: string
  descriptionEn?: string
  order: number
  // 新增字段
  localImage?: string       // 本地图片相对路径，如 "images/{id}.jpg"
  remoteImageUrl?: string   // 原始网络URL（记录来源，可选）
}
```

### 字段说明

| 字段 | 类型 | 用途 |
|------|------|------|
| `localImage` | string? | 本地文件夹中的图片相对路径，无图时为空 |
| `remoteImageUrl` | string? | 记录图片原始URL（资源库收藏或网络URL输入时保存） |

### 存储路径约定

```
{用户选择的备份文件夹}/
├── omps-latest.json              # 现有：最新备份
├── omps-backup-{timestamp}.json  # 现有：历史备份
└── images/                       # 新增：图片目录
    ├── {promptId}.jpg
    ├── {promptId}.png
    └── ...
```

---

## 图片来源处理流程

### 1. 本地上传图片

```
用户选择本地图片文件
        ↓
读取文件 → 写入 {备份文件夹}/images/{promptId}.{ext}
        ↓
更新 Prompt.localImage = "images/{promptId}.{ext}"
        ↓
保存到 storage
```

**实现要点**:
- 使用 File System Access API 的 `getFile()` + `writeFile()`
- 支持格式：jpg、png、webp、gif
- 文件大小限制：5MB 以内
- 文件命名：promptId + 原文件扩展名

### 2. 网络URL下载

```
用户输入图片URL
        ↓
fetch(url) → 获取Blob
        ↓
写入 {备份文件夹}/images/{promptId}.{ext}
        ↓
Prompt.localImage = "images/{promptId}.{ext}"
Prompt.remoteImageUrl = url（记录来源）
        ↓
保存到 storage
```

**实现要点**:
- 使用 `fetch()` 下载图片
- 从 Content-Type 或 URL 扩展名推断格式
- 下载失败时提示用户

### 3. 资源库收藏自动下载

```
用户点击收藏资源库提示词
        ↓
检查文件夹是否已配置
        ↓
┌─ 已配置 ────────────────────┐
│ fetch(prompt.previewImage)  │
│ 写入 images/{promptId}.{ext}│
│ 创建 Prompt（含localImage） │
└─────────────────────────────┘
        ↓
┌─ 未配置 ────────────────────┐
│ 弹窗提示：先配置文件夹才能  │
│ 保存图片，可选择：          │
│ [配置文件夹] [无图收藏]     │
└─────────────────────────────┘
```

---

## UI展示改动

### 1. 下拉菜单列表（PromptItem组件）

**新样式（左侧60x40缩略图）**:
```
┌─────────────────────────────┐
│ ┌────┐  [名称]              │
│ │图片│  [描述/内容预览]      │
│ └────┘                      │
└─────────────────────────────┘
```

**无图时占位符**:
- 背景：浅灰色 #f0f0f0
- 内容：Document 图标或空白

**交互**:
| 操作 | 行为 |
|------|------|
| 点击缩略图区域 | 打开弹窗详情页 |
| 点击名称/描述区域 | 直接插入提示词（保持现有行为） |
| 悬停缩略图 | 显示大图预览（类似资源库的hover preview） |

### 2. 弹窗详情页（PromptPreviewModal扩展）

扩展现有组件，同时支持用户提示词和资源库提示词。

**弹窗内容结构**:
```
┌────────────────────────────────────┐
│ [名称]                           ✕ │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │         大图展示               │ │
│ │     (maxHeight: 200px)         │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ [完整提示词内容]                   │
│                                    │
├────────────────────────────────────┤
│ [语言切换按钮] (有双语时显示)      │
├────────────────────────────────────┤
│ [编辑]              [插入]         │
└────────────────────────────────────┘
```

**与资源库弹窗的差异**:
- 资源库弹窗：底部按钮是 [收藏] + [插入]
- 用户弹窗：底部按钮是 [编辑] + [插入]，无作者来源显示

---

## 编辑功能改动

### PromptEditModal 扩展

新增图片上传区域：

```
┌─────────────────────────────────────┐
│ 示例图片                             │
│ ┌─────────────────────────────────┐ │
│ │  ┌────┐                          │ │
│ │  │预览│  [更换图片] [删除图片]    │ │ ← 有图时
│ │  └────┘                          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  [点击上传图片] 或拖拽到此处     │ │ ← 无图时
│ │  也支持输入图片URL               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**交互方式**:
| 操作 | 描述 |
|------|------|
| 点击上传 | 打开文件选择器，支持 jpg/png/webp/gif |
| 拖拽上传 | 拖拽图片文件到上传区域 |
| URL输入 | 输入框输入网络图片URL，点击下载 |
| 更换图片 | 重新上传/输入新图片，替换现有图片 |
| 删除图片 | 移除图片，清空 localImage 字段 |

### 文件夹未配置时

弹窗提示：
```
┌─────────────────────────────────────┐
│ 需要配置文件夹                       │
│                                     │
│ 保存图片需要配置备份文件夹           │
│                                     │
│ [配置文件夹]  [取消]                 │
└─────────────────────────────────────┘
```

---

## 文件系统操作

### 新增模块

```
src/lib/sync/
├── sync-manager.ts      # 现有：同步协调
├── file-sync.ts         # 现有：文件操作
├── indexeddb.ts         # 现有：文件夹handle持久化
└── image-sync.ts        # 新增：图片文件操作
```

### ImageSync 接口

```typescript
interface ImageSync {
  // 保存图片到文件夹
  saveImage(promptId: string, blob: Blob): Promise<string>
  
  // 删除图片文件
  deleteImage(promptId: string): Promise<void>
  
  // 读取图片为Blob
  readImage(relativePath: string): Promise<Blob | null>
  
  // 读取图片为URL（用于img src）
  getImageUrl(relativePath: string): Promise<string | null>
  
  // 从URL下载图片
  downloadFromUrl(url: string): Promise<Blob>
  
  // 检查文件夹是否配置
  isFolderConfigured(): Promise<boolean>
}
```

### 图片URL缓存管理

使用 Blob URL + 内存缓存策略：

```typescript
const imageUrlCache = new Map<string, string>()

function getCachedImageUrl(relativePath: string): Promise<string | null> {
  if (imageUrlCache.has(relativePath)) {
    return imageUrlCache.get(relativePath)!
  }
  const blob = await readImage(relativePath)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  imageUrlCache.set(relativePath, url)
  return url
}

function revokeImageUrl(relativePath: string) {
  const url = imageUrlCache.get(relativePath)
  if (url) {
    URL.revokeObjectURL(url)
    imageUrlCache.delete(relativePath)
  }
}
```

### 文件命名规则

```
images/{promptId}.{extension}

示例：
images/abc123.jpg
images/def456.png
```

---

## 错误处理

### 错误场景

| 场景 | 错误类型 | 处理方式 |
|------|----------|----------|
| 文件夹未配置 | `FOLDER_NOT_CONFIGURED` | 弹窗提示配置文件夹 |
| 图片写入失败 | `WRITE_FAILED` | 提示"保存图片失败"，允许无图保存 |
| 图片读取失败 | `READ_FAILED` | 显示占位符，提示"图片加载失败" |
| 网络下载失败 | `DOWNLOAD_FAILED` | 提示"下载图片失败"，允许无图保存 |
| 文件过大（>5MB） | `FILE_TOO_LARGE` | 提示"图片太大，请选择小于5MB的图片" |

### 边界情况

| 场景 | 处理方式 |
|------|----------|
| 用户更换备份文件夹 | 弹窗询问是否迁移图片到新文件夹 |
| 用户手动删除 images 目录 | 图片加载失败，显示占位符 |
| 提示词导出为JSON | JSON中只保留 localImage 路径，图片不打包 |
| 资源库图片URL失效 | 下载时失败则提示无图收藏 |
| 浏览器关闭后权限丢失 | 下次访问时检测权限，失效则提示重新选择文件夹 |

### Toast提示消息

| 操作 | Toast内容 |
|------|-----------|
| 图片保存成功 | "图片已保存" |
| 图片删除成功 | "图片已删除" |
| 图片保存失败 | "图片保存失败，请检查文件夹权限" |
| 图片下载失败 | "图片下载失败，请检查网络" |
| 图片过大 | "图片太大，请选择小于5MB的图片" |

---

## 文件变更清单

### 新增文件

```
src/lib/sync/image-sync.ts    # 图片文件操作
```

### 修改文件

```
src/shared/types.ts                      # Prompt类型扩展
src/content/components/PromptItem.tsx    # 加缩略图展示
src/content/components/PromptPreviewModal.tsx  # 支持用户提示词
src/content/components/PromptEditModal.tsx     # 加图片编辑区域
src/content/components/DropdownApp.tsx         # 图片缓存管理
src/lib/sync/sync-manager.ts              # 整合图片同步
```

---

## 依赖条件

- 用户需配置备份文件夹才能保存图片
- 无文件夹时可无图保存，后续补充图片
- 图片功能与现有文件夹同步机制集成

---

## 实现优先级

1. **P0 - 核心**: 数据结构扩展 + image-sync.ts + PromptItem缩略图
2. **P1 - 编辑**: PromptEditModal图片上传/编辑功能
3. **P2 - 详情**: PromptPreviewModal支持用户提示词
4. **P3 - 收藏**: 资源库收藏自动下载图片