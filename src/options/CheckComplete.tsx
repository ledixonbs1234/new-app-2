import React, { useState, useEffect } from 'react';
import { Button, Table, Card, Typography, message, Modal, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, FileTextOutlined, SyncOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import CMSTicketItem from './components/CMSTicketItem';

const { Title } = Typography;

// Helper function to parse Vietnamese date string (DD/MM/YYYY HH:mm:ss)
const parseVietnameseDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    try {
        const parts = dateStr.trim().split(' ');
        const datePart = parts[0];
        const timePart = parts[1] || '00:00:00';

        const [day, month, year] = datePart.split('/').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);

        return new Date(year, month - 1, day, hour, minute, second).getTime();
    } catch (e) {
        return 0;
    }
};

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

    // Copy link chunks states removed
    // const [copyModalOpen, setCopyModalOpen] = useState(false);
    // const [idChunks, setIdChunks] = useState<string[][]>([]);

    // Filter states
    // Filter states removed
    // const [filterSuccess, setFilterSuccess] = useState(false);
    // const [filterPaid, setFilterPaid] = useState(false);
    // const [filterReturnSuccess, setFilterReturnSuccess] = useState(false);

    // Excel storage states
    const [excelData, setExcelData] = useState<Map<string, any>>(new Map());
    const [lastExcelUpdate, setLastExcelUpdate] = useState<string>('');

    // CMS Cache states
    const [cmsCache, setCmsCache] = useState<Map<string, any>>(new Map());
    const [lastCMSUpdate, setLastCMSUpdate] = useState<string>('');
    const [cmsLoading, setCmsLoading] = useState(false);

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

    const fetchData = async (providedExcelMap?: Map<string, any>, providedCMSCache?: Map<string, any>) => {
        setLoading(true);
        const mapToUse = providedExcelMap || excelData;
        const cmsToUse = providedCMSCache || cmsCache;
        try {
            const response = await fetch("https://hotrokhachhang.vnpost.vn/api/admin/complaints/loaddata?ttkSrvId=&ttkSrvIdL2=0&ttkSrvIdL3=&ttkType=&reasonClassifications=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrgLst=&relationOrgLst=&searchInfoCode=&searchIsCompen=&ttkStatusLst=&searchIsComps=&ttkCustomerNumber=&accntTypes=&ttkContactNumber=&ttkContactEmail=&pageIndex=1&pageSize=20&column=ttkId&desending=1&type=8&managedOrgLst=&ttkCodeRef=&managedUsrString=&managedOrgComplaintLst=&createdOrgComplaintLst=&ttkSourceLst=&actResults=&action=2&ttkStatusLstNot=5", {
                "headers": {
                    "accept": "*/*",
                    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
                    "priority": "u=1, i",
                    "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Microsoft Edge\";v=\"151\", \"Chromium\";v=\"151\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                    "x-requested-with": "XMLHttpRequest"
                },
                "referrer": "https://hotrokhachhang.vnpost.vn/",
                "body": null,
                "method": "GET",
                "mode": "cors",
                "credentials": "include"
            });
            const htmlText = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(`<table><tbody>${htmlText}</tbody></table>`, 'text/html');
            const rows = doc.querySelectorAll('tr');

            const parsedData: any[] = [];
            rows.forEach((row) => {
                const checkbox = row.querySelector('.chkcheck');
                const id = checkbox?.getAttribute('data-id');
                const status = checkbox?.getAttribute('data-status');

                if (!id) return; // Bỏ qua các hàng ghi chú comment hoặc không có dữ liệu

                const codeEl = row.querySelector('.cpl-table-code');
                

                const complaintCode = codeEl?.textContent?.trim();

                const trackingLink = row.querySelector('td:nth-child(4) a');
                const trackingNumber = trackingLink?.textContent?.trim();
                if(trackingNumber && trackingNumber.includes(' ')) {
                    //bỏ qua
                    return;
                }

                const complaintType = row.querySelector('td:nth-child(5)')?.textContent?.trim();
                const reason = row.querySelector('td:nth-child(6)')?.textContent?.trim();
                const channel = row.querySelector('td:nth-child(7)')?.textContent?.trim();
                const createdOrg = row.querySelector('td:nth-child(8)')?.textContent?.trim();
                const createDate = row.querySelector('td:nth-child(9)')?.textContent?.trim();
                const location = row.querySelector('td:nth-child(10)')?.textContent?.trim();
                const priority = row.querySelector('td:nth-child(11)')?.textContent?.trim();
                const deadline = row.querySelector('td:nth-child(12)')?.textContent?.trim();
                const expirationStatus = row.querySelector('td:nth-child(13)')?.textContent?.trim();
                const statusText = row.querySelector('.label_status_2')?.textContent?.trim();

                parsedData.push({
                    id,
                    status,
                    complaintCode,
                    trackingNumber,
                    complaintType,
                    reason,
                    note: reason,
                    channel,
                    createdOrg,
                    createDate,
                    location,
                    priority,
                    deadline,
                    expirationStatus,
                    statusText
                });
            });

            console.log('Parsed Data:', parsedData);

            // Merge with existing Excel data and CMS cache
            const mergedData = parsedData.map(item => {
                // QUAN TRỌNG: Dùng mapToUse để lấy dữ liệu mới nhất
                const excelInfo = mapToUse.get(item.trackingNumber);

                // Merge CMS cache
                const cmsData = cmsToUse.get(item.trackingNumber);
                let cmsLastActionDate = '';
                let cmsLastActionUnit = '';
                let cmsLastContent = '';

                if (cmsData && cmsData.tickets && cmsData.tickets.length > 0) {
                    const lastTicket = cmsData.tickets[cmsData.tickets.length - 1];
                    const lastAction = lastTicket.actions && lastTicket.actions.length > 0
                        ? lastTicket.actions[lastTicket.actions.length - 1]
                        : null;

                    if (lastAction) {
                        cmsLastActionDate = lastAction.date;
                        cmsLastActionUnit = lastAction.unit;
                        cmsLastContent = lastAction.content;
                    }
                }

                return {
                    ...item,
                    excelStatus: excelInfo?.status || '',
                    paymentStatus: excelInfo?.payment || '',
                    codAmount: excelInfo?.cod || 0,
                    cmsLastActionDate,
                    cmsLastActionUnit,
                    cmsLastContent
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

            // Bước 1.5: Load CMS Cache từ Storage
            let loadedCMSCache = new Map<string, any>();
            try {
                loadedCMSCache = await loadCMSCache();
            } catch (err) {
                console.error("Error loading CMS cache:", err);
            }

            // Bước 2: Gọi Fetch Data và truyền loadedMap và loadedCMSCache vào
            // Lúc này loadedMap và loadedCMSCache chắc chắn đã có dữ liệu (nếu storage có)
            await fetchData(loadedMap, loadedCMSCache);
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

        // Split into batches of 50
        const BATCH_SIZE = 50;
        const batches: any[][] = [];
        for (let i = 0; i < selectedRowKeys.length; i += BATCH_SIZE) {
            batches.push(selectedRowKeys.slice(i, i + BATCH_SIZE));
        }

        console.log(`🚀 Bulk Close: Total ${totalCount} items, ${batches.length} batches of ${BATCH_SIZE}`);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Process batch in parallel
            const closePromises = batch.map(async (key) => {
                const item = data.find(d => d.id === key);
                if (!item) return { status: 'skip' };

                try {
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

                    if (response?.status === 'success') {
                        return { status: 'success', code: item.complaintCode };
                    } else {
                        return { status: 'fail', code: item.complaintCode, error: response };
                    }
                } catch (e) {
                    return { status: 'error', code: item.complaintCode, error: e };
                }
            });

            const results = await Promise.all(closePromises);

            // Update counts and logs
            results.forEach(res => {
                if (res.status === 'success') {
                    successCount++;
                } else if (res.status === 'fail' || res.status === 'error') {
                    failCount++;
                    console.error(`✗ Đóng thất bại: ${res.code}`, res.error);
                }
            });

            // Update progress
            message.loading({
                content: `Đang xử lý ${Math.min((batchIndex + 1) * BATCH_SIZE, totalCount)}/${totalCount} (Thành công: ${successCount}, Lỗi: ${failCount})`,
                key: 'bulk-progress',
                duration: 0
            });

            // Wait 2 seconds between batches (except the last one)
            if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
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

    const handleCopyTraceLink = (onComplete?: (newData: any[]) => void) => {
        if (!data || data.length === 0) {
            message.warning("Không có dữ liệu để tạo link");
            return;
        }

        const validIds = data.map(item => item.trackingNumber).filter(Boolean);
        if (validIds.length === 0) {
            message.warning("Không tìm thấy mã vận đơn hợp lệ");
            return;
        }

        // Tạo chuỗi ID (mỗi ID một dòng)
        const idsString = validIds.join('\n')
        const targetUrl = "https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2";

        message.loading({ content: "Đang mở trang tra cứu và lấy dữ liệu...", key: 'bccp-process', duration: 0 });
        debugger

        // Mở tab mới ở chế độ background
        chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
            if (!tab.id) {
                message.error("Lỗi: Không thể mở tab mới");
                return;
            }

            const targetTabId = tab.id;

            // Lắng nghe sự kiện tab load xong
            const listener = (startTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tabInfo: chrome.tabs.Tab) => {
                // Chỉ xử lý nếu đúng tabID và trạng thái là 'complete'
                if (startTabId === targetTabId && changeInfo.status === 'complete') {
                    // Gỡ listener ngay lập tức
                    chrome.tabs.onUpdated.removeListener(listener);

                    // Kiểm tra URL login
                    if (tabInfo.url && tabInfo.url.toLowerCase().includes("login")) {
                        chrome.tabs.update(targetTabId, { active: true });
                        message.warning({ content: "Vui lòng đăng nhập BCCP, sau đó thử lại!", key: 'bccp-process', duration: 5 });
                    } else {
                        // Nếu đã vào được trang đích -> Inject Script để fetch dữ liệu
                        message.loading({ content: "Đang tự động lấy dữ liệu...", key: 'bccp-process', duration: 0 });

                        chrome.scripting.executeScript({
                            target: { tabId: targetTabId },
                            func: async (ids: string) => {
                                try {
                                    // Helper wait function
                                    const waitForElement = (selector: string): Promise<Element | null> => {
                                        return new Promise((resolve) => {
                                            if (document.querySelector(selector)) {
                                                return resolve(document.querySelector(selector));
                                            }
                                            const observer = new MutationObserver(() => {
                                                if (document.querySelector(selector)) {
                                                    observer.disconnect();
                                                    resolve(document.querySelector(selector));
                                                }
                                            });
                                            observer.observe(document.body, { childList: true, subtree: true });
                                            // Timeout after 10s
                                            setTimeout(() => {
                                                observer.disconnect();
                                                resolve(null);
                                            }, 10000);
                                        });
                                    };

                                    const textarea = await waitForElement("#ctl00_MainContent_ctl00_txtInput") as HTMLTextAreaElement;
                                    const button = document.querySelector("#ctl00_MainContent_ctl00_btnExportV2") as HTMLInputElement;

                                    if (!textarea || !button) {
                                        return { status: 'error', message: 'Không tìm thấy khung nhập liệu' };
                                    }

                                    // Điền dữ liệu vào textarea
                                    textarea.value = ids;
                                    debugger

                                    // Chuẩn bị form data thay vì click button
                                    const form = document.getElementById("aspnetForm") as HTMLFormElement;
                                    if (!form) return { status: 'error', message: 'Không tìm thấy form' };

                                    const formData = new FormData(form);
                                    // Cập nhật giá trị textarea trong formData (mặc dù đã gán vào DOM, nhưng FormData lấy từ form hiện tại, an toàn hơn là set lại)
                                    formData.set(textarea.name, ids);

                                    // Thêm button click event data (ASP.NET cần biết button nào được click)
                                    formData.set(button.name, button.value || 'Lấy dữ liệu');

                                    // Fetch request
                                    const response = await fetch(window.location.href, {
                                        method: 'POST',
                                        body: formData
                                    });

                                    if (!response.ok) {
                                        throw new Error(`HTTP error! status: ${response.status}`);
                                    }

                                    const blob = await response.blob();

                                    // Convert blob to base64 to send back to extension
                                    return new Promise((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            const base64data = reader.result;
                                            resolve({ status: 'success', data: base64data });
                                        };
                                        reader.onerror = reject;
                                        reader.readAsDataURL(blob);
                                    });

                                } catch (err: any) {
                                    return { status: 'error', message: err.message };
                                }
                            },
                            args: [idsString]
                        }).then((results) => {
                            const result = results[0].result as any;
                            if (result && result.status === 'success') {
                                // Close the tab immediately
                                chrome.tabs.remove(targetTabId);

                                message.success({ content: "Đã lấy dữ liệu thành công!", key: 'bccp-process', duration: 3 });

                                // Process the returned Excel file (Base64)
                                const b64 = result.data.split(',')[1]; // Remove "data:application/vnd.openxmlformats...;base64,"
                                // @ts-ignore
                                const wb = XLSX.read(b64, { type: 'base64' });
                                const wsname = wb.SheetNames[0];
                                const ws = wb.Sheets[wsname];
                                // @ts-ignore
                                const jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 });

                                mergeExcelData(jsonData, onComplete);

                            } else {
                                message.error({ content: `Lỗi: ${result?.message || 'Không xác định'}`, key: 'bccp-process' });
                                // Keep tab open for debugging if needed, or close? Maybe keep open
                                chrome.tabs.update(targetTabId, { active: true });
                            }
                        }).catch((err) => {
                            console.error(err);
                            message.error({ content: "Lỗi script: " + err.message, key: 'bccp-process' });
                        });
                    }
                }
            };

            chrome.tabs.onUpdated.addListener(listener);
        });
    };

    const mergeExcelData = (jsonData: any[], onComplete?: (newData: any[]) => void) => {
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

        // QUAN TRỌNG: Tạo Map MỚI để ghi đè dữ liệu cũ
        const nextExcelMap = new Map<string, ExcelData>();

        jsonData.forEach((row: any) => {
            // Based on log: __EMPTY_1 contains tracking number
            const code = row['__EMPTY_1'] ||  // Tracking number column!
                row['Số hiệu BG'] ||
                '';

            if (code && code !== 'Số hiệu BG') { // Skip header rows
                // Get status from "Kết quả phát" column
                const status = row['__EMPTY_11'] ||
                    '';

                // Get payment status - it's in __EMPTY_13 based on log
                const payment = row['Trạng thái'] ||
                    '';
                debugger

                if (code.toString().trim()) {
                    // Cập nhật hoặc thêm mới vào Map hiện có
                    nextExcelMap.set(code.toString().trim(), {
                        status: status.trim(),
                        payment: payment.trim(),
                        cod: 0
                    });
                }
            }
        });

        console.log('Merged Excel Data Total:', nextExcelMap.size);

        // Save to chrome.storage.local
        const dataMapObj = Object.fromEntries(nextExcelMap);
        const timestamp = new Date().toLocaleString('vi-VN');

        chrome.storage.local.set({
            checkCompleteExcelData: dataMapObj,
            checkCompleteExcelTimestamp: timestamp
        }, () => {
            setExcelData(nextExcelMap);
            setLastExcelUpdate(timestamp);

            // Update data state with Excel info - Tra cứu từ Map đã gộp
            const newData = data.map(item => {
                const excelInfo = nextExcelMap.get(item.trackingNumber);
                return {
                    ...item,
                    excelStatus: excelInfo ? excelInfo.status : item.excelStatus || '',
                    paymentStatus: excelInfo ? excelInfo.payment : item.paymentStatus || '',
                    codAmount: excelInfo ? excelInfo.cod : item.codAmount || 0,
                };
            });

            setData(newData);
            message.success(`Đã gộp dữ liệu Excel thành công. Tổng cộng có ${nextExcelMap.size} mã vận đơn.`);
            if (onComplete) onComplete(newData);
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

            mergeExcelData(jsonData);

            // Clear input value to allow re-uploading same file
            e.target.value = '';
        };
        reader.readAsBinaryString(file);
    };

    // Load CMS Cache from storage
    const loadCMSCache = async () => {
        try {
            const result = await new Promise<any>((resolve) => {
                chrome.storage.local.get(['checkCompleteCMSCache', 'checkCompleteCMSTimestamp'], resolve);
            });

            if (result.checkCompleteCMSCache) {
                const loadedCache = new Map(Object.entries(result.checkCompleteCMSCache));
                setCmsCache(loadedCache);
                setLastCMSUpdate(result.checkCompleteCMSTimestamp || '');
                console.log('✅ Loaded CMS cache from storage:', loadedCache.size, 'items');
                return loadedCache;
            } else {
                console.log('ℹ️ No CMS cache in storage');
                return new Map();
            }
        } catch (err) {
            console.error("Error loading CMS cache:", err);
            return new Map();
        }
    };

    // Save CMS Cache to storage
    const saveCMSCache = (newCache: Map<string, any>) => {
        const cacheObj = Object.fromEntries(newCache);
        const timestamp = new Date().toLocaleString('vi-VN');

        chrome.storage.local.set({
            checkCompleteCMSCache: cacheObj,
            checkCompleteCMSTimestamp: timestamp
        }, () => {
            setCmsCache(newCache);
            setLastCMSUpdate(timestamp);
            console.log('✅ Saved CMS cache to storage:', newCache.size, 'items');
        });
    };

    // Handle List CMS - Fetch ALL tracking numbers in batches of 50 - PARALLEL BATCHES
    const handleListCMS = async (baseData?: any[]) => {
        const dataSource = baseData || data;
        if (!dataSource || dataSource.length === 0) {
            message.warning("Không có dữ liệu để lấy thông tin CMS");
            return;
        }

        setCmsLoading(true);

        // Get ALL tracking numbers (no limit)
        const allTrackingNumbers = dataSource
            .map(item => item.trackingNumber)
            .filter(Boolean);

        const totalCount = allTrackingNumbers.length;

        message.loading({ content: `Đang xử lý 0/${totalCount}...`, key: 'cms-progress', duration: 0 });

        // Load existing cache
        const currentCache = await loadCMSCache();

        // Split into batches of 50
        const BATCH_SIZE = 50;
        const batches: string[][] = [];
        for (let i = 0; i < allTrackingNumbers.length; i += BATCH_SIZE) {
            batches.push(allTrackingNumbers.slice(i, i + BATCH_SIZE));
        }

        console.log(`📦 Total: ${totalCount} mã, chia thành ${batches.length} batches (${BATCH_SIZE} mã/batch)`);

        let processedCount = 0;
        let successCount = 0;

        // Process each batch sequentially, but fetch within batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            console.log(`🚀 Batch ${batchIndex + 1}/${batches.length}: Processing ${batch.length} mã...`);

            // Fetch all items in this batch in parallel
            const fetchPromises = batch.map(async (trackingNumber) => {
                // Fetch from API - ALWAYS fetch to get latest status (as requested)
                try {
                    const response = await new Promise<any>((resolve) => {
                        chrome.runtime.sendMessage({
                            event: 'CONTENTMY',
                            type: 'FETCH_CMS_DATA',
                            payload: { maVanDon: trackingNumber }
                        }, (response) => {
                            resolve(response);
                        });
                    });

                    if (response && response.status === 'success' && response.data) {
                        return { trackingNumber, fromCache: false, data: response.data };
                    } else {
                        return { trackingNumber, fromCache: false, data: { tickets: [] } };
                    }

                } catch (e) {
                    console.error(`Error fetching CMS for ${trackingNumber}:`, e);
                    return { trackingNumber, fromCache: false, data: { tickets: [] } };
                }
            });

            // Wait for all fetches in this batch to complete
            const results = await Promise.all(fetchPromises);

            // Update cache with new data
            results.forEach(result => {
                currentCache.set(result.trackingNumber, result.data);
                if (result.data.tickets && result.data.tickets.length > 0) {
                    successCount++;
                }
                processedCount++;
            });

            // Update progress
            message.loading({
                content: `Đang xử lý ${processedCount}/${totalCount} (Thành công: ${successCount})`,
                key: 'cms-progress',
                duration: 0
            });

            console.log(`✅ Batch ${batchIndex + 1} done: ${processedCount}/${totalCount}`);
        }

        // Save cache
        saveCMSCache(currentCache);

        // Merge CMS data into current data
        const updatedData = dataSource.map(item => {
            const cmsData = currentCache.get(item.trackingNumber);
            if (cmsData && cmsData.tickets && cmsData.tickets.length > 0) {
                // Get last ticket's last action
                const lastTicket = cmsData.tickets[cmsData.tickets.length - 1];
                const lastAction = lastTicket.actions && lastTicket.actions.length > 0
                    ? lastTicket.actions[lastTicket.actions.length - 1]
                    : null;

                return {
                    ...item,
                    cmsLastActionDate: lastAction ? lastAction.date : '',
                    cmsLastActionUnit: lastAction ? lastAction.unit : '',
                    cmsLastContent: lastAction ? lastAction.content : ''
                };
            }
            return item;
        });

        setData(updatedData);

        message.destroy('cms-progress');
        message.success(`Hoàn thành! Tổng: ${totalCount}, Thành công: ${successCount}`, 5);
        setCmsLoading(false);
    };

    const handleUpdateInfo = () => {
        handleCopyTraceLink((newData) => {
            handleListCMS(newData);
        });
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

    // Generate unique values for filters
    const getUniqueValues = (data: any[], key: string) => {
        const values = data.map(item => item[key]).filter(Boolean);
        return [...new Set(values)].map(val => ({ text: val, value: val }));
    };

    const columns: any = [
        // Removed ID column
        // { title: 'ID', dataIndex: 'complaintCode', key: 'complaintCode', render: (text: string) => <b>{text}</b> },
        {
            title: 'STT',
            key: 'stt',
            width: 40,
            render: (_: any, __: any, index: number) => index + 1
        },
        {
            title: 'Số hiệu',
            dataIndex: 'trackingNumber',
            key: 'trackingNumber',
            width: 100,
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
            title: 'Nội dung',
            dataIndex: 'note',
            key: 'note',
            width: 120,
            filters: getUniqueValues(data, 'note'),
            onFilter: (value: string, record: any) => record.note && record.note.indexOf(value) === 0,
            filterSearch: true
        },
        { title: 'Ngày tạo', dataIndex: 'createDate', key: 'createDate', width: 90 },
        {
            title: 'TG xử lý cuối',
            dataIndex: 'cmsLastActionDate',
            width: 90,
            key: 'cmsLastActionDate',
            render: (text: string, record: any) => text || record.deadline || '',
            sorter: (a: any, b: any) => {
                const dateA = parseVietnameseDate(a.cmsLastActionDate || a.deadline || '');
                const dateB = parseVietnameseDate(b.cmsLastActionDate || b.deadline || '');
                return dateA - dateB;
            },
            defaultSortOrder: 'ascend'
        },
        {
            title: 'Trạng thái CMS',
            dataIndex: 'cmsLastContent',
            key: 'cmsLastContent',
            render: (_text: string, record: any) => {
                const unit = record.cmsLastActionUnit || '';
                const content = record.cmsLastContent || record.statusText || '';

                if (!content && !unit) return <span style={{ color: 'gray' }}>-</span>;

                // Format: unit : content với màu sắc khác nhau
                const fullText = unit ? `${unit} : ${content}` : content;

                return (
                    <span>
                        {unit && (
                            <>
                                <span style={{ color: '#1890ff', fontWeight: '600' }}>{unit}</span>
                                <span style={{ color: '#666' }}> : </span>
                            </>
                        )}
                        <span style={{ color: '#52c41a' }}>
                            {fullText.length > 80 ? (unit ? fullText.substring(unit.length + 3, 80) + '...' : content.substring(0, 80) + '...') : content}
                        </span>
                    </span>
                );
            }
        },
        {
            title: 'Trạng thái đơn',
            dataIndex: 'excelStatus',
            key: 'excelStatus',
            render: (text: string) => <span style={{ fontWeight: 'bold', color: 'blue' }}>{text}</span>,
            filters: getUniqueValues(data, 'excelStatus'),
            onFilter: (value: string, record: any) => record.excelStatus === value,
            filterSearch: true
        },
        {
            title: 'Trạng thái nộp',
            dataIndex: 'paymentStatus',
            key: 'paymentStatus',
            render: (text: string) => <span style={{ color: 'purple' }}>{text}</span>,
            filters: getUniqueValues(data, 'paymentStatus'),
            onFilter: (value: string, record: any) => record.paymentStatus === value,
            filterSearch: true
        },
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
    // Filter Logic removed - moved to Table columns

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
                            Danh Sách CMS
                        </Title>
                    </div>

                    <div className="flex flex-col gap-2">
                        {lastExcelUpdate && (
                            <div className="text-xs text-gray-500">
                                📊 Đối soát Excel lần cuối: {lastExcelUpdate}
                            </div>
                        )}
                        {lastCMSUpdate && (
                            <div className="text-xs text-gray-500">
                                💬 CMS lần cuối: {lastCMSUpdate}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button
                                icon={<SyncOutlined />}
                                onClick={handleUpdateInfo}
                                loading={cmsLoading}
                                type="primary"
                            >
                                Cập Nhật Thông Tin
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

                    {/* Filter checkboxes removed */}
                </div>

                <Table
                    rowSelection={rowSelection}
                    dataSource={data}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    bordered
                    pagination={{ pageSize: 300 }}
                    size="small"
                />
            </Card>

            <Modal
                title={
                    <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-blue-600">
                            📦 CMS của {currentCmsData?.trackingNumber || '...'}
                        </span>
                        <Button
                            type="primary"
                            className="mr-10"
                            size="small"
                            onClick={() => {
                                const url = `https://bccp.vnpost.vn/BCCP.aspx?act=Trace&id=${currentCmsData?.trackingNumber}`;
                                window.open(url, '_blank');
                            }}
                            disabled={!currentCmsData?.trackingNumber}
                        >
                            Tra cứu BCCP
                        </Button>
                    </div>
                }
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
