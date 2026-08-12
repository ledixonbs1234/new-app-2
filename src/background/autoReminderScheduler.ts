/**
 * Auto Reminder Scheduler - Daily alarm scheduler for auto reminder feature
 * Runs between 8:00 AM - 10:00 AM every day
 */

import { processAutoReminder } from './autoReminderProcessor';
import { cleanupExpiredLocks, cleanupOldCompletions } from '../services/autoReminderSync';

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
const CHECK_INTERVAL_MINUTES = 15; // Check every 15 minutes

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
 * Main function to check and run auto reminder
 * Executing 2 sequential HTTP fetch requests:
 * 1. GET complaint waiting assign data (HTML format)
 * 2. Extract IDs from data-id="..." attributes
 * 3. POST extracted IDs payload as FormData Blob to receive complaints
 * @param force If true, bypass checks for enabled, time window (dùng cho nút bấm thủ công)
 * @param isLoginEvent If true: Được kích hoạt do đổi tài khoản/token (quan trọng cho multi-user)
 */
export async function checkAndRunAutoReminder(force: boolean = false, isLoginEvent: boolean = false): Promise<void> {
    try {
        console.log('[Auto Reminder] Bắt đầu kiểm tra và xử lý tự động khiếu nại...');

        // Bước 1: Fetch lấy dữ liệu HTML
        const loadUrl = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/load-data-waiting-assign?ttkSrvId=&ttkSrvIdL2=&ttkSrvIdL3=&ttkTypeLst=&ttkType=&reasonClassifications=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrgLst=&relationOrgLst=&searchInfoCode=&searchIsCompen=&ttkStatusLst=&searchIsComps=&ttkCustomerNumber=&accntTypes=&ttkContactNumber=&ttkContactEmail=&type=2&managedOrgLst=&managedUsrString=&ttkCodeRef=&managedOrgComplaintLst=&createdOrgComplaintLst=&ttkSourceLst=&assignStatus=0&actType=9&actResults=&pageIndex=1&pageSize=20&column=ttkId&desending=1&action=1';

        const loadHeaders = {
            "accept": "*/*",
            "accept-language": "vi,en-US;q=0.9,en;q=0.8",
            "x-requested-with": "XMLHttpRequest"
        };

        const response = await fetch(loadUrl, {
            method: 'GET',
            headers: loadHeaders,
            credentials: 'include'
        });

        if (!response.ok) {
            console.error(`[Auto Reminder] Lỗi fetch load-data-waiting-assign: ${response.status} ${response.statusText}`);
            await addLog(`❌ Lỗi fetch HTML (Status ${response.status}): ${response.statusText}`);
            return;
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
            console.log("Không có dữ liệu cần nhận");
            await addLog("Không có dữ liệu cần nhận");
            return;
        }

        console.log(`[Auto Reminder] Trích xuất được ${extractedIds.length} ID:`, extractedIds);
        await addLog(`🔎 Trích xuất được ${extractedIds.length} ID khiếu nại chờ giao: ${extractedIds.join(', ')}`);

        // Bước 3: Fetch thực hiện nhận yêu cầu (Receive)
        const receiveUrl = 'https://hotrokhachhang.vnpost.vn/api/admin/complaints/receive';

        const formData = new FormData();
        const jsonPayload = JSON.stringify({ ids: extractedIds, relation: "true" });
        const blobPayload = new Blob([jsonPayload], { type: 'application/json' });

        formData.append("createUnitTicket", blobPayload, "blob");

        const receiveHeaders = {
            "accept": "*/*",
            "accept-language": "vi,en-US;q=0.9,en;q=0.8",
            "x-requested-with": "XMLHttpRequest"
        };

        const receiveResponse = await fetch(receiveUrl, {
            method: 'POST',
            headers: receiveHeaders,
            body: formData,
            credentials: 'include'
        });

        if (!receiveResponse.ok) {
            console.error(`[Auto Reminder] Lỗi POST receive: ${receiveResponse.status} ${receiveResponse.statusText}`);
            await addLog(`❌ Lỗi POST receive (Status ${receiveResponse.status}): ${receiveResponse.statusText}`);
            return;
        }

        const receiveResult = await receiveResponse.text();
        console.log("[Auto Reminder] Nhận khiếu nại thành công:", receiveResult);
        await addLog(`✅ Nhận khiếu nại thành công cho ${extractedIds.length} ID`);

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
