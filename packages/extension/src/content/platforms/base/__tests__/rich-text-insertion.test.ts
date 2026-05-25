import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../../..')

describe('rich text insertion formatting', () => {
  it('uses escaped insertHTML for multiline text in default and Lovart inserters', () => {
    const defaultInserterSource = readFileSync(
      resolve(repoRoot, 'src/content/platforms/base/default-strategies.ts'),
      'utf8',
    )
    const lovartInserterSource = readFileSync(
      resolve(repoRoot, 'src/content/platforms/lovart/strategies.ts'),
      'utf8',
    )

    for (const source of [defaultInserterSource, lovartInserterSource]) {
      expect(source).toContain('formatRichTextInsertionHtml(text)')
      expect(source).toContain("document.execCommand('insertHTML', false, html)")
      expect(source).toContain("document.execCommand('insertText', false, text)")
    }
  })
})
