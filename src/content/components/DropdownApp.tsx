/**
 * DropdownApp - Root component coordinating trigger and dropdown
 * Manages dropdown state and handles prompt selection
 */

import { useState, useCallback, useRef } from 'react'
import { TriggerButton } from './TriggerButton'
import { DropdownContainer } from './DropdownContainer'
import { SAMPLE_PROMPTS, SAMPLE_CATEGORIES } from '../sample-data'
import { InsertHandler } from '../insert-handler'
import type { Prompt } from '../../shared/types'

interface DropdownAppProps {
  lovartIconColor: string
  inputElement: HTMLElement
}

export function DropdownApp({ lovartIconColor, inputElement }: DropdownAppProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  // Initialize InsertHandler directly in useRef to avoid timing issues
  // (useEffect runs after first render, causing first click to fail)
  const insertHandlerRef = useRef<InsertHandler>(new InsertHandler())

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

  return (
    <div className="dropdown-app">
      <TriggerButton
        isOpen={isOpen}
        onClick={handleToggle}
        lovartIconColor={lovartIconColor}
      />

      <DropdownContainer
        prompts={SAMPLE_PROMPTS}
        categories={SAMPLE_CATEGORIES}
        onSelect={handleSelect}
        isOpen={isOpen}
        selectedPromptId={selectedPromptId}
      />
    </div>
  )
}