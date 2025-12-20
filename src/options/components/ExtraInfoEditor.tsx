import React, { useState, useEffect } from 'react';
import { Input, Button } from 'antd';

interface ExtraInfoEditorProps {
    maVanDon: string;
    initialValue?: string;
    onUpdate: (val: string) => void;
}

const ExtraInfoEditor: React.FC<ExtraInfoEditorProps> = ({ maVanDon, initialValue, onUpdate }) => {
    const [value, setValue] = useState('');
    const [logs, setLogs] = useState<string>(initialValue || '');

    useEffect(() => {
        setLogs(initialValue || '');
    }, [initialValue]);

    const handleAdd = () => {
        if (!value.trim()) return;

        chrome.runtime.sendMessage({
            event: "CONTENTMY",
            type: "UPDATE_EXTRA_INFO",
            payload: { maVanDon, content: value }
        }, (response) => {
            if (response?.status === 'success') {
                setLogs(response.updatedLog);
                onUpdate(response.updatedLog);
                setValue('');
            }
        });
    };

    const handleDeleteLast = () => {
        if (!confirm('Xóa dòng cuối?')) return;
        chrome.runtime.sendMessage({
            event: "CONTENTMY",
            type: "DELETE_LAST_LINE_EXTRA_INFO",
            payload: { maVanDon }
        }, (response) => {
            if (response?.status === 'success') {
                setLogs(response.updatedLog);
                onUpdate(response.updatedLog);
            }
        });
    };

    // Helper to format logs with colors (simple version for React)
    const renderLogs = () => {
        if (!logs) return <span className="text-gray-400 italic">Chưa có thông tin</span>;
        return logs.split('\n').map((line, i) => {
            const match = line.match(/^(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})\s+(.*)$/);
            if (match) {
                return (
                    <div key={i}>
                        <span className="text-blue-600 font-bold mr-2">[{match[1]}]</span>
                        <span>{match[2]}</span>
                    </div>
                );
            }
            return <div key={i}>{line}</div>;
        });
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-xl border border-blue-200 text-xs font-mono max-h-32 overflow-y-auto shadow-sm">
                {renderLogs()}
            </div>
            <div className="flex gap-2">
                <Input
                    size="small"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onPressEnter={handleAdd}
                    placeholder="✏️ Nhập ghi chú..."
                    className="rounded-lg shadow-sm"
                />
                <Button size="small" type="primary" onClick={handleAdd} className="rounded-lg shadow-sm">💾 Lưu</Button>
                {logs && <Button size="small" danger onClick={handleDeleteLast} className="rounded-lg shadow-sm">🗑️</Button>}
            </div>
        </div>
    );
};

export default ExtraInfoEditor;
