# Lovart Prompt Injector - Manual Test Checklist

**Version:** 1.0.0
**Date:** 2026-04-16
**Tester:** _______________

---

## 1. Core Functionality (Lovart Page Integration)

### CORE-01: Dropdown trigger visibility
- [ ] Lovart输入框左侧显示闪电图标按钮
- [ ] 按钮样式与Lovart风格协调（圆角、背景色）
- [ ] 按钮尺寸44x44px（WCAG touch target）
- [ ] 按钮在页面加载后5秒内出现

**Test steps:**
1. 打开 https://lovart.ai
2. 等待页面完全加载
3. 检查输入框左侧是否有闪电图标按钮
4. 测量按钮尺寸（浏览器开发者工具）

### CORE-02: Dropdown menu display
- [ ] 点击按钮显示下拉菜单
- [ ] 下拉菜单显示提示词名称+内容预览
- [ ] 提示词按分类分组展示
- [ ] 点击按钮再次可关闭菜单

**Test steps:**
1. 点击闪电图标按钮
2. 验证下拉菜单展开动画流畅
3. 检查提示词分组显示是否正确
4. 再次点击按钮，验证菜单关闭

### CORE-03: Prompt insertion
- [ ] 选择提示词后文本插入到输入框
- [ ] 插入位置为光标当前位置（非追加）
- [ ] 插入后下拉菜单保持打开状态
- [ ] 可连续插入多个提示词

**Test steps:**
1. 在Lovart输入框中输入部分文本
2. 点击闪电按钮打开下拉菜单
3. 选择一个提示词
4. 验证提示词插入到光标位置（不替换原有文本）
5. 再次选择另一个提示词，验证可连续插入

### CORE-04: Lovart recognition
- [ ] Lovart submit按钮激活（识别输入变化）
- [ ] Lovart正确处理插入的提示词内容

**Test steps:**
1. 插入提示词后检查Lovart submit按钮是否可用
2. 点击submit验证Lovart正常响应

---

## 2. Prompt Management (Popup UI)

### MGMT-01: Category organization
- [ ] Popup显示分类侧边栏（左侧约80px）
- [ ] 分类列表包含默认分类和其他自定义分类
- [ ] 点击分类切换显示对应提示词列表
- [ ] 默认分类不可删除（三点菜单不显示删除选项）

**Test steps:**
1. 点击扩展图标打开Popup
2. 检查左侧分类侧边栏
3. 点击不同分类，验证右侧列表切换
4. 尝试删除默认分类，验证无法删除

### MGMT-02: Add prompt
- [ ] 点击底部「添加提示词」按钮打开编辑Dialog
- [ ] Dialog包含名称、内容、所属分类字段
- [ ] 保存后提示词出现在对应分类列表中
- [ ] 数据持久化（刷新Popup后数据仍存在）

**Test steps:**
1. 打开Popup，点击「添加提示词」
2. 填写提示词信息并保存
3. 验证提示词出现在列表中
4. 关闭并重新打开Popup，验证数据持久化

### MGMT-03: Edit prompt
- [ ] 点击提示词卡片三点菜单选择「编辑」
- [ ] 编辑Dialog显示当前提示词数据
- [ ] 修改后保存，提示词内容更新

**Test steps:**
1. 点击提示词卡片右侧三点图标
2. 选择「编辑」选项
3. 修改名称或内容
4. 保存并验证更新生效

### MGMT-04: Delete prompt
- [ ] 点击三点菜单选择「删除」
- [ ] 显示确认Dialog：「确定删除 "{name}" 吗？」
- [ ] 确认后提示词从列表移除

**Test steps:**
1. 点击三点菜单选择「删除」
2. 验证确认Dialog显示正确名称
3. 点击确认，验证提示词消失

### MGMT-05: Add category
- [ ] 点击分类列表底部的「添加分类」按钮
- [ ] 输入分类名称后保存
- [ ] 新分类出现在侧边栏

**Test steps:**
1. 点击分类列表底部添加按钮
2. 输入新分类名称
3. 验证新分类出现并可选

### MGMT-06: Delete category
- [ ] 非默认分类三点菜单显示「删除」选项
- [ ] 删除确认提示：提示词将移至默认分类
- [ ] 删除后该分类提示词移至默认分类
- [ ] 如果当前在删除的分类，自动切换到默认分类

**Test steps:**
1. 选中一个自定义分类（非默认）
2. 添加一些提示词到该分类
3. 删除该分类
4. 验证提示词移至默认分类
5. 验证自动切换到默认分类

---

## 3. Data Persistence

### DATA-01: Local storage persistence
- [ ] 提示词和分类数据存储在chrome.storage.local
- [ ] 数据在浏览器关闭后仍保留
- [ ] 扩展更新后数据仍可用

**Test steps:**
1. 添加若干提示词和分类
2. 关闭浏览器
3. 重新打开浏览器和Lovart
4. 验证数据完整保留

### DATA-02: Export to JSON
- [ ] 点击顶部导出图标触发下载
- [ ] 文件名格式：lovart-prompts-{YYYY-MM-DD}.json
- [ ] JSON包含prompts、categories、version字段

**Test steps:**
1. 点击Popup顶部导出图标
2. 验证文件下载成功
3. 打开JSON文件检查结构正确

### DATA-03: Import from JSON
- [ ] 点击顶部导入图标打开文件选择器
- [ ] 选择有效JSON文件后数据正确导入
- [ ] 导入后列表刷新显示新数据

**Test steps:**
1. 点击导入图标
2. 选择之前导出的JSON文件
3. 验证数据正确导入并显示

### DATA-04: Invalid JSON handling
- [ ] 选择无效JSON文件显示错误Toast
- [ ] 错误信息具体说明问题所在
- [ ] 原数据不受影响

**Test steps:**
1. 准备一个格式错误的JSON文件（如缺少version字段）
2. 尝试导入该文件
3. 验证显示具体错误Toast
4. 验证原有数据未改变

---

## 4. Extension Behavior

### EXT-01: Lovart domain activation
- [ ] 扩展仅在Lovart域名激活
- [ ] 在其他网站不显示闪电按钮
- [ ] 在Lovart子域名（如app.lovart.ai）同样激活

**Test steps:**
1. 打开 https://lovart.ai 或 https://app.lovart.ai
2. 验证扩展功能正常
3. 打开其他网站（如 https://google.com）
4. 验证扩展图标不变灰且无content script注入

### EXT-02: CSS isolation (Shadow DOM)
- [ ] Lovart页面原有样式不受影响
- [ ] 扩展UI样式完全隔离在Shadow DOM内
- [ ] Lovart CSS不会影响扩展UI

**Test steps:**
1. 打开Lovart页面
2. 检查页面原有元素样式是否正常
3. 使用开发者工具检查Shadow DOM结构

### EXT-03: Dropdown visual style
- [ ] 下拉菜单样式美观协调
- [ ] 圆角、阴影、配色与Lovart风格一致
- [ ] Hover和active状态有明显反馈

**Test steps:**
1. 打开下拉菜单
2. 视觉检查整体风格
3. 鼠标hover提示词项验证高亮效果

### EXT-04: Toolbar icon
- [ ] 扩展图标显示在浏览器工具栏
- [ ] 点击图标打开Popup界面
- [ ] 图标在Lovart页面和非Lovart页面都显示

**Test steps:**
1. 检查浏览器工具栏是否有扩展图标
2. 点击图标验证Popup打开
3. 在不同页面验证图标始终可见

---

## 5. Phase 4 Specific Tests

### SPA Navigation Persistence
- [ ] Lovart页面导航后扩展仍正常工作
- [ ] 切换项目/页面后输入框旁仍有闪电按钮
- [ ] 浏览器前进/后退导航后功能正常

**Test steps:**
1. 在Lovart主页加载扩展
2. 点击导航到其他页面（如项目详情页）
3. 验证闪电按钮重新出现
4. 使用浏览器后退按钮
5. 验证功能仍正常

### Edge Case: Empty Data
- [ ] 删除所有提示词后显示空状态提示
- [ ] 空状态提示包含添加引导
- [ ] 下拉菜单空状态提示点击扩展图标管理

**Test steps:**
1. 删除所有提示词
2. 打开下拉菜单，验证空状态显示
3. 打开Popup，验证空状态显示

### Edge Case: Delete Last Category
- [ ] 删除最后一个自定义分类时提示词移至默认分类
- [ ] 删除后自动选中默认分类
- [ ] 无法删除默认分类（显示错误提示）

**Test steps:**
1. 只保留默认分类和一个自定义分类
2. 在自定义分类添加提示词
3. 删除自定义分类
4. 验证提示词移至默认分类

### Large Data Import
- [ ] 导入500+提示词时无性能问题
- [ ] 下拉菜单滚动流畅
- [ ] 大数据集仅显示前100条提示

**Test steps:**
1. 创建包含500+提示词的JSON文件
2. 导入该文件
3. 打开下拉菜单验证响应速度
4. 验证列表滚动流畅

### Error Toast Display
- [ ] 导入无效JSON显示具体错误Toast
- [ ] 存储操作失败显示错误Toast
- [ ] 删除/添加操作显示成功Toast
- [ ] Toast不阻断用户操作，自动消失

**Test steps:**
1. 导入格式错误的JSON，验证错误Toast
2. 执行各CRUD操作，验证成功Toast
3. 观察Toast持续时间约3秒

---

## Test Summary

**Passed:** ______ / ______
**Failed:** ______
**Blocked:** ______

**Notes:**
_______________________________________________
_______________________________________________

**Tester signature:** _______________
**Date completed:** _______________