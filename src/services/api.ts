/**
 * API Service - Centralized HTTP requests to VNPost APIs
 */

const BASE_API = 'https://api-pre-my.vnpost.vn/myvnp-web/v1';
const CMS_API = 'https://cms.vnpost.vn/api/admin';
const CAPIKEY = '19001111';

/**
 * Get account settings (token + orgCode)
 */
export const fetchAccountSettings = async (token: string) => {
    const response = await fetch(`${BASE_API}/Account/getAccountSetting`, {
        headers: {
            'authorization': token,
            'capikey': CAPIKEY
        },
        method: 'GET',
        mode: 'cors',
        credentials: 'include'
    });
    return response.json();
};

/**
 * Search for order by item code
 */
export const searchOrderByItemCode = async (itemCode: string, token: string) => {
    const response = await fetch(
        `${BASE_API}/OrderHdr/searchByOrderCodeOrItemCode?searchValue=${itemCode}`,
        {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Capikey': CAPIKEY
            },
            mode: 'cors',
            credentials: 'include'
        }
    );
    return response.json();
};

/**
 * Get full order details by orderHdrId
 */
export const fetchOrderDetails = async (orderHdrId: string, token: string) => {
    const response = await fetch(
        `${BASE_API}/OrderHdr/${orderHdrId}`,
        {
            headers: {
                'Authorization': token,
                'Capikey': CAPIKEY
            },
            mode: 'cors',
            credentials: 'include'
        }
    );
    return response.json();
};

/**
 * Get order tracking history
 */
export const fetchOrderHistory = async (itemCode: string, token: string) => {
    const response = await fetch(
        `${BASE_API}/OrderTemplate/historynew?itemCode=${itemCode}`,
        {
            headers: {
                'Authorization': token,
                'Capikey': CAPIKEY
            }
        }
    );
    return response.json();
};

/**
 * Fetch multiple orders with filters
 */
export const fetchOrders = async (
    token: string,
    orgCode: string,
    statusList: string[],
    dateRange: [string, string]
) => {
    const response = await fetch(
        `${BASE_API}/OrderHdr/searchAllByParamV2?page=0&size=1000`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
                'Capikey': CAPIKEY
            },
            body: JSON.stringify({
                orderType: '1',
                isInternational: '0',
                lstStatus: statusList,
                orgCode: [orgCode],
                toDateFromDate: dateRange
            })
        }
    );
    return response.json();
};

/**
 * Save CMS close result (first step in 2-step process)
 */
export const saveCMSCloseResult = async (
    token: string,
    ticketId: string,
    reason: string
) => {
    const formData = new FormData();
    formData.append('ticketId', ticketId);
    formData.append('reason', reason);

    const response = await fetch(
        `https://cms.vnpost.vn/api/admin/supportticket/saveResult`,
        {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Capikey': CAPIKEY
            },
            body: formData,
            mode: 'cors',
            credentials: 'include'
        }
    );
    return response;
};

/**
 * Change CMS ticket status (second step in 2-step close process)
 */
export const changeCMSTicketStatus = async (
    token: string,
    ticketId: string,
    newStatus: string
) => {
    const params = new URLSearchParams();
    params.append('ticketId', ticketId);
    params.append('status', newStatus);

    const response = await fetch(
        `https://cms.vnpost.vn/api/admin/supportticket/change-status?${params.toString()}`,
        {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Capikey': CAPIKEY
            },
            mode: 'cors',
            credentials: 'include'
        }
    );
    return response;
};

/**
 * Check organization by org code
 */
export const checkOrgCode = async (code: string) => {
    const response = await fetch(
        `${CMS_API}/organization/autocompleteall/change/${code}`,
        {
            headers: { 'accept': '*/*', 'x-requested-with': 'XMLHttpRequest' },
            method: 'GET',
            mode: 'cors',
            credentials: 'include'
        }
    );
    return response.json();
};
