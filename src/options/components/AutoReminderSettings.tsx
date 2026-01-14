import React, { useEffect, useState } from 'react';
import { Card, Switch, Button, List, Typography, InputNumber, Space, message, Divider } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface AutoReminderConfig {
    enabled: boolean;
    startHour: number;
    endHour: number;
    lastRunDate?: string;
}

const AutoReminderSettings: React.FC = () => {
    const [config, setConfig] = useState<AutoReminderConfig>({
        enabled: false,
        startHour: 8,
        endHour: 10
    });
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Load config and logs on mount
    useEffect(() => {
        loadConfig();
        loadLogs();
    }, []);

    const loadConfig = async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'GET_AUTO_REMINDER_CONFIG'
            });

            if (response?.status === 'success') {
                setConfig(response.config);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    };

    const loadLogs = async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'GET_AUTO_REMINDER_LOGS'
            });

            if (response?.status === 'success') {
                setLogs(response.logs || []);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    };

    const handleToggle = async (checked: boolean) => {
        setLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: checked ? 'ENABLE_AUTO_REMINDER' : 'DISABLE_AUTO_REMINDER'
            });

            if (response?.status === 'success') {
                setConfig(prev => ({ ...prev, enabled: checked }));
                message.success(checked ? 'Đã bật tính năng tự động' : 'Đã tắt tính năng tự động');
                loadLogs(); // Reload logs to show the enable/disable message
            } else {
                message.error('Lỗi khi thay đổi cài đặt');
            }
        } catch (error) {
            message.error('Lỗi khi thay đổi cài đặt');
        } finally {
            setLoading(false);
        }
    };
    
    

    const handleRunNow = async () => {
        setLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'RUN_AUTO_REMINDER'
            });

            if (response?.status === 'success') {
                message.success(response.message || 'Đã kích hoạt kiểm tra tự động');
                // Reload logs after a short delay to show new logs
                setTimeout(() => loadLogs(), 1000);
            } else {
                message.error(response?.error || 'Lỗi khi chạy tự động');
            }
        } catch (error) {
            message.error('Lỗi khi chạy tự động');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateTime = async () => {
        setLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'UPDATE_AUTO_REMINDER_TIME',
                payload: {
                    startHour: config.startHour,
                    endHour: config.endHour
                }
            });

            if (response?.status === 'success') {
                message.success('Đã cập nhật khung giờ');
                loadLogs(); // Reload logs to show the update message
            } else {
                message.error('Lỗi khi cập nhật khung giờ');
            }
        } catch (error) {
            message.error('Lỗi khi cập nhật khung giờ');
        } finally {
            setLoading(false);
        }
    };

    const handleClearLogs = async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'CLEAR_AUTO_REMINDER_LOGS'
            });

            if (response?.status === 'success') {
                setLogs([]);
                message.success('Đã xóa log');
            }
        } catch (error) {
            message.error('Lỗi khi xóa log');
        }
    };

    return (
        <div className="p-4">
            <Card
                title={
                    <div className="flex items-center gap-2">
                        <ClockCircleOutlined className="text-blue-600" />
                        <span>Tự Động Lập CMS Hối Hàng</span>
                    </div>
                }
                className="shadow-md"
            >
                {/* Enable/Disable Switch */}
                <div className="flex items-center justify-between mb-6 p-4 bg-blue-50 rounded-lg">
                    <div>
                        <Text strong className="text-lg">Bật/Tắt Tính Năng</Text>
                        <div className="text-sm text-gray-600 mt-1">
                            Tự động kiểm tra và lập CMS hối hàng từ {config.startHour}h - {config.endHour}h hàng ngày
                        </div>
                    </div>
                    <Switch
                        checked={config.enabled}
                        onChange={handleToggle}
                        loading={loading}
                        checkedChildren="BẬT"
                        unCheckedChildren="TẮT"
                    />
                </div>

                {/* Time Configuration */}
                <div className="mb-6">
                    <Title level={5}>Cấu Hình Khung Giờ</Title>
                    <Space className="w-full" direction="vertical">
                        <div className="flex items-center gap-4">
                            <Text>Giờ bắt đầu:</Text>
                            <InputNumber
                                min={0}
                                max={23}
                                value={config.startHour}
                                onChange={(value) => setConfig(prev => ({ ...prev, startHour: value || 8 }))}
                                disabled={loading}
                                className="w-20"
                            />
                            <Text>h</Text>
                        </div>
                        <div className="flex items-center gap-4">
                            <Text>Giờ kết thúc:</Text>
                            <InputNumber
                                min={0}
                                max={23}
                                value={config.endHour}
                                onChange={(value) => setConfig(prev => ({ ...prev, endHour: value || 10 }))}
                                disabled={loading}
                                className="w-20"
                            />
                            <Text>h</Text>
                        </div>
                        <Button
                            type="primary"
                            onClick={handleUpdateTime}
                            loading={loading}
                            className="mt-2"
                        >
                            Cập Nhật Khung Giờ
                        </Button>
                    </Space>
                </div>

                <Divider />

                {/* Manual Trigger */}
                <div className="mb-6">
                    <Title level={5}>Chạy Thử Ngay</Title>
                    <Text className="text-sm text-gray-600 block mb-3">
                        Kích hoạt kiểm tra và xử lý ngay lập tức (không cần chờ đến khung giờ)
                    </Text>
                    <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleRunNow}
                        loading={loading}
                        size="large"
                    >
                        Chạy Ngay
                    </Button>
                </div>

                <Divider />

                {/* Logs */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <Title level={5} className="mb-0">Nhật Ký Hoạt Động</Title>
                        <Button
                            icon={<DeleteOutlined />}
                            onClick={handleClearLogs}
                            size="small"
                            danger
                        >
                            Xóa Log
                        </Button>
                    </div>
                    <List
                        size="small"
                        bordered
                        dataSource={logs}
                        locale={{ emptyText: 'Chưa có hoạt động nào' }}
                        className="max-h-96 overflow-y-auto bg-gray-50"
                        renderItem={(log) => (
                            <List.Item className="text-sm font-mono">
                                {log}
                            </List.Item>
                        )}
                    />
                </div>

                {/* Last Run Info */}
                {config.lastRunDate && (
                    <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
                        <Text className="text-sm">
                            <strong>Lần chạy cuối:</strong> {config.lastRunDate}
                        </Text>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default AutoReminderSettings;
