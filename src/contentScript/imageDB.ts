/**
 * IndexedDB utilities for Image Panel
 * Stores image data and zoom presets
 */

import { UploadedImage, ImageZoomSettings, ZoomPreset, FieldGroup } from '../types/imagePanel';

const DB_NAME = 'ImagePanelDB';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';
const ZOOM_SETTINGS_STORE = 'zoomSettings';

class ImageDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    // Return early if already initialized
    if (this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create images store
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          const imagesStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'url' });
          imagesStore.createIndex('qrCode', 'qrCode', { unique: false });
          imagesStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: false });
        }

        // Create zoom settings store
        if (!db.objectStoreNames.contains(ZOOM_SETTINGS_STORE)) {
          const zoomStore = db.createObjectStore(ZOOM_SETTINGS_STORE, { keyPath: 'id' });
          zoomStore.createIndex('imageUrl', 'imageUrl', { unique: false });
          zoomStore.createIndex('fieldGroup', 'fieldGroup', { unique: false });
          zoomStore.createIndex('qrCode', 'qrCode', { unique: false });
        }
      };
    });
  }

  async saveImages(images: UploadedImage[]): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IMAGES_STORE], 'readwrite');
      const store = transaction.objectStore(IMAGES_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      images.forEach(image => {
        store.put(image);
      });
    });
  }

  async getImages(): Promise<UploadedImage[]> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IMAGES_STORE], 'readonly');
      const store = transaction.objectStore(IMAGES_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const images = request.result as UploadedImage[];
        // Sort by sequence number
        images.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        resolve(images);
      };
    });
  }

  async getImageByQrCode(qrCode: string): Promise<UploadedImage | null> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IMAGES_STORE], 'readonly');
      const store = transaction.objectStore(IMAGES_STORE);
      const index = store.index('qrCode');
      const request = index.get(qrCode);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveZoomSetting(setting: ImageZoomSettings): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ZOOM_SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(ZOOM_SETTINGS_STORE);

      // Create unique ID from imageUrl and fieldGroup
      const id = `${setting.imageUrl}_${setting.fieldGroup}`;
      const record = { ...setting, id };

      const request = store.put(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getZoomSetting(imageUrl: string, fieldGroup: FieldGroup): Promise<ZoomPreset | null> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ZOOM_SETTINGS_STORE], 'readonly');
      const store = transaction.objectStore(ZOOM_SETTINGS_STORE);
      const id = `${imageUrl}_${fieldGroup}`;
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.preset : null);
      };
    });
  }

  async getZoomSettingByQrCode(qrCode: string, fieldGroup: FieldGroup): Promise<ZoomPreset | null> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ZOOM_SETTINGS_STORE], 'readonly');
      const store = transaction.objectStore(ZOOM_SETTINGS_STORE);
      const index = store.index('qrCode');
      const request = index.openCursor(IDBKeyRange.only(qrCode));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          if (record.fieldGroup === fieldGroup) {
            resolve(record.preset);
            return;
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };
    });
  }

  async clearImages(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IMAGES_STORE], 'readwrite');
      const store = transaction.objectStore(IMAGES_STORE);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearZoomSettings(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([ZOOM_SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(ZOOM_SETTINGS_STORE);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteImagesByUrls(urls: string[]): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([IMAGES_STORE, ZOOM_SETTINGS_STORE], 'readwrite');
      const imagesStore = transaction.objectStore(IMAGES_STORE);
      const zoomStore = transaction.objectStore(ZOOM_SETTINGS_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      urls.forEach(url => {
        // Delete image
        imagesStore.delete(url);

        // Delete associated zoom settings
        const index = zoomStore.index('imageUrl');
        const request = index.openCursor(IDBKeyRange.only(url));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      });
    });
  }
}

export const imageDB = new ImageDB();
