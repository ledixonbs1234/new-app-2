/**
 * Auto Reminder Scheduler - Daily alarm scheduler for auto reminder feature
 * Runs between 8:00 AM - 10:00 AM every day
 */
// Unused imports removed

interface AutoReminderConfig {
    enabled: boolean;
    startHour: number;
    endHour: number;
    lastRunDate?: string;
}

const DEFAULT_CONFIG: AutoReminderConfig = {
    enabled: false,
    startHour: 8,
    endHour: 10
};

const ALARM_NAME = 'auto-reminder-daily';
const CHECK_INTERVAL_MINUTES = 60; // Check every 60 minutes

/**
 * Get auto reminder configuration from storage
 */
async function getConfig(): Promise<AutoReminderConfig> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['autoReminderConfig'], (result) => {
            resolve(result.autoReminderConfig || DEFAULT_CONFIG);
        });
    });
}

/**
 * Save auto reminder configuration to storage
 */
async function saveConfig(config: AutoReminderConfig): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ autoReminderConfig: config }, () => {
            resolve();
        });
    });
}

/**
 * Check if current time is within the configured time window
 */
function isWithinTimeWindow(config: AutoReminderConfig): boolean {
    const now = new Date();
    const currentHour = now.getHours();

    return currentHour >= config.startHour && currentHour < config.endHour;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Add log entry to storage
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
                console.log(logEntry);
                resolve();
            });
        });
    });
}

/**
 * Helper function to fetch complaint data, extract IDs, and POST to receive
 * @param label Label for logging (e.g., "Type 1", "Type 2")
 * @param loadUrl URL to fetch HTML complaint data from
 * @returns Array of received IDs, or empty array if no data/error
 */
async function fetchAndReceiveComplaints(label: string, loadUrl: string, isLienQuan: boolean): Promise<number[]> {
    const loadHeaders = {
        "accept": "*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Microsoft Edge\";v=\"151\", \"Chromium\";v=\"151\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest"
    };

    // Bước 1: Fetch lấy dữ liệu HTML
    const response = await fetch(loadUrl, {
        method: 'GET',
        headers: loadHeaders,
        referrer: "https://hotrokhachhang.vnpost.vn/",
        mode: 'cors',
        credentials: 'include'
    });

    if (!response.ok) {
        console.error(`[Auto Reminder][${label}] Lỗi fetch load-data-waiting-assign: ${response.status} ${response.statusText}`);
        await addLog(`❌ [${label}] Lỗi fetch HTML (Status ${response.status}): ${response.statusText}`);
        return [];
    }

    const htmlText = await response.text();

    // Bước 2: Trích xuất danh sách ID
    const regex = /data-id="(\d+)"/g;
    const extractedIds: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(htmlText)) !== null) {
        const idNum = Number(match[1]);
        if (!isNaN(idNum) && !extractedIds.includes(idNum)) {
            extractedIds.push(idNum);
        }
    }

    if (extractedIds.length === 0) {
        console.log(`[Auto Reminder][${label}] Không có dữ liệu cần nhận`);
        await addLog(`[${label}] Không có dữ liệu cần nhận`);
        return [];
    }

    console.log(`[Auto Reminder][${label}] Trích xuất được ${extractedIds.length} ID:`, extractedIds);
    await addLog(`🔎 [${label}] Trích xuất được ${extractedIds.length} ID khiếu nại chờ giao: ${extractedIds.join(', ')}`);

    // Bước 3: Fetch thực hiện nhận yêu cầu (Receive)
    let success = false;
    let receiveResultText = "";

    // Ưu tiên gửi request qua tab hotrokhachhang.vnpost.vn đang mở để tránh triệt để lỗi 403 Forbidden do CORS/Cookie SameSite
    try {
        const tabs = await chrome.tabs.query({ url: "*://hotrokhachhang.vnpost.vn/*" });
        if (tabs.length > 0 && tabs[0].id) {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: async (idsToReceive: number[], isLienQuan: boolean) => {
                    try {
                        const receiveUrl = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/receive';
                        const formData = new FormData();
                        const jsonPayload = JSON.stringify({ ids: idsToReceive, relation: isLienQuan ? "true" : "false" });
                        const blobPayload = new Blob([jsonPayload], { type: 'application/json' });
                        formData.append("createUnitTicket", blobPayload, "blob");

                        const res = await fetch(receiveUrl, {
                            method: 'POST',
                            headers: {
                                "accept": "*/*",
                                "accept-language": "vi,en-US;q=0.9,en;q=0.8",
                                "x-requested-with": "XMLHttpRequest"
                            },
                            body: formData,
                            credentials: 'include'
                        });
                        const text = await res.text();
                        return { ok: res.ok, status: res.status, text };
                    } catch (err: any) {
                        return { ok: false, status: 0, text: err?.message || String(err) };
                    }
                },
                args: [extractedIds, isLienQuan]
            });

            if (results && results[0]?.result && results[0].result.ok) {
                success = true;
                receiveResultText = results[0].result.text;
                console.log(`[Auto Reminder][${label}] Gửi POST receive qua Tab thành công:`, receiveResultText);
            }
        }
    } catch (tabErr) {
        console.warn(`[Auto Reminder][${label}] Không thể gửi qua tab, chuyển sang fetch từ Background:`, tabErr);
    }

    if (!success) {
        const receiveUrl = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/receive';
        const formData = new FormData();
        const jsonPayload = JSON.stringify({ ids: extractedIds, relation: isLienQuan ? "true" : "false" });
        const blobPayload = new Blob([jsonPayload], { type: 'application/json' });

        formData.append("createUnitTicket", blobPayload, "blob");

        const receiveHeaders = {
            "accept": "*/*",
            "accept-language": "vi,en-US;q=0.9,en;q=0.8",
            "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Microsoft Edge\";v=\"151\", \"Chromium\";v=\"151\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest"
        };

        const receiveResponse = await fetch(receiveUrl, {
            method: 'POST',
            headers: receiveHeaders,
            referrer: "https://hotrokhachhang.vnpost.vn/",
            body: formData,
            mode: 'cors',
            credentials: 'include'
        });

        if (!receiveResponse.ok) {
            console.error(`[Auto Reminder][${label}] Lỗi POST receive: ${receiveResponse.status} ${receiveResponse.statusText}`);
            await addLog(`❌ [${label}] Lỗi POST receive (Status ${receiveResponse.status}): ${receiveResponse.statusText}`);
            return [];
        }

        receiveResultText = await receiveResponse.text();
    }

    console.log(`[Auto Reminder][${label}] Nhận khiếu nại thành công:`, receiveResultText);
    await addLog(`✅ [${label}] Nhận khiếu nại thành công cho ${extractedIds.length} ID`);

    return extractedIds;
}

/**
 * Main function to check and run auto reminder
 * Executing fetch requests for both type=1 and type=2 complaint data:
 * 1. GET complaint waiting assign data (HTML format) for each type
 * 2. Extract IDs from data-id="..." attributes
 * 3. POST extracted IDs payload as FormData Blob to receive complaints
 * @param force If true, bypass checks for enabled, time window (dùng cho nút bấm thủ công)
 * @param isLoginEvent If true: Được kích hoạt do đổi tài khoản/token (quan trọng cho multi-user)
 */
export async function checkAndRunAutoReminder(_force: boolean = false, _isLoginEvent: boolean = false): Promise<void> {
    try {
        console.log('[Auto Reminder] Bắt đầu kiểm tra và xử lý tự động khiếu nại...');

        // URL type=2: Sắp xếp theo ttkId
        const loadUrlType2 = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/load-data-waiting-assign?ttkSrvId=&ttkSrvIdL2=&ttkSrvIdL3=&ttkTypeLst=&ttkType=&reasonClassifications=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrgLst=&relationOrgLst=&searchInfoCode=&searchIsCompen=&ttkStatusLst=&searchIsComps=&ttkCustomerNumber=&accntTypes=&ttkContactNumber=&ttkContactEmail=&type=2&managedOrgLst=&managedUsrString=&ttkCodeRef=&managedOrgComplaintLst=&createdOrgComplaintLst=&ttkSourceLst=&assignStatus=0&actType=9&actResults=&pageIndex=1&pageSize=20&column=ttkId&desending=1&action=1';

        // URL type=1: Sắp xếp theo createdDate
        const loadUrlType1 = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/load-data-waiting-assign?ttkSrvId=&ttkSrvIdL2=&ttkSrvIdL3=&ttkTypeLst=&ttkType=&reasonClassifications=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrgLst=&relationOrgLst=&searchInfoCode=&searchIsCompen=&ttkStatusLst=&searchIsComps=&ttkCustomerNumber=&accntTypes=&ttkContactNumber=&ttkContactEmail=&type=1&managedOrgLst=&managedUsrString=&ttkCodeRef=&managedOrgComplaintLst=&createdOrgComplaintLst=&ttkSourceLst=&assignStatus=0&actType=9&actResults=&pageIndex=1&pageSize=20&column=createdDate&desending=1&action=1';

        // Xử lý type=2
        const idsType2 = await fetchAndReceiveComplaints('Type 2', loadUrlType2, true);

        // Xử lý type=1
        const idsType1 = await fetchAndReceiveComplaints('Type 1', loadUrlType1, false);

        // Tổng kết
        const totalIds = idsType2.length + idsType1.length;
        if (totalIds > 0) {
            await addLog(`📊 Tổng kết: Đã nhận ${totalIds} khiếu nại (Type 2: ${idsType2.length}, Type 1: ${idsType1.length})`);
        } else {
            await addLog(`📊 Tổng kết: Không có khiếu nại nào cần nhận`);
        }

    } catch (error) {
        console.error("[Auto Reminder] Lỗi trong quá trình xử lý auto reminder:", error);
        await addLog(`❌ Lỗi hệ thống: ${error}`);
    }
}

/**
 * Setup daily alarm for auto reminder
 */
export function setupDailyAlarm(): void {
    // Clear existing alarm first
    chrome.alarms.clear(ALARM_NAME, () => {
        // Create new alarm that fires every 15 minutes
        chrome.alarms.create(ALARM_NAME, {
            periodInMinutes: CHECK_INTERVAL_MINUTES
        });

        console.log(`[Auto Reminder] Alarm created: ${ALARM_NAME} (every ${CHECK_INTERVAL_MINUTES} minutes)`);
    });
}

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        checkAndRunAutoReminder();
    }
});

/**
 * Enable auto reminder feature
 */
export async function enableAutoReminder(): Promise<void> {
    const config = await getConfig();
    config.enabled = true;
    await saveConfig(config);
    setupDailyAlarm();
    await addLog('✅ Đã bật tính năng tự động');
}

/**
 * Disable auto reminder feature
 */
export async function disableAutoReminder(): Promise<void> {
    const config = await getConfig();
    config.enabled = false;
    await saveConfig(config);
    chrome.alarms.clear(ALARM_NAME);
    await addLog('⏸️ Đã tắt tính năng tự động');
}

/**
 * Update time window configuration
 */
export async function updateTimeWindow(startHour: number, endHour: number): Promise<void> {
    const config = await getConfig();
    config.startHour = startHour;
    config.endHour = endHour;
    await saveConfig(config);
    await addLog(`⏰ Đã cập nhật khung giờ: ${startHour}h - ${endHour}h`);
}

/**
 * Get current configuration
 */
export async function getAutoReminderConfig(): Promise<AutoReminderConfig> {
    return await getConfig();
}

/**
 * Get logs
 */
export async function getAutoReminderLogs(): Promise<string[]> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['autoReminderLogs'], (result) => {
            resolve(result.autoReminderLogs || []);
        });
    });
}

/**
 * Clear all logs
 */
export async function clearAutoReminderLogs(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ autoReminderLogs: [] }, () => {
            resolve();
        });
    });
}
