/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import { MessageType } from '../../shared/messages'
import type { Prompt, Category, StorageSchema } from '../../shared/types'
import { InsertHandler } from '../insert-handler'

interface DropdownAppProps {
  lovartIconColor: string
  inputElement: HTMLElement
}

export function DropdownApp({ lovartIconColor, inputElement }: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  // Storage-backed state
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Initialize InsertHandler directly in useRef to avoid timing issues
  // (useEffect runs after first render, causing first click to fail)
  const insertHandlerRef = useRef<InsertHandler>(new InsertHandler())

  // Fetch storage data on mount
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: MessageType.GET_STORAGE },
      (response) => {
        if (response?.success && response.data) {
          const data = response.data as StorageSchema
          setPrompts(data.prompts)
          setCategories(data.categories)
        }
        setIsLoading(false)
      }
    )
  }, [])

  /**
   * Toggle dropdown visibility (D-12: toggle behavior)
   */
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
    // Reset scroll position on open
    if (!isOpen) {
      const dropdown = document.querySelector('#lovart-injector-host')?.shadowRoot?.querySelector('.dropdown-container')
      if (dropdown) {
        dropdown.scrollTop = 0
      }
    }
  }, [isOpen])

  /**
   * Handle prompt selection (D-11: keep open after insert)
   */
  const handleSelect = useCallback((prompt: Prompt) => {
    // Insert prompt into Lovart input
    insertHandlerRef.current.insertPrompt(inputElement, prompt.content)

    // Set visual feedback
    setSelectedPromptId(prompt.id)

    // Visual feedback fades after 2s (UI-SPEC)
    setTimeout(() => {
      setSelectedPromptId(null)
    }, 2000)

    // Keep dropdown open (D-11)
  }, [inputElement])

  // Loading state - show trigger button with loading dropdown
  if (isLoading) {
    return (
      <div className="dropdown-app">
        <TriggerButton
          isOpen={isOpen}
          onClick={handleToggle}
          lovartIconColor={lovartIconColor}
        />
        {isOpen && (
          <div className="dropdown-container open" style={{ top: '48px', left: '0', width: '280px' }}>
            <div className="empty-state">
              <div className="empty-message">加载中...</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Empty state - still show trigger button but display message in dropdown
  if (prompts.length === 0) {
    return (
      <div className="dropdown-app">
        <TriggerButton
          isOpen={isOpen}
          onClick={handleToggle}
          lovartIconColor={lovartIconColor}
        />
        {isOpen && (
          <div className="dropdown-container open" style={{ top: '48px', left: '0', width: '280px' }}>
            <div className="empty-state">
              <div className="empty-message">暂无提示词，请在插件中添加</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dropdown-app">
      <TriggerButton
        isOpen={isOpen}
        onClick={handleToggle}
        lovartIconColor={lovartIconColor}
      />

      <DropdownContainer
        prompts={prompts}
        categories={categories}
        onSelect={handleSelect}
        isOpen={isOpen}
        selectedPromptId={selectedPromptId}
      />
    </div>
  )
}