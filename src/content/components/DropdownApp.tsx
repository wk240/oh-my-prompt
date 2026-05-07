/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import type { Prompt } from '../../shared/types'
import type { ResourcePrompt } from '../../shared/types'
import type { InsertStrategy } from '../platforms/base/strategy-interface'
import type { ButtonStyleConfig } from '../platforms/base/types'
import { usePromptStore } from '../../lib/store'
import { MessageType } from '../../shared/messages'

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

  // Check and restore folder permission in user gesture context (before opening dropdown)
  // Chrome requires permission request to be called directly in response to user gesture
  // The gesture propagates through message chain: Content -> SW -> Offscreen
  // CRITICAL: We must send permission request BEFORE any await to preserve gesture
  // Offscreen document uses cached handle for synchronous permission request
  const handleToggle = useCallback(() => {
    // Fire permission request message immediately (preserves user gesture)
    // We don't wait for the result - just trigger it and continue
    // Offscreen will check if folder exists and request permission if needed
    chrome.runtime.sendMessage({ type: MessageType.REQUEST_PERMISSION_GESTURE })
      .then((response) => {
        if (response?.success) {
          console.log('[Oh My Prompt] Permission check/restored successfully')
        }
      })
      .catch((error) => {
        console.warn('[Oh My Prompt] Permission request failed:', error)
      })

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