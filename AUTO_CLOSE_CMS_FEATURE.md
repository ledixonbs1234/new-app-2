# Tính năng Tự động đóng CMS

## Tổng quan
Thêm tính năng tự động quét và đóng các ticket CMS cho đơn hàng đã phát thành công nhưng chưa đóng.

## Các thành phần được thêm

### 1. State mới
```typescript
const [bulkCloseModalOpen, setBulkCloseModalOpen] = useState(false);
const [bulkCloseItems, setBulkCloseItems] = useState<any[]>([]);
const [isAutoClosing, setIsAutoClosing] = useState(false);
const [isAutoClosingProcessing, setIsAutoClosingProcessing] = useState(false);
```

### 2. Hàm `handleAutoCloseCMS()`
**Vị trí:** Dòng ~795

**Chức năng:**
- Quét tất cả đơn hàng có trạng thái `['14', '23', '25', '26']` (Phát thành công)
- Lọc những đơn có CMS Ticket chưa đóng (action cuối cùng không chứa "Đóng yêu cầu")
- Tạo danh sách items cần đóng
- Mở modal để xác nhận

**Logic:**
```
1. Lọc candidateOrders (Phát TC + Có CMS + Chưa đóng)
2. Map danh sách items cần đóng
3. Hiện modal với danh sách
```

### 3. Button UI
**Vị trí:** Dòng ~1955 (bên cạnh button "Tự động CMS")

```jsx
<Tooltip title="Tự động quét đơn Phát TC chưa đóng CMS và chuẩn bị đóng">
    <Button
        type="primary"
        style={{ background: 'linear-gradient(45deg, #13C2C2, #52C41A)', border: 'none' }}
        icon={🤖}
        onClick={handleAutoCloseCMS}
        loading={isAutoClosing}
        className="shadow-md hover:shadow-lg transition-all"
    >
        Tự động đóng CMS
    </Button>
</Tooltip>
```

### 4. Modal - Bulk Close CMS
**Vị trí:** Dòng ~2195

**Chức năng:**
- Hiển thị danh sách ticket cần đóng
- Nút "Đóng CMS" để bắt đầu quá trình
- Hiển thị status (pending → processing → success/error)
- Refresh CMS data sau khi hoàn thành

**API Calls:**
1. **Save Result (PTC)**
   ```
   POST: https://cms.vnpost.vn/api/admin/complaints/save-result
   Body: FormData với actType=4, actResult=490, ttkId, actContent=PTC
   ```

2. **Change Status**
   ```
   POST: https://cms.vnpost.vn/api/admin/complaints/changestatus
   Body: ids={ticketId}
   ```

## Quy trình làm việc

### Bước 1: Kích hoạt tính năng
- Click button "🤖 Tự động đóng CMS"

### Bước 2: Phân tích
- Hệ thống quét tất cả đơn hàng phát thành công
- Lọc những đơn có ticket CMS chưa đóng
- Hiển thị danh sách items

### Bước 3: Xác nhận
- Review danh sách trong modal
- Click button "🔒 Đóng CMS" để bắt đầu
- Xác nhận lần thứ 2 (không thể hoàn tác)

### Bước 4: Thực hiện
- Hệ thống gửi 2 request cho mỗi ticket:
  1. Save result (PTC)
  2. Change status (Đóng)
- Cập nhật UI real-time (processing → success/error)
- Delay 800ms giữa các request để tránh spam

### Bước 5: Hoàn tất
- Refresh CMS data cho tất cả ticket thành công
- Hiển thị tổng kết (X thành công, Y lỗi)
- Đóng modal

## Trạng thái Items

| Status | Icon | Mô tả |
|--------|------|-------|
| pending | ⏳ | Chờ xử lý |
| processing | 🔄 | Đang xử lý (animate) |
| success | ✅ | Đóng thành công |
| error | ❌ | Lỗi |

## Màu sắc
- **Button gradient:** Cyan (#13C2C2) → Green (#52C41A)
- **Modal title gradient:** Cyan (#06B6D4) → Green (#16A34A)

## Xử lý lỗi
- Try-catch bao quanh mỗi request
- Lỗi được ghi lại và hiển thị trong item
- Tiếp tục xử lý các ticket tiếp theo
- Thống kê lỗi cuối cùng

## Cải tiến so với manual closing
- ✅ Đóng hàng loạt thay vì từng cái
- ✅ Tự động phân tích đơn hàng
- ✅ Real-time progress tracking
- ✅ Auto-refresh CMS data
- ✅ Error handling & reporting

