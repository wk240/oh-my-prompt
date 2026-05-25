import { describe, expect, it } from 'vitest'
import { stabilizeContentScriptManifest, stableContentScriptPath } from '../stable-content-scripts'

describe('stableContentScriptPath', () => {
  it('converts hashed CRX content script assets to stable paths', () => {
    expect(stableContentScriptPath('assets/coordinator.ts-loader-DdbUeoE0.js'))
      .toBe('assets/coordinator-loader.js')
    expect(stableContentScriptPath('assets/auth-callback.ts-BsIqJeyV.js'))
      .toBe('assets/auth-callback.js')
  })

  it('ignores non-hashed and non-asset paths', () => {
    expect(stableContentScriptPath('assets/coordinator-loader.js')).toBeNull()
    expect(stableContentScriptPath('src/content/core/coordinator.ts')).toBeNull()
  })
})

describe('stabilizeContentScriptManifest', () => {
  it('rewrites content script entries and reports files to copy', () => {
    const result = stabilizeContentScriptManifest({
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['assets/coordinator.ts-loader-DdbUeoE0.js']
        },
        {
          matches: ['https://oh-my-prompt.com/auth/callback*'],
          js: ['assets/auth-callback.ts-BsIqJeyV.js']
        }
      ],
      web_accessible_resources: [
        {
          matches: ['https://oh-my-prompt.com/*'],
          resources: ['assets/auth-callback.ts-BsIqJeyV.js']
        }
      ]
    })

    expect(result.manifest.content_scripts?.[0].js).toEqual(['assets/coordinator-loader.js'])
    expect(result.manifest.content_scripts?.[1].js).toEqual(['assets/auth-callback.js'])
    expect(result.manifest.web_accessible_resources?.[0].resources).toEqual(['assets/auth-callback.js'])
    expect(result.copies).toEqual([
      {
        from: 'assets/coordinator.ts-loader-DdbUeoE0.js',
        to: 'assets/coordinator-loader.js'
      },
      {
        from: 'assets/auth-callback.ts-BsIqJeyV.js',
        to: 'assets/auth-callback.js'
      }
    ])
  })
})
