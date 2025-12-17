import React, { useEffect, useState, useRef } from 'react';
import { Button, Input, Table, Card, Tag, Space, message, Modal, Typography, Tooltip, Tabs, Descriptions, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { CopyOutlined, SettingOutlined, SyncOutlined, FileTextOutlined, HistoryOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { OrderHdr, OrderDetail, OrderHistoryResponse } from '../types/vnpost';
import { Timeline } from 'antd';
import { UndoOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, CarOutlined, HomeOutlined } from '@ant-design/icons';
import { delay } from '../contentScript/utils';
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
    const [detailModalActiveTab, setDetailModalActiveTab] = useState<string>('1');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'month'), dayjs()]);

    const [singleSearchLoading, setSingleSearchLoading] = useState<boolean>(false);
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 30;
    const [filterNoCMS, setFilterNoCMS] = useState<boolean>(false);
    const [filterLongDelivery, setFilterLongDelivery] = useState<boolean>(false);
    const LONG_DELIVERY_THRESHOLD = 3; // days
    const [bulkCMSModalOpen, setBulkCMSModalOpen] = useState(false);
    const [cmsTemplates, setCmsTemplates] = useState<string[]>([]);
    const [bulkCMSItems, setBulkCMSItems] = useState<Array<{
        order: ExtendedOrder;
        ticketType: 'support' | 'complaint';
        content: string;
        destOrgCode: string;
        orgInfo: { orgCode: string; name: string } | null;
        status: 'pending' | 'processing' | 'success' | 'error';
        error?: string;
    }>>([]);
    const [isBulkCreating, setIsBulkCreating] = useState(false);
    const bulkCreationAbortRef = useRef<boolean>(false);
    const [filterPendingCMSDelivered, setFilterPendingCMSDelivered] = useState<boolean>(false);
    // Thêm state để quản lý trạng thái đang đóng
    const [isBulkClosing, setIsBulkClosing] = useState(false);

    useEffect(() => {
        // First try to get from chrome storage
        chrome.storage.local.get(['accessToken', 'orgCode'], (result) => {
            if (result.accessToken) setToken(result.accessToken);
            if (result.orgCode) setOrgCode(result.orgCode);
        });

        // Load CMS templates from Firebase
        chrome.runtime.sendMessage({
            event: 'CONTENTMY',
            type: 'GET_CMS_TEMPLATES',
            payload: {}
        }, (response) => {
            if (response?.status === 'success' && response.templates) {
                setCmsTemplates(response.templates);
            }
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

    const calculateDuration = (startStr: string, endStr: string) => {
        const start = parseDate(startStr);
        const end = parseDate(endStr);
        if (!start || !end) return null;
        const diff = end.getTime() - start.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days} ngày ${hours} giờ`;
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

    const filteredOrders = orders.filter(order => {
        // Search text filter
        if (searchText) {
            const lower = searchText.toLowerCase();
            const matchesSearch = (
                order.itemCode?.toLowerCase().includes(lower) ||
                order.receiverName?.toLowerCase().includes(lower) ||
                order.receiverPhone?.includes(searchText) ||
                order.detail?.receiverPhone?.includes(searchText)
            );
            if (!matchesSearch) return false;
        }

        // No CMS filter
        if (filterNoCMS) {
            // Chỉ hiển thị đơn hàng khi:
            // 1. cmsData đã được fetch (không undefined)
            // 2. Và tickets là mảng rỗng (chưa có CMS)
            if (order.cmsData === undefined) return false; // Chưa fetch CMS, bỏ qua
            const hasCMS = order.cmsData?.tickets && order.cmsData.tickets.length > 0;
            if (hasCMS) return false; // Có CMS, bỏ qua

            // 3. Loại bỏ đơn hàng đã Chuyển hoàn (không cần lập CMS)
            const history = order.history?.orderStatusHistoryDtoList || [];
            const isReturn = history.some(h => {
                const statusLower = (h.statusText || "").toLowerCase();
                return statusLower.includes("chuyển hoàn");
            });
            if (isReturn) return false;
        }

        // Long delivery duration filter
        if (filterLongDelivery) {
            const history = order.history?.orderStatusHistoryDtoList || [];
            const firstDelivery = history.slice().reverse().find(h =>
                h.statusText === "Đang phát hàng" || h.statusText === "Đã xác nhận đến phát"
            );
            if (firstDelivery) {
                const startDate = parseDate(firstDelivery.traceDate);
                if (startDate) {
                    const now = new Date();
                    const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < LONG_DELIVERY_THRESHOLD) return false;
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }
        if (filterPendingCMSDelivered) {
            // 1. Phải có CMS Data
            if (!order.cmsData || !order.cmsData.tickets || order.cmsData.tickets.length === 0) {
                return false;
            }

            // 2. Lấy ticket mới nhất và action cuối cùng
            const latestTicket = order.cmsData.tickets[0]; // Giả định ticket đầu tiên là mới nhất
            const actions = latestTicket.actions || [];

            // Nếu không có action nào, coi như chưa đóng -> Giữ lại (return true)
            // Nếu có action, kiểm tra nội dung cuối cùng
            if (actions.length > 0) {
                const lastAction = actions[actions.length - 1]; // Action cuối cùng (mới nhất theo mảng đã sort)
                // Nội dung bắt đầu bằng "Đóng yêu cầu" -> Loại bỏ (vì đã đóng rồi)
                if (lastAction.content && lastAction.content.trim().startsWith("Đóng yêu cầu")) {
                    return false;
                }
            }

            // 3. Kiểm tra lịch sử hành trình: Phải Phát TC và Không Hủy Phát TC
            const history = order.history?.orderStatusHistoryDtoList || [];
            const hasSuccess = history.some(h => h.statusText.toLowerCase().includes("phát hàng thành công"));
            const hasCancel = history.some(h => h.statusText.toLowerCase().includes("hủy phát hàng thành công"));

            // Điều kiện: Có phát thành công VÀ Không bị hủy
            if (!hasSuccess || hasCancel) {
                return false;
            }
        }

        return true;
    });
    // Hàm xử lý Đóng hàng loạt
    const handleBulkCloseCMS = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Vui lòng chọn ít nhất một đơn hàng');
            return;
        }

        // Lọc ra các đơn hàng có CMS Ticket chưa đóng
        // Logic: Có cmsData, có tickets, và ticket mới nhất chưa có nội dung "Đóng yêu cầu"
        const ordersToClose = orders.filter(o => {
            if (!selectedRowKeys.includes(o.orderHdrId)) return false;

            if (!o.cmsData || !o.cmsData.tickets || o.cmsData.tickets.length === 0) return false;

            const latestTicket = o.cmsData.tickets[0];
            const lastAction = latestTicket.actions?.[latestTicket.actions.length - 1];

            // Nếu action cuối cùng đã là Đóng thì bỏ qua
            if (lastAction?.content?.includes("Đóng yêu cầu")) {
                return false;
            }
            return true;
        });

        if (ordersToClose.length === 0) {
            message.info("Các đơn hàng đã chọn đều chưa có CMS hoặc đã được đóng.");
            return;
        }

        Modal.confirm({
            title: `Xác nhận đóng ${ordersToClose.length} ticket CMS`,
            content: (
                <div>
                    <p>Hệ thống sẽ thực hiện:</p>
                    <ul className="list-disc pl-5">
                        <li>Lưu kết quả: <b>PTC (Phát thành công)</b></li>
                        <li>Trạng thái: <b>Đóng hồ sơ</b></li>
                    </ul>
                    <p className="text-red-500 mt-2">Lưu ý: Chỉ thực hiện với các đơn đã thực sự phát xong!</p>
                </div>
            ),
            okText: "Thực hiện Đóng",
            cancelText: "Hủy",
            onOk: async () => {
                setIsBulkClosing(true);
                const hide = message.loading(`Đang đóng 0/${ordersToClose.length} ticket...`, 0);

                let successCount = 0;
                let failCount = 0;

                for (let i = 0; i < ordersToClose.length; i++) {
                    const order = ordersToClose[i];
                    const ticketId = order.cmsData.tickets[0].ticketId; // Lấy ticket mới nhất

                    hide(); // update loading message
                    message.loading(`Đang đóng ${i + 1}/${ordersToClose.length}: ${order.itemCode}...`, 0);

                    try {
                        // Gửi message xuống content script
                        const response = await new Promise<any>((resolve) => {
                            chrome.runtime.sendMessage({
                                event: 'CONTENTMY',
                                type: 'CLOSE_CMS_TICKET',
                                payload: { ticketId: ticketId }
                            }, resolve);
                        });

                        if (response && response.status === 'success') {
                            successCount++;
                            // Cập nhật lại UI CMS local (giả lập đã đóng) để không phải fetch lại ngay
                            // Hoặc gọi fetch CMS lại:
                            const updatedCmsData = await new Promise<any>((resolve) => {
                                const timeout = setTimeout(() => resolve(null), 3000);
                                chrome.runtime.sendMessage({
                                    event: "CONTENTMY",
                                    type: "FETCH_CMS_DATA",
                                    payload: { maVanDon: order.itemCode }
                                }, (res) => {
                                    clearTimeout(timeout);
                                    resolve(res?.status === 'success' ? res.data : null);
                                });
                            });
                            updateOrderState(order.orderHdrId, { cmsData: updatedCmsData });

                        } else {
                            console.error(`Failed to close ${order.itemCode}:`, response?.error);
                            failCount++;
                        }
                    } catch (error) {
                        console.error(`Error closing ${order.itemCode}:`, error);
                        failCount++;
                    }

                    // Delay nhẹ để tránh spam server quá gắt
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                hide();
                setIsBulkClosing(false);
                if (failCount === 0) {
                    message.success(`✅ Đã đóng thành công toàn bộ ${successCount} ticket!`);
                } else {
                    message.warning(`⚠️ Đã đóng ${successCount}, lỗi ${failCount} ticket.`);
                }

                // Clear selection sau khi làm xong
                setSelectedRowKeys([]);
            }
        });
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

        if (!token || !orgCode) {
            message.error('Vui lòng cấu hình Token và OrgCode trước');
            return;
        }

        setSingleSearchLoading(true);
        message.loading({ content: `🔍 Đang tìm kiếm ${itemCode}...`, key: 'single_search', duration: 0 });

        try {
            // Step 1: Search for orderHdrId
            const searchRes = await fetch(
                `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchByOrderCodeOrItemCode?searchValue=${itemCode}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': token,
                        'Capikey': '19001111'
                    },
                    mode: 'cors',
                    credentials: 'include'
                }
            );

            if (!searchRes.ok) {
                message.error({ content: '❌ Không tìm thấy mã vận đơn này', key: 'single_search' });
                setSingleSearchLoading(false);
                return;
            }

            const searchData = await searchRes.json();

            if (!searchData || !searchData.orderHdrId) {
                message.error({ content: '❌ Không tìm thấy mã vận đơn này', key: 'single_search' });
                setSingleSearchLoading(false);
                return;
            }

            // Check if orgCode matches
            if (searchData.orgCode !== orgCode) {
                message.warning({
                    content: `⚠️ Đơn hàng này không thuộc về khách hàng ${senderInfo?.name || orgCode}`,
                    key: 'single_search',
                    duration: 5
                });
                setSingleSearchLoading(false);
                return;
            }

            message.loading({ content: '📦 Đang tải thông tin chi tiết...', key: 'single_search', duration: 0 });

            // Step 2: Fetch full detail
            const detailRes = await fetch(
                `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${searchData.orderHdrId}`,
                {
                    headers: {
                        'Authorization': token,
                        'Capikey': '19001111'
                    },
                    mode: 'cors',
                    credentials: 'include'
                }
            );

            if (!detailRes.ok) {
                message.error({ content: '❌ Lỗi khi tải chi tiết đơn hàng', key: 'single_search' });
                setSingleSearchLoading(false);
                return;
            }

            const orderData: OrderHdr = await detailRes.json();

            // Step 3: Fetch history, extraInfo, cmsData in parallel
            const [historyData, extraInfo, cmsData] = await Promise.all([
                // History
                fetch(
                    `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${itemCode}`,
                    {
                        headers: {
                            'Authorization': token,
                            'Capikey': '19001111'
                        }
                    }
                )
                    .then(res => res.json())
                    .catch(() => null),

                // Extra Info
                new Promise<string>((resolve) => {
                    chrome.runtime.sendMessage(
                        {
                            event: 'CONTENTMY',
                            type: 'GET_EXTRA_INFO',
                            payload: { maVanDon: itemCode }
                        },
                        (response) => {
                            resolve(response?.status === 'success' ? response.data : '');
                        }
                    );
                }),

                // CMS Data
                new Promise<any>((resolve) => {
                    const timeout = setTimeout(() => resolve(null), 5000);
                    chrome.runtime.sendMessage(
                        {
                            event: 'CONTENTMY',
                            type: 'FETCH_CMS_DATA',
                            payload: { maVanDon: itemCode }
                        },
                        (response) => {
                            clearTimeout(timeout);
                            resolve(response?.status === 'success' ? response.data : null);
                        }
                    );
                })
            ]);

            // Step 4: Create extended order object
            const newOrder: ExtendedOrder = {
                ...orderData,
                detail: orderData as any, // OrderHdr already contains detail info
                history: historyData,
                extraInfo: extraInfo,
                cmsData: cmsData,
                lastUpdated: Date.now(),
                loading: false
            };

            // Step 5: Clear table and show only this order
            setOrders([newOrder]);

            // Step 6: Clear search text
            setSearchText('');

            // Step 7: Open modal
            setCurrentDetailOrder(newOrder);
            setDetailModalActiveTab('1');
            setDetailModalOpen(true);

            message.success({
                content: `✅ Đã tìm thấy đơn hàng ${itemCode}`,
                key: 'single_search'
            });

        } catch (error) {
            console.error('Error in single item search:', error);
            message.error({
                content: '❌ Lỗi khi tìm kiếm mã vận đơn',
                key: 'single_search'
            });
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

    const saveSettings = () => {
        // Save to chrome.storage
        chrome.storage.local.set({
            accessToken: token,
            orgCode: orgCode
        }, () => {
            // Save CMS templates to Firebase
            chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'SAVE_CMS_TEMPLATES',
                payload: { templates: cmsTemplates }
            }, (response) => {
                if (response?.status === 'success') {
                    message.success('Đã lưu cài đặt');
                    setShowSettings(false);
                } else {
                    message.error('Lỗi khi lưu mẫu CMS');
                }
            });
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
            const response = await fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchAllByParamV2?page=0&size=1000`, {
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
        // Cache tập trung để tránh race condition
        const cacheUpdates: { [orderHdrId: string]: Partial<ExtendedOrder> } = {};
        const promises: Promise<any>[] = [];

        const initCache = (id: string) => {
            if (!cacheUpdates[id]) cacheUpdates[id] = {};
        };

        // 1. History & Extra Info
        currentOrders.forEach((order) => {
            initCache(order.orderHdrId);

            // History Promise
            const historyPromise = fetch(`https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${order.itemCode}`, {
                headers: { 'Authorization': token, 'Capikey': '19001111' }
            })
                .then(res => res.json())
                .then(historyData => {
                    updateOrderState(order.orderHdrId, { history: historyData });
                    cacheUpdates[order.orderHdrId].history = historyData;
                    cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                })
                .catch(() => null);
            promises.push(historyPromise);

            // Extra Info Promise
            const extraPromise = new Promise(resolve => {
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "GET_EXTRA_INFO",
                    payload: { maVanDon: order.itemCode }
                }, (response) => {
                    const extraInfo = response?.status === 'success' ? response.data : '';
                    updateOrderState(order.orderHdrId, { extraInfo });
                    cacheUpdates[order.orderHdrId].extraInfo = extraInfo;
                    cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                    resolve(null);
                });
            });
            promises.push(extraPromise);
        });

        // 2. CMS Data - Probe Logic Wrapped
        if (currentOrders.length > 0) {
            const cmsPromise = new Promise(async (resolve) => {
                const probeOrder = currentOrders[0];
                const others = currentOrders.slice(1);
                initCache(probeOrder.orderHdrId);

                // Fetch Probe (Timeout 10s)
                const probeResult: any = await new Promise(r => {
                    const t = setTimeout(() => r(null), 10000);
                    chrome.runtime.sendMessage({
                        event: "CONTENTMY", type: "FETCH_CMS_DATA", payload: { maVanDon: probeOrder.itemCode }
                    }, (res) => { clearTimeout(t); r(res); });
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
                        chrome.runtime.sendMessage({
                            event: "CONTENTMY", type: "FETCH_CMS_DATA", payload: { maVanDon: order.itemCode }
                        }, (res) => {
                            clearTimeout(t);
                            if (res?.status === 'success') {
                                const data = res.data;
                                updateOrderState(order.orderHdrId, { cmsData: data });
                                cacheUpdates[order.orderHdrId].cmsData = data;
                                cacheUpdates[order.orderHdrId].lastUpdated = Date.now();
                            }
                            rInner(null);
                        });
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
                    <CreateCMSTicketButton
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
        onSelectAll: (selected: boolean, selectedRows: ExtendedOrder[], changeRows: ExtendedOrder[]) => {
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
                                onClick={handleBulkCloseCMS}
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
                        title: 'Xác nhận tạo CMS',
                        content: `Bạn có muốn tạo ${bulkCMSItems.length} ticket CMS?`,
                        onOk: async () => {
                            setIsBulkCreating(true);
                            bulkCreationAbortRef.current = false;

                            for (let i = 0; i < bulkCMSItems.length; i++) {
                                if (bulkCreationAbortRef.current) {
                                    message.info('Đã dừng tạo CMS');
                                    break;
                                }

                                const item = bulkCMSItems[i];

                                // Update status to processing
                                setBulkCMSItems(prev => prev.map((it, idx) =>
                                    idx === i ? { ...it, status: 'processing' } : it
                                ));

                                try {
                                    // Calculate expiration date
                                    const now = new Date();
                                    const expirationDate = new Date(now);
                                    expirationDate.setDate(expirationDate.getDate() + (item.ticketType === 'support' ? 1 : 7));
                                    const expiration = `${String(expirationDate.getDate()).padStart(2, '0')}/${String(expirationDate.getMonth() + 1).padStart(2, '0')}/${expirationDate.getFullYear()}`;

                                    // Get ttkSrvIdL3 from serviceCode mapping
                                    const SERVICE_CODE_MAPPING: { [key: string]: string } = {
                                        "CTN004": "363", "CTN005": "566", "CTN002": "335", "CTN003": "336",
                                        "TTN006": "311", "RTN001": "307", "RTN002": "706", "RTN004": "1147",
                                        "RTN003": "726", "TTN002": "346", "TTN005": "310", "TTN001": "315",
                                        "TTN004": "309", "TTN003": "367", "TTN007": "707", "CTN012": "1266",
                                        "CTN001": "334", "CTN019": "1187", "CTN028": "1646", "CTN022": "1306",
                                        "CTN020": "1206", "CTN018": "1186", "CTN007": "668", "CTN016": "1146",
                                        "PTN010": "1506", "CTN021": "1226", "CTN025": "1606", "ETN054": "1547",
                                        "ETN053": "1546", "ETN031": "646", "ETN032": "647", "ETN033": "766",
                                        "ETN037": "786", "ETN052": "1486", "CTN010": "926", "CTN024": "1526",
                                        "CTN023": "1527", "CTN009": "846", "ETN017": "329", "ETN007": "318",
                                        "ETN039": "1026", "ETN019": "332", "ETN009": "320", "ETN030": "468",
                                        "ETN050": "1366", "ETN040": "989", "ETN044": "1107", "ETN045": "1106",
                                        "ETN001": "312", "ETN011": "324", "ETN055": "1626", "ETN022": "526",
                                        "ETN020": "333", "ETN010": "321", "ETN029": "347", "ETN048": "1326",
                                        "ETN051": "1426", "ETN047": "1246", "ETN046": "1166", "ETN049": "1346",
                                        "ETN016": "328", "ETN006": "317", "ETN041": "966", "ETN013": "326",
                                        "ETN003": "314", "ETN024": "342", "ETN028": "345", "ETN027": "344",
                                        "ETN015": "327", "ETN005": "316", "ETN012": "325", "ETN002": "313",
                                        "ETN035": "807", "ETN034": "806", "ETN036": "808", "ETN018": "330",
                                        "ETN008": "319", "HCC003": "688", "HCC004": "689", "HCC001": "686",
                                        "HCC002": "687", "KT1001": "348", "KT1005": "352", "KT1006": "353",
                                        "KT1007": "354", "KT1003": "350", "KT1014": "360", "KT1015": "361",
                                        "KT1016": "362", "KT1002": "349", "KT1008": "322", "KT1009": "355",
                                        "KT1010": "356", "KT1004": "351", "KT1011": "357", "KT1012": "358",
                                        "KT1013": "359", "PTN012": "1267", "PTN003": "746", "PTN001": "337",
                                        "PTN005": "906", "PTN006": "907", "PTN009": "986", "PTN008": "946",
                                        "PTN004": "747", "PHBC02": "1006", "CTN006": "586", "TDT001": "364",
                                        "ETN021": "341", "TDT002": "338", "TDT004": "340", "TDT003": "339",
                                        "CTN008": "826", "PTN002": "546"
                                    };

                                    const serviceCode = item.order.serviceCode || '';
                                    const ttkSrvIdL3 = SERVICE_CODE_MAPPING[serviceCode] || "1206";

                                    const form = new FormData();
                                    form.append("file", "");
                                    form.append("type", "DVBC");

                                    const troubleticketData = {
                                        ttkType: "2",
                                        ttkContactName: "Bưu cục Bồng Sơn 1",
                                        ttkSource: "1",
                                        ttkSeverity: "1",
                                        ttkReason: item.ticketType === 'support' ? "134" : "534",
                                        ttkContactNumber: "02563861718",
                                        ttkContactEmail: "",
                                        ttkContent: item.content,
                                        accntCodeRef: "",
                                        accntName: "",
                                        accntMobile: "",
                                        ttkSrvIdL2: "62",
                                        ttkSrvIdL3: ttkSrvIdL3,
                                        ttkExpiration: expiration,
                                        ttkContactAddr: "",
                                        accntAddr: "",
                                        accntCode: "",
                                        accntPostcode: "",
                                        accntProvince: "",
                                        accntDistrict: "",
                                        accntWards: "",
                                        accntEmail: "",
                                        contactPostcode: "",
                                        contactProvince: "",
                                        contactDistrict: "",
                                        contactWards: "",
                                        accntAddrDetail: "",
                                        ttkContactAddrDetail: "",
                                        ttkSrvId: 1,
                                        parcelId: item.order.itemCode,
                                        postageData: {
                                            parcelId: item.order.itemCode,
                                            poAcc: "",
                                            poName: "",
                                            managerOrg: "",
                                            poWeigh: "",
                                            poRate: "",
                                            poClassify: "",
                                            poSenderName: "",
                                            poSenderPhone: "",
                                            poSenderAddress: "",
                                            poSenderAddressDetail: "",
                                            poReceiverName: "",
                                            poReceiverPhone: "",
                                            poReceiverAddress: "",
                                            poReceiverAddressDetail: "",
                                            poParcelDirection: "",
                                            poSend: "",
                                            poSendName: "",
                                            poSenderEmail: "",
                                            poStatus: "",
                                            poMethod: ""
                                        }
                                    };

                                    form.append("troubleticketData", new Blob([JSON.stringify(troubleticketData)], { type: "application/json" }));

                                    const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/save", {
                                        method: "POST",
                                        body: form,
                                        credentials: "include"
                                    });

                                    const result = await response.json();

                                    if (result.result === true && result.code) {
                                        await delay(3000);
                                        // Success - forward if destOrgCode exists
                                        if (item.destOrgCode && item.orgInfo) {
                                            try {
                                                const forwardForm = new FormData();
                                                forwardForm.append("dataOrg", new Blob([JSON.stringify([{
                                                    tempId: 72,
                                                    orgCode: item.orgInfo.orgCode,
                                                    orgName: `${item.orgInfo.orgCode} - ${item.orgInfo.name}`,
                                                    filename: "", comment: item.content, file: "", type: 2, number: 1
                                                }])], { type: "application/json" }));
                                                forwardForm.append("ids", result.code);

                                                await fetch("https://cms.vnpost.vn/api/admin/complaints/change", {
                                                    method: "PUT",
                                                    body: forwardForm,
                                                    credentials: "include"
                                                });
                                            } catch (error) {
                                                console.error('Error forwarding:', error);
                                            }
                                        }

                                        setBulkCMSItems(prev => prev.map((it, idx) =>
                                            idx === i ? { ...it, status: 'success' } : it
                                        ));
                                    } else {
                                        throw new Error('Failed to create ticket');
                                    }
                                } catch (error) {
                                    console.error('Error creating ticket:', error);
                                    setBulkCMSItems(prev => prev.map((it, idx) =>
                                        idx === i ? { ...it, status: 'error', error: 'Không thể tạo CMS' } : it
                                    ));
                                }

                                // Wait 1s before next
                                if (i < bulkCMSItems.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }

                            setIsBulkCreating(false);
                            message.success('Hoàn thành tạo CMS');

                            // Refresh CMS data for all orders
                            for (const item of bulkCMSItems) {
                                if (item.status === 'success') {
                                    const cmsData = await new Promise<any>((resolve) => {
                                        const timeout = setTimeout(() => resolve(null), 5000);
                                        chrome.runtime.sendMessage({
                                            event: "CONTENTMY",
                                            type: "FETCH_CMS_DATA",
                                            payload: { maVanDon: item.order.itemCode }
                                        }, (response) => {
                                            clearTimeout(timeout);
                                            resolve(response?.status === 'success' ? response.data : null);
                                        });
                                    });
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

const BulkCMSModal: React.FC<{
    open: boolean;
    onCancel: () => void;
    items: Array<{
        order: ExtendedOrder;
        ticketType: 'support' | 'complaint';
        content: string;
        destOrgCode: string;
        orgInfo: { orgCode: string; name: string } | null;
        status: 'pending' | 'processing' | 'success' | 'error';
        error?: string;
    }>;
    setItems: React.Dispatch<React.SetStateAction<Array<any>>>;
    templates: string[];
    isCreating: boolean;
    onStartCreation: () => void;
    onStop: () => void;
}> = ({ open, onCancel, items, setItems, templates, isCreating, onStartCreation, onStop }) => {
    const [globalTicketType, setGlobalTicketType] = useState<'support' | 'complaint'>('support');
    const [globalContent, setGlobalContent] = useState<string>('');

    // Update all items when global values change
    useEffect(() => {
        if (!isCreating) {
            setItems(prev => prev.map(item => ({
                ...item,
                ticketType: globalTicketType,
                content: globalContent
            })));
        }
    }, [globalTicketType, globalContent, isCreating, setItems]);

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
                                        onChange={(value) => setGlobalContent(value.replace(/\\n/g, '\n'))}
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
                                onChange={(e) => setGlobalContent(e.target.value)}
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
                                    <span className="text-2xl">{getStatusIcon(item.status)}</span>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-blue-700">{item.order.itemCode}</span>
                                            <span className="text-sm text-gray-600">- {item.order.receiverName}</span>
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
                        disabled={isCreating || items.length === 0 || items.every(it => it.status !== 'pending') || !globalContent.trim()}
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
        </Modal>
    );
};

const CreateCMSTicketButton: React.FC<{
    record: ExtendedOrder;
    updateOrderState: (orderHdrId: string, updates: Partial<ExtendedOrder>) => void;
}> = ({ record, updateOrderState }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [ticketType, setTicketType] = useState<'support' | 'complaint'>('support');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [destOrgCode, setDestOrgCode] = useState('');
    const [orgInfo, setOrgInfo] = useState<{ orgCode: string; name: string } | null>(null);
    const [templates, setTemplates] = useState<string[]>([]);

    // Mapping serviceCode -> ttkSrvIdL3
    const SERVICE_CODE_MAPPING: { [key: string]: string } = {
        "CTN004": "363", "CTN005": "566", "CTN002": "335", "CTN003": "336",
        "TTN006": "311", "RTN001": "307", "RTN002": "706", "RTN004": "1147",
        "RTN003": "726", "TTN002": "346", "TTN005": "310", "TTN001": "315",
        "TTN004": "309", "TTN003": "367", "TTN007": "707", "CTN012": "1266",
        "CTN001": "334", "CTN019": "1187", "CTN028": "1646", "CTN022": "1306",
        "CTN020": "1206", "CTN018": "1186", "CTN007": "668", "CTN016": "1146",
        "PTN010": "1506", "CTN021": "1226", "CTN025": "1606", "ETN054": "1547",
        "ETN053": "1546", "ETN031": "646", "ETN032": "647", "ETN033": "766",
        "ETN037": "786", "ETN052": "1486", "CTN010": "926", "CTN024": "1526",
        "CTN023": "1527", "CTN009": "846", "ETN017": "329", "ETN007": "318",
        "ETN039": "1026", "ETN019": "332", "ETN009": "320", "ETN030": "468",
        "ETN050": "1366", "ETN040": "989", "ETN044": "1107", "ETN045": "1106",
        "ETN001": "312", "ETN011": "324", "ETN055": "1626", "ETN022": "526",
        "ETN020": "333", "ETN010": "321", "ETN029": "347", "ETN048": "1326",
        "ETN051": "1426", "ETN047": "1246", "ETN046": "1166", "ETN049": "1346",
        "ETN016": "328", "ETN006": "317", "ETN041": "966", "ETN013": "326",
        "ETN003": "314", "ETN024": "342", "ETN028": "345", "ETN027": "344",
        "ETN015": "327", "ETN005": "316", "ETN012": "325", "ETN002": "313",
        "ETN035": "807", "ETN034": "806", "ETN036": "808", "ETN018": "330",
        "ETN008": "319", "HCC003": "688", "HCC004": "689", "HCC001": "686",
        "HCC002": "687", "KT1001": "348", "KT1005": "352", "KT1006": "353",
        "KT1007": "354", "KT1003": "350", "KT1014": "360", "KT1015": "361",
        "KT1016": "362", "KT1002": "349", "KT1008": "322", "KT1009": "355",
        "KT1010": "356", "KT1004": "351", "KT1011": "357", "KT1012": "358",
        "KT1013": "359", "PTN012": "1267", "PTN003": "746", "PTN001": "337",
        "PTN005": "906", "PTN006": "907", "PTN009": "986", "PTN008": "946",
        "PTN004": "747", "PHBC02": "1006", "CTN006": "586", "TDT001": "364",
        "ETN021": "341", "TDT002": "338", "TDT004": "340", "TDT003": "339",
        "CTN008": "826", "PTN002": "546"
    };

    // Check if should show button
    const shouldShow =
        (record.cmsData === undefined || record.cmsData?.tickets?.length === 0);

    if (!shouldShow) return null;

    const fetchOrgInfo = async (code: string) => {
        if (code.length !== 6) {
            setOrgInfo(null);
            return;
        }

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

    const handleOpenModal = async () => {
        // Load CMS templates from Firebase
        chrome.runtime.sendMessage({
            event: 'CONTENTMY',
            type: 'GET_CMS_TEMPLATES',
            payload: {}
        }, (response) => {
            if (response?.status === 'success' && response.templates) {
                setTemplates(response.templates);
            }
        });

        // Auto-fetch CMS if not fetched yet
        if (record.cmsData === undefined) {
            message.loading({ content: 'Đang kiểm tra CMS...', key: 'fetch_cms', duration: 0 });

            const cmsData = await new Promise<any>((resolve) => {
                const timeout = setTimeout(() => resolve(null), 5000);
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "FETCH_CMS_DATA",
                    payload: { maVanDon: record.itemCode }
                }, (response) => {
                    clearTimeout(timeout);
                    resolve(response?.status === 'success' ? response.data : null);
                });
            });

            updateOrderState(record.orderHdrId, { cmsData });
            message.destroy('fetch_cms');

            if (cmsData?.tickets?.length > 0) {
                message.warning('Đơn hàng đã có ticket CMS');
                return;
            }
        }

        // Extract 6 digits from history address
        // Lấy address mới nhất có chứa 6 số, bỏ qua các log cuộc gọi
        const historyList = record.history?.orderStatusHistoryDtoList || [];
        let extracted = '';

        for (const historyItem of historyList) {
            const addressMatch = historyItem.address?.match(/(\d{6})/);
            if (addressMatch) {
                extracted = addressMatch[1];
                break; // Lấy cái đầu tiên tìm được (mới nhất)
            }
        }

        setDestOrgCode(extracted);
        if (extracted.length === 6) {
            fetchOrgInfo(extracted);
        }

        setModalOpen(true);
    };

    const handleCreateTicket = () => {
        if (!content.trim()) {
            message.warning('Vui lòng nhập nội dung');
            return;
        }

        Modal.confirm({
            title: 'Xác nhận tạo CMS',
            content: `Bạn có muốn tạo ticket ${ticketType === 'support' ? 'Hỗ Trợ' : 'Khiếu Nại'} cho đơn hàng ${record.itemCode}?`,
            onOk: async () => {
                setLoading(true);
                try {
                    // Calculate expiration date
                    const now = new Date();
                    const expirationDate = new Date(now);
                    expirationDate.setDate(expirationDate.getDate() + (ticketType === 'support' ? 1 : 7));
                    const expiration = `${String(expirationDate.getDate()).padStart(2, '0')}/${String(expirationDate.getMonth() + 1).padStart(2, '0')}/${expirationDate.getFullYear()}`;

                    // Get ttkSrvIdL3 from serviceCode mapping
                    const serviceCode = record.serviceCode || '';
                    const ttkSrvIdL3 = SERVICE_CODE_MAPPING[serviceCode] || "1206"; // Default to CTN020 if not found

                    const form = new FormData();
                    form.append("file", "");
                    form.append("type", "DVBC");

                    const troubleticketData = {
                        ttkType: "2",
                        ttkContactName: "Bưu cục Bồng Sơn 1",
                        ttkSource: "1",
                        ttkSeverity: "1",
                        ttkReason: ticketType === 'support' ? "134" : "534",
                        ttkContactNumber: "02563861718",
                        ttkContactEmail: "",
                        ttkContent: content,
                        accntCodeRef: "",
                        accntName: "",
                        accntMobile: "",
                        ttkSrvIdL2: "62",
                        ttkSrvIdL3: ttkSrvIdL3,
                        ttkExpiration: expiration,
                        ttkContactAddr: "",
                        accntAddr: "",
                        accntCode: "",
                        accntPostcode: "",
                        accntProvince: "",
                        accntDistrict: "",
                        accntWards: "",
                        accntEmail: "",
                        contactPostcode: "",
                        contactProvince: "",
                        contactDistrict: "",
                        contactWards: "",
                        accntAddrDetail: "",
                        ttkContactAddrDetail: "",
                        ttkSrvId: 1,
                        parcelId: record.itemCode,
                        postageData: {
                            parcelId: record.itemCode,
                            poAcc: "",
                            poName: "",
                            managerOrg: "",
                            poWeigh: "",
                            poRate: "",
                            poClassify: "",
                            poSenderName: "",
                            poSenderPhone: "",
                            poSenderAddress: "",
                            poSenderAddressDetail: "",
                            poReceiverName: "",
                            poReceiverPhone: "",
                            poReceiverAddress: "",
                            poReceiverAddressDetail: "",
                            poParcelDirection: "",
                            poSend: "",
                            poSendName: "",
                            poSenderEmail: "",
                            poStatus: "",
                            poMethod: ""
                        }
                    };

                    form.append(
                        "troubleticketData",
                        new Blob([JSON.stringify(troubleticketData)], { type: "application/json" })
                    );

                    const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/save", {
                        method: "POST",
                        body: form,
                        credentials: "include"
                    });

                    const result = await response.json();

                    if (result.result === true && result.code) {
                        message.success('✅ Tạo CMS thành công');
                        setModalOpen(false);
                        setContent('');

                        // Refresh CMS data
                        const cmsData = await new Promise<any>((resolve) => {
                            const timeout = setTimeout(() => resolve(null), 5000);
                            chrome.runtime.sendMessage({
                                event: "CONTENTMY",
                                type: "FETCH_CMS_DATA",
                                payload: { maVanDon: record.itemCode }
                            }, (response) => {
                                clearTimeout(timeout);
                                resolve(response?.status === 'success' ? response.data : null);
                            });
                        });
                        updateOrderState(record.orderHdrId, { cmsData });

                        // Ask for forwarding
                        if (destOrgCode && destOrgCode.length === 6) {
                            // Fetch org info
                            try {
                                const orgResponse = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${destOrgCode}`, {
                                    headers: {
                                        "accept": "*/*",
                                        "x-requested-with": "XMLHttpRequest"
                                    },
                                    method: "GET",
                                    mode: "cors",
                                    credentials: "include"
                                });

                                const orgData = await orgResponse.json();
                                if (orgData && orgData.length > 0) {
                                    const orgInfo = { orgCode: orgData[0].orgCode, name: orgData[0].name };

                                    Modal.confirm({
                                        title: 'Chuyển tiếp ticket',
                                        content: `Bạn có muốn chuyển tiếp ticket đến ${orgInfo.orgCode} - ${orgInfo.name}?`,
                                        onOk: async () => {
                                            try {
                                                const forwardForm = new FormData();

                                                forwardForm.append(
                                                    "dataOrg",
                                                    new Blob([
                                                        JSON.stringify([{
                                                            tempId: 72,
                                                            orgCode: orgInfo.orgCode,
                                                            orgName: `${orgInfo.orgCode} - ${orgInfo.name}`,
                                                            filename: "",
                                                            comment: content,
                                                            file: "",
                                                            type: 2,
                                                            number: 1
                                                        }])
                                                    ], { type: "application/json" })
                                                );

                                                forwardForm.append("ids", result.code);

                                                const forwardResponse = await fetch("https://cms.vnpost.vn/api/admin/complaints/change", {
                                                    method: "PUT",
                                                    body: forwardForm,
                                                    credentials: "include"
                                                });

                                                if (forwardResponse.ok) {
                                                    message.success('✅ Đã chuyển tiếp thành công');
                                                    // Refresh CMS again
                                                    const updatedCmsData = await new Promise<any>((resolve) => {
                                                        const timeout = setTimeout(() => resolve(null), 5000);
                                                        chrome.runtime.sendMessage({
                                                            event: "CONTENTMY",
                                                            type: "FETCH_CMS_DATA",
                                                            payload: { maVanDon: record.itemCode }
                                                        }, (response) => {
                                                            clearTimeout(timeout);
                                                            resolve(response?.status === 'success' ? response.data : null);
                                                        });
                                                    });
                                                    updateOrderState(record.orderHdrId, { cmsData: updatedCmsData });
                                                } else {
                                                    message.error('❌ Lỗi khi chuyển tiếp');
                                                }
                                            } catch (error) {
                                                console.error('Error forwarding:', error);
                                                message.error('❌ Lỗi khi chuyển tiếp');
                                            }
                                        }
                                    });
                                }
                            } catch (error) {
                                console.error('Error fetching org info:', error);
                            }
                        }
                    } else {
                        message.error('❌ Không thể tạo CMS');
                    }
                } catch (error) {
                    console.error('Error creating ticket:', error);
                    message.error('❌ Lỗi khi tạo CMS');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    return (
        <>
            <Button
                block
                size="small"
                icon={<PlusOutlined />}
                type="dashed"
                className="rounded-lg shadow-sm hover:shadow-md transition-all border-green-400 text-green-600"
                onClick={handleOpenModal}
            >
                ➕ Tạo CMS
            </Button>

            <Modal
                title={<span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-600">➕ Tạo CMS Ticket: {record.itemCode}</span>}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                width={600}
                className="modern-modal"
            >
                <div className="flex flex-col gap-4">
                    {/* Service Code Info */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Service Code</div>
                        <div className="font-bold text-blue-700">
                            {record.serviceCode || 'Không xác định'}
                            <span className="text-sm text-gray-500 ml-2">
                                (ttkSrvIdL3: {SERVICE_CODE_MAPPING[record.serviceCode || ''] || '1206'})
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="font-bold text-sm">Mã đơn vị (từ lịch sử)</label>
                        <Input
                            value={destOrgCode}
                            onChange={e => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setDestOrgCode(val);
                                if (val.length === 6) {
                                    fetchOrgInfo(val);
                                } else {
                                    setOrgInfo(null);
                                }
                            }}
                            maxLength={6}
                            placeholder="Nhập 6 số"
                            className="rounded-lg"
                        />
                        {orgInfo && (
                            <div className="text-xs text-green-600 mt-1">
                                ✓ {orgInfo.orgCode} - {orgInfo.name}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-sm">Loại ticket</label>
                        <Select
                            value={ticketType}
                            onChange={setTicketType}
                            className="w-full"
                            options={[
                                { value: 'support', label: '🆘 Hỗ Trợ (134, +1 ngày)' },
                                { value: 'complaint', label: '⚠️ Khiếu Nại (534, +7 ngày)' }
                            ]}
                        />
                    </div>

                    {templates.length > 0 && (
                        <div>
                            <label className="font-bold text-sm">Chọn mẫu nội dung</label>
                            <Select
                                placeholder="📋 Chọn mẫu có sẵn..."
                                className="w-full"
                                onChange={(value) => setContent(value.replace(/\\n/g, '\n'))}
                                allowClear
                            >
                                {templates.map((template, idx) => (
                                    <Select.Option key={idx} value={template}>
                                        {template.substring(0, 60)}{template.length > 60 ? '...' : ''}
                                    </Select.Option>
                                ))}
                            </Select>
                        </div>
                    )}

                    <div>
                        <label className="font-bold text-sm">Nội dung</label>
                        <TextArea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            rows={4}
                            placeholder="Nhập nội dung ticket..."
                            className="rounded-lg"
                        />
                    </div>

                    <Button
                        type="primary"
                        size="large"
                        block
                        onClick={handleCreateTicket}
                        loading={loading}
                        disabled={!content.trim()}
                        className="rounded-lg"
                    >
                        ✅ Tạo Ticket
                    </Button>
                </div>
            </Modal>
        </>
    );
};

const CMSTicketItem: React.FC<{ ticket: any; itemCode: string }> = ({ ticket, itemCode }) => {
    const [orgCode, setOrgCode] = useState('');
    const [orgInfo, setOrgInfo] = useState<{ orgCode: string; name: string } | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false)
    const [templates, setTemplates] = useState<string[]>([]);

    // Extract unit from last action
    const lastAction = ticket.actions?.[ticket.actions.length - 1];
    const unitMatch = lastAction?.unit?.match(/(\d{6})/);
    const defaultOrgCode = unitMatch?.[1] || '';

    // Check if ticket is closed (last action content contains "Đóng yêu cầu")
    const isTicketClosed = lastAction?.content?.includes('Đóng yêu cầu') || false;

    useEffect(() => {
        if (defaultOrgCode) {
            setOrgCode(defaultOrgCode);
            fetchOrgInfo(defaultOrgCode);
        }
    }, [defaultOrgCode]);
    // --- THÊM USEEFFECT MỚI ĐỂ LẤY TEMPLATES ---
    useEffect(() => {
        if (!isTicketClosed) {
            chrome.runtime.sendMessage({
                event: 'CONTENTMY',
                type: 'GET_CMS_TEMPLATES',
                payload: {}
            }, (response) => {
                if (response?.status === 'success' && response.templates) {
                    setTemplates(response.templates);
                }
            });
        }
    }, [isTicketClosed]);
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

            {/* Form chuyển tiếp - Ẩn nếu ticket đã đóng */}
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
            )}
        </div>
    );
};

export default Options;
