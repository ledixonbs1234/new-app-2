/**
 * Auto Reminder Processor - Core logic for automated CMS reminder creation
 */

import { ExtendedOrder, OrderHistoryResponse } from '../types/vnpost';
import {
    acquireLock,
    releaseLock,
    isCompletedToday,
    markAsCompleted,
    getFirebaseCMSAutoConfigs
} from '../services/autoReminderSync';

/**
 * Add log entry to storage (Duplicated from autoReminderScheduler to avoid circular dependency)
 */
async function addLog(message: string): Promise<void> {
    const timestamp = new Date().toLocaleString('vi-VN');
    const logEntry = `[${timestamp}] ${message}`;

    return new Promise((resolve) => {
        chrome.storage.local.get(['autoReminderLogs'], (result) => {
            const logs = result.autoReminderLogs || [];
            logs.unshift(logEntry); // Add to beginning

            // Keep only last 50 logs
            const trimmedLogs = logs.slice(0, 50);

            chrome.storage.local.set({ autoReminderLogs: trimmedLogs }, () => {
                resolve();
            });
        });
    });
}

interface ProcessResult {
    success: boolean;
    message: string;
    ordersProcessed?: number;
    errors?: string[];
}

interface CMSAutoConfig {
    orgCode: string;
    customerName?: string;
    ticketType: 'support' | 'complaint';
    content: string;
}

/**
 * Helper: Lấy token trực tiếp từ tab my.vnpost.vn đang mở
 * Thay thế hoàn toàn việc đọc từ chrome.storage
 */
async function getPortalTokenFromTab(): Promise<string | null> {
    try {
        // 1. Tìm tất cả các tab my.vnpost.vn
        const tabs = await chrome.tabs.query({ url: "*://my.vnpost.vn/*" });

        if (tabs.length === 0 || !tabs[0].id) {
            return null;
        }

        const targetTabId = tabs[0].id;

        // 2. Tiêm script để đọc localStorage
        const results = await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: () => localStorage.getItem('accessToken')
        });

        // 3. Xử lý kết quả
        if (results && results[0] && results[0].result) {
            const token = results[0].result;
            return token;
        }

        return null;
    } catch (error) {
        console.error('[Auto Reminder] Lỗi khi lấy token từ tab:', error);
        return null;
    }
}
/**
 * Check if CMS and my.vnpost.vn are logged in
 */
async function checkLoginStatus(): Promise<{ cms: boolean; }> {
    try {
        // Check CMS login by trying to access a CMS endpoint
        const cmsCheck = await fetch("https://cms.vnpost.vn/api/admin/complaints/loadformadd?type=DVBC", {
            method: "GET",
            credentials: "include",
            headers: {
                "accept": "*/*",
                "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "x-requested-with": "XMLHttpRequest"
            },
            referrer: "https://cms.vnpost.vn/admin/complaints"
        });

        const cmsLoggedIn = cmsCheck.ok && !cmsCheck.url.includes('login');

        return { cms: cmsLoggedIn };

    } catch (error) {
        console.error('Error checking login status:', error);
        return { cms: false };
    }
}

/**
 * Fetch delivery orders (status 11, 12, 13) from my.vnpost.vn
 */
async function fetchDeliveryOrders(
    token: string,
    orgCode: string
): Promise<ExtendedOrder[] | null> {
    try {
        const targetStatus = ['11', '12', '13'];

        // Calculate date range (last 15 days to cover enough range)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 15);

        // Format date as YYYY-MM-DD HH:mm
        const formatDateTime = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        };

        const dateRange = [formatDateTime(startDate), formatDateTime(endDate)];

        // Use searchAllByParamV2 like fetchOrders in api.ts
        const url = `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchAllByParamV2?page=0&size=1000`;

        const payload = {
            orderType: '1',
            isInternational: '0',
            lstStatus: targetStatus,
            orgCode: [orgCode],
            toDateFromDate: dateRange
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
                'Capikey': '19001111'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Failed to fetch orders: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const orders = Array.isArray(data) ? data : [];

        // Reverse to match logic in useOrderData
        orders.reverse();



        return orders.map((order: any) => ({
            ...order,
            // Ensure status is present if needed, though OrderHdr should have it
        }));

    } catch (error) {
        console.error('Error fetching delivery orders:', error);
        return null;
    }
}

/**
 * CRITICAL: Check if order has NO CMS (not "unable to check")
 * This is the most important logic to prevent serious errors
 */
function hasNoCMS(order: ExtendedOrder): boolean {
    // Not loaded yet -> skip (don't process)
    if (order.cmsData === undefined) {
        return false;
    }

    // Error when checking -> skip (CRITICAL!)
    if (order.cmsData?.error === true) {
        return false;
    }

    // No CMS tickets -> TRUE (this is what we want)
    if (!order.cmsData?.tickets || order.cmsData.tickets.length === 0) {
        return true;
    }

    return false;
}

/**
 * Check order history for specific conditions
 * Must have: "Đã xác nhận đến phát" OR "Đang phát hàng"
 * Must NOT have: "Phát không thành công", "Phát hàng thành công", "chuyển hoàn"
 */
function checkOrderHistory(order: ExtendedOrder): boolean {
    const history = order.history?.orderStatusHistoryDtoList || [];

    if (history.length === 0) {
        return false;
    }

    let hasDeliveryStatus = false;
    let hasExcludedStatus = false;

    for (const item of history) {
        const statusLower = (item.statusText || '').toLowerCase();

        // Check for required status
        if (statusLower.includes('đã xác nhận đến phát') ||
            statusLower.includes('đang phát hàng')) {
            hasDeliveryStatus = true;
        }

        // Check for excluded status
        if (
            statusLower.includes('phát hàng thành công') ||
            statusLower.includes('chuyển hoàn')) {
            hasExcludedStatus = true;
            break; // No need to check further
        }
    }

    return hasDeliveryStatus && !hasExcludedStatus;
}

/**
 * Fetch CMS data for an order - Chỉnh sửa: Gọi trực tiếp API thay vì gửi Message
 */
async function fetchCMSDataForOrder(itemCode: string): Promise<any> {
    try {

        // 1. Tìm kiếm ticket theo mã vận đơn
        const searchUrl = `https://cms.vnpost.vn/api/admin/complaints/loaddatasearch?ttkSrvId=0&ttkSrvIdL2=0&ttkSrvIdL3=0&ttkType=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrg=&listRelationOrg=&relationOrg=&searchInfoCode=${itemCode}&searchIsCompen=&ttkStatus=0&searchIsCompensated=&searchIsComp=&searchComplaintCompUnit=&managedOrg=&managedUsr=&ttkCodeRef=&ttkContactNumber=&ttkContactEmail=&managedOrgComplaint=&createdOrgComplaint=&ttkSource=0&pageIndex=1&pageSize=20&column=ttkId&desending=1`;

        const searchResponse = await fetch(searchUrl, {
            method: "GET",
            credentials: "include", // Quan trọng để dùng cookie CMS đã đăng nhập
            headers: {
                "accept": "*/*",
                "x-requested-with": "XMLHttpRequest"
            }
        });

        if (!searchResponse.ok) return null;

        const searchHtml = await searchResponse.text();

        // Kiểm tra xem có phải trang login không (theo yêu cầu user: check id checkbox-signup)
        if (searchHtml.includes('checkbox-signup')) {
            return null;
        }

        if (searchHtml.includes("Chưa có dữ liệu trong hệ thống")) {
            return { tickets: [] };
        }

        // 2. Parse ID ticket từ HTML trả về (Dùng Regex vì không có DOMParser trong Background Worker)
        const tickets: any[] = [];
        const dataIdRegex = /data-id="(\d+)"/g;
        const uniqueIds = new Set<string>();
        let match;

        while ((match = dataIdRegex.exec(searchHtml)) !== null) {
            const ticketId = match[1];
            if (!uniqueIds.has(ticketId)) {
                uniqueIds.add(ticketId);
                tickets.push({ ticketId, ticketCode: `Ticket #${tickets.length + 1}`, actions: [] });
            }
        }

        if (tickets.length === 0) return { tickets: [] };

        // 3. Với mỗi ticket, lấy danh sách hành động (Actions)
        for (const ticket of tickets) {
            const actionsUrl = `https://cms.vnpost.vn/api/admin/complaints/gettticketaction/${ticket.ticketId}?pageIndex=1&pageSize=100&column=actId&desending=1`;
            const actionsRes = await fetch(actionsUrl, {
                method: "GET",
                credentials: "include",
                headers: { "x-requested-with": "XMLHttpRequest" }
            });

            if (actionsRes.ok) {
                const actionsHtml = await actionsRes.text();
                // Parse actions đơn giản từ HTML
                const actions: any[] = [];
                const trRegex = /<tr>\s*<td class="text-center">\s*(\d+)\s*<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/gs;
                let aMatch;
                while ((aMatch = trRegex.exec(actionsHtml)) !== null) {
                    actions.push({
                        content: aMatch[4].trim().replace(/<[^>]*>/g, ""),
                        date: aMatch[2].trim()
                    });
                }
                ticket.actions = actions;
            }
        }

        return { hasData: true, tickets };

    } catch (error) {
        console.error(`[Auto Reminder] Error fetching CMS for ${itemCode}:`, error);
        return null;
    }
}

/**
 * Fetch order history
 */
async function fetchOrderHistory(itemCode: string, token: string): Promise<OrderHistoryResponse | null> {
    try {
        const response = await fetch(
            `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderTemplate/historynew?itemCode=${itemCode}`,
            {
                headers: {
                    'Authorization': token,
                    'Capikey': '19001111'
                }
            }
        );

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching history for ${itemCode}:`, error);
        return null;
    }
}


// Bảng mapping dịch vụ (copy từ background.ts)
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
    "CTN008": "826", "PTN002": "546", "DEFAULT": "1206"
};

/**
 * TẠO VÀ CHUYỂN TIẾP CMS HỐI PHÁT TRỰC TIẾP (Bypass messaging)
 */
async function createReminderCMS(order: ExtendedOrder, cmsAutoConfigs: CMSAutoConfig[]): Promise<boolean> {
    try {
        // Tìm cấu hình theo senderCode
        const config = cmsAutoConfigs.find(cfg => cfg.orgCode === order.senderCode);
        let content = config ? config.content : ("Hỗ trợ phát gấp đơn hàng " + order.itemCode + " .Cảm ơn");

        // Count safeguard (keeping existing logic)
        // if (countLapCMS < 20) {
        // countLapCMS++;
        // Removed hardcoded content append logic here


        // --- BƯỚC 0: XÁC ĐỊNH BƯU CỤC ĐÍCH TỪ LỊCH SỬ ---
        const historyList = order.history?.orderStatusHistoryDtoList || [];
        let destOrgCode = '';
        // Tìm mã 6 số cuối cùng trong cột địa chỉ của lịch sử
        for (const historyItem of historyList) {
            const addressMatch = historyItem.address?.match(/(\d{6})/);
            if (addressMatch) {
                destOrgCode = addressMatch[1];
                break;
            }
        }

        if (!destOrgCode) {
            console.warn(`[Auto Reminder] Không tìm thấy bưu cục đích cho đơn ${order.itemCode}`);
            // Bạn có thể chọn dừng lại hoặc vẫn tạo ticket nhưng không forward
        }

        // --- BƯỚC 1: TẠO TICKET MỚI (CREATE) ---
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 1); // Support +1 ngày
        const expiration = `${String(expirationDate.getDate()).padStart(2, '0')}/${String(expirationDate.getMonth() + 1).padStart(2, '0')}/${expirationDate.getFullYear()}`;
        const ttkSrvIdL3 = SERVICE_CODE_MAPPING[order.serviceCode || ''] || SERVICE_CODE_MAPPING["DEFAULT"];

        const troubleticketData = {
            ttkType: "2",
            ttkContactName: "Bưu cục Bồng Sơn 1",
            ttkSource: "1",
            ttkSeverity: "1",
            ttkReason: "134",
            ttkContactNumber: "02563861718",
            ttkContactEmail: "",
            ttkContent: content,
            accntCodeRef: "", accntName: "", accntMobile: "",
            ttkSrvIdL2: "62",
            ttkSrvIdL3: ttkSrvIdL3,
            ttkExpiration: expiration,
            ttkContactAddr: "", accntAddr: "", accntCode: "", accntPostcode: "",
            accntProvince: "", accntDistrict: "", accntWards: "", accntEmail: "",
            contactPostcode: "", contactProvince: "", contactDistrict: "", contactWards: "",
            accntAddrDetail: "", ttkContactAddrDetail: "",
            ttkSrvId: 1,
            parcelId: order.itemCode,
            postageData: {
                parcelId: order.itemCode,
                poAcc: "", poName: "", managerOrg: "", poWeigh: "", poRate: "",
                poClassify: "", poSenderName: "", poSenderPhone: "", poSenderAddress: "",
                poSenderAddressDetail: "", poReceiverName: "", poReceiverPhone: "",
                poReceiverAddress: "", poReceiverAddressDetail: "", poParcelDirection: "",
                poSend: "", poSendName: "", poSenderEmail: "", poStatus: "", poMethod: ""
            }
        };

        const createForm = new FormData();
        createForm.append("type", "DVBC");
        createForm.append("troubleticketData", new Blob([JSON.stringify(troubleticketData)], { type: "application/json" }));

        const createRes = await fetch("https://cms.vnpost.vn/api/admin/complaints/save", {
            method: "POST",
            body: createForm,
            credentials: "include"
        });

        const createResult = await createRes.json();

        if (createResult.result !== true || !createResult.code) {
            console.error(`[Auto Reminder] Lỗi tạo CMS cho ${order.itemCode}:`, createResult.message);
            return false;
        }

        const ticketCode = createResult.code; // Đây là mã ticket vừa tạo (VD: ttkId)
        console.log(`[Auto Reminder] ✅ Đã tạo ticket ${ticketCode} cho đơn ${order.itemCode}`);

        // --- BƯỚC 2: CHỜ HỆ THỐNG ĐỒNG BỘ (DELAY 3S) ---
        await new Promise(resolve => setTimeout(resolve, 3000));

        // --- BƯỚC 3: CHUYỂN TIẾP (FORWARD) NẾU CÓ BƯU CỤC ĐÍCH ---
        if (destOrgCode) {
            // 3.1 Lấy thông tin tên bưu cục đích
            const orgRes = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${destOrgCode}`, {
                credentials: "include",
                headers: { "x-requested-with": "XMLHttpRequest" }
            });
            const orgData = await orgRes.json();

            if (orgData && orgData.length > 0) {
                const orgInfo = { orgCode: orgData[0].orgCode, name: orgData[0].name };

                // 3.2 Gửi lệnh chuyển tiếp (giống logic trong handleForward)
                const dataOrgObj = [{
                    tempId: 72,
                    orgCode: orgInfo.orgCode,
                    orgName: `${orgInfo.orgCode} - ${orgInfo.name}`,
                    filename: "",
                    comment: content,
                    file: "",
                    type: 2,
                    number: 1
                }];

                const forwardForm = new FormData();
                forwardForm.append("dataOrg", new Blob([JSON.stringify(dataOrgObj)], { type: "application/json" }));
                forwardForm.append("ids", ticketCode);

                const forwardRes = await fetch("https://cms.vnpost.vn/api/admin/complaints/change", {
                    method: "PUT",
                    body: forwardForm,
                    credentials: "include"
                });

                const forwardResult = await forwardRes.json();
                if (forwardResult.result === true) {
                } else {
                }
            }
            return true;
        }
        // }

        return true; // Trả về true vì ít nhất bước tạo đã thành công

    } catch (error) {
        return false;
    }
}

/**
 * Main processing function
 */
export async function processAutoReminder(orgCode: string): Promise<ProcessResult> {


    // 2. Try to acquire lock
    const lockAcquired = await acquireLock(orgCode);
    if (!lockAcquired) {
        return {
            success: false,
            message: 'Đang được xử lý bởi user khác, vui lòng chờ'
        };
    }

    try {
        // 3. Check login status
        const loginStatus = await checkLoginStatus();

        if (!loginStatus.cms) {
            return {
                success: false,
                message: 'Chưa đăng nhập CMS. Vui lòng đăng nhập tại https://cms.vnpost.vn'
            };
        }

        // 4. Get token from storage
        const token = await new Promise<string>((resolve) => {
            chrome.storage.local.get(['accessToken'], (result) => {
                resolve(result.accessToken || '');
            });
        });

        if (!token) {
            return {
                success: false,
                message: 'Không tìm thấy token. Vui lòng đăng nhập lại'
            };
        }

        // 5. Fetch delivery orders
        const orders = await fetchDeliveryOrders(token, orgCode);

        // Fetch CMS Auto Configs from Firebase (Sync across devices)
        const cmsAutoConfigs = await getFirebaseCMSAutoConfigs();

        if (orders === null) {
            // Error case (network or auth)
            return {
                success: false,
                message: 'Lỗi khi lấy danh sách đơn hàng (API Error)'
            };
        }

        if (orders.length === 0) {

            await markAsCompleted(orgCode, orgCode, 0);
            return {
                success: true,
                message: 'Không có đơn hàng nào đang phát',
                ordersProcessed: 0
            };
        }

        await addLog(`🔎 Tìm thấy ${orders.length} đơn hàng đang phát (Status 11,12,13)`);

        // 6. Fetch CMS data and history for all orders

        // --- CACHE & PROBE LOGIC START ---

        // Load cache
        const cacheResult = await new Promise<any>((resolve) =>
            chrome.storage.local.get('ordersCache', resolve)
        );
        const ordersCache = cacheResult.ordersCache || {};
        let cacheUpdated = false;

        // Helper to get history with cache
        const getHistoryWithCache = async (order: ExtendedOrder): Promise<any> => {
            const cached = ordersCache[order.orderHdrId];
            if (cached && cached.history && cached.lastUpdated && (Date.now() - cached.lastUpdated < 3 * 60 * 60 * 1000)) {
                return cached.history;
            }
            const history = await fetchOrderHistory(order.itemCode, token);
            if (history) {
                if (!ordersCache[order.orderHdrId]) ordersCache[order.orderHdrId] = {};
                ordersCache[order.orderHdrId].history = history;
                ordersCache[order.orderHdrId].lastUpdated = Date.now();
                cacheUpdated = true;
            }
            return history;
        };

        // ** PROBE Step **: Check first order to see if CMS is accessible
        // ** PROBE Step **: Verify CMS session matches user request (check admin/home for login redirect)
        console.log(`[Auto Reminder] Probing CMS session via admin/home...`);
        try {
            const probeRes = await fetch("https://cms.vnpost.vn/admin/home", {
                method: "GET",
                credentials: "include",
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8"
                }
            });

            // Check URL redirect
            if (probeRes.url.toLowerCase().includes("login")) {
                console.warn('[Auto Reminder] CMS Probe: Redirected to Login.');
                return {
                    success: false,
                    message: 'CMS chưa đăng nhập (Redirected to Login). Dừng xử lý.'
                };
            }

            // Check content for login indicators
            const probeHtml = await probeRes.text();
            if (probeHtml.includes("checkbox-signup") || probeHtml.includes("Đăng nhập hệ thống")) {
                console.warn('[Auto Reminder] CMS Probe: Found login form content.');
                return {
                    success: false,
                    message: 'CMS chưa đăng nhập (Tìm thấy form đăng nhập). Dừng xử lý.'
                };
            }

        } catch (error) {
            console.warn('[Auto Reminder] CMS Probe: Network error.', error);
            return {
                success: false,
                message: 'Không thể kết nối CMS (Probe Error). Dừng xử lý.'
            };
        }

        const ordersWithData: ExtendedOrder[] = await Promise.all(
            orders.map(async (order) => {
                const [cmsData, historyResult] = await Promise.all([
                    fetchCMSDataForOrder(order.itemCode),
                    getHistoryWithCache(order)
                ]);

                return {
                    ...order,
                    cmsData,
                    history: historyResult ?? undefined
                } as ExtendedOrder;
            })
        );

        // Save cache if updated
        if (cacheUpdated) {
            chrome.storage.local.set({ ordersCache: ordersCache });
        }

        // --- CACHE & PROBE LOGIC END ---

        // 7. Filter orders
        console.log('[Auto Reminder] Filtering orders...');

        const eligibleOrders: ExtendedOrder[] = [];

        for (const order of ordersWithData) {
            // Check CMS
            if (!hasNoCMS(order)) {
                // Uncomment to log existing CMS skips if needed, but might be spammy
                // console.log(`[Skip] ${order.itemCode} has CMS or error`);
                continue;
            }

            // Check History
            if (checkOrderHistory(order)) {
                eligibleOrders.push(order);
            } else {
                // Log reason for rejection
                const history = order.history?.orderStatusHistoryDtoList || [];
                let reason = '';

                if (history.length === 0) {
                    reason = 'Không lấy được lịch sử';
                } else {
                    // Quick analysis of why it failed
                    const statusTexts = history.map(h => (h.statusText || '').toLowerCase());
                    const hasDelivery = statusTexts.some(s => s.includes('đã xác nhận đến phát') || s.includes('đang phát hàng'));
                    const hasExcluded = statusTexts.some(s => s.includes('phát hàng thành công') || s.includes('chuyển hoàn'));

                    if (hasExcluded) reason = 'Đã phát thành công/Chuyển hoàn';
                    else if (!hasDelivery) reason = 'Chưa có trạng thái Đang phát/Đến phát';
                    else reason = 'Không thỏa mãn điều kiện lịch sử';

                    // Log details for debugging
                    const lastStatus = history[0]?.statusText || 'N/A';
                    reason += ` (Cuối: ${lastStatus})`;
                }

                await addLog(`⛔ Bỏ qua ${order.itemCode}: ${reason}`);
            }
        }

        console.log(`[Auto Reminder] Found ${eligibleOrders.length} eligible orders`);



        if (eligibleOrders.length === 0) {
            await markAsCompleted(orgCode, orgCode, 0);
            return {
                success: true,
                message: 'Không có đơn hàng nào thỏa mãn điều kiện',
                ordersProcessed: 0
            };
        }

        // 9. Create CMS for eligible orders
        console.log('[Auto Reminder] Creating CMS tickets...');
        const results = await Promise.all(
            eligibleOrders.map(async (order) => {
                const success = await createReminderCMS(order, cmsAutoConfigs);
                if (success) {
                    // console.log(`[Auto Reminder] ✅ Đã lập CMS hối hàng của đơn ${order.itemCode}`);
                }
                return { order, success };
            })
        );

        const successCount = results.filter(r => r.success).length;
        const errors = results
            .filter(r => !r.success)
            .map(r => `Lỗi khi tạo CMS cho ${r.order.itemCode}`);

        // 10. Mark as completed
        await markAsCompleted(orgCode, orgCode, successCount);

        return {
            success: true,
            message: `Đã hoàn thành! Tạo CMS thành công cho ${successCount}/${eligibleOrders.length} đơn hàng`,
            ordersProcessed: successCount,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (error) {
        console.error('[Auto Reminder] Error during processing:', error);
        return {
            success: false,
            message: `Lỗi khi xử lý: ${error}`
        };
    } finally {
        // Always release lock
        await releaseLock(orgCode);
    }
}
