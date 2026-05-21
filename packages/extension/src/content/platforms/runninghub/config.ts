/**
 * RunningHub Platform Config
 * https://www.runninghub.ai/
 */

import type { PlatformConfig } from '../base/types'

export const runninghubConfig: PlatformConfig = {
  id: 'runninghub',
  name: 'RunningHub',

  urlPatterns: [
    { type: 'domain', value: 'runninghub.ai' },
  ],

  inputDetection: {
    selectors: [
      // Image agent prompt input (contenteditable)
      '.qc-create-image .prompt-para[contenteditable="true"]',
      // Video agent prompt input (contenteditable)
      '.qc-create-video .prompt-para[contenteditable="true"]',
      // Fallback generic selector
      '.prompt-para[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    // Image panel: inject before the first parameter button (model selector)
    inputSelector: '.qc-create-image .prompt-para[contenteditable="true"]',
    anchorSelector: '.qc-create-image .param-scroll-inner .param-btn:first-child',
    position: 'before',
  },

  // Video panel injection
  secondaryInjections: [
    {
      inputSelector: '.qc-create-video .prompt-para[contenteditable="true"]',
      anchorSelector: '.qc-create-video .param-scroll-inner .param-btn:first-child',
      position: 'before',
    },
  ],
}