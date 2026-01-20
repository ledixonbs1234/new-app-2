import { message } from 'antd';
import { ExtendedOrder } from '../../types/vnpost';

interface CloseCMSItem {
    order: ExtendedOrder;
    status: 'pending' | 'processing' | 'success' | 'error';
    ticketId: string;
    ticketCode: string;
    error: string;
}

export const handleAutoCloseCMS = async (
    orders: ExtendedOrder[],
    setIsAutoClosing: (val: boolean) => void,
    setBulkCloseItems: (items: CloseCMSItem[]) => void,
    setBulkCloseModalOpen: (val: boolean) => void
) => {
    // Xác định danh sách đơn hàng cần xử lý (Phát thành công + Chưa đóng CMS)
    const targetStatus = ['14', '23', '25', '26']; // Phát thành công

    // Lọc danh sách candidate
    const candidateOrders = orders.filter(order => {
        if (!targetStatus.includes(order.status)) return false;

        // Kiểm tra cmsData đã được load
        if (order.cmsData === undefined) return false;

        // Phải có CMS Ticket
        if (!order.cmsData?.tickets || order.cmsData.tickets.length === 0) return false;

        // Kiểm tra ticket mới nhất chưa đóng
        const latestTicket = order.cmsData.tickets[0];
        const lastAction = latestTicket.actions?.[latestTicket.actions.length - 1];

        // Nếu action cuối cùng đã là Đóng thì bỏ qua
        if (lastAction?.content?.includes("Đóng yêu cầu")) {
            return false;
        }

        return true;
    });

    if (candidateOrders.length === 0) {
        message.warning("Không tìm thấy đơn hàng nào cần đóng CMS (Phát TC + Chưa đóng). Hãy tải dữ liệu chi tiết trước!");
        return;
    }

    setIsAutoClosing(true);
    message.loading({ content: `Đang phân tích ${candidateOrders.length} đơn...`, key: 'auto_close', duration: 1.5 });

    // Xây dựng danh sách items cần đóng
    const closeItems: CloseCMSItem[] = candidateOrders.map(order => ({
        order,
        status: 'pending' as const,
        ticketId: order.cmsData!.tickets[0].ticketId,
        ticketCode: order.cmsData!.tickets[0].ticketCode,
        error: ''
    }));

    setIsAutoClosing(false);
    message.success({ content: `Đã lập danh sách ${closeItems.length} ticket cần đóng!`, key: 'auto_close' });

    setBulkCloseItems(closeItems);
    setBulkCloseModalOpen(true);
};
