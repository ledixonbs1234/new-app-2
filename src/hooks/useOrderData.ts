import { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { message } from 'antd';
import { ExtendedOrder, OrderHdr } from '../types/vnpost';
import { fetchOrders, fetchOrderDetails, fetchOrderHistory, searchOrderByItemCode } from '../services/api';
import { fetchCMSData, getExtraInfo } from '../services/chromeMessage';

/**
 * Hook để manage order data, fetching, và caching
 */
export const useOrderData = () => {
    const [orders, setOrders] = useState<ExtendedOrder[]>([]);
    const [loading, setLoading] = useState(false);

    /**
     * Fetch orders từ API với filters
     */
    const handleFetchOrders = useCallback(
        async (
            token: string,
            orgCode: string,
            statusList: string[],
            dateRange: [dayjs.Dayjs, dayjs.Dayjs]
        ) => {
            if (!token || !orgCode) {
                message.error('Vui lòng nhập Token và OrgCode trong cài đặt');
                return;
            }

            const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD HH:mm');
            const dateRangeParam: [string, string] = [fmt(dateRange[0]), fmt(dateRange[1])];

            setLoading(true);
            try {
                const data: OrderHdr[] = await fetchOrders(token, orgCode, statusList, dateRangeParam);
                data.reverse();

                // Load từ cache
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
                return extendedOrders;

            } catch (error) {
                console.error(error);
                message.error('Lỗi khi tải danh sách đơn hàng');
            } finally {
                setLoading(false);
            }
        },
        []
    );

    /**
     * Fetch single order by item code
     */
    const handleFetchSingleOrder = useCallback(
        async (
            itemCode: string,
            token: string,
            orgCode: string,
            senderInfo?: { name: string; code: string }
        ) => {
            if (!token || !orgCode) {
                message.error('Vui lòng cấu hình Token và OrgCode trước');
                return null;
            }

            message.loading({ content: `🔍 Đang tìm kiếm ${itemCode}...`, key: 'single_search', duration: 0 });

            try {
                // Step 1: Search for orderHdrId
                const searchRes = await searchOrderByItemCode(itemCode, token);

                if (!searchRes?.orderHdrId) {
                    message.error({ content: '❌ Không tìm thấy mã vận đơn này', key: 'single_search' });
                    return null;
                }

                // Check orgCode matches
                if (searchRes.orgCode !== orgCode) {
                    message.warning({
                        content: `⚠️ Đơn hàng này không thuộc về khách hàng ${senderInfo?.name || orgCode}`,
                        key: 'single_search',
                        duration: 5
                    });
                    return null;
                }

                message.loading({ content: '📦 Đang tải thông tin chi tiết...', key: 'single_search', duration: 0 });

                // Step 2: Fetch full detail
                const orderData: OrderHdr = await fetchOrderDetails(searchRes.orderHdrId, token);

                // Step 3: Fetch history, extraInfo, cmsData in parallel
                const [historyData, extraInfo, cmsData] = await Promise.all([
                    fetchOrderHistory(itemCode, token).catch(() => null),
                    getExtraInfo(itemCode).then(res => res?.status === 'success' ? res.data : '').catch(() => ''),
                    fetchCMSData(itemCode).then(res => res?.status === 'success' ? res.data : null).catch(() => null)
                ]);

                // Step 4: Create extended order object
                const newOrder: ExtendedOrder = {
                    ...orderData,
                    detail: orderData as any,
                    history: historyData,
                    extraInfo: extraInfo,
                    cmsData: cmsData,
                    lastUpdated: Date.now(),
                    loading: false
                };

                message.success({
                    content: `✅ Đã tìm thấy đơn hàng ${itemCode}`,
                    key: 'single_search'
                });

                return newOrder;

            } catch (error) {
                console.error('Error in single item search:', error);
                message.error({
                    content: '❌ Lỗi khi tìm kiếm mã vận đơn',
                    key: 'single_search'
                });
                return null;
            }
        },
        []
    );

    /**
     * Update order state in local state
     */
    const updateOrderState = useCallback((orderHdrId: string, updates: Partial<ExtendedOrder>) => {
        setOrders(prev =>
            prev.map(order =>
                order.orderHdrId === orderHdrId
                    ? { ...order, ...updates, lastUpdated: Date.now() }
                    : order
            )
        );
    }, []);

    /**
     * Clear orders cache
     */
    const handleClearCache = useCallback(() => {
        chrome.storage.local.remove('ordersCache', () => {
            message.success('Đã xóa cache');
            handleFetchOrders;
        });
    }, [handleFetchOrders]);

    return {
        orders,
        setOrders,
        loading,
        handleFetchOrders,
        handleFetchSingleOrder,
        updateOrderState,
        handleClearCache
    };
};
