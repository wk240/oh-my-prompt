/**
 * DeleteConfirmModal - Modal for confirming delete operations
 * Uses BaseModal structure with inline styles
 */

import { BaseModal } from './BaseModal'
import { AlertTriangle } from 'lucide-react'

interface DeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  itemName: string
  itemType: 'category' | 'prompt'
  description?: string
  onConfirm: () => void
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  itemName,
  itemType,
  description,
  onConfirm,
}: DeleteConfirmModalProps) {
  const defaultDescription = itemType === 'category'
    ? '删除分类后，该分类下的所有提示词也会一并删除，此操作无法撤销。'
    : '删除后无法恢复，请谨慎操作。'

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="确认删除"
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
            style={{
              padding: '10px 16px',
              background: '#dc2626',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            删除
          </button>
        </>
      }
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'center',
        textAlign: 'center',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: '#fef2f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <AlertTriangle style={{ width: 24, height: 24, color: '#dc2626' }} />
        </div>
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#171717',
        }}>
          确定删除「{itemName}」？
        </div>
        <div style={{
          fontSize: '12px',
          color: '#64748B',
          lineHeight: '1.5',
        }}>
          {description || defaultDescription}
        </div>
      </div>
    </BaseModal>
  )
}