/**
 * CategorySelectDialog - Portal-rendered dialog for selecting target category
 * Phase 8: Inline styled dialog for collect flow (D-11 through D-15)
 */

import { createPortal } from 'react-dom'
import { useState, useEffect, useCallback } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Category } from '../../shared/types'

const PORTAL_ID = 'oh-my-prompt-dropdown-portal'

function getPortalContainer(): HTMLElement {
  let container = document.getElementById(PORTAL_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = PORTAL_ID
    document.body.appendChild(container)
  }
  return container
}

interface CategorySelectDialogProps {
  categories: Category[]
  isOpen: boolean
  onClose: () => void
  onConfirm: (categoryId: string, newCategoryName?: string) => void
}

export function CategorySelectDialog({
  categories,
  isOpen,
  onClose,
  onConfirm
}: CategorySelectDialogProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCategoryId(null)
      setNewCategoryName('')
      setIsCreatingNew(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Overlay click handler - stop propagation to prevent dropdown close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    setIsCreatingNew(false)
    setNewCategoryName('')
  }

  // Handle new category input
  const handleNewCategoryChange = (value: string) => {
    setNewCategoryName(value)
    setIsCreatingNew(value.trim().length > 0)
    if (value.trim().length > 0) {
      setSelectedCategoryId(null)
    }
  }

  // Handle confirm
  const handleConfirm = () => {
    if (isCreatingNew && newCategoryName.trim()) {
      onConfirm('', newCategoryName.trim())
    } else if (selectedCategoryId) {
      onConfirm(selectedCategoryId)
    }
  }

  // Check if confirm is valid
  const canConfirm = selectedCategoryId !== null || (isCreatingNew && newCategoryName.trim().length > 0)

  if (!isOpen) return null

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 2147483647,
        }}
      />
      {/* Dialog container (D-11: Portal, D-12: Category list + new category) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '320px', // UI-SPEC
          maxHeight: '400px', // UI-SPEC
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
          zIndex: 2147483647,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header (D-15) */}
        <div style={{
          padding: '16px', // UI-SPEC
          borderBottom: '1px solid #E5E5E5', // UI-SPEC
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#171717' }}>
            选择收藏分类
          </span>
        </div>

        {/* Category list (D-12, D-13) */}
        <div style={{
          padding: '12px',
          maxHeight: '200px', // UI-SPEC
          overflow: 'auto', // UI-SPEC
        }}>
          {categories.map(cat => (
            <div
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              role="option"
              aria-selected={selectedCategoryId === cat.id}
              style={{
                padding: '12px', // UI-SPEC
                display: 'flex',
                alignItems: 'center',
                background: selectedCategoryId === cat.id ? '#f0f0f0' : 'transparent', // UI-SPEC
                borderRadius: '6px', // UI-SPEC
                cursor: 'pointer',
                marginBottom: '4px',
              }}
            >
              {selectedCategoryId === cat.id && (
                <Check style={{ width: 14, height: 14, marginRight: 8, color: '#171717' }} /> // UI-SPEC
              )}
              <span style={{ fontSize: '12px', color: '#171717' }}>{cat.name}</span>
            </div>
          ))}
        </div>

        {/* New category input section (D-14) */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid #E5E5E5', // UI-SPEC
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={newCategoryName}
              onChange={(e) => handleNewCategoryChange(e.target.value)}
              placeholder="新建分类..."
              aria-label="新建分类"
              style={{
                flex: 1,
                padding: '8px 12px', // UI-SPEC
                border: '1px solid #E5E5E5', // UI-SPEC
                borderRadius: '6px', // UI-SPEC
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                if (newCategoryName.trim()) {
                  handleNewCategoryChange(newCategoryName)
                  setIsCreatingNew(true)
                }
              }}
              disabled={!newCategoryName.trim()}
              aria-label="创建"
              style={{
                padding: '8px 12px',
                background: '#f8f8f8', // UI-SPEC
                border: '1px solid #E5E5E5',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: newCategoryName.trim() ? 'pointer' : 'not-allowed',
                opacity: newCategoryName.trim() ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Footer (D-15) */}
        <div style={{
          padding: '12px 16px', // UI-SPEC
          borderTop: '1px solid #E5E5E5', // UI-SPEC
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={onClose}
            aria-label="取消"
            style={{
              flex: 1, // UI-SPEC
              padding: '10px',
              background: '#f8f8f8', // UI-SPEC
              border: '1px solid #E5E5E5',
              borderRadius: '6px', // UI-SPEC
              fontSize: '12px',
              fontWeight: 500,
              color: '#171717',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            aria-label="确认收藏"
            style={{
              flex: 1, // UI-SPEC
              padding: '10px',
              background: '#171717', // UI-SPEC primary
              border: 'none',
              borderRadius: '6px', // UI-SPEC
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.5,
            }}
          >
            确认收藏
          </button>
        </div>
      </div>
    </>,
    getPortalContainer()
  )
}