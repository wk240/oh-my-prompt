// scripts/test-migration.js
// Run this in Chrome DevTools Console on extension popup page

console.log('=== Migration Test Script ===')

// Test: Create legacy format data
async function createLegacyTestData() {
  const legacyData = {
    prompts: [
      {id: 'test-prompt-1', name: 'Test Prompt 1', content: 'Test content 1', categoryId: 'cat-test', order: 0}
    ],
    categories: [
      {id: 'cat-test', name: '测试分类', order: 0}
    ],
    version: '1.0.0'
  }

  await chrome.storage.local.set({ prompt_script_data: legacyData })
  console.log('[TEST] Created legacy format data:', legacyData)
  return legacyData
}

// Test: Verify migration happened
async function verifyMigration() {
  const result = await chrome.storage.local.get('prompt_script_data')
  const data = result.prompt_script_data

  console.log('[TEST] Current storage data:', data)

  // Check structure
  const checks = {
    hasUserData: !!data.userData,
    hasSettings: !!data.settings,
    hasPrompts: data.userData?.prompts?.length > 0,
    hasCategories: data.userData?.categories?.length > 0,
    hasMigrationFlag: data._migrationComplete === true,
    promptsPreserved: data.userData?.prompts?.[0]?.id === 'test-prompt-1',
    categoriesPreserved: data.userData?.categories?.[0]?.id === 'cat-test'
  }

  console.log('[TEST] Verification results:', checks)

  const allPassed = Object.values(checks).every(v => v)
  console.log(allPassed ? '[TEST] ✅ MIGRATION SUCCESS' : '[TEST] ❌ MIGRATION FAILED')

  return allPassed
}

// Run test sequence
async function runMigrationTest() {
  console.log('\n--- Step 1: Create Legacy Data ---')
  await createLegacyTestData()

  console.log('\n--- Step 2: Reload Extension ---')
  console.log('[TEST] Please reload extension from chrome://extensions')
  console.log('[TEST] Then re-open popup and run: verifyMigration()')

  console.log('\n--- Quick Test (reload simulation) ---')
  // Simulate by calling getData via message
  chrome.runtime.sendMessage({ type: 'GET_STORAGE' }, (response) => {
    if (response?.success) {
      console.log('[TEST] GET_STORAGE response:', response.data)
    }
  })
}

console.log('\nAvailable commands:')
console.log('  runMigrationTest()    - Full test sequence')
console.log('  createLegacyTestData() - Create legacy data')
console.log('  verifyMigration()     - Check migration result')
console.log('\nRun: runMigrationTest()')