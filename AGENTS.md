# AGENTS.md

## Build Commands
- **Dev**: `npm run dev` → loads from `dist/` in Chrome
- **Build**: `npm run build` → creates production bundle (note: prod script has `--watch` that should be removed for packaging)

## Project Type
Chrome Manifest V3 extension using React, Redux Toolkit, Ant Design, Firebase.

## Extension Entry Points
- `src/popup/`: Main UI with order processing tabs
- `src/background/`: Service worker (orchestrates processing queue, Firebase, PDF/Excel)
- `src/contentScript/`: Injected scripts for VNPost domains
- `src/sidepanel/`: Side panel UI with image viewer and AI tools
- `src/options/`: Extension settings

## Critical Patterns

### Message Contract
```typescript
// Async listener - ALWAYS return true:
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => { sendResponse({...}); })();
  return true;
});
```

### Focus Management (Batch Add)
```typescript
// Popup → Tab: activate tab BEFORE close
await chrome.tabs.update(tab.id, { active: true });
chrome.tabs.sendMessage(tab.id, message);
setTimeout(() => window.close(), 100);
```

### React State Forcing
```typescript
// For Ant Design controlled inputs
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
input.dispatchEvent(new Event('blur'));
```

### Firebase SDK Split
- Background: Compatibility SDK (`firebase-app-compat.js`, `firebase-database-compat.js`)
- Popup/Options: Modern modular SDK

## Key Timing Delays
- After clicking "Add" button: 400ms
- After clicking cell: 150ms  
- Between rows: 200ms
- Tab navigation: 2000ms

## Existing Documentation
See `.github/copilot-instructions.md` for detailed architecture, message contracts, and implementation patterns.