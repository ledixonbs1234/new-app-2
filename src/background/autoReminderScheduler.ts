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
 * @param force If true, bypass checks for enabled, time window, and last run date
 */
export async function checkAndRunAutoReminder(force: boolean = false): Promise<void> {
    try {
        const config = await getConfig();

        // Check if feature is enabled (skip if forced)
        if (!config.enabled && !force) {
            console.log('[Auto Reminder] Feature is disabled');
            return;
        }

        // Check if within time window (skip if forced)
        if (!isWithinTimeWindow(config) && !force) {
            console.log('[Auto Reminder] Not within time window');
            return;
        }

        // Check if already ran today (skip if forced)
        const today = getTodayDateString();
        if (config.lastRunDate === today && !force) {
            console.log('[Auto Reminder] Already ran today');
            return;
        }

        // Set Badge to RUN (Blue)
        chrome.action.setBadgeText({ text: 'RUN' });
        chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });

        await addLog(force ? '🚀 Bắt đầu chạy thủ công (Run Now)' : '🚀 Bắt đầu kiểm tra tự động');

        // Get orgCode from storage
        const orgCode = await new Promise<string>((resolve) => {
            chrome.storage.local.get(['orgCode'], (result) => {
                resolve(result.orgCode || '');
            });
        });

        if (!orgCode) {
            await addLog('❌ Không tìm thấy mã khách hàng. Vui lòng đăng nhập');
            return;
        }

        await addLog(`📋 Xử lý cho khách hàng: ${orgCode}`);

        // Run the auto reminder process
        const result = await processAutoReminder(orgCode);

        if (result.success) {
            // Set Badge to Count (Green)
            const countText = result.ordersProcessed !== undefined ? result.ordersProcessed.toString() : 'OK';
            chrome.action.setBadgeText({ text: countText });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

            await addLog(`✅ ${result.message}`);
            if (result.ordersProcessed !== undefined) {
                await addLog(`📦 Đã xử lý ${result.ordersProcessed} đơn hàng`);
            }

            // Update last run date
            config.lastRunDate = today;
            await saveConfig(config);

        } else {
            // Set Badge to ERR (Red)
            chrome.action.setBadgeText({ text: 'ERR' });
            chrome.action.setBadgeBackgroundColor({ color: '#F44336' });

            await addLog(`⚠️ ${result.message}`);
        }

        if (result.errors && result.errors.length > 0) {
            for (const error of result.errors) {
                await addLog(`❌ ${error}`);
            }
        }

        // Cleanup old data
        await cleanupExpiredLocks();
        await cleanupOldCompletions();

    } catch (error) {
        // Set Badge to ERR (Red)
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });

        console.error('[Auto Reminder] Error in checkAndRunAutoReminder:', error);
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
        console.log('[Auto Reminder] Alarm triggered, checking...');
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
