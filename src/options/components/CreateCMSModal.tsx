/**
 * Create CMS Modal Component
 * 
 * Modal tạo CMS ticket mới cho đơn hàng.
 * Được gọi từ bảng orders khi user click button "Tạo CMS".
 * 
 * Features:
 * - Hiển thị Service Code của đơn hàng
 * - Input mã đơn vị gửi (6 số) từ lịch sử vận đơn
 * - Chọn loại ticket: Support hoặc Complaint
 * - Chọn mẫu nội dung từ Firebase templates
 * - Input nội dung custom
 * - Tạo ticket + auto forward nếu có org code
 * 
 * Props:
 * @param record - Đơn hàng (ExtendedOrder)
 * @param updateOrderState - Callback cập nhật order state từ Options.tsx
 */

import React, { useState } from 'react';
import { Button, Input, Select, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ExtendedOrder } from '../../types/vnpost';

interface CreateCMSModalProps {
    record: ExtendedOrder;
    updateOrderState: (orderHdrId: any, updates: any) => void;
}

/**
 * Main Component: Modal tạo CMS ticket
 */
const CreateCMSModal: React.FC<CreateCMSModalProps> = ({ record, updateOrderState }) => {
    // ===== STATE =====
    const [modalOpen, setModalOpen] = useState(false);
    const [destOrgCode, setDestOrgCode] = useState('');
    const [orgInfo, setOrgInfo] = useState<{ orgCode: string; name: string } | null>(null);
    const [ticketType, setTicketType] = useState<'support' | 'complaint'>('support');
    const [content, setContent] = useState('');
    const [templates, setTemplates] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // ===== COMPUTED VALUES =====
    // Chỉ hiển thị button nếu:
    // - cmsData chưa được fetch (undefined) HOẶC
    // - không có tickets nào
    const shouldShow = record.cmsData === undefined || record.cmsData?.tickets?.length === 0;

    // Nếu đã có CMS ticket: return null (button bị ẩn)
    if (!shouldShow) return null;

    // ===== HANDLERS =====
    /**
     * Fetch org info từ CMS API
     * Dùng để validate + lấy tên đơn vị khi user nhập mã
     * 
     * @param code - Mã đơn vị (6 số)
     */
    const fetchOrgInfo = async (code: string) => {
        if (code.length !== 6) {
            setOrgInfo(null);
            return;
        }

        try {
            const response = await fetch(
                `https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`,
                {
                    headers: {
                        accept: '*/*',
                        'x-requested-with': 'XMLHttpRequest'
                    },
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'include'
                }
            );

            const data = await response.json();
            if (data && data.length > 0) {
                setOrgInfo({ orgCode: data[0].orgCode, name: data[0].name });
            } else {
                setOrgInfo(null);
            }
        } catch (error) {
            console.error('Error fetching org info:', error);
            setOrgInfo(null);
        }
    };

    /**
     * Handler: Mở modal
     * 
     * Quy trình:
     * 1. Load templates từ Firebase
     * 2. Nếu cmsData chưa fetch: fetch CMS data từ background
     * 3. Extract mã đơn vị từ lịch sử vận đơn (nếu có)
     * 4. Fetch org info cho mã đơn vị đó
     * 5. Mở modal
     */
    const handleOpenModal = async () => {
        // Load CMS templates from Firebase
        chrome.runtime.sendMessage(
            {
                event: 'CONTENTMY',
                type: 'GET_CMS_TEMPLATES',
                payload: {}
            },
            (response) => {
                if (response?.status === 'success' && response.templates) {
                    setTemplates(response.templates);
                }
            }
        );

        // Auto-fetch CMS if not fetched yet
        if (record.cmsData === undefined) {
            message.loading({ content: 'Đang kiểm tra CMS...', key: 'fetch_cms', duration: 0 });

            const cmsData = await new Promise<any>((resolve) => {
                const timeout = setTimeout(() => resolve(null), 5000);
                chrome.runtime.sendMessage(
                    {
                        event: 'CONTENTMY',
                        type: 'FETCH_CMS_DATA',
                        payload: { maVanDon: record.itemCode }
                    },
                    (response) => {
                        clearTimeout(timeout);
                        resolve(response?.status === 'success' ? response.data : null);
                    }
                );
            });

            updateOrderState(record.orderHdrId, { cmsData });
            message.destroy('fetch_cms');

            if (cmsData?.tickets?.length > 0) {
                message.warning('Đơn hàng đã có ticket CMS');
                return;
            }
        }

        // Extract 6 digits from history address
        const historyList = record.history?.orderStatusHistoryDtoList || [];
        let extracted = '';

        for (const historyItem of historyList) {
            const addressMatch = historyItem.address?.match(/(\d{6})/);
            if (addressMatch) {
                extracted = addressMatch[1];
                break;
            }
        }

        setDestOrgCode(extracted);
        if (extracted.length === 6) {
            fetchOrgInfo(extracted);
        }

        setModalOpen(true);
    };

    /**
     * Handler: Tạo CMS ticket
     * 
     * Quy trình:
     * 1. Validate nội dung không rỗng
     * 2. Show confirm dialog
     * 3. Gửi CREATE_CMS_TICKET_V2 message
     * 4. Refresh CMS data
     * 5. Nếu có org code: Ask forward (auto forward ticket tới đơn vị khác)
     * 6. Đóng modal
     */
    const handleCreateTicket = () => {
        if (!content.trim()) {
            message.warning('Vui lòng nhập nội dung');
            return;
        }

        Modal.confirm({
            title: 'Xác nhận tạo CMS',
            content: `Bạn có muốn tạo ticket ${ticketType === 'support' ? 'Hỗ Trợ' : 'Khiếu Nại'} cho đơn hàng ${record.itemCode}?`,
            onOk: async () => {
                setLoading(true);
                try {
                    // ===== STEP 1: Tạo ticket =====
                    const response: any = await new Promise((resolve) => {
                        chrome.runtime.sendMessage(
                            {
                                event: 'CONTENTMY',
                                type: 'CREATE_CMS_TICKET_V2',
                                payload: {
                                    maVanDon: record.itemCode,
                                    serviceCode: record.serviceCode || '',
                                    ticketType: ticketType,
                                    content: content
                                }
                            },
                            resolve
                        );
                    });

                    if (chrome.runtime.lastError) {
                        message.error('Lỗi kết nối Extension: ' + chrome.runtime.lastError.message);
                        setLoading(false);
                        return;
                    }

                    if (response && response.status === 'success') {
                        const ticketCode = response.ticketCode;
                        message.success('✅ Tạo CMS thành công');
                        setModalOpen(false);
                        setContent('');

                        // Refresh CMS data
                        const cmsData = await new Promise<any>((resolve) => {
                            const timeout = setTimeout(() => resolve(null), 5000);
                            chrome.runtime.sendMessage(
                                {
                                    event: 'CONTENTMY',
                                    type: 'FETCH_CMS_DATA',
                                    payload: { maVanDon: record.itemCode }
                                },
                                (res) => {
                                    clearTimeout(timeout);
                                    resolve(res?.status === 'success' ? res.data : null);
                                }
                            );
                        });
                        updateOrderState(record.orderHdrId, { cmsData });

                        // Handle forwarding if orgCode provided
                        if (destOrgCode && destOrgCode.length === 6) {
                            try {
                                let currentOrgInfo = orgInfo;

                                if (currentOrgInfo) {
                                    Modal.confirm({
                                        title: 'Chuyển tiếp ticket',
                                        content: `Bạn có muốn chuyển tiếp ticket đến ${currentOrgInfo.orgCode} - ${currentOrgInfo.name}?`,
                                        onOk: async () => {
                                            const dataOrgObj = [
                                                {
                                                    tempId: 72,
                                                    orgCode: currentOrgInfo!.orgCode,
                                                    orgName: `${currentOrgInfo!.orgCode} - ${currentOrgInfo!.name}`,
                                                    filename: '',
                                                    comment: content,
                                                    file: '',
                                                    type: 2,
                                                    number: 1
                                                }
                                            ];

                                            chrome.runtime.sendMessage(
                                                {
                                                    event: 'CONTENTMY',
                                                    type: 'FORWARD_CMS_TICKET',
                                                    payload: {
                                                        ticketId: ticketCode,
                                                        dataOrgObj: dataOrgObj
                                                    }
                                                },
                                                (fwdRes) => {
                                                    if (fwdRes && fwdRes.status === 'success') {
                                                        message.success('✅ Đã chuyển tiếp thành công');
                                                    } else {
                                                        message.error(
                                                            '❌ Lỗi khi chuyển tiếp: ' +
                                                                (fwdRes?.error || 'Unknown')
                                                        );
                                                    }
                                                }
                                            );
                                        }
                                    });
                                }
                            } catch (error) {
                                console.error('Error handling forwarding:', error);
                            }
                        }
                    } else {
                        message.error(
                            `❌ Tạo thất bại: ${response?.error || 'Lỗi không xác định'}`
                        );
                    }
                } catch (error) {
                    console.error('Error creating ticket:', error);
                    message.error('❌ Lỗi hệ thống khi tạo CMS');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    return (
        <>
            <Button
                block
                size="small"
                icon={<PlusOutlined />}
                type="dashed"
                className="rounded-lg shadow-sm hover:shadow-md transition-all border-green-400 text-green-600"
                onClick={handleOpenModal}
            >
                ➕ Tạo CMS
            </Button>

            <Modal
                title={
                    <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600">
                        ➕ Tạo CMS Ticket: {record.itemCode}
                    </span>
                }
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                width={600}
                className="modern-modal"
            >
                <div className="flex flex-col gap-4">
                    {/* Service Code Info */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Service Code</div>
                        <div className="font-bold text-blue-700">
                            {record.serviceCode || 'Không xác định'}
                        </div>
                    </div>

                    <div>
                        <label className="font-bold text-sm">Mã đơn vị (từ lịch sử)</label>
                        <Input
                            value={destOrgCode}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setDestOrgCode(val);
                                if (val.length === 6) {
                                    fetchOrgInfo(val);
                                } else {
                                    setOrgInfo(null);
                                }
                            }}
                            maxLength={6}
                            placeholder="Nhập 6 số"
                            className="rounded-lg"
                        />
                        {orgInfo && (
                            <div className="text-xs text-green-600 mt-1">
                                ✓ {orgInfo.orgCode} - {orgInfo.name}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-sm">Loại ticket</label>
                        <Select
                            value={ticketType}
                            onChange={setTicketType}
                            className="w-full"
                            options={[
                                { value: 'support', label: '🆘 Hỗ Trợ (134, +1 ngày)' },
                                { value: 'complaint', label: '⚠️ Khiếu Nại (534, +7 ngày)' }
                            ]}
                        />
                    </div>

                    {templates.length > 0 && (
                        <div>
                            <label className="font-bold text-sm">Chọn mẫu nội dung</label>
                            <Select
                                placeholder="📋 Chọn mẫu có sẵn..."
                                className="w-full"
                                onChange={(value) => setContent(value.replace(/\\n/g, '\n'))}
                                allowClear
                            >
                                {templates.map((template, idx) => (
                                    <Select.Option key={idx} value={template}>
                                        {template.substring(0, 60)}
                                        {template.length > 60 ? '...' : ''}
                                    </Select.Option>
                                ))}
                            </Select>
                        </div>
                    )}

                    <div>
                        <label className="font-bold text-sm">Nội dung</label>
                        <Input.TextArea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={4}
                            placeholder="Nhập nội dung ticket..."
                            className="rounded-lg"
                        />
                    </div>

                    <Button
                        type="primary"
                        size="large"
                        block
                        onClick={handleCreateTicket}
                        loading={loading}
                        disabled={!content.trim()}
                        className="rounded-lg"
                    >
                        ✅ Tạo Ticket
                    </Button>
                </div>
            </Modal>
        </>
    );
};

export default CreateCMSModal;
