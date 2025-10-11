# Chức năng Thêm Danh Sách Hàng Loạt

## Tổng quan
Chức năng này cho phép người dùng tự động thêm nhiều dòng với nội dung và khối lượng giống nhau vào trang tạo đơn hàng loạt của VNPost.

## Cách sử dụng

### 1. Mở Popup Extension
- Click vào icon extension trong Chrome toolbar
- Chọn tab **"Thêm danh sách"**

### 2. Điền thông tin
- **Số lượng dòng cần thêm**: Nhập số lượng dòng muốn thêm (1-100)
- **Nội dung hàng hóa**: Nhập nội dung mô tả hàng hóa
- **Khối lượng**: Nhập khối lượng (ví dụ: 1.000 cho 1kg)

### 3. Thực hiện thêm
1. Mở trang: https://my.vnpost.vn/order/domestic/batch/create
2. Click nút **"Thêm danh sách"** trong popup
3. **Popup sẽ tự động đóng** sau 0.5 giây (để tránh xung đột focus)
4. Extension sẽ tự động:
   - Kiểm tra URL có đúng không
   - Click nút thêm dòng
   - Điền nội dung hàng hóa và khối lượng cho mỗi dòng

### ⚠️ Quan trọng
**Popup tự động đóng** sau khi bấm "Thêm danh sách" vì:
- Khi popup mở, Chrome Extension chiếm quyền focus
- Việc click vào cell trên trang web bị ảnh hưởng
- React không thể xử lý events đúng cách
- Kết quả: Input field xuất hiện nhưng không lưu được giá trị

**Giải pháp**: Đóng popup ngay lập tức → Trang web lấy lại focus → Mọi thứ hoạt động bình thường

## Kỹ thuật thực hiện

### Luồng xử lý
```
Popup (BatchAddTab) 
  ↓ (chrome.tabs.sendMessage)
Content Script (contentMy.tsx)
  ↓ (handleAddBatchRows)
DOM Manipulation
```

### Chi tiết code

#### 1. Popup Component (`src/popup/components/BatchAddTab.tsx`)
- Form nhập liệu với validation
- Gửi message tới content script thông qua `chrome.tabs.sendMessage`
- Xử lý response và hiển thị kết quả

#### 2. Content Script Handler (`src/contentScript/contentMy.tsx`)
- Nhận message type `"ADD_BATCH_ROWS"`
- Gọi hàm `handleAddBatchRows()` để xử lý

#### 3. DOM Manipulation Logic
```typescript
async function handleAddBatchRows(payload) {
  // Multi-layer focus restoration
  window.focus();
  document.body.focus();
  const clickEvent = new MouseEvent('mousedown', { bubbles: true, ... });
  document.body.dispatchEvent(clickEvent);
  await delay(200);
  
  // Function to find button by text (stable approach)
  const getAddButton = () => {
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      if (button.textContent?.trim() === "Thêm bưu gửi vào lô") {
        return button;
      }
    }
    return null;
  };
  
  // Loop to add rows
  for (let i = 0; i < rowCount; i++) {
     a. Tìm lại nút "Thêm bưu gửi vào lô" (text-based, luôn ổn định)
     b. Click nút thêm
     c. Đợi DOM update (delay 400ms)
     d. Tìm dòng vừa thêm (tr cuối cùng trong tbody)
     e. Click vào cell "Nội dung hàng hóa" để kích hoạt edit mode
     f. Đợi input xuất hiện (delay 150ms)
     g. Điền nội dung vào input và trigger React events (forceChange)
     h. Blur để lưu giá trị
     i. Click vào cell "Khối lượng" để kích hoạt edit mode
     j. Đợi input xuất hiện (delay 150ms)
     k. Điền khối lượng vào input và trigger React events (forceChange)
     l. Blur để lưu giá trị
     m. Delay 200ms trước khi lặp tiếp
  }
}
```

### Selectors sử dụng

#### Intelligent Add Button Finding (Text-based)
Thay vì dựa vào DOM selector phức tạp và dễ thay đổi, chúng ta tìm button dựa vào **text content**:

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

**Ưu điểm**:
- ✅ **Ổn định**: Không bị ảnh hưởng bởi thay đổi DOM structure
- ✅ **Đơn giản**: Không cần phân biệt 0 rows, 1 row, hay nhiều rows
- ✅ **Dễ maintain**: Chỉ cần text không đổi là vẫn hoạt động
- ✅ **Language-independent**: Có thể dễ dàng adapt cho ngôn ngữ khác

**Lịch sử vấn đề**:
- ❌ **V1**: Selector cố định → Bị lỗi khi có dòng
- ❌ **V2**: Phân nhánh theo số dòng (0 vs ≥1) → Vẫn bị lỗi khi VNPost thay đổi structure  
- ✅ **V3**: Tìm theo text "Thêm bưu gửi vào lô" → Luôn hoạt động!

- **Tbody container**:
  ```
  #form-create-order > div.ant-row > div > div > div > 
  div.ant-collapse-content.ant-collapse-content-active > div > 
  div.ant-table-wrapper > div > div > div > div > div > 
  table > tbody
  ```

- **Editable cell**: `.editable-cell-value-wrap`

### Timing & Delays
- **400ms**: Sau khi click nút thêm dòng (đợi DOM update và render hoàn tất)
- **150ms**: Sau khi click cell để kích hoạt edit mode (đợi input field xuất hiện)
- **100ms**: Sau khi blur input (đảm bảo React state được cập nhật)
- **200ms**: Giữa mỗi dòng để tránh race condition

### React State Management
Thay vì chèn trực tiếp vào DOM (sẽ bị mất khi React re-render), code sẽ:
1. **Click vào cell** → Kích hoạt edit mode
2. **Chờ input xuất hiện** → Ant Design tạo input field
3. **Điền vào input** → Set value
4. **Trigger React events** → `forceChange()` dispatch input/change/blur events
5. **Blur input** → React lưu giá trị vào state

**Ưu điểm:**
- ✅ Giá trị được lưu vào React state (không bị mất khi re-render)
- ✅ Tương thích với Ant Design Table editable cells
- ✅ Trigger validation và side effects của React
- ✅ Persistent data (có thể submit form sau đó)

## Files được thay đổi

### 1. `src/popup/components/BatchAddTab.tsx` (NEW)
Component React cho tab "Thêm danh sách"

### 2. `src/popup/Popup.tsx`
- Import `BatchAddTab`
- Thêm tab mới vào `items` array

### 3. `src/contentScript/contentMy.tsx`
- Thêm hàm `handleAddBatchRows()`
- Thêm message listener cho `"ADD_BATCH_ROWS"`

## Xử lý lỗi

### Validation
- Số lượng dòng phải > 0
- Nội dung không được để trống
- Khối lượng không được để trống

### Runtime checks
- Kiểm tra URL có đúng trang batch create
- Kiểm tra tìm thấy nút thêm dòng
- Kiểm tra tìm thấy tbody
- Kiểm tra tìm thấy dòng mới sau khi thêm

### Error messages
- Hiển thị qua Ant Design `message` component
- Log chi tiết vào console cho debugging

### Focus Management Issue (FIXED v2)

**Vấn đề ban đầu**: 
- Khi popup mở, click vào cell không kích hoạt edit mode đúng cách
- Input field xuất hiện nhưng không lưu được giá trị vào React state

**Fix v1 - Đóng popup**: 
- ✅ Popup tự động đóng sau khi gửi message
- ❌ Vẫn cần phải click vào trang web để hoạt động

**Vấn đề phát hiện thêm**:
- Sau khi popup đóng, trang web vẫn **chưa có focus**
- Window focus state vẫn ở trạng thái "inactive"
- Cần user click vào trang web để kích hoạt focus
- Đây là hành vi của Chrome Extension API

**Nguyên nhân sâu xa**:
```
Extension Popup mở
   ↓
Chrome tạo một window riêng cho popup
   ↓
Main tab bị đặt ở trạng thái "background" (inactive)
   ↓
Đóng popup
   ↓
Tab vẫn ở trạng thái "background" ❌
   ↓
Cần user click hoặc programmatic focus ✅
```

**Fix v2 - Multi-layer Focus Restoration**:

**1. Trong Popup (trước khi đóng)**:
```typescript
// Activate tab trước khi đóng popup
await chrome.tabs.update(tab.id, { active: true });

// Gửi message
chrome.tabs.sendMessage(tab.id, message);

// Đóng popup sau 100ms để đảm bảo message được gửi
setTimeout(() => window.close(), 100);
```

**2. Trong Content Script (khi nhận message)**:
```typescript
// Force focus vào window
window.focus();
document.body.focus();

// Simulate click để trigger focus events
const clickEvent = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: window
});
document.body.dispatchEvent(clickEvent);

// Delay 200ms để đảm bảo focus hoàn tất
await delay(200);
```

**3. Flow hoàn chỉnh**:
```
User click "Thêm danh sách"
   ↓
Show message (500ms)
   ↓
chrome.tabs.update → Activate tab
   ↓
Send message to content script
   ↓
Close popup (after 100ms)
   ↓
Content script: window.focus()
   ↓
Content script: document.body.focus()
   ↓
Content script: Dispatch mousedown event
   ↓
Delay 200ms → Focus fully restored ✅
   ↓
Start clicking cells → Everything works!
```

**Tại sao cần nhiều lớp focus?**:
1. `chrome.tabs.update` → OS-level window activation
2. `window.focus()` → JavaScript window focus
3. `document.body.focus()` → DOM focus
4. `MouseEvent` → Simulate user interaction (trigger React event handlers)
5. `delay(200ms)` → Đợi browser xử lý tất cả events

**Kết quả**:
- ✅ Không cần user click vào trang web
- ✅ Content script tự động restore focus
- ✅ Tất cả click events hoạt động ngay lập tức
- ✅ React controlled inputs hoạt động bình thường

## Testing

### Test cases
1. ✅ Thêm 1 dòng với nội dung và khối lượng
2. ✅ Thêm nhiều dòng (ví dụ: 10 dòng)
3. ✅ Validation: Số lượng = 0
4. ✅ Validation: Nội dung rỗng
5. ✅ Validation: Khối lượng rỗng
6. ✅ Wrong URL: Không phải trang batch create
7. ✅ DOM not found: Nút thêm không tồn tại

### Debug
Mở Chrome DevTools Console để xem:
- Messages được gửi từ popup
- Response từ content script
- Errors nếu có

## Limitations
- Chỉ hoạt động trên trang `https://my.vnpost.vn/order/domestic/batch/create`
- Phụ thuộc vào cấu trúc DOM hiện tại (có thể thay đổi nếu VNPost cập nhật UI)
- Delay timing có thể cần điều chỉnh tùy tốc độ mạng

## Future improvements
- [ ] Hỗ trợ nhiều template nội dung/khối lượng khác nhau
- [ ] Lưu template đã dùng
- [ ] Import từ Excel/CSV
- [ ] Progress bar khi thêm nhiều dòng
- [ ] Retry mechanism nếu thất bại
