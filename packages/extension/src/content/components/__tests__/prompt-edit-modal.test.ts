import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../..')

describe('PromptEditModal category handling', () => {
  it('allows adding a prompt without selecting a category', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/content/components/PromptEditModal.tsx'),
      'utf8',
    )

    expect(source).toContain('if (!trimmedName || !trimmedContent) return')
    expect(source).toContain('setCategoryId(defaultCategoryId || \'\')')
    expect(source).toContain('const isValid = name.trim() && content.trim() && (!isTemporary || categoryId)')
    expect(source).toContain('<option value="">无分类</option>')
    expect(source).not.toContain('if (!trimmedName || !trimmedContent || !categoryId) return')
  })
})
