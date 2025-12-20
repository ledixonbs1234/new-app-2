/**
 * Chrome Message Service - Centralized chrome.runtime.sendMessage calls
 */

interface ChromeMessagePayload {
    event: string;
    type: string;
    payload?: any;
}

/**
 * Generic chrome message sender with promise wrapper
 */
const sendChromeMessage = (message: ChromeMessagePayload): Promise<any> => {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            resolve(response);
        });
    });
};

/**
 * Get CMS templates from Firebase
 */
export const getCMSTemplates = () => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'GET_CMS_TEMPLATES',
        payload: {}
    });
};

/**
 * Save CMS templates to Firebase
 */
export const saveCMSTemplates = (templates: string[]) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'SAVE_CMS_TEMPLATES',
        payload: { templates }
    });
};

/**
 * Get CMS auto-config list
 */
export const getCMSAutoConfigs = () => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'GET_CMS_AUTO_CONFIGS',
        payload: {}
    });
};

/**
 * Save CMS auto-config list
 */
export const saveCMSAutoConfigs = (configs: any[]) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'SAVE_CMS_AUTO_CONFIGS',
        payload: { configs }
    });
};

/**
 * Fetch CMS data for an order
 */
export const fetchCMSData = (maVanDon: string) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'FETCH_CMS_DATA',
        payload: { maVanDon }
    });
};

/**
 * Get extra info for an order
 */
export const getExtraInfo = (maVanDon: string) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'GET_EXTRA_INFO',
        payload: { maVanDon }
    });
};

/**
 * Update extra info for an order
 */
export const updateExtraInfo = (maVanDon: string, content: string) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'UPDATE_EXTRA_INFO',
        payload: { maVanDon, content }
    });
};

/**
 * Delete last line of extra info
 */
export const deleteLastLineExtraInfo = (maVanDon: string) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'DELETE_LAST_LINE_EXTRA_INFO',
        payload: { maVanDon }
    });
};

/**
 * Create CMS ticket
 */
export const createCMSTicket = (
    maVanDon: string,
    serviceCode: string,
    ticketType: 'support' | 'complaint',
    content: string
) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'CREATE_CMS_TICKET_V2',
        payload: {
            maVanDon,
            serviceCode,
            ticketType,
            content
        }
    });
};

/**
 * Forward CMS ticket
 */
export const forwardCMSTicket = (ticketId: string, dataOrgObj: any[]) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'FORWARD_CMS_TICKET',
        payload: {
            ticketId,
            dataOrgObj
        }
    });
};

/**
 * Close CMS ticket via message
 */
export const closeCMSTicket = (
    ticketId: string,
    ticketCode: string,
    reason: string = 'Đơn hàng đã phát thành công'
) => {
    return sendChromeMessage({
        event: 'CONTENTMY',
        type: 'CLOSE_CMS_TICKET',
        payload: {
            ticketId,
            ticketCode,
            reason
        }
    });
};

/**
 * Send message with timeout support
 */
export const sendChromeMessageWithTimeout = (
    message: ChromeMessagePayload,
    timeout: number = 10000
): Promise<any> => {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(null), timeout);
        chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        });
    });
};
