/**
 * PromptEditModal - Modal for adding/editing prompts
 * Uses BaseModal structure with inline styles
 */

import { useState, useEffect } from 'react'
import { BaseModal } from './BaseModal'
import type { Prompt, Category } from '../../shared/types'

interface PromptEditModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  prompt?: Prompt
  categories: Category[]
  defaultCategoryId?: string
  onConfirm: (data: { name: string; description?: string; content: string; categoryId: string }) => void
}

export function PromptEditModal({
  isOpen,
  onClose,
  mode,
  prompt,
  categories,
  defaultCategoryId,
  onConfirm,
}: PromptEditModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        setName(prompt.name)
        setDescription(prompt.description || '')
        setContent(prompt.content)
        setCategoryId(prompt.categoryId)
      } else {
        setName('')
        setDescription('')
        setContent('')
        // Use default category or first available
        setCategoryId(defaultCategoryId || categories[0]?.id || '')
      }
    }
  }, [isOpen, prompt, defaultCategoryId, categories])

  const handleConfirm = () => {
    const trimmedName = name.trim()
    const trimmedContent = content.trim()
    if (!trimmedName || !trimmedContent || !categoryId) return

    onConfirm({
      name: trimmedName,
      description: description.trim() || undefined,
      content: trimmedContent,
      categoryId,
    })
    onClose()
  }

  const isValid = name.trim() && content.trim() && categoryId

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'add' ? '添加提示词' : '编辑提示词'}
      description={mode === 'add' ? '添加新的提示词到您的收藏' : '修改提示词的名称、内容和分类'}
      width={480}
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
            disabled={!isValid}
            style={{
              padding: '10px 16px',
              background: '#171717',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#fff',
              cursor: isValid ? 'pointer' : 'not-allowed',
              opacity: isValid ? 1 : 0.5,
            }}
          >
            {mode === 'add' ? '添加' : '保存'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: '12px',
            color: '#64748B',
          }}>
            名称
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="提示词名称"
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

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: '12px',
            color: '#64748B',
          }}>
            描述（选填）
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述，用于列表展示"
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

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: '12px',
            color: '#64748B',
          }}>
            内容
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="提示词内容"
            rows={8}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              resize: 'vertical',
              minHeight: '120px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: '12px',
            color: '#64748B',
          }}>
            所属分类
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #E5E5E5',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </BaseModal>
  )
}