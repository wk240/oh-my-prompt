# Dev/Prod 环境分离设计

**日期:** 2026-05-11
**范围:** 仅解决 `WEB_APP_URL` 的环境切换问题，最小改动

---

## 问题现状

当前 `vite.config.ts` 的 `define` 配置始终注入 `DEV_WEB_APP_URL: '"http://localhost:3000"'`，导致：

1. 生产构建也使用开发 URL
2. `auth-service.ts` 和 `cloud.ts` 中的 fallback `https://oh-my-prompt.com` 从未生效
3. 开发者无法通过命令自动切换环境

---

## 目标

- `npm run dev` → 自动使用 `localhost:3000`
- `npm run build` → 自动使用 `https://oh-my-prompt.com`
- 无需手动修改配置

---

## 设计方案

### 文件结构变更

```
packages/extension/
├── vite.config.ts        # 删除（拆分为以下三个文件）
├── vite.config.base.ts   # 新增 - 共享基础配置
├── vite.config.dev.ts    # 新增 - 开发环境配置
├── vite.config.prod.ts   # 新增 - 生产环境配置
├── vitest.config.ts      # 保持不变
└── package.json          # 修改 scripts
```

### 配置文件内容

#### vite.config.base.ts

共享基础配置，包含 plugins、resolve alias、server、build rollupOptions。

关键配置：

- `plugins: [react(), crx({ manifest })]`
- `resolve.alias`: `@/` 和 `@oh-my-prompt/shared`
- `server`: port 5173, HMR, CORS
- `build.rollupOptions`: manualChunks 分组（react, icons, dnd-kit, zustand, resource-library）

#### vite.config.dev.ts

继承 base，注入开发 URL：

```ts
export default defineConfig({
  ...baseConfig,
  define: {
    DEV_WEB_APP_URL: '"http://localhost:3000"',
  },
})
```

#### vite.config.prod.ts

继承 base，不注入 DEV_WEB_APP_URL，额外禁用 sourcemap：

```ts
export default defineConfig({
  ...baseConfig,
  build: {
    ...baseConfig.build,
    sourcemap: false,
  },
})
```

### package.json scripts 变更

```json
{
  "scripts": {
    "dev": "vite --config vite.config.dev.ts",
    "build": "tsc && vite build --config vite.config.prod.ts",
    "preview": "vite preview --config vite.config.prod.ts"
  }
}
```

其他 scripts（test, version, release）保持不变。

### 代码无需修改

`auth-service.ts` 和 `cloud.ts` 的 fallback 逻辑已正确：

```ts
declare const DEV_WEB_APP_URL: string | undefined
const WEB_APP_URL = DEV_WEB_APP_URL ?? 'https://oh-my-prompt.com'
```

---

## 验证方式

1. 运行 `npm run dev`，检查构建产物中 `WEB_APP_URL` 是否为 `localhost:3000`
2. 运行 `npm run build`，检查构建产物中 `WEB_APP_URL` 是否为 `https://oh-my-prompt.com`
3. 生产构建的 OAuth callback 应指向 `https://oh-my-prompt.com/auth/extension/callback`

---

## 不涉及的内容

- manifest.json 的 auth callback URL（保持双 URL 配置）
- console.log 移除（保持现状）
- 其他环境变量（暂不引入）