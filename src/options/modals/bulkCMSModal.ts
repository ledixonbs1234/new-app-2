/**
 * Bulk CMS Creation Modal Handler
 * 
 * File này quản lý logic tạo CMS ticket hàng loạt (bulk create/forward).
 * Hỗ trợ cả 2 action: tạo mới hoặc chuyển tiếp vào ticket cũ.
 * 
 * Functions:
 * - renderBulkCMSModal: Render modal state object
 * - handleBulkCreateCMS: Thực hiện tạo/forward hàng loạt
 * - handleBulkCMSCancel: Xác nhận hủy quá trình
 */

import { Modal, message } from 'antd';
import { BulkCMSItem } from '../../types/vnpost';

/**
 * Hàm render: Trả về state object cho Modal
 * (Có thể optimize sau để render React component)
 */
export const renderBulkCMSModal = (
    open: boolean,
    items: BulkCMSItem[],
    onCancel: () => void,
    onBulkCreate: () => void,
    isCreating: boolean
) => {
    return {
        open,
        items,
        onCancel,
        onBulkCreate,
        isCreating
    };
};

/**
 * Hàm chính: Thực hiện tạo/forward CMS ticket hàng loạt
 * 
 * @param items - Danh sách BulkCMSItem (đã lọc và mapping sẵn)
 * @param onSuccess - Callback update items state (for progress display)
 * @param onClose - Callback đóng modal
 * @param updateOrderState - Callback cập nhật order state
 * @param bulkCreationAbortRef - Ref để check abort signal
 * 
 * Quy trình cho mỗi item:
 * 1. Check abort signal
 * 2. Nếu action === 'create': Gửi CREATE_CMS_TICKET_V2 message
 * 3. Nếu action === 'forward': Gửi FORWARD_CMS_TICKET message
 * 4. Cập nhật item status (success/error)
 * 5. Refresh CMS data từ server
 * 6. Delay 500ms
 * 
 * Kết thúc:
 * - Hiển thị success/warning message
 * - Tự động đóng modal nếu không có error
 */
export const handleBulkCreateCMS = async (
    items: BulkCMSItem[],
    onSuccess: (items: BulkCMSItem[]) => void,
    onClose: () => void,
    updateOrderState: (orderId: any, updates: any) => void,
    bulkCreationAbortRef: React.MutableRefObject<boolean>
) => {
    if (items.length === 0) {
        message.warning('Không có yêu cầu nào để tạo');
        return;
    }

    const hide = message.loading(`Đang tạo 0/${items.length} CMS...`, 0);

    let successCount = 0;
    let failCount = 0;
    const updatedItems = [...items];

    for (let i = 0; i < items.length; i++) {
        if (bulkCreationAbortRef.current) {
            message.warning('Đã hủy tạo CMS');
            break;
        }

        const item = items[i];
        hide();
        message.loading(
            `Đang tạo ${i + 1}/${items.length}: ${item.order.itemCode}...`,
            0
        );

        try {
            // Create or Forward based on action
            if (item.action === 'create') {
                const response: any = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        {
                            event: 'CONTENTMY',
                            type: 'CREATE_CMS_TICKET_V2',
                            payload: {
                                maVanDon: item.order.itemCode,
                                serviceCode: item.order.serviceCode || '',
                                ticketType: item.ticketType,
                                content: item.content
                            }
                        },
                        resolve
                    );
                });

                if (response && response.status === 'success') {
                    updatedItems[i].status = 'success';
                    successCount++;
                    updatedItems[i].ticketId = response.ticketCode;

                    // Refresh CMS data
                    const cmsData = await new Promise<any>((resolve) => {
                        const timeout = setTimeout(() => resolve(null), 3000);
                        chrome.runtime.sendMessage(
                            {
                                event: 'CONTENTMY',
                                type: 'FETCH_CMS_DATA',
                                payload: { maVanDon: item.order.itemCode }
                            },
                            (res) => {
                                clearTimeout(timeout);
                                resolve(res?.status === 'success' ? res.data : null);
                            }
                        );
                    });
                    updateOrderState(item.order.orderHdrId, { cmsData });
                } else {
                    updatedItems[i].status = 'error';
                    updatedItems[i].error = response?.error || 'Lỗi không xác định';
                    failCount++;
                }
            } else if (item.action === 'forward') {
                // Forward existing ticket
                const dataOrgObj = [
                    {
                        tempId: 72,
                        orgCode: item.orgInfo!.orgCode,
                        orgName: `${item.orgInfo!.orgCode} - ${item.orgInfo!.name}`,
                        filename: '',
                        comment: item.content,
                        file: '',
                        type: 2,
                        number: 1
                    }
                ];

                const response: any = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        {
                            event: 'CONTENTMY',
                            type: 'FORWARD_CMS_TICKET',
                            payload: {
                                ticketId: item.ticketId,
                                dataOrgObj: dataOrgObj
                            }
                        },
                        resolve
                    );
                });

                if (response && response.status === 'success') {
                    updatedItems[i].status = 'success';
                    successCount++;
                } else {
                    updatedItems[i].status = 'error';
                    updatedItems[i].error = response?.error || 'Lỗi không xác định';
                    failCount++;
                }
            }
        } catch (error) {
            console.error(`Error processing ${item.order.itemCode}:`, error);
            updatedItems[i].status = 'error';
            updatedItems[i].error = 'Lỗi hệ thống';
            failCount++;
        }

        // Delay to avoid spam
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    hide();
    onSuccess(updatedItems);

    if (failCount === 0) {
        message.success(`✅ Đã tạo thành công toàn bộ ${successCount} CMS!`);
        onClose();
    } else {
        message.warning(`⚠️ Đã tạo ${successCount}, lỗi ${failCount} CMS.`);
    }
};

/**
 * Hàm hủy: Xác nhận hủy quá trình tạo CMS
 * 
 * @param bulkCreationAbortRef - Ref flag để signal abort
 * @param onCancel - Callback đóng modal
 * 
 * Hành động:
 * - Hiển thị confirmation dialog
 * - Nếu confirm: Set flag abort = true để dừng vòng lặp
 * - Đóng modal
 * 
 * Lưu ý: Ticket đang được xử lý sẽ hoàn thành, sau đó dừng
 */
export const handleBulkCMSCancel = (
    bulkCreationAbortRef: React.MutableRefObject<boolean>,
    onCancel: () => void
) => {
    Modal.confirm({
        title: 'Hủy tạo CMS',
        content: 'Bạn có chắc chắn muốn hủy? Quá trình sẽ dừng sau yêu cầu hiện tại.',
        onOk: () => {
            bulkCreationAbortRef.current = true;
            onCancel();
        }
    });
};
