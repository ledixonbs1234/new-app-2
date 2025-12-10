import { StoredImage } from "../../types/vnpost";

const DB_NAME = "ImagePanelDB";
const DB_VERSION = 1;
const STORE_IMAGES = "images";
const STORE_METADATA = "metadata";

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize and open IndexedDB database
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create images object store
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const imagesStore = db.createObjectStore(STORE_IMAGES, {
          keyPath: "imageId",
        });
        imagesStore.createIndex("timestamp", "timestamp", { unique: false });
        imagesStore.createIndex("maHieu", "maHieu", { unique: false });
      }

      // Create metadata object store for app state
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: "key" });
      }
    };
  });
}

/**
 * Save image with blob to IndexedDB
 */
export async function saveImage(
  imageId: string,
  imageData: Omit<StoredImage, "imageId">,
  blob?: Blob
): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_IMAGES], "readwrite");
    const store = transaction.objectStore(STORE_IMAGES);

    const data: StoredImage = {
      imageId,
      ...imageData,
      blob,
    };

    const request = store.put(data);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error(`Failed to save image: ${request.error}`));
  });
}

/**
 * Get all images sorted by timestamp
 */
export async function getAllImages(): Promise<StoredImage[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_IMAGES], "readonly");
    const store = transaction.objectStore(STORE_IMAGES);
    const index = store.index("timestamp");

    const request = index.openCursor(null, "next");
    const images: StoredImage[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        images.push(cursor.value);
        cursor.continue();
      } else {
        resolve(images);
      }
    };

    request.onerror = () =>
      reject(new Error(`Failed to get images: ${request.error}`));
  });
}

/**
 * Get single image by ID
 */
export async function getImage(imageId: string): Promise<StoredImage | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_IMAGES], "readonly");
    const store = transaction.objectStore(STORE_IMAGES);
    const request = store.get(imageId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () =>
      reject(new Error(`Failed to get image: ${request.error}`));
  });
}

/**
 * Delete all images from IndexedDB
 */
export async function clearAllImages(): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_IMAGES], "readwrite");
    const store = transaction.objectStore(STORE_IMAGES);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error(`Failed to clear images: ${request.error}`));
  });
}

/**
 * Delete a single image by imageId
 */
export async function deleteImage(imageId: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_IMAGES], "readwrite");
    const store = transaction.objectStore(STORE_IMAGES);
    const request = store.delete(imageId);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error(`Failed to delete image ${imageId}: ${request.error}`));
  });
}

/**
 * Save metadata (selected index, panel width, etc.)
 */
export async function saveMetadata(key: string, value: any): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_METADATA], "readwrite");
    const store = transaction.objectStore(STORE_METADATA);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new Error(`Failed to save metadata: ${request.error}`));
  });
}

/**
 * Get metadata
 */
export async function getMetadata(key: string): Promise<any> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_METADATA], "readonly");
    const store = transaction.objectStore(STORE_METADATA);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () =>
      reject(new Error(`Failed to get metadata: ${request.error}`));
  });
}

/**
 * Create object URL from blob and revoke previous ones
 */
export function createImageObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke object URL to free memory
 */
export function revokeImageObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}
