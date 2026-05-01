# Batch Progress Panel Design

## Overview

**Feature:** Multi-task queue for concurrent prompt conversion

**Core Value:** Users can continuously click multiple images, tasks are automatically queued and processed concurrently (max 5), with a dedicated progress panel showing overall status.

---

## Architecture

### File Structure

```
src/content/
├── core/
│   └── task-queue-manager.ts     # Queue manager (new)
│
├── components/
│   ├── BatchProgressPanel.tsx    # Progress panel component (new)
│   ├── TaskCard.tsx              # Task card component (new)
│   └── VisionModal.tsx           # Single image modal (existing)
│
├── vision-modal-manager.tsx      # Single modal manager (existing)
├── batch-panel-manager.tsx       # Progress panel manager (new)
└── image-hover-button-manager.tsx # Hover button manager (modified)
```

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| TaskQueueManager | Queue management, concurrent scheduling, state sync |
| BatchProgressPanel | Task list view, overall stats, global actions |
| BatchPanelManager | Shadow DOM container, lifecycle management |
| TaskCard | Individual task display: thumbnail, status, result preview |

---

## Data Structure

### Task Status

```typescript
type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

interface QueueTask {
  id: string                  // crypto.randomUUID()
  imageUrl: string            // Image URL
  thumbnailUrl?: string       // Thumbnail (compressed base64)
  status: TaskStatus
  createdAt: number           // Timestamp when added
  result?: VisionApiResultData // Result on success
  error?: string              // Error message on failure
}
```

### Queue Manager Interface

```typescript
interface TaskQueueManager {
  // Queue operations
  addTask(imageUrl: string): QueueTask | null  // null = queue full
  removeTask(taskId: string): void
  retryTask(taskId: string): void

  // State queries
  getQueue(): QueueTask[]
  getTask(taskId: string): QueueTask | undefined
  getStats(): { pending: number; running: number; success: number; failed: number }

  // Lifecycle
  clearCompleted(): void  // Clear completed tasks
  clearAll(): void        // Clear entire queue
}
```

---

## Concurrent Scheduling

### Constraints

- **Max queue size:** 10 tasks
- **Max concurrent:** 5 tasks running simultaneously

### Scheduling Flow

1. **On task add:**
   - Check if queue is full (10)
   - Create task with `pending` status
   - Try to start immediately (check slot availability)

2. **On task start:**
   - Check if `runningCount < 5`
   - Pick earliest `pending` task
   - Change status to `running`
   - Call Vision API (reuse `executeVisionApiCall`)
   - Success → `success`, store result
   - Failure → `failed`, store error

3. **On task complete:**
   - Release running slot
   - Auto-check for `pending` tasks
   - If pending exists → start next immediately

4. **On retry:**
   - User clicks retry button
   - Change status to `pending`
   - Enter normal scheduling flow

### Core Logic

```typescript
class TaskScheduler {
  private runningCount = 0
  private maxConcurrent = 5

  tryStartNext(): void {
    if (this.runningCount >= this.maxConcurrent) return
    const nextTask = this.findPendingTask()
    if (!nextTask) return

    this.runningCount++
    nextTask.status = 'running'

    executeVisionApiCall(...)
      .then(result => {
        nextTask.status = 'success'
        nextTask.result = result
      })
      .catch(error => {
        nextTask.status = 'failed'
        nextTask.error = error.message
      })
      .finally(() => {
        this.runningCount--
        this.tryStartNext()  // Auto-start next
      })
  }
}
```

---

## UI Design

### Panel Layout (400px width, max 500px height, scrollable)

```
┌────────────────────────────────────┐
│ [Icon] Oh My Prompt    [Min] [×]   │  ← Header (draggable)
├────────────────────────────────────┤
│ Progress: 3 success / 1 fail / 2 run│  ← Stats bar
├────────────────────────────────────┤
│ TaskCard list (scrollable)         │
│ ...                                │
├────────────────────────────────────┤
│ [Cancel All]       [Clear Done]    │  ← Footer actions
└────────────────────────────────────┘
```

### TaskCard Layout (Horizontal, ~100px height normal)

```
┌──────────┬───────────────────────┬──────┐
│ Thumbnail│ Status area           │Actions│
│ 80x80px  │                       │      │
│          │ Status icon + text    │[×]   │
│          │ Result preview        │[View]│
│          │ (on success)          │      │
│          │ Error message         │[Retry]│
│          │ (on failure)          │      │
└──────────┴───────────────────────┴──────┘
```

### Status Display

| Status | Visual |
|--------|--------|
| pending | Gray dot + "Waiting" |
| running | Pulsing animation + "Analyzing..." + progress bar |
| success | Green ✓ + "Done" + result preview (first 50 chars) |
| failed | Red ✗ + "Failed" + error message + retry button |

### Expanded TaskCard (~200-250px height)

```
┌──────────┬───────────────────────┬──────┐
│ [Thumb]  │ ✓ Done                │[×]   │
│          │ ───────────────────── │[Collapse]│
│          │ Prompt preview area   │      │
│          │ ┌──────────────────── │      │
│          │ │ Fashion portrait...│[Copy]│  ← Copy button at right-bottom
│          │ │ ...                │      │
│          │ └──────────────────── │      │
│          │ ───────────────────── │      │
│          │ [中/EN] [Natural/JSON]│      │  ← Language/format toggle at bottom
│          │ [Save to OMP]         │      │  ← Action button
└──────────┴───────────────────────┴──────┘
```

### Minimized State

```
┌──────────────────────────┐
│ [Icon] 3✓ / 1✗ / 2⟳     │  ← Compact status bar
└──────────────────────────┘
```

---

## User Interaction Flow

### From Single to Multi-task

```
User clicks hover button
    ↓
Check queue status
    ↓
┌─────────────────────────┐
│ Queue empty?            │
├─────────────────────────┤
│ Yes → VisionModal       │  Single image flow (existing)
│ No  → Add to queue      │  Multi-task flow
│     ↓                   │
│   BatchProgressPanel    │  Auto show / already visible
│     ↓                   │
│   New TaskCard appears  │  Show pending → running
└─────────────────────────┘
```

### Queue Full Scenario

```
User clicks hover button (queue has 10 tasks)
    ↓
Show Toast: "Queue full, wait for current tasks"
    ↓
Not added to queue
```

### Close Panel with Active Tasks

```
User clicks [×] with running tasks
    ↓
Prompt: "X tasks still running, close will cancel all"
    ↓
User confirms → Clear queue, close panel
User cancels → Keep panel open
```

---

## Error Handling

### Error Types

| Error | User Message | Action |
|-------|-------------|--------|
| Invalid API Key | "API Key invalid" | Suggest configure in settings |
| Rate Limit (429) | "API rate limit exceeded" | Manual retry after wait |
| Timeout | "Request timeout" | Manual retry |
| Network | "Network connection failed" | Manual retry |
| Queue Full | "Queue full (10 tasks)" | Toast, not added |
| Unsupported image | "Image format not supported" | Mark failed, no retry |

### Toast Scenarios

| Scenario | Message |
|----------|---------|
| Queue full | "Queue full, wait for tasks to complete" |
| Cancel all | "Cancelled X tasks" |
| Retry all failed | "Retrying X failed tasks" |

---

## Implementation Notes

### Key Modifications

1. **ImageHoverButtonManager** (modify)
   - On click: check queue state
   - Queue empty → VisionModalManager (existing)
   - Queue has tasks → TaskQueueManager.addTask()

2. **New Files**
   - `task-queue-manager.ts` — Core queue logic
   - `batch-panel-manager.tsx` — Shadow DOM container
   - `BatchProgressPanel.tsx` — React component
   - `TaskCard.tsx` — React component

3. **Reuse Existing**
   - `executeVisionApiCall()` — Vision API call
   - `MessageType.SAVE_TEMPORARY_PROMPT` — Save to temp library
   - Shadow DOM style isolation pattern

### State Sync

- TaskQueueManager uses Zustand or simple pub/sub
- Components subscribe to queue changes, auto-update UI

### Style Reuse

- Reuse VisionModal color scheme and base styles
- New: progress bar animation, status icon styles