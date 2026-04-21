/**
 * UpdateGuideModal - Update guide modal for content script dropdown
 * Rendered via Portal, styled inline to match Lovart-native dropdown style
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateStatus } from '../../shared/types'
import { Download, RefreshCw, Check, ExternalLink, ChevronRight, ChevronLeft, X, FileDown, FileUp } from 'lucide-react'

interface UpdateGuideModalProps {
  status: UpdateStatus | null
  isOpen: boolean
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

const MODAL_ID = 'oh-my-prompt-script-update-guide-modal'

// Get portal container from dropdown (render inside to avoid click-outside detection)
function getModalContainer(): HTMLElement {
  // Render inside dropdown portal to avoid triggering click-outside
  const dropdownPortal = document.getElementById('oh-my-prompt-script-dropdown-portal')
  if (dropdownPortal) {
    let container = dropdownPortal.querySelector(`#${MODAL_ID}`) as HTMLElement
    if (!container) {
      container = document.createElement('div')
      container.id = MODAL_ID
      dropdownPortal.appendChild(container)
    }
    return container
  }
  // Fallback: create standalone container
  let container = document.getElementById(MODAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = MODAL_ID
    document.body.appendChild(container)
  }
  return container
}

// Inline styles for modal (no external CSS dependency)
const modalStyles = `
  #${MODAL_ID} .update-guide-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #${MODAL_ID} .update-guide-modal {
    width: 520px;
    max-width: 90vw;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.25);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  #${MODAL_ID} .update-guide-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid #E5E5E5;
  }

  #${MODAL_ID} .update-guide-title {
    font-size: 16px;
    font-weight: 600;
    color: #171717;
  }

  #${MODAL_ID} .update-guide-close {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: #64748B;
    margin-left: auto;
  }

  #${MODAL_ID} .update-guide-close:hover {
    background: #f8f8f8;
    color: #171717;
  }

  #${MODAL_ID} .update-guide-content {
    padding: 20px;
  }

  #${MODAL_ID} .version-compare {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  #${MODAL_ID} .version-compare-label {
    font-size: 12px;
    color: #856404;
    margin-bottom: 4px;
  }

  #${MODAL_ID} .version-compare-values {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  #${MODAL_ID} .version-current {
    font-size: 14px;
    color: #64748B;
  }

  #${MODAL_ID} .version-arrow {
    color: #d97706;
  }

  #${MODAL_ID} .version-latest {
    font-size: 14px;
    color: #d97706;
    font-weight: 600;
  }

  #${MODAL_ID} .release-notes {
    background: #f8f8f8;
    border: 1px solid #E5E5E5;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    max-height: 100px;
    overflow-y: auto;
  }

  #${MODAL_ID} .release-notes-label {
    font-size: 12px;
    color: #64748B;
    margin-bottom: 4px;
  }

  #${MODAL_ID} .release-notes-content {
    font-size: 12px;
    color: #171717;
    white-space: pre-wrap;
  }

  #${MODAL_ID} .step-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  #${MODAL_ID} .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.2s, color 0.2s;
  }

  #${MODAL_ID} .step-dot.completed {
    background: #16a34a;
    color: #ffffff;
  }

  #${MODAL_ID} .step-dot.active {
    background: #d97706;
    color: #ffffff;
  }

  #${MODAL_ID} .step-dot.pending {
    background: #E5E5E5;
    color: #64748B;
  }

  #${MODAL_ID} .step-card {
    border: 1px solid #E5E5E5;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  #${MODAL_ID} .step-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  #${MODAL_ID} .step-icon-wrapper {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #fff3cd;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #${MODAL_ID} .step-icon {
    width: 18px;
    height: 18px;
    color: #d97706;
  }

  #${MODAL_ID} .step-title {
    font-size: 14px;
    font-weight: 600;
    color: #171717;
  }

  #${MODAL_ID} .step-desc {
    font-size: 12px;
    color: #64748B;
  }

  #${MODAL_ID} .step-actions {
    padding-left: 48px;
  }

  #${MODAL_ID} .step-text {
    font-size: 12px;
    color: #171717;
    margin-bottom: 8px;
  }

  #${MODAL_ID} .step-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #171717;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  #${MODAL_ID} .step-btn:hover {
    background: #404040;
  }

  #${MODAL_ID} .step-btn-outline {
    background: #ffffff;
    color: #171717;
    border: 1px solid #E5E5E5;
  }

  #${MODAL_ID} .step-btn-outline:hover {
    background: #f8f8f8;
  }

  #${MODAL_ID} .step-note {
    font-size: 11px;
    color: #64748B;
    margin-top: 8px;
  }

  #${MODAL_ID} .update-guide-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-top: 1px solid #E5E5E5;
  }

  #${MODAL_ID} .nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: transparent;
    color: #64748B;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  #${MODAL_ID} .nav-btn:hover:not(:disabled) {
    background: #f8f8f8;
    color: #171717;
  }

  #${MODAL_ID} .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  #${MODAL_ID} .nav-btn-primary {
    background: #171717;
    color: #ffffff;
  }

  #${MODAL_ID} .nav-btn-primary:hover {
    background: #404040;
  }
`

// Inject styles once
let stylesInjected = false
function injectStyles() {
  if (!stylesInjected) {
    const style = document.createElement('style')
    style.id = 'oh-my-prompt-script-update-guide-styles'
    style.textContent = modalStyles
    document.head.appendChild(style)
    stylesInjected = true
  }
}

export function UpdateGuideModal({ status, isOpen, onClose }: UpdateGuideModalProps) {
  const [currentStep, setCurrentStep] = useState(0)

  if (!isOpen || !status) return null

  injectStyles()

  const handleDownload = () => {
    if (status?.downloadUrl) {
      window.open(status.downloadUrl, '_blank')
    }
  }

  const handleOpenExtensions = () => {
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

  const step = STEPS[currentStep]
  const StepIcon = step.icon

  return createPortal(
    <div className="update-guide-overlay" onClick={handleClose}>
      <div className="update-guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="update-guide-header">
          <Download style={{ width: 18, height: 18, color: '#d97706' }} />
          <span className="update-guide-title">更新引导</span>
          <button className="update-guide-close" onClick={handleClose}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div className="update-guide-content">
          {/* Version compare */}
          <div className="version-compare">
            <div className="version-compare-label">版本对比</div>
            <div className="version-compare-values">
              <span className="version-current">当前: v{status.currentVersion}</span>
              <ChevronRight className="version-arrow" style={{ width: 14, height: 14 }} />
              <span className="version-latest">最新: v{status.latestVersion}</span>
            </div>
          </div>

          {/* Release notes */}
          {status.releaseNotes && (
            <div className="release-notes">
              <div className="release-notes-label">更新说明</div>
              <div className="release-notes-content">
                {status.releaseNotes.slice(0, 500)}
                {status.releaseNotes.length > 500 && '...'}
              </div>
            </div>
          )}

          {/* Step progress */}
          <div className="step-progress">
            {STEPS.map((s, idx) => (
              <div
                key={s.id}
                className={`step-dot ${idx < currentStep ? 'completed' : idx === currentStep ? 'active' : 'pending'}`}
              >
                {idx < currentStep ? (
                  <Check style={{ width: 14, height: 14 }} />
                ) : (
                  s.id
                )}
              </div>
            ))}
          </div>

          {/* Current step */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-icon-wrapper">
                <StepIcon className="step-icon" />
              </div>
              <div>
                <div className="step-title">步骤 {step.id}: {step.title}</div>
                <div className="step-desc">{step.description}</div>
              </div>
            </div>

            <div className="step-actions">
              {currentStep === 0 && (
                <>
                  <p className="step-text">点击插件图标打开管理界面，在"数据管理"选项卡中点击"导出数据"按钮，将提示词保存为 JSON 文件。</p>
                  <p className="step-note">建议将备份文件保存到易于查找的位置，更新完成后需要导入恢复。</p>
                </>
              )}

              {currentStep === 1 && (
                <>
                  <p className="step-text">点击下方按钮打开 GitHub Releases 页面，下载最新的 .zip 文件</p>
                  <button className="step-btn" onClick={handleDownload}>
                    <ExternalLink style={{ width: 12, height: 12 }} />
                    打开下载页面
                  </button>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <p className="step-text">1. 解压下载的 .zip 文件到本地文件夹</p>
                  <p className="step-text">2. 打开浏览器扩展管理页面，找到本插件，点击"重新加载"按钮</p>
                  <button className="step-btn step-btn-outline" onClick={handleOpenExtensions}>
                    <ExternalLink style={{ width: 12, height: 12 }} />
                    打开扩展管理
                  </button>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <p className="step-text">更新完成后，打开插件管理界面，在"数据管理"选项卡中点击"导入数据"按钮，选择之前导出的 JSON 备份文件。</p>
                  <p className="step-note">导入时会自动合并数据，已有的提示词会保留，新增的会添加进来。</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="update-guide-footer">
          <button
            className="nav-btn"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            上一步
          </button>

          {currentStep === STEPS.length - 1 ? (
            <button className="nav-btn nav-btn-primary" onClick={handleClose}>
              完成
            </button>
          ) : (
            <button className="nav-btn nav-btn-primary" onClick={handleNext}>
              下一步
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>
    </div>,
    getModalContainer()
  )
}