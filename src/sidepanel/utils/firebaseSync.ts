import { ref, onValue, get, remove, DataSnapshot } from "firebase/database";
import { db } from "../../popup/utils/firebaseConfig";
import { ImportedImage, StoredImage } from "../../types/vnpost";
import { saveImage, getAllImages, clearAllImages, deleteImage } from "./imageDB";

// Global sync lock to prevent concurrent syncs
let isSyncing = false;
let syncPromise: Promise<StoredImage[]> | null = null;
let pendingSyncRequest = false; // Flag to trigger re-sync after current completes

// Request deduplication cache (expires after 5 seconds)
const downloadCache = new Map<string, Promise<Blob>>();
const CACHE_DURATION = 5000;

/**
 * Lấy keyMessage từ chrome.storage.local
 */
async function getKeyMessage(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get("keyMessage", (result) => {
      resolve(result.keyMessage || "maychu");
    });
  });
}

/**
 * Tạo Firebase path động dựa trên keyMessage
 */
async function getFirebasePath(): Promise<string> {
  const keyMessage = await getKeyMessage();
  return `PORTAL/CHILD/${keyMessage}/imported_images`;
}

export interface SyncProgress {
  total: number;
  downloaded: number;
  failed: number;
  status: "idle" | "syncing" | "completed" | "error";
}

export interface SyncCallbacks {
  onProgress?: (progress: SyncProgress) => void;
  onImageDownloaded?: (image: StoredImage) => void; // Called after each image saved
}

/**
 * Fetch image metadata from Firebase Realtime Database
 */
export async function fetchImagesFromFirebase(): Promise<
  Record<string, ImportedImage>
> {
  const FIREBASE_PATH = await getFirebasePath();
  const imagesRef = ref(db, FIREBASE_PATH);

  return new Promise((resolve, reject) => {
    get(imagesRef)
      .then((snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          resolve(data as Record<string, ImportedImage>);
        } else {
          resolve({});
        }
      })
      .catch((error) => {
        reject(new Error(`Failed to fetch images: ${error.message}`));
      });
  });
}

/**
 * Download image blob from Firebase Storage URL with deduplication
 */
async function downloadImageBlob(url: string): Promise<Blob> {
  // Check cache first
  const cached = downloadCache.get(url);
  if (cached) {
    console.log(`[Download] Using cached request for: ${url.split('/').pop()}`);
    return cached;
  }

  // Create new download promise
  console.log(`[Download] Fetching: ${url.split('/').pop()}`);
  const downloadPromise = fetch(url).then(response => {
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    return response.blob();
  });

  // Cache the promise
  downloadCache.set(url, downloadPromise);

  // Remove from cache after duration
  setTimeout(() => {
    downloadCache.delete(url);
  }, CACHE_DURATION);

  return downloadPromise;
}

/**
 * Sync all images from Firebase to IndexedDB
 * Downloads all images and stores them locally
 * Updates existing images if timestamp changed
 * Progressive: Calls onImageDownloaded after each image is saved
 */
export async function syncAllImages(
  callbacks?: SyncCallbacks | ((progress: SyncProgress) => void)
): Promise<StoredImage[]> {
  // Handle backward compatibility - if callbacks is a function, treat as onProgress
  const { onProgress, onImageDownloaded } = typeof callbacks === 'function' 
    ? { onProgress: callbacks, onImageDownloaded: undefined }
    : (callbacks || {});

  // If sync in progress, queue a re-sync
  if (isSyncing && syncPromise) {
    console.log('[Sync] Sync in progress, queuing re-sync for after completion');
    pendingSyncRequest = true;
    return syncPromise; // Return current promise
  }

  isSyncing = true;
  syncPromise = performSync(onProgress, onImageDownloaded);

  try {
    const result = await syncPromise;
    
    // Check if there's a pending sync request
    if (pendingSyncRequest) {
      console.log('[Sync] Processing queued sync request');
      pendingSyncRequest = false;
      isSyncing = false;
      syncPromise = null;
      // Recursively call syncAllImages to process new data
      return syncAllImages({ onProgress, onImageDownloaded });
    }
    
    return result;
  } finally {
    isSyncing = false;
    syncPromise = null;
  }
}

/**
 * Internal sync implementation with concurrency control
 */
async function performSync(
  onProgress?: (progress: SyncProgress) => void,
  onImageDownloaded?: (image: StoredImage) => void
): Promise<StoredImage[]> {
  try {
    console.log('[Sync] Starting sync operation');
    // Fetch metadata from Firebase
    const imagesData = await fetchImagesFromFirebase();
    const imageIds = Object.keys(imagesData);

    // Get existing images from IndexedDB
    const existingImages = await getAllImages();
    const existingMap = new Map(existingImages.map(img => [img.imageId, img]));

    // Delete orphaned images (exist in IndexedDB but not in Firebase)
    const firebaseIds = new Set(imageIds);
    const orphanedImages = existingImages.filter(img => !firebaseIds.has(img.imageId));
    
    if (orphanedImages.length > 0) {
      console.log(`[Sync] Deleting ${orphanedImages.length} orphaned images from IndexedDB`);
      for (const orphaned of orphanedImages) {
        try {
          await deleteImage(orphaned.imageId);
          console.log(`[Sync] Deleted orphaned image: ${orphaned.imageId}`);
        } catch (err) {
          console.error(`[Sync] Failed to delete orphaned image ${orphaned.imageId}:`, err);
        }
      }
    }

    if (imageIds.length === 0) {
      onProgress?.({
        total: 0,
        downloaded: 0,
        failed: 0,
        status: "completed",
      });
      return [];
    }

    const progress: SyncProgress = {
      total: imageIds.length,
      downloaded: 0,
      failed: 0,
      status: "syncing",
    };

    onProgress?.(progress);

    // STEP 1: Save all metadata immediately (without blobs) for instant display
    console.log(`[Sync] Saving metadata for ${imageIds.length} images immediately...`);
    for (const imageId of imageIds) {
      const imageData = imagesData[imageId];
      const existingImage = existingMap.get(imageId);
      
      // Save metadata only (blob = undefined) if not already in IndexedDB
      if (!existingImage) {
        await saveImage(imageId, imageData, undefined);
        console.log(`[Sync] 💾 Saved metadata for ${imageId} (no blob yet)`);
      }
    }
    
    // Trigger UI update to show all thumbnails immediately
    if (onImageDownloaded) {
      onImageDownloaded({
        ...imagesData[imageIds[0]],
        imageId: imageIds[0],
      } as StoredImage);
    }
    console.log(`[Sync] ✅ All metadata saved, starting blob downloads...`);

    // STEP 2: Download and save blobs with concurrency control (max 3 concurrent downloads)
    const CONCURRENCY_LIMIT = 3;
    const results: StoredImage[] = [];
    
    // Process images in batches
    for (let i = 0; i < imageIds.length; i += CONCURRENCY_LIMIT) {
      const batch = imageIds.slice(i, i + CONCURRENCY_LIMIT);
      
      const batchPromises = batch.map(async (imageId) => {
        try {
          const imageData = imagesData[imageId];
          const existingImage = existingMap.get(imageId);

          // Check if we need to re-download
          const needsDownload = !existingImage || 
                                existingImage.timestamp !== imageData.timestamp ||
                                !existingImage.blob;

          let blob: Blob | undefined = existingImage?.blob;

          if (needsDownload) {
            console.log(`[Sync] Downloading image ${imageId} (${needsDownload ? 'new or updated' : 'refresh'})`);
            // Download blob from URL (with deduplication)
            blob = await downloadImageBlob(imageData.url);
          } else {
            console.log(`[Sync] Skipping download for ${imageId} (unchanged)`);
          }

          // Always save metadata (in case of updates)
          await saveImage(imageId, imageData, blob);

          progress.downloaded++;
          onProgress?.(progress);

          const savedImage = {
            ...imageData,
            imageId,
            blob,
          } as StoredImage;

          return savedImage;
        } catch (error) {
          console.error(`Failed to download image ${imageId}:`, error);
          progress.failed++;
          onProgress?.(progress);

          // Save metadata even if download failed
          await saveImage(imageId, imagesData[imageId]);

          return {
            ...imagesData[imageId],
            imageId,
          } as StoredImage;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Fire onImageDownloaded callback ONCE per batch (not per image)
      // This reduces re-renders significantly (e.g., 50 images = ~17 callbacks instead of 50)
      if (onImageDownloaded && batchResults.length > 0) {
        // Pass the last image in batch as representative
        onImageDownloaded(batchResults[batchResults.length - 1]);
      }
    }

    progress.status = "completed";
    onProgress?.(progress);

    return results;
  } catch (error) {
    console.error("Sync error:", error);
    onProgress?.({
      total: 0,
      downloaded: 0,
      failed: 0,
      status: "error",
    });
    throw error;
  }
}

/**
 * Listen for real-time updates from Firebase with debouncing
 */
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_DELAY = 1000; // 1 second debounce

export async function listenToFirebaseImages(
  callback: (images: Record<string, ImportedImage>) => void
): Promise<() => void> {
  const FIREBASE_PATH = await getFirebasePath();
  const imagesRef = ref(db, FIREBASE_PATH);

  const unsubscribe = onValue(imagesRef, (snapshot: DataSnapshot) => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce the callback to prevent rapid re-syncs
    debounceTimer = setTimeout(() => {
      if (snapshot.exists()) {
        console.log('[Firebase] Data changed, triggering callback (debounced)');
        callback(snapshot.val() as Record<string, ImportedImage>);
      } else {
        console.log('[Firebase] No data, triggering empty callback');
        callback({});
      }
      debounceTimer = null;
    }, DEBOUNCE_DELAY);
  });

  return () => {
    // Clean up debounce timer on unsubscribe
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribe();
  };
}

/**
 * Check if images need to be resynced
 * Compares Firebase data with IndexedDB
 */
export async function checkSyncStatus(): Promise<{
  needsSync: boolean;
  newImages: number;
}> {
  try {
    const [firebaseImages, localImages] = await Promise.all([
      fetchImagesFromFirebase(),
      getAllImages(),
    ]);

    const firebaseIds = new Set(Object.keys(firebaseImages));
    const localIds = new Set(localImages.map((img) => img.imageId));

    const newImageIds = [...firebaseIds].filter((id) => !localIds.has(id));

    return {
      needsSync: newImageIds.length > 0,
      newImages: newImageIds.length,
    };
  } catch (error) {
    console.error("Failed to check sync status:", error);
    return { needsSync: true, newImages: 0 };
  }
}

/**
 * Clear all images from both Firebase and IndexedDB
 * This is a destructive operation - use with caution
 */
export async function clearAllImagesFromFirebase(): Promise<void> {
  try {
    const FIREBASE_PATH = await getFirebasePath();
    const imagesRef = ref(db, FIREBASE_PATH);
    
    console.log(`[FirebaseSync] Clearing all images from path: ${FIREBASE_PATH}`);
    
    // Remove entire imported_images node from Firebase
    await remove(imagesRef);
    
    console.log("[FirebaseSync] Successfully cleared all images from Firebase");
    
    // Also clear local IndexedDB
    await clearAllImages();
    
    console.log("[FirebaseSync] Successfully cleared all images from IndexedDB");
  } catch (error) {
    console.error("[FirebaseSync] Failed to clear all images:", error);
    throw new Error(`Failed to clear all images: ${error instanceof Error ? error.message : String(error)}`);
  }
}
