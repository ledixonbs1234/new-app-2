import React, { useState, useEffect } from 'react';
import { Button, Table, Card, Typography, message, Modal, Space, Checkbox } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import CMSTicketItem from './components/CMSTicketItem';

const { Title } = Typography;

interface CheckCompleteProps {
    onBack: () => void;
}

const CheckComplete: React.FC<CheckCompleteProps> = ({ onBack }) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentCmsData, setCurrentCmsData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Filter states
    const [filterSuccess, setFilterSuccess] = useState(false);
    const [filterPaid, setFilterPaid] = useState(false);
    const [filterReturnSuccess, setFilterReturnSuccess] = useState(false);

    // Excel storage states
    const [excelData, setExcelData] = useState<Map<string, any>>(new Map());
    const [lastExcelUpdate, setLastExcelUpdate] = useState<string>('');

    // Logic for Auto-detecting download
    useEffect(() => {
        const handleDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
            if (delta.state && delta.state.current === 'complete') {
                chrome.downloads.search({ id: delta.id }, (results) => {
                    if (results && results.length > 0) {
                        const filename = results[0].filename;
                        // Check if filename matches pattern "DanhSachBuuGuiV2..."
                        // Note: filename contains full path, so check properly
                        if (filename.includes("DanhSachBuuGuiV2") && filename.endsWith(".xlsx")) {
                            Modal.confirm({
                                title: 'Phát hiện file Excel đối soát',
                                content: `Bạn vừa tải xuống file: ${filename.split(/[\\/]/).pop()}. Bạn có muốn dùng file này để cập nhật trạng thái đơn hàng không?`,
                                okText: 'Đồng ý',
                                cancelText: 'Bỏ qua',
                                onOk: () => {
                                    // Because we cannot read file directly from path due to security,
                                    // we have to ask user to pick it from a file input, OR use fetch if it's in a accessible location (unlikely).
                                    // Best UX here: Trigger the file input click programmatically? No, security blocks.
                                    // Show notification and ask user to click the "Upload" button is the reliable way.
                                    message.info("Vui lòng chọn file vừa tải trong nút 'Đối soát Excel' để tiếp tục.");
                                    // Highlight the upload button?
                                    const uploadBtn = document.getElementById('btn-excel-upload');
                                    if (uploadBtn) {
                                        uploadBtn.click(); // Try to open dialog directly? Browsers might block this if not trusted event.
                                        // If blocked, at least we informed the user.
                                    }
                                }
                            });
                        }
                    }
                });
            }
        };

        if (chrome.downloads) {
            chrome.downloads.onChanged.addListener(handleDownloadChanged);
        }

        return () => {
            if (chrome.downloads) {
                chrome.downloads.onChanged.removeListener(handleDownloadChanged);
            }
        };
    }, []);

    const fetchData = async (providedExcelMap?: Map<string, any>) => {
        setLoading(true);
        const mapToUse = providedExcelMap || excelData;
        try {
            const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/loaddata?ttkSrvId=0&ttkSrvIdL2=0&ttkSrvIdL3=0&ttkType=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrg=&searchInfoCode=&searchIsCompen=&ttkStatus=0&searchIsCompensated=&searchIsComp=&searchComplaintCompUnit=&ttkContactNumber=&ttkContactEmail=&pageIndex=1&pageSize=500&column=ttkId&desending=1&type=5&managedOrg=&managedUsr=&ttkCodeRef=", {
                "headers": {
                    "accept": "*/*",
                    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
                    "priority": "u=1, i",
                    "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                    "x-requested-with": "XMLHttpRequest"
                },
                "referrer": "https://cms.vnpost.vn/admin/complaints",
                "body": null,
                "method": "GET",
                // "mode": "cors",
                // "credentials": "include"
            });
            const htmlText = await response.text();

            // Parse HTML - Wrap in table/tbody because DOMParser strips orphan tr tags
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<table><tbody>${htmlText}</tbody></table>`, 'text/html');
            const rows = doc.querySelectorAll('tr');

            const parsedData: any[] = [];
            rows.forEach((row) => {
                const checkbox = row.querySelector('.chkcheck');
                const id = checkbox?.getAttribute('data-id');
                const status = checkbox?.getAttribute('data-status');

                const codeEl = row.querySelector('.cpl-table-code');
                const complaintCode = codeEl?.textContent?.trim();

                const trackingLink = row.querySelector('td:nth-child(5) a');
                const trackingNumber = trackingLink?.textContent?.trim();

                const serviceType = row.querySelector('td:nth-child(7)')?.textContent?.trim();
                const note = row.querySelector('td:nth-child(8)')?.textContent?.trim();
                const createDate = row.querySelector('td:nth-child(9)')?.textContent?.trim();
                const deadline = row.querySelector('td:nth-child(10)')?.textContent?.trim();
                // Find status label inside td with width 170px
                const statusText = row.querySelector('.label_status')?.textContent?.trim();

                if (id) {
                    parsedData.push({
                        id,
                        status,
                        complaintCode,
                        trackingNumber,
                        serviceType,
                        note,
                        createDate,
                        deadline,
                        statusText
                    });
                }
            });

            console.log('Parsed Data:', parsedData);

            // Merge with existing Excel data
            const mergedData = parsedData.map(item => {
                // QUAN TRỌNG: Dùng mapToUse để lấy dữ liệu mới nhất
                const excelInfo = mapToUse.get(item.trackingNumber);
                return {
                    ...item,
                    excelStatus: excelInfo?.status || '',
                    paymentStatus: excelInfo?.payment || '',
                    codAmount: excelInfo?.cod || 0,
                };
            });

            setData(mergedData);
            message.success(`Đã tải ${mergedData.length} bản ghi`);

        } catch (error) {
            console.error("Fetch Error:", error);
            message.error('Lỗi khi tải dữ liệu. Cần đăng nhập CMS?');
        } finally {
            setLoading(false);
        }
    };

    // Load Excel data from storage on mount
    useEffect(() => {
        const initData = async () => {
            setLoading(true); // Bật loading ngay lập tức

            // Bước 1: Load Excel Data từ Storage
            let loadedMap = new Map<string, any>();
            try {
                const result = await new Promise<any>((resolve) => {
                    chrome.storage.local.get(['checkCompleteExcelData', 'checkCompleteExcelTimestamp'], resolve);
                });

                if (result.checkCompleteExcelData) {
                    loadedMap = new Map(Object.entries(result.checkCompleteExcelData));
                    setExcelData(loadedMap);
                    setLastExcelUpdate(result.checkCompleteExcelTimestamp || '');
                    console.log('✅ Loaded Excel data from storage:', loadedMap.size, 'items');
                } else {
                    console.log('ℹ️ No Excel data in storage');
                }
            } catch (err) {
                console.error("Error loading storage:", err);
            }

            // Bước 2: Gọi Fetch Data và truyền loadedMap vào
            // Lúc này loadedMap chắc chắn đã có dữ liệu (nếu storage có)
            await fetchData(loadedMap);
        };

        initData();
    }, []);

    const handleBulkClose = async () => {
        if (selectedRowKeys.length === 0) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;
        const totalCount = selectedRowKeys.length;

        message.loading({ content: `Đang xử lý 0/${totalCount}...`, key: 'bulk-progress', duration: 0 });

        for (let i = 0; i < selectedRowKeys.length; i++) {
            const key = selectedRowKeys[i];
            const item = data.find(d => d.id === key);

            if (item) {
                try {
                    // Wait for response to verify success
                    const response = await new Promise<any>((resolve) => {
                        chrome.runtime.sendMessage({
                            event: 'CONTENTMY',
                            type: 'CLOSE_CMS_TICKET',
                            payload: {
                                ticketId: item.id,
                                ticketCode: item.complaintCode,
                                reason: 'Đơn hàng đã phát thành công'
                            }
                        }, (response) => {
                            resolve(response);
                        });
                    });

                    // Check if successful
                    if (response?.status === 'success') {
                        successCount++;
                        console.log(`✓ [${i + 1}/${totalCount}] Đóng thành công: ${item.complaintCode}`);
                    } else {
                        failCount++;
                        console.error(`✗ [${i + 1}/${totalCount}] Đóng thất bại: ${item.complaintCode}`, response);
                    }

                } catch (e) {
                    failCount++;
                    console.error(`✗ [${i + 1}/${totalCount}] Lỗi đóng ticket:`, item.id, e);
                }

                // Update progress
                message.loading({
                    content: `Đang xử lý ${i + 1}/${totalCount} (Thành công: ${successCount}, Lỗi: ${failCount})`,
                    key: 'bulk-progress',
                    duration: 0
                });

                // Wait 2 seconds before next request (except for the last one)
                if (i < selectedRowKeys.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        // Destroy loading message and show final result
        message.destroy('bulk-progress');
        message.success(`Hoàn thành! Thành công: ${successCount}/${totalCount}, Lỗi: ${failCount}/${totalCount}`, 5);

        setLoading(false);
        setSelectedRowKeys([]);
        fetchData(); // Reload after close
    };

    const handleViewDetail = (trackingNumber: string) => {
        if (!trackingNumber) return;
        setDetailLoading(true);

        chrome.runtime.sendMessage({
            event: "CONTENTMY",
            type: "FETCH_CMS_DATA",
            payload: { maVanDon: trackingNumber }
        }, (response) => {
            setDetailLoading(false);
            if (response && response.status === 'success') {
                // Add trackingNumber to response data for CMSTicketItem
                setCurrentCmsData({
                    ...response.data,
                    trackingNumber: trackingNumber
                });
                setDetailModalOpen(true);
            } else {
                message.error('Không tìm thấy dữ liệu CMS hoặc lỗi kết nối');
            }
        });
    };

    const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
        setSelectedRowKeys(newSelectedRowKeys);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: onSelectChange,
    };

    const handleCopyTraceLink = () => {
        if (!data || data.length === 0) {
            message.warning("Không có dữ liệu để tạo link");
            return;
        }

        const ids = data.map(item => item.trackingNumber).filter(Boolean).join(',');
        // Limit to reasonable length if needed, but GET params can handle quite a bit.
        // If list is too long, we might need multiple links or POST, but user asked for this URL format.
        const url = `https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2&id=${ids}`;

        navigator.clipboard.writeText(url).then(() => {
            message.success("Đã copy link! Đang mở tab mới...");
            window.open(url, '_blank');
        }, () => {
            message.error("Lỗi khi copy link");
        });
    };

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            // @ts-ignore
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];

            // Parse as JSON with header row starting from row 2 (skip first row which is group headers)
            // @ts-ignore
            const jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 }); // Start from row 2 (index 1)

            // DEBUG: Log first row to see column names
            if (jsonData.length > 0) {
                console.log('Excel Column Names (Row 2):', Object.keys(jsonData[0] as any));
                console.log('First Data Row Sample:', jsonData[0]);
            }

            // Mapping
            interface ExcelData {
                status: string;
                payment: string;
                cod: number;
            }
            const dataMap = new Map<string, ExcelData>();

            jsonData.forEach((row: any) => {
                // Based on log: __EMPTY_1 contains tracking number
                const code = row['__EMPTY_1'] ||  // Tracking number column!
                    row['Số hiệu BG'] ||
                    row['Mã vận đơn'] ||
                    row['Tracking'] ||
                    row['Số hiệu'] ||
                    '';

                if (code && code !== 'Số hiệu BG' && code !== 'Mã vận đơn') { // Skip header rows
                    // Get status from "Kết quả phát" column
                    const status = row['Kết quả phát_1'] ||
                        row['Kết quả hiện tại'] ||
                        row['Trạng thái cuối cùng'] ||
                        '';

                    // Get payment status - it's in __EMPTY_13 based on log
                    const payment = row['Trạng thái nộp tiền bưu tá'] ||
                        '';

                    // Get COD amount - 'Số tiền' is the correct column
                    const codStr = row['Số tiền'] ||
                        row['COD - Phát hàng thu tiền'] ||
                        row['COD'] ||
                        '0';
                    // Clean brackets and dots: "[....]" -> "", "1,000" -> "1000"
                    const cleanedCod = String(codStr).replace(/[\[\].,]/g, '').trim();
                    const cod = parseInt(cleanedCod) || 0;

                    if (code.trim()) {
                        dataMap.set(code.trim(), {
                            status: status.trim(),
                            payment: payment.trim(),
                            cod: cod
                        });
                    }
                }
            });

            console.log('Mapped Excel Data:', dataMap);
            console.log('Total mapped items:', dataMap.size);

            // Save to chrome.storage.local
            const dataMapObj = Object.fromEntries(dataMap);
            const timestamp = new Date().toLocaleString('vi-VN');

            chrome.storage.local.set({
                checkCompleteExcelData: dataMapObj,
                checkCompleteExcelTimestamp: timestamp
            }, () => {
                setExcelData(dataMap);
                setLastExcelUpdate(timestamp);

                // Update data state with Excel info
                const newData = data.map(item => {
                    const excelInfo = dataMap.get(item.trackingNumber);
                    return {
                        ...item,
                        excelStatus: excelInfo ? excelInfo.status : '',
                        paymentStatus: excelInfo ? excelInfo.payment : '',
                        codAmount: excelInfo ? excelInfo.cod : 0,
                    };
                });

                setData(newData);
                message.success(`Đã lưu dữ liệu Excel (${dataMap.size} mã vận đơn) - ${timestamp}`);
            });

            // Clear input value to allow re-uploading same file
            e.target.value = '';
        };
        reader.readAsBinaryString(file);
    };

    // Render logic for tickets inside Modal - using CMSTicketItem component
    const renderTickets = () => {
        if (!currentCmsData || !currentCmsData.tickets || currentCmsData.tickets.length === 0) {
            return <div className="text-gray-400 italic text-center py-8">Không có dữ liệu CMS</div>;
        }
        return (
            <div className="max-h-[60vh] overflow-y-auto">
                {currentCmsData.tickets.map((ticket: any, idx: number) => (
                    <CMSTicketItem
                        key={idx}
                        ticket={ticket}
                        itemCode={currentCmsData.trackingNumber || ''}
                    />
                ))}
            </div>
        );
    };

    const columns = [
        // Removed ID column
        // { title: 'ID', dataIndex: 'complaintCode', key: 'complaintCode', render: (text: string) => <b>{text}</b> },
        {
            title: 'Số hiệu',
            dataIndex: 'trackingNumber',
            key: 'trackingNumber',
            render: (text: string) => (
                <a
                    onClick={(e) => {
                        e.preventDefault();
                        handleViewDetail(text);
                    }}
                    style={{ cursor: 'pointer', color: '#1890ff' }}
                >
                    {text}
                </a>
            )
        },
        {
            title: 'COD',
            dataIndex: 'codAmount',
            key: 'codAmount',
            width: 60,
            render: (cod: number) => cod > 0 ? <span className="text-green-600 font-bold">COD</span> : null
        },
        { title: 'Loại dịch vụ', dataIndex: 'serviceType', key: 'serviceType' },
        { title: 'Nội dung', dataIndex: 'note', key: 'note' },
        { title: 'Ngày tạo', dataIndex: 'createDate', key: 'createDate' },
        { title: 'Hạn xử lý', dataIndex: 'deadline', key: 'deadline' },
        { title: 'Trạng thái CMS', dataIndex: 'statusText', key: 'statusText', render: (text: string) => <span style={{ color: 'green' }}>{text}</span> },
        { title: 'Trạng thái đơn', dataIndex: 'excelStatus', key: 'excelStatus', render: (text: string) => <span style={{ fontWeight: 'bold', color: 'blue' }}>{text}</span> },
        { title: 'Trạng thái nộp', dataIndex: 'paymentStatus', key: 'paymentStatus', render: (text: string) => <span style={{ color: 'purple' }}>{text}</span> },
        {
            title: 'BCCP',
            key: 'bccp',
            width: 80,
            render: (_: any, record: any) => (
                <Button
                    size="small"
                    type="link"
                    onClick={() => {
                        const url = `https://bccp.vnpost.vn/BCCP.aspx?act=Trace&id=${record.trackingNumber}`;
                        window.open(url, '_blank');
                    }}
                >
                    Tra cứu
                </Button>
            )
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_: any, record: any) => (
                <div style={{ display: 'flex', gap: 5 }}>
                    <Button size="small" type="primary" onClick={() => handleViewDetail(record.trackingNumber)}>Chi tiết</Button>
                    <Button size="small" danger onClick={() => {
                        chrome.runtime.sendMessage({
                            event: 'CONTENTMY',
                            type: 'CLOSE_CMS_TICKET',
                            payload: {
                                ticketId: record.id,
                                ticketCode: record.complaintCode,
                                reason: 'Đơn hàng đã phát thành công'
                            }
                        }, (response) => {
                            if (response?.status === 'success') {
                                message.success('Đã gửi lệnh đóng');
                                fetchData();
                            } else {
                                message.error('Lỗi khi đóng');
                            }
                        });
                    }}>Đóng</Button>
                </div>
            )
        }
    ];

    // Filter Logic
    const finalData = data.filter(item => {
        // 1. Lọc theo trạng thái thanh toán (Giữ nguyên)
        if (filterPaid) {
            const p = item.paymentStatus ? item.paymentStatus.toLowerCase() : '';
            if (!p.includes('cod')) return false;
        }

        // 2. Lọc theo trạng thái đơn hàng (SỬA ĐOẠN NÀY)
        // Nếu có bất kỳ checkbox trạng thái nào được bật (Success hoặc ReturnSuccess)
        if (filterSuccess || filterReturnSuccess) {
            const matchSuccess = filterSuccess && item.excelStatus === 'Đã phát thành công';
            const matchReturn = filterReturnSuccess && item.excelStatus === 'Phát hoàn thành công';

            // Nếu không khớp với bất kỳ trạng thái nào đang bật thì loại bỏ
            if (!matchSuccess && !matchReturn) return false;
        }

        return true;
    });

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

                    <div className="flex flex-col gap-2">
                        {lastExcelUpdate && (
                            <div className="text-xs text-gray-500">
                                📊 Đối soát Excel lần cuối: {lastExcelUpdate}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button
                                icon={<CopyOutlined />}
                                onClick={handleCopyTraceLink}
                            >
                                Copy Link Tra Cứu
                            </Button>

                            <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                                <Button icon={<FileTextOutlined />}>Đối soát Excel</Button>
                                <input
                                    type="file"
                                    id="btn-excel-upload"
                                    onChange={handleExcelUpload}
                                    accept=".xlsx, .xls"
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        opacity: 0,
                                        width: '100%',
                                        height: '100%',
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                            <Button
                                type="primary"
                                danger
                                disabled={selectedRowKeys.length === 0}
                                onClick={handleBulkClose}
                            >
                                Đóng ({selectedRowKeys.length})
                            </Button>
                            <Button
                                type="primary"
                                icon={<ReloadOutlined />}
                                loading={loading}
                                onClick={() => fetchData(excelData)}
                            >
                                Tải lại
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Checkbox checked={filterSuccess} onChange={e => setFilterSuccess(e.target.checked)}>
                            Phát Thành công
                        </Checkbox>
                        <Checkbox checked={filterReturnSuccess} onChange={e => setFilterReturnSuccess(e.target.checked)}>
                            Phát Hoàn Thành công
                        </Checkbox>
                        <Checkbox checked={filterPaid} onChange={e => setFilterPaid(e.target.checked)}>
                            Đã nộp COD
                        </Checkbox>
                    </div>
                </div>

                <Table
                    rowSelection={rowSelection}
                    dataSource={finalData}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    bordered
                    pagination={{ pageSize: 300 }}
                    size="small"
                />
            </Card>

            <Modal
                title={<span className="text-lg font-bold text-blue-600">📦 Chi tiết CMS</span>}
                open={detailModalOpen}
                onCancel={() => setDetailModalOpen(false)}
                footer={null}
                width={800}
            >
                {detailLoading ? <div className="text-center py-10"><Space><ReloadOutlined spin /> Đang tải...</Space></div> : renderTickets()}
            </Modal>
        </div>
    );
};

export default CheckComplete;
