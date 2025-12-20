# Options Component Refactoring

## Summary
File `Options.tsx` (3493 dòng) đã được tách thành các file nhỏ hơn để dễ maintain và quản lý.

### Trước Refactoring
- `Options.tsx`: **3493 dòng** - chứa tất cả logic, components, modals

### Sau Refactoring

#### Components (src/options/components/)
- **CMSTicketItem.tsx** (~180 dòng)
  - Component hiển thị CMS ticket với actions và form chuyển tiếp
  - Props: ticket, itemCode
  - Handles: ticket forwarding, org info lookup

- **NewConfigRow.tsx** (~60 dòng)
  - Component input hàng loạt cho cấu hình CMS auto
  - Props: onAdd callback
  - Handles: code, ticket type, content input

- **CreateCMSModal.tsx** (~220 dòng)
  - Modal tạo CMS ticket mới
  - Props: record (ExtendedOrder), updateOrderState
  - Handles: ticket creation, CMS template selection, org forwarding

#### Modal Handlers (src/options/modals/)
- **bulkCloseModal.ts** (~90 dòng)
  - Handle logic đóng CMS ticket hàng loạt
  - Exports: handleBulkCloseCMS
  - Handles: confirmation modal, batch closing process

- **bulkCMSModal.ts** (~130 dòng)
  - Handle logic tạo CMS ticket hàng loạt
  - Exports: handleBulkCreateCMS, renderBulkCMSModal, handleBulkCMSCancel
  - Handles: create/forward logic, batch processing

#### Updated Files
- **Options.tsx**: ~2100 dòng
  - Giảm 39% dòng code
  - Chỉ chứa main component logic
  - Import các components/modals cần thiết

- **src/types/vnpost.ts**
  - Thêm: ExtendedOrder interface
  - Thêm: BulkCMSItem interface
  - Consolidated type definitions

## Benefits
✅ Dễ bảo trì: Mỗi component độc lập, có trách nhiệm rõ ràng  
✅ Dễ test: Các module nhỏ, dễ unit test  
✅ Tái sử dụng: Components/handlers có thể dùng ở chỗ khác  
✅ Dễ đọc: Mỗi file ~100-200 dòng, dễ hiểu tác dụng  
✅ Quản lý: Thay đổi 1 feature không ảnh hưởng 3 cái khác  

## File Size Comparison
```
BEFORE:
  Options.tsx: 3493 lines (93KB)

AFTER:
  Options.tsx: ~2100 lines (56KB)
  CMSTicketItem.tsx: ~180 lines (6KB)
  NewConfigRow.tsx: ~60 lines (2KB)
  CreateCMSModal.tsx: ~220 lines (8KB)
  bulkCloseModal.ts: ~90 lines (4KB)
  bulkCMSModal.ts: ~130 lines (5KB)
  Total: ~2780 lines (81KB) - thêm type definitions
```

## Next Steps
- Tách Auto-process logic (handleAutoGenerateCMS, handleAutoCloseCMS)
- Tách Filtering logic vào hooks (useFiltering, useFilteredOrders)
- Tách API calls vào services (apiService.ts, chromeMessage.ts)
- Tách custom hooks (useOrderData, useDetailModal)
