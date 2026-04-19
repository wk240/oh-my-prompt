import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');

  await expect(page).toHaveTitle(/Example Domain/);

  await expect(page.locator('h1')).toContainText('Example Domain');
});

// Chrome Extension 测试示例
test('extension popup loads', async ({ page, context }) => {
  // 加载扩展（需要调整路径）
  // await context.route('**', route => route.continue());

  // 打开扩展 popup
  // await page.goto('chrome-extension://YOUR_EXTENSION_ID/popup.html');
});