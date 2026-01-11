import React, { useState, useEffect } from 'react';
import { Button, Table, Card, Typography, message } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface CheckCompleteProps {
    onBack: () => void;
}

const CheckComplete: React.FC<CheckCompleteProps> = ({ onBack }) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Placeholder fetch - User to replace with actual API
            // const response = await fetch('YOUR_API_URL');
            // const result = await response.json();

            // Mock data for demonstration
            await new Promise(resolve => setTimeout(resolve, 1000));
            const mockData = Array.from({ length: 5 }).map((_, i) => ({
                id: i + 1,
                name: `Item Check ${i + 1}`,
                status: Math.random() > 0.5 ? 'Completed' : 'Pending',
                date: new Date().toLocaleDateString()
            }));

            setData(mockData);
            message.success('Đã tải dữ liệu mẫu');
        } catch (error) {
            console.error(error);
            message.error('Lỗi khi tải dữ liệu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id' },
        { title: 'Tên', dataIndex: 'name', key: 'name' },
        { title: 'Trạng thái', dataIndex: 'status', key: 'status' },
        { title: 'Ngày', dataIndex: 'date', key: 'date' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
            <Card className="shadow-lg rounded-xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={onBack}
                            size="large"
                        >
                            Quay lại
                        </Button>
                        <Title level={4} style={{ margin: 0 }} className="text-blue-700">
                            Check Complete List
                        </Title>
                    </div>
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={fetchData}
                    >
                        Tải lại
                    </Button>
                </div>

                <Table
                    dataSource={data}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    bordered
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default CheckComplete;
