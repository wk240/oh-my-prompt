import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Upload, Download, Copy, Check } from 'lucide-react'
import { MessageType } from '@oh-my-prompt/shared/messages'
import type { StorageSchema } from '@oh-my-prompt/shared/types'
import { readImportFile, mergeImportData } from '@/lib/import-export'

// Agent instruction prompt for generating importable JSON
const AGENT_INSTRUCTION_PROMPT = `# Oh My Prompt 导入 JSON 生成指令

你是提示词资料整理 Agent。请把用户提供的素材（文件、网页、表格、Markdown、聊天记录、纯文本等）整理成可直接导入 Oh My Prompt 浏览器插件的 JSON 数据。

## 工作目标

1. 提取真正可复用的提示词内容，不要把普通说明、标题、广告语、目录、版权声明当作提示词。
2. 为提示词建立清晰分类，生成简短易识别的名称。
3. 输出符合下方 schema 的 JSON，确保 Oh My Prompt 可以直接导入。
4. 不要覆盖或合并用户本地现有数据；导入时插件会自动追加新内容。

## JSON Schema

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

## 字段规则

- categories: 分类数组。至少 1 个分类。
  - id: 字符串，必须唯一。优先使用 UUID v4 格式，例如 "a1b2c3d4-e5f6-4890-abcd-ef1234567890"。
  - name: 分类名称，2-8 个字为佳，例如 "设计风格"、"角色设定"、"电商文案"。
  - order: 分类排序，从 0 开始递增。

- prompts: 提示词数组。
  - id: 字符串，必须唯一。优先使用 UUID v4 格式。
  - name: 提示词名称，用于下拉菜单显示，建议 2-12 个字，避免过长。
  - content: 完整提示词正文。这是实际插入到输入框的文本，必须保留原文中的关键变量、占位符、参数和换行。
  - categoryId: 必须匹配 categories 中某个分类的 id。
  - description: 可选。写一句用途说明，不要重复 name。
  - order: 在所属分类内从 0 开始递增。

## 提取与整理规则

1. 如果素材已有分类结构，优先沿用原结构；如果没有，请按用途语义自动归类。
2. 如果同一提示词有中英文版本、正负面提示词、参数说明，请尽量放在同一个 content 中，不要拆散。
3. 如果提示词包含变量，占位符原样保留，例如 "{主题}"、"[style]"、"<product>"。
4. 如果多条提示词内容高度重复，只保留更完整、更通用的一条。
5. 不要编造素材中不存在的专业内容；可以为分类名、提示词 name、description 做简洁归纳。
6. content 中的换行请使用 JSON 字符串可解析的 "\\n"。
7. 不要输出注释、尾随逗号、Markdown 代码块外的解释文字。

## 输出流程

1. 先给出一份 JSON 预览，并说明提取了多少个分类、多少条提示词。
2. 等用户确认后，再输出最终 JSON 文件内容。
3. 最终 JSON 必须只包含一个 JSON 对象，不要包含 Markdown 代码块、额外说明或多个候选版本。

## 示例

用户素材：
- "赛博朋克风格：霓虹灯光、未来城市、高科技与低生活对比"
- "水彩画风格：柔和边缘、透明色彩、自然纹理"

预览 JSON：
\`\`\`json
{
  "version": "1.0.0",
  "userData": {
    "categories": [
      { "id": "2c86c514-9371-4d4f-9e98-f4a8c590c3e5", "name": "设计风格", "order": 0 }
    ],
    "prompts": [
      {
        "id": "d7ac1c1e-1f88-4e9a-b058-746b203f8f84",
        "name": "赛博朋克",
        "content": "赛博朋克风格：霓虹灯光、未来城市、高科技与低生活对比",
        "categoryId": "2c86c514-9371-4d4f-9e98-f4a8c590c3e5",
        "description": "用于未来城市和霓虹视觉风格",
        "order": 0
      },
      {
        "id": "73b39277-0f4f-4d63-a62f-5b49ff89662c",
        "name": "水彩画",
        "content": "水彩画风格：柔和边缘、透明色彩、自然纹理",
        "categoryId": "2c86c514-9371-4d4f-9e98-f4a8c590c3e5",
        "description": "用于柔和透明的手绘质感",
        "order": 1
      }
    ]
  }
}
\`\`\`

然后询问："已整理 1 个分类、2 条提示词。是否确认生成最终 JSON？"`

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
