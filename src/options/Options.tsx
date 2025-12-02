import React, { useEffect, useState } from 'react';
import { Button, Input, Table, Card, Tag, Space, message, Modal, Typography, Tooltip, Tabs, Descriptions, Divider, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { CopyOutlined, SettingOutlined, SyncOutlined, FileTextOutlined, HistoryOutlined, InfoCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { OrderHdr, OrderDetail, OrderHistoryResponse, OrderHistoryItem } from '../types/vnpost';

const { Title } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface ExtendedOrder extends OrderHdr {
    detail?: OrderDetail;
    history?: OrderHistoryResponse;
    extraInfo?: string;
    cmsData?: any; // Tickets
    lastUpdated?: number;
    loading?: boolean;
}

const Options: React.FC = () => {
    const [token, setToken] = useState<string>('');
    const [orgCode, setOrgCode] = useState<string>('');
    const [orders, setOrders] = useState<ExtendedOrder[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [filterStatus, setFilterStatus] = useState<string[]>(['10']);
    const [senderInfo, setSenderInfo] = useState<{ name: string, code: string } | null>(null);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchText, setSearchText] = useState<string>('');
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentDetailOrder, setCurrentDetailOrder] = useState<ExtendedOrder | null>(null);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'month'), dayjs()]);

    useEffect(() => {
        // First try to get from chrome storage
        chrome.storage.local.get(['accessToken', 'orgCode'], (result) => {
            if (result.accessToken) setToken(result.accessToken);
            if (result.orgCode) setOrgCode(result.orgCode);
        });

        // Auto-fetch token from my.vnpost.vn localStorage
        chrome.tabs.query({ url: "*://my.vnpost.vn/*" }, (tabs) => {
            if (tabs.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id! },
                    func: () => localStorage.getItem('accessToken')
                }, (results) => {
                    if (results && results[0]?.result) {
                        const fetchedToken = results[0].result;
                        setToken(fetchedToken);

                        // Fetch account settings to get orgCode and orgName
                        fetch("https://api-pre-my.vnpost.vn/myvnp-web/v1/Account/getAccountSetting", {
                            headers: {
                                "authorization": fetchedToken,
                                "capikey": "19001111"
                            },
                            method: "GET",
                            mode: "cors",
                            credentials: "include"
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.orgUserList && data.orgUserList.length > 0) {
                                    const org = data.orgUserList[0];
                                    setOrgCode(org.orgCode);
                                    setSenderInfo({
                                        name: org.orgName,
                                        code: org.orgCode
                                    });

                                    // Save to chrome storage
                                    chrome.storage.local.set({
                                        accessToken: fetchedToken,
                                        orgCode: org.orgCode
                                    });

                                    message.success('✅ Đã tự động lấy token và thông tin tài khoản');
                                }
                            })
                            .catch(err => {
                                console.error('Error fetching account settings:', err);
                            });
                    }
                });
            }
        });
    }, []);

    const filteredOrders = orders.filter(order => {
        if (!searchText) return true;
        const lower = searchText.toLowerCase();
        return (
            order.itemCode?.toLowerCase().includes(lower) ||
            order.receiverName?.toLowerCase().includes(lower) ||
            order.receiverPhone?.includes(searchText) ||
            order.detail?.receiverPhone?.includes(searchText)
        );
    });

    const handleFetchAllDetails = async () => {
        const targetOrders = filteredOrders.length > 0 ? filteredOrders : orders;
        if (targetOrders.length === 0) return;

        message.loading({ content: 'Đang tải chi tiết...', key: 'fetching_all', duration: 0 });
        for (const order of targetOrders) {
            await fetchDetailOnly(order);
        }
        message.success({ content: 'Đã tải xong chi tiết', key: 'fetching_all' });
    };

    const handleFetchAllHistory = async () => {
        const targetOrders = filteredOrders.length > 0 ? filteredOrders : orders;
        if (targetOrders.length === 0) return;

        message.loading({ content: 'Đang tải lịch sử...', key: 'fetching_all', duration: 0 });
        for (const order of targetOrders) {
            await fetchHistoryOnly(order);
        }
        message.success({ content: 'Đã tải xong lịch sử', key: 'fetching_all' });
    };

    const handleClearCache = () => {
        Modal.confirm({
            title: 'Xóa Cache',
            content: 'Bạn có chắc chắn muốn xóa toàn bộ cache đơn hàng? Dữ liệu sẽ được tải lại từ server.',
            onOk: () => {
                chrome.storage.local.remove('ordersCache', () => {
                    message.success('Đã xóa cache');
                    fetchOrders();
                });
            }
        });
    };

    const saveSettings = () => {
        chrome.storage.local.set({ accessToken: token, orgCode: orgCode }, () => {
            message.success('Đã lưu cài đặt');
            setShowSettings(false);
        });
    };

    const fetchOrders = async (customStatus?: string[]) => {
        if (!token || !orgCode) {
            message.error('Vui lòng nhập Token và OrgCode trong cài đặt');
            setShowSettings(true);
            return;
        }

        const statusToFetch = customStatus || filterStatus;

        const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD HH:mm');
        const dateRangeParam = [fmt(dateRange[0]), fmt(dateRange[1])];

        setLoading(true);
        try {
            const response = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchAllByParamV2?page=0&size=70`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token,
                    'Capikey': '19001111'
                },
                body: JSON.stringify({
                    orderType: "1",
                    isInternational: "0",
                    lstStatus: statusToFetch,
                    orgCode: [orgCode],
                    toDateFromDate: dateRangeParam
                })
            });

            if (!response.ok) throw new Error('Failed to fetch orders');

            const data: OrderHdr[] = await response.json();
            data.reverse();

            // Load cache
            const cacheResult = await new Promise<any>((resolve) =>
                chrome.storage.local.get('ordersCache', resolve)
            );
            const cache = cacheResult.ordersCache || {};

            const extendedOrders: ExtendedOrder[] = data.map(order => {
                const cached = cache[order.orderHdrId];
                if (cached && cached.lastUpdated && (Date.now() - cached.lastUpdated < 3 * 60 * 60 * 1000)) {
                    return { ...order, ...cached, loading: false };
                }
                return { ...order, loading: false };
            });

            setOrders(extendedOrders);
            processOrdersQueue(extendedOrders);

        } catch (error) {
            console.error(error);
            message.error('Lỗi khi tải danh sách đơn hàng');
        } finally {
            setLoading(false);
        }
    };

    const processOrdersQueue = async (currentOrders: ExtendedOrder[]) => {
        // To tránh server phát hiện spam và trả về SDT/địa chỉ kèm "Lỗi truy vấn thông tin",
        // ta fetch detail tuần tự với delay giữa mỗi request.
        // Các fetch khác (history, extraInfo, cmsData) chạy song song và update ngay khi có kết quả.

        const DETAIL_DELAY = 300; // ms nghỉ giữa mỗi detail request
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Cache tập trung để tránh race condition
        const cacheUpdates: { [orderHdrId: string]: Partial<ExtendedOrder> } = {};

        // Fetch history, extraInfo, cmsData song song và update ngay
        currentOrders.forEach((order) => {
            // Khởi tạo cache entry
            if (!cacheUpdates[order.orderHdrId]) {
                cacheUpdates[order.orderHdrId] = {};
            }

            // History
            fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${order.itemCode}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            })
                .then(res => res.json())
                .then(historyData => {
                    updateOrderState(order.orderHdrId, { history: historyData });
                    cacheUpdates[order.orderHdrId].history = historyData;
                    cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                })
                .catch(() => null);

            // Extra Info
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "GET_EXTRA_INFO",
                payload: { maVanDon: order.itemCode }
            }, (response) => {
                const extraInfo = response?.status === 'success' ? response.data : '';
                updateOrderState(order.orderHdrId, { extraInfo });
                cacheUpdates[order.orderHdrId].extraInfo = extraInfo;
                cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
            });

            // CMS Data
            const timeout = setTimeout(() => {
                updateOrderState(order.orderHdrId, { cmsData: null });
            }, 5000);
            
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "FETCH_CMS_DATA",
                payload: { maVanDon: order.itemCode }
            }, (response) => {
                clearTimeout(timeout);
                const cmsData = response?.status === 'success' ? response.data : null;
                console.log(cmsData)
                updateOrderState(order.orderHdrId, { cmsData });
                cacheUpdates[order.orderHdrId].cmsData = cmsData;
                cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
            });
        });

        // Fetch detail tuần tự với delay để tránh spam
        // for (let i = 0; i < currentOrders.length; i++) {
        //     const order = currentOrders[i];
            
        //     try {
        //         const response = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${order.orderHdrId}`, {
        //             headers: { 'Authorization': token, 'Capikey': '19001111' }
        //         });
        //         const detailData: OrderDetail = await response.json();

        //         // Chỉ cập nhật receiverAddress nếu không chứa "+++"
        //         const hasError = detailData?.receiverPhone?.includes('+++') || detailData?.receiverAddress?.includes('+++');
        //         const receiverAddress = hasError ? order.receiverAddress : (detailData?.receiverAddress || order.receiverAddress);
                
        //         updateOrderState(order.orderHdrId, {
        //             detail: detailData,
        //             receiverAddress: receiverAddress,
        //             loading: false
        //         });

        //         cacheUpdates[order.orderHdrId].detail = detailData;
        //         cacheUpdates[order.orderHdrId].receiverAddress = receiverAddress;
        //         cacheUpdates[order.orderHdrId].lastUpdated = Date.now();

        //     } catch (error) {
        //         console.error(`Error fetching detail for ${order.itemCode}`, error);
        //         updateOrderState(order.orderHdrId, { loading: false });
        //     }

        //     // Delay trước khi fetch order tiếp theo
        //     if (i < currentOrders.length - 1) {
        //         await sleep(DETAIL_DELAY);
        //     }
        // }

        // Đợi thêm 2s cho các async fetch (history, extra, cms) hoàn thành
        await sleep(2000);

        // Lưu tất cả cache một lần duy nhất
        chrome.storage.local.get('ordersCache', (result) => {
            const existingCache = result.ordersCache || {};
            
            Object.keys(cacheUpdates).forEach(orderHdrId => {
                const currentCache = existingCache[orderHdrId] || {};
                existingCache[orderHdrId] = {
                    ...currentCache,
                    ...cacheUpdates[orderHdrId]
                };
            });

            chrome.storage.local.set({ ordersCache: existingCache }, () => {
                console.log(`✅ Saved cache for ${Object.keys(cacheUpdates).length} orders`);
            });
        });
    };

    const fetchDetailOnly = async (order: ExtendedOrder) => {
        updateOrderState(order.orderHdrId, { loading: true });
        try {
            const detailRes = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${order.orderHdrId}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            });
            const detailData: OrderDetail = await detailRes.json();

            chrome.storage.local.get('ordersCache', (result) => {
                const cache = result.ordersCache || {};
                const currentCache = cache[order.orderHdrId] || {};
                cache[order.orderHdrId] = {
                    ...currentCache,
                    detail: detailData,
                    receiverAddress: detailData.receiverAddress,
                    lastUpdated: Date.now()
                };
                chrome.storage.local.set({ ordersCache: cache });
            });

            updateOrderState(order.orderHdrId, {
                detail: detailData,
                receiverAddress: detailData.receiverAddress,
                loading: false
            });
        } catch (error) {
            console.error(error);
            updateOrderState(order.orderHdrId, { loading: false });
            message.error('Lỗi tải chi tiết');
        }
    };

    const fetchHistoryOnly = async (order: ExtendedOrder) => {
        updateOrderState(order.orderHdrId, { loading: true });
        try {
            const historyRes = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${order.itemCode}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            });
            const historyData: OrderHistoryResponse = await historyRes.json();

            chrome.storage.local.get('ordersCache', (result) => {
                const cache = result.ordersCache || {};
                const currentCache = cache[order.orderHdrId] || {};
                cache[order.orderHdrId] = {
                    ...currentCache,
                    history: historyData,
                    lastUpdated: Date.now()
                };
                chrome.storage.local.set({ ordersCache: cache });
            });

            updateOrderState(order.orderHdrId, {
                history: historyData,
                loading: false
            });
        } catch (error) {
            console.error(error);
            updateOrderState(order.orderHdrId, { loading: false });
            message.error('Lỗi tải lịch sử');
        }
    };

    const fetchOrderFullInfo = async (order: ExtendedOrder, forceRefresh = false) => {
        const now = Date.now();
        if (!forceRefresh && order.lastUpdated && (now - order.lastUpdated < 3 * 60 * 60 * 1000)) {
            return;
        }

        updateOrderState(order.orderHdrId, { loading: true });

        try {
            // 1. Detail
            const detailRes = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${order.orderHdrId}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            });
            const detailData: OrderDetail = await detailRes.json();

            // 2. History
            const historyRes = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${order.itemCode}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            });
            const historyData: OrderHistoryResponse = await historyRes.json();

            // 3. Extra Info (Firebase)
            const extraInfo = await new Promise<string>((resolve) => {
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "GET_EXTRA_INFO",
                    payload: { maVanDon: order.itemCode }
                }, (response) => {
                    resolve(response?.status === 'success' ? response.data : '');
                });
            });

            // 4. CMS Data
            const cmsData = await new Promise<any>((resolve) => {
                const timeout = setTimeout(() => resolve(null), 5000);
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "FETCH_CMS_DATA",
                    payload: { maVanDon: order.itemCode }
                }, (response) => {
                    clearTimeout(timeout);
                    resolve(response?.status === 'success' ? response.data : null);
                });
            });

            const updates = {
                detail: detailData,
                history: historyData,
                extraInfo: extraInfo,
                cmsData: cmsData,
                lastUpdated: Date.now(),
                loading: false,
                receiverAddress: detailData.receiverAddress
            };

            updateOrderState(order.orderHdrId, updates);

            // Save to cache
            chrome.storage.local.get('ordersCache', (result) => {
                const cache = result.ordersCache || {};
                cache[order.orderHdrId] = {
                    detail: detailData,
                    history: historyData,
                    extraInfo: extraInfo,
                    cmsData: cmsData,
                    lastUpdated: Date.now(),
                    receiverAddress: detailData.receiverAddress
                };
                chrome.storage.local.set({ ordersCache: cache });
            });

        } catch (error) {
            console.error(`Error fetching info for ${order.itemCode}`, error);
            updateOrderState(order.orderHdrId, { loading: false });
        }
    };

    const updateOrderState = (orderHdrId: string, updates: Partial<ExtendedOrder>) => {
        setOrders(prev => prev.map(o => o.orderHdrId === orderHdrId ? { ...o, ...updates } : o));
    };

    const parseDate = (str: string) => {
        if (!str) return null;
        try {
            const [d, t] = str.split(' ');
            const [day, month, year] = d.split('/');
            const [h, m, s] = t.split(':');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(h), parseInt(m), parseInt(s));
        } catch (e) { return null; }
    };

    const getDaysDiff = (dateStr: string) => {
        const date = parseDate(dateStr);
        if (!date) return 0;
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const calculateDuration = (startStr: string, endStr: string) => {
        const start = parseDate(startStr);
        const end = parseDate(endStr);
        if (!start || !end) return null;
        const diff = end.getTime() - start.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days} ngày ${hours} giờ`;
    };

    const columns = [
        {
            title: 'Mã & Người nhận',
            key: 'receiver',
            width: 250,
            render: (_: any, record: ExtendedOrder) => {
                const phone = record.detail?.receiverPhone?.replace('+84', '0') || record.receiverPhone?.replace('+84', '0');
                return (
                    <div className="flex flex-col gap-2 p-2 bg-gradient-to-br from-white to-blue-50 rounded-lg">
                        <div
                            className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 text-lg cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all"
                            onClick={async () => {
                                // Check if receiverPhone has error
                                const hasError = record.detail?.receiverPhone?.includes('Lỗi truy vấn thông tin');

                                if (hasError) {
                                    message.loading({ content: 'Đang làm mới dữ liệu...', key: 'refresh_detail', duration: 0 });

                                    try {
                                        // Re-fetch detail
                                        const detailRes = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${record.orderHdrId}`, {
                                            headers: { 'Authorization': token, 'Capikey': '19001111' }
                                        });
                                        const detailData: OrderDetail = await detailRes.json();

                                        // Update state
                                        updateOrderState(record.orderHdrId, {
                                            detail: detailData,
                                            receiverAddress: detailData.receiverAddress,
                                            lastUpdated: Date.now()
                                        });

                                        // Update cache
                                        chrome.storage.local.get('ordersCache', (result) => {
                                            const cache = result.ordersCache || {};
                                            const currentCache = cache[record.orderHdrId] || {};
                                            cache[record.orderHdrId] = {
                                                ...currentCache,
                                                detail: detailData,
                                                receiverAddress: detailData.receiverAddress,
                                                lastUpdated: Date.now()
                                            };
                                            chrome.storage.local.set({ ordersCache: cache });
                                        });

                                        message.success({ content: '✅ Đã làm mới dữ liệu', key: 'refresh_detail' });

                                        // Open modal with updated data
                                        setCurrentDetailOrder({ ...record, detail: detailData, receiverAddress: detailData.receiverAddress });
                                    } catch (error) {
                                        console.error(error);
                                        message.error({ content: '❌ Lỗi khi làm mới dữ liệu', key: 'refresh_detail' });
                                        setCurrentDetailOrder(record);
                                    }
                                } else {
                                    setCurrentDetailOrder(record);
                                }

                                setDetailModalOpen(true);
                            }}
                        >
                            📋 {record.itemCode}
                        </div>
                        <div className="font-semibold text-slate-800">{record.receiverName}</div>
                        <div className="flex items-center gap-2">
                            <div className="text-gray-700 font-mono bg-white px-2 py-1 rounded shadow-sm flex-1">📞 {phone}</div>
                            <Tooltip title="Làm mới thông tin">
                                <Button
                                    size="small"
                                    icon={<SyncOutlined spin={record.loading} />}
                                    onClick={() => fetchDetailOnly(record)}
                                    className="rounded shadow-sm"
                                />
                            </Tooltip>
                        </div>
                        <div className="text-xs text-gray-600 bg-slate-50 p-2 rounded">📍 {record.receiverAddress}</div>
                        <div className="text-xs text-gray-400 mt-1">🕐 {record.createdDate}</div>
                    </div>
                );
            }
        },
        {
            title: 'Thông tin đơn',
            key: 'info',
            width: 180,
            render: (_: any, record: ExtendedOrder) => (
                <div className="flex flex-col gap-2 text-sm p-2 bg-gradient-to-br from-white to-slate-50 rounded-lg">
                    <div className="flex justify-between bg-white p-2 rounded-lg shadow-sm">
                        <span className="text-gray-600">💰 COD:</span>
                        <span className="font-bold text-red-600">{record.codAmount?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between bg-white p-2 rounded-lg shadow-sm">
                        <span className="text-gray-600">💵 Cước:</span>
                        <span className="font-semibold text-blue-600">{record.totalFee?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between bg-white p-2 rounded-lg shadow-sm">
                        <span className="text-gray-600">⚖️ KL:</span>
                        <span className="font-semibold">{record.detail?.weight}g</span>
                    </div>
                    {record.detail?.contentNote && (
                        <div className="text-xs italic bg-gradient-to-r from-yellow-50 to-amber-50 p-2 rounded-lg border border-yellow-300 shadow-sm mt-1">
                            💡 {record.detail.contentNote}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Trạng thái & Metrics',
            key: 'status',
            render: (_: any, record: ExtendedOrder) => {
                const history = record.history?.orderStatusHistoryDtoList || [];
                const lastStatus = history[0];
                const daysSinceUpdate = lastStatus ? getDaysDiff(lastStatus.traceDate) : 0;

                // Metrics Calculation
                // 1. Received (593200 + "Đang vận chuyển") -> Confirmed Delivery ("Đã xác nhận đến phát")
                const receivedEvent = history.slice().reverse().find(h => h.orgCode === "593200" && h.statusText === "Đang vận chuyển");
                const confirmedEvent = history.find(h => h.statusText === "Đã xác nhận đến phát" || h.statusText === "Đang phát hàng");
                const transportDuration = (receivedEvent && confirmedEvent)
                    ? calculateDuration(receivedEvent.traceDate, confirmedEvent.traceDate)
                    : null;

                // 2. First Delivery ("Đang phát hàng" + postman) -> Last Update
                const firstDelivery = history.slice().reverse().find(h => h.statusText === "Đang phát hàng" && h.postmanName);
                const deliveryDuration = (firstDelivery && lastStatus)
                    ? calculateDuration(firstDelivery.traceDate, lastStatus.traceDate)
                    : null;

                // Warnings
                let warning = null;
                if (lastStatus?.statusText === "Vận chuyển đến bưu cục" && daysSinceUpdate > 4) {
                    warning = <Tag color="red" className="whitespace-normal w-full mt-1">Hỗ trợ lưu thoát gấp. TKS</Tag>;
                } else if (["Đã xác nhận đến phát", "Đang phát hàng"].includes(lastStatus?.statusText || "")) {
                    warning = <Tag color="orange" className="whitespace-normal w-full mt-1">BG có cam kết thời gian phát, Bưu tá liên hệ KH từ Dingdong.</Tag>;
                }

                return (
                    <div className="flex flex-col gap-3 p-2">
                        <Tag color={record.status === '15' ? 'red' : 'blue'} className="text-sm py-2 px-3 rounded-lg shadow-md">{record.statusName}</Tag>

                        {lastStatus && (
                            <div className="text-xs bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-xl border border-blue-200 shadow-sm">
                                <div className="font-bold text-blue-700 mb-2">{lastStatus.statusText}</div>
                                <div className="text-gray-600 bg-white px-2 py-1 rounded mb-2">🕐 {lastStatus.traceDate} <span className="text-orange-500">({daysSinceUpdate} ngày trước)</span></div>
                                {lastStatus.statusDetail && <div className="text-gray-700 italic mt-2 border-t border-blue-200 pt-2 bg-white p-2 rounded" dangerouslySetInnerHTML={{ __html: lastStatus.statusDetail }}></div>}
                                {lastStatus.postmanName && <div className="mt-2 bg-white p-2 rounded">👮 {lastStatus.postmanName}</div>}
                                {lastStatus.posTel && <div className="bg-white p-2 rounded mt-1">📞 {lastStatus.posTel}</div>}
                            </div>
                        )}

                        {(transportDuration || deliveryDuration) && (
                            <div className="text-xs bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-xl border border-green-200 shadow-sm">
                                {transportDuration && <div className="mb-1">🚛 VC: <span className="font-bold text-green-700">{transportDuration}</span></div>}
                                {deliveryDuration && <div>📦 Phát: <span className="font-bold text-green-700">{deliveryDuration}</span></div>}
                            </div>
                        )}

                        {warning}
                    </div>
                );
            }
        },
        {
            title: 'Thông tin thêm & CMS',
            key: 'extra',
            width: 350,
            render: (_: any, record: ExtendedOrder) => (
                <div className="flex flex-col gap-3 p-2">
                    <ExtraInfoEditor
                        maVanDon={record.itemCode}
                        initialValue={record.extraInfo}
                        onUpdate={(newVal) => updateOrderState(record.orderHdrId, { extraInfo: newVal })}
                    />
                    {record.cmsData?.tickets && record.cmsData.tickets.length > 0 && (() => {
                        const lastTickets = record.cmsData.tickets.slice(-2);

                        return (
                            <div className="mt-2">
                                <div className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600 mb-2">🎫 CMS Tickets</div>
                                {lastTickets.map((t: any, idx: number) => {
                                    const lastTwoActions = t.actions?.slice(-2) || [];
                                    return (
                                        <div key={idx} className="text-xs bg-gradient-to-br from-orange-50 to-red-50 border border-orange-300 p-3 rounded-xl shadow-sm mb-2">
                                            <div className="font-bold text-orange-700 bg-white px-3 py-1 rounded-lg inline-block shadow-sm mb-2">{t.ticketCode}</div>
                                            {lastTwoActions.map((a: any, ai: number) => (
                                                <div
                                                    key={ai}
                                                    className={`whitespace-normal break-words p-2 mt-2 rounded-lg shadow-sm ${ai === lastTwoActions.length - 1
                                                        ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400'
                                                        : 'bg-gradient-to-r from-blue-100 to-cyan-100 border border-blue-300'
                                                        }`}
                                                >
                                                    <div className="font-semibold text-xs text-slate-700 mb-1">🕐 {a.date} • {a.unit}</div>
                                                    <div className="text-slate-800">{a.content}</div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 120,
            render: (_: any, record: ExtendedOrder) => (
                <Space direction="vertical" className="w-full">
                    <Button
                        block size="small"
                        icon={<CopyOutlined />}
                        className="rounded-lg shadow-sm hover:shadow-md transition-all"
                        onClick={() => {
                            const phone = record.detail?.receiverPhone?.replace('+84', '0') || record.receiverPhone;
                            const text = `${record.itemCode}\n${record.receiverName}\n${phone}\n${record.receiverAddress}`;
                            navigator.clipboard.writeText(text);
                            message.success('✅ Đã copy!');
                        }}
                    >
                        📋 Copy
                    </Button>
                    <Tooltip title={record.lastUpdated ? `Cập nhật: ${new Date(record.lastUpdated).toLocaleTimeString()}` : 'Chưa cập nhật'}>
                        <Button
                            block size="small"
                            icon={<SyncOutlined spin={record.loading} />}
                            className="rounded-lg shadow-sm hover:shadow-md transition-all"
                            type="primary"
                            onClick={() => fetchDetailOnly(record)}
                        >
                            Chi tiết
                        </Button>
                    </Tooltip>
                    <Button
                        block size="small"
                        icon={<HistoryOutlined spin={record.loading} />}
                        className="rounded-lg shadow-sm hover:shadow-md transition-all"
                        onClick={() => fetchHistoryOnly(record)}
                    >
                        📜 Lịch sử
                    </Button>
                    <Button
                        block
                        size="small"
                        type="primary"
                        className="rounded-lg shadow-sm hover:shadow-md transition-all bg-blue-500"
                        onClick={() => {
                            chrome.runtime.sendMessage({
                                event: "CONTENTMY",
                                type: "CREATE_COMPLAINT",
                                payload: {
                                    itemCode: record.itemCode,
                                    token: token,
                                    type: 'support'
                                }
                            });
                        }}
                    >
                        🆘 Hỗ Trợ
                    </Button>
                    <Button
                        block
                        size="small"
                        danger
                        className="rounded-lg shadow-sm hover:shadow-md transition-all"
                        onClick={() => {
                            chrome.runtime.sendMessage({
                                event: "CONTENTMY",
                                type: "CREATE_COMPLAINT",
                                payload: {
                                    itemCode: record.itemCode,
                                    token: token,
                                    type: 'complaint'
                                }
                            });
                        }}
                    >
                        ⚠️ Khiếu Nại
                    </Button>
                    {record.cmsData?.tickets && record.cmsData.tickets.length > 0 && (
                        <Button
                            block
                            size="small"
                            type="dashed"
                            icon={<FileTextOutlined />}
                            className="rounded-lg shadow-sm hover:shadow-md transition-all border-orange-400 text-orange-600"
                            onClick={() => {
                                chrome.runtime.sendMessage({
                                    event: "CONTENTMY",
                                    type: "OPEN_CMS_SEARCH",
                                    payload: { itemCode: record.itemCode }
                                }, (response) => {
                                    if (response?.status === 'success') {
                                        message.success('✅ Đã mở CMS');
                                    } else {
                                        message.error('❌ Không thể mở CMS');
                                    }
                                });
                            }}
                        >
                            🔍 Chi tiết CMS
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
        setSelectedRowKeys(newSelectedRowKeys);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: onSelectChange,
    };

    const handleBulkCheckCMS = () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Vui lòng chọn ít nhất một đơn hàng');
            return;
        }
        message.info(`Đang kiểm tra CMS cho ${selectedRowKeys.length} đơn hàng (Tính năng đang phát triển)`);
        // Implement bulk check logic here later
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            <div className="bg-white/80 backdrop-blur-sm p-4 shadow-lg mb-6 flex justify-between items-center sticky top-0 z-50 border-b border-slate-200">
                <div className="flex items-center gap-4">
                    <Title level={4} style={{ margin: 0 }} className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Quản lý đơn hàng
                    </Title>
                    <Input
                        placeholder="🔍 Tìm vận đơn / Tên / SĐT"
                        style={{ width: 280 }}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        className="rounded-lg shadow-sm border-slate-300"
                    />
                    <RangePicker
                        value={dateRange}
                        onChange={(dates) => {
                            if (dates && dates[0] && dates[1]) {
                                setDateRange([dates[0], dates[1]]);
                            }
                        }}
                        format="DD/MM/YYYY"
                        className="rounded-lg shadow-sm"
                        allowClear={false}
                        placeholder={['Từ ngày', 'Đến ngày']}
                    />
                    <Space>
                        <Button
                            type={filterStatus.includes('10') && !filterStatus.includes('11') ? 'primary' : 'default'}
                            onClick={() => {
                                const status = ['10'];
                                setFilterStatus(status);
                                fetchOrders(status);
                            }}
                            className="rounded-lg shadow-sm"
                        >
                            🚚 Đang vận chuyển
                        </Button>
                        <Button
                            type={filterStatus.includes('11') ? 'primary' : 'default'}
                            onClick={() => {
                                const status = ['11', '12', '13'];
                                setFilterStatus(status);
                                fetchOrders(status);
                            }}
                            className="rounded-lg shadow-sm"
                        >
                            📦 Đang phát hàng
                        </Button>
                        <Button
                            type={filterStatus.includes('15') ? 'primary' : 'default'}
                            onClick={() => {
                                const status = ['15', '27'];
                                setFilterStatus(status);
                                fetchOrders(status);
                            }}
                            className="rounded-lg shadow-sm"
                            danger
                        >
                            ⚠️ Phát KTC
                        </Button>
                    </Space>
                </div>
                <div className="flex items-center gap-3">
                    {selectedRowKeys.length > 0 && (
                        <Button type="primary" danger onClick={handleBulkCheckCMS} className="rounded-lg shadow-md animate-pulse">
                            🔍 Check CMS ({selectedRowKeys.length})
                        </Button>
                    )}
                    <Button onClick={handleFetchAllDetails} className="rounded-lg shadow-sm">📄 Chi Tiết</Button>
                    <Button onClick={handleFetchAllHistory} className="rounded-lg shadow-sm">📜 Lịch sử</Button>
                    {senderInfo && (
                        <div className="text-right hidden md:block bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2 rounded-lg border border-blue-200">
                            <div className="font-bold text-blue-800">{senderInfo.name}</div>
                            <div className="text-xs text-gray-500">{senderInfo.code}</div>
                        </div>
                    )}
                    <Tooltip title="Xóa Cache">
                        <Button icon={<DeleteOutlined />} danger onClick={handleClearCache} className="rounded-lg shadow-sm" />
                    </Tooltip>
                    <Button icon={<SettingOutlined />} onClick={() => setShowSettings(true)} className="rounded-lg shadow-sm" />
                </div>
            </div>

            <div className="px-4 pb-10">
                <Card className="shadow-xl rounded-2xl border-0 overflow-hidden" styles={{ body: { padding: '0' } }}>
                    <Table
                        rowSelection={rowSelection}
                        dataSource={filteredOrders}
                        columns={columns}
                        rowKey="orderHdrId"
                        loading={loading}
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        size="small"
                        className="modern-table"
                        expandable={{
                            expandedRowRender: (record) => (
                                <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 grid grid-cols-2 gap-6">
                                    <div>
                                        <h4 className="font-bold mb-3 text-blue-700 flex items-center gap-2">
                                            <HistoryOutlined /> Chi tiết hành trình
                                        </h4>
                                        <div className="max-h-64 overflow-y-auto bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                                            {record.history?.orderStatusHistoryDtoList?.map((h, idx) => (
                                                <div key={idx} className="text-xs border-b border-slate-100 py-3 last:border-0 hover:bg-blue-50 transition-colors rounded-lg px-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-blue-600 font-mono font-bold">[{h.traceDate}]</span>
                                                        <span className="font-bold text-slate-700">{h.statusText}</span>
                                                    </div>
                                                    <div className="text-gray-600 mt-1">{h.address}</div>
                                                    {h.statusDetail && <div className="text-gray-500 italic mt-1 bg-amber-50 p-1 rounded" dangerouslySetInnerHTML={{ __html: h.statusDetail }}></div>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold mb-3 text-orange-700 flex items-center gap-2">
                                            <FileTextOutlined /> CMS Tickets
                                        </h4>
                                        <div className="max-h-64 overflow-y-auto bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                                            {record.cmsData?.tickets?.length ? (
                                                record.cmsData.tickets.map((t: any, idx: number) => (
                                                    <div key={idx} className="mb-4 border-b border-slate-100 pb-3 last:border-0">
                                                        <div className="font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg inline-block">{t.ticketCode}</div>
                                                        {t.actions?.map((a: any, ai: number) => (
                                                            <div key={ai} className="text-xs mt-2 pl-3 border-l-2 border-orange-300 hover:border-orange-500 transition-colors">
                                                                <div className="font-semibold text-slate-700">{a.date} - {a.unit}</div>
                                                                <div className="text-slate-600 bg-slate-50 p-2 rounded mt-1">{a.content}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-gray-400 italic text-center py-8">Không có dữ liệu CMS</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        }}
                    />
                </Card>
            </div>

            <Modal
                title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">📦 Chi tiết đơn hàng: {currentDetailOrder?.itemCode}</span>}
                open={detailModalOpen}
                onCancel={() => setDetailModalOpen(false)}
                footer={null}
                width={900}
                className="modern-modal"
            >
                {currentDetailOrder && (
                    <Tabs defaultActiveKey="1">
                        <Tabs.TabPane tab="Thông tin chung" key="1">
                            <Descriptions bordered column={1} size="small">
                                <Descriptions.Item label="Người gửi">{currentDetailOrder.senderName}</Descriptions.Item>
                                <Descriptions.Item label="Người nhận">{currentDetailOrder.receiverName}</Descriptions.Item>
                                <Descriptions.Item label="SĐT Người nhận">
                                    {(currentDetailOrder.detail?.receiverPhone || currentDetailOrder.receiverPhone)?.replace('+84', '0')}
                                </Descriptions.Item>
                                <Descriptions.Item label="Địa chỉ">{currentDetailOrder.detail?.receiverAddress || currentDetailOrder.receiverAddress}</Descriptions.Item>
                                <Descriptions.Item label="Trọng lượng">{currentDetailOrder.detail?.weight}g</Descriptions.Item>
                                <Descriptions.Item label="Cước phí">{currentDetailOrder.totalFee?.toLocaleString()} VNĐ</Descriptions.Item>
                                <Descriptions.Item label="COD">{currentDetailOrder.codAmount?.toLocaleString()} VNĐ</Descriptions.Item>
                                <Descriptions.Item label="Ghi chú">{currentDetailOrder.detail?.contentNote}</Descriptions.Item>
                            </Descriptions>
                        </Tabs.TabPane>
                        <Tabs.TabPane tab="Lịch sử hành trình" key="2">
                            <div className="max-h-96 overflow-y-auto">
                                {currentDetailOrder.history?.orderStatusHistoryDtoList?.map((h, idx) => (
                                    <div key={idx} className="mb-2 border-b pb-2">
                                        <div className="font-bold text-blue-600">{h.traceDate}</div>
                                        <div className="font-semibold">{h.statusText}</div>
                                        <div>{h.address}</div>
                                        {h.statusDetail && <div className="text-gray-500 italic" dangerouslySetInnerHTML={{ __html: h.statusDetail }}></div>}
                                    </div>
                                ))}
                            </div>
                        </Tabs.TabPane>
                        <Tabs.TabPane tab="CMS Tickets" key="3">
                            <div className="max-h-96 overflow-y-auto">
                                {currentDetailOrder.cmsData?.tickets?.length ? (
                                    currentDetailOrder.cmsData.tickets.map((t: any, idx: number) => (
                                        <CMSTicketItem 
                                            key={idx} 
                                            ticket={t} 
                                            itemCode={currentDetailOrder.itemCode}
                                        />
                                    ))
                                ) : (
                                    <div className="text-gray-400 italic text-center py-8">Không có dữ liệu CMS</div>
                                )}
                            </div>
                        </Tabs.TabPane>
                        <Tabs.TabPane tab="Dữ liệu JSON" key="4">
                            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-96">
                                {JSON.stringify(currentDetailOrder, null, 2)}
                            </pre>
                        </Tabs.TabPane>
                    </Tabs>
                )}
            </Modal>

            <Modal
                title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">⚙️ Cài đặt</span>}
                open={showSettings}
                onOk={saveSettings}
                onCancel={() => setShowSettings(false)}
                className="modern-modal"
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="font-bold">Token (Authorization)</label>
                        <TextArea rows={4} value={token} onChange={e => setToken(e.target.value)} placeholder="eyJhbGciOi..." />
                    </div>
                    <div>
                        <label className="font-bold">Org Code</label>
                        <Input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="C00..." />
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const ExtraInfoEditor: React.FC<{ maVanDon: string, initialValue?: string, onUpdate: (val: string) => void }> = ({ maVanDon, initialValue, onUpdate }) => {
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

const CMSTicketItem: React.FC<{ ticket: any; itemCode: string }> = ({ ticket, itemCode }) => {
    const [orgCode, setOrgCode] = useState('');
    const [orgInfo, setOrgInfo] = useState<{ orgCode: string; name: string } | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    // Extract unit from last action
    const lastAction = ticket.actions?.[ticket.actions.length - 1];
    const unitMatch = lastAction?.unit?.match(/(\d{6})/);
    const defaultOrgCode = unitMatch?.[1] || '';

    useEffect(() => {
        if (defaultOrgCode) {
            setOrgCode(defaultOrgCode);
            fetchOrgInfo(defaultOrgCode);
        }
    }, [defaultOrgCode]);

    const fetchOrgInfo = async (code: string) => {
        if (code.length !== 6) return;
        
        try {
            const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`, {
                headers: {
                    "accept": "*/*",
                    "x-requested-with": "XMLHttpRequest"
                },
                method: "GET",
                mode: "cors",
                credentials: "include"
            });

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

    const handleOrgCodeChange = (value: string) => {
        setOrgCode(value);
        if (value.length === 6) {
            fetchOrgInfo(value);
        } else {
            setOrgInfo(null);
        }
    };

    const handleSend = () => {
        if (!orgInfo || !comment.trim()) {
            message.warning('Vui lòng nhập đầy đủ thông tin');
            return;
        }

        Modal.confirm({
            title: 'Xác nhận chuyển tiếp',
            content: `Bạn có muốn chuyển tiếp đến ${orgInfo.orgCode} - ${orgInfo.name}?`,
            onOk: async () => {
                setLoading(true);
                try {
                    const form = new FormData();

                    form.append(
                        "dataOrg",
                        new Blob([
                            JSON.stringify([
                                {
                                    tempId: 72,
                                    orgCode: orgInfo.orgCode,
                                    orgName: `${orgInfo.orgCode} - ${orgInfo.name}`,
                                    filename: "",
                                    comment: comment,
                                    file: "",
                                    type: 2,
                                    number: 1
                                }
                            ])
                        ], { type: "application/json" })
                    );

                    form.append("ids", ticket.ticketId);

                    const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/change", {
                        method: "PUT",
                        body: form,
                        credentials: "include"
                    });

                    if (response.ok) {
                        message.success('✅ Đã chuyển tiếp thành công');
                        setComment('');
                    } else {
                        message.error('❌ Lỗi khi chuyển tiếp');
                    }
                } catch (error) {
                    console.error('Error sending:', error);
                    message.error('❌ Lỗi khi chuyển tiếp');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    return (
        <div className="mb-4 border border-orange-200 rounded-lg p-3 bg-gradient-to-br from-orange-50 to-red-50">
            <div className="flex justify-between items-center mb-3">
                <div className="font-bold text-orange-700 bg-white px-3 py-1 rounded-lg shadow-sm">{ticket.ticketCode}</div>
                <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                        chrome.runtime.sendMessage({
                            event: "CONTENTMY",
                            type: "OPEN_CMS_SEARCH",
                            payload: { itemCode }
                        }, (response) => {
                            if (response?.status === 'success') {
                                message.success('✅ Đã mở CMS');
                            } else {
                                message.error('❌ Không thể mở CMS');
                            }
                        });
                    }}
                >
                    Mở CMS
                </Button>
            </div>

            {/* Actions */}
            {ticket.actions?.map((a: any, ai: number) => (
                <div
                    key={ai}
                    className={`p-3 mt-2 rounded-lg ${ai === ticket.actions.length - 1
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

            {/* Form chuyển tiếp */}
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
                    <TextArea
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
        </div>
    );
};

export default Options;
