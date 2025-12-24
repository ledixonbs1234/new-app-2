import { message } from 'antd';
import dayjs from 'dayjs';
import { ExtendedOrder, BulkCMSItem } from '../../types/vnpost';

interface CMSAutoConfig {
    orgCode: string;
    customerName?: string;
    ticketType: 'support' | 'complaint';
    content: string;
}

export const handleAutoGenerateCMS = async (
    orders: ExtendedOrder[],
    cmsAutoConfigs: CMSAutoConfig[],
    setIsAutoProcessing: (val: boolean) => void,
    setBulkCMSItems: (items: BulkCMSItem[]) => void,
    setBulkCMSModalOpen: (val: boolean) => void
) => {
    // 1. Xác định danh sách đơn hàng cần xử lý (Phát hàng + KTC)
    const targetStatus = ['11', '12', '13', '15', '27'];

    // 2. Lọc danh sách candidate
    const candidateOrders = orders.filter(order => {
        if (!targetStatus.includes(order.status)) return false;

        // QUAN TRỌNG: Bỏ điều kiện check chưa có CMS.
        // Chúng ta cần xử lý cả đơn đã có CMS nhưng cần nhắc lại.
        // Tuy nhiên, vẫn cần check cmsData !== undefined để đảm bảo đã load dữ liệu
        if (order.cmsData === undefined) return false;

        // Check chuyển hoàn/trả lại (giữ nguyên logic loại bỏ)
        const history = order.history?.orderStatusHistoryDtoList || [];
        const isReturn = history.some(h => {
            const statusLower = (h.statusText || "").toLowerCase();
            return statusLower.includes("chuyển hoàn") || statusLower.includes("phát hàng thành công")||statusLower.includes("phát hoàn");
        });
        if (isReturn) return false;

        return true;
    });

    if (candidateOrders.length === 0) {
        message.warning("Không tìm thấy đơn hàng nào thỏa mãn (Phát hàng/KTC). Hãy tải dữ liệu chi tiết và CMS trước!");
        return;
    }

    setIsAutoProcessing(true);
    message.loading({ content: `Đang phân tích ${candidateOrders.length} đơn...`, key: 'auto_map', duration: 0 });

    const todayStr = dayjs().format("DD/MM/YYYY");

    const items = await Promise.all(candidateOrders.map(async (order) => {
        // Tìm cấu hình
        const config = cmsAutoConfigs.find(cfg => cfg.orgCode === order.senderCode);

        // Nội dung chuẩn từ cấu hình
        const configContent = config ? config.content : `Hỗ trợ đơn hàng ${order.itemCode}`;
        const ticketType = config ? config.ticketType : 'support';

        // Logic lấy OrgCode đích
        const historyList = order.history?.orderStatusHistoryDtoList || [];
        let destOrgCode = '';
        for (const historyItem of historyList) {
            const addressMatch = historyItem.address?.match(/(\d{6})/);
            if (addressMatch) {
                destOrgCode = addressMatch[1];
                break;
            }
        }

        // Fetch Org Info
        let orgInfo: { orgCode: string; name: string } | null = null;
        if (destOrgCode && destOrgCode.length === 6) {
            try {
                const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${destOrgCode}`, {
                    headers: { "accept": "*/*", "x-requested-with": "XMLHttpRequest" },
                    credentials: "include"
                });
                const data = await response.json();
                if (data && data.length > 0) {
                    orgInfo = { orgCode: data[0].orgCode, name: data[0].name };
                }
            } catch (e) { console.error(e); }
        }

        // --- LOGIC MỚI: QUYẾT ĐỊNH CREATE HAY FORWARD ---
        let action: 'create' | 'forward' = 'create';
        let finalContent = configContent;
        let targetTicketId = '';
        let shouldInclude = true;

        const existingTickets = order.cmsData?.tickets || [];

        if (existingTickets.length > 0) {
            // Đã có ticket. Kiểm tra xem có ticket nào chứa nội dung mẫu chưa
            // Tìm ticket mới nhất mà trong history của nó có chứa nội dung config
            // Hoặc đơn giản: Check ticket mới nhất xem trạng thái thế nào

            const latestTicket = existingTickets[0]; // Giả sử ticket đầu tiên là mới nhất
            const actions = latestTicket.actions || [];

            // Kiểm tra xem trong ticket này đã từng có nội dung giống config chưa
            // So sánh tương đối (includes) và chuẩn hóa chữ thường
            const normalizedConfigContent = configContent.toLowerCase().trim();

            const matchingAction = actions.find((act: any) =>
                act.content && act.content.toLowerCase().includes(normalizedConfigContent)
            );

            if (matchingAction) {
                // Đã có nội dung này rồi. Kiểm tra ngày.
                // Action date format thường là "dd/mm/yyyy HH:mm"
                const actionDatePart = matchingAction.date.split(' ')[0]; // lấy dd/mm/yyyy

                if (actionDatePart === todayStr) {
                    // Đã yêu cầu trong hôm nay -> Bỏ qua
                    shouldInclude = false;
                } else {
                    // Khác ngày hiện tại -> Chuyển tiếp nhắc nhở
                    action = 'forward';
                    targetTicketId = latestTicket.ticketId;
                    finalContent = "Hỗ trợ phát gấp!!, Thank";
                }
            } else {
                // Có ticket nhưng chưa có nội dung yêu cầu này -> Có thể tạo mới hoặc forward nội dung yêu cầu vào ticket cũ.
                // Theo yêu cầu: "tạo nếu chưa có".
                // Tuy nhiên, CMS thường không cho tạo nhiều ticket mở cùng lúc. 
                // Tốt nhất: Nếu ticket cũ chưa đóng -> Forward nội dung yêu cầu vào ticket đó.
                // Nếu ticket cũ đã đóng -> Tạo mới.

                const isClosed = actions.length > 0 && actions[actions.length - 1].content.includes("Đóng yêu cầu");

                if (isClosed) {
                    action = 'create';
                } else {
                    // Ticket đang mở nhưng chưa có nội dung này -> Forward nội dung cấu hình vào
                    action = 'forward';
                    targetTicketId = latestTicket.ticketId;
                    // Giữ nguyên nội dung gốc (configContent) để gửi vào ticket đang mở
                }
            }
        } else {
            // Chưa có ticket nào -> Tạo mới
            action = 'create';
        }

        if (!shouldInclude) return null;

        return {
            order,
            ticketType,
            content: finalContent,
            destOrgCode,
            orgInfo,
            status: 'pending' as const,
            action,
            ticketId: targetTicketId
        };
    }));

    // Lọc bỏ các null items
    const validItems = items.filter((item): item is NonNullable<typeof item> => item !== null);

    setIsAutoProcessing(false);

    if (validItems.length === 0) {
        message.info("Tất cả các đơn hàng thỏa mãn đã được xử lý trong hôm nay.");
        return;
    }

    message.success({ content: `Đã lập danh sách ${validItems.length} yêu cầu!`, key: 'auto_map' });

    setBulkCMSItems(validItems);
    setBulkCMSModalOpen(true);
};
