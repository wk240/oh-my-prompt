/**
 * Team Share Dialog styles for Portal rendering in content script
 * Matches Sidepanel TeamShareDialog visual design
 * Uses ID-scoped CSS for isolation (renders to document.body via createPortal)
 */

export const TEAM_SHARE_PORTAL_ID = 'omp-team-share-portal'
export const TEAM_SHARE_STYLE_ID = 'omp-team-share-styles'

// Team Share Dialog styles - purple accent with dark buttons
export const TEAM_SHARE_DIALOG_STYLES = `
  /* Portal container */
  #${TEAM_SHARE_PORTAL_ID} {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Overlay - semi-transparent background */
  #${TEAM_SHARE_PORTAL_ID} .team-share-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    animation: omp-fade-in 0.15s ease-out;
  }

  /* Content container - centered, white background, rounded, shadow */
  #${TEAM_SHARE_PORTAL_ID} .team-share-content {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% - 32px);
    max-width: 400px;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: omp-zoom-in 0.15s ease-out;
  }

  /* Header */
  #${TEAM_SHARE_PORTAL_ID} .team-share-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-title {
    font-size: 18px;
    font-weight: 600;
    color: #171717;
    line-height: 1.2;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-description {
    font-size: 13px;
    color: #64748B;
    line-height: 1.4;
  }

  /* Close button */
  #${TEAM_SHARE_PORTAL_ID} .team-share-close {
    position: absolute;
    right: 16px;
    top: 16px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: #64748B;
    transition: color 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-close:hover {
    color: #171717;
  }

  /* Team list */
  #${TEAM_SHARE_PORTAL_ID} .team-share-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 0;
  }

  /* Team option button */
  #${TEAM_SHARE_PORTAL_ID} .team-share-option {
    width: 100%;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-option:hover {
    border-color: #D4D4D4;
    background: #f8f8f8;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-option.selected {
    border-color: #8b5cf6;
    background: #faf5ff;
  }

  /* Team option content */
  #${TEAM_SHARE_PORTAL_ID} .team-share-option-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Radio indicator */
  #${TEAM_SHARE_PORTAL_ID} .team-share-radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid #D4D4D4;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s ease, background 0.15s ease;
    flex-shrink: 0;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-option:hover .team-share-radio {
    border-color: #A3A3A3;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-option.selected .team-share-radio {
    border-color: #8b5cf6;
    background: #8b5cf6;
  }

  /* Radio inner dot (selected state) */
  #${TEAM_SHARE_PORTAL_ID} .team-share-radio-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ffffff;
  }

  /* Team name */
  #${TEAM_SHARE_PORTAL_ID} .team-share-name {
    font-size: 14px;
    font-weight: 500;
    color: #171717;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Empty state */
  #${TEAM_SHARE_PORTAL_ID} .team-share-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 16px;
    text-align: center;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-empty-message {
    font-size: 13px;
    color: #64748B;
    line-height: 1.4;
  }

  /* Loading state */
  #${TEAM_SHARE_PORTAL_ID} .team-share-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px 16px;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #E5E5E5;
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: omp-spin 0.6s linear infinite;
  }

  /* Footer */
  #${TEAM_SHARE_PORTAL_ID} .team-share-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }

  /* Outline button */
  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-outline {
    padding: 10px 16px;
    background: #ffffff;
    border: 1px solid #E5E5E5;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #171717;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-outline:hover {
    background: #f8f8f8;
    border-color: #D4D4D4;
  }

  /* Primary button */
  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-primary {
    padding: 10px 16px;
    background: #171717;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-primary:hover:not(:disabled) {
    background: #404040;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-primary:disabled {
    background: #D4D4D4;
    cursor: not-allowed;
  }

  /* Primary button with spinner */
  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-primary-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  #${TEAM_SHARE_PORTAL_ID} .team-share-btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: omp-spin 0.6s linear infinite;
  }

  /* Animations */
  @keyframes omp-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes omp-zoom-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @keyframes omp-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`