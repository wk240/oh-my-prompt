/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import type { Prompt } from '@oh-my-prompt/shared/types'
import type { ResourcePrompt } from '@oh-my-prompt/shared/types'
import type { InsertStrategy } from '../platforms/base/strategy-interface'
import type { ButtonStyleConfig } from '../platforms/base/types'
import { usePromptStore } from '../../lib/store'
import { MessageType } from '@oh-my-prompt/shared/messages'

interface DropdownAppProps {
  inputElement: HTMLElement
  inserter: InsertStrategy
  buttonComponent?: React.ComponentType<{ inputElement: HTMLElement; isOpen: boolean; onClick: () => void }>
  buttonStyle?: ButtonStyleConfig
}

export function DropdownApp({
  inputElement,
  inserter,
  buttonComponent: ButtonComponent,
  buttonStyle: _buttonStyle // Reserved for future custom button styling
}: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const scrollPositionRef = useRef<number>(0) // Remember scroll position when closing

  // Subscribe to Zustand store for reactive updates
  const prompts = usePromptStore((state) => state.prompts)
  const categories = usePromptStore((state) => state.categories)
  const isLoading = usePromptStore((state) => state.isLoading)
  const loadFromStorage = usePromptStore((state) => state.loadFromStorage)

  useEffect(() => {
    loadFromStorage()
    // Note: We no longer pre-check permission on mount - this is unnecessary overhead
    // Permission check is deferred to user click, which is the only time it's actually needed
  }, [loadFromStorage])

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside the dropdown portal container
      const dropdownPortal = document.getElementById('oh-my-prompt-dropdown-portal')
      const triggerElement = document.querySelector('[data-testid="oh-my-prompt-trigger"]')

      if (!dropdownPortal) return

      // If click is inside dropdown or on trigger button, don't close
      const isInsideDropdown = dropdownPortal.contains(e.target as Node)
      const isOnTrigger = triggerElement?.contains(e.target as Node)

      if (!isInsideDropdown && !isOnTrigger) {
        // Close dropdown when clicking outside
        setIsOpen(false)
      }
    }

    // Use mousedown for faster response
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle button click - toggle dropdown and optionally restore folder permission
  // Permission check is deferred to user click (not on mount) to avoid unnecessary overhead
  //
  // STRATEGY:
  // 1. On user click, check permission status via offscreen document
  // 2. If permission needs restoration ('prompt'), trigger restore asynchronously
  // 3. Open dropdown immediately - sync status polling will handle backup reminder
  // 4. If restore succeeds, sync will be triggered and backup reminder will auto-dismiss
  const handleToggle = useCallback(() => {
    // Check permission status and restore if needed (async, non-blocking)
    chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_CHECK_PERMISSION })
      .then((response) => {
        if (response?.success && response.data?.hasFolder) {
          // If permission needs restoration, trigger request
          // Note: After page refresh, gesture context may be lost in offscreen fallback path
          // But we still try - if it fails, user can manually restore via sidepanel
          if (response.data.permission === 'prompt') {
            console.log('[Oh My Prompt] Permission needs restoration, triggering request')
            chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_REQUEST_PERMISSION })
              .then((restoreResponse) => {
                if (restoreResponse?.success) {
                  console.log('[Oh My Prompt] Permission restored successfully')
                  // Trigger sync after permission restored
                  chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC })
                    .catch(() => { /* Ignore sync errors */ })
                } else {
                  console.log('[Oh My Prompt] Permission restore failed or requires manual action')
                }
              })
              .catch(() => { /* Ignore errors - user can manually restore */ })
          }
        }
      })
      .catch(() => { /* Ignore errors - folder may not be configured */ })

    // Open dropdown immediately (non-blocking)
    setIsOpen((prev) => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Handle scroll position from dropdown container
  const handleScrollPositionChange = useCallback((position: number) => {
    scrollPositionRef.current = position
  }, [])

  const handleSelect = useCallback((prompt: Prompt) => {
    inserter.insert(inputElement, prompt.content)
    setSelectedPromptId(prompt.id)
    setTimeout(() => {
      setSelectedPromptId(null)
    }, 2000)
  }, [inputElement, inserter])

  // Handle direct injection of resource prompt
  const handleInjectResource = useCallback((resourcePrompt: ResourcePrompt) => {
    inserter.insert(inputElement, resourcePrompt.content)
    setIsOpen(false)
  }, [inputElement, inserter])

  // Always use DropdownContainer (Portal) to escape overflow clipping
  return (
    <div className="dropdown-app">
      {ButtonComponent ? (
        <ButtonComponent
          inputElement={inputElement}
          isOpen={isOpen}
          onClick={handleToggle}
        />
      ) : (
        <TriggerButton
          isOpen={isOpen}
          onClick={handleToggle}
        />
      )}

      <DropdownContainer
        prompts={prompts}
        categories={categories}
        onSelect={handleSelect}
        onInjectResource={handleInjectResource}
        isOpen={isOpen}
        selectedPromptId={selectedPromptId}
        onClose={handleClose}
        isLoading={isLoading}
        savedScrollPosition={scrollPositionRef.current}
        onScrollPositionChange={handleScrollPositionChange}
      />
    </div>
  )
}