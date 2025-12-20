import { useState, useCallback } from 'react';
import { ExtendedOrder } from '../types/vnpost';

/**
 * Hook để manage detail modal state
 */
export const useDetailModal = () => {
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentDetailOrder, setCurrentDetailOrder] = useState<ExtendedOrder | null>(null);
    const [detailModalActiveTab, setDetailModalActiveTab] = useState<string>('1');

    /**
     * Open detail modal for specific order
     */
    const openDetailModal = useCallback((order: ExtendedOrder, tab: string = '1') => {
        setCurrentDetailOrder(order);
        setDetailModalActiveTab(tab);
        setDetailModalOpen(true);
    }, []);

    /**
     * Close detail modal
     */
    const closeDetailModal = useCallback(() => {
        setDetailModalOpen(false);
        setCurrentDetailOrder(null);
        setDetailModalActiveTab('1');
    }, []);

    /**
     * Switch tab in detail modal
     */
    const switchTab = useCallback((tab: string) => {
        setDetailModalActiveTab(tab);
    }, []);

    return {
        detailModalOpen,
        setDetailModalOpen,
        currentDetailOrder,
        setCurrentDetailOrder,
        detailModalActiveTab,
        setDetailModalActiveTab,
        openDetailModal,
        closeDetailModal,
        switchTab
    };
};
