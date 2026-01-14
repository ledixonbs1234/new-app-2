importScripts("firebase-app-compat.js", "firebase-database-compat.js");
importScripts("xlsxtool.js");
import {
  BuuGuiProps,
  DataSnapshotProps,
  KhachHangProps,
} from "../states/states";
import { NguoiGuiDetailProp, NguoiGuiProp } from "./PopupInfo";
import {
  base64ToBlob,
  chromeStorageGet,
  convertBlobsToBlob,
  customSort,
  formatDateRight,
  pdfBlobTo64,
  saveBlob,
  toDateString,
  waitForTabLoadAfterAction,
} from "./util";
import { delay, createOrActiveTab } from "./util";
import {
  saveImage,
  getAllImages,
  deleteImage,
  initDB
} from "../sidepanel/utils/imageDB";
import { ImportedImage } from "../types/vnpost";
// import firebase from 'firebase/compat/app';
//day la ban moi nhat
// Khai báo biến toàn cục từ importScripts để TypeScript nhận diện
declare var XLSX: any;
declare var firebase: any; // Khai báo firebase

// Auto Reminder Scheduler imports
import {
  setupDailyAlarm,
  checkAndRunAutoReminder,
  enableAutoReminder,
  disableAutoReminder,
  updateTimeWindow,
  getAutoReminderConfig,
  getAutoReminderLogs,
  clearAutoReminderLogs
} from './autoReminderScheduler';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAs9RtsXMRPeD5vpORJcWLDb1lEJZ3nUWI",
  authDomain: "xonapp.firebaseapp.com",
  databaseURL:
    "https://xonapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xonapp",
  storageBucket: "xonapp.appspot.com",
  messagingSenderId: "892472148061",
  appId: "1:892472148061:web:f22a5c4ffd25858726cdb4",
};
// --- THÊM: Biến global lưu Key AI ---
let currentGeminiKey: string = "";
// Key mặc định (Backup)
const DEFAULT_GEMINI_KEY = "AIzaSyDRDPaTCetuCfzjuqvJjcG1sMhmB2aIVzE";
const GEMINI_API_KEY_ALT = "AIzaSyAreyNgXS6sF-fvFNMB8jGITmii2P5b-rA";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
let ref: firebase.database.Reference | null = null;
let refPing: firebase.database.Reference | null = null;
let refScannedItems: firebase.database.Reference | null = null; // Listener mới

let db: firebase.database.Database | null = null;
let keyMessage: string = "maychu";
let TimeStampTemp: string = "";
let token: string = "";
let accountPortal: string = "";
let passwordPortal: string = "";
let buuCuc = "";
let aiKeysData: any = {}; // Cache dữ liệu để trả về ngay khi popup mở
console.log("Background script is running");

// --- TRẠNG THÁI CỤC BỘ (Sử dụng type BuuGuiProps đã import) ---
/**
 * @description Danh sách đầy đủ các đối tượng BuuGuiProps được quét gần nhất từ Firebase.
 * Đây là "nguồn chân lý" (source of truth) về những gì người dùng muốn xử lý.
 * Type: BuuGuiProps[] (mảng các đối tượng BuuGuiProps)
 */
let allScannedItems: BuuGuiProps[] = [];

/**
 * @description Tập hợp (Set) chứa các MaBuuGui (dạng string) đã được xử lý thành công
 * bởi content script VÀ *vẫn còn tồn tại* trong danh sách `allScannedItems` tại thời điểm
 * nhận được callback thành công.
 * Việc chỉ lưu MaBuuGui giúp kiểm tra sự tồn tại nhanh hơn (O(1)).
 * Yêu cầu: Không xóa item khỏi đây ngay cả khi nó bị xóa khỏi `allScannedItems` sau đó.
 * Type: Set<string>
 */
let processedItems = new Set<string>();

/**
 * @description Hàng đợi (Queue - First In First Out) chứa các MaBuuGui (dạng string)
 * đang chờ được gửi đến content script để xử lý.
 * Các item được thêm vào đây khi `allScannedItems.length` vượt quá `BUFFER_SIZE`
 * hoặc khi có lệnh xử lý phần còn lại.
 * Type: string[]
 */
let processingQueue: string[] = [];

/**
 * @description Lưu trữ MaBuuGui (dạng string) của item đang được content script
 * xử lý. Giá trị là `null` nếu không có item nào đang được xử lý.
 * Giúp ngăn chặn việc gửi nhiều item cùng lúc đến content script.
 * Type: string | null
 */
let currentItemBeingProcessed: string | null = null;

/**
 * @description Cờ (flag) báo hiệu quy trình xử lý tự động đã bị dừng do gặp lỗi
 * không thể phục hồi từ content script hoặc lỗi hệ thống nghiêm trọng.
 * Khi cờ này là `true`, background script sẽ không thêm item mới vào hàng đợi
 * hoặc gửi item đi xử lý nữa.
 * Type: boolean
 */
let isStoppedOnError: boolean = false;

/**
 * @description Cờ (flag) báo hiệu người dùng đã gửi lệnh cuối cùng ("Hoàn tất & In").
 * Khi cờ này là `true`, `triggerProcessingCheck` sẽ đưa *tất cả* các item
 * chưa xử lý vào hàng đợi (thay vì chỉ đưa vào khi vượt BUFFER_SIZE).
 * Sau khi queue rỗng, cờ này sẽ kích hoạt việc in ấn.
 * Type: boolean
 */
let isFinalProcessingTriggered: boolean = false;
const BUFFER_SIZE = 5;

// --- STATE MỚI CHO PORTAL SIDEPANEL ---
// Lưu danh sách items đang được xử lý trong phiên "sendautotoportal"
export interface PortalItemStatus {
  MaBuuGui: string;
  Status: "pending" | "processing" | "success" | "error";
  Message?: string;
  Money?: string;
  Index: number;
}
// Biến toàn cục lưu trạng thái danh sách
let currentPortalList: PortalItemStatus[] = [];
// --- CONTEXT VARIABLES ---
let currentMaKH: string = "";
let currentOptions: any = {};
let currentIsDeletePhone: boolean = false;
let currentBgs: BuuGuiProps[] = []; // Store full list
// -------------------------
// --- KẾT THÚC TRẠNG THÁI CỤC BỘ MỚI ---

// --- HELPER FUNCTIONS CHO SIDEPANEL (Moved to top) ---

// Hàm cập nhật trạng thái 1 item và broadcast
function updatePortalItemStatus(maBuuGui: string, status: "pending" | "processing" | "success" | "error", msg?: string) {
  const idx = currentPortalList.findIndex(x => x.MaBuuGui === maBuuGui);
  if (idx !== -1) {
    currentPortalList[idx].Status = status;
    if (msg) currentPortalList[idx].Message = msg;
    broadcastPortalListUpdate();
  }
}

function updatePortalItemMoney(maBuuGui: string, money: string) {
  const idx = currentPortalList.findIndex(x => x.MaBuuGui === maBuuGui);
  if (idx !== -1) {
    currentPortalList[idx].Money = money;
    broadcastPortalListUpdate();
  }
}

function removePortalItem(maBuuGui: string) {
  const idx = currentPortalList.findIndex(x => x.MaBuuGui === maBuuGui);
  if (idx !== -1) {
    currentPortalList.splice(idx, 1);
    broadcastPortalListUpdate();
  }
}
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.selectedAiKey) {
    currentGeminiKey = changes.selectedAiKey.newValue;
    console.log("[BG] Updated Gemini Key:", currentGeminiKey ? "Custom Key Loaded" : "Default");
  }
});
// Hàm gửi tin nhắn cho tất cả các SidePanel đang mở
function broadcastPortalListUpdate() {
  // Gửi runtime message, SidePanel sẽ lắng nghe
  chrome.runtime.sendMessage({
    type: "PORTAL_LIST_UPDATED",
    data: currentPortalList
  }).catch(() => { }); // Bỏ qua lỗi nếu không có receiver
}

// Hàm xử lý chạy lại 1 item từ Panel (tái sử dụng logic cũ)
async function handleExecuteSingleItemFromPanel(maBuuGui: string) {
  // 1. Phải lấy lại thông tin chi tiết từ Firebase vì currentPortalList chỉ có mã
  // Tuy nhiên để tối ưu, ta có thể fetch 1 item đó thôi.
  // Hoặc đơn giản là lấy `maKH` đang lưu trong storage
  try {
    // Mock maKH nếu không có hàm chromeStorageGet
    let maKH = "";
    try {
      // @ts-ignore
      maKH = await chromeStorageGet("currentMaKH");
    } catch (e) { maKH = "UNK"; }

    // Lấy data item từ Firebase
    const snapshot = await db!.ref("PORTAL/BuuGuis/").get();
    const rawVal = snapshot.val();
    const bgs: BuuGuiProps[] = rawVal ? JSON.parse(rawVal) : [];
    const item = bgs.find(x => x.MaBuuGui === maBuuGui);

    if (!item) {
      console.error(`Item ${maBuuGui} not found in Firebase`);
      return;
    }

    updatePortalItemStatus(maBuuGui, "processing");

    // Tìm tab active
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      // Gửi lệnh process single
      chrome.tabs.sendMessage(tabs[0].id, {
        message: "PROCESS_SINGLE_ITEM",
        current: item,
        makh: maKH,
        keyMessage: "panel_retry",
        isDeletePhone: false
      });
    }
  } catch (e: any) {
    console.error(e);
    updatePortalItemStatus(maBuuGui, "error", "Exception in BG");
  }
}

async function handleExecuteFromItem(maBuuGui: string, sendResponse: (res: any) => void) {
  try {
    if (!currentMaKH) {
      sendResponse({ status: "error", error: "Chưa có context (MaKH). Hãy chạy lệnh từ App trước." });
      return;
    }

    // 1. Use stored list
    const bgs = currentBgs;

    if (!bgs || bgs.length === 0) {
      sendResponse({ status: "error", error: "Không tìm thấy dữ liệu đã lưu." });
      return;
    }

    // 2. Find start index
    const startIndex = bgs.findIndex(item => item.MaBuuGui === maBuuGui);
    if (startIndex === -1) {
      sendResponse({ status: "error", error: "Không tìm thấy mã bưu gửi này." });
      return;
    }

    sendResponse({ status: "processing" });

    console.log(`[BG] Resuming processing from index ${startIndex} (${maBuuGui})...`);

    // --- Custom Loop Implementation ---
    let shouldStop = false;
    for (let i = startIndex; i < bgs.length; i++) {
      if (shouldStop) break;
      const item = bgs[i];

      updatePortalItemStatus(item.MaBuuGui, "processing");

      try {
        // Find tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        let tabId = tabs[0]?.id;

        // If active tab is not portal, try to find one? 
        // Or just rely on active tab being correct as user clicked "Run" from panel which is attached to window?
        // Safer to find portal tab if possible, or assume active if user is on it.
        if (!tabId) {
          // Try finding by url
          const portalTabs = await chrome.tabs.query({ url: "https://portalkhl.vnpost.vn/*" });
          if (portalTabs.length > 0) tabId = portalTabs[0].id;
        }

        if (!tabId) {
          throw new Error("Không tìm thấy tab Portal.");
        }

        // Send message
        await new Promise<void>((resolve, reject) => {
          chrome.tabs.sendMessage(tabId!, {
            message: "PROCESS_SINGLE_ITEM",
            current: item,
            makh: currentMaKH,
            keyMessage: keyMessage,
            options: currentOptions,
            isDeletePhone: currentIsDeletePhone
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response && response.status === 'success') {
              updatePortalItemStatus(item.MaBuuGui, "success");
              // Optional: Handle refresh logic here if needed, but user didn't ask for it explicitly.
              // If user wants exact same logic as processPortalListLoop minus the function call, I should include refresh.
              // But user said "chỉ muốn bắt đầu vòng lặp for với PROCESS_SINGLE_ITEM". I will keep it simple.
              resolve();
            } else {
              updatePortalItemStatus(item.MaBuuGui, "error", response?.error || "Unknown error");
              // Continue or stop? Usually stop on error or continue?
              // processPortalListLoop continues on item error but stops on loop error.
              // Let's continue for item error.
              shouldStop = true;
              resolve();
            }
          });
        });

        await delay(500); // Small delay

      } catch (err: any) {
        console.error(`Error processing ${item.MaBuuGui}:`, err);
        updatePortalItemStatus(item.MaBuuGui, "error", err.message);
        shouldStop = true; // Stop on system/network error
      }
    }

  } catch (e: any) {
    console.error("Error resuming from item:", e);
  }
}
// --------------------------------------

// --- SIDE PANEL HELPER FUNCTIONS ---
/**
 * Mở side panel cho window hiện tại
 */
async function openSidePanel(windowId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ windowId });
    console.log("Side panel opened successfully");
  } catch (error) {
    console.error("Failed to open side panel:", error);
  }
}

const GOOGLE_ORIGIN = 'https://www.google.com';

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  // Enables the side panel on google.com
  if (url.origin === GOOGLE_ORIGIN) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    // Disables the side panel on all other sites
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
});

/**
 * Mở side panel cho tab cụ thể
 */
async function openSidePanelForTab(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      console.log("Side panel opened for tab:", tabId);
    }
  } catch (error) {
    console.error("Failed to open side panel for tab:", error);
  }
}

/**
 * Remove sidepanel iframe from page if exists
 */
async function closeSidePanelInPage(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const existing = document.getElementById('inpage-sidepanel-container');
        if (existing) {
          existing.remove();
        }
        return true;
      }
    });
  } catch (err) {
    console.error('Failed to close side panel in page:', err);
    // Silently ignore
  }
}

/**
 * Đóng side panel (nếu cần)
 */
async function closeSidePanel(windowId: number): Promise<void> {
  try {
    // Chrome API không có close trực tiếp, user phải đóng thủ công
    console.log("Side panel can only be closed by user");
  } catch (error) {
    console.error("Failed to close side panel:", error);
  }
}
// --- END SIDE PANEL HELPER FUNCTIONS ---

// Helper function for safe JSON parsing from fetch responses
const safeFetch = async (url: string, options?: RequestInit): Promise<any> => {
  try {
    const response = await fetch(url, options);

    // Check if response is ok
    if (!response.ok) {
      console.error(
        `Fetch error for ${url}:`,
        response.status,
        response.statusText,
      );
      const textResponse = await response.text();
      console.error("Error response:", textResponse.substring(0, 200) + "...");
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error(`Invalid content type for ${url}:`, contentType);
      const textResponse = await response.text();
      console.error("Response text:", textResponse.substring(0, 200) + "...");
      throw new Error(
        "Invalid response format - expected JSON but received HTML/text",
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`Error in safeFetch for ${url}:`, error);
    throw error;
  }
};

type Snapshot = {
  TimeStamp?: string;
  [key: string]: any;
};
function setUpAlarm(): void {
  chrome.alarms.create("keep-alive", { periodInMinutes: 0.083 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keep-alive") {
      if (!ref) initFirebase();
    }
  });
}

// 1. Tạo Context Menu khi cài đặt extension
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "makePhoneCall",
    title: "Gọi với App của tôi",
    contexts: ["selection"], // Chỉ hiện khi có bôi đen văn bản
  });

  chrome.contextMenus.create({
    id: "openImagePanel",
    title: "📦 Mở Panel Hình Ảnh",
    contexts: ["page", "action"], // Hiện ở page và extension icon
  });
});

// 2. Lắng nghe sự kiện click vào menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "makePhoneCall" && info.selectionText) {
    const phoneNumber = info.selectionText.trim();

    await updateToPhone("phonecall", phoneNumber);
  }

  if (info.menuItemId === "openImagePanel") {
    // Click context menu là user gesture hợp lệ
    if (tab?.id) {
      // Gửi tín hiệu đến Content Script yêu cầu Bật/Tắt panel
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDE_PANEL" });
      } catch (error) {
        console.error("Không gửi được tin nhắn đến content script. Có thể trang chưa load xong hoặc không có quyền.", error);
        // Tùy chọn: Inject script nếu nó chưa chạy (phòng hờ)
        // chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      }
    }
  }
});

async function initFirebase(): Promise<void> {
  token = await chromeStorageGet("token");
  accountPortal = await chromeStorageGet("accountPortal");
  passwordPortal = await chromeStorageGet("passwordPortal");
  keyMessage = await chromeStorageGet("keyMessage");
  buuCuc = await chromeStorageGet("buuCuc");
  if (!keyMessage) {
    console.error("Chưa cấu hình keyMessage!");
    // Có thể thông báo lỗi hoặc dừng lại
    return;
  }
  if (firebase.apps.length === 0) {
    console.log("Initialize Firebase");
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.database();
  if (db === null) {
    return;
  }
  // Load AI Key
  const savedKey = await chromeStorageGet("selectedAiKey");
  if (savedKey) {
    currentGeminiKey = savedKey;
    console.log("[BG] Loaded Custom AI Key");
  } else {
    console.log("[BG] Using Default AI Key");
  }

  // ==> THÊM MỚI: Lắng nghe AI_KEYS và Sync với Popup
  const refAiKeys = db.ref("AI_KEYS");
  refAiKeys.on("value", (snapshot: any) => {
    aiKeysData = snapshot.val() || {};
    // Broadcast tin nhắn cho bất kỳ popup/tab nào đang mở
    chrome.runtime.sendMessage({
      type: "AI_KEYS_UPDATED",
      data: aiKeysData
    }).catch(() => { }); // Bỏ qua lỗi nếu không có popup nào mở
  });

  ref = db.ref(`PORTAL/CHILD/${keyMessage}/message/topc`);
  refPing = db.ref(`PORTAL/STATUS/topc`);
  ref.on("value", handleDataChange);
  refPing.on("value", handlePingChange);

  // --- Listener MỚI ---
  refScannedItems = db.ref(`PORTAL/CHILD/${keyMessage}/scannedItems`);
  refScannedItems.on("value", handleScannedItemsUpdate);

  // --- KẾT THÚC Listener MỚI ---

  // Khởi tạo các giá trị timestamp lần đầu
  startImageListener();

  // Initialize Auto Reminder Scheduler
  setupDailyAlarm();
  console.log('[Auto Reminder] Scheduler initialized');

  console.log(
    "Firebase initialized, listening for scanned items and commands on key:",
    keyMessage,
  );
}

let TimeStampPing = "";
let TimeStampScannedItems = ""; // Lưu timestamp của scannedItems
async function handlePingChange(
  snapshot: firebase.database.DataSnapshot,
): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data || TimeStampPing.length === 0 || TimeStampPing === data.TimeStamp) {
    TimeStampPing = data!.TimeStamp!;
    return;
  } else {
    TimeStampPing = data.TimeStamp!;
  }
  console.log("Data received:", data);
  if (data.Lenh == "ping") {
    updateToPhone("pong", keyMessage, data.DoiTuong);
    return;
  }
}

// --- HÀM MỚI: Xử lý cập nhật danh sách mã quét ---
async function handleScannedItemsUpdate(
  snapshot: firebase.database.DataSnapshot,
): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data) return;

  if (
    !data ||
    TimeStampScannedItems.length === 0 ||
    TimeStampScannedItems === data.TimeStamp
  ) {
    TimeStampScannedItems = data!.TimeStamp!;
    return;
  } else {
    TimeStampScannedItems = data.TimeStamp!;
  }
  var arrayData = JSON.parse(data.DoiTuong);
  const newScannedItems: BuuGuiProps[] = Array.isArray(arrayData)
    ? arrayData.filter((item) => item && typeof item.MaBuuGui === "string") // Lọc bỏ phần tử không hợp lệ
    : [];
  if (newScannedItems.length === 0) {
    allScannedItems = []; // Nếu không có item nào hợp lệ, đặt lại danh sách
    isStoppedOnError = false; // Đặt lại cờ dừng khi không có lỗi
    processedItems = new Set<string>(); // Đặt lại danh sách đã xử lý
    processingQueue = []; // Đặt lại hàng đợi
    return;
  }

  // Bỏ qua nếu không có thay đổi thực sự (Firebase có thể trigger thừa)
  // So sánh sâu mảng hoặc dựa vào timestamp nếu có
  // if (timestamp && TimeStampItemsTemp.length > 0 && TimeStampItemsTemp === timestamp) {
  //     return;
  // }
  // TimeStampItemsTemp = timestamp || TimeStampItemsTemp;

  // So sánh nội dung mảng để tránh xử lý thừa
  if (objectArraysAreEqual(allScannedItems, newScannedItems)) {
    // console.log("Scanned items list hasn't changed (object comparison).");
    return;
  }

  console.log(
    "Received updated scannedItems (objects):",
    newScannedItems.length,
    "items",
  );

  // --- KIỂM TRA CỜ DỪNG LỖI ---
  if (isStoppedOnError) {
    console.warn(
      "Processing stopped due to previous error. Ignoring scannedItems update.",
    );
    updateToPhone(
      "warning",
      "Đã dừng xử lý do lỗi trước đó. Cần khởi động lại hoặc xóa lỗi.",
    );
    // Cập nhật allScannedItems nhưng không trigger xử lý
    allScannedItems = newScannedItems;
    updateToPhone("messageContinue", `Lỗi hệ thống khi xử lý .`);
    return;
  }
  // --- KẾT THÚC KIỂM TRA ---

  const previousScannedItems: any[] = [...allScannedItems]; // Lưu list cũ để đối chiếu
  allScannedItems = newScannedItems; // Cập nhật list mới nhất
  // --- Reconciliation: Xử lý các item bị xóa (So sánh MaBuuGui) ---
  const newMaBgsSet = new Set(allScannedItems.map((item) => item.MaBuuGui)); // Set MaBuuGui mới
  const removedItems = previousScannedItems.filter(
    (oldItem) => !newMaBgsSet.has(oldItem.MaBuuGui),
  ); // Lọc object cũ không có MaBuuGui trong set mới

  if (removedItems.length > 0) {
    const removedMaBgs = removedItems.map((item) => item.MaBuuGui); // Lấy MaBuuGui bị xóa
    console.log("Items removed by user (MaBuuGui):", removedMaBgs);
    updateToPhone("info", `Đã xóa các mã: ${removedMaBgs.join(", ")}`);

    const originalQueueLength = processingQueue.length;
    const removedMaBgsSet = new Set(removedMaBgs); // Set để lọc queue nhanh hơn
    processingQueue = processingQueue.filter(
      (queueItemMaBG) => !removedMaBgsSet.has(queueItemMaBG),
    ); // Lọc queue (vẫn là string[])

    if (processingQueue.length < originalQueueLength) {
      console.log("Removed items from processing queue.");
    }
    // Không xóa khỏi processedItems
  }
  // --- KẾT THÚC Reconciliation ---

  // Kiểm tra xem có cần xử lý item mới không
  triggerProcessingCheck();
}

const handleChayDenCuoiVaIn = async () => {
  console.log("Processing remaining items command received.");
  isFinalProcessingTriggered = true; // Đặt cờ

  // Lấy MaBuuGui của tất cả item trong list mới nhất
  const currentMaBgs = allScannedItems.map((item) => item.MaBuuGui);
  // Lọc ra MaBuuGui chưa xử lý và chưa có trong queue
  const maBgsReadyForQueue = currentMaBgs.filter(
    (maBG) => !processedItems.has(maBG) && !processingQueue.includes(maBG),
  );

  if (maBgsReadyForQueue.length > 0) {
    console.log(
      "Adding remaining items (MaBuuGui) to queue:",
      maBgsReadyForQueue,
    );
    updateToPhone(
      "info",
      `Bắt đầu xử lý ${maBgsReadyForQueue.length} mã cuối.`,
    );
    processingQueue.push(...maBgsReadyForQueue); // Thêm MaBuuGui (string) vào queue
    processNextItemInBackground();
  } else if (processingQueue.length === 0 && !currentItemBeingProcessed) {
    console.log("No remaining items to process. Triggering print.");
    updateToPhone("info", "Không còn mã nào để xử lý, chuẩn bị in.");
    // await triggerPrint();
    isFinalProcessingTriggered = false;
  } else {
    console.log(
      "Waiting for current processing to finish before printing remaining.",
    );
    updateToPhone("info", "Đang chờ xử lý các mã trước đó...");
  }
};

// --- HÀM MỚI: Kiểm tra và đưa item vào hàng đợi xử lý ---
function triggerProcessingCheck(): void {
  // --- KIỂM TRA CỜ DỪNG LỖI ---
  if (isStoppedOnError) {
    console.log("Processing stopped. Cannot check for new items.");
    return;
  }
  // --- KẾT THÚC KIỂM TRA ---

  if (currentItemBeingProcessed) {
    // console.log("triggerProcessingCheck: Currently processing", currentItemBeingProcessed, "waiting...");
    return; // Nếu đang xử lý item khác, đợi nó xong
  }

  if (processingQueue.length > 0) {
    // console.log("triggerProcessingCheck: Queue has items, processing next.");
    processNextItemInBackground(); // Nếu queue còn item, xử lý tiếp
    return;
  }

  // Lọc các *đối tượng* chưa xử lý và chưa có trong queue
  const itemsReadyForQueue = allScannedItems.filter(
    (item) =>
      !processedItems.has(item.MaBuuGui) &&
      !processingQueue.includes(item.MaBuuGui),
  );

  // if (itemsReadyForQueue.length > BUFFER_SIZE) {
  const nextItemMaBG = itemsReadyForQueue[0].MaBuuGui; // Lấy MaBuuGui (string) của item cũ nhất
  if (!processingQueue.includes(nextItemMaBG)) {
    console.log("Adding to queue based on buffer (MaBuuGui):", nextItemMaBG);
    processingQueue.push(nextItemMaBG); // Thêm MaBuuGui (string) vào queue
    processNextItemInBackground();
  }
  // } else if (isFinalProcessingTriggered && itemsReadyForQueue.length === 0) {
  // console.log("Final processing complete, queue is empty. Triggering print.");
  // triggerPrint();
  // isFinalProcessingTriggered = false;
  // }
}
async function hardRefreshSpecificTab(
  tabId: number,
): Promise<chrome.tabs.Tab | undefined> {
  if (!tabId) {
    console.error("hardRefreshSpecificTab: Invalid tabId provided.");
    return undefined;
  }
  console.log(`Initiating hard refresh for tab: ${tabId}`);
  try {
    await chrome.tabs.reload(tabId, { bypassCache: true });
    console.log(`Waiting for tab ${tabId} to finish reloading...`);
    const updatedTab = await waitForTabToLoad(tabId); // Sử dụng hàm waitForTabToLoad hiện có của bạn
    console.log(`Tab ${tabId} finished reloading.`);
    return updatedTab;
  } catch (error) {
    console.error(`Error during hard refresh for tab ${tabId}:`, error);
    // Có thể tab đã bị đóng trong quá trình refresh
    return undefined;
  }
}

let successfulProcessCount = 0;
const REFRESH_THRESHOLD = 40;
// --- HÀM MỚI: Xử lý item tiếp theo trong hàng đợi ---
async function processNextItemInBackground(): Promise<void> {
  // --- KIỂM TRA CỜ DỪNG LỖI ---
  if (isStoppedOnError) {
    console.warn("Processing stopped due to error. Clearing queue.");
    processingQueue = [];
    currentItemBeingProcessed = null;
    updateToPhone("messageContinue", `Lỗi hệ thống khi xử lý .`);
    return;
  }
  // --- KẾT THÚC KIỂM TRA ---

  if (currentItemBeingProcessed || processingQueue.length === 0) {
    if (
      !currentItemBeingProcessed &&
      processingQueue.length === 0 &&
      isFinalProcessingTriggered
    ) {
      console.log("Queue is now empty after processing. Triggering print.");
      // await triggerPrint();
      isFinalProcessingTriggered = false;
    }
    return;
  }

  const maBGToProcess = processingQueue.shift()!; // Lấy MaBuuGui (string)

  // Kiểm tra lại xem MaBuuGui có còn trong danh sách đối tượng mới nhất không
  if (!allScannedItems.some((item) => item.MaBuuGui === maBGToProcess)) {
    console.log(
      "Item",
      maBGToProcess,
      "was removed before processing could start. Skipping.",
    );
    processedItems.delete(maBGToProcess);
    triggerProcessingCheck();
    return;
  }

  currentItemBeingProcessed = maBGToProcess; // Đánh dấu item đang xử lý (string)
  // Tìm index để hiển thị badge chính xác
  const currentIndexInList = allScannedItems.findIndex(
    (item) => item.MaBuuGui === maBGToProcess,
  );
  console.log(
    `Đang xử lý BG: ${currentItemBeingProcessed} (Index: ${currentIndexInList}, Queue: ${processingQueue.length})`,
  );
  updateToPhone("message", `Đang xử lý ${currentItemBeingProcessed}`);
  chrome.action.setBadgeText({ text: `${currentIndexInList + 1}` }); // Hiển thị index (1-based)

  try {
    // --- Lấy thông tin BuuGuiProps ĐẦY ĐỦ ---
    // Ưu tiên lấy từ allScannedItems đã có sẵn để đảm bảo dùng đúng dữ liệu đã trigger việc xử lý
    let currentBuuGui = allScannedItems.find(
      (item) => item.MaBuuGui === maBGToProcess,
    );

    if (!currentBuuGui) {
      throw new Error(
        `Không tìm thấy thông tin Bưu gửi đầy đủ cho: ${maBGToProcess}`,
      );
    }

    // Cần cơ chế lấy maKH và options phù hợp. Ví dụ lấy từ storage
    const maKH = await chromeStorageGet("currentMaKH"); // Ví dụ
    const options = await chromeStorageGet("currentOptions"); // Ví dụ

    if (!maKH) {
      throw new Error(`Chưa chọn khách hàng (maKH)`);
    }

    // Gửi message đến Content Script
    const tabId = await findPortalTabId(); // Hàm tìm tab Portal

    if (!tabId) {
      throw new Error("Không tìm thấy tab Portal đang hoạt động.");
    }

    chrome.tabs.sendMessage(
      tabId,
      {
        message: "PROCESS_SINGLE_ITEM", // Lệnh mới
        current: currentBuuGui,
        makh: maKH,
        keyMessage: keyMessage,
        options: options,
      },
      async (response) => {
        const processedMaBG = currentItemBeingProcessed; // Lưu lại mã vừa xử lý
        currentItemBeingProcessed = null; // Đặt lại ngay

        // Kiểm tra lỗi runtime trước
        if (chrome.runtime.lastError) {
          console.error(
            `Lỗi gửi/nhận từ content script cho ${processedMaBG}:`,
            chrome.runtime.lastError.message,
          );
          updateToPhone(
            "messageContinue",
            `Lỗi hệ thống khi xử lý ${processedMaBG}.`,
          );
          isStoppedOnError = true; // Dừng lại do lỗi hệ thống
          processingQueue = [];
          triggerProcessingCheck(); // Không cần thiết nhưng để đảm bảo
          return;
        }

        // Kiểm tra xem item có bị xóa trong lúc đang xử lý không
        if (!allScannedItems.some((item) => item.MaBuuGui === processedMaBG!)) {
          console.log(
            "Item",
            processedMaBG,
            "was deleted during processing. Ignoring result.",
          );
          processedItems.delete(processedMaBG!); // Đảm bảo không bị tính là đã xử lý
          triggerProcessingCheck();
          return;
        }

        // Xử lý kết quả
        if (response && response.status === "success") {
          console.log("Processed successfully:", processedMaBG);
          processedItems.add(processedMaBG!);
          updateToPhone("message", `${processedMaBG} đã được xử lý`);

          successfulProcessCount++;
          console.log(
            `Successful items since last refresh: ${successfulProcessCount}`,
          );

          if (successfulProcessCount >= REFRESH_THRESHOLD) {
            console.log(
              `Reached threshold (${REFRESH_THRESHOLD}). Refreshing tab ${tabId}...`,
            );
            updateToPhone(
              "message",
              `Đã xử lý ${successfulProcessCount} mã. Đang làm mới trang...`,
            );
            await delay(1000);

            const refreshedTab = await hardRefreshSpecificTab(tabId);

            if (!refreshedTab) {
              console.error(
                `Tab ${tabId} could not be refreshed or was closed. Stopping process.`,
              );
              updateToPhone(
                "message",
                `Lỗi: Không thể làm mới tab ${tabId}. Dừng xử lý.`,
              );
              isStoppedOnError = true;
              processingQueue = [];
              successfulProcessCount = 0;
              chrome.action.setBadgeText({ text: "REF_ERR" });
              chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
              return; // Thoát khỏi IIFE
            }

            console.log(
              `Tab ${tabId} refreshed successfully. Resetting counter.`,
            );
            updateToPhone("message", `Làm mới trang xong. Tiếp tục xử lý...`);
            successfulProcessCount = 0;

            await delay(2500); // Chờ ổn định
          }
        } else {
          // --- Dừng lại khi có lỗi từ content script ---
          const errorMsg = response?.error || "Lỗi không xác định từ Portal";
          console.error(
            "Lỗi xử lý từ content script:",
            processedMaBG,
            response,
          );
          updateToPhone(
            "messageContinue",
            `Lỗi xử lý ${processedMaBG}: ${errorMsg}. Đã dừng!`,
          );
          isStoppedOnError = true;
          processingQueue = [];
          successfulProcessCount = 0;
          chrome.action.setBadgeText({ text: "Lỗi!" });
          chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
          return; // Thoát khỏi IIFE
        }
        triggerProcessingCheck(); // Gọi kiểm tra tiếp theo
      },
    );
  } catch (error: any) {
    console.error(
      `Lỗi nghiêm trọng khi chuẩn bị xử lý ${currentItemBeingProcessed}:`,
      error,
    );
    updateToPhone("message", `Lỗi hệ thống: ${error.message}. Đã dừng!`);
    isStoppedOnError = true; // Dừng lại do lỗi nghiêm trọng
    processingQueue = [];
    currentItemBeingProcessed = null;
    chrome.action.setBadgeText({ text: "Lỗi!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  }
}

// --- HÀM MỚI: Tìm Tab Portal ---
async function findPortalTabId(
  maKH: string = "",
  hdrId?: string | undefined,
): Promise<number | undefined> {
  await delay(300); // Đợi một chút để đảm bảo tab đã load xong
  console.log("handleSendAutoToPortal: Bắt đầu kiểm tra tab Portal...");
  let foundReadyTabId: number | null = null;
  let readyTabInfo: chrome.tabs.Tab | null = null; // Lưu thông tin tab tìm thấy

  try {
    // 1. Tìm các tab Portal có URL khớp
    const portalTabs = await chrome.tabs.query({
      url: "https://portalkhl.vnpost.vn/*",
    });
    console.log(
      `handleSendAutoToPortal: Tìm thấy ${portalTabs.length} tab Portal khớp URL.`,
    );

    // 2. Duyệt qua các tab và kiểm tra element
    for (const tab of portalTabs) {
      if (!tab.id) continue; // Bỏ qua nếu tab không có ID
      if (!hdrId) {
        console.log(
          `handleSendAutoToPortal: Kiểm tra tab ID: ${tab.id}, URL: ${tab.url}`,
        );
        try {
          // *** ĐÁNH DẤU: Tiêm script để kiểm tra sự tồn tại của #ttNumberSearch ***
          const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.querySelector("#ttNumberSearch"), // Hàm kiểm tra trực tiếp
          });

          // executeScript trả về một mảng kết quả, kiểm tra phần tử đầu tiên
          if (
            injectionResults &&
            injectionResults[0] &&
            injectionResults[0].result === true
          ) {
            console.log(
              `handleSendAutoToPortal: Tab ID: ${tab.id} đã sẵn sàng (tìm thấy #ttNumberSearch).`,
            );
            foundReadyTabId = tab.id;
            readyTabInfo = tab; // Lưu lại thông tin tab
            var currentMaKH = "";
            if (maKH != "") {
              currentMaKH = maKH;
            } else {
              currentMaKH = await chromeStorageGet("currentMaKH");
            }
            window.postMessage({
              type: "CONTENT",
              message: "GETIDKH",
            });
            break; // Dừng tìm kiếm khi đã tìm thấy tab phù hợp
          } else {
            console.log(
              `handleSendAutoToPortal: Tab ID: ${tab.id} không tìm thấy #ttNumberSearch.`,
            );
          }
        } catch (injectionError: any) {
          // Có thể tab đã đóng hoặc không có quyền tiêm script
          console.warn(
            `handleSendAutoToPortal: Lỗi khi kiểm tra tab ID: ${tab.id}. Lỗi: ${injectionError.message}`,
          );
          // Bỏ qua và tiếp tục với tab tiếp theo (nếu có)
        }
      } else {
        foundReadyTabId = tab.id;
        readyTabInfo = tab; // Lưu lại thông tin tab
      }
    }

    // 3. Xử lý dựa trên kết quả kiểm tra
    if (foundReadyTabId && readyTabInfo) {
      // *** ĐÁNH DẤU: Nếu tìm thấy tab sẵn sàng ***
      console.log(
        `handleSendAutoToPortal: Đã tìm thấy tab Portal (ID: ${foundReadyTabId}). Kích hoạt và gửi trực tiếp...`,
      );
      updateToPhone("message", `Portal OK. Đang gửi...`, keyMessage);

      if (!hdrId) {
        // *** Kích hoạt (đưa lên focus) tab đã tìm thấy ***
        await chrome.tabs.update(foundReadyTabId, { active: true });
        // Có thể cần chờ một chút để đảm bảo tab đã active hoàn toàn, mặc dù thường không cần
      } else {
        //this is url https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=1054056772
        // --- Sử dụng hàm ensurePortalLogin ---
        const loginResult = await ensurePortalLogin(foundReadyTabId);

        // Nếu đăng nhập thành công và cần mở lại tab đúng URL (do đăng nhập có thể điều hướng)
        await chrome.tabs.update(foundReadyTabId, {
          active: true,
          url: `https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=${hdrId}`,
        });
        await waitForTabToLoad(foundReadyTabId);
      }
      await delay(300);

      // *** Gọi trực tiếp handleSendToPortal ***
      // Hàm này sẽ tự động lấy tab đang active (chính là tab vừa được kích hoạt)
      // Thêm await nếu handleSendToPortal là async và bạn cần đợi nó xong
      return foundReadyTabId; // Trả về ID tab đã tìm thấy
    } else {
      // *** ĐÁNH DẤU: Nếu không tìm thấy tab nào sẵn sàng ***
      console.log(
        "handleSendAutoToPortal: Không tìm thấy tab Portal sẵn sàng. Tiến hành khởi tạo...",
      );
      updateToPhone("message", "Đang khởi tạo Portal...", keyMessage);
      var currentMaKH = "";
      if (maKH != "") {
        currentMaKH = maKH;
        console.log("handleSendAutoToPortal: currentMaKH:", currentMaKH);
      } else {
        currentMaKH = await chromeStorageGet("currentMaKH");
      }

      const snapshot = await db!.ref("PORTAL/HopDongs/" + currentMaKH).get();
      const hopDong = snapshot.val();
      // Gọi hàm khởi tạo (trả về hdrId hoặc null)
      const result = await khoiTaoPortal(hopDong);

      if (result && result.hdrId) {
        const { hdrId, tabId } = result;
        console.log(
          "handleSendAutoToPortal: Khởi tạo thành công. Mã hợp đồng:",
          hdrId,
        );
        await updateToPhone(
          "message",
          `Khởi tạo thành công. Mã hợp đồng: ${hdrId}. Đang gửi dữ liệu...`,
          keyMessage,
        );
        //thực hiện gửi hdrId và currentMaKH với lệnh sendhdr dùng updatetophone để phone cập nhật thông tin
        // Gửi hdrId và currentMaKH về điện thoại với lệnh "sendhdr"
        await updateToPhone(
          "sendhdr",
          JSON.stringify({ hdrId, maKH: currentMaKH }),
          keyMessage,
        );

        // Sau khi khởi tạo thành công, tab đích đã sẵn sàng và active, gọi gửi dữ liệu
        // Thêm await nếu handleSendToPortal là async
        //get tabid Active
        // var tabs = await chrome.tabs.query({
        //   active: true,
        //   currentWindow: true,
        // }); // Lấy ID tab hiện tại (đã được kích hoạt)
        return tabId;
      } else {
        console.error("handleSendAutoToPortal: Khởi tạo Portal thất bại.");
        // handleKhoiTao đã gửi thông báo lỗi rồi, không cần gửi lại ở đây
        // updateToPhone("message", "Khởi tạo Portal thất bại, vui lòng thử lại sau.", keyMessage);
      }
    }
  } catch (error: any) {
    // 4. Xử lý lỗi chung (ví dụ: lỗi khi query tabs)
    console.error("Lỗi trong handleSendAutoToPortal:", error);
    updateToPhone(
      "message",
      `Lỗi khi tự động gửi Portal: ${error.message}`,
      keyMessage,
    );
  }
}

// --- HÀM MỚI: Trigger việc in ấn ---
async function triggerPrint(): Promise<void> {
  // Lấy danh sách MaBuuGui của những item đã xử lý thành công VÀ còn trong list cuối cùng
  const maBgsToPrint = allScannedItems
    .filter((item) => processedItems.has(item.MaBuuGui)) // Lọc các object hợp lệ
    .map((item) => item.MaBuuGui); // Chỉ lấy MaBuuGui (string)

  console.log("Triggering print for valid processed MaBuuGui:", maBgsToPrint);

  if (maBgsToPrint.length === 0) {
    console.log("No valid items to print.");
    updateToPhone("info", "Không có mã hợp lệ nào để in.");
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  updateToPhone("info", `Đang chuẩn bị in ${maBgsToPrint.length} mã...`);

  await printMaHieus(maBgsToPrint); // Hàm in nhận mảng string MaBuuGui

  // Reset trạng thái sau khi in (tùy thuộc luồng mong muốn)
  // Có thể cần xóa processedItems, reset cờ lỗi,...
  // processedItems.clear();
  // isStoppedOnError = false; // Reset lỗi nếu muốn phiên làm việc tiếp theo bắt đầu lại
  // isFinalProcessingTriggered = false;
  chrome.action.setBadgeText({ text: "OK" });
  chrome.action.setBadgeBackgroundColor({ color: "#00FF00" });
  await delay(2000);
  chrome.action.setBadgeText({ text: "" });
  processedItems.clear(); // Xóa lịch sử xử lý cho phiên mới
  isStoppedOnError = false; // Reset lỗi cho phiên mới
  isFinalProcessingTriggered = false;
}
// --- HÀM TIỆN ÍCH MỚI: So sánh mảng đối tượng dựa trên MaBuuGui ---
function objectArraysAreEqual(a: BuuGuiProps[], b: BuuGuiProps[]): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    // Chỉ cần so sánh MaBuuGui là đủ để biết list có thay đổi không
    if (a[i]?.MaBuuGui !== b[i]?.MaBuuGui) return false;
  }
  return true;
}
// Hàm tiện ích so sánh mảng (thứ tự quan trọng)

// --- Các hàm xử lý cũ cần được xem xét/gỡ bỏ/điều chỉnh ---
// - handleSendToPortal: Logic này giờ nằm trong processNextItemInBackground
// - handleGetPortal, handleGetDataFromPortal: Vẫn giữ nếu cần lấy data tổng quan
// - handleEditHangHoa: Vẫn giữ nếu cần
// - printMaHieus: Vẫn giữ để thực hiện in cuối cùng
// - các hàm get/set token, api calls...: Giữ lại
// - handleGetPNS, handleAddPNS,... : Giữ lại nếu là tính năng riêng
// - khoiTaoPortal: Logic khởi tạo ban đầu có thể vẫn cần
// - Các hàm liên quan đến PNS nếu không thuộc luồng chính này
// Các lệnh không cần kiểm tra token
const commandsNoTokenRequired = [
  "getmypostdata",
  "getpns",
  "guiAiLe",
  "sendSubmit",
  "sendtoportal",
  "sendautotoportal",
  "khoitao",
  "loginpns",
  "loginpnsgd",
];

async function handleDataChange(
  snapshot: firebase.database.DataSnapshot,
): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data) return;
  if (!data || TimeStampTemp.length === 0 || TimeStampTemp === data.TimeStamp) {
    TimeStampTemp = data!.TimeStamp ?? "";
    return;
  } else {
    TimeStampTemp = data.TimeStamp ?? "";
  }
  if (!commandsNoTokenRequired.includes(data.Lenh)) {
    const isOk: boolean = await checkToken();
    if (!isOk) {
      console.log(
        "Token không hợp lệ, đang thực hiện đăng nhập lại qua Portal...",
      );
      updateToPhone("message", "Đang đăng nhập lại vào Portal...");
      accountPortal = data.username;
      passwordPortal = data.password;

      var data1 = await loginDirect(accountPortal, passwordPortal);
      if (data1) {
        saveToken(data1);
        token = data1;
      }




      // // Mở hoặc tìm tab Portal
      // const initialTab = await createOrActiveTab(
      //   "https://portalkhl.vnpost.vn/search-order",
      //   "portalkhl.vnpost.vn",
      //   true,
      // );

      // if (!initialTab || !initialTab.id) {
      //   console.error("Lỗi: Không thể mở hoặc kích hoạt tab Portal.");
      //   updateToPhone("message", "Lỗi: Không thể mở tab Portal.");
      //   return;
      // }
      // const tabId = initialTab.id;

      // console.log(`Tab ban đầu ${tabId}. URL: ${initialTab.url}`);

      // // --- Sử dụng hàm ensurePortalLogin ---
      // const loginResult = await ensurePortalLogin(tabId);
      // const loginSuccess = loginResult.success;
      // // --- Kết thúc sử dụng hàm ensurePortalLogin ---

      // if (!loginSuccess) {
      //   console.error("Đăng nhập Portal thất bại");
      //   updateToPhone("message", "Lỗi: Đăng nhập Portal thất bại.");
      //   return;
      // }

      // console.log("Đăng nhập Portal thành công, đang lấy token...");

      // // Lấy token từ sessionStorage sau khi đăng nhập thành công
      // try {
      //   const results = await chrome.scripting.executeScript({
      //     target: { tabId: tabId },
      //     func: () => {
      //       const accessToken = sessionStorage.getItem("accessToken");
      //       if (accessToken) {
      //         try {
      //           const parsed = JSON.parse(accessToken);
      //           return parsed.accessToken || null;
      //         } catch (e) {
      //           console.error("Lỗi parse authData:", e);
      //           return null;
      //         }
      //       }
      //       return null;
      //     },
      //   });

      //   if (results && results[0] && results[0].result) {
      //     const tokenTemp = results[0].result;
      //     console.log("Đã lấy được token từ sessionStorage thành công");
      //     saveToken(tokenTemp);
      //     token = tokenTemp;
      //     updateToPhone("message", "Đăng nhập và lấy token thành công!");
      //   } else {
      //     console.error("Không lấy được token từ sessionStorage");
      //     updateToPhone("message", "Lỗi: Không lấy được token từ Portal.");
      //     return;
      //   }
      // } catch (error: any) {
      //   console.error("Lỗi khi lấy token:", error);
      //   updateToPhone("message", `Lỗi khi lấy token: ${error.message}`);
      //   return;
      // }
    }
  } else {
    //       await processWithGemini(`[21/06/2025 10:33:47] Kim Vân: 1.13 hoà hảo 299k 45n trắng dc 6 phùng hưng ph hàng mã hk hà nội dt 0974568086
    // [21/06/2025 11:40:36] Bích Ngọc: 14.14 Duong trung Hiếu 299k 45n trắng  cao minh phúc yên Vĩnh.phúc 035 8007812
    // [21/06/2025 11:52:09] Kim Vân: 1.15 thạch trung 299k 45n trắng  địa chỉ 135/35 đường Liên khu 2/10phuong bình hưng hòa a quận Bình Tân TPHCMSDT 0943917650
    // [21/06/2025 11:53:19] Bích Ngọc: 14.15 Tô trung chất 0972499410 ..299k 45n trắng.. Doi 5 thôn bui xe xã dak ơ Bù Gia Mập binh phước
    // [21/06/2025 11:58:55] Kim Vân: 1.16 nguyễn dũng 299k 45n trắng Nguyễn Dũng mỹ xả xã Quảng An Quảng điền thừa Thiên Huế 0935196642
    // [21/06/2025 12:15:25] Bích Ngọc: 14.17 pham xuan thìn  299k 45n trắng ..to 22 p.doi can tp tuyen quang tinh tuyen quang`,null)
  }

  const commandHandlers: { [key: string]: (data: any) => Promise<void> } = {
    getmahieutontoweb: async (data: any) => {
      await handleMaHieuFromPC(data);
    },
    guiAiLe: async (data: any) => await handleGuiAiLe(data.DoiTuong),
    sendSubmit: async () => await handleSendSubmit(),
    printMaHieus: async (data: any) =>
      await printMaHieus(JSON.parse(data.DoiTuong)),
    printARPages: async (data: any) =>
      await printARPages(JSON.parse(data.DoiTuong)),
    xoabg: async (data: any) =>
      await handleXoaBuuGui(JSON.parse(data.DoiTuong)),
    xoanhieubg: async (data: any) => {
      await handleXoaNhieuBuuGui(data.DoiTuong);
    },
    checkportal: async (data: any) => {
      await handleCheckPortal();
    },
    laylan: async (data: any) => {
      const maHieus = await handleGetMaHieus(data);
      const codes: string[] = maHieus!.map((element) => element.Code);
      const codesIDs: string[] = maHieus!.map((element) => element.IDCODE);
      const result = {
        isSorted: false,
        codes: codes,
        isAutoBD: false,
        isPrinted: true,
        codeIDs: codesIDs,
      };
      console.log("Result:", result);
      updateToPC("checkdingoais", JSON.stringify(result));
    },
    getmypostdata: async (data: any) => await handleGetMyPostData(data),
    aiorders: async (data: any) => await handleAIOrders(data),
    continueAuto: async (_data: any) => {
      // Không cần data.DoiTuong cho lệnh này
      console.log("Received 'continueAuto' command from Firebase.");
      if (!isStoppedOnError) {
        updateToPhone(
          "info",
          "Không có lỗi nào đang được ghi nhận để tiếp tục.",
        );
        console.log(
          "'continueAuto' received but system is not in an error state.",
        );
        return;
      }
      // 1. Reset cờ lỗi
      isStoppedOnError = false;
      successfulProcessCount = 0; // Reset bộ đếm thành công sau lỗi

      // 2. Thông báo cho người dùng
      updateToPhone("message", "Đã nhận lệnh tiếp tục. Thử xử lý lại...");

      // 3. Xóa badge lỗi (nếu có)
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setBadgeBackgroundColor({ color: "#007bff" }); // Reset màu badge (tùy chọn)

      // 4. Kích hoạt lại việc kiểm tra và xử lý
      // `triggerProcessingCheck` sẽ tự động tìm item tiếp theo chưa được xử lý
      // trong `allScannedItems` (vì item lỗi không nằm trong `processedItems`
      // và `processingQueue` đã bị xóa hoặc sẽ được xây dựng lại).
      // Không cần trực tiếp đưa item lỗi vào queue ở đây, để logic chung xử lý.
      // Người dùng có thể đã thay đổi danh sách `allScannedItems` trên điện thoại
      // trong lúc chờ bấm "Tiếp tục".
      triggerProcessingCheck();
    },
    xacnhanportal: async (data: any) =>
      await handleXacNhanPortal(data.DoiTuong, token),

    preparePrintMaHieus: async (data: any) =>
      await preParePrintMaHieus(JSON.parse(data.DoiTuong)),
    hoanTatTin: async (data: any) =>
      await hoanTatTin(JSON.parse(data.DoiTuong)),
    dieuTin: async (data: any) => await dieuTin(JSON.parse(data.DoiTuong)),
    sendtoportal: async (data: any) => {
      handleSendToPortal(data.DoiTuong);
    },
    // "test": async (data: any) => { await hoanTatTinPNSFetch(["CK990242988VN", "CK990403835VN"], 10) },
    sendautotoportal: async (data: any) => handleSendAutoToPortal(data),
    sendtoendandprint: async () => handleChayDenCuoiVaIn(),
    savekhoptions: async (data: any) => handleSaveKHOption(data),
    edithanghoa: async (data: any) => handleEditHangHoa(data),
    updatekl: async (data: any) => await handleEditKL(data),

    getpns: async (data: any) => {
      let dayLast;
      try {
        dayLast = JSON.parse(data.DoiTuong).day;
      } catch (error) {
        console.error("Error parsing JSON:", error);
        dayLast = "-2";
      }
      await handleGetPNS(dayLast ?? "-2");
    },
    addpns: async (data: any) => {
      let dayLast1;
      try {
        dayLast1 = JSON.parse(data.DoiTuong).day;
      } catch (error) {
        console.error("Error parsing JSON:", error);
        dayLast1 = "-2";
      }
      await handleAddPNS(dayLast1 ?? "-2");
    },
    khoitao: async (data: any) => {
      await handleKhoiTao(data);
    },
    edittoportal: async (data: any) => {
      try {
        const bgs = await getBuuGuisFromFirebase();
        const temp1 = JSON.parse(data.DoiTuong);
        const s = findBuuGuiIndex(bgs, temp1.maBG);
        if (s === -1) {
          console.warn("BuuGui not found");
          return;
        }
        const tabId = await getActiveTabId();
        await sendMessageToTab(tabId, bgs, bgs[s], temp1.maKH, keyMessage);
        return;
      } catch (error) {
        console.error("Error in edittoportal case:", error);
      }
    },
    loginpns: async (data: any) => {
      const listTab = await chrome.tabs.query({});
      if (listTab.length === 0) return;
      for (let i = 0; i < listTab.length; i++) {
        if (listTab[i].url?.indexOf("packnsend.vnpost.vn") !== -1) {
          chrome.tabs.sendMessage(
            listTab[i].id!,
            {
              message: "SENDCAPCHAR",
              content: data.DoiTuong,
              gd: false,
            },
            (res) => {
              if (!chrome.runtime.lastError) {
                console.log("Đã nhận tin nhắn từ content PNS", res);
              } else {
                console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
              }
            },
          );
          break;
        }
      }
    },
    loginpnsgd: async (data: any) => {
      const listTab = await chrome.tabs.query({});
      if (listTab.length === 0) return;
      for (let i = 0; i < listTab.length; i++) {
        if (listTab[i].url?.indexOf("packnsend.vnpost.vn") !== -1) {
          chrome.tabs.sendMessage(
            listTab[i].id!,
            {
              message: "SENDCAPCHAR",
              content: data.DoiTuong,
              gd: true,
            },
            (res) => {
              if (!chrome.runtime.lastError) {
                console.log("Đã nhận tin nhắn từ content PNS", res);
              } else {
                console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
              }
            },
          );
          break;
        }
      }
    },
    getPortal: async (data: any) => await handleGetPortal(data.DoiTuong),
    printPage: async (data: any) => await handlePrintPage(data.DoiTuong),
    printPageSort: async (data: any) => await handlePrintPageSort(data),
    printSortTinhVaNoiDung: async (data: any) =>
      await handlePrintSortTinhVaNoiDung(data),
    getMaHieus: async (data: any) => {
      const maHieus = await handleGetMaHieus(data);
      await updateToPhone("getMaHieus", JSON.stringify(maHieus));
    },
  };

  if (data.Lenh && commandHandlers[data.Lenh]) {
    await commandHandlers[data.Lenh](data);
  }
}
initFirebase();
setUpAlarm();

// --- Listener TIN NHẮN từ content script ---
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.event === "CONTENT")
    if (request.message === "SEND_CAPCHAR") {
      // Xử lý dữ liệu captcha ở đây
      // Ví dụ:
      updateToPhone("showcapchar", request.content, request.keyMessage);

      return true; // Hoặc có thể bỏ qua nếu không dùng sendResponse
    } else if (request.message === "SEND_MH") {
      updateToPhone(
        "checkstatemh",
        request.content + "|" + request.content1,
        request.keyMessage,
      );
    }

  // ==> THÊM MỚI: Xử lý các yêu cầu liên quan đến AI Keys từ InfoTab
  if (request.type === "AI_KEY_ACTION") {
    handleAiKeyAction(request).then(sendResponse);
    return true; // Giữ kênh mở cho async response
  }

  // --- KIỂM TRA CỜ DỪNG LỖI ---
  // Một số message vẫn cần chạy dù có lỗi, ví dụ PING hoặc lấy thông tin cơ bản
  // Nhưng các message liên quan đến xử lý nghiệp vụ chính thì nên kiểm tra
  const messagesToBlockOnError = ["SEND_MH", "REQUEST_EXCEL", "ADD"]; // Ví dụ

  if (isStoppedOnError && messagesToBlockOnError.includes(request.message)) {
    console.warn(
      `Processing stopped due to error. Blocking message: ${request.message}`,
    );
    sendResponse({
      status: "error",
      error: "Processing stopped due to previous error",
    });
    return true; // Quan trọng: Vẫn trả về true để giữ kênh mở
  }
  // --- KẾT THÚC KIỂM TRA ---

  (async () => {

    if (request.event === "CONTENT") {
      if (request.message === "SEND_CAPCHAR") {
        updateToPhone("showcapchar", request.content, request.keyMessage);
        sendResponse({ status: "received" }); // Phản hồi lại content script
      } else if (request.message === "SEND_MH") {
        // Message này có thể không cần thiết nữa nếu background quản lý hết
        // Hoặc dùng để xác nhận lại lần cuối từ content script
        console.log(
          `Confirmation from content script for ${request.content}: ${request.content1}`,
        );
        sendResponse({ status: "received" });
      } else if (request.message === "REQUEST_EXCEL") {
        let idsToFetch = [];
        // Đảm bảo request.content là mảng string
        if (Array.isArray(request.content)) {
          idsToFetch = request.content.map(String);
        } else if (typeof request.content === "string") {
          idsToFetch = [request.content];
        } else {
          console.error("Invalid content for REQUEST_EXCEL:", request.content);
          sendResponse({ status: "error", error: "Invalid data format" });
          return;
        }

        try {
          const res = await getMaHieusFromPortalId(idsToFetch, token);
          if (!res) {
            updateToPhone(
              "message",
              "Không lấy được dữ liệu từ Portal để xuất Excel",
            );
            sendResponse({
              status: "error",
              error: "Failed to fetch data from Portal",
            });
          } else {
            await openAndExportExcel(res, request.request, request.ishcc);
            sendResponse({ status: "success" });
          }
        } catch (excelError: any) {
          console.error("Error during Excel export:", excelError);
          updateToPhone("message", `Lỗi xuất Excel: ${excelError.message}`);
          sendResponse({ status: "error", error: excelError.message });
        }
      } else if (request.message === "MESSAGE") {
        updateToPhone("message", request.content, request.keyMessage);
        sendResponse({ status: "received" });
      } else if (request.message === "PING") {
        // Dùng để kiểm tra content script có sẵn sàng không
        sendResponse({ status: "pong" });
      } else {
        // Xử lý các message khác nếu có
        sendResponse({ status: "unknown_message" });
      }
    } else if (request.event === "CONTENTMY") {
      // ===== THÊM MỚI: Xử lý các message từ contentMy.tsx =====
      if (request.type === "UPDATE_EXTRA_INFO") {
        handleUpdateExtraInfo(request.payload, sendResponse);
        return; // Không return true ở đây vì đã xử lý async bên trong
      } else if (request.type === "GET_EXTRA_INFO") {
        handleGetExtraInfo(request.payload, sendResponse);
        return;
      } else if (request.type === "DELETE_EXTRA_INFO") {
        handleDeleteExtraInfo(request.payload, sendResponse);
        return;
      } else if (request.type === "DELETE_LAST_LINE_EXTRA_INFO") {
        handleDeleteLastLineExtraInfo(request.payload, sendResponse);
        return;
      } else if (request.type === "CLEAR_ALL_IMAGES") {
        handleClearAllImages(sendResponse);
        return;
      } else if (request.type === "GET_CMS_TEMPLATES") {
        handleGetCMSTemplates(sendResponse);
        return;
      } else if (request.type === "SAVE_CMS_TEMPLATES") {
        handleSaveCMSTemplates(request.payload, sendResponse);
        return;
      } else if (request.type === "CREATE_COMPLAINT") {
        // Fire-and-forget - chỉ cần mở tab CMS, không cần response
        handleCreateComplaint(request.payload).catch(error => {
          console.error('[BG] Error in CREATE_COMPLAINT (fire-and-forget):', error);
        });
        // Không sendResponse, không return true
      }
      if (request.type === "SEARCH_ORG_INFO") {
        handleSearchOrgInfo(request.payload, sendResponse);
        return true; // Async response
      }
      if (request.type === "GET_CMS_AUTO_CONFIGS") {
        handleGetCMSAutoConfigs(sendResponse);
        return true;
      } else if (request.type === "SAVE_CMS_AUTO_CONFIGS") {
        handleSaveCMSAutoConfigs(request.payload, sendResponse);
        return true;
      }

      if (request.type === "CREATE_CMS_TICKET_V2") {
        handleCreateCMSTicketV2(request.payload, sendResponse);
        return true; // Async response
      }
    } else if (request.event === "BADGE") {
      chrome.action.setBadgeText({ text: request.content.toString() });
      sendResponse({ status: "badge_updated" });
    } // Thêm các event khác nếu cần
    if (request.type === "CORRECT_ADDRESS") {
      (async () => {
        try {
          const address = request.payload.address;
          console.log("Đang xử lý địa chỉ với AI:", address);

          // Sửa Prompt để phù hợp với hàm processWithGemini hiện tại (trả về JSON):
          const jsonPrompt = `Dựa vào file dữ liệu địa chỉ đính kèm và địa chỉ sai: "${address}", hãy tìm địa chỉ đúng nhất. Trả về định dạng JSON mảng duy nhất: [{"address": "địa chỉ đúng đầy đủ"}]`;

          const jsonResultString = await processWithGemini(jsonPrompt);
          const jsonResult = JSON.parse(jsonResultString);

          let finalAddress = "";
          if (Array.isArray(jsonResult) && jsonResult.length > 0 && jsonResult[0].address) {
            finalAddress = jsonResult[0].address;
          } else {
            finalAddress = jsonResultString; // Fallback
          }

          sendResponse({ status: "success", result: finalAddress });

        } catch (error: any) {
          console.error("AI Error:", error);
          sendResponse({ status: "error", error: error.message });
        }
      })();
      return true; // Async
    }
    if (request.type === "TRIGGER_SYNC_IMAGES") {
      console.log("[BG] Nhận lệnh sync thủ công từ Sidepanel");

      // Gọi hàm sync (không await để trả response ngay, hoặc await tùy logic)
      bgSyncImages().then(() => {
        // Gửi message IMAGES_UPDATED khi xong
        chrome.runtime.sendMessage({ type: "IMAGES_UPDATED" }).catch(() => { });
      });

      // Trả về success ngay lập tức để Sidepanel không bị treo
      sendResponse({ status: "processing" });
      return true;
    }
    // ===== THÊM MỚI: Xử lý message từ SidePanel (Portal Tab) =====
    if (request.type === "GET_PORTAL_LIST") {
      // SidePanel yêu cầu lấy danh sách hiện tại
      sendResponse({ status: "success", data: currentPortalList });
      return false; // Sync response
    }
    if (request.type === "EXECUTE_PORTAL_ITEM") {
      // SidePanel yêu cầu chạy lại 1 item cụ thể
      const { maBuuGui } = request.payload;
      console.log(`[BG] SidePanel requested execution for: ${maBuuGui}`);

      // Tìm item trong danh sách gốc (bao gồm thông tin đầy đủ)
      // Lưu ý: currentPortalList chỉ lưu trạng thái rút gọn, ta cần tìm trong allScannedItems hoặc 
      // phải lưu trữ data đầy đủ. Ở đây giả sử ta tìm lại trong Firebase hoặc cache.
      // TUY NHIÊN, handleSendAutoToPortal đã load `bgs` cục bộ.
      // Giải pháp đơn giản: Trigger lại logic xử lý đơn lẻ giống processSinglePortalItem

      // Gọi hàm xử lý (bất đồng bộ)
      handleExecuteSingleItemFromPanel(maBuuGui).then((res: any) => {
        // Gửi event cập nhật lại cho Panel (nếu cần)
        broadcastPortalListUpdate();
      });

      sendResponse({ status: "processing" });
      return true;
    }
    if (request.type === "PRINT_PORTAL_LIST") {
      console.log("[BG] SidePanel requested PRINT list");
      // Gọi hàm in ấn có sẵn
      // Lấy danh sách các mã đang có trong List (lọc success hoặc lấy hết tùy logic)
      // Ở đây ta lấy hết các mã trong currentPortalList
      const listToPrint = currentPortalList.map(i => i.MaBuuGui);
      if (listToPrint.length > 0) {
        printMaHieus(listToPrint);
        sendResponse({ status: "success", message: "Đang gửi lệnh in..." });
      } else {
        sendResponse({ status: "error", message: "Danh sách trống" });
      }
      return false;
    }

    if (request.type === "DELETE_PORTAL_ITEM") {
      const { maBuuGui } = request.payload;
      removePortalItem(maBuuGui);
      sendResponse({ status: "success" });
      return false;
    }

    // Capture SEND_MH from content script
    if (request.event === "CONTENT" && request.message === "SEND_MH") {
      // content: MaBuuGui, content1: Money
      const maBuuGui = request.content;
      const money = request.content1;
      if (maBuuGui && money) {
        updatePortalItemMoney(maBuuGui, money);
      }
    }
  }
  )();
  return true; // Quan trọng: Luôn trả về true để giữ kênh message mở cho các xử lý bất đồng bộ
});
const preParePrintMaHieus = async (maHieus: string[]) => {
  await prepareBlobs(maHieus);
};

async function handleAiKeyAction(request: any) {
  if (!db) return { status: "error", error: "Firebase not initialized" };

  try {
    const { action, payload } = request;

    if (action === "GET_ALL") {
      // Trả về dữ liệu cache ngay lập tức
      return { status: "success", data: aiKeysData };
    }

    if (action === "ADD") {
      const newKeyRef = db.ref("AI_KEYS").push();
      await newKeyRef.set({
        name: payload.name,
        key: payload.key
      });
      return { status: "success" };
    }

    if (action === "EDIT") {
      await db.ref(`AI_KEYS/${payload.id}`).set({
        name: payload.name,
        key: payload.key
      });
      return { status: "success" };
    }

    if (action === "DELETE") {
      await db.ref(`AI_KEYS/${payload.id}`).remove();
      return { status: "success" };
    }

  } catch (error: any) {
    console.error("AI Key Action Error:", error);
    return { status: "error", error: error.message };
  }
}

/**
 * Lưu thông tin thêm vào Firebase
 */
async function handleUpdateExtraInfo(
  payload: { maVanDon: string; content: string },
  sendResponse: (response: any) => void,
) {
  try {
    const { maVanDon, content } = payload;

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lấy log cũ từ Firebase
    const snapshot = await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).get();
    const oldLog = snapshot.val() || "";

    // Tạo timestamp
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const timestamp = `${day}-${month}-${year} ${hours}:${minutes}`;

    // Tạo log entry mới
    const newLogEntry = `${timestamp} ${content}`;

    // Thêm log mới
    const updatedLog = oldLog ? `${oldLog}\n${newLogEntry}` : newLogEntry;

    // Lưu vào Firebase
    await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).set(updatedLog);

    console.log(`Đã cập nhật thông tin cho ${maVanDon} vào Firebase`);
    sendResponse({ status: "success", updatedLog: updatedLog });
  } catch (error: any) {
    console.error("Lỗi khi cập nhật thông tin thêm:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Lấy thông tin thêm từ Firebase
 */
async function handleGetExtraInfo(
  payload: { maVanDon: string },
  sendResponse: (response: any) => void,
) {
  try {
    const { maVanDon } = payload;

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lấy dữ liệu từ Firebase
    const snapshot = await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).get();
    const data = snapshot.val() || "";

    sendResponse({ status: "success", data: data });
  } catch (error: any) {
    console.error("Lỗi khi lấy thông tin thêm:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Xóa thông tin thêm khỏi Firebase
 */
async function handleDeleteExtraInfo(
  payload: { maVanDon: string },
  sendResponse: (response: any) => void,
) {
  try {
    const { maVanDon } = payload;

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Xóa dữ liệu khỏi Firebase
    await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).remove();

    console.log(`Đã xóa thông tin thêm của ${maVanDon} khỏi Firebase`);
    sendResponse({ status: "success" });
  } catch (error: any) {
    console.error("Lỗi khi xóa thông tin thêm:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Xóa dòng cuối cùng của thông tin thêm từ Firebase
 */
async function handleDeleteLastLineExtraInfo(
  payload: { maVanDon: string },
  sendResponse: (response: any) => void,
) {
  try {
    const { maVanDon } = payload;

    console.log(`[BG] handleDeleteLastLineExtraInfo được gọi cho ${maVanDon}`);

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lấy log hiện tại từ Firebase
    const snapshot = await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).get();
    const currentLog = snapshot.val() || "";

    console.log(`[BG] Current log length: ${currentLog.length}`);
    console.log(`[BG] Current log:`, currentLog);

    if (!currentLog || currentLog.trim() === "") {
      console.log(`[BG] Không có thông tin để xóa`);
      sendResponse({ status: "error", error: "Không có thông tin để xóa" });
      return;
    }

    // Tách các dòng
    const lines = currentLog
      .split("\n")
      .filter((line: string) => line.trim() !== "");
    console.log(`[BG] Số dòng hiện tại: ${lines.length}`);

    if (lines.length === 0) {
      // Không có dòng nào, xóa toàn bộ
      console.log(`[BG] Không có dòng nào, xóa node`);
      await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).remove();
      sendResponse({ status: "success", updatedLog: "" });
      return;
    }

    // Xóa dòng cuối
    const removedLine = lines.pop();
    console.log(`[BG] Đã xóa dòng: ${removedLine}`);
    console.log(`[BG] Số dòng còn lại: ${lines.length}`);

    // Tạo log mới
    const updatedLog = lines.join("\n");
    console.log(`[BG] Updated log:`, updatedLog);

    if (updatedLog.trim() === "") {
      // Nếu không còn dòng nào, xóa luôn node trên Firebase
      console.log(`[BG] Không còn dòng nào, xóa node`);
      await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).remove();
      sendResponse({ status: "success", updatedLog: "" });
    } else {
      // Lưu log mới vào Firebase
      console.log(`[BG] Lưu log mới vào Firebase`);
      await db.ref(`MYVNPOST/ExtraInfo/${maVanDon}`).set(updatedLog);
      sendResponse({ status: "success", updatedLog: updatedLog });
    }

    console.log(`[BG] Đã xóa dòng cuối của ${maVanDon} khỏi Firebase`);
  } catch (error: any) {
    console.error("[BG] Lỗi khi xóa dòng cuối:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Clear all images from Firebase Realtime Database
 * Xóa toàn bộ ảnh từ Firebase (imported_images node)
 */
async function handleClearAllImages(
  sendResponse: (response: any) => void,
) {
  try {
    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Get keyMessage from chrome.storage.local
    const keyMessage = await new Promise<string>((resolve) => {
      chrome.storage.local.get("keyMessage", (result) => {
        resolve(result.keyMessage || "maychu");
      });
    });

    const firebasePath = `PORTAL/CHILD/${keyMessage}/imported_images`;

    console.log(`[BG] Clearing all images from Firebase path: ${firebasePath}`);

    // Get count before deletion (for response)
    const snapshot = await db.ref(firebasePath).get();
    const imageCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;

    // Remove entire imported_images node
    await db.ref(firebasePath).remove();

    console.log(`[BG] Successfully deleted ${imageCount} images from Firebase`);
    sendResponse({
      status: "success",
      deletedCount: imageCount,
      message: `Đã xóa ${imageCount} hình ảnh thành công`
    });
  } catch (error: any) {
    console.error("[BG] Error clearing all images:", error);
    sendResponse({
      status: "error",
      error: error.message || "Không thể xóa hình ảnh"
    });
  }
}

/**
 * Lấy danh sách mẫu CMS từ Firebase (chung cho tất cả người dùng)
 */
async function handleGetCMSTemplates(
  sendResponse: (response: any) => void,
) {
  try {
    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lấy templates từ Firebase path chung
    const snapshot = await db.ref('CMS_TEMPLATES').get();
    const templates = snapshot.val() || [];

    console.log(`[BG] Đã tải ${templates.length} mẫu CMS từ Firebase`);
    sendResponse({ status: "success", templates: templates });
  } catch (error: any) {
    console.error("[BG] Lỗi khi lấy mẫu CMS:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Lưu danh sách mẫu CMS lên Firebase (chung cho tất cả người dùng)
 */
async function handleSaveCMSTemplates(
  payload: { templates: string[] },
  sendResponse: (response: any) => void,
) {
  try {
    const { templates } = payload;

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lọc bỏ các template rỗng
    const validTemplates = templates.filter(t => t && t.trim() !== '');

    // Lưu vào Firebase path chung
    await db.ref('CMS_TEMPLATES').set(validTemplates);

    console.log(`[BG] Đã lưu ${validTemplates.length} mẫu CMS lên Firebase`);
    sendResponse({ status: "success", templates: validTemplates });
  } catch (error: any) {
    console.error("[BG] Lỗi khi lưu mẫu CMS:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

async function handleCheckPortal() {
  try {
    updateToPhone("message", "Đang gửi yêu cầu lấy danh sách mã hiệu tồn...");

    // 1. Gửi lệnh "getmahieuton" lên PC
    await updateToPC("getmahieuton", "");

    // 2. Chờ nhận phản hồi từ PC thông qua Firebase
    updateToPhone(
      "message",
      "Đã gửi lệnh lên PC, đang chờ danh sách mã hiệu...",
    );

    // Thiết lập Promise để chờ phản hồi từ PC
    const codesData = await waitForMaHieuListFromPC();

    // 3. Xử lý portal dựa trên danh sách mã hiệu
    await processPortalWithMaHieuList(codesData);
  } catch (error: any) {
    console.error("Lỗi trong handleCheckPortal:", error);
    updateToPhone("message", `Lỗi kiểm tra portal: ${error.message}`);
  }
}

// Biến toàn cục để lưu trữ response từ PC
let pendingMaHieuResponse: {
  resolve: (value: { allCodes: string[]; unprocessedCodes: string[] }) => void;
  reject: (reason: any) => void;
} | null = null;

/**
 * Xử lý response mã hiệu từ PC
 */
async function handleMaHieuFromPC(data: any): Promise<void> {
  try {
    console.log("Received mã hiệu response from PC:", data);

    if (!pendingMaHieuResponse) {
      console.log("No pending request for mã hiệu response");
      return;
    }

    const responseData = JSON.parse(data.DoiTuong);

    // Kiểm tra nếu responseData là mảng HangHoaItem
    if (Array.isArray(responseData)) {
      // Lấy tất cả mã hiệu từ PC
      const allCodes = responseData
        .map((item: any) => item.SH)
        .filter((code: string) => code && code.trim() !== "");

      // Lọc các item có State = 0 (chưa đóng đi)
      const unprocessedCodes = responseData
        .filter((item: any) => item.ST === 0)
        .map((item: any) => item.SH)
        .filter((code: string) => code && code.trim() !== "");

      const result = { allCodes, unprocessedCodes };
      pendingMaHieuResponse.resolve(result);
    } else {
      console.error("Invalid response format from PC");
      pendingMaHieuResponse.reject(new Error("Invalid response format"));
    }

    pendingMaHieuResponse = null;
  } catch (error) {
    console.error("Error handling mã hiệu from PC:", error);
    if (pendingMaHieuResponse) {
      pendingMaHieuResponse.reject(error);
      pendingMaHieuResponse = null;
    }
  }
}

/**
 * Chờ nhận danh sách mã hiệu từ PC thông qua Firebase
 */
async function waitForMaHieuListFromPC(): Promise<{
  allCodes: string[];
  unprocessedCodes: string[];
}> {
  console.log("waitForMaHieuListFromPC called");
  return new Promise((resolve, reject) => {
    console.log("pendingMaHieuResponse set up");
    // Lưu trữ resolve/reject để sử dụng trong handleMaHieuFromPC
    pendingMaHieuResponse = { resolve, reject };

    // Timeout sau 30 giây
    setTimeout(() => {
      if (pendingMaHieuResponse) {
        pendingMaHieuResponse.reject(
          new Error("Timeout waiting for mã hiệu list from PC"),
        );
        pendingMaHieuResponse = null;
      }
    }, 30000);
  });
}

/**
 * Xử lý portal dựa trên danh sách mã hiệu từ PC
 */
async function processPortalWithMaHieuList(codesData: {
  allCodes: string[];
  unprocessedCodes: string[];
}): Promise<void> {
  try {
    const { allCodes, unprocessedCodes } = codesData;

    // Chuyển đổi thành Set để tra cứu nhanh hơn
    const allCodesSet = new Set(allCodes);
    const unprocessedCodesSet = new Set(unprocessedCodes);

    // Lấy danh sách portal đã đánh dấu hoàn thành từ Firebase
    // console.log("Fetching processed portals from Firebase...");
    const processedPortalsSnapshot = await db!
      .ref("PORTAL/PROCESSED_PORTALS")
      .get();
    if (!processedPortalsSnapshot.exists()) {
      console.log("No processed portals found, initializing empty set.");
    } else {
    }
    const processedPortals = new Set(processedPortalsSnapshot.val() || []);

    // Lấy dữ liệu portal từ API
    let toDayText = formatDateRight(new Date());
    let maHieus = "";

    const portalData: any = await getItemHdr(toDayText, maHieus);
    if (portalData.status === 401) {
      updateToPhone("error", "Lỗi xác thực khi lấy dữ liệu portal");
      return;
    }

    // Lọc các portal có trạng thái "chấp nhận" và chưa được đánh dấu
    const acceptedPortals = portalData.filter(
      (portal: any) =>
        portal.status === "3" && !processedPortals.has(portal.id),
    );

    updateToPhone(
      "message",
      `Tìm thấy ${acceptedPortals.length} portal cần kiểm tra với ${unprocessedCodes.length} mã hiệu chưa đóng đi`,
    );

    // Lấy cache mã hiệu portal từ Firebase (theo ngày)
    const todayKey = formatDateRight(new Date()).replace(/\//g, "-"); // VD: "08-08-2025"
    const portalCodesCache = await getPortalCodesCache(todayKey);

    // Kiểm tra từng portal
    let newlyProcessedPortals: string[] = [];
    let totalChecked = 0;

    for (const portal of acceptedPortals) {
      totalChecked++;

      try {
        // Lấy danh sách mã hiệu của portal này (có cache)
        const maHieusData = await getCachedMaHieusFromPortalId(
          portal.id,
          token,
          portalCodesCache,
          todayKey,
        );

        if (!maHieusData || maHieusData.length === 0) {
          console.warn(`Portal ${portal.id} không có mã hiệu`);
          continue;
        }

        // Trích xuất tất cả mã hiệu từ portal
        const portalCodes = maHieusData
          .flatMap((m: any) => m.itemDetails.map((item: any) => item.ttNumber))
          .filter((code: any) => code); // Loại bỏ giá trị null/undefined

        // Kiểm tra xem TẤT CẢ mã hiệu của portal có trong danh sách từ PC không
        const portalCodesNotInPC = portalCodes.filter(
          (code: any) => !allCodesSet.has(code),
        );

        if (portalCodesNotInPC.length > 0) {
          // console.log(`Portal ${portal.id} (${portal.name}) có ${portalCodesNotInPC.length} mã hiệu không có trong PC - không thể xác định trạng thái:`, portalCodesNotInPC);
          continue; // Bỏ qua portal này vì không thể xác định trạng thái hoàn toàn
        }

        // Tất cả mã hiệu đều có trong PC, kiểm tra xem có mã nào chưa đóng đi không
        const hasUnprocessedCodes = portalCodes.some((code: any) =>
          unprocessedCodesSet.has(code),
        );

        if (!hasUnprocessedCodes) {
          // Portal không có mã hiệu nào chưa đóng đi → đánh dấu hoàn thành
          newlyProcessedPortals.push(portal.id);
          processedPortals.add(portal.id);
        }
        // else {
        //   const unprocessedInPortal = portalCodes.filter((code: any) => unprocessedCodesSet.has(code));
        //   console.log(`Portal ${portal.id} (${portal.name}) vẫn còn ${unprocessedInPortal.length}/${portalCodes.length} mã hiệu chưa đóng đi:`, unprocessedInPortal);
        // }
      } catch (error: any) {
        console.error(`Lỗi khi kiểm tra portal ${portal.id}:`, error);
        updateToPhone(
          "message",
          `Lỗi kiểm tra portal ${portal.name}: ${error.message}`,
        );
      }
    }

    // Cập nhật danh sách portal đã xử lý lên Firebase
    if (newlyProcessedPortals.length > 0) {
      await db!
        .ref("PORTAL/PROCESSED_PORTALS")
        .set(Array.from(processedPortals));
      updateToPhone(
        "message",
        `Đã đánh dấu ${newlyProcessedPortals.length} portal `,
      );
    }

    // Cập nhật dữ liệu portal (loại bỏ những portal đã hoàn thành)
    const updatedPortalData = portalData.filter(
      (portal: any) => !processedPortals.has(portal.id),
    );

    // Loại bỏ các portal có trạng thái = 2 và số lượng = 0
    const filteredPortalData = updatedPortalData.filter(
      (m: any) =>
        !((m.status === "2" || m.status === "1") && Number(m.amount) === 0),
    );

    const newItems = filteredPortalData.map((m: any) => ({
      Id: m.id,
      Name: m.name,
      MaKH: m.code,
      TrangThai: m.status,
      SoLuong: m.amount,
      NguoiNhap: m.username,
    }));

    // Cập nhật Firebase
    await db!.ref("PORTAL/MAINPAGE/").remove();
    await db!.ref("PORTAL/MAINPAGE/").set(newItems);

    updateToPhone(
      "message",
      `Hoàn thành kiểm tra ${newItems.length} portal chưa xử lý`,
    );
  } catch (error: any) {
    console.error("Lỗi trong processPortalWithMaHieuList:", error);
    updateToPhone("error", `Lỗi kiểm tra trạng thái portal: ${error.message}`);
  }
}

// --- HÀM TÁCH RIÊNG XỬ LÝ LOOP PORTAL ---
async function processPortalListLoop(
  bgs: BuuGuiProps[],
  startIndex: number,
  maKH: string,
  options: any,
  isDeletePhone: boolean,
  keyMessage: string,
  logPrefix: string = "BG: PortalLoop -"
) {
  let shouldStopLoop = false;
  let successfulProcessCount = 0; // Đếm local cho lần chạy này
  const REFRESH_THRESHOLD = 40;

  updateToPhone("message", `Bắt đầu xử lý ${bgs.length - startIndex} mục...`, keyMessage);

  for (let i = startIndex; i < bgs.length; i++) {
    if (shouldStopLoop) break;

    const currentItem = bgs[i];

    // Update status: Processing
    updatePortalItemStatus(currentItem.MaBuuGui, "processing");
    chrome.action.setBadgeText({ text: `${i + 1 - startIndex}` });

    try {
      // Tìm tab Portal ready
      // Lưu ý: Ta tìm lại tab mỗi lần lặp hoặc truyền vào. 
      // Tốt nhất là tìm lại để đảm bảo tab còn sống.
      const targetTabId = await findPortalTabId(maKH);
      if (!targetTabId) {
        throw new Error("Mất kết nối với tab Portal.");
      }

      // Gửi message xử lý
      await new Promise<void>((resolve, reject) => {
        chrome.tabs.sendMessage(targetTabId, {
          message: "PROCESS_SINGLE_ITEM",
          current: currentItem,
          makh: maKH,
          keyMessage: keyMessage,
          options: options,
          isDeletePhone: isDeletePhone
        }, async (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && response.status === "success") {
            updatePortalItemStatus(currentItem.MaBuuGui, "success");
            successfulProcessCount++;
            // Logic refresh tab
            if (successfulProcessCount >= REFRESH_THRESHOLD) {
              await hardRefreshSpecificTab(targetTabId);
              successfulProcessCount = 0;
              await delay(500);
            }
            resolve();
          } else {
            const errorMsg = response?.error || "Unknown error";
            updatePortalItemStatus(currentItem.MaBuuGui, "error", errorMsg);
            shouldStopLoop = true;
            updateToPhone("message", `Lỗi khi xử lý ${currentItem.MaBuuGui}: ${errorMsg}. Dừng lại.`, keyMessage);
            resolve();
          }
        });
      });


    } catch (loopError: any) {
      console.error(`${logPrefix} Error processing ${currentItem.MaBuuGui}:`, loopError);
      updatePortalItemStatus(currentItem.MaBuuGui, "error", loopError.message);
      updateToPhone("message", `Lỗi: ${loopError.message}. Dừng lại.`, keyMessage);
      shouldStopLoop = true;
    }
  }

  if (!shouldStopLoop) {
    console.log(`${logPrefix} Loop finished.`);
    updateToPhone("message", "Đã xử lý xong danh sách.", keyMessage);

    // In ấn
    updateToPhone("message", `Đang chuẩn bị in...`, keyMessage);
    const maHieus = bgs.map(m => m.MaBuuGui); // In tất cả hoặc lọc? Logic cũ in tất cả
    printMaHieus(maHieus);
    updateToPhone("message", "In xong.", keyMessage);
    chrome.action.setBadgeText({ text: "OK" });
    await delay(2000);
    chrome.action.setBadgeText({ text: "" });
  }
}
// ----------------------------------------

async function handleSendAutoToPortal(commandData: any): Promise<void> {
  const logPrefix = "BG: handleSendAutoToPortal(Loop) -"; // Tiền tố log
  console.log(`${logPrefix} Received command. Data:`, commandData);

  try {
    // 1. Phân tích dữ liệu lệnh (DoiTuong)
    let parsedDoiTuong: any;
    let startMaBG: string | undefined = undefined; // Mã BG để bắt đầu (tùy chọn)
    let maKH: string;
    let hdrId: string | undefined = undefined; // Mã hợp đồng nếu có
    let options: any;
    let isDeletePhone: boolean = false;
    try {
      parsedDoiTuong = JSON.parse(commandData.DoiTuong);
      maKH = parsedDoiTuong.maKH;
      hdrId = parsedDoiTuong.hdrId; // Lấy mã hợp đồng nếu có
      options = parsedDoiTuong.options;
      isDeletePhone = parsedDoiTuong.isDeletePhone;
      startMaBG = parsedDoiTuong.maBG; // Lấy maBG nếu có

      // --- LƯU CONTEXT CHO VIỆC RUN LẠI TỪ PANEL ---
      currentMaKH = maKH;
      currentOptions = options;
      currentIsDeletePhone = isDeletePhone;
      // ---------------------------------------------

      if (parsedDoiTuong.account && parsedDoiTuong.password) {
        accountPortal = parsedDoiTuong.account;
        passwordPortal = parsedDoiTuong.password;
      }

      if (!maKH) {
        throw new Error("Dữ liệu lệnh thiếu maKH.");
      }
    } catch (parseError: any) {
      console.error(
        `${logPrefix} Failed to parse DoiTuong JSON:`,
        commandData.DoiTuong,
        parseError,
      );
      updateToPhone(
        "error",
        `Lỗi dữ liệu lệnh sendautotoportal: ${parseError.message}`,
      );
      return;
    }
    console.log(
      `${logPrefix} Parsed command - maKH: ${maKH}, startMaBG: ${startMaBG}, options:`,
      options,
    );
    // --- Bước 2: Tìm hoặc Khởi tạo Tab Portal (CHỈ MỘT LẦN) ---
    console.log(`${logPrefix} Finding or Initializing Portal tab ONCE...`);
    const targetTabId = await findPortalTabId(maKH, hdrId); // Gọi hàm tìm/khởi tạo
    if (!targetTabId) {
      // findPortalTabId đã log lỗi và gửi message nếu cần
      console.error(`${logPrefix} Initial Portal tab setup failed. Aborting.`);
      return; // Dừng ngay nếu không có tab ban đầu
    }
    console.log(`${logPrefix} Initial Portal tab ID: ${targetTabId}.`);

    // 2. Lấy danh sách BuuGuis từ Firebase
    console.log(`${logPrefix} Fetching BuuGuis from Firebase: PORTAL/BuuGuis/`);
    let bgs: BuuGuiProps[];
    try {
      const bgsFirebase = await db!.ref("PORTAL/BuuGuis/").get();
      const rawVal = bgsFirebase.val();
      if (!rawVal) {
        console.error(`${logPrefix} No data found at PORTAL/BuuGuis/`);
        updateToPhone("error", "Lỗi: Không có dữ liệu bưu gửi trên Firebase.");
        return;
      }
      bgs = JSON.parse(rawVal);
      if (!Array.isArray(bgs)) {
        throw new Error("Dữ liệu BuuGuis từ Firebase không phải là một mảng.");
      }
      console.log(`${logPrefix} Fetched ${bgs.length} items from Firebase.`);
      if (bgs.length === 0) {
        updateToPhone(
          "info",
          "Không có bưu gửi nào trong danh sách trên Firebase.",
        );
        return;
      }
    } catch (fetchError: any) {
      console.error(
        `${logPrefix} Error fetching or parsing BuuGuis from Firebase:`,
        fetchError,
      );
      updateToPhone("error", `Lỗi lấy dữ liệu Firebase: ${fetchError.message}`);
      return;
    }

    // 3. Xác định chỉ số bắt đầu (startIndex)
    let startIndex = 0;
    if (startMaBG) {
      startIndex = bgs.findIndex((item) => item.MaBuuGui === startMaBG);
      if (startIndex === -1) {
        console.warn(
          `${logPrefix} startMaBG "${startMaBG}" not found in the fetched list. Starting from index 0.`,
        );
        updateToPhone(
          "warning",
          `Không tìm thấy mã bắt đầu ${startMaBG}, xử lý từ đầu.`,
        );
        startIndex = 0; // Nếu không tìm thấy, bắt đầu từ đầu
      } else {
        console.log(`${logPrefix} Found startMaBG at index ${startIndex}.`);
      }
    } else {
      console.log(`${logPrefix} No startMaBG provided. Starting from index 0.`);
    }

    // 4. Gọi hàm xử lý loop shared
    // --- CẬP NHẬT STATE CHO SIDEPANEL ---
    // Mapping dữ liệu từ Firebase sang format hiển thị cho Panel
    currentPortalList = bgs.map((item, idx) => ({
      MaBuuGui: item.MaBuuGui,
      Status: "pending",
      Index: idx
    }));
    currentBgs = bgs; // Save full list context
    broadcastPortalListUpdate();
    // -------------------------------------

    await processPortalListLoop(
      bgs,
      startIndex,
      maKH,
      options,
      isDeletePhone,
      keyMessage
    );

  } catch (initialError: any) {
    // Bắt lỗi xảy ra *trước* vòng lặp (parse JSON, fetch Firebase)
    console.error(
      `${logPrefix} Initial error before starting loop:`,
      initialError,
    );
    updateToPhone(
      "message",
      `Lỗi khởi tạo xử lý theo lệnh: ${initialError.message}`,
    );
    chrome.action.setBadgeText({ text: "INIT_ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  } finally {
    // Đảm bảo badge được xóa nếu không phải OK và không có lỗi nào set badge
    const currentBadge = await chrome.action.getBadgeText({});
    if (currentBadge !== "OK" && !currentBadge.includes("ERR")) {
      chrome.action.setBadgeText({ text: "" });
    }
  }
}

const handleSendToPortal = async (
  doiTuong: any,
  isPrint = false,
): Promise<boolean> => {
  console.log("handleSendToPortal: Bắt đầu gửi...", doiTuong);
  let bgsFirebase: firebase.database.DataSnapshot;
  let bgs: BuuGuiProps[];
  let temp1: any;
  let s: number;
  let tabs: chrome.tabs.Tab[];
  let tabId: number;

  try {
    // Lấy dữ liệu từ Firebase
    bgsFirebase = await db!.ref("PORTAL/BuuGuis/").get();
    const rawVal = bgsFirebase.val();
    if (!rawVal) {
      console.error(
        "handleSendToPortal: Không lấy được dữ liệu BuuGuis từ Firebase.",
      );
      updateToPhone("message", "Lỗi: Không có dữ liệu bưu gửi.", keyMessage);
      return false;
    }
    bgs = JSON.parse(rawVal);

    temp1 = JSON.parse(doiTuong);
    s = bgs?.findIndex((m) => m.MaBuuGui === temp1.maBG);

    if (s === -1) {
      console.warn("handleSendToPortal: Không tìm thấy bưu gửi:", temp1.maBG);
      updateToPhone(
        "message",
        `Lỗi: Không tìm thấy bưu gửi ${temp1.maBG}.`,
        keyMessage,
      );
      return false; // Không tìm thấy thì dừng lại
    }
    console.log("handleSendToPortal: Tìm thấy bưu gửi tại index", s);

    // Lấy tab đang active
    tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true, // Hoặc currentWindow: true tùy thuộc vào kịch bản chính xác
      currentWindow: true,
    });

    if (tabs.length === 0 || !tabs[0]?.id) {
      console.error("handleSendToPortal: Không tìm thấy tab đang active.");
      updateToPhone(
        "message",
        "Lỗi: Không tìm thấy tab Portal đang mở.",
        keyMessage,
      );
      return false; // Không có tab active thì dừng
    }
    tabId = tabs[0].id;
    console.log(`handleSendToPortal: Gửi đến tab ID: ${tabId}`);

    console.log("handleSendToPortal: Kiểm tra options:", temp1.options);

    // *** ĐÁNH DẤU: Bọc sendMessage trong Promise ***
    var isAddOk = await new Promise<boolean>((resolve, reject) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          message: "ADD",
          list: bgs,
          options: temp1.options,
          current: bgs[s],
          makh: temp1.maKH,
          keyMessage: keyMessage,
        },
        (response) => {
          // Hàm callback này được gọi khi content script gọi sendResponse
          // *** ĐÁNH DẤU: Kiểm tra lỗi giao tiếp ***
          if (chrome.runtime.lastError) {
            console.error(
              "handleSendToPortal: Lỗi khi gửi/nhận tin nhắn:",
              chrome.runtime.lastError.message,
            );
            // Reject promise nếu có lỗi ở tầng Chrome API
            return reject(
              new Error(
                chrome.runtime.lastError.message ||
                "Lỗi không xác định khi gửi tin nhắn",
              ),
            );
          }
          // Nếu không có lỗi ở tầng Chrome API, coi như content script đã nhận và xử lý
          console.log(
            "handleSendToPortal: Phản hồi từ content script:",
            response,
          );
          // *** ĐÁNH DẤU: Resolve promise khi nhận được phản hồi ***
          if (response) {
            resolve(true);
          } else {
            resolve(false);
          }
        },
      );
    });
    if (!isAddOk) {
      console.error("handleSendToPortal: Lỗi content script.");
      updateToPhone("error", "Lỗi: từ content script.", keyMessage);
      return false; // Không có phản hồi thì dừng
    }
    // *** ĐÁNH DẤU: Code này chỉ chạy *sau khi* Promise được resolve ***
    console.log("handleSendToPortal: Content script đã xử lý xong lệnh ADD.");
    updateToPhone(
      "message",
      `Đã gửi và xử lý xong ${temp1.maBG} trên Portal.`,
      keyMessage,
    );
    if (isPrint) {
      updateToPhone("message", `Đang chuẩn bị in. Chờ xíu`, keyMessage);
      //chuyển MaBuuGui thành mảng từ bgs
      var maHieus = bgs.map((m) => m.MaBuuGui);
      printMaHieus(maHieus);
      updateToPhone("message", `In xong`, keyMessage);
    }
    return true; // *** ĐÁNH DẤU: Trả về true báo hiệu thành công ***
  } catch (error: any) {
    // Bắt lỗi từ các await trước đó hoặc từ Promise bị reject
    console.error(
      "handleSendToPortal: Lỗi trong quá trình gửi lệnh ADD:",
      error,
    );
    updateToPhone(
      "message",
      `Lỗi khi gửi lệnh ADD (${temp1?.maBG || "?"}): ${error.message}`,
      keyMessage,
    );
    return false; // *** ĐÁNH DẤU: Trả về false báo hiệu thất bại ***
  }
};

async function dieuTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab(
    "https://packnsend.vnpost.vn/tin/quan-ly-tin.html",
    "quan-ly-tin",
  );
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + " ";
  }
  if (activeTab != undefined)
    //wait 2s
    await delay(2000);

  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! },
    func: (text) => {
      var textTr = document.querySelector(
        "#txtTrackingCode",
      ) as HTMLInputElement;
      textTr.value = text;
    },
    args: [text],
  });
}

async function hoanTatTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab(
    "https://packnsend.vnpost.vn/hoan-tat-tin.html",
    "hoan-tat-tin",
    true,
  );
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + ",";
  }
  if (activeTab != undefined)
    //send command
    await delay(2000);
  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! },
    func: (text) => {
      //Điền danh sách mã hiệu chỗ tìm kiếm
      var textTr = document.querySelector("#txtLadingCode") as HTMLInputElement;
      textTr.value = text;
      // Tạo và dispatch sự kiện change
      function pad(n: number) {
        return n < 10 ? "0" + n : n;
      }

      const now = new Date();
      const past = new Date();
      past.setDate(now.getDate() - 20); // trừ 20 ngày

      const todayStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      const pastStr = `${pad(past.getDate())}/${pad(past.getMonth() + 1)}/${past.getFullYear()}`;

      // Gán giá trị vào input
      const input = document.getElementById("txtDateRange");
      (input as HTMLInputElement).value = `${pastStr} - ${todayStr}`;

      // Trigger sự kiện nếu cần (nếu có event listener trên ô này)
      const event = new Event("change", { bubbles: true });
      if (input) {
        input.dispatchEvent(event);
      } else {
        console.error("Input element is null");
      }

      //thực hiện nhấn nút từ id btnSearch và chờ 2s
      const btnSearch = document.querySelector(
        "#btnSearch",
      ) as HTMLButtonElement;
      if (btnSearch) {
        btnSearch.click();
      }
      //wait 2s
      setTimeout(() => {
        const event = document.createEvent("HTMLEvents");
        event.initEvent("change", true, false);
        //dispatch event change cho textTr
        textTr.dispatchEvent(event);

        //Chọn tất cả
        const selectElement = document.querySelector(
          'select[name="tbl_order_ORD002_length"]',
        );
        if (selectElement) {
          (selectElement as HTMLSelectElement).value = "-1";
          selectElement?.dispatchEvent(event);
        } else {
          console.error("selectElement is null");
        }

        //Đánh dấu chọn tất cả
        const checkall = document.querySelector("#chkAll") as HTMLInputElement;
        checkall.checked = true;

        checkall.dispatchEvent(event);
      }, 2000);
    },
    args: [text],
  });
}
const prepareBlobs = async (maHieus: string[]) => {
  //đảo ngược maHieus
  maHieus = maHieus.reverse();
  //2	1	Bưu kiện - Parcel	1	593200	562310	29/12/2024	TB	2,0	CB593856255VN
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone(
        "message",
        `Đang lưu ${index + 1}|${maHieus.length} MH ${element} `,
      );
      chrome.action.setBadgeText({ text: (index + 1).toString() });
      var blob: Blob | null = null;
      if (blobsTemp.find((m) => m.maHieu === element) != null) {
        blob = blobsTemp.find((m) => m.maHieu === element)?.blob!;
      } else blob = await getBlobMaHieu(element);

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({
          maHieu: element,
          blob: blob,
          dateCreated: Date.now(),
        });
      } else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        break;
      }
    } catch {
      break;
    }
  }
};
interface ProvinceItem {
  ten_tinh: string;
  ma_tinh: string[];
}

interface TinhThanhData {
  vo: ProvinceItem[];
  ra: ProvinceItem[];
  quangnam: ProvinceItem[];
  quangngai: ProvinceItem[];
}

// Lưu trữ dữ liệu tỉnh thành
let tinhThanhData: TinhThanhData | null = null;
/**
 * Nạp dữ liệu từ file tinhthanh.json.
 * Sử dụng cache để chỉ nạp một lần duy nhất.
 */
const loadTinhThanhData = async (): Promise<TinhThanhData> => {
  if (tinhThanhData) {
    return tinhThanhData;
  }
  try {
    const url = chrome.runtime.getURL("tinhthanh.json");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Không thể tải file tinhthanh.json");
    }
    tinhThanhData = await response.json();
    return tinhThanhData!;
  } catch (error) {
    console.error("Lỗi khi nạp dữ liệu tỉnh thành:", error);
    // Trả về object rỗng đúng kiểu để tránh lỗi
    return { vo: [], ra: [], quangnam: [], quangngai: [] };
  }
};

/**
 * Xóa dấu tiếng Việt khỏi một chuỗi, và chuyển đổi 'đ' thành 'd'.
 * Đây là bước quan trọng để so sánh với danh sách tỉnh không dấu.
 * @param str Chuỗi đầu vào có dấu.
 * @returns Chuỗi đã được xóa dấu và chuyển thành chữ thường.
 */
const removeDiacritics = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase() // 1. Chuyển thành chữ thường
    .normalize("NFD") // 2. Tách ký tự và dấu (e.g., 'vĩnh' -> 'v' + 'i' + 'n' + 'h' + '´')
    .replace(/[\u0300-\u036f]/g, "") // 3. Xóa tất cả các ký tự dấu
    .replace(/đ/g, "d"); // 4. Xử lý riêng chữ 'đ' thành 'd'
};

/**
 * Xác định hướng đi ('ra', 'vo', hoặc 'khong_xac_dinh') từ địa chỉ.
 * @param address - Chuỗi địa chỉ người nhận.
 * @param provinces - Đối tượng chứa mảng 'ra' và 'vo'.
 * @returns 'ra', 'vo', hoặc 'khong_xac_dinh'.
 */
const getDirection = (
  address: string,
  provinces: { vo: string[]; ra: string[] },
): string => {
  const normalizedAddress = removeDiacritics(address.toLowerCase());

  // Kiểm tra trong danh sách "ra" trước
  for (const province of provinces.ra) {
    if (normalizedAddress.lastIndexOf(province) != -1) {
      return "ra";
    }
  }

  // Kiểm tra trong danh sách "vô"
  for (const province of provinces.vo) {
    if (normalizedAddress.lastIndexOf(province) != -1) {
      return "vo";
    }
  }

  // Nếu không tìm thấy
  return "khong_xac_dinh";
};

// --- HÀM XỬ LÝ CHÍNH ĐÃ ĐƯỢC CẬP NHẬT ---
/**
 * Xác định nhóm sắp xếp ('quang_nam', 'quang_ngai', 'ra', 'vo', hoặc 'khong_xac_dinh') từ địa chỉ.
 * Kiểm tra các tỉnh đặc biệt trước rồi mới đến các nhóm chung.
 * @param address - Chuỗi địa chỉ người nhận.
 * @param provinces - Đối tượng chứa mảng 'ra' và 'vo'.
 * @returns 'quang_nam', 'quang_ngai', 'ra', 'vo', hoặc 'khong_xac_dinh'.
 */
const getSortingGroup = (
  address: string,
  provinces: { vo: string[]; ra: string[] },
): string => {
  const normalizedAddress = address.toLowerCase();

  // Ưu tiên kiểm tra các trường hợp đặc biệt trước
  if (normalizedAddress.lastIndexOf("quảng nam") != -1) {
    return "quang_nam";
  }
  if (normalizedAddress.lastIndexOf("quảng ngãi") != -1) {
    return "quang_ngai";
  }

  // Nếu không phải trường hợp đặc biệt, kiểm tra trong danh sách "ra"
  for (const province of provinces.ra) {
    // Bỏ qua các tỉnh đã được xử lý riêng để tránh trùng lặp
    if (province === "quảng nam" || province === "quảng ngãi") continue;

    if (normalizedAddress.lastIndexOf(province) != -1) {
      return "ra";
    }
  }

  // Kiểm tra trong danh sách "vô"
  for (const province of provinces.vo) {
    if (normalizedAddress.lastIndexOf(province) != -1) {
      return "vo";
    }
  }

  // Nếu không tìm thấy
  return "khong_xac_dinh";
};
// --- HÀM XỬ LÝ CHÍNH ĐÃ ĐƯỢC CẬP NHẬT ---
const handlePrintSortTinhVaNoiDung = async (data: any) => {
  try {
    // Bước 1: Lấy dữ liệu tỉnh thành từ file JSON
    const provinceData = await loadTinhThanhData();

    // Bước 2: Tạo các Set mã tỉnh để tra cứu nhanh (O(1))
    const voCodes = new Set<string>();
    const raCodes = new Set<string>();
    const quangNamCodes = new Set<string>();
    const quangNgaiCodes = new Set<string>();

    // Helper để fill Set từ dữ liệu JSON
    const fillSet = (list: ProvinceItem[] | undefined, targetSet: Set<string>) => {
      if (!list) return;
      list.forEach(province => {
        if (province.ma_tinh) {
          province.ma_tinh.forEach(code => targetSet.add(code.toString()));
        }
      });
    };

    fillSet(provinceData.vo, voCodes);
    fillSet(provinceData.ra, raCodes);
    fillSet(provinceData.quangnam, quangNamCodes);
    fillSet(provinceData.quangngai, quangNgaiCodes);

    // Bước 3: Lấy dữ liệu chi tiết các mã hiệu từ API
    const res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token);
    if (!res) {
      console.error("Không lấy được dữ liệu chi tiết từ Portal.");
      updateToPhone("error", "Lỗi: Không lấy được dữ liệu chi tiết từ Portal.");
      return;
    }

    // Bước 4: Làm phẳng mảng để có danh sách tất cả các item
    const allItems = (res as NguoiGuiDetailProp[]).flatMap(
      (m) => m.itemDetails
    );

    // Bước 5: Định nghĩa mức độ ưu tiên sắp xếp
    // Nhỏ hơn xếp trước
    const PRIORITY = {
      QUANG_NAM: 1,
      QUANG_NGAI: 2,
      RA: 3,
      VO: 4,     // Bao gồm cả Bình Định (55)
      UNKNOWN: 5
    };

    // Hàm xác định nhóm ưu tiên dựa trên mã tỉnh (Logic Flutter)
    const getGroupPriority = (item: any): number => {
      // Lấy mã tỉnh, ưu tiên receiverProvinceCode (thường là mã 2 số), nếu không có dùng Ext
      // Lưu ý: ItemDetailProp cần có trường chứa mã tỉnh. 
      // Trong type cũ bạn khai báo: receiverProvinceCode, receiverProvinceCodeExt
      // Cần đảm bảo dữ liệu API trả về có trường này.
      let code = item.receiverProvinceCodeExt || item.receiverProvinceCode || "";
      code = code.trim();

      if (!code) return PRIORITY.UNKNOWN;

      // Xử lý đặc biệt cho Bình Định (Mã 55)
      if (code === '55') {
        // Logic Flutter:
        // if (_isBinhDinhSpecialLocation(item.Address)) { ... } else { aggregatedCounts['VÔ']++ }

        // Hiện tại chưa có danh sách địa danh đặc biệt của Bình Định, 
        // nên ta xử lý mặc định vào nhóm VÔ (theo nhánh else của Flutter).
        // Nếu sau này có danh sách "địa danh đặc biệt", thêm logic check item.receiverAddress ở đây.
        return PRIORITY.VO;
      }

      if (quangNamCodes.has(code)) return PRIORITY.QUANG_NAM;
      if (quangNgaiCodes.has(code)) return PRIORITY.QUANG_NGAI;
      if (raCodes.has(code)) return PRIORITY.RA;
      if (voCodes.has(code)) return PRIORITY.VO;

      return PRIORITY.UNKNOWN;
    };

    // Bước 6: Sắp xếp danh sách
    allItems.sort((a, b) => {
      // Tiêu chí 1: Sắp xếp theo Nhóm (Quảng Nam -> Quảng Ngãi -> Ra -> Vô)
      const priorityA = getGroupPriority(a);
      const priorityB = getGroupPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Tiêu chí 2: Nếu cùng nhóm, sắp xếp theo dispatchNumber (nội dung ghi chú/màu sắc)
      const dispatchA = a.dispatchNumber || "";
      const dispatchB = b.dispatchNumber || "";

      return dispatchA.localeCompare(dispatchB);
    });

    // Log kiểm tra
    console.log("Dữ liệu sau khi sắp xếp (Mã - Tỉnh - Nhóm):");
    allItems.forEach(item => {
      const code = item.receiverProvinceCodeExt || item.receiverProvinceCode || "";
      console.log(`${item.ttNumber} - Code: ${code} - Priority: ${getGroupPriority(item)} - Dispatch: ${item.dispatchNumber}`);
    });

    // Bước 7: Trích xuất ttNumber và In
    const sortedMaHieus = allItems.map((item) => item.ttNumber);

    if (sortedMaHieus.length === 0) {
      updateToPhone("error", "Không có mã nào để in sau khi lọc.");
      return;
    }

    await printMaHieus(sortedMaHieus);

  } catch (error: any) {
    console.error("Đã xảy ra lỗi trong quá trình xử lý in:", error);
    updateToPhone("error", `Lỗi khi sắp xếp và in: ${error.message}`);
  }
};

const handlePrintPageSort = async (data: any) => {
  var res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token);
  console.log("handlePrintPageSort: res", res);

  var maHieus = (res as NguoiGuiDetailProp[])
    .map((m) => m.itemDetails.map((n) => n.ttNumber))
    .flat();
  //sap xep ma hieu
  maHieus.sort(customSort);
  await printMaHieus(maHieus);
};

const checkToken = async (): Promise<boolean> => {
  try {
    console.log("checkToken: Testing token validity with test ID...");

    // Sử dụng một ID test để kiểm tra token
    // ID "1061399653" là một ID test cố định
    const res = await getMaHieusFromPortalId(["1061399653"], token);

    // Kiểm tra kết quả trả về
    if (!res) {
      console.log(
        "checkToken: No response from API - token likely invalid or network error",
      );
      return false;
    }

    // Kiểm tra xem có phải là array không
    if (!Array.isArray(res)) {
      console.log("checkToken: Response is not an array");
      return false;
    }

    // Kiểm tra xem có phải là error response không (có thể có status field khi lỗi)
    if (res.length > 0 && (res[0] as any).status) {
      const status = (res[0] as any).status;
      console.log(`checkToken: API returned status ${status}`);

      if (status === 401) {
        console.log("checkToken: Token expired or unauthorized (401)");
        return false;
      } else if (status === 403) {
        console.log("checkToken: Token access forbidden (403)");
        return false;
      } else if (status === 400) {
        console.log(
          "checkToken: Bad request (400) - token may be invalid format",
        );
        return false;
      } else if (status >= 500) {
        console.log("checkToken: Server error (500+) - cannot verify token");
        return false;
      }

      // Status khác có thể vẫn valid, tiếp tục kiểm tra
    }

    // Kiểm tra xem response có structure hợp lệ không
    if (res.length > 0) {
      const firstItem = res[0];

      // Kiểm tra có phải là valid NguoiGuiDetailProp không
      if ((firstItem as NguoiGuiDetailProp).id !== undefined) {
        console.log(
          "checkToken: Valid token - received proper response structure",
        );
        return true;
      }

      // Nếu không có structure mong đợi nhưng có data, vẫn coi là valid
      console.log(
        "checkToken: Response received but structure unclear - assuming valid",
      );
      return true;
    }

    // Nếu array rỗng, có thể token valid nhưng không tìm thấy data cho ID test
    console.log(
      "checkToken: Empty response - token appears valid but no data for test ID",
    );
    return true;
  } catch (error) {
    console.error("checkToken: Error checking token validity:", error);

    // Kiểm tra loại lỗi để đưa ra quyết định chính xác hơn
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes("401") || errorMsg.includes("unauthorized")) {
        console.log("checkToken: Token is invalid (unauthorized)");
        return false;
      } else if (errorMsg.includes("403") || errorMsg.includes("forbidden")) {
        console.log("checkToken: Token access forbidden");
        return false;
      } else if (errorMsg.includes("network") || errorMsg.includes("fetch")) {
        console.log("checkToken: Network error - cannot verify token");
        return false;
      }
    }

    return false;
  }
};

function saveToken(token: string): void {
  chrome.storage.local.set({ token });
  console.log("Token saved:", token);
}
async function saveStorage(value: string): Promise<void> {
  await chrome.storage.local.set({ blobs: value });
}
async function saveStorageExcel(value: string): Promise<void> {
  await chrome.storage.local.set({ excel: value });
}

const handleGetMaHieus = async (data: any) => {
  const res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token);
  if (!res) return;
  const maHieus = res
    .map((m: NguoiGuiDetailProp) =>
      m.itemDetails.map((n) => ({
        ID: m.id,
        Code: n.ttNumber,
        IDCODE: n.id,
        Weight: n.weight,
        Address: n.receiverAddress,
        Name: n.receiverName,
        Date: n.createdDate,
        ProvinceCode: n.receiverProvinceCodeExt || n.receiverProvinceCode,
        Money: n.codAmount,
      })),
    )
    .flat();
  return maHieus;
};

const handleGetPortal = async (time: string = "") => {
  updateToPhone("message", " Đang lấy data từ Portal");
  handleGetDataFromPortal(time);
};
const handleGetDataFromPortal = async (time: string) => {
  try {
    let toDayText = formatDateRight(new Date());
    let maHieus = ""; // Default empty string for ttNumber

    if (time != "") {
      // Parse the time parameter to extract date and maHieus
      // Format: "date|maHieus" where maHieus comes after the pipe separator
      const parts = time.split("|");
      if (parts[0].length != 0) toDayText = parts[0]; // Date part
      if (parts.length > 1) {
        maHieus = parts[1]; // maHieus part after the pipe
      }
      console.log("Parsed date:", toDayText, "maHieus:", maHieus);
    }

    const data: any = await getItemHdr(toDayText, maHieus);
    if (data.status === 401) {
      return;
    }

    const newItems = data.map((m: NguoiGuiProp) => ({
      Id: m.id,
      Name: m.name,
      MaKH: m.code,
      TrangThai: m.status,
      SoLuong: m.amount,
      NguoiNhap: m.username,
    }));
    // / Xóa dữ liệu tại "PORTAL/MAINPAGE / "
    await db!.ref("PORTAL/MAINPAGE/").remove();

    // Ghi dữ liệu mới vào "PORTAL/MAINPAGE/"
    await db!.ref("PORTAL/MAINPAGE/").set(newItems);
  } catch (error) {
    console.error("Error fetching data from portal:", error);
  }
};

const handleEditHangHoa = (data: any) => {
  createOrActiveTab(
    "https://portalkhl.vnpost.vn/itemhdr/?id=" + data.DoiTuong,
    "portalkhl.vnpost.vn",
    true,
  );
};

const printMaHieus = async (maHieus: string[]) => {
  chrome.action.setBadgeText({ text: "In..." });
  chrome.action.setBadgeBackgroundColor({ color: "#0000FF" });

  try {
    // Lấy blobs từ mảng maHieus
    var blobs: Blob[] | null = await getBlobs(maHieus);
    console.log("Đã lấy blobs:", blobs?.length || 0);

    if (blobs == null || blobs.length === 0) {
      console.error("Không lấy được blobs hoặc danh sách rỗng");
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
      await delay(1000);
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    // Kiểm tra xem offscreen document đã tồn tại chưa
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    // Nếu chưa có, tạo mới
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
        justification: "Print PDF files using DOM APIs",
      });
    }

    var blob = await convertBlobsToBlob(blobs);
    var base64String = await pdfBlobTo64(blob);

    // Gửi message đến offscreen document để in
    const response = await chrome.runtime.sendMessage({
      type: "PRINT_PDF",
      base64Data: base64String,
    });

    if (response && response.success) {
      console.log("In PDF thành công");
      chrome.action.setBadgeBackgroundColor({ color: "#00FF00" });
    } else {
      console.error("Lỗi khi in PDF:", response?.error);
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    }
  } catch (error: any) {
    console.error("Lỗi khi tạo/sử dụng offscreen document:", error);
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  }

  //waiting 1 s
  await delay(1000);
  chrome.action.setBadgeText({ text: "" });
};

const printARPages = async (maHieus: string[]) => {
  chrome.action.setBadgeText({ text: "In AR..." });
  chrome.action.setBadgeBackgroundColor({ color: "#0000FF" });

  try {
    // Lấy blobs từ mảng maHieus cho AR pages
    var blobs: Blob[] | null = await getBlobsForAR(maHieus);
    console.log("Đã lấy blobs AR:", blobs?.length || 0);

    if (blobs == null || blobs.length === 0) {
      console.error("Không lấy được blobs AR hoặc danh sách rỗng");
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
      await delay(1000);
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    // Kiểm tra xem offscreen document đã tồn tại chưa
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    // Nếu chưa có, tạo mới
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
        justification: "Print PDF files using DOM APIs",
      });
    }

    var blob = await convertBlobsToBlob(blobs);
    var base64String = await pdfBlobTo64(blob);

    // Gửi message đến offscreen document để in
    const response = await chrome.runtime.sendMessage({
      type: "PRINT_PDF",
      base64Data: base64String,
    });

    if (response && response.success) {
      console.log("In PDF AR thành công");
      chrome.action.setBadgeBackgroundColor({ color: "#00FF00" });
    } else {
      console.error("Lỗi khi in PDF AR:", response?.error);
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    }
  } catch (error: any) {
    console.error("Lỗi khi tạo/sử dụng offscreen document AR:", error);
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  }

  //waiting 1 s
  await delay(1000);
  chrome.action.setBadgeText({ text: "" });
};

const updateToPhone = async (
  lenh: String,
  doiTuong: String,
  key: string = keyMessage,
) => {
  await db!
    .ref(`PORTAL/CHILD/${key}/message/tophone`)
    .set({
      Lenh: lenh,
      DoiTuong: doiTuong,
      TimeStamp: Date.now().toLocaleString(),
    })
    .catch((error: any) => {
      console.error("Error saving data:", error);
    });
};
const updateToPC = async (lenh: String, doiTuong: String) => {
  await db!
    .ref(`${keyMessage}/message/topc`)
    .set({
      Lenh: lenh,
      DoiTuong: doiTuong,
      TimeStamp: Date.now().toLocaleString(),
    })
    .catch((error: any) => {
      console.error("Error saving data:", error);
    });
};

//create struct for blobs have blob and maHieu
interface BlobStruct {
  maHieu: string;
  blob: Blob;
  dateCreated: number; // Số miligiây kể từ Epoch (dùng new Date().getTime())
}
const getBlobs = async (maHieus: string[]) => {
  //đảo ngược maHieus
  // maHieus = maHieus.reverse()
  //2	1	Bưu kiện - Parcel	1	593200	562310	29/12/2024	TB	2,0	CB593856255VN
  var blobs: Blob[] = [];
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone(
        "message",
        `In ${index + 1}|${maHieus.length} MH ${element} `,
      );
      chrome.action.setBadgeText({ text: (index + 1).toString() });

      var blob: Blob | null = null;
      if (blobsTemp.find((m) => m.maHieu === element) != null) {
        blob = blobsTemp.find((m) => m.maHieu === element)?.blob!;
      } else blob = await getBlobMaHieu(element);

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({
          maHieu: element,
          blob: blob,
          dateCreated: Date.now(),
        });
        blobs.push(blob!);
      } else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        return null;
      }
    } catch {
      break;
    }
  }
  return blobs;
};

const getBlobsForAR = async (maHieus: string[]) => {
  var blobs: Blob[] = [];
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone(
        "message",
        `In AR ${index + 1}|${maHieus.length} MH ${element} `,
      );
      chrome.action.setBadgeText({ text: (index + 1).toString() });

      var blob: Blob | null = null;
      // Thêm "R" vào key để tránh trùng với mã hiệu thường
      const arKey = element + "R";
      if (blobsTemp.find((m) => m.maHieu === arKey) != null) {
        blob = blobsTemp.find((m) => m.maHieu === arKey)?.blob!;
      } else blob = await getBlobMaHieuForAR(element);

      if (blob != null) {
        //save blob to indexedDB với key có "R"
        await saveBlob({
          maHieu: arKey,
          blob: blob,
          dateCreated: Date.now(),
        });
        blobs.push(blob!);
      } else {
        updateToPhone("message", `Lỗi MH AR khi in ${element}`);
        return null;
      }
    } catch {
      break;
    }
  }
  return blobs;
};
const getBlobMaHieu = async (maHieu: string): Promise<Blob | null> => {
  const res = await fetchPrintByMH(maHieu, token);
  const base64String = res[0]; // your base64 string
  return base64ToBlob(base64String, "application/pdf");
};

const getBlobMaHieuForAR = async (maHieu: string): Promise<Blob | null> => {
  const res = await fetchPrintByMHForAR(maHieu, token);
  const base64String = res[0]; // your base64 string
  return base64ToBlob(base64String, "application/pdf");
};

async function loadTodaysBlobs(): Promise<BlobStruct[]> {
  return new Promise<BlobStruct[]>((resolve, reject) => {
    const openRequest: IDBOpenDBRequest = indexedDB.open("MyDatabase", 1);

    // Nếu database chưa tồn tại hoặc cần nâng cấp phiên bản
    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("blobs")) {
        const objectStore = db.createObjectStore("blobs", {
          keyPath: "maHieu",
        });
        objectStore.createIndex("dateCreatedIndex", "dateCreated", {
          unique: false,
        });
      }
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction("blobs", "readonly");
      const objectStore = transaction.objectStore("blobs");
      const dateIndex = objectStore.index("dateCreatedIndex");

      // Xác định khoảng thời gian cho ngày hôm nay
      const now = new Date();
      const startOfToday: number = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const startOfTomorrow: number = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();

      // Tạo IDBKeyRange từ đầu ngày hôm nay đến cuối ngày (startOfTomorrow - 1ms)
      const range = IDBKeyRange.bound(startOfToday, startOfTomorrow - 1);

      const blobsTemp: BlobStruct[] = [];
      const cursorRequest: IDBRequest = dateIndex.openCursor(range);

      cursorRequest.onsuccess = (event: Event) => {
        const cursor: IDBCursorWithValue | null = (event.target as IDBRequest)
          .result;
        if (cursor) {
          blobsTemp.push(cursor.value);
          cursor.continue();
        } else {
          resolve(blobsTemp);
        }
      };

      cursorRequest.onerror = (event: Event) => {
        reject((event.target as IDBRequest).error);
      };
    };

    openRequest.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}
const khoitaoPNS = async () => {
  //thuc hien kiem tra pns co khong
  //neu khong co thi tao tab moi
  var tab: any = await createOrActiveTab(
    "https://packnsend.vnpost.vn/",
    "packnsend.vnpost.vn",
  );
  await delay(3000);
  //neu co thi thuc hien lay du lieu
  chrome.tabs.sendMessage(
    tab.id!,
    {
      message: "KHOITAOPNS",
      keyMessage: keyMessage,
    },
    (res) => {
      if (!chrome.runtime.lastError) {
        console.log("Đã nhận tin nhắn từ content PNS", res);
      } else {
        console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
      }
    },
  );
};

const handleGetPNS = async (dayLast: any) => {
  updateToPhone("message", "Đã nhận lệnh lấy dữ liệu từ PNS");
  let khachHangsTemp = await handleGetDataFromPNS(dayLast);
  if (khachHangsTemp.length > 0) {
    //tổng hợp trạng thái khachHangsTemp[0]

    khachHangsTemp.forEach((m) => {
      m.countState.countChapNhan = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã chấp nhận",
      ).length;
      m.countState.countDangGom = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đang đi thu gom",
      ).length;
      m.countState.countNhanHang = m.BuuGuis.filter(
        (m) => m.TrangThai === "Nhận hàng thành công",
      ).length;
      m.countState.countPhanHuong = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã phân hướng",
      ).length;
    });
    await db!.ref("PNS/KhachHangs").set(khachHangsTemp);
    await db!.ref("PNS/TimeUpdate").set(new Date().toLocaleTimeString());
  } else {
    updateToPhone("message", "Chưa đăng nhập PNS");
    await khoitaoPNS();
  }
};
// const tichHopCookieToString = (cookies: chrome.cookies.Cookie[]): string => {
//   var text = "";
//   cookies.forEach((m) => {
//     text += m.name + "=" + m.value + "; ";
//   });
//   return text;
// };

// const getAllCookies = (url: string) => {
//   return new Promise<string>((resolve, _reject) => {
//     chrome.cookies.getAll({ domain: url }, (cookies) => {
//       const texts: string = tichHopCookieToString(cookies);
//       resolve(texts);
//     });
//   });
// };

// --- HÀM MỚI: Đảm bảo đăng nhập Portal ---
/**
 * Kiểm tra xem tab có cần đăng nhập Portal không và thực hiện đăng nhập nếu cần.
 * @param tabId ID của tab cần kiểm tra và đăng nhập.
 * @returns Promise chứa đối tượng { success: boolean, loadedTab?: chrome.tabs.Tab }
 */
async function ensurePortalLogin(
  tabId: number,
): Promise<{ success: boolean; loadedTab?: chrome.tabs.Tab }> {
  let loadedTab: chrome.tabs.Tab | undefined;
  let originalUrl: string | undefined;
  let loginSuccess = false;

  try {
    // Lấy thông tin tab hiện tại và chờ tải xong
    loadedTab = await waitForTabToLoad(tabId);
    console.log(
      `ensurePortalLogin: Tab ${tabId} tải xong tại URL: ${loadedTab.url}`,
    );

    if (loadedTab.url && loadedTab.url.includes("login")) {
      await delay(1000);
      console.log(
        `ensurePortalLogin: Tab ${tabId} đang ở trang login. Thực hiện đăng nhập...`,
      );
      updateToPhone("message", "Đang đăng nhập vào Portal...");
      originalUrl = loadedTab.url; // Lưu URL trang login

      // Gửi lệnh đăng nhập tới content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (mAccount, mPassword) => {
          window.postMessage({
            type: "CONTENT",
            message: "ADDLOGIN",
            account: mAccount,
            password: mPassword,
          });
        },
        args: [accountPortal, passwordPortal],
      });
      console.log(
        `ensurePortalLogin: Đã tiêm script đăng nhập vào tab ${tabId}`,
      );

      // Chờ tab tải xong sau khi đăng nhập
      console.log(
        `ensurePortalLogin: Đang chờ tab ${tabId} điều hướng/tải lại sau khi thử đăng nhập...`,
      );
      loadedTab = await waitForTabLoadAfterAction(tabId, originalUrl, 60000); // Chờ tối đa 60s
      console.log(
        `ensurePortalLogin: Tab ${tabId} sau khi chờ đăng nhập. URL cuối: ${loadedTab?.url}`,
      );

      // Kiểm tra lại xem đăng nhập thành công không
      if (loadedTab?.url?.includes("login")) {
        console.error(
          `ensurePortalLogin: Đăng nhập thất bại, vẫn ở trang login (${tabId}).`,
        );
        updateToPhone("message", "Lỗi: Đăng nhập Portal thất bại.");
        loginSuccess = false;
      } else if (!loadedTab?.url) {
        console.error(
          `ensurePortalLogin: Không lấy được URL cuối cùng của tab ${tabId} sau khi chờ.`,
        );
        updateToPhone(
          "message",
          "Lỗi: Không xác định được trạng thái sau đăng nhập.",
        );
        loginSuccess = false;
      } else {
        console.log(
          `ensurePortalLogin: Đăng nhập thành công (đã rời trang login) cho tab ${tabId}.`,
        );
        loginSuccess = true;
      }
    } else {
      console.log(
        `ensurePortalLogin: Tab ${tabId} không ở trang login, giả sử đã đăng nhập.`,
      );
      loginSuccess = true; // Giả sử đã đăng nhập nếu không thấy trang login
    }
  } catch (error: any) {
    console.error(
      `ensurePortalLogin: Lỗi trong quá trình kiểm tra/đăng nhập cho tab ${tabId}:`,
      error,
    );
    updateToPhone("message", `Lỗi đăng nhập Portal: ${error.message}`);
    loginSuccess = false;
  }

  return { success: loginSuccess, loadedTab: loadedTab };
}
// --- KẾT THÚC HÀM MỚI ---

// Biến global để lưu hdrId sau khi khởi tạo thành công
let currentHdrId: string | null = null;

// Hàm helper để lấy hdrId hiện tại
const getCurrentHdrId = (): string | null => {
  return currentHdrId;
};

// Hàm reset hdrId
const resetCurrentHdrId = (): void => {
  currentHdrId = null;
};

const waitForContentScriptReady = async (
  tabId: number,
  timeout: number = 10000,
): Promise<boolean> => {
  const startTime = Date.now();
  console.log(`Waiting for content script ready on tab ${tabId}...`);
  while (Date.now() - startTime < timeout) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        message: "PING",
      });
      if (response && response.status === "pong") {
        console.log(`Content script ready on tab ${tabId}`);
        return true;
      }
    } catch (e) {
      // Ignore errors, script might not be ready
    }
    await delay(1000);
  }
  console.warn(`Content script NOT ready on tab ${tabId} after ${timeout}ms`);
  return false;
};

const khoiTaoPortal = async (
  data: any,
): Promise<{ hdrId: string; tabId: number } | null> => {
  try {
    console.log("Bắt đầu khởi tạo Portal...", data);
    currentHdrId = null;

    let loginSuccess = false;
    let loadedTab: chrome.tabs.Tab | undefined = undefined;

    // --- SỬA ĐỔI 1: Kiểm tra tab hiện tại để quyết định có reload không ---
    // Tìm tab Portal hiện có
    const tabs = await chrome.tabs.query({ url: "https://portalkhl.vnpost.vn/*" });
    const existingTab = tabs.find(t => t.url && t.url.includes("/accept-api"));

    let shouldReload = true;
    if (existingTab) {
      console.log("Đã ở trang accept-api, không cần reload lại.");
      shouldReload = false;
    }

    // Gọi createOrActiveTab với tham số isReload được tính toán
    var initialTab = await createOrActiveTab(
      "https://portalkhl.vnpost.vn/accept-api",
      "portalkhl.vnpost.vn",
      true,         // isActive
      shouldReload  // isReload: false nếu đã đúng trang (FIX LỖI REFRESH)
    );

    if (!initialTab || !initialTab.id) {
      console.error("Lỗi: Không thể mở hoặc kích hoạt tab Portal.");
      updateToPhone("message", "Lỗi: Không thể mở tab Portal.");
      return null;
    }
    const tabId = initialTab.id;

    // --- Sử dụng hàm ensurePortalLogin ---
    const loginResult = await ensurePortalLogin(tabId);
    loginSuccess = loginResult.success;
    loadedTab = loginResult.loadedTab;

    if (loginSuccess && loadedTab?.id) {
      console.log(`khoiTaoPortal: Đăng nhập OK. Chuẩn bị gửi lệnh...`);
      updateToPhone("message", "Đang khởi tạo hợp đồng...");

      // --- SỬA ĐỔI 2: Tăng thời gian chờ để trang React ổn định ---
      // Portal VNPost sau khi load xong thường mất 1-2s để render form và fetch dữ liệu ngầm
      // Nếu điền quá sớm, React sẽ render lại và xóa trắng form
      console.log("Waiting for Portal to stabilize...");
      await delay(2500);

      // Đảm bảo content script đã sẵn sàng
      const isReady = await waitForContentScriptReady(loadedTab.id);
      if (!isReady) console.warn("Content script có thể chưa sẵn sàng...");

      let response;
      try {
        response = await chrome.tabs.sendMessage(loadedTab.id, {
          message: "KHOITAOPORTAL",
          ...data,
          keyMessage: keyMessage,
        });
      } catch (sendError: any) {
        // ... (Giữ nguyên logic xử lý lỗi connection closed như câu trả lời trước) ...
        console.warn("Lỗi khi gửi KHOITAOPORTAL:", sendError);
        if (sendError.message && (sendError.message.includes("connection") || sendError.message.includes("closed"))) {
          response = { data: "ok_reloading" };
        }
      }

      // ... (Giữ nguyên phần xử lý response và tìm hdrId như câu trả lời trước) ...
      // Copy đoạn xử lý response từ câu trả lời trước vào đây

      console.log("Phản hồi từ content:", response);

      if (response && (response.data === "ok" || response.data === "ok_reloading")) {
        console.log("Content script đã bấm nút. Đang chờ trang Portal reload...");
        updateToPhone("message", "Đang lưu dữ liệu, vui lòng đợi...");

        try {
          await waitForTabLoadAfterAction(loadedTab.id, undefined, 15000);
          await delay(2000);
        } catch (e) {
          console.warn("Timeout chờ reload...");
        }

        // Logic tìm hdrId (Copy từ câu trả lời trước)
        let foundHdrId: string | null = null;
        const currentTab = await chrome.tabs.get(loadedTab.id);
        const currentUrl = currentTab.url || "";
        const urlParams = new URLSearchParams(currentUrl.split("?")[1]);
        foundHdrId = urlParams.get("hdrId");

        if (!foundHdrId) {
          // ... Inject script tìm trong DOM ...
          try {
            const domResults = await chrome.scripting.executeScript({
              target: { tabId: loadedTab.id },
              func: () => {
                const hiddenInput = document.querySelector('input[name="hdrId"]') as HTMLInputElement;
                if (hiddenInput && hiddenInput.value) return hiddenInput.value;
                const firstRowLink = document.querySelector('.rt-tbody .rt-tr-group:first-child a') as HTMLAnchorElement;
                if (firstRowLink && firstRowLink.href) {
                  const match = firstRowLink.href.match(/hdrId=(\d+)/);
                  if (match) return match[1];
                }
                return null;
              }
            });
            if (domResults && domResults[0] && domResults[0].result) foundHdrId = domResults[0].result;
          } catch (e) { }
        }

        if (foundHdrId) {
          currentHdrId = foundHdrId;
          updateToPhone("message", `Khởi tạo thành công. ID: ${foundHdrId}`);
          return { hdrId: foundHdrId, tabId: loadedTab.id };
        } else {
          updateToPhone("message", "Đã lưu nhưng không lấy được mã ID.");
          return null;
        }
      } else {
        updateToPhone("message", `Lỗi khởi tạo: ${response?.data || "Unknown"}`);
        return null;
      }

    } else if (!loginSuccess) {
      return null;
    }
  } catch (error: any) {
    console.error("Lỗi nghiêm trọng khoiTaoPortal:", error);
    updateToPhone("message", `Lỗi hệ thống: ${error.message}`);
    return null;
  }
  return null;
};
const handleKhoiTao = async (data: any): Promise<boolean> => {
  updateToPhone("message", "Đã nhận lệnh khởi tạo");

  const temp = JSON.parse(data.DoiTuong);

  if (temp.account && temp.password) {
    accountPortal = temp.account;
    passwordPortal = temp.password;
  }

  const snapshot = await db!.ref("PORTAL/HopDongs/" + temp.maKH).get();
  const hopDong = snapshot.val();
  const result = await khoiTaoPortal(hopDong);
  return result !== null; // Trả về true nếu có result, false nếu null
};
const handleGetDataFromPNS = async (
  dayLast: any,
): Promise<KhachHangProps[]> => {
  // var cookie = await getCookieFromWeb("packnsend.vnpost.vn");
  const data = await getDataFromPNS(dayLast);
  if (data == null) return [];
  const snapshots = changePNSObjectToSnapshots(data.Data);
  const khachHangs = changeSnapshotToKHs(snapshots);
  khachHangs.sort((a, b) => b.BuuGuis.length - a.BuuGuis.length);
  return khachHangs;
};
const changePNSObjectToSnapshots = (list: any): DataSnapshotProps[] => {
  return list.map((element: any, index: number) => ({
    Index: index,
    KhoiLuong: element.Weigh,
    MaBuuGui: element.QuantityString,
    MaKH: element.CustomerCode,
    MaTin: element.Code,
    TenKH: element.CustomerFullName,
    TenNguoiGui: element.ContactName,
    TimeNhanTin: element.LastUpdateTime,
    TimeTrangThai: element.LastUpdateTime,
    TrangThai: element.StatusName,
  }));
};
const changeSnapshotToKHs = (
  snapshots: DataSnapshotProps[],
): KhachHangProps[] => {
  const khachHangs: KhachHangProps[] = [];
  snapshots.forEach((element) => {
    // Sửa lỗi type: Bổ sung các thuộc tính còn thiếu và đảm bảo KhoiLuong là string nếu cần
    const buuGui: BuuGuiProps = {
      index: 1,
      KhoiLuong: element.KhoiLuong, // Sử dụng giá trị gốc, type import sẽ xử lý
      MaBuuGui: element.MaBuuGui,
      TimeTrangThai: element.TimeTrangThai,
      TrangThai: element.TrangThai,
      // Bổ sung các thuộc tính còn thiếu từ type BuuGuiProps
      Id: null, // Hoặc giá trị mặc định phù hợp khác
      IsBlackList: false, // Hoặc giá trị mặc định phù hợp khác
      Money: 0, // Hoặc giá trị mặc định phù hợp khác
      ListDo: null, // Hoặc giá trị mặc định phù hợp khác
      TrangThaiRequest: null, // Hoặc giá trị mặc định phù hợp khác,
    };

    const b = khachHangs.findIndex((m) => m.MaKH === element.MaKH);
    if (b === -1) {
      khachHangs.push({
        Index: 0,
        MaKH: element.MaKH,
        MaTin: element.MaTin,
        TenKH: element.TenKH,
        TenNguoiGui: element.TenNguoiGui,
        TimeNhanTin: element.TimeNhanTin,
        countState: {
          countChapNhan: 0,
          countDangGom: 0,
          countNhanHang: 0,
          countPhanHuong: 0,
        },
        BuuGuis: [buuGui],
      });
    } else {
      buuGui.index = khachHangs[b].BuuGuis.length + 1;
      khachHangs[b].BuuGuis.push(buuGui);
    }
  });
  return khachHangs;
};
const getBuuGuisFromFirebase = async () => {
  //change to compat

  const bgsFirebase = await ref!.child("PORTAL/BuuGuis/").get();
  return JSON.parse(bgsFirebase.val());
};

const findBuuGuiIndex = (bgs: any, maBG: any) => {
  return bgs.findIndex((m: any) => m.MaBuuGui === maBG);
};

const getActiveTabId = async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    currentWindow: true,
  });
  return tabs.length === 0 ? 0 : tabs[0].id!;
};
const sendMessageToTab = async (
  tabId: any,
  bgs: any,
  currentBuuGui: any,
  maKH: any,
  keyMessage: any,
) => {
  await chrome.tabs.sendMessage(
    tabId,
    {
      message: "ADD",
      list: bgs,
      current: currentBuuGui,
      makh: maKH,
      keyMessage: keyMessage,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error sending message to tab:",
          chrome.runtime.lastError,
        );
      } else {
        console.log("Response from content script:", response);
      }
    },
  );
};

const handlePrintPage = async (data: any) => {
  var listJsonItem = await getMaHieusFromPortalId(JSON.parse(data), token);

  var res = await fetch(
    "https://api-portalkhl.vnpost.vn/khl2024/khl/jasper/JasperVD",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        authorization: `Bearer  ${token}`,
        capikey: "19001235",
        "content-type": "application/json; charset=UTF-8",
        dnt: "1",
        origin: "https://portalkhl.vnpost.vn",
        referer: "https://portalkhl.vnpost.vn/",
        "sec-ch-ua":
          '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
      referrer: "https://portalkhl.vnpost.vn/",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: JSON.stringify({
        idcheck: listJsonItem,
        listReport: ["BD1New"],
        lienNumbers: ["1"],
        hiddenPrice: false,
      }),
      method: "POST",
      mode: "cors",
      credentials: "include",
    },
  );
  var data = await res.json();
  var tab = await createOrActiveTab(
    "https://example.com/",
    "https://example.com/",
    false,
    false,
    true,
  );
  const base64String = data[0]; // your base64 string
  await saveStorage(base64String);

  //waiting 1 s
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await chrome.tabs.sendMessage(tab!.id!, { message: "PRINTBLOB" });
};

const API_BASE_URL = "https://api-pre-portalkhl.vnpost.vn";
const PNS_BASE_URL = "https://packnsend.vnpost.vn";
const fetchPrintByMH = async (maHieu: string, token: string): Promise<any> => {
  const res = await fetch(
    `${API_BASE_URL}/khl-api/khl/jasper/printByTTNumber`,
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; charset=UTF-8",
        authorization: `Bearer ${token}`,
        capikey: "19001235",
      },
      body: JSON.stringify({
        ttNumber: maHieu,
        listReport: ["BD1New"],
        lienNumbers: ["1"],
        hiddenPrice: false,
      }),
    },
  );
  return res.json();
};

const fetchPrintByMHForAR = async (
  maHieu: string,
  token: string,
): Promise<any> => {
  const res = await fetch(
    `${API_BASE_URL}/khl-api/khl/jasper/printByTTNumber`,
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; charset=UTF-8",
        authorization: `Bearer ${token}`,
        capikey: "19001235",
      },
      body: JSON.stringify({
        ttNumber: maHieu,
        listReport: ["BD16"],
        lienNumbers: ["1"],
        hiddenPrice: false,
      }),
    },
  );
  return res.json();
};

const handleXacNhanPortal = async (ids: any, token: string) => {
  try {
    // Build the request body object properly
    let parsedIds;
    try {
      // If ids is a string, try to parse it as JSON
      parsedIds = typeof ids === "string" ? JSON.parse(ids) : ids;
    } catch (error) {
      // If parsing fails, treat it as a single value
      parsedIds = ids;
    }

    const requestBody = {
      username: [accountPortal],
      listId: Array.isArray(parsedIds) ? parsedIds : [parsedIds],
    };

    console.log(
      "Sending request to Portal API with body:",
      JSON.stringify(requestBody),
    );
    updateToPhone("message", "Đang xác nhận Portal...");

    const responseData = await safeFetch(
      API_BASE_URL + "/khl-api/khl/sendBccp/hdr",
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9,vi;q=0.8",
          authorization: `Bearer ${token}`,
          capikey: "19001235",
          "content-type": "application/json; charset=UTF-8",
          priority: "u=1, i",
          "sec-ch-ua":
            '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
        },
        referrer: "https://portalkhl.vnpost.vn/",
        body: JSON.stringify(requestBody),
        method: "POST",
        mode: "cors",
        credentials: "include",
      },
    );

    console.log("Portal API response:", responseData);
    updateToPhone("message", "Xác nhận Portal thành công!");
    console.log("Portal confirmation successful:", responseData);
  } catch (networkError: any) {
    // Handle network errors, timeout, etc.
    console.error("Network error in handleXacNhanPortal:", networkError);

    let errorMessage = "Lỗi kết nối mạng";
    if (networkError.message) {
      if (networkError.message.includes("fetch")) {
        errorMessage = "Không thể kết nối đến Portal API";
      } else if (networkError.message.includes("timeout")) {
        errorMessage = "Kết nối bị timeout. Vui lòng thử lại.";
      } else {
        errorMessage = `Lỗi mạng: ${networkError.message}`;
      }
    }

    updateToPhone("message", errorMessage);
  }
};

const getMaHieusFromPortalId = async (
  ids: any,
  token: string,
): Promise<NguoiGuiDetailProp[] | null> => {
  console.log("IDS ", ids);

  try {
    const res = await Promise.all(
      ids.map(async (id: string) => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/khl-api/khl/portalItem/getItemHdr`,
            {
              headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9,vi;q=0.8",
                authorization: `Bearer ${token}`,
                "content-type": "application/json; charset=UTF-8",
                "sec-ch-ua":
                  '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
              },
              referrer: "https://portalkhl.vnpost.vn/",
              referrerPolicy: "strict-origin-when-cross-origin",
              body: `${id}`, // Assuming body is just the id
              method: "POST",
              mode: "cors",
              credentials: "include",
            },
          );

          // Check if response is ok before parsing
          if (!response.ok) {
            console.error(
              `API error for ID ${id}:`,
              response.status,
              response.statusText,
            );
            return { status: response.status, error: response.statusText };
          }

          // Check content type to ensure it's JSON
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            console.error(`Invalid content type for ID ${id}:`, contentType);
            const textResponse = await response.text();
            console.error(
              "Response text:",
              textResponse.substring(0, 200) + "...",
            );
            return { status: 400, error: "Invalid response format" };
          }

          return await response.json();
        } catch (error) {
          console.error(`Error processing ID ${id}:`, error);
          return {
            status: 500,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    // Check if first response has error status
    if (
      res[0] &&
      (res[0].status === 401 || res[0].status === 400 || res[0].status === 500)
    ) {
      console.error("API returned error status:", res[0]);
      return null;
    }

    return res as NguoiGuiDetailProp[];
  } catch (error) {
    console.error("Error in getMaHieusFromPortalId:", error);
    return null;
  }
};
const getItemHdr = async (
  toDayText: string,
  maHieus: string = "",
): Promise<NguoiGuiProp[]> => {
  try {
    // Build the base JSON object
    const requestBody = {
      orgCode: buuCuc,
      tuNgay: toDayText,
      denNgay: toDayText,
      sourceSystem: "KHL",
      origin: "",
    };

    // Only add ttNumber if maHieus has a value
    if (maHieus && maHieus.trim() !== "") {
      (requestBody as any).ttNumber = maHieus;
    }

    const res = await fetch(`${API_BASE_URL}/khl-api/khl/getItemHdr`, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        authorization: `Bearer ${token}`,
        capikey: "19001235",
        "content-type": "application/json; charset=UTF-8",
        "sec-ch-ua":
          '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
      referrer: "https://portalkhl.vnpost.vn/",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: JSON.stringify(requestBody),
      method: "POST",
      mode: "cors",
      credentials: "include",
    });

    // Check if response is ok
    if (!res.ok) {
      console.error("getItemHdr API error:", res.status, res.statusText);
      const textResponse = await res.text();
      console.error("Error response:", textResponse.substring(0, 200) + "...");
      return [];
    }

    // Check content type
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error("getItemHdr Invalid content type:", contentType);
      const textResponse = await res.text();
      console.error("Response text:", textResponse.substring(0, 200) + "...");
      return [];
    }

    return await res.json();
  } catch (error) {
    console.error("Error in getItemHdr:", error);
    return [];
  }
};

const getDataFromPNS = async (dayLast: string): Promise<any> => {
  try {
    return await safeFetch(
      `${PNS_BASE_URL}/Order/Home/ExportExcellOrderManage`,
      {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9,vi;q=0.8",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "sec-ch-ua":
            '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-requested-with": "XMLHttpRequest",
          cookie:
            "_ga=GA1.1.1252308094.1682309904; tctbdvn-_zldp=yr040hnCEdI2kxlbdwBeQuILj7FFHTSRALXKDo17bUf5oxEi8nvo1%2FHkNiXB4tD3VVj9liGvi%2BU%3D; _ga_PX3P5JLJ7K=GS1.1.1692945085.4.0.1692945085.0.0.0; _ga_TDJH6SEKEF=GS1.1.1703234131.4.1.1703234170.0.0.0; __SRVNAME=pns7; ASP.NET_SessionId=1tl4k4fo4bu5vhqwn53coee3; .ASPXAUTH=9E1633939FA3B00F904E422CCCB86B402F1B1A92F702B251189551D02FEB874EC894F1B04112D0BC9C69BFF93094451F2651D82616FEB484B469B41DDF924CC365801E490B1E3C2D21E993FBAB7EDCCB4716418487A4F9F4D87BC8C3F2A1F8175F2B8048EFC2B4FFABF23E7F62887AB9; panelIdCookie=userid=593280_xonld",
          Referer:
            "https://packnsend.vnpost.vn/tin/quan-ly-tin.html?startDate=11%2F02%2F2024&endDate=11%2F02%2F2024",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        body: `Id=0&FromDate=${toDateString(dayLast)}+&ToDate=+${toDateString(0)}&Code=&CustomerCode=&Status=&ContactPhone=&TrackingCode=&Page=0&Channel=&senderDistrictId=0&senderWardId=0&flagConfig=&orderNumber=&serviceCodeMPITS=`,
        method: "POST",
      },
    );
  } catch (error) {
    console.error("Error in getDataFromPNS:", error);
    return null;
  }
};
const loginDirect = async (
  account: string,
  password: string,
): Promise<string | null> => {
  try {
    const data = await safeFetch(`${API_BASE_URL}/khl-api/api/auth/signinKhl`, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; charset=UTF-8",
        capikey: "19001235",
      },
      body: JSON.stringify({
        username: account,
        password: password,
        ip: "",
        random: Math.random(),
      }),
    });
    console.log("LoginDirect response data:", data);
    return data.body.tokenFe || null;
  } catch (error) {
    console.error("Error in loginDirect:", error);
    return null;
  }
};

// function sendPong() {
//   db.ref(`PORTAL/STATUS/${keyMessage}`).set({ timestamp: Date.now(), online: true });
// }

// function handleSaveAccount(accountPortal: string, passwordPortal: string): void {
//   if (!accountPortal || !passwordPortal || !buuCuc) {
//     alert("Tài khoản hoặc mật khẩu và bưu cục không được để trống");
//     return;
//   }
//   chrome.storage.local.set({ accountPortal: accountPortal, passwordPortal: passwordPortal }, () => {
//     console.log("Saved account and password");
//   });
// }

function arrayBufferToBase64(buffer: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Tạo một Blob từ ArrayBuffer
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const reader = new FileReader();

    // Xử lý khi đọc thành công
    reader.onload = function (event) {
      // event.target.result sẽ là một Data URL (ví dụ: "data:application/octet-stream;base64,AAAA...")
      // Chúng ta cần lấy phần base64 sau dấu phẩy
      if (!event.target) {
        reject(new Error("FileReader event target is null"));
        return;
      }
      const dataUrl = event.target.result;
      if (typeof dataUrl !== "string" || !dataUrl) {
        reject(new Error("FileReader result is not a valid string"));
        return;
      }
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };

    // Xử lý khi có lỗi
    reader.onerror = function (error) {
      reject(error);
    };

    // Đọc Blob dưới dạng Data URL
    reader.readAsDataURL(blob);
  });
}

async function openAndExportExcel(
  res: any,
  request: any = null,
  ishcc: boolean = false,
) {
  let itemDetails = res[0].itemDetails;
  let fileName = "/temp.xlsx";
  console.log(ishcc);
  if (ishcc) {
    fileName = "/temphcc.xlsx";
  }

  // Read and modify temp.xlsx
  fetch(chrome.runtime.getURL(fileName)).then(async (response) => {
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    let indexStart = 4;
    for (let index = 0; index < itemDetails.length; index++) {
      const element = itemDetails[index];
      if (!ishcc) {
        worksheet[`A${indexStart + index}`] = { v: element.serviceCode };
        worksheet[`D${indexStart + index}`] = { v: "2-Bộ" };
        worksheet[`E${indexStart + index}`] = { v: element.ttNumber };

        worksheet[`H${indexStart + index}`] = { v: element.receiverName };
        worksheet[`I${indexStart + index}`] = { v: element.receiverPhone };
        worksheet[`M${indexStart + index}`] = { v: element.receiverAddress };
        worksheet[`S${indexStart + index}`] = { v: element.weight };
        worksheet[`Z${indexStart + index}`] = { v: element.serviceGtgt };
        worksheet[`AB${indexStart + index}`] = { v: element.codAmount };
        worksheet[`AK${indexStart + index}`] = { v: "1-Chuyển hoàn ngay" };
        worksheet[`AL${indexStart + index}`] = {
          v: "3-Chuyển hoàn về bưu cục gốc",
        };
        worksheet[`BQ${indexStart + index}`] = { v: request };
      } else {
        worksheet[`A${indexStart + index}`] = { v: element.serviceCode };
        worksheet[`B${indexStart + index}`] = { v: element.procedureId };
        worksheet[`C${indexStart + index}`] = {
          v: element.procedureCategoryId,
        };
        worksheet[`D${indexStart + index}`] = {
          v: element.procedureType == "1" ? "1-Tiếp nhận" : "2-Chuyển trả",
        };
        worksheet[`F${indexStart + index}`] = { v: element.ttNumber };

        worksheet[`H${indexStart + index}`] = { v: element.receiverName };
        worksheet[`I${indexStart + index}`] = { v: element.receiverPhone };
        worksheet[`M${indexStart + index}`] = { v: element.receiverAddress };
        worksheet[`U${indexStart + index}`] = { v: element.weight };
        worksheet[`Z${indexStart + index}`] = { v: element.serviceGtgt };
        // worksheet[`AB${indexStart + index}`] = { v: element.codAmount };
        worksheet[`CJ${indexStart + index}`] = { v: request };
      }
    }

    // Cập nhật lại phạm vi của sheet để bao gồm các hàng mới
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    // Điều chỉnh số hàng cuối cùng nếu cần
    range.e.r = Math.max(range.e.r, indexStart + itemDetails.length - 1);
    worksheet["!ref"] = XLSX.utils.encode_range(range);

    // Ghi workbook mới ra một ArrayBuffer
    const newWorkbookArrayBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    // // Convert the array buffer to a base64 string
    const base64 = await arrayBufferToBase64(newWorkbookArrayBuffer);
    await saveStorageExcel(base64);
    var tab = await createOrActiveTab(
      "https://example.com/",
      "https://example.com/",

      false,
      false,
      true,
    );
    // Read the base64 string back into a workbook
    //  const workbookFromBase64 = XLSX.read(base64, { type: 'base64' });
    //  const sheet = workbookFromBase64.Sheets[workbookFromBase64.SheetNames[0]];
    //waiting 1 s
    await delay(1000);
    //add ten with name and date
    const currentDate = new Date();
    const formattedDate = `${currentDate.getDate()}-${currentDate.getMonth() + 1}-${currentDate.getFullYear()}`;

    await chrome.tabs.sendMessage(tab!.id!, {
      message: "EXPORTEXCEL",
      ten: `${res[0].customerName}_${formattedDate}`,
    });
  });
}

async function handleAddPNS(dayLast: any) {
  updateToPhone("message", "Đã nhận lệnh lấy dữ liệu từ PNS");
  let khachHangsTemp = await handleGetDataFromPNS(dayLast);
  if (khachHangsTemp.length > 0) {
    console.log(khachHangsTemp);

    //get khachHangs from firebase
    const responsef: any = await db!.ref("PNS/KhachHangs").get();
    var khachHangsFirebase: KhachHangProps[] = responsef.val();
    //insert khachHangsFirebase to khachHangsTemp
    khachHangsTemp.forEach((m) => {
      const index = khachHangsFirebase.findIndex((n: any) => n.MaKH === m.MaKH);
      if (index === -1) {
        khachHangsFirebase.push(m);
      } else {
        khachHangsFirebase[index].BuuGuis = khachHangsFirebase[
          index
        ].BuuGuis.concat(m.BuuGuis);
      }
    });
    khachHangsFirebase.forEach((m) => {
      m.countState.countChapNhan = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã chấp nhận",
      ).length;
      m.countState.countDangGom = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đang đi thu gom",
      ).length;
      m.countState.countNhanHang = m.BuuGuis.filter(
        (m) => m.TrangThai === "Nhận hàng thành công",
      ).length;
      m.countState.countPhanHuong = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã phân hướng",
      ).length;
    });
    await db!.ref("PNS/KhachHangs").set(khachHangsFirebase);
    await db!.ref("PNS/TimeUpdate").set(new Date().toLocaleTimeString());
  } else {
    updateToPhone("message", "Chưa đăng nhập PNS");
    await khoitaoPNS();
  }
}
async function handleXoaBuuGui(id: String): Promise<void | PromiseLike<void>> {
  console.log(id);

  var res = await fetch(
    "https://api-pre-portalkhl.vnpost.vn/khl-api/khl/portalItem/deleteItemDetail",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language":
          "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
        authorization: `Bearer  ${token}`,
        "content-type": "application/json; charset=UTF-8",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        Referer: "https://portalkhl.vnpost.vn/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: `[\"${id}\"]`,
      method: "POST",
    },
  );

  res.status === 200
    ? updateToPhone("message", "Xóa thành công")
    : updateToPhone("message", "Xóa thất bại");
  console.log("Đã xóa thành công", await res.json());
}
async function handleXoaNhieuBuuGui(
  id: any,
): Promise<void | PromiseLike<void>> {
  console.log(id);

  var res = await fetch(
    "https://api-pre-portalkhl.vnpost.vn/khl-api/khl/portalItem/deleteItemDetail",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language":
          "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
        authorization: `Bearer  ${token}`,
        "content-type": "application/json; charset=UTF-8",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        Referer: "https://portalkhl.vnpost.vn/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: `${id}`,
      method: "POST",
    },
  );

  res.status === 200
    ? updateToPhone("message", "Xóa thành công")
    : updateToPhone("message", "Xóa thất bại");
  console.log("Đã xóa thành công", await res.json());
}

function handleSaveKHOption(data: any): void | PromiseLike<void> {
  var temp1 = JSON.parse(data.DoiTuong);
  console.log(temp1);
  //save chrome local b
  chrome.storage.local.set(
    { currentMaKH: temp1.maKH, currentOptions: temp1.options },
    function () { },
  );
  if (temp1.account && temp1.password) {
    accountPortal = temp1.account;
    passwordPortal = temp1.password;
  }
}
const handleEditKL = async (data: any): Promise<void> => {
  //https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=1041187714&id=JEeKLN4s00nnt4kqNwWKWfvINfD
  var temp1 = JSON.parse(data.DoiTuong);
  let loginSuccess = false;
  let loadedTab: chrome.tabs.Tab | undefined = undefined;
  var initialTab = await createOrActiveTab(
    "https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=" +
    temp1.ID +
    "&id=" +
    temp1.IDCODE,
    "portalkhl.vnpost.vn",
    true,
  );

  if (!initialTab || !initialTab.id) {
    console.error("Lỗi: Không thể mở hoặc kích hoạt tab Portal.");
    updateToPhone("message", "Lỗi: Không thể mở tab Portal.");
    return;
  }
  const tabId = initialTab.id;

  console.log(`Tab ban đầu ${tabId}. URL: ${initialTab.url}`);

  // --- Sử dụng hàm ensurePortalLogin ---
  const loginResult = await ensurePortalLogin(tabId);
  loginSuccess = loginResult.success;
  loadedTab = loginResult.loadedTab; // Cập nhật loadedTab từ kết quả

  // Nếu đăng nhập thành công và cần mở lại tab đúng URL (do đăng nhập có thể điều hướng)
  if (loginSuccess && loadedTab && !loadedTab.url?.includes("accept-api-dtl")) {
    console.log(
      "handleEditKL: Đăng nhập thành công, mở lại đúng URL chỉnh sửa KL...",
    );
    await createOrActiveTab(
      "https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=" +
      temp1.ID +
      "&id=" +
      temp1.IDCODE,
      "portalkhl.vnpost.vn",
      true, // Kích hoạt tab này
    );
    // Chờ tab mới tải xong (hoặc tab cũ điều hướng xong)
    loadedTab = await waitForTabToLoad(loadedTab.id!); // Chờ trên cùng tabId
    console.log(
      `handleEditKL: Tab ${loadedTab?.id} đã ở đúng URL chỉnh sửa KL: ${loadedTab?.url}`,
    );
    await delay(1500); // Chờ thêm chút cho ổn định
  }
  // --- Kết thúc sử dụng hàm ensurePortalLogin ---

  // --- Chỉ tiếp tục nếu đăng nhập thành công hoặc không cần đăng nhập ---
  if (loginSuccess && loadedTab?.id) {
    console.log(
      `handleEditKL: Đăng nhập OK. Gửi lệnh CHANGEKL cho tab ${loadedTab.id}...`,
    );
    chrome.tabs.sendMessage(
      loadedTab.id,
      {
        // Sử dụng loadedTab.id đã được cập nhật
        message: "CHANGEKL", // Lệnh mới
        kl: temp1.Weight,
        keyMessage: keyMessage,
      },
      async (response) => {
        // Kiểm tra lỗi runtime trước
        if (chrome.runtime.lastError) {
          console.error(
            `handleEditKL: Lỗi gửi/nhận CHANGEKL: ${chrome.runtime.lastError.message}`,
          );
          return;
        }
        console.log("handleEditKL: Phản hồi từ CHANGEKL:", response);
        // Xử lý phản hồi nếu cần
        if (response && response.status === "success") {
          updateToPhone("message", `Đã cập nhật KL cho ${temp1.IDCODE}`);
          // Có thể đóng tab sau khi thành công nếu muốn
          // await chrome.tabs.remove(loadedTab.id!);
        } else {
          updateToPhone(
            "message",
            `Lỗi cập nhật KL cho ${temp1.IDCODE}: ${response?.error || "Không rõ"}`,
          );
        }
      },
    );
  } else if (!loginSuccess) {
    console.log(
      "handleEditKL: Không tiếp tục vì đăng nhập thất bại hoặc không xác nhận được.",
    );
    // Tin nhắn lỗi đã được gửi trong ensurePortalLogin
  }
  // Hàm này không cần trả về boolean nữa vì nó xử lý hoàn toàn bên trong
};
type MyPostOrderProps = {
  codAmount: number;
  itemCode: string;
  senderCode: string;
  orderHdrId: string;
  senderName: string;
  createdDate: string;
  statusName: string;
  weight: number; // Thêm trường này nếu có trong dữ liệu thật
  //... thêm các trường khác nếu cần
};
/**
 * Định dạng ngày theo YYYY-MM-DD HH:mm
 */
function formatMyPostDate(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Nhóm dữ liệu MyPost theo Khách hàng
 */
function groupMyPostDataByKhachHang(
  items: MyPostOrderProps[],
): KhachHangProps[] {
  if (!items || items.length === 0) {
    return [];
  }
  const khachHangMap = new Map<string, KhachHangProps>();

  items.forEach((item) => {
    const maKH = item.senderCode;
    if (!khachHangMap.has(maKH)) {
      khachHangMap.set(maKH, {
        MaKH: maKH,
        TenKH: item.senderName,
        TenNguoiGui: item.senderName,
        TimeNhanTin: item.createdDate,
        MaTin: item.orderHdrId, // Lấy từ bưu gửi đầu tiên
        Index: 0, // Sẽ cập nhật sau

        BuuGuis: [],
        countState: {
          countChapNhan: 0,
          countDangGom: 0,
          countNhanHang: 0,
          countPhanHuong: 0,
        },
      });
    }

    const khachHang = khachHangMap.get(maKH)!;
    const buuGui: BuuGuiProps = {
      MaBuuGui: item.itemCode,
      TimeTrangThai: item.createdDate,
      TrangThai: item.statusName,
      KhoiLuong: item.weight?.toString() || "0", // Lấy KL nếu có, nếu không thì mặc định là "0"
      index: khachHang.BuuGuis.length + 1,
      // Các trường khác có thể để null hoặc giá trị mặc định
      Id: null,
      IsBlackList: false,
      Money: item.codAmount,
      ListDo: null,
      TrangThaiRequest: null,
    };
    khachHang.BuuGuis.push(buuGui);
    khachHangMap.forEach((m) => {
      m.countState.countChapNhan = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã chấp nhận",
      ).length;
      m.countState.countDangGom = m.BuuGuis.filter(
        (m) => m.TrangThai === "Tạo đơn",
      ).length;
      m.countState.countNhanHang = m.BuuGuis.filter(
        (m) => m.TrangThai === "Bưu tá nhận yêu cầu thu gom",
      ).length;
      m.countState.countPhanHuong = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã lấy hàng",
      ).length;
    });
  });

  return Array.from(khachHangMap.values());
}
const getTokenMyVNPost = async (tabId: number) => {
  return new Promise<{ token: string | null }>((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_MYPOST_TOKEN" }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("Lỗi gửi tin nhắn:", chrome.runtime.lastError.message);
        resolve({ token: null });
      } else {
        resolve(res);
      }
    });
  });
};
/**
 * Lấy dữ liệu từ API MyPost
 */
async function getDataFromMyPost(
  token: string,
  maKH: any,
): Promise<MyPostOrderProps[] | null> {
  const now = new Date();
  const past = new Date();
  past.setDate(now.getDate() - 20);

  const toDateFromDate = [formatMyPostDate(past), formatMyPostDate(now)];

  try {
    const data = await safeFetch(
      "https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchAllByParam?page=0&size=1000",
      {
        headers: {
          accept: "*/*",
          "accept-language": "vi,en-US;q=0.9,en;q=0.8",
          authorization: token, // Sử dụng token được truyền vào
          capikey: "19001111",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          toDateFromDate: toDateFromDate, // Sử dụng ngày đã định dạng
          orgCode: [maKH], // Sử dụng buuCuc từ storage
          isInternational: "0",
          lstStatus: ["1", "2", "3", "4", "5", "6", "7", "30"],
          orderType: "1",
        }),
        method: "POST",
      },
    );
    return data || [];
  } catch (error: any) {
    console.error("Lỗi fetch dữ liệu MyPost:", error);
    updateToPhone("error", `Lỗi hệ thống khi lấy MyPost: ${error.message}`);
    return null;
  }
}

/**
 * Hàm chính xử lý việc lấy dữ liệu MyPost và lưu vào Firebase
 */
async function handleGetMyPostData(data: any) {
  updateToPhone("message", "Bắt đầu lấy dữ liệu từ MyVNPost...");
  try {
    const myPostTabs = await chrome.tabs.query({
      url: "https://my.vnpost.vn/*",
    });

    if (myPostTabs.length === 0) {
      updateToPhone(
        "error",
        "Không tìm thấy tab MyVNPost. Vui lòng mở và đăng nhập.",
      );
      await createOrActiveTab("https://my.vnpost.vn/", "my.vnpost.vn");
      return;
    }

    const tabId = myPostTabs[0].id;
    if (!tabId) {
      updateToPhone("error", "Không lấy được ID của tab MyVNPost.");
      return;
    }

    updateToPhone("message", "Đang lấy token xác thực...");

    const response = await getTokenMyVNPost(tabId);

    if (!response || !response.token) {
      updateToPhone(
        "error",
        "Không lấy được token. Vui lòng đăng nhập vào MyVNPost và thử lại.",
      );
      return;
    }
    console.log("Token MyVNPost:", response.token);

    updateToPhone("message", "Đang tải dữ liệu đơn hàng...");
    var dataJson = JSON.parse(data.DoiTuong);

    const myPostData = await getDataFromMyPost(
      response.token,
      dataJson["maKH"],
    );

    if (myPostData === null) {
      // Hàm getDataFromMyPost đã gửi thông báo lỗi
      return;
    }

    if (myPostData.length === 0) {
      updateToPhone("message", "Không có đơn hàng nào trong 20 ngày.");
      return;
    }

    updateToPhone(
      "message",
      `Đã tải ${myPostData.length} đơn hàng. Đang xử lý...`,
    );
    const khachHangs = groupMyPostDataByKhachHang(myPostData);

    if (db === null) {
      console.error("Firebase DB chưa được khởi tạo.");
      updateToPhone("error", "Lỗi kết nối Firebase.");
      return;
    }

    // Ghi dữ liệu của từng khách hàng vào node riêng
    for (const kh of khachHangs) {
      await db.ref(`MYVNPOST/KhachHangs/${kh.MaKH}`).set(kh);
    }

    await db.ref("MYVNPOST/TimeUpdate").set(new Date().toLocaleString("vi-VN"));
    updateToPhone("message", "Cập nhật dữ liệu MyVNPost thành công!");
  } catch (error: any) {
    console.error("Lỗi trong handleGetMyPostData:", error);
    updateToPhone("error", `Lỗi: ${error.message}`);
  }
}

chrome.webNavigation.onHistoryStateUpdated.addListener(
  async (details) => {
    //Lọc url
    if (details.url.includes("https://my.vnpost.vn/")) {
      console.log("Đã vào trang tạo đơn hàng MyVNPost");
      // Gửi thông báo đến tab hiện tại
      chrome.tabs.sendMessage(
        details.tabId,
        { type: "URL_CHANGED", url: details.url },
        (_res) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Lỗi gửi tin nhắn:",
              chrome.runtime.lastError.message,
            );
          } else {
            console.log("Đã gửi thông báo URL_CHANGED đến tab:", details.tabId);
          }
        },
      );
    }
  },
  { url: [{ hostContains: "my.vnpost.vn" }] },
);

//HO DUY--------------------------------

interface Order {
  GOC: string;
  MAUSAC: string;
  NGUOINHAN: string;
  DIACHI: string;
  SDT: string;
  COD: number;
  MAHIEU?: string;
}

interface SessionData {
  orders?: Order[];
  currentIndex?: number;
}

// Hàm để thông báo cho tất cả các tab và popup về sự thay đổi
function broadcastUpdate(payload: SessionData) {
  chrome.runtime.sendMessage({ type: "STORAGE_UPDATED", payload });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, { type: "STORAGE_UPDATED", payload })
          .catch(() => { });
      }
    }
  });
}
const internalSaveOrders = (orders: Order[]) => {
  const dataToSave: SessionData = {
    orders: orders,
    currentIndex: 0,
  };
  console.log("Saving orders via internal handler:", dataToSave);
  chrome.storage.session.set(dataToSave, () => {
    broadcastUpdate(dataToSave);
  });
};
const save_order = (msg: any, sendResponse: (response: any) => void) => {
  internalSaveOrders(msg.payload.orders);
  sendResponse({ status: "ok" });

};
async function handleAIOrders(data: any) {
  try {
    console.log("Received AI Orders from Firebase:", data.DoiTuong);
    const rawData = JSON.parse(data.DoiTuong);

    if (Array.isArray(rawData)) {
      // Map dữ liệu từ Firebase sang cấu trúc Order của app
      const mappedOrders: Order[] = rawData.map((item: any) => ({
        // Map maHieu vào MAHIEU riêng biệt
        MAHIEU: item.maHieu || "",

        // GOC có thể để là địa chỉ hoặc chuỗi gốc tùy logic cũ, 
        // ở đây mình map diaChi vào GOC để hiển thị fallback nếu cần
        GOC: item.diaChi || item.maHieu || "",

        NGUOINHAN: item.tenNguoiNhan || "",
        DIACHI: item.diaChi || "",
        SDT: item.soDienThoai || "",
        MAUSAC: "", // Mặc định rỗng vì dữ liệu nguồn không có
        COD: 0      // Mặc định 0
      }));

      // Lưu vào session storage
      internalSaveOrders(mappedOrders);

      // Thông báo lại cho điện thoại
      await updateToPhone("message", `Đã đồng bộ ${mappedOrders.length} đơn hàng AI.`);
    } else {
      console.error("Dữ liệu aiorders không phải là mảng.");
      await updateToPhone("message", "Lỗi: Dữ liệu AI không đúng định dạng.");
    }
  } catch (error: any) {
    console.error("Error handling AI Orders:", error);
    await updateToPhone("message", `Lỗi xử lý AI Orders: ${error.message}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SAVE_ORDERS") {
    save_order(msg, sendResponse);
    return true; // Giữ kênh message mở cho response bất đồng bộ
  }

  if (msg.type === "GET_INITIAL_DATA" || msg.type === "GET_STATUS") {
    chrome.storage.session.get(
      ["orders", "currentIndex"],
      (result: SessionData) => {
        sendResponse({
          orders: result.orders || [],
          currentIndex: result.currentIndex || 0,
        });
      },
    );
    return true;
  }
  if (msg.type === "SEND_AI_DATA") {
    chrome.action.setBadgeText({ text: "AI..." });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" }); // Màu cam cho trạng thái chờ
    (async () => {
      try {
        // 2. Gọi hàm xử lý AI và chờ kết quả
        const jsonStringResult = await processWithGemini(msg.payload, msg.systemInstructionText);

        // 3. Phân tích kết quả ngay tại background
        const orders = JSON.parse(jsonStringResult);
        if (!Array.isArray(orders)) {
          throw new Error("AI không trả về dữ liệu JSON dạng mảng hợp lệ.");
        }
        // 4. TRỰC TIẾP LƯU DỮ LIỆU
        // Gọi hàm save_order để lưu vào chrome.storage.session và phát đi thông báo cập nhật.
        // Đây là bước mấu chốt: đảm bảo dữ liệu được lưu ngay cả khi popup đã đóng.
        save_order({ payload: { orders: orders } }, () => { }); // dùng hàm rỗng cho sendResponse vì ta không cần phản hồi từ hàm này
        // Cập nhật badge thành công (màu xanh lá)
        chrome.action.setBadgeText({ text: "OK" });
        chrome.action.setBadgeBackgroundColor({ color: "#28a745" });
        // Xóa badge sau 3 giây
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);

        // Gửi kết quả thành công về cho popup
        sendResponse({ status: "success", result: jsonStringResult });
      } catch (error: any) {
        // 4. Xử lý khi có lỗi
        console.error("Lỗi khi xử lý với Gemini:", error);

        // Cập nhật badge báo lỗi (màu đỏ)
        chrome.action.setBadgeText({ text: "LỖI" });
        chrome.action.setBadgeBackgroundColor({ color: "#dc3545" });
        // Giữ badge lỗi để người dùng thấy

        // Gửi thông báo lỗi về cho popup
        sendResponse({
          status: "error",
          error: error.message || "Lỗi không xác định từ Gemini",
        });
      }
    })();

    // 5. Luôn trả về true để giữ kênh message mở cho đến khi sendResponse được gọi
    return true;
  }

  if (msg.type === "CLEAR_ORDERS") {
    const emptyData: SessionData = { orders: [], currentIndex: 0 };
    chrome.storage.session.set(emptyData, () => {
      broadcastUpdate(emptyData);
      sendResponse({ status: "cleared" });
    });
    return true;
  }

  if (msg.type === "OPEN_SIDE_PANEL") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.windowId) {
          await openSidePanel(tabs[0].windowId);
          sendResponse({ status: "success", message: "Side panel opened" });
        } else {
          sendResponse({ status: "error", message: "No active window found" });
        }
      } catch (error) {
        console.error("Error opening side panel:", error);
        sendResponse({ status: "error", message: (error as Error).message });
      }
    })();
    return true;
  }

  if (msg.type === "OPEN_SIDE_PANEL_INPAGE") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs?.[0];
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDE_PANEL" });
          sendResponse({ status: 'success', message: 'In-page side panel injected' });
        } else {
          sendResponse({ status: 'error', message: 'No active tab' });
        }
      } catch (error) {
        console.error('Error injecting in-page side panel:', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (msg.type === "CLOSE_SIDE_PANEL_INPAGE") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs?.[0];
        if (tab?.id) {
          await closeSidePanelInPage(tab.id);
          sendResponse({ status: 'success', message: 'In-page side panel removed' });
        } else {
          sendResponse({ status: 'error', message: 'No active tab' });
        }
      } catch (error) {
        console.error('Error closing in-page side panel:', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (msg.type === "QUERY_SIDEPANEL_STATUS") {
    console.log("[Background] 📨 Received QUERY_SIDEPANEL_STATUS from content script");

    // Check if side panel is open by trying to send a message to it
    chrome.runtime.sendMessage({ type: "SIDEPANEL_PING" }, (response) => {
      const isOpen = !chrome.runtime.lastError;
      console.log("[Background] Side panel status:", isOpen ? "OPEN" : "CLOSED");
      sendResponse({ isOpen });
    });

    return true; // Async response
  }

  if (msg.type === "EXECUTE_PORTAL_ITEM") {
    const { maBuuGui } = msg.payload;
    handleExecuteFromItem(maBuuGui, sendResponse);
    return true;
  }

  if (msg.type === "SIDEPANEL_SMART_ZOOM") {
    console.log("[Background] 📨 Received SIDEPANEL_SMART_ZOOM from content script:", msg.payload);

    // Forward message to all side panel contexts
    const forwardedMessage = {
      type: "APPLY_SMART_ZOOM",
      payload: msg.payload
    };

    console.log("[Background] 📤 Forwarding as APPLY_SMART_ZOOM:", forwardedMessage);

    chrome.runtime.sendMessage(forwardedMessage, (response) => {
      if (chrome.runtime.lastError) {
        console.log("[Background] ❌ Error forwarding to side panel:", chrome.runtime.lastError.message);
      } else {
        console.log("[Background] ✅ Message forwarded successfully. Response:", response);
      }
    });

    sendResponse({ status: "forwarded" });
    return true;
  }

  if (msg.type === "SIDEPANEL_NEXT_IMAGE") {
    console.log("[Background] 📨 Received SIDEPANEL_NEXT_IMAGE from content script");

    // Forward to side panel
    chrome.runtime.sendMessage({ type: "SIDEPANEL_NEXT_IMAGE" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("[Background] ❌ Error forwarding next image request:", chrome.runtime.lastError.message);
        sendResponse({ status: "error", message: chrome.runtime.lastError.message });
      } else {
        console.log("[Background] ✅ Next image request forwarded");
        sendResponse({ status: "success" });
      }
    });

    return true;
  }

  if (msg.type === "FILL_NEXT") {
    chrome.storage.session.get(
      ["orders", "currentIndex"],
      (result: SessionData) => {
        const orders = result.orders || [];
        let currentIndex = result.currentIndex || 0;

        if (currentIndex >= orders.length) {
          sendResponse({ order: null });
          return;
        }

        const nextOrder = orders[currentIndex];
        currentIndex++;

        chrome.storage.session.set({ currentIndex }, () => {
          broadcastUpdate({ currentIndex });
          sendResponse({ order: nextOrder });
        });
      },
    );
    return true;
  }

  if (msg.type === "GO_BACK") {
    chrome.storage.session.get(
      ["orders", "currentIndex"],
      (result: SessionData) => {
        const orders = result.orders || [];
        let currentIndex = result.currentIndex || 0;

        if (currentIndex > 0) {
          currentIndex--;
        }

        const prevOrder = orders[currentIndex];

        chrome.storage.session.set({ currentIndex }, () => {
          broadcastUpdate({ currentIndex });
          sendResponse({ order: prevOrder });
        });
      },
    );
    return true;
  }
  if (msg.event === "CONTENTMY") {
    if (msg.type === "CREATE_COMPLAINT") {
      // Fire-and-forget - không cần response
      handleCreateComplaint(msg.payload).catch(error => {
        console.error('[BG] Error in CREATE_COMPLAINT (fire-and-forget):', error);
      });
      // Không return true vì không cần response
    }

    if (msg.type === "FETCH_CMS_DATA") {
      handleFetchCMSData(msg.payload, sendResponse);
      return true; // Xử lý bất đồng bộ
    }

    if (msg.type === "OPEN_CMS_SEARCH") {
      handleOpenCMSSearch(msg.payload, sendResponse);
      return true; // Xử lý bất đồng bộ
    }

    if (msg.type === "SEARCH_ORG_INFO") {
      (async () => {
        try {
          const { code } = msg.payload;
          const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`, {
            method: "GET",
            headers: {
              "accept": "*/*",
              "x-requested-with": "XMLHttpRequest"
            },
            credentials: "include" // QUAN TRỌNG: Để gửi kèm cookie đăng nhập của CMS
          });

          if (response.ok) {
            const data = await response.json();
            sendResponse({ status: 'success', data: data });
          } else {
            sendResponse({ status: 'error', error: response.statusText });
          }
        } catch (error) {
          console.error("Error fetching org info:", error);
          sendResponse({ status: 'error', error: msg.message });
        }
      })();
      return true; // Giữ kết nối để trả lời async
    }

    if (msg.type === "FORWARD_CMS_TICKET") {
      (async () => {
        try {
          const { ticketId, dataOrgObj } = msg.payload;

          // 1. Tạo FormData ngay tại Background
          const form = new FormData();

          // API CMS yêu cầu 'dataOrg' là một Blob chứa JSON
          form.append("dataOrg", new Blob([JSON.stringify(dataOrgObj)], { type: "application/json" }));
          form.append("ids", ticketId);

          console.log(`[BG] Forwarding ticket ${ticketId} to ${dataOrgObj[0].orgCode}`);

          // 2. Gọi Fetch (Bypass CORS nhờ Background context)
          const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/change", {
            method: "PUT",
            body: form,
            credentials: "include" // Quan trọng: Gửi kèm Cookie đăng nhập
          });

          if (response.ok) {
            // API này thường trả về JSON dù thành công hay thất bại logic
            const result = await response.json();
            sendResponse({ status: 'success', data: result });
          } else {
            sendResponse({ status: 'error', error: `HTTP Error: ${response.status}` });
          }
        } catch (error) {
          console.error("[BG] Error forwarding ticket:", error);
          sendResponse({ status: 'error', error: msg.message });
        }
      })();
      return true; // Giữ kết nối async
    }
    if (msg.type === "CLOSE_CMS_TICKET") {
      (async () => {
        try {
          const { ticketId } = msg.payload;
          console.log(`[BG] Closing ticket ${ticketId}...`);

          // BƯỚC 1: Lưu kết quả xử lý (Save Result)
          const formData = new FormData();
          formData.append("actType", "4");
          formData.append("actResult", "490"); // 490 = Phát thành công/Giải quyết xong
          formData.append("ttkId", ticketId);
          formData.append("actContent", "<-Tạm đóng->");
          formData.append("file", "undefined");
          formData.append("isProcess", "true");
          formData.append("isCompensated", "false");

          const saveRes = await fetch("https://cms.vnpost.vn/api/admin/complaints/save-result", {
            method: "POST",
            body: formData,
            credentials: "include"
          });

          const saveData = await saveRes.json();

          // Kiểm tra kết quả bước 1
          if (!saveData.result) {
            throw new Error(`Lỗi lưu kết quả: ${saveData.message || 'Unknown error'}`);
          }

          // BƯỚC 2: Đóng hồ sơ (Change Status)
          // API này dùng x-www-form-urlencoded
          const closeRes = await fetch("https://cms.vnpost.vn/api/admin/complaints/changestatus", {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: `ids=${ticketId}`,
            credentials: "include"
          });

          // API changestatus thường trả về text hoặc json, kiểm tra ok là được
          if (closeRes.ok) {
            sendResponse({ status: 'success' });
          } else {
            throw new Error(`Lỗi đóng hồ sơ: ${closeRes.statusText}`);
          }

        } catch (error: any) {
          console.error("[BG] Error closing ticket:", error);
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true; // Giữ kết nối async
    }

    // Auto Reminder handlers
    if (msg.type === "RUN_AUTO_REMINDER") {
      (async () => {
        try {
          await checkAndRunAutoReminder(true); // Force run
          sendResponse({ status: 'success', message: 'Đã kích hoạt kiểm tra tự động' });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "ENABLE_AUTO_REMINDER") {
      (async () => {
        try {
          await enableAutoReminder();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "DISABLE_AUTO_REMINDER") {
      (async () => {
        try {
          await disableAutoReminder();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "UPDATE_AUTO_REMINDER_TIME") {
      (async () => {
        try {
          const { startHour, endHour } = msg.payload;
          await updateTimeWindow(startHour, endHour);
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "GET_AUTO_REMINDER_CONFIG") {
      (async () => {
        try {
          const config = await getAutoReminderConfig();
          sendResponse({ status: 'success', config });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "GET_AUTO_REMINDER_LOGS") {
      (async () => {
        try {
          const logs = await getAutoReminderLogs();
          sendResponse({ status: 'success', logs });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }

    if (msg.type === "CLEAR_AUTO_REMINDER_LOGS") {
      (async () => {
        try {
          await clearAutoReminderLogs();
          sendResponse({ status: 'success' });
        } catch (error: any) {
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true;
    }
  }
});
//END Ho Duy--------------------------------

// Bạn cần đảm bảo đã có hàm `waitForTabToLoad`
// Nếu chưa có, đây là một phiên bản đơn giản:
async function waitForTabToLoad(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve) => {
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (
        updatedTabId === tabId &&
        changeInfo.status === "complete" &&
        tab.url
      ) {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Fallback trong trường hợp tab đã load xong trước khi listener được thêm
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === "complete" && tab.url) {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    });
  });
}

/**
 * Handler cho OPEN_CMS_SEARCH - Mở tab CMS và trigger automation
 */
async function handleOpenCMSSearch(
  payload: { itemCode: string },
  sendResponse: (response: any) => void,
) {
  const targetUrl = "https://cms.vnpost.vn/admin/complaints/search";
  const itemCode = payload.itemCode;

  try {
    // Tìm tab CMS đã mở
    const tabs = await chrome.tabs.query({});
    let cmsTab = tabs.find((tab) =>
      tab.url?.startsWith("https://cms.vnpost.vn"),
    );

    if (cmsTab && cmsTab.id) {
      // Đã có tab CMS, update URL và focus
      await chrome.tabs.update(cmsTab.id, {
        url: targetUrl,
        active: true,
      });

      // Đợi tab load xong rồi trigger automation
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === cmsTab!.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);

          // Trigger automation sau khi page load
          setTimeout(() => {
            chrome.tabs.sendMessage(cmsTab!.id!, {
              type: "AUTO_SEARCH_CMS",
              payload: { itemCode },
            });
          }, 1000);
        }
      });

      sendResponse({ status: "success", action: "updated" });
    } else {
      // Chưa có tab CMS, tạo mới
      const newTab = await chrome.tabs.create({
        url: targetUrl,
        active: true,
      });

      // Đợi tab load xong rồi trigger automation
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === newTab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);

          // Trigger automation sau khi page load
          setTimeout(() => {
            chrome.tabs.sendMessage(newTab.id!, {
              type: "AUTO_SEARCH_CMS",
              payload: { itemCode },
            });
          }, 1000);
        }
      });

      sendResponse({ status: "success", action: "created" });
    }
  } catch (error: any) {
    console.error("[CMS] Error opening tab:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Parse HTML search result để lấy tất cả ticket IDs (loại bỏ trùng lặp)
 */
function parseTicketsFromSearch(
  html: string,
): Array<{ ticketId: string; ticketCode: string }> {
  const tickets: Array<{ ticketId: string; ticketCode: string }> = [];
  const uniqueIds = new Set<string>();

  // Regex để tìm tất cả data-id
  const dataIdRegex = /data-id="(\d+)"/g;

  let match;
  while ((match = dataIdRegex.exec(html)) !== null) {
    const ticketId = match[1].trim();

    // Chỉ thêm nếu chưa tồn tại
    if (!uniqueIds.has(ticketId)) {
      uniqueIds.add(ticketId);
      tickets.push({
        ticketId,
        ticketCode: `Ticket #${tickets.length + 1}`,
      });
    }
  }

  return tickets;
}

/**
 * Parse HTML table thành array actions
 */
function parseActionsFromHtml(html: string): any[] {
  const actions: any[] = [];

  // Regex để tìm tất cả các <tr> chứa data
  const trRegex =
    /<tr>\s*<td class="text-center">\s*(\d+)\s*<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/gs;

  let match;
  while ((match = trRegex.exec(html)) !== null) {
    actions.push({
      stt: match[1].trim(),
      date: match[2].trim(),
      unit: match[3].trim(),
      content: match[4].trim().replace(/<[^>]*>/g, ""), // Remove HTML tags
      relatedUnit: match[5].trim(),
    });
  }

  return actions;
}

/**
 * Fetch ticket detail khi không có actions
 */
async function fetchTicketDetail(ticketId: string): Promise<any> {
  const detailUrl = `https://cms.vnpost.vn/api/admin/complaints/getdetail/${ticketId}`;

  const response = await fetch(detailUrl, {
    method: "GET",
    credentials: "include",
    headers: {
      accept: "*/*",
      "x-requested-with": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch detail: ${response.status}`);
  }

  const jsonData = await response.json();

  if (jsonData.result && jsonData.resultData) {
    const data = jsonData.resultData;
    return {
      stt: "1",
      date: data.createdDate || "",
      unit: "Shop Hỗ Trợ",
      content: data.ttkContent || "",
      relatedUnit:
        data.managedOrg && data.managedOrgName
          ? `${data.managedOrg} - ${data.managedOrgName}`
          : "-",
    };
  }

  return null;
}

/**
 * Hàm fetch CMS data qua background (bypass CORS)
 */
async function handleFetchCMSData(
  payload: { maVanDon: string },
  sendResponse: (response: any) => void,
) {
  const { maVanDon } = payload;
  console.log(`[BG CMS] Fetching data for ${maVanDon}...`);

  try {
    // Bước 1: Search ticket
    const searchUrl = `https://cms.vnpost.vn/api/admin/complaints/loaddatasearch?ttkSrvId=0&ttkSrvIdL2=0&ttkSrvIdL3=0&ttkType=&ttkCode=&ttkGroup=&searchFromDate=&searchToDate=&createdOrg=&listRelationOrg=&relationOrg=&searchInfoCode=${maVanDon}&searchIsCompen=&ttkStatus=0&searchIsCompensated=&searchIsComp=&searchComplaintCompUnit=&managedOrg=&managedUsr=&ttkCodeRef=&ttkContactNumber=&ttkContactEmail=&managedOrgComplaint=&createdOrgComplaint=&ttkSource=0&pageIndex=1&pageSize=20&column=ttkId&desending=1`;

    const searchResponse = await fetch(searchUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "*/*",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    if (!searchResponse.ok) {
      console.error(`[BG CMS] Search failed: ${searchResponse.status}`);
      sendResponse({
        status: "success",
        data: { hasData: false },
      });
      return;
    }

    const searchHtml = await searchResponse.text();

    // Check nếu không có dữ liệu
    if (searchHtml.includes("Chưa có dữ liệu trong hệ thống")) {
      console.log("[BG CMS] No data found");
      sendResponse({
        status: "success",
        data: { tickets: [] },
      });
      return;
    }

    // Parse tất cả tickets từ search result
    const tickets = parseTicketsFromSearch(searchHtml);
    console.log(`[BG CMS] Found ${tickets.length} tickets:`, tickets);

    if (tickets.length === 0) {
      sendResponse({
        status: "success",
        data: { tickets: [] },
      });
      return;
    }

    // Bước 2: Fetch actions cho từng ticket
    const ticketDataList = [];

    for (const ticket of tickets) {
      console.log(
        `[BG CMS] Processing ticket ${ticket.ticketCode} (ID: ${ticket.ticketId})`,
      );

      // Fetch actions
      const actionsUrl = `https://cms.vnpost.vn/api/admin/complaints/gettticketaction/${ticket.ticketId}?pageIndex=1&pageSize=20&column=actId&desending=1`;

      const actionsResponse = await fetch(actionsUrl, {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "*/*",
          "x-requested-with": "XMLHttpRequest",
        },
      });

      let actions = [];

      if (actionsResponse.ok) {
        const actionsHtml = await actionsResponse.text();
        actions = parseActionsFromHtml(actionsHtml);
        console.log(
          `[BG CMS] Ticket ${ticket.ticketCode}: ${actions.length} actions`,
        );
      }

      // Fetch detail để lấy ttkContent (luôn fetch để có thêm thông tin)
      let detailAction = null;
      try {
        detailAction = await fetchTicketDetail(ticket.ticketId);
        console.log(
          `[BG CMS] Got detail for ${ticket.ticketCode}:`,
          detailAction,
        );
      } catch (error) {
        console.error(
          `[BG CMS] Failed to fetch detail for ${ticket.ticketCode}:`,
          error,
        );
      }

      // Nếu detailAction có ttkContent không rỗng, thêm vào đầu actions
      if (
        detailAction &&
        detailAction.content &&
        detailAction.content.trim() !== ""
      ) {
        actions.unshift(detailAction); // Thêm vào đầu mảng
        console.log(
          `[BG CMS] Added detail as first action for ${ticket.ticketCode}`,
        );
      }

      ticketDataList.push({
        ticketId: ticket.ticketId,
        ticketCode: ticket.ticketCode,
        actions,
      });
    }

    console.log(`[BG CMS] Completed processing all tickets`);
    sendResponse({
      status: "success",
      data: {
        hasData: true,
        tickets: ticketDataList,
      },
    });
  } catch (error: any) {
    console.error("[BG CMS] Error:", error);
    sendResponse({
      status: "error",
      error: error.message || "Unknown error",
    });
  }
}

/**
 * Hàm chính xử lý quy trình khiếu nại
 */
async function handleCreateComplaint(
  payload: { itemCode: string; token: string | null; type: string },
) {
  const { itemCode, token, type } = payload;
  console.log(`[BG] Bắt đầu xử lý khiếu nại cho: ${itemCode}`);

  try {
    const commonHeaders = {
      accept: "*/*",
      authorization: token!, // Sử dụng token động
      capikey: "19001111",
      "content-type": "application/json",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      referrer: "https://my.vnpost.vn/",
    };

    // 2. Fetch lần 1 để lấy orderHdrId
    console.log(`[BG] Fetching orderHdrId for ${itemCode}...`);
    const searchData = await safeFetch(
      `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/searchByOrderCodeOrItemCode?searchValue=${itemCode}`,
      {
        headers: commonHeaders,
        method: "POST",
      },
    );

    if (!searchData || !searchData.orderHdrId)
      throw new Error("API không trả về orderHdrId.");

    const orderHdrId = searchData.orderHdrId;
    console.log(`[BG] Lấy được orderHdrId: ${orderHdrId}`);

    // 3. Fetch lần 2 để lấy chi tiết đơn hàng
    console.log(`[BG] Fetching order details for ${orderHdrId}...`);
    const detailData = await safeFetch(
      `https://api-pre-my.vnpost.vn/myvnp-web/v1/OrderHdr/${orderHdrId}`,
      {
        headers: commonHeaders,
        method: "GET",
      },
    );

    if (!detailData) throw new Error("API không trả về chi tiết đơn hàng.");

    const complaintData = {
      orgCode: detailData.orgCode,
      serviceCode: detailData.serviceCode,
      itemCode: detailData.itemCode,
      type: type,
    };
    console.log("[BG] Dữ liệu khiếu nại đã trích xuất:", complaintData);

    // 4. Tìm hoặc tạo tab CMS
    const cmsUrl = "https://cms.vnpost.vn/admin/complaints";
    const cmsUrlHost = "https://cms.vnpost.vn";
    let cmsTabs = await chrome.tabs.query({ url: `${cmsUrlHost}/*` });
    let cmsTab;

    if (cmsTabs.length > 0) {
      console.log("[BG] Tìm thấy tab CMS. Kiểm tra URL hiện tại...");
      const currentTab = cmsTabs[0];

      // Chỉ update URL nếu khác với URL mong muốn (tránh refresh không cần thiết)
      if (currentTab.url !== cmsUrl) {
        console.log("[BG] URL khác nhau, đang chuyển hướng và đợi load...");
        cmsTab = await chrome.tabs.update(currentTab.id!, {
          active: true,
          url: cmsUrl,
        });
        // Chờ tab load xong khi có navigation
        await waitForTabToLoad(cmsTab.id!);
      } else {
        console.log("[BG] URL đã đúng, chỉ kích hoạt tab...");
        cmsTab = await chrome.tabs.update(currentTab.id!, {
          active: true,
        });
        // Không cần đợi load vì tab đã sẵn sàng
        await delay(300); // Chỉ đợi ngắn để đảm bảo tab được focus
      }
    } else {
      console.log("[BG] Không tìm thấy tab CMS. Tạo tab mới...");
      cmsTab = await chrome.tabs.create({ url: cmsUrl, active: true });
      // Chờ tab mới load xong
      await waitForTabToLoad(cmsTab.id!);
    }

    console.log(`[BG] Tab CMS (ID: ${cmsTab.id}) đã sẵn sàng. Đợi content script...`);

    // Đợi thêm để đảm bảo content script đã inject xong
    await delay(800);

    // 5. Gửi dữ liệu sang tab CMS - fire and forget, không cần chờ response
    chrome.tabs.sendMessage(
      cmsTab.id!,
      {
        type: "PREPARE_COMPLAINT_FORM",
        payload: complaintData,
      }
    );

    console.log('[BG] Đã gửi message tới CMS, không chờ response');
  } catch (error: any) {
    console.error("[BG] Lỗi trong quá trình tạo khiếu nại:", error);
  }
}

// const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

// const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
// const GEMINI_API_KEY = "AIzaSyDRDPaTCetuCfzjuqvJjcG1sMhmB2aIVzE"; // Thay thế bằng API key thực tế
// const GEMINI_API_KEY_ALT = "AIzaSyAreyNgXS6sF-fvFNMB8jGITmii2P5b-rA"
// Hàm gọi API đã được cập nhật
async function processWithGemini(
  userPrompt: string, systemInstructionText?: string,
): Promise<string> {

  // System Instruction giúp định hình phản hồi của AI
  const systemInstruction = {
    parts: [
      {
        text: systemInstructionText || "Bạn là chuyên gia về địa chính Việt Nam. Nhiệm vụ của bạn là trích xuất hoặc tìm kiếm địa chỉ chính xác. LUÔN LUÔNG trả về kết quả dưới dạng một mảng JSON các đối tượng, không bao gồm văn bản giải thích hoặc ký tự markdown (như ```json)."
      }
    ]
  };

  // Xây dựng phần nội dung người dùng
  const userParts: any[] = [
    { text: `Yêu cầu: ${userPrompt}` }
  ];


  const requestBody = {
    system_instruction: systemInstruction,
    contents: [
      {
        role: "user",
        parts: userParts,
      },
    ],
    generationConfig: {
      // Cấu hình Thinking (Suy nghĩ chuyên sâu)
      thinkingConfig: {
        thinkingLevel: "HIGH", // Hoặc mức độ phù hợp với Model
      },
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
    },
  };
  // --- LOGIC CHỌN KEY ---
  // Ưu tiên: Key người dùng chọn -> Key Alt -> Key Mặc định
  const apiKeyToUse = currentGeminiKey || GEMINI_API_KEY_ALT || DEFAULT_GEMINI_KEY;
  try {

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKeyToUse}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`API Error: ${errorBody.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log("Gemini API response data:", data);

    // Kiểm tra phản hồi
    if (!data.candidates?.[0]?.content?.parts) {
      throw new Error("Không nhận được phản hồi từ AI.");
    }

    // Lấy phần text cuối cùng (AI thường bỏ phần 'thought' ra và chỉ trả về 'text' kết quả)
    let textResult = data.candidates[0].content.parts.find((p: any) => p.text)?.text || "";

    // Làm sạch chuỗi nếu AI cố tình trả về Markdown block ```json ... ```
    textResult = textResult.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      // Tìm vị trí mảng JSON trong trường hợp AI vẫn nói thêm vài câu bên ngoài
      const startIndex = textResult.indexOf("[");
      const endIndex = textResult.lastIndexOf("]");

      if (startIndex !== -1 && endIndex !== -1) {
        const jsonString = textResult.substring(startIndex, endIndex + 1);
        const jsObject = JSON.parse(jsonString);
        return JSON.stringify(jsObject); // Trả về chuỗi JSON chuẩn
      }

      return textResult; // Trả về nguyên bản nếu không tìm thấy dấu []
    } catch (parseError) {
      console.warn("Không thể parse JSON, trả về text thô.");
      return textResult;
    }

  } catch (error) {
    console.error("Lỗi khi gọi Gemini API:", error);
    throw error;
  }
}
/**
 * Lấy cache mã hiệu portal theo ngày từ chrome.storage.local
 * Cấu trúc lưu: { PORTAL_CODES_CACHE: { dateKey: string, data: { [portalId]: any } } }
 * Nếu dateKey khác ngày hiện tại, cache sẽ được reset (xóa dữ liệu cũ)
 */
async function getPortalCodesCache(
  dateKey: string,
): Promise<{ [portalId: string]: any }> {
  try {
    const STORAGE_KEY = "PORTAL_CODES_CACHE";
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const cacheObj = stored[STORAGE_KEY] as
      | { dateKey: string; data: { [portalId: string]: any } }
      | undefined;

    if (!cacheObj || cacheObj.dateKey !== dateKey) {
      // Reset cache cho ngày mới
      const newObj = { dateKey, data: {} as { [portalId: string]: any } };
      await chrome.storage.local.set({ [STORAGE_KEY]: newObj });
      return {};
    }

    return cacheObj.data || {};
  } catch (error) {
    console.error("Error getting portal codes cache (local storage):", error);
    return {};
  }
}

/**
 * Lấy mã hiệu từ portal với cache
 */
async function getCachedMaHieusFromPortalId(
  portalId: string,
  token: string,
  cache: { [portalId: string]: any },
  dateKey: string,
): Promise<any> {
  try {
    const STORAGE_KEY = "PORTAL_CODES_CACHE";

    // Kiểm tra cache trong bộ nhớ hiện tại
    if (cache[portalId]) {
      return cache[portalId];
    }

    // Không có cache -> gọi API
    const maHieusData = await getMaHieusFromPortalId([portalId], token);

    // Delay tránh spam API
    await delay(200);

    // Cập nhật cache trong chrome.storage.local
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const cacheObj = (stored[STORAGE_KEY] as {
      dateKey: string;
      data: { [id: string]: any };
    }) || { dateKey, data: {} };
    if (cacheObj.dateKey !== dateKey) {
      cacheObj.dateKey = dateKey;
      cacheObj.data = {};
    }
    cacheObj.data[portalId] = maHieusData;
    await chrome.storage.local.set({ [STORAGE_KEY]: cacheObj });

    // Cập nhật cả cache truyền vào để vòng lặp sau dùng lại không cần đọc storage
    cache[portalId] = maHieusData;

    return maHieusData;
  } catch (error) {
    console.error(
      `Error getting cached data for portal ${portalId} (local storage):`,
      error,
    );
    throw error;
  }
}

// Interface để match với ExtractedData class từ Flutter
interface ExtractedData {
  maHieu?: string;
  tenNguoiNhan?: string;
  diaChi?: string;
  soDienThoai?: string;
}

async function handleGuiAiLe(DoiTuong: any): Promise<void> {
  try {
    console.log("handleGuiAiLe received:", DoiTuong);

    // Parse dữ liệu từ Flutter (đã được JSON.stringify)
    let extractedData: ExtractedData;
    if (typeof DoiTuong === "string") {
      extractedData = JSON.parse(DoiTuong);
    } else {
      extractedData = DoiTuong;
    }

    console.log("Parsed ExtractedData:", extractedData);

    // Lấy tab đang active hiện tại
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length === 0 || !tabs[0].id) {
      console.error("Không tìm thấy tab đang active");
      return;
    }

    const activeTabId = tabs[0].id;
    console.log("Sending data to active tab:", activeTabId);

    // Gửi dữ liệu đến content script của tab đang active
    chrome.tabs.sendMessage(
      activeTabId,
      {
        message: "FILL_PORTAL_DATA_FROM_AI",
        extractedData: extractedData,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending message to content script:",
            chrome.runtime.lastError,
          );
        } else {
          console.log("Data sent successfully to content script:", response);
        }
      },
    );
  } catch (error) {
    console.error("Error in handleGuiAiLe:", error);
  }
}

async function handleSendSubmit(): Promise<void | PromiseLike<void>> {
  // Lấy tab đang active hiện tại
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tabs.length === 0 || !tabs[0].id) {
    console.error("Không tìm thấy tab đang active");
    return;
  }

  const activeTabId = tabs[0].id;
  console.log("Sending data to active tab:", activeTabId);

  // Gửi dữ liệu đến content script của tab đang active
  chrome.tabs.sendMessage(
    activeTabId,
    {
      message: "SEND_SUBMIT",
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error sending message to content script:",
          chrome.runtime.lastError,
        );
      } else {
        console.log("Data sent successfully to content script:", response);
      }
    },
  );
}

/**
 * Handler: Tìm kiếm thông tin đơn vị (Org) trên CMS
 */
async function handleSearchOrgInfo(
  payload: { code: string },
  sendResponse: (response: any) => void
) {
  try {
    const { code } = payload;
    // Bypass CORS bằng cách gọi từ Background
    const response = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`, {
      method: "GET",
      headers: {
        "accept": "*/*",
        "x-requested-with": "XMLHttpRequest"
      },
      credentials: "include" // Quan trọng: Gửi kèm Cookie đăng nhập CMS
    });

    if (response.ok) {
      const data = await response.json();
      sendResponse({ status: 'success', data: data });
    } else {
      sendResponse({ status: 'error', error: `HTTP ${response.status}: ${response.statusText}` });
    }
  } catch (error: any) {
    console.error("[BG] Error searching org:", error);
    sendResponse({ status: 'error', error: error.message });
  }
}
/**
 * Handler: Tạo CMS Ticket V2 (Logic tập trung tại Background)
 */
async function handleCreateCMSTicketV2(
  payload: {
    maVanDon: string,
    serviceCode: string,
    ticketType: 'support' | 'complaint',
    content: string
  },
  sendResponse: (response: any) => void
) {
  try {
    const { maVanDon, serviceCode, ticketType, content } = payload;

    console.log(`[BG] Processing CMS Ticket creation for ${maVanDon}`);

    // 1. Tính toán ngày hết hạn (Business Logic)
    const now = new Date();
    const expirationDate = new Date(now);
    // Support +1 ngày, Complaint +7 ngày
    expirationDate.setDate(expirationDate.getDate() + (ticketType === 'support' ? 1 : 7));
    const expiration = `${String(expirationDate.getDate()).padStart(2, '0')}/${String(expirationDate.getMonth() + 1).padStart(2, '0')}/${expirationDate.getFullYear()}`;

    // 2. Mapping Service Code
    const ttkSrvIdL3 = SERVICE_CODE_MAPPING[serviceCode] || SERVICE_CODE_MAPPING["DEFAULT"] || "1206";

    // 3. Cấu tạo Object troubleticketData
    const troubleticketData = {
      ttkType: "2",
      ttkContactName: "Bưu cục Bồng Sơn 1",
      ttkSource: "1",
      ttkSeverity: "1",
      ttkReason: ticketType === 'support' ? "134" : "534",
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
      parcelId: maVanDon,
      postageData: {
        parcelId: maVanDon,
        poAcc: "", poName: "", managerOrg: "", poWeigh: "", poRate: "",
        poClassify: "", poSenderName: "", poSenderPhone: "", poSenderAddress: "",
        poSenderAddressDetail: "", poReceiverName: "", poReceiverPhone: "",
        poReceiverAddress: "", poReceiverAddressDetail: "", poParcelDirection: "",
        poSend: "", poSendName: "", poSenderEmail: "", poStatus: "", poMethod: ""
      }
    };

    // 4. Tạo FormData
    const form = new FormData();
    form.append("file", "");
    form.append("type", "DVBC");
    form.append(
      "troubleticketData",
      new Blob([JSON.stringify(troubleticketData)], { type: "application/json" })
    );

    // 5. Gọi Fetch
    const response = await fetch("https://cms.vnpost.vn/api/admin/complaints/save", {
      method: "POST",
      body: form,
      credentials: "include"
    });

    const result = await response.json();

    if (result.result === true && result.code) {
      sendResponse({ status: 'success', ticketCode: result.code });
    } else {
      sendResponse({ status: 'error', error: result.message || 'CMS trả về lỗi' });
    }

  } catch (error: any) {
    console.error("[BG] Error creating ticket:", error);
    sendResponse({ status: 'error', error: error.message });
  }
}

/**
  * Service Code Mapping - Map từ service code sang ttkSrvIdL3
  */
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
// END: ================== MY VNPOST ==================
/**
 * Lấy cấu hình tự động CMS từ Firebase (Global)
 */
async function handleGetCMSAutoConfigs(
  sendResponse: (response: any) => void,
) {
  try {
    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lấy từ path chung CMS_AUTO_CONFIGS
    const snapshot = await db.ref('CMS_AUTO_CONFIGS').get();
    const configs = snapshot.val() || [];

    console.log(`[BG] Đã tải ${configs.length} cấu hình tự động từ Firebase`);
    sendResponse({ status: "success", configs: configs });
  } catch (error: any) {
    console.error("[BG] Lỗi khi lấy cấu hình tự động:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

/**
 * Lưu cấu hình tự động CMS lên Firebase (Global)
 */
async function handleSaveCMSAutoConfigs(
  payload: { configs: any[] },
  sendResponse: (response: any) => void,
) {
  try {
    const { configs } = payload;

    if (!db) {
      sendResponse({ status: "error", error: "Firebase chưa được khởi tạo" });
      return;
    }

    // Lưu vào path chung CMS_AUTO_CONFIGS
    await db.ref('CMS_AUTO_CONFIGS').set(configs);

    console.log(`[BG] Đã lưu ${configs.length} cấu hình tự động lên Firebase`);
    sendResponse({ status: "success" });
  } catch (error: any) {
    console.error("[BG] Lỗi khi lưu cấu hình tự động:", error);
    sendResponse({ status: "error", error: error.message });
  }
}

// ==========================================
// BACKGROUND FIREBASE SYNC SERVICE (FIX CSP)
// ==========================================

const downloadCache = new Map<string, Promise<Blob>>();
const CACHE_DURATION = 5000;

// Helper: Download Blob (Bypass CSP/CORS)
async function downloadImageBlob(url: string): Promise<Blob> {
  if (downloadCache.has(url)) return downloadCache.get(url)!;

  const promise = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(res.statusText);
    return await res.blob();
  });

  downloadCache.set(url, promise);
  setTimeout(() => downloadCache.delete(url), CACHE_DURATION);
  return promise;
}

// Hàm Sync Chính: Sử dụng biến toàn cục `db` có sẵn trong background.ts
async function bgSyncImages() {
  console.log("[BG-Sync] Bắt đầu đồng bộ ảnh...");

  if (!db) {
    console.error("[BG-Sync] Firebase DB chưa khởi tạo!");
    return;
  }

  try {
    // 1. Khởi tạo IndexedDB trong Background
    await initDB();

    // 2. Lấy keyMessage để biết path
    const key = await chromeStorageGet("keyMessage"); // Hàm có sẵn trong util.ts của bạn
    if (!key) return;

    const path = `PORTAL/CHILD/${key}/imported_images`;

    // Dùng style cũ: db.ref().once('value') hoặc .get()
    const snapshot = await db.ref(path).get();

    if (!snapshot.exists()) {
      console.log("[BG-Sync] Không có dữ liệu ảnh trên Firebase.");
      return;
    }

    const firebaseImages = snapshot.val() as Record<string, ImportedImage>;
    const firebaseIds = new Set(Object.keys(firebaseImages));

    // 3. Dọn dẹp ảnh thừa (Có trong Local nhưng ko có trên Firebase)
    const localImages = await getAllImages();
    for (const img of localImages) {
      if (!firebaseIds.has(img.imageId)) {
        await deleteImage(img.imageId);
        console.log(`[BG-Sync] Đã xóa ảnh thừa: ${img.imageId}`);
      }
    }

    // 4. Tải ảnh mới (Chạy song song giới hạn - Concurrency Limit)
    const CONCURRENCY = 3;
    const ids = Array.from(firebaseIds);
    let updatedCount = 0;

    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async (id) => {
          const meta = firebaseImages[id];

          // Kiểm tra xem đã có trong DB chưa để tránh tải lại
          // (Logic đơn giản: Nếu chưa có blob hoặc timestamp khác thì tải)
          const existing = localImages.find(l => l.imageId === id);
          const needDownload = !existing || existing.timestamp !== meta.timestamp || !existing.blob;

          if (needDownload) {
            try {
              console.log(`[BG-Sync] Đang tải: ${id}`);
              const blob = await downloadImageBlob(meta.url);
              await saveImage(id, meta, blob);
              updatedCount++;
            } catch (e) {
              console.error(`[BG-Sync] Lỗi tải ${id}:`, e);
              // Lưu metadata đễ vẫn hiện placeholder nếu tải lỗi
              await saveImage(id, meta);
            }
          }
        })
      );
    }

    // 5. Báo cho Sidepanel biết đã xong
    if (updatedCount > 0 || ids.length > 0) {
      console.log(`[BG-Sync] Hoàn tất. Cập nhật ${updatedCount} ảnh.`);
      chrome.runtime.sendMessage({ type: "IMAGES_UPDATED" }).catch(() => {
        // Bỏ qua lỗi nếu sidepanel không mở
      });
    }

  } catch (err) {
    console.error("[BG-Sync] Lỗi nghiêm trọng:", err);
  }
}

// Hàm khởi động Listener (Gọi hàm này trong initFirebase hoặc sau khi db đã có)
let isImageListenerRunning = false;
async function startImageListener() {
  if (isImageListenerRunning || !db) return;

  const key = await chromeStorageGet("keyMessage");
  if (!key) return;

  const path = `PORTAL/CHILD/${key}/imported_images`;
  console.log(`[BG-Sync] Đang lắng nghe thay đổi tại: ${path}`);

  // Dùng style cũ: db.ref().on()
  db.ref(path).on("value", (snapshot: any) => {
    // Debounce nhẹ để tránh spam nếu dữ liệu thay đổi liên tục
    console.log("[BG-Sync] Firebase thay đổi -> Trigger Sync");
    bgSyncImages();
  });

  isImageListenerRunning = true;
}
// async function loadDataJsonBase64(): Promise<string> {
//   try {
//     const url = chrome.runtime.getURL("optimized_data.json");
//     const response = await fetch(url);
//     const blob = await response.blob();
//     return new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onloadend = () => {
//         const result = reader.result as string;
//         // Lấy phần base64 sau dấu phẩy (data:application/json;base64,...)
//         const base64 = result.split(',')[1];
//         resolve(base64);
//       };
//       reader.onerror = reject;
//       reader.readAsDataURL(blob);
//     });
//   } catch (error) {
//     console.error("Error loading data.json:", error);
//     return "";
//   }
// }