import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Upload, Download, Copy, Check } from 'lucide-react'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import { readImportFile, mergeImportData } from '@/lib/import-export'

// Agent instruction prompt for generating importable JSON
const AGENT_INSTRUCTION_PROMPT = `# 任务

请根据用户提供的素材（文件、链接、文本片段等），提取其中的提示词信息，并生成符合以下JSON格式的数据，以便导入到"Oh My Prompt"浏览器插件。

# JSON格式规范

\`\`\`json
{
  "version": "1.0.0",
  "userData": {
    "categories": [
      { "id": "uuid", "name": "分类名称", "order": 0 }
    ],
    "prompts": [
      {
        "id": "uuid",
        "name": "提示词名称",
        "content": "提示词完整内容",
        "categoryId": "对应分类的uuid",
        "description": "可选描述",
        "order": 0
      }
    ]
  }
}
\`\`\`

# 字段说明

- **categories**: 分类数组，每个分类包含：
  - id: UUID格式唯一标识，使用 crypto.randomUUID() 或类似格式（如 "a1b2c3d4-e5f6-7890-abcd-ef1234567890"）
  - name: 分类名称，简洁明了
  - order: 排序序号，数字，同分类内递增

- **prompts**: 提示词数组，每个提示词包含：
  - id: UUID格式唯一标识
  - name: 提示词名称，用于下拉菜单显示
  - content: 提示词完整内容，这是插入到输入框的实际文本
  - categoryId: 关联的分类id（必须与categories中的id匹配）
  - description: 可选，用于UI中显示额外说明
  - order: 分类内排序序号

# 提取指导

1. 根据素材内容合理划分分类，如"设计风格"、"角色设定"、"场景描述"等
2. 提示词名称应简短易识别，content保留完整的原始提示词文本
3. 如果素材已有分类结构，保持原有分类；若无，根据内容语义自动归类
4. 所有id必须唯一，不同提示词和分类不能使用相同id
5. order字段按提取顺序或素材原有顺序填写

# 输出流程

1. 先展示生成的JSON内容预览，询问用户是否满意
2. 用户确认后，将JSON写入文件（文件名建议格式：prompts-日期.json，如 prompts-2024-01-15.json）
3. 如用户不满意，根据反馈调整后重新确认

# 示例

用户素材：
- "赛博朋克风格：霓虹灯光、未来城市、高科技与低生活对比"
- "水彩画风格：柔和边缘、透明色彩、自然纹理"

Agent先展示预览：
\`\`\`json
{
  "version": "1.0.0",
  "userData": {
    "categories": [
      { "id": "cat-001", "name": "设计风格", "order": 0 }
    ],
    "prompts": [
      {
        "id": "prompt-001",
        "name": "赛博朋克",
        "content": "赛博朋克风格：霓虹灯光、未来城市、高科技与低生活对比",
        "categoryId": "cat-001",
        "order": 0
      },
      {
        "id": "prompt-002",
        "name": "水彩画",
        "content": "水彩画风格：柔和边缘、透明色彩、自然纹理",
        "categoryId": "cat-001",
        "order": 1
      }
    ]
  }
}
\`\`\`

然后询问："以上JSON包含2条提示词，是否确认输出文件？"
用户确认后，保存为 prompts-2024-01-15.json 文件。`

/**
 * ImportExportSection - Handles import/export of prompts in SidePanel settings
 * Provides buttons to import and export prompt data as JSON files
 */
export function ImportExportSection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /**
   * Export current prompt data to JSON file
   * Flow: GET_STORAGE -> EXPORT_DATA (chrome.downloads)
   */
  const handleExport = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get current data from storage
      const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
      if (response?.success && response.data) {
        const data: StorageSchema = response.data
        const exportResponse = await chrome.runtime.sendMessage({
          type: MessageType.EXPORT_DATA,
          payload: data
        })
        if (exportResponse?.success) {
          setSuccess('导出成功')
        } else {
          setError(exportResponse?.error || '导出失败')
        }
      } else {
        setError('获取数据失败')
      }
    } catch {
      setError('导出失败')
    } finally {
      setLoading(false)
      // Auto-dismiss messages after 2 seconds
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }
  }

  /**
   * Import prompt data from JSON file
   * Flow: file input -> readImportFile -> mergeImportData -> SET_STORAGE
   */
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setLoading(true)
      setError(null)
      setSuccess(null)

      const result = await readImportFile(file)

      if (result.valid && result.data) {
        // Get current data
        const response = await chrome.runtime.sendMessage({ type: MessageType.GET_STORAGE })
        if (response?.success && response.data) {
          const currentData = response.data.userData
          const merged = mergeImportData(
            { prompts: currentData.prompts, categories: currentData.categories },
            result.data.userData
          )

          // Save merged data
          const saveResponse = await chrome.runtime.sendMessage({
            type: MessageType.SET_STORAGE,
            payload: {
              version: chrome.runtime.getManifest().version,
              userData: { prompts: merged.prompts, categories: merged.categories }
            }
          })

          if (saveResponse?.success) {
            setSuccess(`导入成功：新增 ${merged.addedCount} 条`)
          } else {
            setError('保存数据失败')
          }
        } else {
          setError('获取当前数据失败')
        }
      } else {
        setError(result.error || '导入失败')
      }

      setLoading(false)
      // Auto-dismiss messages after 2 seconds
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 2000)
    }

    input.click()
  }

  /**
   * Copy agent instruction to clipboard
   */
  const handleCopyInstruction = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_INSTRUCTION_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('复制失败')
      setTimeout(() => setError(null), 2000)
    }
  }

  return (
    <div className="w-full space-y-4 p-4">
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-4">导入导出</h3>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={loading}
            className="flex-1 h-10"
          >
            <Upload className="w-4 h-4" />
            {loading ? '导入中...' : '导入数据'}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={loading}
            className="flex-1 h-10"
          >
            <Download className="w-4 h-4" />
            {loading ? '导出中...' : '导出数据'}
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500 mt-4">{error}</p>
        )}

        {/* Success message */}
        {success && (
          <p className="text-sm text-green-600 mt-4">{success}</p>
        )}

        {/* Tip */}
        <p className="text-xs text-gray-500 mt-4">
          提示：导入时会保留已有数据，仅添加新内容
        </p>
      </div>

      {/* Agent instruction section */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Agent指令</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyInstruction}
            className="h-8 px-3"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          将此指令粘贴给你的AI Agent（如Claude、ChatGPT），它可以帮助你从文件、网页或文本中提取提示词并生成可导入的JSON
        </p>

        {/* Instruction content */}
        <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-700 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {AGENT_INSTRUCTION_PROMPT}
        </div>
      </div>
    </div>
  )
}