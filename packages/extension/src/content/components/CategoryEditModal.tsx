/**
 * CategoryEditModal - Modal for adding/editing categories
 * Uses BaseModal structure with inline styles
 */

import { useState, useEffect } from 'react'
import { BaseModal } from './BaseModal'

interface CategoryEditModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  initialName?: string
  onConfirm: (name: string) => void
}

export function CategoryEditModal({
  isOpen,
  onClose,
  mode,
  initialName = '',
  onConfirm,
}: CategoryEditModalProps) {
  const [name, setName] = useState(initialName)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName)
    }
  }, [isOpen, initialName])

  const handleConfirm = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onConfirm(trimmedName)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      handleConfirm()
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'add' ? '添加分类' : '编辑分类'}
      description={mode === 'add' ? '创建新的提示词分类' : '修改分类名称'}
      width={320}
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px',
              background: '#f8f8f8',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
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
            disabled={!name.trim()}
            style={{
              padding: '10px 16px',
              background: '#171717',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            {mode === 'add' ? '添加' : '保存'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{
          fontSize: '12px',
          color: '#64748B',
        }}>
          分类名称
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入分类名称"
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #E5E5E5',
            borderRadius: '6px',
            fontSize: '12px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </BaseModal>
  )
}