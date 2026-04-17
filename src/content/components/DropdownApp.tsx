/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import { MessageType } from '../../shared/messages'
import type { Prompt, StorageSchema } from '../../shared/types'
import { InsertHandler } from '../insert-handler'

interface DropdownAppProps {
  inputElement: HTMLElement
}

export function DropdownApp({ inputElement }: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const insertHandlerRef = useRef<InsertHandler>(new InsertHandler())

  useEffect(() => {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.log('[Lovart Injector] Extension context invalidated')
      setIsLoading(false)
      return
    }

    try {
      chrome.runtime.sendMessage(
        { type: MessageType.GET_STORAGE },
        (response) => {
          // Check again in callback - context might have been invalidated
          if (chrome.runtime?.lastError) {
            console.log('[Lovart Injector] Runtime error:', chrome.runtime.lastError.message)
            setIsLoading(false)
            return
          }
          if (response?.success && response.data) {
            const data = response.data as StorageSchema
            setPrompts(data.prompts)
          }
          setIsLoading(false)
        }
      )
    } catch (error) {
      console.log('[Lovart Injector] Extension context error:', error)
      setIsLoading(false)
    }
  }, [])

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleSelect = useCallback((prompt: Prompt) => {
    insertHandlerRef.current.insertPrompt(inputElement, prompt.content)
    setSelectedPromptId(prompt.id)
    setTimeout(() => {
      setSelectedPromptId(null)
    }, 2000)
  }, [inputElement])

  if (isLoading) {
    return (
      <div className="dropdown-app">
        <TriggerButton
          isOpen={isOpen}
          onClick={handleToggle}
        />
        {isOpen && (
          <div className="dropdown-container open" style={{ top: '52px', left: '0', width: '360px' }}>
            <div className="dropdown-header">
              <span className="dropdown-header-title">PROMPTS</span>
            </div>
            <div className="empty-state">
              <div className="empty-message">加载中...</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (prompts.length === 0) {
    return (
      <div className="dropdown-app">
        <TriggerButton
          isOpen={isOpen}
          onClick={handleToggle}
        />
        {isOpen && (
          <div className="dropdown-container open" style={{ top: '52px', left: '0', width: '360px' }}>
            <div className="dropdown-header">
              <span className="dropdown-header-title">PROMPTS</span>
            </div>
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
      />

      <DropdownContainer
        prompts={prompts}
        onSelect={handleSelect}
        isOpen={isOpen}
        selectedPromptId={selectedPromptId}
        onClose={handleClose}
      />
    </div>
  )
}