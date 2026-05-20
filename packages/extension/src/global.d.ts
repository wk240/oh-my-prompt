/**
 * Type declarations for File System Access API
 * TypeScript's DOM lib already has FileSystemHandle, FileSystemDirectoryHandle, FileSystemFileHandle
 * We only need to add the window methods and permission request
 * https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

declare global {
  // Extend existing FileSystemDirectoryHandle with requestPermission and queryPermission
  interface FileSystemDirectoryHandle {
    requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  // Extend existing FileSystemFileHandle with requestPermission and queryPermission
  interface FileSystemFileHandle {
    requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  // Add missing window methods
  interface Window {
    showDirectoryPicker(options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
      suggestedName?: string
      excludeAcceptAllOption?: boolean
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }): Promise<FileSystemDirectoryHandle>
    showOpenFilePicker(options?: {
      multiple?: boolean
      excludeAcceptAllOption?: boolean
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }): Promise<FileSystemFileHandle[]>
    showSaveFilePicker(options?: {
      suggestedName?: string
      excludeAcceptAllOption?: boolean
      types?: Array<{
        description?: string
        accept: Record<string, string[]>
      }>
    }): Promise<FileSystemFileHandle>
  }
}

export {}