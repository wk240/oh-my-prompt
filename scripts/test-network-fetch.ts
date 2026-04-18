/**
 * Network Fetch Test Script
 * Run in browser console on Lovart page to test FETCH_NETWORK_PROMPTS
 *
 * Usage:
 * 1. Open Lovart page (or any page where content script loads)
 * 2. Open DevTools console (F12)
 * 3. Copy/paste this script content and run
 */

// Test FETCH_NETWORK_PROMPTS message
function testNetworkFetch(): Promise<void> {
  return new Promise((resolve) => {
    console.log('[Test] Sending FETCH_NETWORK_PROMPTS message...')

    chrome.runtime.sendMessage({ type: 'FETCH_NETWORK_PROMPTS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Test] Runtime error:', chrome.runtime.lastError)
        resolve()
        return
      }

      console.log('[Test] Response received:', response)

      if (response.success) {
        const { prompts, categories } = response.data

        console.log('[Test] Success!')
        console.log(`[Test] Prompts: ${prompts.length} items`)
        console.log(`[Test] Categories: ${categories.length} items`)

        // Validate prompt structure
        if (prompts.length > 0) {
          const firstPrompt = prompts[0]
          console.log('[Test] First prompt:', firstPrompt)

          const requiredFields = ['id', 'name', 'content', 'categoryId']
          const missingFields = requiredFields.filter(f => !firstPrompt[f])

          if (missingFields.length > 0) {
            console.error('[Test] Missing fields:', missingFields)
          } else {
            console.log('[Test] Prompt structure valid')
          }

          // Check optional fields
          if (firstPrompt.sourceProvider === 'nano-banana') {
            console.log('[Test] sourceProvider set correctly')
          }
        }

        // Validate category structure
        if (categories.length > 0) {
          const firstCategory = categories[0]
          console.log('[Test] First category:', firstCategory)

          const requiredFields = ['id', 'name', 'order', 'count']
          const missingFields = requiredFields.filter(f => !firstCategory[f])

          if (missingFields.length > 0) {
            console.error('[Test] Category missing fields:', missingFields)
          } else {
            console.log('[Test] Category structure valid')
          }
        }
      } else {
        console.error('[Test] Error:', response.error)
      }

      resolve()
    })
  })
}

// Run test
testNetworkFetch()