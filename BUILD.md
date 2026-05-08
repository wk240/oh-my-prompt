# 构建说明

## 项目结构

本项目采用 **Monorepo** 架构：

```
packages/
├── extension/      # Chrome Extension（开源）
│   ├── src/        # Extension 源码
│   └── dist/       # 构建产物
│
└── shared/         # 共享类型定义（开源）
    ├── types/      # TypeScript 类型
    └── constants/  # 常量定义
```

## 开发

```bash
# 从根目录运行
npm run dev

# 或进入 extension 目录
cd packages/extension
npm run dev
```

## 构建

```bash
npm run build
```

构建产物在 `packages/extension/dist/`。

## 加载 Extension

1. Chrome → `chrome://extensions/`
2. 启用「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `packages/extension/dist/` 文件夹

## Build Output

The production build outputs to `packages/extension/dist/`:

```
packages/extension/dist/
├── manifest.json        # Extension manifest (auto-generated)
├── service-worker-loader.js  # Background script loader
├── assets/              # Static assets and compiled JS
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── ...
└── src/
    └── popup/
        └── popup.html   # Popup entry point
```

## Creating .crx Package

In `chrome://extensions/` with Developer mode enabled:

1. Click **Pack extension** button
2. Extension root directory: Select the `packages/extension/dist/` folder
3. Private key: Leave empty for first pack (a `.pem` key will be generated)
4. Output: `.crx` file in project root

**Important:** Keep the generated `.pem` private key secure for future updates. Losing it prevents extension updates.

## Version Update Process

For future releases:

1. Update `version` in `packages/extension/manifest.json`
2. Update `version` in `package.json` (sync with manifest)
3. Run `npm run build` to regenerate dist
4. Load in Chrome for smoke test
5. Pack extension if ready for release

## Build Configuration

- **Toolchain:** Vite + @crxjs/vite-plugin
- **TypeScript:** Strict mode enabled
- **Source maps:** Enabled for debugging (`sourcemap: true`)
- **Base path:** `./` (relative paths for extension)

## Known Considerations

- Source maps are included for debugging; exclude for production distribution
- @crxjs/vite-plugin handles manifest transformation automatically
- Content script matches include `file:///*` for local testing