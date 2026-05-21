/**
 * RunningHub Platform Config
 * Supports both legacy runninghub.ai and new RHTV interface (rhtv.runninghub.ai)
 */

import type { PlatformConfig } from '../base/types'

export const runninghubConfig: PlatformConfig = {
  id: 'runninghub',
  name: 'RunningHub',

  urlPatterns: [
    { type: 'domain', value: 'runninghub.ai' },
    { type: 'domain', value: 'rhtv.runninghub.ai' },
  ],

  inputDetection: {
    selectors: [
      // RHTV new interface: home page input (contenteditable)
      '.home-input-box .composer-input[contenteditable="true"]',
      '.home-input-stage .composer-input[contenteditable="true"]',
      '.home-input-row .composer-input[contenteditable="true"]',
      '.home-textarea-wrap .composer-input[contenteditable="true"]',
      '.composer-input[contenteditable="true"]',
      // Legacy interface: Image agent prompt input (contenteditable)
      '.qc-create-image .prompt-para[contenteditable="true"]',
      // Legacy interface: Video agent prompt input (contenteditable)
      '.qc-create-video .prompt-para[contenteditable="true"]',
      // Fallback generic selectors
      '.prompt-para[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    debounceMs: 100,
  },

  uiInjection: {
    // RHTV new interface: inject in home-toolbar-left, before the first button
    inputSelector: '.composer-input[contenteditable="true"]',
    anchorSelector: '.home-toolbar-left',
    position: 'prepend',
  },

  // Legacy interface injections
  secondaryInjections: [
    {
      // Legacy Image panel: inject before the first parameter button
      inputSelector: '.qc-create-image .prompt-para[contenteditable="true"]',
      anchorSelector: '.qc-create-image .param-scroll-inner .param-btn:first-child',
      position: 'before',
    },
    {
      // Legacy Video panel: inject before the first parameter button
      inputSelector: '.qc-create-video .prompt-para[contenteditable="true"]',
      anchorSelector: '.qc-create-video .param-scroll-inner .param-btn:first-child',
      position: 'before',
    },
  ],
}