/**
 * Dropdown styles for Portal rendering
 * Extracted as constant to avoid regeneration on each call
 */

export const PORTAL_ID = 'oh-my-prompt-dropdown-portal'
export const STYLE_ID = 'oh-my-prompt-dropdown-styles'

// Dropdown styles (inline for portal - renders outside Shadow DOM)
// ~700 lines of CSS, generated once as constant
export const DROPDOWN_STYLES = `
  #${PORTAL_ID} .dropdown-container {
    position: fixed;
    width: 640px;
    max-height: 600px;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    box-sizing: border-box;
    z-index: 2147483647;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
  }

  #${PORTAL_ID} .dropdown-sidebar {
    width: 140px;
    background: #f8f8f8;
    border-right: 1px solid #E5E5E5;
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    border-radius: 12px 0 0 12px;
  }

  #${PORTAL_ID} .sidebar-categories {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }

  #${PORTAL_ID} .sidebar-category-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 0;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: #171717;
    cursor: pointer;
    transition: background 0.15s ease;
    width: 100%;
    overflow: hidden;
  }

  #${PORTAL_ID} .sidebar-category-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  #${PORTAL_ID} .sidebar-category-item:hover {
    background: #f0f0f0;
  }

  #${PORTAL_ID} .sidebar-category-item.selected {
    background: #ffffff;
    color: #A16207;
    border-left: 2px solid #A16207;
  }

  #${PORTAL_ID} .sidebar-category-icon {
    width: 14px;
    height: 14px;
    color: #64748B;
  }

  #${PORTAL_ID} .sidebar-category-item.selected .sidebar-category-icon {
    color: #A16207;
  }

  #${PORTAL_ID} .dropdown-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 0 12px 12px 0;
  }

  #${PORTAL_ID} .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #E5E5E5;
    cursor: grab;
    user-select: none;
  }

  #${PORTAL_ID} .dropdown-header.dragging {
    cursor: grabbing;
    opacity: 0.9;
  }

  #${PORTAL_ID} .dropdown-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #171717;
    cursor: grab;
  }

  #${PORTAL_ID} .dropdown-header-logo {
    width: 16px;
    height: 16px;
  }

  #${PORTAL_ID} .dropdown-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  #${PORTAL_ID} .dropdown-action-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #ffffff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
    color: #171717;
    box-sizing: border-box;
  }

  #${PORTAL_ID} .dropdown-action-btn:hover {
    background: #f8f8f8;
  }

  #${PORTAL_ID} .dropdown-action-btn.refreshing {
    cursor: wait;
  }

  #${PORTAL_ID} .dropdown-action-btn.refreshing svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  #${PORTAL_ID} .dropdown-language-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 36px;
    min-width: 36px;
    max-width: 36px;
    padding: 4px 8px;
    background: #ffffff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    color: #171717;
    transition: background 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  #${PORTAL_ID} .dropdown-language-btn:hover {
    background: #f8f8f8;
  }

  #${PORTAL_ID} .dropdown-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  #${PORTAL_ID} .dropdown-items {
    display: flex;
    flex-direction: column;
  }

  #${PORTAL_ID} .dropdown-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #E5E5E5;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  #${PORTAL_ID} .dropdown-item:hover {
    background: #f8f8f8;
  }

  #${PORTAL_ID} .dropdown-item.last {
    border-bottom: none;
  }

  #${PORTAL_ID} .dropdown-item.selected {
    background: #fef3e2;
  }

  #${PORTAL_ID} .dropdown-item-icon {
    width: 16px;
    height: 16px;
    color: #171717;
  }

  #${PORTAL_ID} .dropdown-item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  #${PORTAL_ID} .dropdown-item-name {
    font-size: 12px;
    font-weight: 500;
    color: #171717;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  #${PORTAL_ID} .dropdown-item-preview {
    font-size: 10px;
    color: #64748B;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  #${PORTAL_ID} .dropdown-item-arrow {
    width: 12px;
    height: 12px;
    color: #171717;
  }

  #${PORTAL_ID} .empty-state {
    padding: 24px;
    text-align: center;
  }

  #${PORTAL_ID} .empty-message {
    font-size: 12px;
    color: #64748B;
  }

  #${PORTAL_ID} .dropdown-content::-webkit-scrollbar,
  #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar {
    width: 6px;
  }

  #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-track,
  #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-track {
    background: transparent;
  }

  #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-thumb,
  #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-thumb {
    background: #ddd;
    border-radius: 3px;
  }

  #${PORTAL_ID} .dropdown-content::-webkit-scrollbar-thumb:hover,
  #${PORTAL_ID} .sidebar-categories::-webkit-scrollbar-thumb:hover {
    background: #ccc;
  }

  #${PORTAL_ID} .dropdown-item-drag-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    color: #64748B;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    pointer-events: auto;
    background: #ffffff;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  #${PORTAL_ID} .dropdown-item:hover .dropdown-item-drag-handle,
  #${PORTAL_ID} .dropdown-item-drag-handle:hover {
    opacity: 1;
    visibility: visible;
  }

  #${PORTAL_ID} .dropdown-item-drag-handle:active {
    cursor: grabbing;
  }

  #${PORTAL_ID} .dropdown-item-thumbnail {
    width: 60px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    background: #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  #${PORTAL_ID} .dropdown-item-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  #${PORTAL_ID} .dropdown-item-thumbnail-placeholder {
    width: 20px;
    height: 20px;
    color: #999;
  }

  #${PORTAL_ID} .dropdown-item-with-thumbnail {
    gap: 8px;
  }

  #${PORTAL_ID} .dropdown-item.dragging {
    opacity: 0.5;
    background: #f8f8f8;
  }

  #${PORTAL_ID} .dropdown-item-icon-wrapper {
    position: relative;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  #${PORTAL_ID} .dropdown-item-icon {
    width: 16px;
    height: 16px;
    color: #171717;
    transition: opacity 0.15s ease;
  }

  #${PORTAL_ID} .dropdown-item:hover .dropdown-item-icon {
    opacity: 0;
  }

  #${PORTAL_ID} .sidebar-category-drag-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    color: #64748B;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    pointer-events: auto;
    background: #f8f8f8;
    border-radius: 3px;
  }

  #${PORTAL_ID} .sidebar-category-item:hover .sidebar-category-drag-handle,
  #${PORTAL_ID} .sidebar-category-drag-handle:hover {
    opacity: 1;
    visibility: visible;
  }

  #${PORTAL_ID} .sidebar-category-drag-handle:active {
    cursor: grabbing;
  }

  #${PORTAL_ID} .sidebar-category-icon-wrapper {
    position: relative;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  #${PORTAL_ID} .sidebar-category-icon {
    width: 14px;
    height: 14px;
    color: #64748B;
    transition: opacity 0.15s ease;
  }

  #${PORTAL_ID} .sidebar-category-item.selected .sidebar-category-icon {
    color: #A16207;
  }

  #${PORTAL_ID} .sidebar-category-item:hover .sidebar-category-icon {
    opacity: 0;
  }

  /* Resource library styles */

  #${PORTAL_ID} .network-prompt-cards-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  #${PORTAL_ID} .network-prompt-card:hover {
    background: #f8f8f8;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }

  #${PORTAL_ID} .network-prompt-card:focus {
    outline: 2px solid #A16207;
    outline-offset: 2px;
  }

  /* Update notification banner styles */
  #${PORTAL_ID} .update-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #fff3cd;
    border-bottom: 1px solid #ffc107;
  }

  #${PORTAL_ID} .update-banner-text {
    font-size: 11px;
    color: #856404;
    flex: 1;
  }

  #${PORTAL_ID} .update-banner-link {
    font-size: 11px;
    color: #d97706;
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
  }

  #${PORTAL_ID} .update-banner-link:hover {
    color: #b45309;
  }

  #${PORTAL_ID} .update-banner-close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #856404;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }

  #${PORTAL_ID} .update-banner-close:hover {
    color: #533b04;
  }

  /* Backup reminder banner styles */
  #${PORTAL_ID} .backup-reminder-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #e8f4f8;
    border-bottom: 1px solid #3b82f6;
  }

  #${PORTAL_ID} .backup-reminder-text {
    font-size: 11px;
    color: #1e40af;
    flex: 1;
  }

  #${PORTAL_ID} .backup-reminder-link {
    font-size: 11px;
    color: #2563eb;
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
  }

  #${PORTAL_ID} .backup-reminder-link:hover {
    color: #1d4ed8;
  }

  #${PORTAL_ID} .backup-reminder-close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1e40af;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }

  #${PORTAL_ID} .backup-reminder-close:hover {
    color: #1e3a8a;
  }

  /* First-time backup warning banner styles - orange warning color */
  #${PORTAL_ID} .first-backup-warning-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: #fff7ed;
    border-bottom: 2px solid #f97316;
  }

  #${PORTAL_ID} .first-backup-warning-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #${PORTAL_ID} .first-backup-warning-icon {
    width: 16px;
    height: 16px;
    color: #ea580c;
  }

  #${PORTAL_ID} .first-backup-warning-title {
    font-size: 12px;
    font-weight: 600;
    color: #c2410c;
  }

  #${PORTAL_ID} .first-backup-warning-text {
    font-size: 11px;
    color: #9a3412;
  }

  #${PORTAL_ID} .first-backup-warning-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  #${PORTAL_ID} .first-backup-warning-btn {
    padding: 6px 12px;
    background: #f97316;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  #${PORTAL_ID} .first-backup-warning-btn:hover {
    background: #ea580c;
  }

  #${PORTAL_ID} .first-backup-warning-skip {
    font-size: 11px;
    color: #9a3412;
    cursor: pointer;
    text-decoration: underline;
  }

  #${PORTAL_ID} .first-backup-warning-skip:hover {
    color: #7c2d12;
  }

  #${PORTAL_ID} .first-backup-warning-checkbox {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #9a3412;
    margin-left: auto;
  }

  #${PORTAL_ID} .version-badge {
    font-size: 10px;
    color: #64748B;
    font-weight: 400;
    margin-left: 4px;
  }

  /* CRUD action buttons */
  #${PORTAL_ID} .sidebar-add-category-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 0;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: #A16207;
    cursor: pointer;
    transition: background 0.15s ease;
    width: 100%;
  }

  #${PORTAL_ID} .sidebar-add-category-btn:hover {
    background: #f0f0f0;
  }

  #${PORTAL_ID} .category-action-buttons {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    display: flex;
    gap: 4px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    z-index: 100;
  }

  #${PORTAL_ID} .sidebar-category-item:hover .category-action-buttons {
    opacity: 1;
    visibility: visible;
  }

  #${PORTAL_ID} .category-action-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 4px;
    cursor: pointer;
    color: #64748B;
  }

  #${PORTAL_ID} .category-action-btn:hover {
    background: #f8f8f8;
    color: #171717;
  }

  #${PORTAL_ID} .category-action-btn.delete:hover {
    color: #dc2626;
    border-color: #fecaca;
  }

  #${PORTAL_ID} .prompt-action-buttons {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    display: flex;
    gap: 4px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    background: #ffffff;
    padding: 4px 8px;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  #${PORTAL_ID} .dropdown-item:hover .prompt-action-buttons {
    opacity: 1;
    visibility: visible;
  }

  #${PORTAL_ID} .prompt-action-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: #64748B;
  }

  #${PORTAL_ID} .prompt-action-btn:hover {
    background: #f8f8f8;
    color: #171717;
  }

  #${PORTAL_ID} .prompt-action-btn.delete:hover {
    color: #dc2626;
  }

  /* FAB add prompt button */
  #${PORTAL_ID} .fab-add-prompt {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #171717;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: background 0.15s ease, transform 0.15s ease;
    z-index: 50;
  }

  #${PORTAL_ID} .fab-add-prompt:hover {
    background: #404040;
    transform: scale(1.05);
  }
`