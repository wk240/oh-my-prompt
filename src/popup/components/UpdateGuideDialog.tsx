import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { Download, FolderOpen, RefreshCw, Check, ExternalLink, ChevronRight, ChevronLeft } from 'lucide-react'
import type { UpdateStatus } from '../../lib/version-checker'

interface UpdateGuideDialogProps {
  status: UpdateStatus | null
  open: boolean
  onClose: () => void
}

const STEPS = [
  {
    id: 1,
    title: '下载新版本',
    description: '从 GitHub Releases 页面下载最新的插件文件',
    icon: Download,
  },
  {
    id: 2,
    title: '解压文件',
    description: '如果下载的是 .zip 文件，解压到本地文件夹',
    icon: FolderOpen,
  },
  {
    id: 3,
    title: '更新插件',
    description: '在浏览器扩展管理页面重新加载插件',
    icon: RefreshCw,
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
                点击下方按钮打开 GitHub Releases 页面，下载最新的 .zip 文件
              </p>
              <Button onClick={handleDownload} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                打开下载页面
              </Button>
            </div>
          )}

          {currentStep === 1 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                下载完成后，找到下载的 .zip 文件，右键选择"解压到当前文件夹"或使用解压软件解压
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <div className="mt-3 pl-13">
              <p className="text-sm text-gray-600 mb-2">
                打开浏览器扩展管理页面，找到本插件，点击"重新加载"按钮（刷新图标）
              </p>
              <Button variant="outline" onClick={handleOpenExtensions} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                打开扩展管理
              </Button>
              <p className="text-xs text-gray-400 mt-2">
                如果是开发者模式加载的解压扩展，点击"重新加载"即可
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