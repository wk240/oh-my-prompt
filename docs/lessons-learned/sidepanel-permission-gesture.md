# Chrome Extension SidePanel 与权限请求的用户手势传播

> 本文档记录了一次重要的 bug 修复经验：点击扩展图标时权限无法自动恢复的问题。

## 问题背景

### 现象

浏览器重启后，点击扩展图标打开侧边栏，设置页面仍然显示"恢复文件夹权限"按钮，即使用户已经点击了图标（应该有用户手势）。

### 日志分析

```
[Oh My Prompt] Sidepanel opened, checking permission status...
[Oh My Prompt] Permission status after action.onClicked: prompt  ← 权限未恢复
```

**关键缺失：** Service Worker 日志中没有 `Extension icon clicked` 的记录，说明 `action.onClicked` 事件从未被触发。

---

## 根因分析

### Chrome SidePanel 的隐藏行为

Chrome Extension MV3 中，当 manifest.json 配置了 `side_panel`：

```json
{
  "side_panel": {
    "default_path": "src/sidepanel/sidepanel.html"
  }
}
```

Chrome 会记住用户的侧边栏使用习惯。如果用户**曾经手动打开过侧边栏**（通过右键菜单或其他方式），Chrome 会：

1. 在下次点击扩展图标时**直接打开侧边栏**
2. **不触发 `action.onClicked` 事件**

这个行为由 Chrome 内部管理，不受 manifest.json 控制。

### 用户手势传播链断裂

```
用户点击扩展图标
  ↓
Chrome 自动打开侧边栏（绕过 action.onClicked）← 问题所在！
  ↓
action.onClicked 不触发
  ↓
用户手势没有传播到 Service Worker
  ↓
权限请求失败（缺少用户手势）
```

### File System Access API 的手势要求

Chrome 的 File System Access API 要求：

1. **必须有用户手势**（click、keydown 等）
2. **必须在同步执行路径中调用** - 不能通过 `await` 延迟
3. **用户手势只传播到第一个 async 操作**

---

## 解决方案

### 1. 显式禁用 `openPanelOnActionClick`

在 Service Worker 的 `onStartup` 和 `onInstalled` 中调用：

```typescript
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
```

这确保点击扩展图标时**总是触发 `action.onClicked`**，而不是 Chrome 自动打开侧边栏。

### 2. 在 action.onClicked 中发送权限请求

```typescript
chrome.action.onClicked.addListener((tab) => {
  // CRITICAL: 在 SYNC 路径中发送请求（保留用户手势）
  chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
    .then(response => {
      if (response?.success) {
        console.log('Permission auto-restored')
      }
    })

  // 打开侧边栏（async，但请求已发送）
  chrome.sidePanel.open({ tabId: tab.id })
})
```

### 3. 修复侧边栏的竞态条件

侧边栏打开时，**不要再次发送权限请求**，否则会与 `action.onClicked` 的请求产生竞态。

```typescript
// PromptListView.tsx - 侧边栏打开时
useEffect(() => {
  // 等待 action.onClicked 的请求完成
  const timer = setTimeout(() => {
    // 只检查状态，不请求权限
    chrome.runtime.sendMessage({ type: MessageType.GET_SYNC_STATUS }, (response) => {
      setStatus(response.data)
    })
  }, 500)

  return () => clearTimeout(timer)
}, [])
```

---

## 修复后的执行流程

```
用户点击扩展图标
  ↓
action.onClicked 触发 ✓（因为禁用了 openPanelOnActionClick）
  ↓
sendMessage(OFFSCREEN_REQUEST_PERMISSION) ← 用户手势存在 ✓
  ↓
Offscreen Document 收到请求（有手势上下文）
  ↓
handle.requestPermission({ mode: 'readwrite' })
  ↓
权限恢复成功 → permission: 'granted'
  ↓
sidePanel.open()
  ↓
侧边栏打开，500ms 后检查状态
  ↓
权限状态为 'granted' → 不显示恢复按钮
```

---

## 最佳实践总结

### 1. SidePanel 与 action.onClicked 的冲突

| 配置 | 点击图标行为 | action.onClicked |
|------|-------------|-----------------|
| `openPanelOnActionClick: true`（或 Chrome 默认记住） | 自动打开侧边栏 | **不触发** |
| `openPanelOnActionClick: false` | 不自动打开 | **触发** ✓ |

**建议：** 如果需要在点击图标时执行其他操作（如权限请求），必须显式禁用 `openPanelOnActionClick`。

### 2. 用户手势传播的关键点

| 位置 | 用户手势状态 | 建议 |
|------|-------------|------|
| action.onClicked | ✓ 有手势 | 立即在 SYNC 路径发送请求 |
| sidePanel.open() 之后 | ✗ 手势已丢失 | 不要发送权限请求 |
| 按钮点击（侧边栏内） | ✓ 有新手势 | 可以发送请求 |

### 3. 消息发送时机

```typescript
// 正确 ✓ - SYNC 路径，保留手势
chrome.runtime.sendMessage({ type: REQUEST_PERMISSION })
  .then(response => { ... })  // then 回调中手势已丢失，但请求已发出

// 错误 ✗ - 先 await，手势丢失
await someAsyncOperation()
chrome.runtime.sendMessage({ type: REQUEST_PERMISSION })  // 无手势！
```

### 4. 多处发送请求的竞态问题

如果 `action.onClicked` 和侧边栏 `useEffect` 都发送权限请求：

- 第一个请求可能成功（有手势）
- 第二个请求会失败（手势已丢失）
- 状态被第二个请求的结果覆盖

**解决方案：** 只在一个地方发送请求，其他地方只检查状态。

---

## 相关代码位置

| 文件 | 功能 |
|------|------|
| `packages/extension/src/background/service-worker.ts` | `action.onClicked` 处理、`setPanelBehavior` |
| `packages/extension/src/offscreen/offscreen.ts` | 权限请求处理（有 DOM 上下文） |
| `packages/extension/src/sidepanel/views/PromptListView.tsx` | 侧边栏打开时的状态检查 |
| `packages/extension/src/lib/offscreen-manager.ts` | Offscreen Document 生命周期管理 |

---

## 参考资料

- [Chrome Extension SidePanel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [File System Access API - Permissions](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#permissions)
- [Chrome Extension User Gesture Propagation](https://developer.chrome.com/docs/extensions/mv3/user_gesture/)