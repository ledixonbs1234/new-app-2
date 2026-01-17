/**
 * Auto Reminder Sync Service - Firebase synchronization for auto reminder feature
 * Manages locks and completion tracking to prevent conflicts between multiple users
 * 
 * NOTE: This file is used in background.ts which uses Firebase compat API (importScripts)
 * We cannot use modular Firebase imports here, must use global firebase object
 */

// No imports needed - we use the global firebase object from background.ts
declare var firebase: any;

interface LockData {
    locked: boolean;
    lockedBy: string;
    lockedAt: number;
    expiresAt: number;
}

interface CompletionData {
    completed: boolean;
    completedAt: number;
    processedBy: string;
    ordersProcessed: number;
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get current user ID from chrome storage
 */
async function getCurrentUserId(): Promise<string> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['orgCode'], (result) => {
            resolve(result.orgCode || 'unknown');
        });
    });
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
 * Acquire lock for processing a specific orgCode
 * Returns true if lock acquired successfully, false otherwise
 */
export async function acquireLock(orgCode: string, userId?: string): Promise<boolean> {
    try {
        const actualUserId = userId || await getCurrentUserId();

        // Use compat API: firebase.database().ref()
        const db = firebase.database();
        const lockRef = db.ref(`AUTO_REMINDER/LOCKS/${orgCode}`);

        // Get current lock state using compat API
        const snapshot = await lockRef.once('value');
        const currentLock = snapshot.val() as LockData | null;

        const now = Date.now();

        // Check if lock exists and is still valid
        if (currentLock && currentLock.locked) {
            // Check if lock has expired
            if (currentLock.expiresAt > now) {
                // Lock is still valid and held by someone else
                if (currentLock.lockedBy !== actualUserId) {
                    console.log(`Lock for ${orgCode} is held by ${currentLock.lockedBy}`);
                    return false;
                }
                // Lock is held by us, refresh it
                console.log(`Refreshing lock for ${orgCode}`);
            }
        }

        // Acquire or refresh lock
        const lockData: LockData = {
            locked: true,
            lockedBy: actualUserId,
            lockedAt: now,
            expiresAt: now + LOCK_TIMEOUT_MS
        };

        await lockRef.set(lockData);
        console.log(`Lock acquired for ${orgCode} by ${actualUserId}`);
        return true;

    } catch (error) {
        console.error('Error acquiring lock:', error);
        return false;
    }
}

/**
 * Release lock for a specific orgCode
 */
export async function releaseLock(orgCode: string, userId?: string): Promise<void> {
    try {
        const actualUserId = userId || await getCurrentUserId();
        const db = firebase.database();
        const lockRef = db.ref(`AUTO_REMINDER/LOCKS/${orgCode}`);

        // Verify we own the lock before releasing
        const snapshot = await lockRef.once('value');
        const currentLock = snapshot.val() as LockData | null;

        if (currentLock && currentLock.lockedBy === actualUserId) {
            await lockRef.remove();
            console.log(`Lock released for ${orgCode} by ${actualUserId}`);
        } else {
            console.warn(`Cannot release lock for ${orgCode} - not owned by ${actualUserId}`);
        }

    } catch (error) {
        console.error('Error releasing lock:', error);
    }
}

/**
 * Check if processing for this orgCode has been completed today
 */
export async function isCompletedToday(orgCode: string): Promise<boolean> {
    try {
        const dateStr = getTodayDateString();
        const db = firebase.database();
        const completionRef = db.ref(`AUTO_REMINDER/COMPLETED/${orgCode}/${dateStr}`);

        const snapshot = await completionRef.once('value');
        const completionData = snapshot.val() as CompletionData | null;

        return completionData?.completed === true;

    } catch (error) {
        console.error('Error checking completion status:', error);
        return false;
    }
}

/**
 * Mark processing as completed for this orgCode today
 */
export async function markAsCompleted(
    orgCode: string,
    userId: string,
    ordersProcessed: number
): Promise<void> {
    try {
        const dateStr = getTodayDateString();
        const db = firebase.database();
        const completionRef = db.ref(`AUTO_REMINDER/COMPLETED/${orgCode}/${dateStr}`);

        const completionData: CompletionData = {
            completed: true,
            completedAt: Date.now(),
            processedBy: userId,
            ordersProcessed
        };

        await completionRef.set(completionData);
        console.log(`Marked as completed for ${orgCode} on ${dateStr}`);

    } catch (error) {
        console.error('Error marking as completed:', error);
    }
}

/**
 * Cleanup expired locks across all orgCodes
 */
export async function cleanupExpiredLocks(): Promise<void> {
    try {
        const db = firebase.database();
        const locksRef = db.ref('AUTO_REMINDER/LOCKS');
        const snapshot = await locksRef.once('value');

        if (!snapshot.exists()) {
            return;
        }

        const locks = snapshot.val() as Record<string, LockData>;
        const now = Date.now();

        for (const [orgCode, lockData] of Object.entries(locks)) {
            if (lockData.expiresAt < now) {
                const lockRef = db.ref(`AUTO_REMINDER/LOCKS/${orgCode}`);
                await lockRef.remove();
                console.log(`Cleaned up expired lock for ${orgCode}`);
            }
        }

    } catch (error) {
        console.error('Error cleaning up expired locks:', error);
    }
}

/**
 * Cleanup old completion records (keep only last 7 days)
 */
export async function cleanupOldCompletions(): Promise<void> {
    try {
        const db = firebase.database();
        const completedRef = db.ref('AUTO_REMINDER/COMPLETED');
        const snapshot = await completedRef.once('value');

        if (!snapshot.exists()) {
            return;
        }

        const allCompletions = snapshot.val() as Record<string, Record<string, CompletionData>>;
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const cutoffDateStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

        for (const [orgCode, dates] of Object.entries(allCompletions)) {
            for (const dateStr of Object.keys(dates)) {
                if (dateStr < cutoffDateStr) {
                    const oldRef = db.ref(`AUTO_REMINDER/COMPLETED/${orgCode}/${dateStr}`);
                    await oldRef.remove();
                    console.log(`Cleaned up old completion record for ${orgCode} on ${dateStr}`);
                }
            }
        }

    } catch (error) {
        console.error('Error cleaning up old completions:', error);
    }
}

/**
 * Get lock status for a specific orgCode
 */
export async function getLockStatus(orgCode: string): Promise<LockData | null> {
    try {
        const db = firebase.database();
        const lockRef = db.ref(`AUTO_REMINDER/LOCKS/${orgCode}`);
        const snapshot = await lockRef.once('value');
        return snapshot.val() as LockData | null;
    } catch (error) {
        console.error('Error getting lock status:', error);
        return null;
    }
}

/**
 * Get CMS auto-configurations from Firebase
 */
export async function getFirebaseCMSAutoConfigs(): Promise<any[]> {
    try {
        const db = firebase.database();
        const configsRef = db.ref('CMS_AUTO_CONFIGS');
        const snapshot = await configsRef.once('value');
        return snapshot.val() || [];
    } catch (error) {
        console.error('Error fetching CMS auto configs from Firebase:', error);
        return [];
    }
}
