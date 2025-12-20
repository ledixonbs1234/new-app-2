import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, SyncOutlined, PlusOutlined, HistoryOutlined } from '@ant-design/icons';
import { BulkCMSItem, ExtendedOrder } from '../../types/vnpost';

const { TextArea } = Input;

interface BulkCMSModalProps {
    open: boolean;
    onCancel: () => void;
    items: BulkCMSItem[];
    setItems: React.Dispatch<React.SetStateAction<BulkCMSItem[]>>;
    templates: string[];
    isCreating: boolean;
    onStartCreation: () => void;
    onStop: () => void;
}

const BulkCMSModal: React.FC<BulkCMSModalProps> = ({
    open,
    onCancel,
    items,
    setItems,
    templates,
    isCreating,
    onStartCreation,
    onStop
}) => {
    const [globalTicketType, setGlobalTicketType] = useState<'support' | 'complaint'>('support');
    const [globalContent, setGlobalContent] = useState<string>('');
    const [viewingHistory, setViewingHistory] = useState<ExtendedOrder | null>(null);

    // Update all items when global values change
    useEffect(() => {
        if (!isCreating) {
            setItems(prev => prev.map(item => ({
                ...item,
                ticketType: globalTicketType,
            })));
        }
    }, [globalTicketType, isCreating, setItems]);

    const handleGlobalContentChange = (newContent: string) => {
        setGlobalContent(newContent);
        setItems(prev => prev.map(item => ({
            ...item,
            content: newContent
        })));
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-gray-50 border-gray-200';
            case 'processing': return 'bg-blue-50 border-blue-400 animate-pulse';
            case 'success': return 'bg-green-50 border-green-400';
            case 'error': return 'bg-red-50 border-red-400';
            default: return 'bg-gray-50 border-gray-200';
        }
    };

    const handleDeleteItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleOrgCodeChange = (index: number, newCode: string) => {
        setItems(prev => prev.map((item, i) =>
            i === index ? { ...item, destOrgCode: newCode, orgInfo: null } : item
        ));
    };

    const handleCheckOrgCode = async (index: number, code: string) => {
        if (!code || code.length !== 6) {
            message.error('Mã bưu cục phải có 6 số');
            return;
        }

        try {
            const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`, {
                headers: { "accept": "*/*", "x-requested-with": "XMLHttpRequest" },
                method: "GET",
                mode: "cors",
                credentials: "include"
            });
            const data = await response.json();
            if (data && data.length > 0) {
                const newOrgInfo = { orgCode: data[0].orgCode, name: data[0].name };
                setItems(prev => prev.map((item, i) =>
                    i === index ? { ...item, orgInfo: newOrgInfo } : item
                ));
                message.success('Đã tìm thấy bưu cục: ' + data[0].name);
            } else {
                message.warning('Không tìm thấy bưu cục nào với mã này');
            }
        } catch (error) {
            console.error('Error checking org:', error);
            message.error('Lỗi khi tra cứu bưu cục');
        }
    };

    return (
        <Modal
            title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">🎫 Tạo nhiều CMS ({items.length} đơn hàng)</span>}
            open={open}
            onCancel={onCancel}
            width={1200}
            footer={null}
            className="modern-modal"
        >
            <div className="flex flex-col gap-4">
                {/* Global Controls - Chỉ hiện khi chưa bắt đầu tạo */}
                {!isCreating && items.some(it => it.status === 'pending') && (
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border-2 border-purple-300 shadow-lg">
                        <div className="font-bold text-purple-700 mb-3 text-lg">📝 Nội dung chung cho tất cả đơn hàng</div>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <Select
                                    value={globalTicketType}
                                    onChange={setGlobalTicketType}
                                    style={{ width: 250 }}
                                    size="large"
                                    options={[
                                        { value: 'support', label: '🆘 Hỗ Trợ (134, +1 ngày)' },
                                        { value: 'complaint', label: '⚠️ Khiếu Nại (534, +7 ngày)' }
                                    ]}
                                />
                                {templates.length > 0 && (
                                    <Select
                                        placeholder="📋 Chọn mẫu nội dung..."
                                        style={{ flex: 1 }}
                                        size="large"
                                        onChange={(value) => handleGlobalContentChange(value.replace(/\\n/g, '\n'))}
                                        allowClear
                                    >
                                        {templates.map((template, tIdx) => (
                                            <Select.Option key={tIdx} value={template}>
                                                {template.substring(0, 80)}{template.length > 80 ? '...' : ''}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                )}
                            </div>
                            <TextArea
                                value={globalContent}
                                onChange={(e) => handleGlobalContentChange(e.target.value)}
                                rows={4}
                                placeholder="✏️ Nhập nội dung CMS cho tất cả đơn hàng..."
                                className="rounded-lg text-base"
                                size="large"
                            />
                        </div>
                    </div>
                )}

                {/* Orders List */}
                <div className="max-h-[50vh] overflow-y-auto space-y-2">
                    {items.map((item, idx) => (
                        <div key={idx} className={`border-2 rounded-lg p-3 transition-all ${getStatusColor(item.status)}`}>
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1">
                                    <span className="text-2xl">
                                        {item.action === 'create' ? '🆕' : '🔔'}
                                    </span>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Tooltip title="Xem lịch sử hành trình">
                                                <span
                                                    className="font-bold text-blue-700 cursor-pointer hover:underline hover:text-blue-500"
                                                    onClick={() => setViewingHistory(item.order)}
                                                >
                                                    {item.order.itemCode} <HistoryOutlined className="text-xs ml-1" />
                                                </span>
                                            </Tooltip>
                                            <span className="text-sm text-gray-600">- {item.order.receiverName}</span>
                                        </div>
                                        <div className="mt-1 text-xs">
                                            {item.action === 'create' ? (
                                                <Tag color="green">Tạo mới</Tag>
                                            ) : (
                                                <Tag color="orange">Chuyển tiếp {item.ticketId}</Tag>
                                            )}
                                            <span className="font-mono text-gray-700">{item.content}</span>
                                        </div>
                                        <div className="flex gap-4 text-xs text-gray-600 items-center">
                                            <span>Service: <span className="font-semibold text-blue-600">{item.order.serviceCode || 'N/A'}</span></span>
                                            <div className="flex items-center gap-1">
                                                <span>OrgCode:</span>
                                                <Input
                                                    size="small"
                                                    value={item.destOrgCode}
                                                    onChange={(e) => handleOrgCodeChange(idx, e.target.value)}
                                                    style={{ width: 80 }}
                                                    disabled={isCreating}
                                                    maxLength={6}
                                                />
                                                <Button
                                                    size="small"
                                                    type="text"
                                                    icon={<SyncOutlined />}
                                                    disabled={isCreating || !item.destOrgCode}
                                                    onClick={() => handleCheckOrgCode(idx, item.destOrgCode)}
                                                    title="Kiểm tra tên bưu cục"
                                                />
                                                {item.orgInfo ? (
                                                    <span className="font-semibold text-green-600">({item.orgInfo.name})</span>
                                                ) : (
                                                    item.destOrgCode && <span className="text-orange-500 italic">(Chưa kiểm tra)</span>
                                                )}
                                            </div>
                                        </div>
                                        {item.error && <div className="text-red-600 font-semibold text-sm mt-1">❌ {item.error}</div>}
                                    </div>
                                </div>

                                {/* Status or Actions */}
                                {item.status === 'pending' && !isCreating ? (
                                    <div className="flex items-center">
                                        <Button
                                            danger
                                            type="text"
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleDeleteItem(idx)}
                                            title="Xóa khỏi danh sách"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        {item.status === 'processing' && (
                                            <div className="text-blue-600 font-semibold animate-pulse">Đang tạo...</div>
                                        )}
                                        {item.status === 'success' && (
                                            <div className="text-green-600 font-semibold">Thành công ✓</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t-2">
                    <Button
                        type="primary"
                        size="large"
                        block
                        onClick={onStartCreation}
                        disabled={isCreating || items.length === 0 || items.every(it => it.status !== 'pending')}
                        loading={isCreating}
                        className="rounded-lg"
                        icon={isCreating ? null : <PlusOutlined />}
                    >
                        {isCreating ? '🔄 Đang tạo...' : `✅ Tạo ${items.filter(it => it.status === 'pending').length} CMS`}
                    </Button>
                    {isCreating && (
                        <Button
                            danger
                            size="large"
                            onClick={onStop}
                            className="rounded-lg"
                        >
                            ⏹️ Dừng
                        </Button>
                    )}
                </div>
            </div>
            <Modal
                title={
                    <span className="text-blue-700">
                        📜 Lịch sử: {viewingHistory?.itemCode}
                    </span>
                }
                open={!!viewingHistory}
                onCancel={() => setViewingHistory(null)}
                footer={null}
                width={700}
                zIndex={1001}
            >
                <div className="max-h-[60vh] overflow-y-auto">
                    {viewingHistory?.history?.orderStatusHistoryDtoList?.length ? (
                        <div className="flex flex-col gap-3">
                            {viewingHistory.history.orderStatusHistoryDtoList.map((h, idx) => (
                                <div key={idx} className="border-b pb-2 last:border-0">
                                    <div className="flex justify-between">
                                        <span className="font-bold text-blue-600">{h.traceDate}</span>
                                        <span className="text-gray-500 text-xs">{h.address}</span>
                                    </div>
                                    <div className="font-semibold text-gray-800 mt-1">{h.statusText}</div>
                                    {h.statusDetail && (
                                        <div
                                            className="text-gray-500 text-sm italic mt-1 bg-gray-50 p-2 rounded"
                                            dangerouslySetInnerHTML={{ __html: h.statusDetail }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-8">
                            Không có dữ liệu lịch sử
                        </div>
                    )}
                </div>
            </Modal>
        </Modal>
    );
};

export default BulkCMSModal;
