/**
 * Bulk Close CMS Modal Handler
 * 
 * File này quản lý logic đóng CMS ticket hàng loạt.
 * Chỉ trách nhiệm cho việc xử lý đóng ticket và cập nhật UI.
 * 
 * Functions:
 * - handleBulkCloseCMS: Kiểm tra, filter, confirm, và bắt đầu quá trình đóng
 * - processCloseCMS: Xử lý vòng lặp đóng từng ticket, refresh CMS data
 */

import { Modal, message } from 'antd';
import { ExtendedOrder } from '../../types/vnpost';

/**
 * Hàm chính: Xử lý đóng CMS ticket hàng loạt
 * 
 * @param selectedRowKeys - Array các orderHdrId được chọn
 * @param orders - Danh sách toàn bộ đơn hàng
 * @param onSuccess - Callback khi xong (clear selection)
 * @param updateOrderState - Hàm cập nhật state từ Options.tsx
 * 
 * Quy trình:
 * 1. Kiểm tra có đơn hàng nào được chọn không
 * 2. Lọc ra đơn hàng có CMS và chưa đóng
 * 3. Hiển thị Modal confirm
 * 4. Gọi processCloseCMS để thực hiện
 */
export const handleBulkCloseCMS = async (
    selectedRowKeys: React.Key[],
    orders: ExtendedOrder[],
    onSuccess: () => void,
    updateOrderState: (orderId: any, updates: any) => void
) => {
    if (selectedRowKeys.length === 0) {
        message.warning('Vui lòng chọn ít nhất một đơn hàng');
        return;
    }

    // Filter orders that have open CMS tickets
    const ordersToClose = orders.filter((o) => {
        if (!selectedRowKeys.includes(o.orderHdrId)) return false;

        if (!o.cmsData || !o.cmsData.tickets || o.cmsData.tickets.length === 0)
            return false;

        const latestTicket = o.cmsData.tickets[0];
        const lastAction = latestTicket.actions?.[latestTicket.actions.length - 1];

        // Skip if already closed
        if (lastAction?.content?.includes('Đóng yêu cầu')) {
            return false;
        }
        return true;
    });

    if (ordersToClose.length === 0) {
        message.info('Các đơn hàng đã chọn đều chưa có CMS hoặc đã được đóng.');
        return;
    }

    Modal.confirm({
        title: `Xác nhận đóng ${ordersToClose.length} ticket CMS`,
        content: `Hệ thống sẽ đóng CMS và cập nhật trạng thái. Lưu ý: Chỉ thực hiện với các đơn đã thực sự phát xong!`,
        okText: 'Thực hiện Đóng',
        cancelText: 'Hủy',
        onOk: async () => {
            await processCloseCMS(
                ordersToClose,
                updateOrderState,
                onSuccess
            );
        }
    });
};

/**
 * Hàm phụ: Thực hiện quá trình đóng từng ticket
 * 
 * @param ordersToClose - Danh sách đơn hàng cần đóng
 * @param updateOrderState - Callback cập nhật state
 * @param onSuccess - Callback sau khi xong
 * 
 * Chi tiết xử lý:
 * - Gửi CLOSE_CMS_TICKET message cho mỗi ticket
 * - Refresh CMS data sau khi đóng thành công
 * - Hiển thị progress message
 * - Tính toán success/fail count
 * - Delay 500ms giữa các request để tránh spam server
 */
const processCloseCMS = async (
    ordersToClose: ExtendedOrder[],
    updateOrderState: (orderId: any, updates: any) => void,
    onSuccess: () => void
) => {
    const hide = message.loading(
        `Đang đóng 0/${ordersToClose.length} ticket...`,
        0
    );

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < ordersToClose.length; i++) {
        const order = ordersToClose[i];
        const ticketId = order.cmsData!.tickets![0].ticketId;

        hide();
        message.loading(
            `Đang đóng ${i + 1}/${ordersToClose.length}: ${order.itemCode}...`,
            0
        );

        try {
            const response = await new Promise<any>((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        event: 'CONTENTMY',
                        type: 'CLOSE_CMS_TICKET',
                        payload: { ticketId: ticketId }
                    },
                    resolve
                );
            });

            if (response && response.status === 'success') {
                successCount++;

                // Refresh CMS data
                const updatedCmsData = await new Promise<any>((resolve) => {
                    const timeout = setTimeout(() => resolve(null), 3000);
                    chrome.runtime.sendMessage(
                        {
                            event: 'CONTENTMY',
                            type: 'FETCH_CMS_DATA',
                            payload: { maVanDon: order.itemCode }
                        },
                        (res) => {
                            clearTimeout(timeout);
                            resolve(res?.status === 'success' ? res.data : null);
                        }
                    );
                });
                updateOrderState(order.orderHdrId, { cmsData: updatedCmsData });
            } else {
                console.error(`Failed to close ${order.itemCode}:`, response?.error);
                failCount++;
            }
        } catch (error) {
            console.error(`Error closing ${order.itemCode}:`, error);
            failCount++;
        }

        // Delay to avoid spam
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    hide();

    if (failCount === 0) {
        message.success(`✅ Đã đóng thành công toàn bộ ${successCount} ticket!`);
    } else {
        message.warning(`⚠️ Đã đóng ${successCount}, lỗi ${failCount} ticket.`);
    }

    onSuccess();
};
