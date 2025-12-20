# Component Documentation - Options Module

Tài liệu chi tiết về các components và modal handlers được tách từ Options.tsx

---

## 📂 File Structure

```
src/
├── options/
│   ├── Options.tsx (Main component)
│   ├── components/
│   │   ├── CMSTicketItem.tsx (Display CMS ticket)
│   │   ├── NewConfigRow.tsx (Input auto-config)
│   │   ├── CreateCMSModal.tsx (Create CMS modal)
│   │   ├── ExtraInfoEditor.tsx (Edit extra info logs)
│   │   └── BulkCMSModal.tsx (Bulk create CMS modal)
│   ├── modals/
│   │   ├── bulkCloseModal.ts (Close CMS handler)
│   │   └── bulkCMSModal.ts (Create CMS handler)
│   └── COMPONENT_DOCUMENTATION.md (This file)
├── features/
│   ├── autoProcess/
│   │   ├── handleAutoGenerateCMS.ts (Auto generate CMS logic)
│   │   ├── handleAutoCloseCMS.ts (Auto close CMS logic)
│   │   └── index.ts
│   ├── filters/
│   │   ├── useFiltering.ts (Custom hook for filtering)
│   │   └── index.ts
│   └── index.ts
```

---

## 🔧 Component Details

### 1. **CMSTicketItem.tsx** (~180 dòng)

**Mục đích**: Hiển thị chi tiết 1 CMS ticket

**Location**: Dùng trong DetailModal → CMS Tab

**Props**:
```typescript
interface CMSTicketItemProps {
    ticket: any;        // Ticket object từ CMS API
    itemCode: string;   // Mã vận đơn (để open CMS search)
}
```

**State**:
- `orgCode`: Mã đơn vị input (6 số)
- `orgInfo`: Info đơn vị (name + code)
- `comment`: Nội dung chuyển tiếp
- `loading`: Loading state khi gửi
- `templates`: Danh sách mẫu nội dung

**Main Features**:
- ✅ Hiển thị ticket code + header
- ✅ Render timeline actions (highlight action cuối)
- ✅ Form chuyển tiếp (chỉ show nếu chưa đóng)
- ✅ Templates selector
- ✅ Org code lookup

**Key Logic**:
```
isTicketClosed = lastAction.content includes "Đóng yêu cầu"
↓
Form hidden nếu closed
Template load nếu open
```

**Effects**:
1. Init default org code từ last action unit
2. Load templates nếu ticket chưa đóng

**Handlers**:
- `fetchOrgInfo(code)` - Fetch org info từ CMS API
- `handleOrgCodeChange(value)` - Validate 6 số, fetch org info
- `handleSend()` - Confirm + forward ticket

---

### 2. **NewConfigRow.tsx** (~80 dòng)

**Mục đích**: Input row để thêm cấu hình CMS tự động

**Location**: Settings → Auto CMS Config section

**Props**:
```typescript
interface NewConfigRowProps {
    onAdd: (item: CMSAutoConfig) => void;
}
```

**State**:
- `code`: Mã khách hàng input
- `type`: Loại ticket (support/complaint)
- `content`: Nội dung mẫu

**Layout**:
```
[Input: Mã KH] [Select: Type] [TextArea: Content] [Button: Add]
```

**Handlers**:
- `handleAdd()` - Validate + call onAdd callback + reset

**Features**:
- TextArea auto-resize (minRows: 1, maxRows: 4)
- Validate: code & content không rỗng
- Auto-reset form sau khi thêm

---

### 3. **CreateCMSModal.tsx** (~250 dòng)

**Mục đích**: Modal tạo CMS ticket mới cho đơn hàng

**Location**: Order table → Create CMS button (per order)

**Props**:
```typescript
interface CreateCMSModalProps {
    record: ExtendedOrder;
    updateOrderState: (orderHdrId: any, updates: any) => void;
}
```

**State**:
- `modalOpen`: Modal visible state
- `destOrgCode`: Mã đơn vị gửi (6 số)
- `orgInfo`: Org info (tên + code)
- `ticketType`: support | complaint
- `content`: Nội dung ticket
- `templates`: Mẫu nội dung
- `loading`: Loading state

**Conditional Rendering**:
```typescript
shouldShow = !cmsData || cmsData.tickets.length === 0
if (!shouldShow) return null; // Hide button nếu đã có CMS
```

**Main Flow**:
```
1. User clicks "Create CMS"
   ↓ handleOpenModal()
2. Load templates từ Firebase
3. Fetch CMS data (nếu chưa có)
4. Extract org code từ history
5. Open modal
   ↓
6. User select template/type, input content
7. User clicks "Create"
   ↓ handleCreateTicket()
8. Confirm dialog
9. CREATE_CMS_TICKET_V2 message
10. Refresh CMS data
11. Ask forward (nếu có org code)
    ↓ FORWARD_CMS_TICKET message
12. Close modal
```

**Features**:
- Service code display (info only)
- Org code auto-extract từ history
- Org code auto-lookup
- Template selection
- Custom content input
- Auto-forward after creation
- Error handling + retry

---

### 4. **ExtraInfoEditor.tsx** (~60 dòng)

**Mục đích**: Editor để thêm/xóa ghi chú extra info cho đơn hàng

**Location**: Chi tiết modal → Extra Info tab

**Props**:
```typescript
interface ExtraInfoEditorProps {
    maVanDon: string;
    initialValue?: string;
    onUpdate: (val: string) => void;
}
```

**State**:
- `value`: Input value (chưa submit)
- `logs`: Formatted log string (1 dòng = 1 ghi chú)

**Main Features**:
- ✅ Hiển thị logs với timestamp (color: blue)
- ✅ Input + Save button (gửi UPDATE_EXTRA_INFO)
- ✅ Delete last line button
- ✅ Auto-focus input khi mở
- ✅ Enter key to save

**Chrome Messages**:
- `UPDATE_EXTRA_INFO` - Thêm ghi chú mới
- `DELETE_LAST_LINE_EXTRA_INFO` - Xóa dòng cuối

---

### 5. **BulkCMSModal.tsx** (~250 dòng)

**Mục đích**: Modal tạo nhiều CMS tickets cùng lúc

**Props**:
```typescript
interface BulkCMSModalProps {
    open: boolean;
    onCancel: () => void;
    items: BulkCMSItem[];
    setItems: React.Dispatch<...>;
    templates: string[];
    isCreating: boolean;
    onStartCreation: () => void;
    onStop: () => void;
}
```

**State**:
- `globalTicketType`: Loại ticket cho tất cả
- `globalContent`: Nội dung chung cho tất cả
- `viewingHistory`: Order hiện tại đang xem lịch sử

**Main Features**:
- Global controls (chỉ show khi chưa tạo):
  - Select ticket type (support/complaint)
  - Select template từ dropdown
  - TextArea nhập nội dung chung
- Orders list:
  - Item status color + icon (⏳ pending, 🔄 processing, ✅ success, ❌ error)
  - Action type: 🆕 create hay 🔔 forward
  - Item code + receiver name + tag
  - OrgCode input + check button
  - Delete button (pending only)
- Action buttons:
  - Primary button: Tạo X CMS
  - Danger button: Dừng (khi đang tạo)
- History modal: Xem lịch sử hành trình của item

**Handlers**:
- `handleGlobalContentChange()` - Cập nhật content cho tất cả items
- `handleDeleteItem()` - Xóa item khỏi danh sách
- `handleOrgCodeChange()` - Cập nhật org code
- `handleCheckOrgCode()` - Tra cứu tên bưu cục từ API

---

### 6. **bulkCloseModal.ts** (~110 dòng)

**Mục đích**: Handle logic đóng CMS ticket hàng loạt

**Location**: Options main component → handleBulkCloseClick()

**Main Function**:
```typescript
export const handleBulkCloseCMS = async (
    selectedRowKeys: React.Key[],
    orders: ExtendedOrder[],
    onSuccess: () => void,
    updateOrderState: (orderId: any, updates: any) => void
)
```

**Flow**:
```
1. Check selectedRowKeys not empty
   ↓
2. Filter orders có CMS + chưa đóng
   - Must have: cmsData, tickets
   - Must NOT have: "Đóng yêu cầu" in last action
   ↓
3. Show confirm modal
   ↓
4. processCloseCMS():
   - Loop mỗi order
   - Send CLOSE_CMS_TICKET message
   - Wait response
   - Fetch updated CMS data
   - Delay 500ms
   - Update local state
   ↓
5. Show success/warning message
6. Clear selection (onSuccess)
```

**Exported Functions**:
- `handleBulkCloseCMS()` - Main entry point
- `processCloseCMS()` - Internal helper

**Error Handling**:
- Try-catch per ticket
- Count success/fail
- Show summary message

---

### 5. **bulkCMSModal.ts** (~200 dòng)

**Mục đích**: Handle logic tạo/forward CMS ticket hàng loạt

**Location**: Options main component → Auto Generate CMS feature

**Main Functions**:
```typescript
export const renderBulkCMSModal = (...)
export const handleBulkCreateCMS = (...)
export const handleBulkCMSCancel = (...)
```

**Flow - handleBulkCreateCMS()**:
```
Mỗi item trong list:
1. Check abort signal
   ↓
2. Nếu action === 'create':
   - CREATE_CMS_TICKET_V2 message
   - Set status = 'success'
   - Fetch updated CMS data
   ↓
3. Nếu action === 'forward':
   - Build dataOrgObj
   - FORWARD_CMS_TICKET message
   - Set status = 'success'
   ↓
4. Nếu error: Set status = 'error'
5. Delay 500ms
   ↓
6. Update items state (onSuccess)
7. Show result message
8. Auto close modal nếu success
```

**Dual Action Support**:
```typescript
item.action = 'create'  // Tạo ticket mới
     | 'forward' // Forward vào ticket cũ

Logic (từ handleAutoGenerateCMS):
- Nếu chưa có ticket → create
- Nếu có ticket chưa đóng + chưa có nội dung này:
  - Nếu ticket đóng → create mới
  - Nếu ticket mở → forward (không tạo nhiều)
- Nếu có nội dung rồi, ngày hôm nay → skip
```

**Abort Mechanism**:
```typescript
bulkCreationAbortRef.current = true
↓ Check mỗi iteration
↓ Dừng vòng lặp
```

---

## 📊 State Flow Diagram

```
Options.tsx (Main)
├── selectedRowKeys, orders
├── isBulkClosing, bulkCloseItems
├── isBulkCreating, bulkCMSItems
│
├── handleBulkCloseClick()
│   └─→ bulkCloseModal.handleBulkCloseCMS()
│       └─→ updateOrderState() [callback]
│
├── Table columns → order row
│   └─→ CreateCMSModal (per order)
│       ├── updateOrderState() [callback]
│       └─→ chrome.runtime.sendMessage()
│
├── CMSTicketItem (inside DetailModal)
│   └─→ chrome.runtime.sendMessage()
│
└─→ NewConfigRow (inside Settings)
    └─→ onAdd() [callback]
```

---

## 🔌 Chrome Message Types

### From Components:

| Message Type | Source | Purpose |
|---|---|---|
| GET_CMS_TEMPLATES | CMSTicketItem, CreateCMS | Load mẫu từ Firebase |
| FETCH_CMS_DATA | CreateCMS, bulkClose | Fetch CMS data |
| CREATE_CMS_TICKET_V2 | CreateCMS, bulkCMS | Tạo ticket mới |
| FORWARD_CMS_TICKET | CMSTicketItem, bulkCMS | Forward ticket |
| CLOSE_CMS_TICKET | bulkClose | Đóng ticket |
| OPEN_CMS_SEARCH | CMSTicketItem | Open CMS website |

---

## 🎯 Usage Examples

### Using CreateCMSModal:
```tsx
<CreateCMSModal
    record={orderRecord}
    updateOrderState={(id, updates) => {
        setOrders(orders.map(o => 
            o.orderHdrId === id ? {...o, ...updates} : o
        ))
    }}
/>
```

### Using CMSTicketItem:
```tsx
{ticket.map(t => (
    <CMSTicketItem 
        key={t.ticketId}
        ticket={t}
        itemCode={order.itemCode}
    />
))}
```

### Using handleBulkCloseCMS:
```tsx
const handleBulkCloseClick = async () => {
    setIsBulkClosing(true);
    try {
        await handleBulkCloseCMS(
            selectedRowKeys,
            orders,
            () => setSelectedRowKeys([]),
            updateOrderState
        );
    } finally {
        setIsBulkClosing(false);
    }
};
```

---

## 🐛 Known Limitations / TODO

- [ ] bulkCMSModal.renderBulkCMSModal() - return simple object, not React element
  - Có thể upgrade thành React component sau
- [ ] CreateCMSModal - forward logic nested trong create handler
  - Có thể tách ra handleAutoForward() function sau
- [ ] Templates loading duplicate (CMSTicketItem + CreateCMS)
  - Có thể move to Redux/Context sau

---

## 📝 Comments Convention

Mỗi file có:
1. **File header** - Mô tả chung
2. **Section headers** - STATE, EFFECTS, HANDLERS
3. **Function docs** - @param, Quy trình, Lưu ý
4. **Inline comments** - Giải thích logic phức tạp

```typescript
/**
 * Function name: Mô tả
 * 
 * @param name - description
 * 
 * Quy trình:
 * 1. Step 1
 * 2. Step 2
 * 
 * Lưu ý: Important notes
 */
```

---

## 🔌 Services (Phase 3)

### 1. **services/api.ts** (~130 dòng)

**Mục đích**: Centralize tất cả HTTP requests tới VNPost APIs

**Main Functions**:
- `fetchAccountSettings(token)` - Get account info + orgCode
- `searchOrderByItemCode(itemCode, token)` - Search order by code
- `fetchOrderDetails(orderHdrId, token)` - Get full order data
- `fetchOrderHistory(itemCode, token)` - Get tracking history
- `fetchOrders(token, orgCode, statusList, dateRange)` - Fetch multiple orders with filters
- `saveCMSCloseResult(token, ticketId, reason)` - Save CMS close result
- `changeCMSTicketStatus(token, ticketId, newStatus)` - Change ticket status
- `checkOrgCode(code)` - Lookup organization info

---

### 2. **services/chromeMessage.ts** (~160 dòng)

**Mục đích**: Centralize tất cả chrome.runtime.sendMessage calls

**Main Functions**:
- `getCMSTemplates()` - Get templates from Firebase
- `saveCMSTemplates(templates)` - Save templates
- `getCMSAutoConfigs()` - Get auto-config list
- `saveCMSAutoConfigs(configs)` - Save auto-configs
- `fetchCMSData(maVanDon)` - Fetch CMS data for order
- `getExtraInfo(maVanDon)` - Get extra info logs
- `updateExtraInfo(maVanDon, content)` - Update extra info
- `deleteLastLineExtraInfo(maVanDon)` - Delete last line
- `createCMSTicket(...)` - Create CMS ticket
- `forwardCMSTicket(...)` - Forward CMS ticket
- `closeCMSTicket(...)` - Close CMS ticket
- `sendChromeMessageWithTimeout(message, timeout)` - Message with timeout

---

## 🪝 Custom Hooks (Phase 3)

### 1. **useOrderData** (~120 dòng)

**Mục đích**: Manage order data, fetching, và caching

**Hook API**:
```typescript
const {
    orders,
    setOrders,
    loading,
    handleFetchOrders,      // Fetch with filters
    handleFetchSingleOrder, // Search single order
    updateOrderState,       // Update specific order
    handleClearCache        // Clear cache
} = useOrderData();
```

**Features**:
- Auto-loads từ cache (3 hours TTL)
- Promise-based API calls
- Auto-error handling + message display
- Batch parallel data fetching (history, extra info, cms data)

---

### 2. **useDetailModal** (~40 dòng)

**Mục đích**: Manage detail modal state (open/close, current order, active tab)

**Hook API**:
```typescript
const {
    detailModalOpen,
    setDetailModalOpen,
    currentDetailOrder,
    setCurrentDetailOrder,
    detailModalActiveTab,
    setDetailModalActiveTab,
    openDetailModal,        // Smart open function
    closeDetailModal,       // Smart close function
    switchTab               // Change tab
} = useDetailModal();
```

---

## 🔄 Refactoring Roadmap

**Phase 1** ✅ Tách Components & Modal Handlers
- CMSTicketItem ✅
- NewConfigRow ✅
- CreateCMSModal ✅
- bulkCloseModal ✅
- bulkCMSModal ✅

**Phase 2** ✅ Tách Auto-process & Filters
- handleAutoGenerateCMS → features/autoProcess/ ✅
- handleAutoCloseCMS → features/autoProcess/ ✅
- orderFilters logic → features/filters/ ✅
- useFiltering hook ✅

**Phase 3** ✅ Tách API & Hooks
- API calls → services/api.ts ✅
- Chrome messages → services/chromeMessage.ts ✅
- useOrderData hook ✅
- useDetailModal hook ✅
- useFiltering hook ✅ (Phase 2)

---

Last Updated: 2025-12-20
Version: 1.0
