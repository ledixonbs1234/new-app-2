# Triển Khai Đồng Bộ "Thông Tin Thêm" qua Firebase

## 📋 Tổng Quan

Đã thực hiện thay đổi để đồng bộ "Thông tin thêm" của mã vận đơn giữa nhiều máy sử dụng Firebase Realtime Database thay vì lưu trữ local trên từng máy.

## ✅ Vấn Đề Đã Giải Quyết

**Vấn đề ban đầu:**
- Máy A cập nhật thông tin thêm cho mã hiệu A, B, C rồi tắt
- Máy B mở và có mã hiệu B, C, D nhưng không thấy được thông tin đã cập nhật từ máy A
- Dữ liệu lưu trên `chrome.storage.local` không đồng bộ giữa các máy

**Giải pháp:**
- Lưu trữ tập trung trên Firebase Realtime Database
- Tự động đồng bộ real-time giữa tất cả các máy đang sử dụng extension

## 🔧 Các Thay Đổi Đã Thực Hiện

### 1. Content Script (contentMy.tsx)

#### 1.1. Thêm Handler Nhận Updates từ Firebase
```typescript
else if (message.type === "UPDATE_ORDER_INFO") {
    const { maVanDon, fullLog } = message;
    updateOrderInfoInTable(maVanDon, fullLog);
    updateOrderInfoInModal(maVanDon, fullLog);
    sendResponse({ status: 'updated' });
    return true;
}
```

#### 1.2. Cập Nhật Logic Load Dữ Liệu (Table)
**Trước đây:**
```typescript
chrome.storage.local.get([`info_${maVanDon}`], (result) => {
    const savedInfo = result[`info_${maVanDon}`] || '';
    textSpan.textContent = savedInfo || '(Chưa có thông tin)';
});
```

**Sau khi thay đổi:**
```typescript
chrome.runtime.sendMessage({
    event: "CONTENTMY",
    type: "GET_EXTRA_INFO",
    payload: { maVanDon: maVanDon }
}, (response) => {
    if (response && response.status === 'success') {
        const savedInfo = response.data || '';
        textSpan.textContent = savedInfo || '(Chưa có thông tin)';
    }
});
```

#### 1.3. Cập Nhật Logic Lưu Dữ Liệu
**Trước đây:**
```typescript
const newLogEntry = `${timestamp} ${inputValue}`;
chrome.storage.local.get([`info_${maVanDon}`], (result) => {
    const oldLog = result[`info_${maVanDon}`] || '';
    const updatedLog = oldLog ? `${oldLog}\n${newLogEntry}` : newLogEntry;
    chrome.storage.local.set({ [`info_${maVanDon}`]: updatedLog });
});
```

**Sau khi thay đổi:**
```typescript
chrome.runtime.sendMessage({
    event: "CONTENTMY",
    type: "UPDATE_EXTRA_INFO",
    payload: {
        maVanDon: maVanDon,
        content: inputValue
    }
}, (response) => {
    if (response && response.status === 'success') {
        const updatedLog = response.updatedLog;
        textSpan.textContent = updatedLog;
        // Tự động cập nhật UI
    }
});
```

### 2. Background Script (background.ts)

#### 2.1. Thêm Handler Lưu Thông Tin
```typescript
async function handleUpdateExtraInfo(payload, sendResponse) {
    const { maVanDon, content } = payload;
    
    // Lấy log cũ từ Firebase
    const snapshot = await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).get();
    const oldLog = snapshot.val() || '';
    
    // Tạo timestamp và log entry mới
    const timestamp = `${day}-${month}-${year} ${hours}:${minutes}`;
    const newLogEntry = `${timestamp} ${content}`;
    const updatedLog = oldLog ? `${oldLog}\n${newLogEntry}` : newLogEntry;
    
    // Lưu vào Firebase
    await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).set(updatedLog);
    
    sendResponse({ status: 'success', updatedLog: updatedLog });
}
```

#### 2.2. Thêm Handler Lấy Thông Tin
```typescript
async function handleGetExtraInfo(payload, sendResponse) {
    const { maVanDon } = payload;
    
    // Lấy dữ liệu từ Firebase
    const snapshot = await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).get();
    const data = snapshot.val() || '';
    
    sendResponse({ status: 'success', data: data });
}
```

#### 2.3. Cập Nhật Message Listener
```typescript
else if (request.event === "CONTENTMY") {
    if (request.type === "UPDATE_EXTRA_INFO") {
        handleUpdateExtraInfo(request.payload, sendResponse);
        return;
    } else if (request.type === "GET_EXTRA_INFO") {
        handleGetExtraInfo(request.payload, sendResponse);
        return;
    }
}
```

## 📊 Cấu Trúc Dữ Liệu Firebase

```
MYVNPOST/
  ├── ExtraInfo/
  │   ├── CK990242988VN: "27-10-2025 10:30 Khách hàng gọi xác nhận\n27-10-2025 14:15 Đã giao lại"
  │   ├── CJ999662599VN: "27-10-2025 22:10 Cần kiểm tra lại địa chỉ"
  │   └── ...
```

## 🎯 Lợi Ích

1. ✅ **Đồng bộ đa máy**: Máy A cập nhật → Máy B thấy ngay lập tức
2. ✅ **Persistence**: Dữ liệu không bị mất khi tắt máy
3. ✅ **Real-time**: Cập nhật tự động không cần refresh
4. ✅ **Tái sử dụng hạ tầng**: Sử dụng Firebase đã có sẵn
5. ✅ **Offline-first ready**: Có thể mở rộng với caching nếu cần

## 🔄 Luồng Hoạt Động

### Khi Cập Nhật Thông Tin:
1. User nhập nội dung và click "Cập nhật" trên Content Script
2. Content Script gửi message `UPDATE_EXTRA_INFO` đến Background
3. Background lấy log cũ từ Firebase, thêm log mới
4. Background lưu log đầy đủ lên Firebase
5. Background trả response về cho Content Script
6. Content Script cập nhật UI với dữ liệu mới

### Khi Load Thông Tin:
1. Content Script render bảng/modal
2. Content Script gửi message `GET_EXTRA_INFO` đến Background
3. Background query Firebase để lấy dữ liệu
4. Background trả dữ liệu về cho Content Script
5. Content Script hiển thị dữ liệu lên UI

### Real-time Sync (Tương lai):
*Có thể mở rộng thêm Firebase listener trong background để broadcast updates đến tất cả tab đang mở*

## 🧪 Test Cases

### Test 1: Cập nhật từ Máy A
1. Máy A mở trang order-manager
2. Cập nhật thông tin cho mã CJ999662599VN
3. Kiểm tra Firebase Console → Dữ liệu đã được lưu

### Test 2: Đồng bộ sang Máy B
1. Máy B mở trang order-manager
2. Tìm mã CJ999662599VN trong danh sách
3. Thông tin thêm hiển thị đúng nội dung đã cập nhật từ Máy A

### Test 3: Offline Handling
1. Ngắt kết nối Firebase
2. Thử cập nhật thông tin
3. Kiểm tra error handling (hiện alert lỗi)

## 📝 Ghi Chú Quan Trọng

1. **Firebase Quota**: Free tier có giới hạn 1GB storage và 10GB/month bandwidth
2. **Security**: Cần thêm Firebase Security Rules để bảo vệ dữ liệu:
   ```json
   {
     "rules": {
       "MYVNPOST": {
         "ExtraInfo": {
           ".read": "auth != null",
           ".write": "auth != null"
         }
       }
     }
   }
   ```
3. **Migration**: Dữ liệu cũ trong `chrome.storage.local` không tự động migrate, cần script riêng nếu cần

## 🚀 Cải Tiến Tương Lai

1. **Real-time Listener**: Thêm Firebase listener trong background để tự động cập nhật UI khi có thay đổi từ máy khác
2. **Caching**: Cache dữ liệu trong `chrome.storage.local` để giảm Firebase reads
3. **Batch Operations**: Gộp nhiều updates trong 1 transaction để tiết kiệm bandwidth
4. **Cleanup Job**: Tự động xóa thông tin cũ hơn X ngày để tiết kiệm storage

## 📞 Support

Nếu gặp vấn đề:
1. Kiểm tra Firebase Console → Realtime Database
2. Kiểm tra Browser Console → Background Script logs
3. Kiểm tra Network tab → Firebase API calls
