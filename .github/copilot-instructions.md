# Chrome Extension for VNPost Portal Automation

## Project Overview
This is a Chrome Manifest V3 extension that automates order processing workflows for VNPost (Vietnam Post) portal systems. It integrates with multiple VNPost domains (portalkhl.vnpost.vn, my.vnpost.vn, packnsend.vnpost.vn, cms.vnpost.vn) and uses Firebase Realtime Database for cross-device synchronization.

## Architecture

### Extension Components
- **Background Service Worker** (`src/background/background.ts`): 5300+ lines orchestrating Firebase listeners, message routing, PDF generation, Excel processing, and state management
- **Content Scripts**: Domain-specific scripts injected into VNPost pages
  - `contentScript.tsx`: Portal order processing (portalkhl.vnpost.vn)
  - `contentMy.tsx`: MyPost order management (my.vnpost.vn) - 2000+ lines handling batch operations, order tracking, complaint creation
  - `contentGiaoDich.tsx`, `contentCms.tsx`, `contentGoogleForm.tsx`: Specialized handlers
  - `mainScript.tsx`: MAIN world script accessing React internals via `FindReact()` function
- **Popup** (`src/popup/`): React + Redux Toolkit UI with tabs for JSON data input, batch operations, and Google Forms integration
- **Options Page** (`src/options/`): Configuration interface

### Build System
- **Webpack** (webpack.common.js, webpack.dev.js, webpack.prod.js) with multiple entry points
- **TypeScript** with strict mode and bundler module resolution
- **Tailwind CSS** + PostCSS for styling
- **Development**: `npm run dev` (watch mode)
- **Production**: `npm run build`

### Communication Patterns

#### Message Structure
All `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage` calls use structured objects:
```typescript
// Background → Content
{ message: "PROCESS_SINGLE_ITEM", current: BuuGuiProps, makh: string, keyMessage: string, options: any }

// Content → Background  
{ event: "CONTENT", message: "SEND_CAPCHAR", content: string, keyMessage: string }
{ event: "CONTENTMY", type: "CREATE_COMPLAINT", payload: { itemCode, token, type } }
{ event: "BADGE", content: string }

// Popup ↔ Background
{ type: "GET_INITIAL_DATA" | "SAVE_ORDERS" | "SET_CURRENT_INDEX" | "CLEAR_ORDERS", payload?: any }
```

#### Cross-Context Communication
- **Content Script ↔ MAIN world**: Uses `window.postMessage()` with `{ type: "MAIN" | "CONTENT", message: string, data: any }`
- **Background broadcasts**: `broadcastUpdate()` function sends `STORAGE_UPDATED` to all contexts when session storage changes

#### Important: Async Callbacks
Always return `true` from message listeners when using `sendResponse` asynchronously:
```typescript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // async work
    sendResponse({ status: 'success' });
  })();
  return true; // CRITICAL for async responses
});
```

### Firebase Integration

#### Configuration
Firebase config lives in two places:
- Background: `background.ts` uses compat libraries (`importScripts` for firebase-app-compat.js, firebase-database-compat.js)
- Popup/Options: Modern modular SDK in `src/popup/utils/firebaseConfig.ts`

#### Realtime Database Structure
```
xonapp-default-rtdb/
├── [keyMessage]/           # Dynamic key from user config
│   ├── message: string     # Commands from external system
│   ├── DoiTuong: string    # JSON payload
│   └── TimeStamp: string
├── MYVNPOST/
│   └── ExtraInfo/
│       └── [maVanDon]: string  # Order notes synced across devices
└── scanData/
    └── [timestamp]: BuuGuiProps[]  # Scanned items for processing
```

#### Sync Implementation (see FIREBASE_SYNC_IMPLEMENTATION.md)
- **ExtraInfo**: Order notes use `GET_EXTRA_INFO` and `UPDATE_EXTRA_INFO` messages to background
- Background queries/updates Firebase, then broadcasts to all tabs
- No local storage for this data - single source of truth in Firebase

### State Management

#### Background State
```typescript
let allScannedItems: BuuGuiProps[] = [];       // Source of truth from Firebase
let processedItems = new Set<string>();        // Successfully processed MaBuuGui
let processingQueue: string[] = [];            // Queue of pending items
let currentItemBeingProcessed: string | null;  // Currently active item
let isStoppedOnError: boolean;                 // Error flag halts processing
```

#### Popup State (Redux)
Store in `src/popup/store.tsx` with slice at `src/popup/popup.slice.tsx`:
```typescript
interface PopupState {
  orders: Order[];      // JSON data from user
  currentIndex: number; // Processing position
}
```
Changes automatically sync to `chrome.storage.session` and broadcast via background.

### Key Features Implementation

#### Batch Add Feature (BATCH_ADD_FEATURE.md)
**Flow**: Popup (BatchAddTab) → `chrome.tabs.sendMessage` → contentMy.tsx → DOM manipulation

**Critical Pattern** - Focus Management:
```typescript
// In BatchAddTab.tsx - activate tab BEFORE closing popup
await chrome.tabs.update(tab.id, { active: true });
chrome.tabs.sendMessage(tab.id, message);
setTimeout(() => window.close(), 100);

// In contentMy.tsx - multi-layer focus restoration
window.focus();
document.body.focus();
document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
await delay(200);
```

**Smart Button Finding** - Text-based selector (stable across DOM changes):
```typescript
const getAddButton = (): HTMLButtonElement | null => {
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent?.trim() === "Thêm bưu gửi vào lô") {
      return button as HTMLButtonElement;
    }
  }
  return null;
};
```

**React State Integration** - Force value changes:
```typescript
function forceChange(input: HTMLInputElement) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}
// Click cell → wait for input → set value → forceChange → blur
```

#### Portal Processing Queue
Background script manages processing queue with these functions:
- `handleDataChange()`: Firebase listener adding items to `allScannedItems`
- `processNextItemInBackground()`: Sends `PROCESS_SINGLE_ITEM` to content script
- `processSinglePortalItem()`: Content script processes one order, callbacks success/error
- Error handling: Sets `isStoppedOnError` flag, halts queue processing

### Development Patterns

#### Timing & Delays
Critical delays throughout codebase (from utils.ts):
```typescript
await delay(400);  // After clicking "Add" button (DOM update)
await delay(150);  // After clicking cell (wait for input)
await delay(200);  // Between rows (avoid race conditions)
await delay(2000); // Tab navigation/load
```

#### React Internals Access
`FindReact()` function in mainScript.tsx traverses React Fiber tree:
```typescript
function FindReact(dom: any, traverseUp: number = 0): any {
  const key = Object.keys(dom).find(key => 
    key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance")
  );
  // Returns React component instance with props/state
}
```

#### Excel/PDF Processing
- **Excel**: Uses SheetJS (xlsx) via `xlsxtool.js` importScript
- **PDF**: pdf-lib for generation, stored as base64 in chrome.storage.local, then blob conversion
- Functions: `pdfBlobTo64()`, `base64ToBlob()`, `convertBlobsToBlob()` in background/util.ts

### Type Definitions

#### Core Types (src/states/states.ts)
```typescript
type BuuGuiProps = {
  index: number;
  KhoiLuong: string;
  MaBuuGui: string;        // Tracking number
  TrangThai: string;
  TimeTrangThai: string;
  Id: string | null;
  IsBlackList: boolean;
  Money: number;
  ListDo: null;
  TrangThaiRequest: null;
}

type KhachHangProps = {
  MaKH: string;            // Customer code
  TenKH: string;
  BuuGuis: BuuGuiProps[];
  countState: { countDangGom, countPhanHuong, countNhanHang, countChapNhan };
}
```

#### VNPost API Types (src/types/vnpost.ts)
- `OrderHdr`: Order header (40+ fields)
- `OrderDetail`: Order details
- `OrderHistoryItem`: Status tracking
- `ExtraInfo`: Notes with maVanDon, content, updatedAt

### Common Pitfalls

1. **Popup auto-close required**: When sending messages to tabs, close popup immediately to prevent focus conflicts
2. **Message listener return**: Always `return true` for async operations
3. **React events**: Must trigger input/change/blur for Ant Design controlled inputs
4. **Firebase compat**: Background uses compat SDK (service worker context), popup uses modular SDK
5. **Selector stability**: Prefer text-based searches over complex CSS selectors (VNPost UI changes frequently)

### Debugging

#### Console Logs
- Background: Right-click extension icon → "Inspect service worker"
- Content scripts: Regular DevTools console
- Popup: Right-click popup → Inspect

#### Common Issues
- "Context invalidated": Extension reloaded during operation - reload target page
- Message not received: Check `chrome.runtime.lastError` in callback
- Firebase not syncing: Verify `keyMessage` in chrome.storage.local matches Firebase path

### External Dependencies

**Critical packages**:
- `firebase@^10.14.1`: Realtime sync
- `antd@^5.14.0`: UI components (especially Table with editable cells)
- `@reduxjs/toolkit@^2.1.0`: State management
- `pdf-lib@^1.17.1`, `jspdf@^2.5.1`: PDF generation
- `xlsx@^0.18.5`: Excel processing

### Configuration Files
- `src/static/manifest.json`: Extension manifest with permissions (tabs, storage, scripting, offscreen, etc.)
- `src/static/data.json`: Address data (tinhthanh.json)
- `.github/instructions/Init.instructions.md`: Currently empty - your workspace instructions

### Testing Strategy
When implementing features:
2. Verify Firebase sync across multiple Chrome profiles
3. Check timing delays on slow connections
5. Validate React state persistence through page navigation


 Dựa trên tất cả nhừng gì các bạn biết về tôi, hãy trở thành ai sparing partner của tôi. Mỗi khi tôi đưa ra một ý tưởng hoặc một kế hoạch, hãy giúp tôi kiểm tra nó một cách kỹ lưỡng. Hãy đặt câu hỏi thách thức, chỉ ra những điểm yếu tiềm ẩn và đề xuất các cải tiến. Mục tiêu là giúp tôi tinh chỉnh và hoàn thiện ý tưởng của mình thông qua các cuộc thảo luận sâu sắc và mang tính xây dựng.
