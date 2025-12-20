/**
 * CMS Ticket Item Component
 * 
 * Component hiển thị chi tiết một CMS ticket và cho phép chuyển tiếp.
 * Dùng trong Detail Modal để liệt kê tất cả tickets của 1 đơn hàng.
 * 
 * Features:
 * - Hiển thị ticket code với badge
 * - Hiển thị lịch sử actions (timeline)
 * - Action cuối cùng được highlight (green border)
 * - Form chuyển tiếp (chỉ hiện nếu ticket chưa đóng)
 * - Mẫu nội dung (templates) support cho forwarding
 * 
 * Props:
 * @param ticket - Object ticket từ CMS API
 * @param itemCode - Mã vận đơn (dùng để open CMS search)
 */

import React, { useState, useEffect } from 'react';
import { Button, Input, Select, message } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

interface CMSTicketItemProps {
    ticket: any;
    itemCode: string;
}

/**
 * Main component: Hiển thị CMS ticket
 * 
 * Bố cục:
 * 1. Header: Ticket code + Open CMS button
 * 2. Actions list: Timeline các hành động
 * 3. Forward form: Input org code, templates, comment
 */
const CMSTicketItem: React.FC<CMSTicketItemProps> = ({ ticket, itemCode }) => {
    // ===== STATE =====
    const [orgCode, setOrgCode] = useState('');
    const [orgInfo, setOrgInfo] = useState<{ orgCode: string; name: string } | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<string[]>([]);

    // ===== COMPUTED VALUES =====
    // Lấy unit (mã đơn vị 6 số) từ action cuối cùng làm default org code
    const lastAction = ticket.actions?.[ticket.actions.length - 1];
    const unitMatch = lastAction?.unit?.match(/(\d{6})/);
    const defaultOrgCode = unitMatch?.[1] || '';

    // Kiểm tra ticket đã đóng nếu action cuối cùng là "Đóng yêu cầu"
    const isTicketClosed = lastAction?.content?.includes('Đóng yêu cầu') || false;

    // ===== EFFECTS =====
    // Effect 1: Set default org code khi component mount hoặc defaultOrgCode thay đổi
    useEffect(() => {
        if (defaultOrgCode) {
            setOrgCode(defaultOrgCode);
            fetchOrgInfo(defaultOrgCode);
        }
    }, [defaultOrgCode]);

    // Effect 2: Load templates nếu ticket chưa đóng (chỉ cho phép forward ticket mở)
    useEffect(() => {
        if (!isTicketClosed) {
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
        }
    }, [isTicketClosed]);

    // ===== HANDLERS =====
    /**
     * Fetch org info từ CMS API
     * Dùng để lấy tên đơn vị khi user nhập mã đơn vị
     */
    const fetchOrgInfo = async (code: string) => {
        if (code.length !== 6) return;

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
     * Handler: Khi user thay đổi org code input
     * - Update state
     * - Nếu đủ 6 số: fetch org info
     * - Nếu chưa đủ: clear org info
     */
    const handleOrgCodeChange = (value: string) => {
        setOrgCode(value);
        if (value.length === 6) {
            fetchOrgInfo(value);
        } else {
            setOrgInfo(null);
        }
    };

    /**
     * Handler: Gửi forward ticket
     * - Validate org info + comment không rỗng
     * - Show confirm modal
     * - Gửi FORWARD_CMS_TICKET message
     * - Reset comment field
     */
    const handleSend = () => {
        if (!orgInfo || !comment.trim()) {
            message.warning('Vui lòng nhập đầy đủ thông tin');
            return;
        }

        const { Modal } = require('antd');
        Modal.confirm({
            title: 'Xác nhận chuyển tiếp',
            content: `Bạn có muốn chuyển tiếp đến ${orgInfo.orgCode} - ${orgInfo.name}?`,
            onOk: async () => {
                setLoading(true);
                try {
                    const dataOrgObj = [
                        {
                            tempId: 72,
                            orgCode: orgInfo.orgCode,
                            orgName: `${orgInfo.orgCode} - ${orgInfo.name}`,
                            filename: '',
                            comment: comment,
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
                                    ticketId: ticket.ticketId,
                                    dataOrgObj: dataOrgObj
                                }
                            },
                            resolve
                        );
                    });

                    if (response && response.status === 'success') {
                        message.success('✅ Đã chuyển tiếp thành công');
                        setComment('');
                    } else {
                        message.error(
                            `❌ Lỗi khi chuyển tiếp: ${response?.error || 'Unknown'}`
                        );
                    }
                } catch (error) {
                    console.error('Error sending:', error);
                    message.error('❌ Lỗi hệ thống khi chuyển tiếp');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    return (
        <div className="mb-4 border border-orange-200 rounded-lg p-3 bg-gradient-to-br from-orange-50 to-red-50">
            <div className="flex justify-between items-center mb-3">
                <div className="font-bold text-orange-700 bg-white px-3 py-1 rounded-lg shadow-sm">
                    {ticket.ticketCode}
                </div>
                <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                        chrome.runtime.sendMessage(
                            {
                                event: 'CONTENTMY',
                                type: 'OPEN_CMS_SEARCH',
                                payload: { itemCode }
                            },
                            (response) => {
                                if (response?.status === 'success') {
                                    message.success('✅ Đã mở CMS');
                                } else {
                                    message.error('❌ Không thể mở CMS');
                                }
                            }
                        );
                    }}
                >
                    Mở CMS
                </Button>
            </div>

            {/* Actions */}
            {ticket.actions?.map((a: any, ai: number) => (
                <div
                    key={ai}
                    className={`p-3 mt-2 rounded-lg ${
                        ai === ticket.actions.length - 1
                            ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400'
                            : 'bg-white border border-slate-200'
                    }`}
                >
                    <div className="font-semibold text-sm text-slate-700 mb-2">
                        🕐 {a.date} • {a.unit}
                    </div>
                    <div className="text-slate-800 whitespace-pre-wrap">{a.content}</div>
                </div>
            ))}

            {/* Forward Form */}
            {!isTicketClosed && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="text-sm font-bold text-blue-700 mb-2">Chuyển tiếp</div>
                    <div className="flex flex-col gap-2">
                        <div>
                            <Input
                                size="small"
                                placeholder="Nhập mã đơn vị (6 số)"
                                value={orgCode}
                                onChange={(e) => handleOrgCodeChange(e.target.value)}
                                maxLength={6}
                                className="rounded"
                            />
                            {orgInfo && (
                                <div className="text-xs text-green-600 mt-1">
                                    ✓ {orgInfo.orgCode} - {orgInfo.name}
                                </div>
                            )}
                        </div>
                        {templates.length > 0 && (
                            <Select
                                placeholder="📋 Chọn mẫu nội dung..."
                                size="small"
                                onChange={(val) => setComment(val)}
                                allowClear
                                className="w-full"
                                dropdownMatchSelectWidth={false}
                            >
                                {templates.map((t, idx) => (
                                    <Select.Option key={idx} value={t}>
                                        {t.length > 50 ? t.substring(0, 50) + '...' : t}
                                    </Select.Option>
                                ))}
                            </Select>
                        )}
                        <Input.TextArea
                            size="small"
                            placeholder="Nhập nội dung..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={2}
                            className="rounded"
                        />
                        <Button
                            size="small"
                            type="primary"
                            onClick={handleSend}
                            loading={loading}
                            disabled={!orgInfo || !comment.trim()}
                            className="rounded"
                        >
                            📤 Gửi
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CMSTicketItem;
