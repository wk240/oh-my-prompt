/**
 * Claude.ai Platform Config
 */

import type { PlatformConfig } from '../base/types'

export const claudeAiConfig: PlatformConfig = {
  id: 'claude-ai',
  name: 'Claude.ai',

  urlPatterns: [
    { type: 'domain', value: 'claude.ai' },
  ],

  inputDetection: {
    selectors: [
      'div[data-testid="chat-input"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '.ProseMirror[contenteditable="true"]',
    ],
  },

  uiInjection: {
    anchorSelector: 'button[aria-label="Add files, connectors, and more"]',
    position: 'before',
  },
}