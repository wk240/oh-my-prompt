import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../../..')

describe('rich text insertion formatting', () => {
  it('tries paste-style multiline insertion before falling back to insertText', () => {
    const defaultInserterSource = readFileSync(
      resolve(repoRoot, 'src/content/platforms/base/default-strategies.ts'),
      'utf8',
    )
    const lovartInserterSource = readFileSync(
      resolve(repoRoot, 'src/content/platforms/lovart/strategies.ts'),
      'utf8',
    )

    for (const source of [defaultInserterSource, lovartInserterSource]) {
      expect(source).toContain('dispatchMultilinePasteEvent(element, text)')
      expect(source).toContain("document.execCommand('insertText', false, text)")
      expect(source).not.toContain("document.execCommand('insertHTML'")
    }
  })

  it('treats a cancelled paste event as handled to avoid duplicate insertion', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/content/platforms/base/rich-text-insertion.ts'),
      'utf8',
    )

    expect(source).toContain('const wasCancelled = !element.dispatchEvent(pasteEvent)')
    expect(source).toContain('return wasCancelled || pasteEvent.defaultPrevented || element.textContent !== beforeText')
  })
})
