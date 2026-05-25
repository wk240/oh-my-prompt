import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../..')

describe('EcommerceView result layout', () => {
  it('renders the result view as an exclusive panel instead of overlaying the form', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/EcommerceView.tsx'),
      'utf8',
    )
    const css = readFileSync(
      resolve(repoRoot, 'src/sidepanel/index.css'),
      'utf8',
    )

    expect(source).toContain("viewMode === 'form'")
    expect(source).toContain("viewMode === 'result'")
    expect(css).toMatch(/\.ecommerce-panel-result-view\s*\{[^}]*position:\s*relative;/s)
    expect(css).not.toMatch(/\.ecommerce-panel-result-view\s*\{[^}]*position:\s*absolute;/s)
  })

  it('uses compact multi-reference image state and payloads', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/EcommerceView.tsx'),
      'utf8',
    )
    const css = readFileSync(
      resolve(repoRoot, 'src/sidepanel/index.css'),
      'utf8',
    )

    expect(source).toContain('interface EcommerceReferenceImage')
    expect(source).toContain('const MAX_REFERENCE_IMAGES = 6')
    expect(source).toContain('const [productImages, setProductImages]')
    expect(source).toContain('multiple')
    expect(source).toContain('productImages: productImages.map(image => image.dataUrl)')
    expect(source).toContain('imageDataList: productImages.map(image => image.dataUrl)')
    expect(source).toContain('参考图片')
    expect(css).toContain('.ecommerce-panel-reference-grid')
    expect(css).toMatch(/\.ecommerce-panel-reference-thumb\s*\{[^}]*width:\s*64px;/s)
    expect(css).toMatch(/\.ecommerce-panel-reference-thumb\s*\{[^}]*height:\s*64px;/s)
  })

  it('requires reference images before ecommerce generation', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/EcommerceView.tsx'),
      'utf8',
    )

    expect(source).toContain('if (productImages.length === 0) {')
    expect(source).toContain("showToast('请先上传参考图片')")
    expect(source).toContain('productImages.length === 0 || !sellingPoints.trim() || isLoading')
  })
})
