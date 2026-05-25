import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../..')

describe('Agent sidepanel insert actions', () => {
  it('wires normal Agent results to the shared one-click insert callback', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/AgentView.tsx'),
      'utf8',
    )

    expect(source).toContain('onInsert?: (text: string) => Promise<void>')
    expect(source).toContain("const [viewMode, setViewMode] = useState<'form' | 'result'>('form')")
    expect(source).toContain("setViewMode('result')")
    expect(source).toContain("className={`agent-view ${viewMode === 'result' ? 'agent-view-result-mode' : ''}`}")
    expect(source).toContain('className="agent-result-view"')
    expect(source).toContain('aria-label="返回表单"')
    expect(source).toContain('const handleInsert = useCallback(async () => {')
    expect(source).toContain('await onInsert(result)')
    expect(source).toContain('插入提示词')
  })

  it('wires normal Agent dropdown results to the standalone result view', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/content/components/AgentPanel.tsx'),
      'utf8',
    )

    expect(source).toContain("const [viewMode, setViewMode] = useState<'form' | 'result'>")
    expect(source).toContain("setViewMode('result')")
    expect(source).toContain('className="agent-panel-result-view"')
    expect(source).toContain('aria-label="返回表单"')
    expect(source).toContain('插入提示词')
  })

  it('wires ecommerce Agent single prompts and bundles to one-click insert', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/EcommerceView.tsx'),
      'utf8',
    )

    expect(source).toContain('onInsert?: (text: string) => Promise<void>')
    expect(source).toContain('await onInsert(text)')
    expect(source).toContain('await onInsert(bundle)')
    expect(source).toContain('aria-label="插入"')
    expect(source).toContain('插入全部')
  })

  it('persists ecommerce dropdown reference images as an array', () => {
    const panelSource = readFileSync(
      resolve(repoRoot, 'src/content/components/EcommercePanel.tsx'),
      'utf8',
    )
    const containerSource = readFileSync(
      resolve(repoRoot, 'src/content/components/DropdownContainer.tsx'),
      'utf8',
    )

    expect(panelSource).toContain('interface EcommerceReferenceImage')
    expect(panelSource).toContain('productImages: EcommerceReferenceImage[]')
    expect(panelSource).toContain('productImages: productImages.map(image => image.dataUrl)')
    expect(panelSource).toContain('imageDataList: productImages.map(image => image.dataUrl)')
    expect(containerSource).toContain('productImages: []')
    expect(containerSource).not.toContain('productImage: null, productImageName')
  })

  it('passes the shared sidepanel insert function into both Agent views', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/PromptListView.tsx'),
      'utf8',
    )

    expect(source).toContain('const insertTextToCurrentTab = useCallback(async (text: string')
    expect(source).toContain('onInsert={insertTextToCurrentTab}')
  })

  it('refreshes prompt data without unmounting the Agent result view after saves', () => {
    const storeSource = readFileSync(
      resolve(repoRoot, 'src/lib/store.ts'),
      'utf8',
    )
    const promptListSource = readFileSync(
      resolve(repoRoot, 'src/sidepanel/views/PromptListView.tsx'),
      'utf8',
    )

    expect(storeSource).toContain('loadFromStorage: (options?: { showLoading?: boolean })')
    expect(storeSource).toContain('if (options?.showLoading !== false) {')
    expect(promptListSource).toContain('loadFromStorage({ showLoading: false })')
  })
})
