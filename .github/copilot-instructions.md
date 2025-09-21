# Copilot Instructions for Realtime Portal Chrome Extension

## Project Overview
This is a **Chrome Extension (Manifest V3)** built with React, TypeScript, and Webpack that provides realtime portal functionality for postal services. The extension integrates with Firebase for real-time data synchronization and includes PDF/Excel processing capabilities.

## Architecture & Entry Points

### Multi-Entry Webpack Build
The project uses multiple entry points defined in `webpack.common.js`:
- **popup**: Main extension popup UI (`src/popup/index.tsx`)
- **background**: Service worker (`src/background/background.ts`) 
- **contentScript**: Multiple content scripts for different portal pages
- **offscreen**: Offscreen document for additional processing

### Key Architectural Patterns

#### Content Script Strategy
Content scripts are page-specific and follow naming convention:
- `contentLoginPortal.tsx` - Login page automation
- `contentCms.tsx` - CMS portal interactions  
- `contentMy.tsx` - User dashboard automation
- `contentScript.tsx` - Generic content script entry point

#### State Management
- **Redux Toolkit** for popup state (`src/popup/store.tsx`, `src/popup/popup.slice.tsx`)
- **Chrome Storage API** for persistent data across extension contexts
- **Background script** acts as central coordinator between contexts

#### Firebase Integration
**Dual Firebase Setup** (important for understanding):
- Background script uses **compat libraries** via `importScripts()`: 
  ```typescript
  importScripts('firebase-app-compat.js', 'firebase-database-compat.js');
  declare var firebase: any; // Global firebase object
  ```
- Popup/content scripts use **modern Firebase SDK** via imports:
  ```typescript
  import { initializeApp } from "firebase/app";
  import { getDatabase, ref, onValue } from "firebase/database";
  ```

## Development Workflow

### Build Commands
```bash
npm run dev    # Development build with watch mode
npm run build  # Production build with watch mode
```

### Testing Content Scripts
Content scripts target specific portal domains. Test by:
1. Loading extension in Chrome Developer Mode
2. Navigate to target portal pages
3. Check console for content script injection logs
4. Use popup to trigger background → content script communication

## Critical Conventions

### Type Definitions
Shared types in `src/states/states.ts` define core data structures:
- `BuuGuiProps` - Postal package data
- `KhachHangProps` - Customer data with nested packages
- `DataSnapshotProps` - Firebase snapshot format

### Message Passing Pattern
Background script acts as message hub:
```typescript
// Standard pattern for cross-context communication
chrome.runtime.sendMessage({ 
  type: "ACTION_TYPE", 
  payload: data 
}, (response) => {
  // Handle response
});
```

### Chrome Storage Integration
Use `chrome.storage.local` for persistence:
```typescript
// Get with fallback
chrome.storage.local.get(["keyMessage", "accountPortal"], (result) => {
  const keyMessage = result.keyMessage || defaultValue;
});
```

### Content Script Injection
Check `src/static/manifest.json` for injection rules. Content scripts use:
- Dynamic imports for React components
- `waitForElm()` utility for DOM waiting
- Page-specific automation logic

## File Processing Patterns
- **PDF generation**: Uses `pdf-lib` and `jspdf` libraries
- **Excel processing**: `xlsx` library with custom utilities in `xlsxtool.js`
- **File storage**: Firebase Storage for uploads, Chrome Storage for metadata

## UI Framework
- **Ant Design** for popup UI components
- **Tailwind CSS** for styling (configured via PostCSS)
- **React 18** with functional components and hooks

## Important Notes
- Firebase config contains real credentials - handle with care
- Content scripts must handle portal authentication flows
- Background script manages Firebase listeners and data synchronization
- Webpack copy plugin handles static assets from `src/static/` to build output