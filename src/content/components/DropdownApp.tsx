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

interface DropdownAppProps {
  inputElement: HTMLElement
}

export function DropdownApp({ inputElement }: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const insertHandlerRef = useRef<InsertHandler>(new InsertHandler())
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

  const handleToggle = useCallback(() => {
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
    insertHandlerRef.current.insertPrompt(inputElement, prompt.content)
    setSelectedPromptId(prompt.id)
    setTimeout(() => {
      setSelectedPromptId(null)
    }, 2000)
  }, [inputElement])

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