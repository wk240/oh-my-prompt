/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import type { Prompt } from '../../shared/types'
import type { ResourcePrompt } from '../../shared/types'
import { InsertHandler } from '../insert-handler'
import { usePromptStore } from '../../lib/store'
import { MessageType } from '../../shared/messages'

interface DropdownAppProps {
  inputElement: HTMLElement
}

export function DropdownApp({ inputElement }: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const insertHandlerRef = useRef<InsertHandler>(new InsertHandler())

  // Subscribe to Zustand store for reactive updates
  const prompts = usePromptStore((state) => state.prompts)
  const categories = usePromptStore((state) => state.categories)
  const isLoading = usePromptStore((state) => state.isLoading)
  const loadFromStorage = usePromptStore((state) => state.loadFromStorage)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

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

  const handleRefresh = useCallback(async () => {
    // Open backup page instead of doing backup in content script
    console.log('[Oh My Prompt Script] Refresh clicked, opening backup page...')
    await chrome.runtime.sendMessage({ type: MessageType.OPEN_BACKUP_PAGE })
    return { success: true, backupSuccess: false }
  }, [])

  // Handle direct injection of resource prompt
  const handleInjectResource = useCallback((resourcePrompt: ResourcePrompt) => {
    insertHandlerRef.current.insertPrompt(inputElement, resourcePrompt.content)
    setIsOpen(false)
  }, [inputElement])

  // Always use DropdownContainer (Portal) to escape overflow clipping
  return (
    <div className="dropdown-app">
      <TriggerButton
        isOpen={isOpen}
        onClick={handleToggle}
      />

      <DropdownContainer
        prompts={prompts}
        categories={categories}
        onSelect={handleSelect}
        onInjectResource={handleInjectResource}
        onRefresh={handleRefresh}
        isOpen={isOpen}
        selectedPromptId={selectedPromptId}
        onClose={handleClose}
        isLoading={isLoading}
      />
    </div>
  )
}