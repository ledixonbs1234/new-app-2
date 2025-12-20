/**
 * New Config Row Component
 * 
 * Component input 1 dòng cấu hình CMS tự động.
 * Được dùng trong Settings panel để thêm cấu hình mới.
 * 
 * Features:
 * - Input mã khách hàng (6 số)
 * - Select loại ticket (Support/Complaint)
 * - TextArea nội dung mẫu (auto-resize)
 * - Button thêm
 * 
 * Props:
 * @param onAdd - Callback khi user click "Add" button
 *                nhận object CMSAutoConfig mới
 */

import React, { useState } from 'react';
import { Button, Input, Select, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface CMSAutoConfig {
    orgCode: string;
    customerName?: string;
    ticketType: 'support' | 'complaint';
    content: string;
}

interface NewConfigRowProps {
    onAdd: (item: CMSAutoConfig) => void;
}

/**
 * Main Component: Input row cấu hình mới
 */
const NewConfigRow: React.FC<NewConfigRowProps> = ({ onAdd }) => {
    // ===== STATE =====
    const [code, setCode] = useState('');
    const [type, setType] = useState<'support' | 'complaint'>('support');
    const [content, setContent] = useState('');

    // ===== HANDLERS =====
    /**
     * Handler: Thêm cấu hình mới
     * 
     * Quy trình:
     * 1. Validate code + content không rỗng
     * 2. Gọi onAdd callback
     * 3. Reset form
     */
    const handleAdd = () => {
        if (!code || !content) return message.error('Thiếu thông tin');
        onAdd({ orgCode: code, ticketType: type, content: content });
        setCode('');
        setContent('');
    };

    return (
        <div className="flex gap-2 items-start">
            <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Mã KH"
                style={{ width: 120 }}
            />
            <Select
                value={type}
                onChange={setType}
                style={{ width: 120 }}
                options={[
                    { value: 'support', label: 'Hỗ trợ' },
                    { value: 'complaint', label: 'Khiếu nại' }
                ]}
            />
            <Input.TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nội dung (xuống dòng thoải mái)..."
                style={{ flex: 1 }}
                autoSize={{ minRows: 1, maxRows: 4 }}
            />
            <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />} />
        </div>
    );
};

export default NewConfigRow;
