import { update } from 'firebase/database';

// import { PDFDocument } from 'pdf-lib';
importScripts('pdf-lib.js');

declare const PDFLib: typeof import('pdf-lib');

// Hàm helper để chuyển đổi callback thành Promise
export function chromeStorageGet(key: string): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}
export const customSort = (a: string, b: string) => {
  // Lấy ký tự tại vị trí 8 và 9 (tức là index 7 và 8)
  const a89 = a.slice(9, 11);
  const b89 = b.slice(9, 11);

  // So sánh ký tự tại vị trí 8 và 9
  if (a89 < b89) return -1; // a đứng trước b
  if (a89 > b89) return 1;  // b đứng trước a

  // Nếu ký tự tại vị trí 8 và 9 giống nhau, so sánh ký tự thứ 7 (index 6)
  const a7 = a[6];
  const b7 = b[6];

  if (a7 < b7) return -1; // a đứng trước b
  if (a7 > b7) return 1;  // b đứng trước a

  return 0; // Không thay đổi thứ tự
};

export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}%2F${month}%2F${year}`;
}
export function formatDateRight(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}


export function toDateString(day: any) {
  const today = new Date();
  today.setDate(today.getDate() + parseInt(day));
  return formatDate(today);
}
export const convertBlobsToBlob = async (blobs: Blob[]): Promise<Blob> => {
  // Tạo một PDFDocument mới
  const newPdfDoc = await PDFLib.PDFDocument.create();

  for (let index = 0; index < blobs.length; index++) {
    const element = blobs[index];

    const pdfDoc = await PDFLib.PDFDocument.load(await pdfBlobToArrayBuffer(element));
    const pages = await newPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach((page) => newPdfDoc.addPage(page));
  }

  const pdfBytes = await newPdfDoc.save();
  const newBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  return newBlob;

}


export async function pdfBlobTo64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

export async function pdfBlobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}
interface BlobStruct {
  maHieu: string;
  blob: Blob;
  dateCreated: number; // Số miligiây kể từ Epoch (dùng new Date().getTime())
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createOrActiveTab = async (
  url: string,
  urlPrefix: string,
  isActive: boolean = false,
  isReload: boolean = true,
  isExactly: boolean = false
): Promise<chrome.tabs.Tab | undefined> => {
  const tabs = await chrome.tabs.query({});
  let currentTab: chrome.tabs.Tab | undefined;

  for (const tab of tabs) {
    const isRight = isExactly ? tab.url === urlPrefix : tab.url?.includes(urlPrefix);
    if (isRight) {
      if (isReload) {
        await chrome.tabs.update(tab.id!, { active: isActive, url });
      } else {
        await chrome.tabs.update(tab.id!, { active: isActive });
      }
      currentTab = tab;
      break;
    }
  }

  if (!currentTab) {
    currentTab = await chrome.tabs.create({ url, active: isActive });
  }

  return currentTab;
};

/**
 * Chờ một tab cụ thể tải xong sau khi một hành động được kích hoạt.
 * Resolve với đối tượng tab đã cập nhật hoặc reject khi hết thời gian chờ.
 * @param tabId ID của tab cần theo dõi.
 * @param originalUrl Optional: URL ban đầu của tab. Nếu được cung cấp, sẽ chờ status 'complete' VÀ URL thay đổi.
 * @param timeoutMs Thời gian chờ tối đa (ms).
 * @returns Promise<chrome.tabs.Tab>
 */
export function waitForTabLoadAfterAction(tabId: number, originalUrl?: string, timeoutMs: number = 30000): Promise<chrome.tabs.Tab> {
  console.log(`Đang chờ tab ${tabId} tải xong (Timeout: ${timeoutMs}ms)`);
  return new Promise((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | null = null
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      chrome.tabs.get(tabId, (currentTab) => {
        if (chrome.runtime.lastError) {
          //Tab co thể đã bị đóng
          cleanup()
          return reject(new Error(`Lỗi khi lấy chi tiết tab ${tabId}: ${chrome.runtime.lastError.message}`));
        }
        const currentUrl = currentTab?.url;
        console.log(`Tab ${tabId} chuyển sang trạng thái 'complete' tại URL: ${currentUrl}`);
        // Nếu originalUrl được cung cấp, phải đảm bảo URL đã thay đổi
        // HOẶC nếu không có originalUrl, chỉ cần 'complete' là đủ.
        if (!originalUrl || (currentUrl && currentUrl !== originalUrl && !currentUrl.includes('login'))) {
          console.log(`Tab ${tabId} đã tải xong và điều hướng thành công tới: ${currentUrl}`);
          cleanup();
          resolve(currentTab);
        } else if (currentUrl && currentUrl === originalUrl) {
          console.log(`Tab ${tabId} complete nhưng URL (${currentUrl}) chưa đổi so với ban đầu (${originalUrl}). Tiếp tục chờ...`);
          // Có thể trang login thực hiện AJAX mà không đổi URL, hoặc có lỗi.
          // Nếu kịch bản của bạn chắc chắn phải đổi URL, có thể reject ở đây sau một thời gian chờ ngắn nữa.
          // Hoặc nếu có thể không đổi URL mà vẫn thành công, thì resolve ở đây.
          // *** Tùy chỉnh logic này nếu cần ***
        } else if (currentUrl && currentUrl.includes('login')) {
          console.log(`Tab ${tabId} complete nhưng vẫn ở trang login (${currentUrl}). Có thể đăng nhập thất bại.`);
          // Không resolve/reject ngay, đợi timeout hoặc lần update tiếp theo
        }
      })
    }
    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      chrome.tabs.onUpdated.removeListener(listener);
      console.log(`Đã gỡ bỏ listener cho tab ${tabId}`);
    };

    // Thiết lập timeout
    timeoutHandle = setTimeout(() => {
      console.error(`Timeout khi chờ tab ${tabId} tải.`);
      cleanup();
      reject(new Error(`Hết thời gian chờ tab ${tabId} tải xong.`));
    }, timeoutMs);

    // Gắn listener
    chrome.tabs.onUpdated.addListener(listener);
    console.log(`Đã gắn listener onUpdated cho tab ${tabId}`);
  })
}

export const waitForTabToLoad = (tabId: number): Promise<chrome.tabs.Tab> => {
  console.log("Chờ tab tải xong", tabId);
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log("Tab đã tải xong", tabId);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
};

export function saveBlob(blobStruct: BlobStruct): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const openRequest: IDBOpenDBRequest = indexedDB.open("MyDatabase", 1);

    // Nếu database chưa tồn tại hoặc cần nâng cấp phiên bản
    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Kiểm tra nếu object store chưa tồn tại thì tạo mới
      if (!db.objectStoreNames.contains("blobs")) {
        const objectStore = db.createObjectStore("blobs", { keyPath: "maHieu" });
        // Tạo index cho trường dateCreated để query theo ngày
        objectStore.createIndex("dateCreatedIndex", "dateCreated", { unique: false });
      }
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction("blobs", "readwrite");
      const objectStore = transaction.objectStore("blobs");

      const putRequest = objectStore.put(blobStruct);
      putRequest.onsuccess = () => {
        resolve();
      };
      putRequest.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };

      transaction.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    };

    openRequest.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export function base64ToBlob(
  base64: string,
  contentType: string = "",
  sliceSize: number = 512
): Blob | null {
  if (base64 == null) {
    return null;
  }
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}