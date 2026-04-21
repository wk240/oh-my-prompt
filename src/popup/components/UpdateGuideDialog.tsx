import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { Download, RefreshCw, Check, ExternalLink, ChevronRight, ChevronLeft, FileDown, FileUp } from 'lucide-react'
import type { UpdateStatus } from '../../lib/version-checker'

interface UpdateGuideDialogProps {
  status: UpdateStatus | null
  open: boolean
  onClose: () => void
}

const STEPS = [
  {
    id: 1,
    title: '导出数据备份',
    description: '更新前先导出当前提示词数据，防止数据丢失',
    icon: FileDown,
  },
  {
    id: 2,
    title: '下载新版本',
    description: '从 GitHub Releases 页面下载最新的插件文件',
    icon: Download,
  },
  {
    id: 3,
    title: '解压并更新',
    description: '解压文件后在浏览器扩展管理页面重新加载插件',
    icon: RefreshCw,
  },
  {
    id: 4,
    title: '导入数据恢复',
    description: '更新完成后导入之前备份的提示词数据',
    icon: FileUp,
  },
]

function UpdateGuideDialog({ status, open, onClose }: UpdateGuideDialogProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleDownload = () => {
    if (status?.downloadUrl) {
      window.open(status.downloadUrl, '_blank')
    }
  }

  const handleOpenExtensions = () => {
    // Provide instructions for different browsers
    window.open('chrome://extensions', '_blank')
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    setCurrentStep(0)
    onClose()
  }

  if (!status) return null

  const step = STEPS[currentStep]
  const StepIcon = step.icon

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[520px] max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-orange-500" />
            更新引导
          </DialogTitle>
          <DialogDescription>
            检测到新版本可用，按照以下步骤完成更新
          </DialogDescription>
        </DialogHeader>

        {/* Version info */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 mb-1">版本对比</div>
              <div className="flex items-center gap-3">
                <span className="text-base font-medium text-gray-700">
                  当前: <span className="text-gray-500">v{status.currentVersion}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-orange-500" />
                <span className="text-base font-medium text-orange-700">
                  最新: <span className="text-orange-600">v{status.latestVersion}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Release notes */}
        {status.releaseNotes && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 max-h-[120px] overflow-y-auto">
            <div className="text-sm text-gray-600 mb-1">更新说明</div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {status.releaseNotes.slice(0, 500)}
              {status.releaseNotes.length > 500 && '...'}
            </div>
          </div>
        )}

        {/* Step progress */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {STEPS.map((s, idx) => (
            <div
              key={s.id}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                idx < currentStep
                  ? 'bg-green-500 text-white'
                  : idx === currentStep
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {idx < currentStep ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="text-sm font-medium">{s.id}</span>
              )}
            </div>
          ))}
        </div>

        {/* Current step content */}
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-base font-medium text-gray-800">
                步骤 {step.id}: {step.title}
              </div>
              <div className="text-sm text-gray-500">{step.description}</div>
            </div>
          </div>

          {/* Step-specific instructions */}
          {currentStep === 0 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                点击下方按钮打开插件管理界面，在"数据管理"选项卡中点击"导出数据"按钮
              </p>
              <p className="text-xs text-gray-400">
                建议将备份文件保存到易于查找的位置，更新完成后需要导入恢复
              </p>
            </div>
          )}

          {currentStep === 1 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                点击下方按钮打开 GitHub Releases 页面，下载最新的 .zip 文件
              </p>
              <Button onClick={handleDownload} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                打开下载页面
              </Button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                1. 解压下载的 .zip 文件到本地文件夹
              </p>
              <p className="text-sm text-gray-600 mb-2">
                2. 打开浏览器扩展管理页面，找到本插件，点击"重新加载"按钮
              </p>
              <Button variant="outline" onClick={handleOpenExtensions} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                打开扩展管理
              </Button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                打开插件管理界面，在"数据管理"选项卡中点击"导入数据"按钮，选择之前导出的 JSON 备份文件
              </p>
              <p className="text-xs text-gray-400">
                导入时会自动合并数据，已有的提示词会保留，新增的会添加进来
              </p>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            上一步
          </Button>

          <div className="flex items-center gap-2">
            {currentStep === STEPS.length - 1 ? (
              <Button onClick={handleClose}>
                完成
              </Button>
            ) : (
              <Button onClick={handleNext} className="flex items-center gap-1">
                下一步
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UpdateGuideDialog