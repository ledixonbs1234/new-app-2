import { useMemo } from 'react';
import { ExtendedOrder } from '../../types/vnpost';

interface UseFilteringProps {
    orders: ExtendedOrder[];
    searchText: string;
    filterNoCMS: boolean;
    filterLongDelivery: boolean;
    filterPendingCMSDelivered: boolean;
    LONG_DELIVERY_THRESHOLD?: number;
}

/**
 * Tách toàn bộ logic filtering từ Options.tsx
 * Trả về danh sách đơn hàng đã lọc dựa trên các điều kiện
 */
export const useFiltering = ({
    orders,
    searchText,
    filterNoCMS,
    filterLongDelivery,
    filterPendingCMSDelivered,
    LONG_DELIVERY_THRESHOLD = 3
}: UseFilteringProps): ExtendedOrder[] => {
    // Helper functions
    const parseDate = (str: string) => {
        if (!str) return null;
        try {
            const [d, t] = str.split(' ');
            const [day, month, year] = d.split('/');
            const [h, m, s] = t.split(':');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m), parseInt(s));
        } catch (e) { return null; }
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            // Search text filter
            if (searchText) {
                const lower = searchText.toLowerCase();
                const matchesSearch = (
                    order.itemCode?.toLowerCase().includes(lower) ||
                    order.receiverName?.toLowerCase().includes(lower) ||
                    order.receiverPhone?.includes(searchText) ||
                    order.detail?.receiverPhone?.includes(searchText)
                );
                if (!matchesSearch) return false;
            }

            // No CMS filter
            if (filterNoCMS) {
                // Chỉ hiển thị đơn hàng khi:
                // 1. cmsData đã được fetch (không undefined)
                // 2. Và tickets là mảng rỗng (chưa có CMS)
                if (order.cmsData === undefined) return false; // Chưa fetch CMS, bỏ qua
                const hasCMS = order.cmsData?.tickets && order.cmsData.tickets.length > 0;
                if (hasCMS) return false; // Có CMS, bỏ qua

                // 3. Loại bỏ đơn hàng đã Chuyển hoàn (không cần lập CMS)
                const history = order.history?.orderStatusHistoryDtoList || [];
                const isReturn = history.some(h => {
                    const statusLower = (h.statusText || "").toLowerCase();
                    return statusLower.includes("chuyển hoàn");
                });
                if (isReturn) return false;
            }

            // Long delivery duration filter
            if (filterLongDelivery) {
                const history = order.history?.orderStatusHistoryDtoList || [];
                const firstDelivery = history.slice().reverse().find(h =>
                    h.statusText === "Đang phát hàng" || h.statusText === "Đã xác nhận đến phát"
                );
                if (firstDelivery) {
                    const startDate = parseDate(firstDelivery.traceDate);
                    if (startDate) {
                        const now = new Date();
                        const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays < LONG_DELIVERY_THRESHOLD) return false;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            // Pending CMS with successful delivery filter
            if (filterPendingCMSDelivered) {
                // 1. Phải có CMS Data
                if (!order.cmsData || !order.cmsData.tickets || order.cmsData.tickets.length === 0) {
                    return false;
                }

                // 2. Lấy ticket mới nhất và action cuối cùng
                const latestTicket = order.cmsData.tickets[0]; // Giả định ticket đầu tiên là mới nhất
                const actions = latestTicket.actions || [];

                // Nếu không có action nào, coi như chưa đóng -> Giữ lại (return true)
                // Nếu có action, kiểm tra nội dung cuối cùng
                if (actions.length > 0) {
                    const lastAction = actions[actions.length - 1]; // Action cuối cùng (mới nhất theo mảng đã sort)
                    // Nội dung bắt đầu bằng "Đóng yêu cầu" -> Loại bỏ (vì đã đóng rồi)
                    if (lastAction.content && lastAction.content.trim().startsWith("Đóng yêu cầu")) {
                        return false;
                    }
                }

                // 3. Kiểm tra lịch sử hành trình: Phải Phát TC và Không Hủy Phát TC
                const history = order.history?.orderStatusHistoryDtoList || [];
                const hasSuccess = history.some(h => h.statusText.toLowerCase().includes("phát hàng thành công"));
                const hasCancel = history.some(h => h.statusText.toLowerCase().includes("hủy phát hàng thành công"));

                // Điều kiện: Có phát thành công VÀ Không bị hủy
                if (!hasSuccess || hasCancel) {
                    return false;
                }
            }

            return true;
        });
    }, [orders, searchText, filterNoCMS, filterLongDelivery, filterPendingCMSDelivered, LONG_DELIVERY_THRESHOLD]);

    return filteredOrders;
};

/**
 * Order filters logic - Helper để lấy filter states
 */
export interface OrderFilters {
    filterNoCMS: boolean;
    filterLongDelivery: boolean;
    filterPendingCMSDelivered: boolean;
    searchText: string;
}

/**
 * Helper để reset tất cả filters
 */
export const createDefaultFilters = (): OrderFilters => ({
    filterNoCMS: false,
    filterLongDelivery: false,
    filterPendingCMSDelivered: false,
    searchText: ''
});
