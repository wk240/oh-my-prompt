/**
 * Gemini Platform Config
 */

import type { PlatformConfig } from '../base/types'

export const geminiConfig: PlatformConfig = {
  id: 'gemini',
  name: 'Gemini',

  urlPatterns: [
    { type: 'domain', value: 'gemini.google.com' },
  ],

  inputDetection: {
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[aria-label*="Enter a prompt"]',
    ],
  },

  uiInjection: {
    anchorSelector: '.input-area-container',
    position: 'append',
  },
}