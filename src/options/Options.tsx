import React, { useEffect, useState, useRef } from 'react';
import { Button, Input, Table, Card, Tag, Space, message, Modal, Typography, Tooltip, Tabs, Descriptions, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { CopyOutlined, SettingOutlined, SyncOutlined, FileTextOutlined, HistoryOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { OrderDetail, OrderHistoryResponse } from '../types/vnpost';
import { Timeline } from 'antd';
import { UndoOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, CarOutlined, HomeOutlined } from '@ant-design/icons';
import { delay } from '../contentScript/utils';
import CMSTicketItem from './components/CMSTicketItem';
import NewConfigRow from './components/NewConfigRow';
import CreateCMSModal from './components/CreateCMSModal';
import ExtraInfoEditor from './components/ExtraInfoEditor';
import BulkCMSModal from './components/BulkCMSModal';
import CheckComplete from './CheckComplete';
import AutoReminderSettings from './components/AutoReminderSettings';
import { handleBulkCloseCMS } from './modals/bulkCloseModal';
import { ExtendedOrder, BulkCMSItem } from '../types/vnpost';
import { handleAutoGenerateCMS, handleAutoCloseCMS } from '../features/autoProcess';
import { useFiltering } from '../features/filters';
import { useOrderData } from '../hooks';
import { fetchAccountSettings, fetchOrderHistory } from '../services/api';
import {
    getCMSTemplates, saveCMSTemplates, getCMSAutoConfigs, saveCMSAutoConfigs,
    fetchCMSData, getExtraInfo,
    createCMSTicket, forwardCMSTicket
} from '../services/chromeMessage';
const { Title } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

// Interface cho cấu hình tự động
interface CMSAutoConfig {
    orgCode: string;       // Mã khách hàng (VD: C00...)
    customerName?: string; // Tên gợi nhớ (optional)
    ticketType: 'support' | 'complaint';
    content: string;       // Nội dung CMS
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
    const [detailModalActiveTab, setDetailModalActiveTab] = useState<string>('1');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'month'), dayjs()]);
    const [cmsAutoConfigs, setCmsAutoConfigs] = useState<CMSAutoConfig[]>([]);
    const [isAutoProcessing, setIsAutoProcessing] = useState(false);
    const [singleSearchLoading, setSingleSearchLoading] = useState<boolean>(false);
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 30;
    const [filterNoCMS, setFilterNoCMS] = useState<boolean>(false);
    const [filterLongDelivery, setFilterLongDelivery] = useState<boolean>(false);
    const LONG_DELIVERY_THRESHOLD = 3; // days
    const [bulkCMSModalOpen, setBulkCMSModalOpen] = useState(false);
    const [cmsTemplates, setCmsTemplates] = useState<string[]>([]);
    const [bulkCMSItems, setBulkCMSItems] = useState<BulkCMSItem[]>([]);
    const [isBulkCreating, setIsBulkCreating] = useState(false);
    const bulkCreationAbortRef = useRef<boolean>(false);
    const [filterPendingCMSDelivered, setFilterPendingCMSDelivered] = useState<boolean>(false);
    // Thêm state để quản lý trạng thái đang đóng
    const [isBulkClosing, setIsBulkClosing] = useState(false);
    // States cho Auto Close CMS
    const [bulkCloseModalOpen, setBulkCloseModalOpen] = useState(false);
    const [bulkCloseItems, setBulkCloseItems] = useState<any[]>([]);
    const [isAutoClosing, setIsAutoClosing] = useState(false);
    const [isAutoClosingProcessing, setIsAutoClosingProcessing] = useState(false);
    const [currentView, setCurrentView] = useState<'list' | 'checkComplete' | 'autoReminder'>('list');

    useEffect(() => {
        const initializeOptions = async () => {
            // First try to get from chrome storage
            chrome.storage.local.get(['accessToken', 'orgCode'], (result) => {
                if (result.accessToken) setToken(result.accessToken);
                if (result.orgCode) setOrgCode(result.orgCode);
            });

            // Load CMS templates from Firebase
            try {
                const response = await getCMSTemplates();
                if (response?.status === 'success' && response.templates) {
                    setCmsTemplates(response.templates);
                }
            } catch (err) {
                console.error('Error loading CMS templates:', err);
            }

            // Load CMS auto configs
            try {
                const response = await getCMSAutoConfigs();
                if (response?.status === 'success' && Array.isArray(response.configs)) {
                    setCmsAutoConfigs(response.configs);
                }
            } catch (err) {
                console.error('Error loading CMS auto configs:', err);
            }

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
                            fetchAccountSettings(fetchedToken)
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
        };

        initializeOptions();
    }, []);

    // Helper functions - must be defined before use
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

    // Effect to handle single item search with debounce
    useEffect(() => {
        if (searchText.length === 13) {
            // Clear previous debounce timer
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }

            // Set new debounce timer
            searchDebounceRef.current = setTimeout(() => {
                handleSingleItemSearch(searchText.trim().toUpperCase());
            }, 500);
        }

        return () => {
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText]);

    const filteredOrders = useFiltering({
        orders,
        searchText,
        filterNoCMS,
        filterLongDelivery,
        filterPendingCMSDelivered,
        LONG_DELIVERY_THRESHOLD
    });
    // Hàm xử lý Đóng hàng loạt - wrapper call imported function
    const handleBulkCloseClick = async () => {
        setIsBulkClosing(true);
        try {
            await handleBulkCloseCMS(
                selectedRowKeys,
                orders,
                () => setSelectedRowKeys([]),
                updateOrderState
            );
        } finally {
            setIsBulkClosing(false);
        }
    };

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

    // Sử dụng hook để handle single item search
    const { handleFetchSingleOrder } = useOrderData();

    const handleSingleItemSearch = async (itemCode: string) => {
        // Check if already in current list
        const existingOrder = orders.find(o => o.itemCode === itemCode);
        if (existingOrder) {
            // Already exists, just open modal
            setCurrentDetailOrder(existingOrder);
            setDetailModalActiveTab('1');
            setDetailModalOpen(true);
            return;
        }

        setSingleSearchLoading(true);
        try {
            const newOrder = await handleFetchSingleOrder(itemCode, token, orgCode, senderInfo || undefined);

            if (newOrder) {
                // Clear table and show only this order
                setOrders([newOrder]);
                // Clear search text
                setSearchText('');
                // Open modal
                setCurrentDetailOrder(newOrder);
                setDetailModalActiveTab('1');
                setDetailModalOpen(true);
            }
        } finally {
            setSingleSearchLoading(false);
        }
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

    const saveSettings = async () => {
        // Save to chrome.storage
        chrome.storage.local.set({
            accessToken: token,
            orgCode: orgCode,
            cmsAutoConfigs: cmsAutoConfigs
        });

        try {
            // Save CMS templates to Firebase
            const templateResponse = await saveCMSTemplates(cmsTemplates);
            if (templateResponse?.status !== 'success') {
                message.error('Lỗi khi lưu mẫu CMS');
                return;
            }

            // Save CMS Auto Configs to Firebase
            const configResponse = await saveCMSAutoConfigs(cmsAutoConfigs);
            if (configResponse?.status !== 'success') {
                message.error('Lỗi khi lưu cấu hình tự động');
                return;
            }

            message.success('Đã lưu cài đặt bao gồm cấu hình tự động CMS');
            setShowSettings(false);
        } catch (err) {
            console.error('Error saving settings:', err);
            message.error('Lỗi khi lưu cài đặt');
        }
    };

    const handleAutoGenerateCMSClick = () => {
        handleAutoGenerateCMS(
            orders,
            cmsAutoConfigs,
            setIsAutoProcessing,
            setBulkCMSItems,
            setBulkCMSModalOpen
        );
    };

    // Hàm Tự động đóng CMS
    const handleAutoCloseCMSClick = () => {
        handleAutoCloseCMS(
            orders,
            setIsAutoClosing,
            setBulkCloseItems,
            setBulkCloseModalOpen
        );
    };

    // Use hook to handle fetchOrders
    const { handleFetchOrders: hookFetchOrders } = useOrderData();

    const fetchOrders = async (customStatus?: string[]) => {
        if (!token || !orgCode) {
            message.error('Vui lòng nhập Token và OrgCode trong cài đặt');
            setShowSettings(true);
            return;
        }

        const statusToFetch = customStatus || filterStatus;
        setLoading(true);

        try {
            const extendedOrders = await hookFetchOrders(token, orgCode, statusToFetch, dateRange);
            if (extendedOrders) {
                setOrders(extendedOrders);
                processOrdersQueue(extendedOrders);
            }
        } catch (error) {
            console.error(error);
            message.error('Lỗi khi tải danh sách đơn hàng');
        } finally {
            setLoading(false);
        }
    };

    const processOrdersQueue = async (currentOrders: ExtendedOrder[]) => {
        // Cache tập trung để tránh race condition
        const cacheUpdates: { [orderHdrId: string]: Partial<ExtendedOrder> } = {};
        const promises: Promise<any>[] = [];

        const initCache = (id: string) => {
            if (!cacheUpdates[id]) cacheUpdates[id] = {};
        };

        // 1. History & Extra Info
        currentOrders.forEach((order) => {
            initCache(order.orderHdrId);

            // History Promise - using service
            const historyPromise = fetchOrderHistory(order.itemCode, token)
                .then(historyData => {
                    updateOrderState(order.orderHdrId, { history: historyData });
                    cacheUpdates[order.orderHdrId].history = historyData;
                    cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                })
                .catch(() => null);
            promises.push(historyPromise);

            // Extra Info Promise - using service
            const extraPromise = getExtraInfo(order.itemCode).then((response: any) => {
                const extraInfo = response?.status === 'success' ? response.data : '';
                updateOrderState(order.orderHdrId, { extraInfo });
                cacheUpdates[order.orderHdrId].extraInfo = extraInfo;
                cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
            });
            promises.push(extraPromise);
        });

        // 2. CMS Data - Probe Logic Wrapped
        if (currentOrders.length > 0) {
            const cmsPromise = new Promise(async (resolve) => {
                const probeOrder = currentOrders[0];
                const others = currentOrders.slice(1);
                initCache(probeOrder.orderHdrId);

                // Fetch Probe (Timeout 10s) - using service
                const probeResult: any = await new Promise(r => {
                    const t = setTimeout(() => r(null), 10000);
                    fetchCMSData(probeOrder.itemCode).then(res => {
                        clearTimeout(t);
                        r(res);
                    }).catch(() => r(null));
                });

                if (probeResult?.status === 'success') {
                    // Probe Success
                    const cmsData = probeResult.data;
                    updateOrderState(probeOrder.orderHdrId, { cmsData });
                    cacheUpdates[probeOrder.orderHdrId].cmsData = cmsData;
                    cacheUpdates[probeOrder.orderHdrId].lastUpdated = Date.now();

                    // Parallel fetch for others - NO aggressive timeout (allow queueing)
                    const otherPromises = others.map(order => new Promise(rInner => {
                        initCache(order.orderHdrId);
                        // Safety timeout 60s
                        const t = setTimeout(() => rInner(null), 60000);
                        fetchCMSData(order.itemCode).then(res => {
                            clearTimeout(t);
                            if (res?.status === 'success') {
                                const data = res.data;
                                updateOrderState(order.orderHdrId, { cmsData: data });
                                cacheUpdates[order.orderHdrId].cmsData = data;
                                cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                            }
                            rInner(null);
                        }).catch(() => rInner(null));
                    }));

                    await Promise.all(otherPromises);
                    resolve(null);
                } else {
                    // Probe Failed
                    console.warn("CMS Probe failed.");
                    message.warning("Không thể kết nối CMS. Dừng tải dữ liệu CMS.");
                    currentOrders.forEach(order => {
                        updateOrderState(order.orderHdrId, { cmsData: { error: true } });
                    });
                    resolve(null);
                }
            });
            promises.push(cmsPromise);
        }

        // Wait for ALL fetches to complete
        await Promise.allSettled(promises);

        // Save entire cache once
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



    const updateOrderState = (orderHdrId: string, updates: Partial<ExtendedOrder>) => {
        setOrders(prev => prev.map(o => o.orderHdrId === orderHdrId ? { ...o, ...updates } : o));
    };

    const columns = [
        {
            title: 'STT',
            key: 'index',
            width: 60,
            fixed: 'left' as const,
            align: 'center' as const,
            render: (_: any, __: ExtendedOrder, index: number) => {
                const displayIndex = (currentPage - 1) * pageSize + index + 1;
                return (
                    <div className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                        {displayIndex}
                    </div>
                );
            }
        },
        {
            title: 'Mã & Người nhận',
            key: 'receiver',
            width: 280,
            render: (_: any, record: ExtendedOrder) => {
                const phone = record.detail?.receiverPhone?.replace('+84', '0') || record.receiverPhone?.replace('+84', '0');
                return (
                    <div className="flex flex-col gap-2 p-2 bg-gradient-to-br from-white to-blue-50 rounded-lg">
                        <div
                            className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 text-lg cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all"
                            onClick={async () => {
                                // Check if receiverPhone has error
                                const hasError = record.detail?.receiverPhone?.includes('+++');

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

                                setDetailModalActiveTab('1');
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

                        {/* Thông tin đơn - Horizontal Layout */}
                        <div className="flex gap-2 text-xs">
                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm flex-1">
                                <span className="text-gray-600">💰</span>
                                <span className="font-bold text-red-600">{record.codAmount?.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm flex-1">
                                <span className="text-gray-600">💵</span>
                                <span className="font-semibold text-blue-600">{record.totalFee?.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm">
                                <span className="text-gray-600">⚖️</span>
                                <span className="font-semibold">{record.detail?.weight}g</span>
                            </div>
                        </div>

                        {record.detail?.contentNote && (
                            <div className="text-xs italic bg-gradient-to-r from-yellow-50 to-amber-50 p-2 rounded-lg border border-yellow-300 shadow-sm">
                                💡 {record.detail.contentNote}
                            </div>
                        )}

                        <div className="text-xs text-gray-400">🕐 {record.createdDate}</div>
                    </div>
                );
            }
        },
        {
            title: 'Hành trình chi tiết',
            key: 'status',
            width: 320,
            render: (_: any, record: ExtendedOrder) => {
                const history = record.history?.orderStatusHistoryDtoList || [];

                // 1. Logic lọc thông minh hơn: Giữ lại Chuyển hoàn và các ghi chú quan trọng
                const timelineEvents = history.slice().reverse().reduce((acc: any[], curr, index, arr) => {
                    const status = curr.statusText || "";
                    const detail = curr.statusDetail || "";

                    const isStart = status.includes("đã nhận hàng");
                    const isDeliveryStart = status.includes("Đã xác nhận đến phát");
                    const isDeliveryAttempt = status.includes("Đang phát hàng");
                    // Bổ sung bắt buộc lấy trạng thái Chuyển hoàn
                    const isReturn = status.includes("chuyển hoàn") || status.includes("Chuyển hoàn");
                    const isFail = status.includes("không thành công");
                    const isSuccess = status.includes("thành công") && !status.includes("không");
                    const isLatest = index === arr.length - 1;

                    // Nếu có ghi chú (DingDong) thì ưu tiên hiển thị bất kể trạng thái gì
                    const hasNote = detail.toLowerCase().includes("ghi chú") || detail.toLowerCase().includes("dingdong");

                    if (isStart || isDeliveryStart || isDeliveryAttempt || isFail || isReturn || isSuccess || isLatest || hasNote) {
                        // Tránh duplicate nếu trạng thái liền kề giống hệt nhau (trừ khi là đang phát hàng vì có thể phát nhiều lần)
                        const last = acc.length > 0 ? acc[acc.length - 1] : null;
                        if (!last || last.statusText !== status || isDeliveryAttempt || isFail) {
                            acc.push(curr);
                        }
                    }
                    return acc;
                }, []);

                // Lấy tối đa 5 sự kiện quan trọng nhất (ưu tiên lỗi và chuyển hoàn)
                // Nếu danh sách dài, ta ưu tiên giữ: Sự kiện mới nhất + Các sự kiện lỗi/chuyển hoàn + Sự kiện đầu
                let displayEvents = timelineEvents;
                if (timelineEvents.length > 10) {
                    const importantEvents = timelineEvents.filter((h: any) =>
                        h.statusText.includes("không thành công") ||
                        h.statusText.includes("chuyển hoàn") ||
                        h.statusText.includes("Đang phát") || // <--- THÊM DÒNG NÀY
                        (h.statusDetail && h.statusDetail.includes("Ghi chú"))
                    );
                    const latest = timelineEvents[timelineEvents.length - 1];
                    const first = timelineEvents[0];

                    // Merge lại để đảm bảo không quá dài nhưng đủ ý
                    displayEvents = [...new Set([first, ...importantEvents.slice(-4), latest])].sort((a: any, b: any) => {
                        return history.indexOf(a) - history.indexOf(b);
                    }).reverse();
                    // Ở đây Antd Timeline mặc định trên xuống, nên ta để Mới nhất (index cuối của mảng gốc) nằm cuối list display? 
                    // KHÔNG, slice().reverse() ở đầu tức là timelineEvents[0] là CŨ NHẤT.
                    // Antd Timeline hiển thị: Item 1 (Top) -> Item N (Bottom).
                    // Thường log hiển thị Mới nhất ở trên cùng. 
                    // => Reverse lại displayEvents để Mới nhất lên đầu.
                    displayEvents = displayEvents.reverse();
                } else {
                    // Nếu ít thì đảo ngược để Mới nhất lên đầu
                    displayEvents = [...timelineEvents].reverse();
                }

                return (
                    <div
                        className="flex flex-col gap-2 p-2 cursor-pointer hover:bg-blue-50 rounded-lg transition-colors group"
                        onClick={() => {
                            setCurrentDetailOrder(record);
                            setDetailModalActiveTab('2');
                            setDetailModalOpen(true);
                        }}
                    >
                        {/* Header trạng thái hiện tại */}
                        <div className="font-bold text-sm text-blue-700 mb-1 flex justify-between items-center">
                            <span className="truncate max-w-[200px]" title={history[0]?.statusText}>{history[0]?.statusText || record.statusName}</span>
                            <span className="text-xs text-gray-500 font-normal whitespace-nowrap">
                                {history[0] ? getDaysDiff(history[0].traceDate) + ' ngày' : ''}
                            </span>
                        </div>

                        {/* Timeline */}
                        <div className="pl-1">
                            <Timeline
                                mode="left"
                                className="custom-compact-timeline"
                                style={{ marginTop: '5px' }}
                                items={displayEvents.map((h: any, idx: number) => {
                                    const statusLower = h.statusText.toLowerCase();
                                    const isFail = statusLower.includes("không thành công");
                                    const isReturn = statusLower.includes("chuyển hoàn") || statusLower.includes("trả lại");
                                    const isDelivery = statusLower.includes("đang phát");
                                    const isLatest = idx === 0;

                                    const dateShort = h.traceDate ? (h.traceDate.split(' ')[0].substring(0, 5) + ' ' + h.traceDate.split(' ')[1].substring(0, 5)) : '';

                                    let color = "gray";
                                    let dot = <ClockCircleOutlined style={{ fontSize: '10px' }} />;

                                    if (isReturn) {
                                        color = "orange";
                                        dot = <UndoOutlined style={{ fontSize: '14px', color: '#fa8c16', fontWeight: 'bold' }} />;
                                    } else if (isFail) {
                                        color = "red";
                                        dot = <ExclamationCircleOutlined style={{ fontSize: '12px', color: '#ff4d4f' }} />;
                                    } else if (isDelivery) {
                                        color = "blue";
                                        dot = <CarOutlined style={{ fontSize: '12px', color: '#1890ff' }} />;
                                    } else if (statusLower.includes("nhận hàng")) {
                                        color = "green";
                                        dot = <HomeOutlined style={{ fontSize: '12px', color: '#52c41a' }} />;
                                    }

                                    let rawDetail = h.statusDetail || "";
                                    rawDetail = rawDetail.replace(/<[^>]*>?/gm, '');

                                    let reason = "";
                                    let note = "";

                                    if (rawDetail.includes("Lý do:")) {
                                        const reasonPart = rawDetail.split("Ghi chú:")[0];
                                        const arrowParts = reasonPart.split("->");
                                        reason = arrowParts.length > 1 ? arrowParts[arrowParts.length - 1].trim() : reasonPart.replace("Lý do:", "").trim();
                                        reason = reason.replace(/\.$/, "");
                                    }

                                    const noteIndex = rawDetail.toLowerCase().indexOf("ghi chú:");
                                    const dingDongIndex = rawDetail.indexOf("(DingDong)");

                                    if (dingDongIndex !== -1) {
                                        note = rawDetail.substring(dingDongIndex + 10).trim();
                                    } else if (noteIndex !== -1) {
                                        note = rawDetail.substring(noteIndex + 8).trim();
                                    }

                                    note = note.replace(/^\)+/, '').trim();

                                    return {
                                        key: idx,
                                        color: color,
                                        dot: dot,
                                        className: isLatest ? "font-semibold pb-2" : "opacity-80 pb-2",
                                        children: (
                                            <div className="flex flex-col text-xs leading-tight">
                                                <div className="flex justify-between gap-2">
                                                    <span className={`${isFail || isReturn ? 'text-red-700 font-bold' : 'text-gray-700'}`}>
                                                        {h.statusText.replace("Vận chuyển", "VC").replace("Bưu cục", "BC")}
                                                    </span>
                                                    <span className="text-gray-400 text-[10px] whitespace-nowrap ml-1">{dateShort}</span>
                                                </div>
                                                {reason && (
                                                    <div className="text-red-600 mt-0.5 text-[11px] bg-red-50 px-1 rounded inline-block">
                                                        {reason}
                                                    </div>
                                                )}
                                                {note && (
                                                    <div className="text-blue-800 italic mt-0.5 text-[11px] border-l-2 border-blue-300 pl-1">
                                                        "{note}"
                                                    </div>
                                                )}
                                                {isDelivery && h.postmanName && (
                                                    <div className="text-blue-500 text-[10px] mt-0.5">👮 {h.postmanName} - {h.postmanTel || h.posTel}</div>
                                                )}
                                            </div>
                                        )
                                    };
                                })}
                            />
                        </div>
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
                    {record.cmsData?.error && (
                        <div className="mt-2 text-xs text-red-500 font-semibold bg-red-50 p-2 rounded border border-red-200 flex items-center gap-2">
                            <ExclamationCircleOutlined /> Lỗi kết nối CMS
                        </div>
                    )}
                    {record.cmsData?.tickets && record.cmsData.tickets.length > 0 && (() => {
                        const lastTickets = record.cmsData.tickets.slice(-2);

                        return (
                            <div
                                className="mt-2 cursor-pointer hover:bg-orange-50 rounded-lg transition-colors p-1"
                                onClick={() => {
                                    setCurrentDetailOrder(record);
                                    setDetailModalActiveTab('3');
                                    setDetailModalOpen(true);
                                }}
                            >
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
            width: 140,
            render: (_: any, record: ExtendedOrder) => (
                <Space direction="vertical" className="w-full" size="small">
                    {/* Copy Button */}
                    <Button
                        block
                        size="small"
                        icon={<CopyOutlined />}
                        className="rounded-lg shadow-sm hover:shadow-md transition-all hover:border-blue-400"
                        onClick={() => {
                            const phone = record.detail?.receiverPhone?.replace('+84', '0') || record.receiverPhone;
                            const text = `${record.itemCode}\n${record.receiverName}\n${phone}\n${record.receiverAddress}`;
                            navigator.clipboard.writeText(text);
                            message.success('✅ Đã copy!');
                        }}
                    >
                        Copy
                    </Button>

                    {/* Detail & History Row */}
                    <Space.Compact block size="small">
                        <Tooltip title={record.lastUpdated ? `Cập nhật: ${new Date(record.lastUpdated).toLocaleTimeString()}` : 'Chưa cập nhật'}>
                            <Button
                                icon={<SyncOutlined spin={record.loading} />}
                                className="rounded-l-lg shadow-sm hover:shadow-md transition-all"
                                type="primary"
                                onClick={() => fetchDetailOnly(record)}
                                style={{ flex: 1 }}
                            />
                        </Tooltip>
                        <Button
                            icon={<HistoryOutlined spin={record.loading} />}
                            className="rounded-r-lg shadow-sm hover:shadow-md transition-all"
                            onClick={() => fetchHistoryOnly(record)}
                            style={{ flex: 1 }}
                        />
                    </Space.Compact>

                    {/* Support & Complaint Row */}
                    <Space.Compact block size="small">
                        <Button
                            type="primary"
                            className="rounded-l-lg shadow-sm hover:shadow-md transition-all"
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
                            style={{ flex: 1 }}
                        >
                            Hỗ Trợ
                        </Button>
                        <Button
                            danger
                            className="rounded-r-lg shadow-sm hover:shadow-md transition-all"
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
                            style={{ flex: 1 }}
                        >
                            Khiếu Nại
                        </Button>
                    </Space.Compact>

                    {/* CMS Create Button */}
                    <CreateCMSModal
                        record={record}
                        updateOrderState={updateOrderState}
                    />

                    {/* CMS Detail Button */}
                    {record.cmsData?.tickets && record.cmsData.tickets.length > 0 && (
                        <Button
                            block
                            size="small"
                            type="dashed"
                            icon={<FileTextOutlined />}
                            className="rounded-lg shadow-sm hover:shadow-md transition-all border-orange-400 text-orange-600 hover:border-orange-500 hover:text-orange-700"
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
                            CMS
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
        onSelectAll: (selected: boolean) => {
            if (selected) {
                // Khi check "Select All" - chọn tất cả đơn hàng
                const allKeys = filteredOrders.map(order => order.orderHdrId);
                setSelectedRowKeys(allKeys);
                message.success(`✅ Đã chọn tất cả ${allKeys.length} đơn hàng`);
            } else {
                // Khi uncheck "Select All" - bỏ chọn tất cả đơn hàng
                setSelectedRowKeys([]);
                message.info('Đã bỏ chọn tất cả');
            }
        },
        // Thêm preserveSelectedRowKeys để giữ selection khi chuyển trang
        selections: [
            {
                key: 'select-all-data',
                text: 'Chọn tất cả đơn hàng',
                onSelect: () => {
                    const allKeys = filteredOrders.map(order => order.orderHdrId);
                    setSelectedRowKeys(allKeys);
                    message.success(`✅ Đã chọn tất cả ${allKeys.length} đơn hàng`);
                },
            },
            {
                key: 'deselect-all-data',
                text: 'Bỏ chọn tất cả',
                onSelect: () => {
                    setSelectedRowKeys([]);
                    message.info('Đã bỏ chọn tất cả');
                },
            },
        ],
    };

    const handleBulkCheckCMS = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Vui lòng chọn ít nhất một đơn hàng');
            return;
        }

        // Get selected orders
        const selectedOrders = orders.filter(o => {
            if (!selectedRowKeys.includes(o.orderHdrId)) return false;

            // Filter out 'chuyển hoàn' or 'trả lại'
            const history = o.history?.orderStatusHistoryDtoList || [];
            const isReturn = history.some(h => {
                const statusLower = (h.statusText || "").toLowerCase();
                return statusLower.includes("chuyển hoàn") || statusLower.includes("trả lại");
            });

            return !isReturn;
        });

        // Initialize bulk CMS items
        const items = await Promise.all(selectedOrders.map(async (order) => {
            // Extract orgCode from history
            const historyList = order.history?.orderStatusHistoryDtoList || [];
            let destOrgCode = '';

            for (const historyItem of historyList) {
                const addressMatch = historyItem.address?.match(/(\d{6})/);
                if (addressMatch) {
                    destOrgCode = addressMatch[1];
                    break;
                }
            }

            // Fetch org info if we have destOrgCode
            let orgInfo: { orgCode: string; name: string } | null = null;
            if (destOrgCode && destOrgCode.length === 6) {
                try {
                    const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${destOrgCode}`, {
                        headers: { "accept": "*/*", "x-requested-with": "XMLHttpRequest" },
                        method: "GET",
                        mode: "cors",
                        credentials: "include"
                    });
                    const data = await response.json();
                    if (data && data.length > 0) {
                        orgInfo = { orgCode: data[0].orgCode, name: data[0].name };
                    }
                } catch (error) {
                    console.error('Error fetching org info:', error);
                }
            }

            return {
                order,
                ticketType: 'support' as const,
                content: '',
                destOrgCode,
                orgInfo,
                status: 'pending' as const
            };
        }));

        setBulkCMSItems(items);
        setBulkCMSModalOpen(true);
    };

    if (currentView === 'checkComplete') {
        return <CheckComplete onBack={() => setCurrentView('list')} />;
    }

    if (currentView === 'autoReminder') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
                <div className="bg-white/80 backdrop-blur-sm shadow-lg mb-6 sticky top-0 z-50 border-b border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                        <Button onClick={() => setCurrentView('list')}>← Quay lại</Button>
                        <Title level={4} style={{ margin: 0 }} className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            ⏰ Tự Động Lập CMS Hối Hàng
                        </Title>
                    </div>
                </div>
                <AutoReminderSettings />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            <div className="bg-white/80 backdrop-blur-sm shadow-lg mb-6 sticky top-0 z-50 border-b border-slate-200">
                {/* Row 1: Title + Search + Date + Sender Info + Settings */}
                <div className="flex justify-between items-center px-4 py-2 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <Title level={4} style={{ margin: 0 }} className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            📦 Quản lý đơn hàng
                        </Title>
                        <Input
                            placeholder="🔍 Tìm vận đơn / Tên / SĐT"
                            style={{ width: 260 }}
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
                            size="small"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {senderInfo && (
                            <div className="text-right hidden md:block bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-1.5 rounded-lg border border-blue-200">
                                <div className="font-bold text-blue-800 text-sm">{senderInfo.name}</div>
                                <div className="text-xs text-gray-500">{senderInfo.code}</div>
                            </div>
                        )}
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => setCurrentView('checkComplete')}
                            className="rounded-lg shadow-sm bg-purple-600 hover:bg-purple-500 border-none mr-2"
                        >
                            Check Complete
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => setCurrentView('autoReminder')}
                            className="rounded-lg shadow-sm bg-green-600 hover:bg-green-500 border-none mr-2"
                        >
                            ⏰ Tự Động CMS
                        </Button>
                        <Tooltip title="Xóa Cache">
                            <Button size="small" icon={<DeleteOutlined />} danger onClick={handleClearCache} className="rounded-lg shadow-sm" />
                        </Tooltip>
                        <Button size="small" icon={<SettingOutlined />} onClick={() => setShowSettings(true)} className="rounded-lg shadow-sm" />
                    </div>
                </div>

                {/* Row 2: Status Filters + Additional Filters + Action Buttons */}
                <div className="flex justify-between items-center px-4 py-2">
                    <div className="flex items-center gap-3">
                        {/* Status Group */}
                        <Space.Compact>
                            <Button
                                size="small"
                                type={filterStatus.includes('10') && !filterStatus.includes('11') ? 'primary' : 'default'}
                                onClick={() => {
                                    const status = ['10'];
                                    setFilterStatus(status);
                                    fetchOrders(status);
                                }}
                                className="rounded-l-lg shadow-sm"
                            >
                                🚚 Vận chuyển
                                {orders.length > 0 && filterStatus.includes('10') && !filterStatus.includes('11') && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full font-bold">
                                        {orders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                type={filterStatus.includes('11') ? 'primary' : 'default'}
                                onClick={() => {
                                    const status = ['11', '12', '13'];
                                    setFilterStatus(status);
                                    fetchOrders(status);
                                }}
                                className="shadow-sm"
                            >
                                📦 Phát hàng
                                {orders.length > 0 && filterStatus.includes('11') && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full font-bold">
                                        {orders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                type={filterStatus.includes('15') ? 'primary' : 'default'}
                                onClick={() => {
                                    const status = ['15', '27'];
                                    setFilterStatus(status);
                                    fetchOrders(status);
                                }}
                                className="rounded-r-lg shadow-sm"
                                danger
                            >
                                ⚠️ KTC
                                {orders.length > 0 && filterStatus.includes('15') && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                                        {orders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                type={filterStatus.includes('14') ? 'primary' : 'default'}
                                onClick={() => {
                                    const status = ['14', '23', '25', '26'];
                                    setFilterStatus(status);
                                    fetchOrders(status);
                                }}
                                className="rounded-r-lg shadow-sm"
                                danger
                            >
                                ⚠️ Thành Công
                                {orders.length > 0 && filterStatus.includes('14') && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                                        {orders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                // Highlight nếu đang chọn đúng tập hợp các mã này
                                type={filterStatus.length === 5 && filterStatus.includes('15') && filterStatus.includes('11') ? 'primary' : 'dashed'}
                                onClick={() => {
                                    // Gộp mã của Phát hàng (11,12,13) và KTC (15,27)
                                    const status = ['11', '12', '13', '15', '27'];
                                    setFilterStatus(status);
                                    fetchOrders(status);
                                }}
                                className="shadow-sm border-purple-400 text-purple-600"
                            >
                                🔄 Phát & KTC
                                {orders.length > 0 && filterStatus.length === 5 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded-full font-bold">
                                        {orders.length}
                                    </span>
                                )}
                            </Button>
                        </Space.Compact>

                        {/* Additional Filters */}
                        <Space.Compact>
                            <Button
                                size="small"
                                type={filterNoCMS ? 'primary' : 'default'}
                                onClick={() => setFilterNoCMS(!filterNoCMS)}
                                className="rounded-l-lg shadow-sm"
                                style={filterNoCMS ? { background: '#f59e0b', borderColor: '#f59e0b' } : {}}
                            >
                                🎫 Chưa có CMS
                                {filterNoCMS && filteredOrders.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-orange-700 text-white text-xs rounded-full font-bold">
                                        {filteredOrders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                type={filterLongDelivery ? 'primary' : 'default'}
                                onClick={() => setFilterLongDelivery(!filterLongDelivery)}
                                className="rounded-r-lg shadow-sm"
                                style={filterLongDelivery ? { background: '#dc2626', borderColor: '#dc2626' } : {}}
                            >
                                ⏱️ Phát {LONG_DELIVERY_THRESHOLD} ngày
                                {filterLongDelivery && filteredOrders.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-red-700 text-white text-xs rounded-full font-bold">
                                        {filteredOrders.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                size="small"
                                type={filterPendingCMSDelivered ? 'primary' : 'default'}
                                onClick={() => setFilterPendingCMSDelivered(!filterPendingCMSDelivered)}
                                className="shadow-sm"
                                style={filterPendingCMSDelivered ? { background: '#08979c', borderColor: '#08979c' } : {}}
                            >
                                ✅ Phát xong chưa đóng CMS
                                {filterPendingCMSDelivered && filteredOrders.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-teal-800 text-white text-xs rounded-full font-bold">
                                        {filteredOrders.length}
                                    </span>
                                )}
                            </Button>
                        </Space.Compact>


                        {/* Active Filters Indicator */}
                        {(filterNoCMS || filterLongDelivery) && (
                            <Button
                                size="small"
                                type="link"
                                danger
                                onClick={() => {
                                    setFilterNoCMS(false);
                                    setFilterLongDelivery(false);
                                }}
                            >
                                ✖ Xóa lọc
                            </Button>
                        )}
                    </div>
                    <Space.Compact className="ml-2">
                        <Tooltip title="Tự động quét đơn KTC/Phát hàng, map nội dung theo Mã KH và chuẩn bị tạo CMS">
                            <Button
                                type="primary"
                                style={{ background: 'linear-gradient(45deg, #FF6B6B, #FF8E53)', border: 'none' }}
                                icon={<span role="img" aria-label="robot">🤖</span>}
                                onClick={handleAutoGenerateCMSClick}
                                loading={isAutoProcessing}
                                className="shadow-md hover:shadow-lg transition-all"
                            >
                                Tự động CMS
                            </Button>
                        </Tooltip>
                        <Tooltip title="Tự động quét đơn Phát TC chưa đóng CMS và chuẩn bị đóng">
                            <Button
                                type="primary"
                                style={{ background: 'linear-gradient(45deg, #13C2C2, #52C41A)', border: 'none' }}
                                icon={<span role="img" aria-label="robot">🤖</span>}
                                onClick={handleAutoCloseCMSClick}
                                loading={isAutoClosing}
                                className="shadow-md hover:shadow-lg transition-all"
                            >
                                Tự động đóng CMS
                            </Button>
                        </Tooltip>
                    </Space.Compact>

                    {/* Action Buttons */}
                    <Space size="small">
                        {selectedRowKeys.length > 0 && (
                            <Button size="small" type="primary" danger onClick={handleBulkCheckCMS} className="rounded-lg shadow-md animate-pulse">
                                🔍 Tạo nhiều CMS ({selectedRowKeys.length})
                            </Button>
                        )}
                        {selectedRowKeys.length > 0 && (
                            <Button
                                size="small"
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={handleBulkCloseClick}
                                loading={isBulkClosing}
                                className="rounded-lg shadow-md bg-emerald-600 border-emerald-600 hover:bg-emerald-500"
                            >
                                ✅ Đóng CMS ({selectedRowKeys.length})
                            </Button>
                        )}
                        <Button size="small" onClick={handleFetchAllDetails} className="rounded-lg shadow-sm">📄 Chi Tiết</Button>
                        <Button size="small" onClick={handleFetchAllHistory} className="rounded-lg shadow-sm">📜 Lịch sử</Button>
                    </Space>
                </div>
            </div>

            <div className="px-4 pb-10" id="orders-table-container">
                <Card className="shadow-xl rounded-2xl border-0 overflow-hidden" styles={{ body: { padding: '0' } }}>
                    <Table
                        rowSelection={rowSelection}
                        dataSource={filteredOrders}
                        columns={columns}
                        rowKey="orderHdrId"
                        loading={loading || singleSearchLoading}
                        pagination={{
                            current: currentPage,
                            pageSize: pageSize,
                            showSizeChanger: false,
                            onChange: (page) => {
                                setCurrentPage(page);
                                // Scroll to top of page when changing page
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        }}
                        size="small"
                        className="modern-table"
                    />
                </Card>
            </div>

            <Modal
                title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">📦 Chi tiết đơn hàng: {currentDetailOrder?.itemCode}</span>}
                open={detailModalOpen}
                onCancel={() => {
                    setDetailModalOpen(false);
                    setDetailModalActiveTab('1');
                }}
                footer={null}
                width={900}
                className="modern-modal"
            >
                {currentDetailOrder && (
                    <Tabs activeKey={detailModalActiveTab} onChange={setDetailModalActiveTab}>
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
                width={800}
            >
                <Tabs defaultActiveKey="1">
                    <Tabs.TabPane tab="Cấu hình chung" key="1">
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="font-bold">Token (Authorization)</label>
                                <TextArea rows={3} value={token} onChange={e => setToken(e.target.value)} />
                            </div>
                            <div>
                                <label className="font-bold">Org Code (Của bạn)</label>
                                <Input value={orgCode} onChange={e => setOrgCode(e.target.value)} />
                            </div>
                            <div>
                                <label className="font-bold">Mẫu nội dung CMS</label>
                                <div className="flex flex-col gap-2 mt-2">
                                    {cmsTemplates.map((template, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <TextArea
                                                value={template}
                                                onChange={e => {
                                                    const newTemplates = [...cmsTemplates];
                                                    newTemplates[idx] = e.target.value;
                                                    setCmsTemplates(newTemplates);
                                                }}
                                                placeholder="Nhập mẫu nội dung..."
                                            />
                                            <Button
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => {
                                                    const newTemplates = cmsTemplates.filter((_, i) => i !== idx);
                                                    setCmsTemplates(newTemplates);
                                                }}
                                            />
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        icon={<PlusOutlined />}
                                        onClick={() => setCmsTemplates([...cmsTemplates, ''])}
                                        block
                                    >
                                        Thêm mẫu
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Tabs.TabPane>
                    <Tabs.TabPane tab="🤖 Cấu hình Tự động CMS" key="2">
                        <div className="flex flex-col gap-3">
                            <div className="bg-blue-50 p-2 rounded text-xs text-blue-700">
                                ℹ️ Cấu hình nội dung CMS riêng cho từng Mã Khách Hàng (Người gửi). Khi dùng chức năng "Tự động CMS", hệ thống sẽ tìm mã khách hàng trong bảng này để điền nội dung tương ứng.
                            </div>

                            <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                                <Table
                                    dataSource={cmsAutoConfigs}
                                    rowKey="orgCode"
                                    pagination={false}
                                    size="small"
                                    columns={[
                                        { title: 'Mã KH', dataIndex: 'orgCode', width: 100 },
                                        {
                                            title: 'Loại',
                                            dataIndex: 'ticketType',
                                            width: 100,
                                            render: (t) => t === 'support'
                                                ? <Tag color="blue">Hỗ trợ</Tag>
                                                : <Tag color="orange">Khiếu nại</Tag>
                                        },
                                        {
                                            title: 'Nội dung mẫu',
                                            dataIndex: 'content',
                                            // Bỏ ellipsis: true, thay bằng render custom
                                            render: (text) => (
                                                <div style={{
                                                    whiteSpace: 'pre-wrap', // Quan trọng: Giữ định dạng xuống dòng
                                                    maxHeight: '80px',      // Giới hạn chiều cao để không phá vỡ bảng
                                                    overflowY: 'auto',      // Hiện thanh cuộn nếu quá dài
                                                    fontSize: '12px'
                                                }}>
                                                    {text}
                                                </div>
                                            )
                                        },
                                        {
                                            title: 'Xóa',
                                            width: 60,
                                            align: 'center',
                                            render: (_, __, idx) => (
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
                                                    const newCfgs = cmsAutoConfigs.filter((_, i) => i !== idx);
                                                    setCmsAutoConfigs(newCfgs);
                                                }} />
                                            )
                                        }
                                    ]}
                                />
                            </div>

                            <NewConfigRow onAdd={(newItem) => setCmsAutoConfigs([...cmsAutoConfigs, newItem])} />
                        </div>
                    </Tabs.TabPane>
                </Tabs>

            </Modal>

            {/* Bulk Close CMS Modal */}
            <Modal
                title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-green-600">🔒 Đóng CMS ({bulkCloseItems.length} ticket)</span>}
                open={bulkCloseModalOpen}
                onCancel={() => {
                    if (isAutoClosingProcessing) {
                        Modal.confirm({
                            title: 'Xác nhận hủy',
                            content: 'Bạn có chắc muốn hủy quá trình đóng CMS?',
                            onOk: () => {
                                setIsAutoClosingProcessing(false);
                                setBulkCloseModalOpen(false);
                            }
                        });
                    } else {
                        setBulkCloseModalOpen(false);
                    }
                }}
                width={1000}
                footer={[
                    <Button key="cancel" onClick={() => setBulkCloseModalOpen(false)}>
                        Hủy
                    </Button>,
                    <Button
                        key="start"
                        type="primary"
                        danger
                        loading={isAutoClosingProcessing}
                        disabled={bulkCloseItems.length === 0 || isAutoClosingProcessing}
                        onClick={() => {
                            Modal.confirm({
                                title: 'Xác nhận đóng CMS',
                                content: `Bạn có muốn đóng ${bulkCloseItems.length} ticket CMS? Hành động này không thể hoàn tác.`,
                                okText: "Xác nhận",
                                cancelText: "Hủy",
                                onOk: async () => {
                                    setIsAutoClosingProcessing(true);
                                    let hideMessage = message.loading(`Đang đóng 0/${bulkCloseItems.length} ticket...`, 0);

                                    let successCount = 0;
                                    let failCount = 0;

                                    for (let i = 0; i < bulkCloseItems.length; i++) {
                                        const item = bulkCloseItems[i];

                                        // Update UI
                                        setBulkCloseItems(prev => prev.map((it, idx) =>
                                            idx === i ? { ...it, status: 'processing' } : it
                                        ));

                                        hideMessage();
                                        hideMessage = message.loading(`Đang đóng ${i + 1}/${bulkCloseItems.length}: ${item.order.itemCode}...`, 0);

                                        try {
                                            // Step 1: Save Result (PTC)
                                            const formData = new FormData();
                                            formData.append('actType', '4');
                                            formData.append('actResult', '490'); // PTC result code
                                            formData.append('ttkId', item.ticketId);
                                            formData.append('actContent', 'PTC');
                                            formData.append('isProcess', 'true');
                                            formData.append('isCompensated', 'false');

                                            const saveRes = await fetch('https://cms.vnpost.vn/api/admin/complaints/save-result', {
                                                method: 'POST',
                                                headers: {
                                                    'accept': '*/*',
                                                    'x-requested-with': 'XMLHttpRequest'
                                                },
                                                body: formData,
                                                credentials: 'include'
                                            });

                                            const saveData = await saveRes.json();
                                            if (!saveData.result || saveData.message !== 'Success') {
                                                throw new Error(saveData.message || 'Failed to save result');
                                            }

                                            // Delay 1s giữa save result và change status
                                            await new Promise(resolve => setTimeout(resolve, 1000));

                                            // Step 2: Change Status
                                            const changeRes = await fetch('https://cms.vnpost.vn/api/admin/complaints/changestatus', {
                                                method: 'POST',
                                                headers: {
                                                    'accept': '*/*',
                                                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                                    'x-requested-with': 'XMLHttpRequest'
                                                },
                                                body: `ids=${item.ticketId}`,
                                                credentials: 'include'
                                            });

                                            const changeData = await changeRes.json();
                                            if (!changeData.result || changeData.message !== 'Success') {
                                                throw new Error(changeData.message || 'Failed to change status');
                                            }

                                            successCount++;
                                            setBulkCloseItems(prev => prev.map((it, idx) =>
                                                idx === i ? { ...it, status: 'success' } : it
                                            ));

                                        } catch (error: any) {
                                            console.error(`Error closing ${item.order.itemCode}:`, error);
                                            failCount++;
                                            setBulkCloseItems(prev => prev.map((it, idx) =>
                                                idx === i ? { ...it, status: 'error', error: error.message } : it
                                            ));
                                        }

                                        // Delay giữa các request
                                        await new Promise(resolve => setTimeout(resolve, 800));
                                    }

                                    hideMessage();
                                    setIsAutoClosingProcessing(false);

                                    if (failCount === 0) {
                                        message.success(`✅ Đã đóng thành công ${successCount} ticket!`);
                                    } else {
                                        message.warning(`⚠️ Đã đóng ${successCount}, lỗi ${failCount} ticket.`);
                                    }

                                    // Refresh CMS data for all successful orders - using service
                                    for (const item of bulkCloseItems.filter(it => it.status === 'success')) {
                                        const cmsDataRes = await fetchCMSData(item.order.itemCode);
                                        const cmsData = cmsDataRes?.status === 'success' ? cmsDataRes.data : null;
                                        updateOrderState(item.order.orderHdrId, { cmsData });
                                    }
                                }
                            });
                        }}
                    >
                        🔒 Đóng CMS ({bulkCloseItems.length} ticket)
                    </Button>
                ]}
                className="modern-modal"
            >
                <div className="max-h-[60vh] overflow-y-auto space-y-2">
                    {bulkCloseItems.map((item, idx) => {
                        const getStatusIcon = (status: string) => {
                            switch (status) {
                                case 'pending': return '⏳';
                                case 'processing': return '🔄';
                                case 'success': return '✅';
                                case 'error': return '❌';
                                default: return '⏳';
                            }
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

                        return (
                            <div key={idx} className={`border-2 rounded-lg p-3 transition-all ${getStatusColor(item.status)}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <span className="text-2xl">{getStatusIcon(item.status)}</span>
                                        <div className="flex-1">
                                            <div className="font-bold text-blue-700">{item.order.itemCode}</div>
                                            <div className="text-sm text-gray-600">{item.order.receiverName}</div>
                                            <div className="text-xs text-gray-500">Ticket: {item.ticketCode} ({item.ticketId})</div>
                                        </div>
                                    </div>
                                    {item.error && (
                                        <div className="text-xs text-red-600 text-right ml-2 max-w-xs">
                                            {item.error}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal>

            {/* Bulk CMS Creation Modal */}
            <BulkCMSModal
                open={bulkCMSModalOpen}
                onCancel={() => {
                    if (isBulkCreating) {
                        Modal.confirm({
                            title: 'Xác nhận hủy',
                            content: 'Bạn có chắc muốn hủy quá trình tạo CMS?',
                            onOk: () => {
                                bulkCreationAbortRef.current = true;
                                setBulkCMSModalOpen(false);
                            }
                        });
                    } else {
                        setBulkCMSModalOpen(false);
                    }
                }}
                items={bulkCMSItems}
                setItems={setBulkCMSItems}
                templates={cmsTemplates}
                isCreating={isBulkCreating}
                onStartCreation={async () => {
                    Modal.confirm({
                        title: 'Xác nhận thực hiện',
                        content: `Bạn có muốn xử lý ${bulkCMSItems.length} yêu cầu?`,
                        onOk: async () => {
                            setIsBulkCreating(true);
                            bulkCreationAbortRef.current = false;

                            for (let i = 0; i < bulkCMSItems.length; i++) {
                                if (bulkCreationAbortRef.current) break;

                                const item = bulkCMSItems[i];
                                // Update status processing...
                                setBulkCMSItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'processing' } : it));

                                try {
                                    let success = false;
                                    let ticketCode = item.ticketId;

                                    if (item.action === 'create') {
                                        // --- LOGIC TẠO MỚI (CŨ) - using service ---
                                        const response = await createCMSTicket(
                                            item.order.itemCode,
                                            item.order.serviceCode || '',
                                            item.ticketType,
                                            item.content
                                        );

                                        if (response && response.status === 'success') {
                                            ticketCode = response.ticketCode;
                                            success = true;
                                            // Wait before forwarding if needed
                                            if (item.destOrgCode) await delay(3000);
                                        } else {
                                            throw new Error(response?.error || 'Failed to create');
                                        }
                                    } else {
                                        // --- LOGIC CHUYỂN TIẾP (MỚI) ---
                                        // Action là 'forward', ticketId đã có sẵn, chỉ cần gửi nội dung
                                        success = true; // Giả định bước đầu OK để vào logic forward bên dưới
                                    }

                                    // --- LOGIC FORWARD (DÙNG CHUNG CHO CẢ TẠO MỚI VÀ CHUYỂN TIẾP) ---
                                    // Nếu là Tạo mới: Forward đến bưu cục đích với nội dung tạo.
                                    // Nếu là Forward (nhắc nhở): Forward đến bưu cục đích với nội dung "Hỗ trợ gấp".
                                    if (success && item.destOrgCode && item.orgInfo && ticketCode) {
                                        const dataOrgObj = [{
                                            tempId: 72,
                                            orgCode: item.orgInfo.orgCode,
                                            orgName: `${item.orgInfo.orgCode} - ${item.orgInfo.name}`,
                                            filename: "", comment: item.content, file: "", type: 2, number: 1
                                        }];

                                        // Using service
                                        await forwardCMSTicket(ticketCode, dataOrgObj);
                                    }

                                    setBulkCMSItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'success' } : it));

                                } catch (error: any) {
                                    console.error('Error:', error);
                                    setBulkCMSItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'error', error: error.message } : it));
                                }

                                // Delay
                                if (i < bulkCMSItems.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
                            }

                            setIsBulkCreating(false);
                            message.success('Hoàn thành tạo CMS');

                            // Refresh CMS data for all orders - using service
                            for (const item of bulkCMSItems) {
                                if (item.status === 'success') {
                                    const cmsDataRes = await fetchCMSData(item.order.itemCode);
                                    const cmsData = cmsDataRes?.status === 'success' ? cmsDataRes.data : null;
                                    updateOrderState(item.order.orderHdrId, { cmsData });
                                }
                            }
                        }
                    });
                }}
                onStop={() => {
                    bulkCreationAbortRef.current = true;
                }}
            />
        </div>
    );
};

export default Options;
