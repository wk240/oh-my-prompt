/**
 * LibLib Platform Config (国内设计平台)
 */

import type { PlatformConfig } from '../base/types'

export const liblibConfig: PlatformConfig = {
  id: 'liblib',
  name: 'LibLib',

  urlPatterns: [
    { type: 'domain', value: 'liblib.art' },
  ],

  inputDetection: {
    selectors: [
      'textarea[placeholder*="提示词"]',
      'textarea[placeholder*="prompt"]',
      'div[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.input-container',
    position: 'append',
  },
}