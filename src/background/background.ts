importScripts('firebase-app-compat.js', 'firebase-database-compat.js');
importScripts("xlsxtool.js")
import { BuuGuiProps, DataSnapshotProps, KhachHangProps } from '../states/states';
import { NguoiGuiDetailProp, NguoiGuiProp } from './PopupInfo';
import { base64ToBlob, chromeStorageGet, convertBlobsToBlob, customSort, formatDateRight, pdfBlobTo64, saveBlob, toDateString, waitForTabLoadAfterAction } from './util';
import { delay, createOrActiveTab, waitForTabToLoad } from './util';
// import firebase from 'firebase/compat/app';

// Khai báo biến toàn cục từ importScripts để TypeScript nhận diện
declare var XLSX: any;
declare var firebase: any; // Khai báo firebase

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
  databaseURL: "https://xonapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xonapp",
  storageBucket: "xonapp.appspot.com",
  messagingSenderId: "892472148061",
  appId: "1:892472148061:web:f22a5c4ffd25858726cdb4",
};

let ref: firebase.database.Reference | null = null;
let refPing: firebase.database.Reference | null = null;
let refScannedItems: firebase.database.Reference | null = null; // Listener mới
let refCommand: firebase.database.Reference | null = null; // Listener cho command (nếu tách riêng)

let db: any = null;
let keyMessage: string = "maychu";
let TimeStampTemp: string = "";
let token: string = "";
let accountPortal: string = ""
let passwordPortal: string = ""
let buuCuc = ""
console.log('Background script is running');

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
// --- KẾT THÚC TRẠNG THÁI CỤC BỘ MỚI ---
var TimeStampItemsTemp = ""

type Snapshot = {
  TimeStamp?: string;
  [key: string]: any;
};
function setUpAlarm(): void {
  chrome.alarms.create('keep-alive', { periodInMinutes: 0.083 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keep-alive') {
      if (!ref) initFirebase();
    }
  });
}



async function initFirebase(): Promise<void> {

  token = await chromeStorageGet('token')
  accountPortal = await chromeStorageGet('accountPortal')
  passwordPortal = await chromeStorageGet('passwordPortal')
  keyMessage = await chromeStorageGet('keyMessage')
  buuCuc = await chromeStorageGet('buuCuc')
  if (!keyMessage) {
    console.error("Chưa cấu hình keyMessage!");
    // Có thể thông báo lỗi hoặc dừng lại
    return;
  }
  if (firebase.apps.length === 0) {
    console.log('Initialize Firebase');
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.database();


  ref = db.ref(`PORTAL/CHILD/${keyMessage}/message/topc`);
  refPing = db.ref(`PORTAL/STATUS/topc`);
  ref.on('value', handleDataChange);
  refPing.on('value', handlePingChange);

  // --- Listener MỚI ---
  refScannedItems = db.ref(`PORTAL/CHILD/${keyMessage}/scannedItems`);
  refScannedItems.on('value', handleScannedItemsUpdate);

  // --- KẾT THÚC Listener MỚI ---

  // Khởi tạo các giá trị timestamp lần đầu
  const initialItemsSnapshot = await refScannedItems.get();
  TimeStampItemsTemp = initialItemsSnapshot.val()?.TimeStamp || "";

  console.log("Firebase initialized, listening for scanned items and commands on key:", keyMessage);

}


let TimeStampPing = ""
let TimeStampScannedItems = "" // Lưu timestamp của scannedItems
async function handlePingChange(snapshot: firebase.database.DataSnapshot): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data || TimeStampPing.length === 0 || TimeStampPing === data.TimeStamp) {
    TimeStampPing = data!.TimeStamp!;
    return;
  } else {
    TimeStampPing = data.TimeStamp!;
  }
  console.log('Data received:', data);
  if (data.Lenh == 'ping') {
    updateToPhone('pong', keyMessage, data.DoiTuong);
    return;
  }
}

// --- HÀM MỚI: Xử lý cập nhật danh sách mã quét ---
async function handleScannedItemsUpdate(snapshot: firebase.database.DataSnapshot): Promise<void> {

  const data: Snapshot | null = snapshot.val();
  if (!data)
    return;

  if (!data || TimeStampScannedItems.length === 0 || TimeStampScannedItems === data.TimeStamp) {
    TimeStampScannedItems = data!.TimeStamp!;
    return;
  } else {
    TimeStampScannedItems = data.TimeStamp!;
  }
  var arrayData = JSON.parse(data.DoiTuong);
  const newScannedItems: BuuGuiProps[] = Array.isArray(arrayData)
    ? arrayData.filter(item => item && typeof item.MaBuuGui === 'string') // Lọc bỏ phần tử không hợp lệ
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


  console.log('Received updated scannedItems (objects):', newScannedItems.length, 'items');

  // --- KIỂM TRA CỜ DỪNG LỖI ---
  if (isStoppedOnError) {
    console.warn("Processing stopped due to previous error. Ignoring scannedItems update.");
    updateToPhone("warning", "Đã dừng xử lý do lỗi trước đó. Cần khởi động lại hoặc xóa lỗi.");
    // Cập nhật allScannedItems nhưng không trigger xử lý
    allScannedItems = newScannedItems;
    return;
  }
  // --- KẾT THÚC KIỂM TRA ---


  const previousScannedItems: any[] = [...allScannedItems]; // Lưu list cũ để đối chiếu
  allScannedItems = newScannedItems; // Cập nhật list mới nhất
  // --- Reconciliation: Xử lý các item bị xóa (So sánh MaBuuGui) ---
  const newMaBgsSet = new Set(allScannedItems.map(item => item.MaBuuGui)); // Set MaBuuGui mới
  const removedItems = previousScannedItems.filter(oldItem => !newMaBgsSet.has(oldItem.MaBuuGui)); // Lọc object cũ không có MaBuuGui trong set mới

  if (removedItems.length > 0) {
    const removedMaBgs = removedItems.map(item => item.MaBuuGui); // Lấy MaBuuGui bị xóa
    console.log("Items removed by user (MaBuuGui):", removedMaBgs);
    updateToPhone("info", `Đã xóa các mã: ${removedMaBgs.join(", ")}`);

    const originalQueueLength = processingQueue.length;
    const removedMaBgsSet = new Set(removedMaBgs); // Set để lọc queue nhanh hơn
    processingQueue = processingQueue.filter(queueItemMaBG => !removedMaBgsSet.has(queueItemMaBG)); // Lọc queue (vẫn là string[])

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
  const currentMaBgs = allScannedItems.map(item => item.MaBuuGui);
  // Lọc ra MaBuuGui chưa xử lý và chưa có trong queue
  const maBgsReadyForQueue = currentMaBgs.filter(maBG => !processedItems.has(maBG) && !processingQueue.includes(maBG));

  if (maBgsReadyForQueue.length > 0) {
    console.log("Adding remaining items (MaBuuGui) to queue:", maBgsReadyForQueue);
    updateToPhone("info", `Bắt đầu xử lý ${maBgsReadyForQueue.length} mã cuối.`);
    processingQueue.push(...maBgsReadyForQueue); // Thêm MaBuuGui (string) vào queue
    processNextItemInBackground();
  } else if (processingQueue.length === 0 && !currentItemBeingProcessed) {
    console.log("No remaining items to process. Triggering print.");
    updateToPhone("info", "Không còn mã nào để xử lý, chuẩn bị in.");
    await triggerPrint();
    isFinalProcessingTriggered = false;
  } else {
    console.log("Waiting for current processing to finish before printing remaining.");
    updateToPhone("info", "Đang chờ xử lý các mã trước đó...");
  }
}

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
  const itemsReadyForQueue = allScannedItems.filter(item => !processedItems.has(item.MaBuuGui) && !processingQueue.includes(item.MaBuuGui));

  if (itemsReadyForQueue.length > BUFFER_SIZE) {
    const nextItemMaBG = itemsReadyForQueue[0].MaBuuGui; // Lấy MaBuuGui (string) của item cũ nhất
    if (!processingQueue.includes(nextItemMaBG)) {
      console.log("Adding to queue based on buffer (MaBuuGui):", nextItemMaBG);
      processingQueue.push(nextItemMaBG); // Thêm MaBuuGui (string) vào queue
      processNextItemInBackground();
    }
  } else if (isFinalProcessingTriggered && itemsReadyForQueue.length === 0) {
    console.log("Final processing complete, queue is empty. Triggering print.");
    triggerPrint();
    isFinalProcessingTriggered = false;
  }
}
async function hardRefreshSpecificTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
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
    return;
  }
  // --- KẾT THÚC KIỂM TRA ---

  if (currentItemBeingProcessed || processingQueue.length === 0) {
    if (!currentItemBeingProcessed && processingQueue.length === 0 && isFinalProcessingTriggered) {
      console.log("Queue is now empty after processing. Triggering print.");
      await triggerPrint();
      isFinalProcessingTriggered = false;
    }
    return;
  }

  const maBGToProcess = processingQueue.shift()!; // Lấy MaBuuGui (string)

  // Kiểm tra lại xem MaBuuGui có còn trong danh sách đối tượng mới nhất không
  if (!allScannedItems.some(item => item.MaBuuGui === maBGToProcess)) {
    console.log("Item", maBGToProcess, "was removed before processing could start. Skipping.");
    processedItems.delete(maBGToProcess);
    triggerProcessingCheck();
    return;
  }

  // --- KIỂM TRA TOKEN ---
  // const isTokenOk: boolean = await checkToken();
  // if (!isTokenOk) {
  //   const tokenTemp = await loginDirect(accountPortal, passwordPortal);
  //   if (!tokenTemp) {
  //     console.error("Login failed. Stopping processing.");
  //     updateToPhone("message", "Lỗi đăng nhập Portal. Dừng xử lý.");
  //     isStoppedOnError = true; // Dừng lại
  //     currentItemBeingProcessed = null;
  //     processingQueue = []; // Xóa hàng đợi
  //     return;
  //   }
  //   saveToken(tokenTemp);
  //   token = tokenTemp;
  // }
  // --- KẾT THÚC KIỂM TRA TOKEN ---

  currentItemBeingProcessed = maBGToProcess; // Đánh dấu item đang xử lý (string)
  // Tìm index để hiển thị badge chính xác
  const currentIndexInList = allScannedItems.findIndex(item => item.MaBuuGui === maBGToProcess);
  console.log(`Đang xử lý BG: ${currentItemBeingProcessed} (Index: ${currentIndexInList}, Queue: ${processingQueue.length})`);
  updateToPhone("message", `Đang xử lý ${currentItemBeingProcessed}`);
  chrome.action.setBadgeText({ text: `${currentIndexInList + 1}` }); // Hiển thị index (1-based)

  try {
    // --- Lấy thông tin BuuGuiProps ĐẦY ĐỦ ---
    // Ưu tiên lấy từ allScannedItems đã có sẵn để đảm bảo dùng đúng dữ liệu đã trigger việc xử lý
    let currentBuuGui = allScannedItems.find(item => item.MaBuuGui === maBGToProcess);

    if (!currentBuuGui) {
      throw new Error(`Không tìm thấy thông tin Bưu gửi đầy đủ cho: ${maBGToProcess}`);
    }

    // Cần cơ chế lấy maKH và options phù hợp. Ví dụ lấy từ storage
    const maKH = await chromeStorageGet('currentMaKH'); // Ví dụ
    const options = await chromeStorageGet('currentOptions'); // Ví dụ

    if (!maKH) {
      throw new Error(`Chưa chọn khách hàng (maKH)`);
    }

    // Gửi message đến Content Script
    const tabId = await findPortalTabId(); // Hàm tìm tab Portal

    if (!tabId) {
      throw new Error("Không tìm thấy tab Portal đang hoạt động.");
    }

    chrome.tabs.sendMessage(tabId, {
      message: "PROCESS_SINGLE_ITEM", // Lệnh mới
      current: currentBuuGui,
      makh: maKH,
      keyMessage: keyMessage,
      options: options
    }, async (response) => {
      const processedMaBG = currentItemBeingProcessed; // Lưu lại mã vừa xử lý
      currentItemBeingProcessed = null; // Đặt lại ngay

      // Kiểm tra lỗi runtime trước
      if (chrome.runtime.lastError) {
        console.error(`Lỗi gửi/nhận từ content script cho ${processedMaBG}:`, chrome.runtime.lastError.message);
        updateToPhone("message", `Lỗi hệ thống khi xử lý ${processedMaBG}.`);
        isStoppedOnError = true; // Dừng lại do lỗi hệ thống
        processingQueue = [];
        triggerProcessingCheck(); // Không cần thiết nhưng để đảm bảo
        return;
      }

      // Kiểm tra xem item có bị xóa trong lúc đang xử lý không
      if (!allScannedItems.some(item => item.MaBuuGui === processedMaBG!)) {
        console.log("Item", processedMaBG, "was deleted during processing. Ignoring result.");
        processedItems.delete(processedMaBG!); // Đảm bảo không bị tính là đã xử lý
        triggerProcessingCheck();
        return;
      }

      // Xử lý kết quả
      if (response && response.status === 'success') {
        console.log("Processed successfully:", processedMaBG);
        processedItems.add(processedMaBG!);
        updateToPhone("message", `${processedMaBG} đã được xử lý`);

        successfulProcessCount++;
        console.log(`Successful items since last refresh: ${successfulProcessCount}`);

        if (successfulProcessCount >= REFRESH_THRESHOLD) {
          console.log(`Reached threshold (${REFRESH_THRESHOLD}). Refreshing tab ${tabId}...`);
          updateToPhone("message", `Đã xử lý ${successfulProcessCount} mã. Đang làm mới trang...`);
          await delay(1000);

          const refreshedTab = await hardRefreshSpecificTab(tabId);

          if (!refreshedTab) {
            console.error(`Tab ${tabId} could not be refreshed or was closed. Stopping process.`);
            updateToPhone("message", `Lỗi: Không thể làm mới tab ${tabId}. Dừng xử lý.`);
            isStoppedOnError = true;
            processingQueue = [];
            successfulProcessCount = 0;
            chrome.action.setBadgeText({ text: 'REF_ERR' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
            return; // Thoát khỏi IIFE
          }

          console.log(`Tab ${tabId} refreshed successfully. Resetting counter.`);
          updateToPhone("message", `Làm mới trang xong. Tiếp tục xử lý...`);
          successfulProcessCount = 0;

          await delay(2500); // Chờ ổn định
        }
      } else {
        // --- Dừng lại khi có lỗi từ content script ---
        const errorMsg = response?.error || 'Lỗi không xác định từ Portal';
        console.error("Lỗi xử lý từ content script:", processedMaBG, response);
        updateToPhone("message", `Lỗi xử lý ${processedMaBG}: ${errorMsg}. Đã dừng!`);
        isStoppedOnError = true;
        processingQueue = [];
        successfulProcessCount = 0;
        chrome.action.setBadgeText({ text: 'Lỗi!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
        return; // Thoát khỏi IIFE
      }
      triggerProcessingCheck(); // Gọi kiểm tra tiếp theo
    });

  } catch (error: any) {
    console.error(`Lỗi nghiêm trọng khi chuẩn bị xử lý ${currentItemBeingProcessed}:`, error);
    updateToPhone("message", `Lỗi hệ thống: ${error.message}. Đã dừng!`);
    isStoppedOnError = true; // Dừng lại do lỗi nghiêm trọng
    processingQueue = [];
    currentItemBeingProcessed = null;
    chrome.action.setBadgeText({ text: 'Lỗi!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  }
}


// --- HÀM MỚI: Tìm Tab Portal ---
async function findPortalTabId(maKH: string = ""): Promise<number | undefined> {
  await delay(500); // Đợi một chút để đảm bảo tab đã load xong
  console.log("handleSendAutoToPortal: Bắt đầu kiểm tra tab Portal...");
  let foundReadyTabId: number | null = null;
  let readyTabInfo: chrome.tabs.Tab | null = null; // Lưu thông tin tab tìm thấy

  try {
    // 1. Tìm các tab Portal có URL khớp
    const portalTabs = await chrome.tabs.query({ url: "https://portalkhl.vnpost.vn/accept-api*" });
    console.log(`handleSendAutoToPortal: Tìm thấy ${portalTabs.length} tab Portal khớp URL.`);

    // 2. Duyệt qua các tab và kiểm tra element
    for (const tab of portalTabs) {
      if (!tab.id) continue; // Bỏ qua nếu tab không có ID
      console.log(`handleSendAutoToPortal: Kiểm tra tab ID: ${tab.id}, URL: ${tab.url}`);
      try {
        // *** ĐÁNH DẤU: Tiêm script để kiểm tra sự tồn tại của #ttNumberSearch ***
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => !!document.querySelector("#ttNumberSearch") // Hàm kiểm tra trực tiếp
        });

        // executeScript trả về một mảng kết quả, kiểm tra phần tử đầu tiên
        if (injectionResults && injectionResults[0] && injectionResults[0].result === true) {
          console.log(`handleSendAutoToPortal: Tab ID: ${tab.id} đã sẵn sàng (tìm thấy #ttNumberSearch).`);
          foundReadyTabId = tab.id;
          readyTabInfo = tab; // Lưu lại thông tin tab
          var currentMaKH = "";
          if (maKH != "") {
            currentMaKH = maKH
          } else {
            currentMaKH = await chromeStorageGet("currentMaKH")
          }
          window.postMessage({
            type: "CONTENT",
            message: "GETIDKH",
          });
          break; // Dừng tìm kiếm khi đã tìm thấy tab phù hợp
        } else {
          console.log(`handleSendAutoToPortal: Tab ID: ${tab.id} không tìm thấy #ttNumberSearch.`);
        }
      } catch (injectionError: any) {
        // Có thể tab đã đóng hoặc không có quyền tiêm script
        console.warn(`handleSendAutoToPortal: Lỗi khi kiểm tra tab ID: ${tab.id}. Lỗi: ${injectionError.message}`);
        // Bỏ qua và tiếp tục với tab tiếp theo (nếu có)
      }
    }

    // 3. Xử lý dựa trên kết quả kiểm tra
    if (foundReadyTabId && readyTabInfo) {
      // *** ĐÁNH DẤU: Nếu tìm thấy tab sẵn sàng ***
      console.log(`handleSendAutoToPortal: Đã tìm thấy tab Portal (ID: ${foundReadyTabId}). Kích hoạt và gửi trực tiếp...`);
      updateToPhone("message", `Portal OK. Đang gửi...`, keyMessage);

      // *** Kích hoạt (đưa lên focus) tab đã tìm thấy ***
      await chrome.tabs.update(foundReadyTabId, { active: true });
      // Có thể cần chờ một chút để đảm bảo tab đã active hoàn toàn, mặc dù thường không cần
      await delay(300);

      // *** Gọi trực tiếp handleSendToPortal ***
      // Hàm này sẽ tự động lấy tab đang active (chính là tab vừa được kích hoạt)
      // Thêm await nếu handleSendToPortal là async và bạn cần đợi nó xong
      return foundReadyTabId; // Trả về ID tab đã tìm thấy


    } else {
      // *** ĐÁNH DẤU: Nếu không tìm thấy tab nào sẵn sàng ***
      console.log("handleSendAutoToPortal: Không tìm thấy tab Portal sẵn sàng. Tiến hành khởi tạo...");
      updateToPhone("message", "Đang khởi tạo Portal...", keyMessage);
      var currentMaKH = "";
      if (maKH != "") {
        currentMaKH = maKH
        console.log("handleSendAutoToPortal: currentMaKH:", currentMaKH);
      } else {
        currentMaKH = await chromeStorageGet("currentMaKH")
      }

      const snapshot = await db.ref("PORTAL/HopDongs/" + currentMaKH).get();
      const hopDong = snapshot.val();
      // Gọi hàm khởi tạo (đã được sửa để trả về boolean)
      const isKhoiTaoOK: boolean = await khoiTaoPortal(hopDong); // Giả sử handleKhoiTao trả về boolean

      if (isKhoiTaoOK) {
        console.log("handleSendAutoToPortal: Khởi tạo thành công. Đang gửi dữ liệu...");
        updateToPhone("message", "Khởi tạo thành công. Đang gửi dữ liệu...", keyMessage);
        // Sau khi khởi tạo thành công, tab đích đã sẵn sàng và active, gọi gửi dữ liệu
        // Thêm await nếu handleSendToPortal là async
        //get tabid Active
        var tabs = await chrome.tabs.query({ active: true, currentWindow: true }) // Lấy ID tab hiện tại (đã được kích hoạt)
        return tabs[0].id
      } else {
        console.error("handleSendAutoToPortal: Khởi tạo Portal thất bại.");
        // handleKhoiTao đã gửi thông báo lỗi rồi, không cần gửi lại ở đây
        // updateToPhone("message", "Khởi tạo Portal thất bại, vui lòng thử lại sau.", keyMessage);
      }
    }

  } catch (error: any) {
    // 4. Xử lý lỗi chung (ví dụ: lỗi khi query tabs)
    console.error("Lỗi trong handleSendAutoToPortal:", error);
    updateToPhone("message", `Lỗi khi tự động gửi Portal: ${error.message}`, keyMessage);
  }

}


// --- HÀM MỚI: Trigger việc in ấn ---
async function triggerPrint(): Promise<void> {
  // Lấy danh sách MaBuuGui của những item đã xử lý thành công VÀ còn trong list cuối cùng
  const maBgsToPrint = allScannedItems
    .filter(item => processedItems.has(item.MaBuuGui)) // Lọc các object hợp lệ
    .map(item => item.MaBuuGui);                      // Chỉ lấy MaBuuGui (string)

  console.log("Triggering print for valid processed MaBuuGui:", maBgsToPrint);

  if (maBgsToPrint.length === 0) {
    console.log("No valid items to print.");
    updateToPhone("info", "Không có mã hợp lệ nào để in.");
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  updateToPhone("info", `Đang chuẩn bị in ${maBgsToPrint.length} mã...`);

  await printMaHieus(maBgsToPrint); // Hàm in nhận mảng string MaBuuGui

  // Reset trạng thái sau khi in (tùy thuộc luồng mong muốn)
  // Có thể cần xóa processedItems, reset cờ lỗi,...
  // processedItems.clear();
  // isStoppedOnError = false; // Reset lỗi nếu muốn phiên làm việc tiếp theo bắt đầu lại
  // isFinalProcessingTriggered = false;
  chrome.action.setBadgeText({ text: 'OK' });
  chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
  await delay(2000);
  chrome.action.setBadgeText({ text: '' });
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

async function handleDataChange(snapshot: firebase.database.DataSnapshot): Promise<void> {

  const data: Snapshot | null = snapshot.val();
  if (!data)
    return;
  if (!data || TimeStampTemp.length === 0 || TimeStampTemp === data.TimeStamp) {
    TimeStampTemp = data!.TimeStamp ?? "";
    return;
  } else {
    TimeStampTemp = data.TimeStamp ?? "";
  }
  console.log("Data changed:", JSON.stringify(data));

  const isOk: boolean = await checkToken();
  if (!isOk) {
    const tokenTemp = await loginDirect(accountPortal, passwordPortal);
    if (!tokenTemp) {
      console.log("Token null");
      return;
    }
    saveToken(tokenTemp);
    token = tokenTemp;
  }
  const commandHandlers: { [key: string]: (data: any) => Promise<void> } = {
    "printMaHieus": async (data: any) => await printMaHieus(JSON.parse(data.DoiTuong)),
    "xoabg": async (data: any) => await handleXoaBuuGui(JSON.parse(data.DoiTuong)),
    "laylan": async (data: any) => {
      const maHieus = await handleGetMaHieus(data);
      const codes: string[] = maHieus!.map(element => element.Code);
      const codesIDs: string[] = maHieus!.map(element => element.IDCODE);
      const result = {
        isSorted: false,
        codes: codes,
        isAutoBD: false,
        isPrinted: true,
        codeIDs: codesIDs
      };
      console.log('Result:', result);
      updateToPC("checkdingoais", JSON.stringify(result));
    },
    "preparePrintMaHieus": async (data: any) => await preParePrintMaHieus(JSON.parse(data.DoiTuong)),
    "hoanTatTin": async (data: any) => await hoanTatTin(JSON.parse(data.DoiTuong)),
    "dieuTin": async (data: any) => await dieuTin(JSON.parse(data.DoiTuong)),
    "sendtoportal": async (data: any) => { handleSendToPortal(data.DoiTuong) },
    // "test": async (data: any) => { await hoanTatTinPNSFetch(["CK990242988VN", "CK990403835VN"], 10) },
    "sendautotoportal": async (data: any) => handleSendAutoToPortal(data),
    "sendtoendandprint": async (data: any) => handleChayDenCuoiVaIn(),
    "savekhoptions": async (data: any) => handleSaveKHOption(data),
    "edithanghoa": async (data: any) => handleEditHangHoa(data),
    "updatekl": async (data: any) => await handleEditKL(data),

    "getpns": async (data: any) => {
      let dayLast;
      try {
        dayLast = JSON.parse(data.DoiTuong).day;
      } catch (error) {
        console.error("Error parsing JSON:", error);
        dayLast = "-2";
      }
      await handleGetPNS(dayLast ?? "-2");
    },
    "addpns": async (data: any) => {
      let dayLast1;
      try {
        dayLast1 = JSON.parse(data.DoiTuong).day;
      } catch (error) {
        console.error("Error parsing JSON:", error);
        dayLast1 = "-2";
      }
      await handleAddPNS(dayLast1 ?? "-2");
    },
    "khoitao": async (data: any) => { await handleKhoiTao(data); },
    "edittoportal": async (data: any) => {
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
    "loginpns": async (data: any) => {

      const listTab = await chrome.tabs.query({});
      if (listTab.length === 0) return;
      for (let i = 0; i < listTab.length; i++) {
        if (listTab[i].url?.indexOf("packnsend.vnpost.vn") !== -1) {
          chrome.tabs.sendMessage(
            listTab[i].id!,
            {
              message: "SENDCAPCHAR",
              content: data.DoiTuong,
              gd: false
            },
            (res) => {
              if (!chrome.runtime.lastError) {
                console.log("Đã nhận tin nhắn từ content PNS", res);
              } else {
                console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
              }
            }
          );
          break;
        }
      }
    },
    "loginpnsgd": async (data: any) => {
      const listTab = await chrome.tabs.query({});
      if (listTab.length === 0) return;
      for (let i = 0; i < listTab.length; i++) {
        if (listTab[i].url?.indexOf("packnsend.vnpost.vn") !== -1) {
          chrome.tabs.sendMessage(
            listTab[i].id!,
            {
              message: "SENDCAPCHAR",
              content: data.DoiTuong,
              gd: true
            },
            (res) => {
              if (!chrome.runtime.lastError) {
                console.log("Đã nhận tin nhắn từ content PNS", res);
              } else {
                console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
              }
            }
          );
          break;
        }
      }
    },
    "getPortal": async (data: any) => await handleGetPortal(data.DoiTuong),
    "printPage": async (data: any) => await handlePrintPage(data.DoiTuong),
    "printPageSort": async (data: any) => await handlePrintPageSort(data),
    "getMaHieus": async (data: any) => {
      const maHieus = await handleGetMaHieus(data);
      await updateToPhone("getMaHieus", JSON.stringify(maHieus));
    },
  };

  if (data.Lenh && commandHandlers[data.Lenh]) {
    await commandHandlers[data.Lenh](data);
  }
}
initFirebase();
setUpAlarm()

// --- Listener TIN NHẮN từ content script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
        request.keyMessage
      );
    }

  // --- KIỂM TRA CỜ DỪNG LỖI ---
  // Một số message vẫn cần chạy dù có lỗi, ví dụ PING hoặc lấy thông tin cơ bản
  // Nhưng các message liên quan đến xử lý nghiệp vụ chính thì nên kiểm tra
  const messagesToBlockOnError = ["SEND_MH", "REQUEST_EXCEL", "ADD"]; // Ví dụ

  if (isStoppedOnError && messagesToBlockOnError.includes(request.message)) {
    console.warn(`Processing stopped due to error. Blocking message: ${request.message}`);
    sendResponse({ status: "error", error: "Processing stopped due to previous error" });
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
        console.log(`Confirmation from content script for ${request.content}: ${request.content1}`);
        sendResponse({ status: "received" });
      } else if (request.message === "REQUEST_EXCEL") {
        let idsToFetch = [];
        // Đảm bảo request.content là mảng string
        if (Array.isArray(request.content)) {
          idsToFetch = request.content.map(String);
        } else if (typeof request.content === 'string') {
          idsToFetch = [request.content];
        } else {
          console.error("Invalid content for REQUEST_EXCEL:", request.content);
          sendResponse({ status: "error", error: "Invalid data format" });
          return;
        }

        if (!request.token) {
          console.error("Missing token for REQUEST_EXCEL");
          sendResponse({ status: "error", error: "Missing token" });
          return;
        }

        try {
          const res = await getMaHieusFromPortalId(idsToFetch, request.token);
          if (!res) {
            updateToPhone("message", "Không lấy được dữ liệu từ Portal để xuất Excel");
            sendResponse({ status: "error", error: "Failed to fetch data from Portal" });
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
    } else if (request.event === "BADGE") {
      chrome.action.setBadgeText({ text: request.content.toString() });
      sendResponse({ status: "badge_updated" });
    }
    // Thêm các event khác nếu cần
  })();
  return true; // Quan trọng: Luôn trả về true để giữ kênh message mở cho các xử lý bất đồng bộ
});
const preParePrintMaHieus = async (maHieus: string[]) => {
  await prepareBlobs(maHieus);
}

async function handleSendAutoToPortal(commandData: any): Promise<void> {
  const logPrefix = "BG: handleSendAutoToPortal(Loop) -"; // Tiền tố log
  console.log(`${logPrefix} Received command. Data:`, commandData);

  let targetTabId: number | undefined = undefined;
  let processCountSinceRefresh = 0; // Biến đếm *cục bộ* cho lần chạy này
  let shouldStopLoop = false; // Cờ để dừng vòng lặp nếu có lỗi

  try {
    // 1. Phân tích dữ liệu lệnh (DoiTuong)
    let parsedDoiTuong: any;
    let startMaBG: string | undefined = undefined; // Mã BG để bắt đầu (tùy chọn)
    let maKH: string;
    let options: any;
    try {
      parsedDoiTuong = JSON.parse(commandData.DoiTuong);
      maKH = parsedDoiTuong.maKH;
      options = parsedDoiTuong.options;
      startMaBG = parsedDoiTuong.maBG; // Lấy maBG nếu có
      if (parsedDoiTuong.account && parsedDoiTuong.password) {
        accountPortal = parsedDoiTuong.account;
        passwordPortal = parsedDoiTuong.password;
      }


      if (!maKH) {
        throw new Error("Dữ liệu lệnh thiếu maKH.");
      }
    } catch (parseError: any) {
      console.error(`${logPrefix} Failed to parse DoiTuong JSON:`, commandData.DoiTuong, parseError);
      updateToPhone("error", `Lỗi dữ liệu lệnh sendautotoportal: ${parseError.message}`);
      return;
    }
    console.log(`${logPrefix} Parsed command - maKH: ${maKH}, startMaBG: ${startMaBG}, options:`, options);
    // --- Bước 2: Tìm hoặc Khởi tạo Tab Portal (CHỈ MỘT LẦN) ---
    console.log(`${logPrefix} Finding or Initializing Portal tab ONCE...`);
    targetTabId = await findPortalTabId(maKH); // Gọi hàm tìm/khởi tạo
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
      const bgsFirebase = await db.ref("PORTAL/BuuGuis/").get();
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
        updateToPhone("info", "Không có bưu gửi nào trong danh sách trên Firebase.");
        return;
      }
    } catch (fetchError: any) {
      console.error(`${logPrefix} Error fetching or parsing BuuGuis from Firebase:`, fetchError);
      updateToPhone("error", `Lỗi lấy dữ liệu Firebase: ${fetchError.message}`);
      return;
    }

    // 3. Xác định chỉ số bắt đầu (startIndex)
    let startIndex = 0;
    if (startMaBG) {
      startIndex = bgs.findIndex(item => item.MaBuuGui === startMaBG);
      if (startIndex === -1) {
        console.warn(`${logPrefix} startMaBG "${startMaBG}" not found in the fetched list. Starting from index 0.`);
        updateToPhone("warning", `Không tìm thấy mã bắt đầu ${startMaBG}, xử lý từ đầu.`);
        startIndex = 0; // Nếu không tìm thấy, bắt đầu từ đầu
      } else {
        console.log(`${logPrefix} Found startMaBG at index ${startIndex}.`);
      }
    } else {
      console.log(`${logPrefix} No startMaBG provided. Starting from index 0.`);
    }

    // 4. Vòng lặp xử lý tuần tự
    updateToPhone("message", `Bắt đầu xử lý danh sách ${bgs.length - startIndex} bưu gửi...`);
    for (let i = startIndex; i < bgs.length; i++) {
      if (shouldStopLoop) break; // Kiểm tra cờ dừng lỗi

      const currentItem = bgs[i];
      console.log(`${logPrefix} Processing item ${i + 1}/${bgs.length} (Index in list: ${i}): ${currentItem.MaBuuGui}`);
      chrome.action.setBadgeText({ text: `${i + 1 - startIndex}` }); // Hiển thị số thứ tự xử lý
      updateToPhone("message", `Đang xử lý ${i + 1 - startIndex}/${bgs.length - startIndex}: ${currentItem.MaBuuGui}`);

      try {
        // 5.1. Kiểm tra Tab còn tồn tại không (an toàn hơn)
        // Mặc dù không tìm lại, việc kiểm tra trước khi gửi là cần thiết phòng user đóng tab
        try {
          console.log(`${logPrefix} Verifying tab ${targetTabId} exists...`); // Log kiểm tra
          await chrome.tabs.get(targetTabId!); // Thêm ! vì đã kiểm tra lúc đầu
        } catch (e) {
          // Nếu tab không còn tồn tại -> Lỗi nghiêm trọng, dừng lại
          console.error(`${logPrefix} Target tab ${targetTabId} not found before sending message. Stopping.`);
          updateToPhone("error", `Tab Portal (ID: ${targetTabId}) đã bị đóng. Dừng xử lý.`);
          chrome.action.setBadgeText({ text: "TAB_GONE" });
          chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
          shouldStopLoop = true;
          continue; // Dừng lần lặp này và thoát vòng lặp ở lần kiểm tra tiếp theo
        }


        // 4.2. Gửi message PROCESS_SINGLE_ITEM và chờ response
        console.log(`${logPrefix} Sending PROCESS_SINGLE_ITEM for ${currentItem.MaBuuGui} to tab ${targetTabId}...`);
        // Dùng Promise để await response từ sendMessage
        const response = await new Promise<any>((resolve, reject) => {
          chrome.tabs.sendMessage(targetTabId!, { // Thêm ! vì đã kiểm tra targetTabId
            message: "PROCESS_SINGLE_ITEM",
            current: currentItem,
            makh: maKH, // maKH dùng chung từ lệnh
            keyMessage: keyMessage,
            options: options // options dùng chung từ lệnh
          }, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || "Lỗi gửi/nhận message"));
            } else {
              resolve(res); // Resolve với phản hồi từ content script
            }
          });
        });

        // 4.3. Xử lý response
        if (response && response.status === 'success') {
          console.log(`${logPrefix} Successfully processed item: ${currentItem.MaBuuGui}`);
          // Không cần add vào processedItems của luồng tự động

          processCountSinceRefresh++; // Tăng biến đếm *cục bộ*
          console.log(`${logPrefix} Success count since refresh: ${processCountSinceRefresh}`);

          // 4.4. Kiểm tra và thực hiện refresh nếu cần
          if (processCountSinceRefresh >= REFRESH_THRESHOLD) {
            console.log(`${logPrefix} Reached threshold (${REFRESH_THRESHOLD}). Refreshing tab ${targetTabId}...`);
            updateToPhone("message", `Đã xử lý ${processCountSinceRefresh} mã. Đang làm mới trang...`);
            await delay(1000); // Delay trước refresh

            const refreshedTab = await hardRefreshSpecificTab(targetTabId!); // Gọi refresh
            if (!refreshedTab) {
              console.error(`${logPrefix} Tab ${targetTabId} refresh failed/closed. Stopping loop.`);
              updateToPhone("message", `Lỗi: Không thể làm mới tab ${targetTabId}. Dừng xử lý.`);
              chrome.action.setBadgeText({ text: "REF_ERR" });
              chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
              shouldStopLoop = true; // Đặt cờ dừng
              continue; // Bỏ qua phần còn lại của lần lặp
            }

            console.log(`${logPrefix} Tab ${targetTabId} refreshed successfully. Resetting counter.`);
            updateToPhone("message", `Làm mới trang xong. Tiếp tục xử lý...`);
            processCountSinceRefresh = 0; // Reset biến đếm cục bộ
            targetTabId = refreshedTab.id; // Cập nhật lại tabId phòng trường hợp ID thay đổi (hiếm)

            await delay(1500); // Delay sau refresh
          }
        } else {
          // Lỗi từ content script
          const errorMsg = response?.error || (response ? 'Trạng thái không thành công' : 'Không có phản hồi');
          console.error(`${logPrefix} Failed to process item ${currentItem.MaBuuGui} via content script: ${errorMsg}`, response);
          updateToPhone("message", `Lỗi xử lý mã ${currentItem.MaBuuGui}: ${errorMsg}. Dừng lại.`);
          chrome.action.setBadgeText({ text: "CS_ERR" });
          chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
          shouldStopLoop = true; // Đặt cờ dừng
          continue; // Bỏ qua phần còn lại của lần lặp
        }

        await delay(500); // Delay nhỏ giữa các lần xử lý thành công

      } catch (loopError: any) {
        // Bắt lỗi trong lần lặp hiện tại (tìm tab, gửi message, refresh...)
        console.error(`${logPrefix} Error during loop iteration ${i} for item ${currentItem.MaBuuGui}:`, loopError);
        updateToPhone("message", `Lỗi nghiêm trọng khi xử lý ${currentItem.MaBuuGui}: ${loopError.message}. Dừng lại.`);
        chrome.action.setBadgeText({ text: "LOOP_ERR" });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
        shouldStopLoop = true; // Đặt cờ dừng
        continue; // Bỏ qua phần còn lại của lần lặp
      }
    } // Kết thúc vòng lặp for

    // 5. Hoàn tất (nếu không bị dừng bởi lỗi)
    if (!shouldStopLoop) {
      console.log(`${logPrefix} Finished processing list successfully.`);
      updateToPhone("message", `Đang chuẩn bị in. Chờ xíu`, keyMessage);
      //chuyển MaBuuGui thành mảng từ bgs
      var maHieus = bgs.map(m => m.MaBuuGui)
      printMaHieus(maHieus)
      updateToPhone("message", `In xong`, keyMessage);
      chrome.action.setBadgeText({ text: "OK" });
      chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
      await delay(2000);
      chrome.action.setBadgeText({ text: '' });
    } else {
      console.log(`${logPrefix} Processing loop stopped due to an error.`);
      // Badge lỗi đã được set ở nơi xảy ra lỗi
    }

  } catch (initialError: any) {
    // Bắt lỗi xảy ra *trước* vòng lặp (parse JSON, fetch Firebase)
    console.error(`${logPrefix} Initial error before starting loop:`, initialError);
    updateToPhone("message", `Lỗi khởi tạo xử lý theo lệnh: ${initialError.message}`);
    chrome.action.setBadgeText({ text: "INIT_ERR" });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } finally {
    // Đảm bảo badge được xóa nếu không phải OK và không có lỗi nào set badge
    const currentBadge = await chrome.action.getBadgeText({});
    if (currentBadge !== "OK" && !currentBadge.includes("ERR")) {
      chrome.action.setBadgeText({ text: '' });
    }
  }
}

const handleSendToPortal = async (doiTuong: any, isPrint = false): Promise<boolean> => {
  console.log("handleSendToPortal: Bắt đầu gửi...", doiTuong);
  let bgsFirebase: firebase.database.DataSnapshot;
  let bgs: BuuGuiProps[];
  let temp1: any;
  let s: number;
  let tabs: chrome.tabs.Tab[];
  let tabId: number;

  try {
    // Lấy dữ liệu từ Firebase
    bgsFirebase = await db.ref("PORTAL/BuuGuis/").get();
    const rawVal = bgsFirebase.val();
    if (!rawVal) {
      console.error("handleSendToPortal: Không lấy được dữ liệu BuuGuis từ Firebase.");
      updateToPhone("message", "Lỗi: Không có dữ liệu bưu gửi.", keyMessage);
      return false;
    }
    bgs = JSON.parse(rawVal);

    temp1 = JSON.parse(doiTuong);
    s = bgs?.findIndex((m) => m.MaBuuGui === temp1.maBG);

    if (s === -1) {
      console.warn("handleSendToPortal: Không tìm thấy bưu gửi:", temp1.maBG);
      updateToPhone("message", `Lỗi: Không tìm thấy bưu gửi ${temp1.maBG}.`, keyMessage);
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
      updateToPhone("message", "Lỗi: Không tìm thấy tab Portal đang mở.", keyMessage);
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
        (response) => { // Hàm callback này được gọi khi content script gọi sendResponse
          // *** ĐÁNH DẤU: Kiểm tra lỗi giao tiếp ***
          if (chrome.runtime.lastError) {
            console.error("handleSendToPortal: Lỗi khi gửi/nhận tin nhắn:", chrome.runtime.lastError.message);
            // Reject promise nếu có lỗi ở tầng Chrome API
            return reject(new Error(chrome.runtime.lastError.message || "Lỗi không xác định khi gửi tin nhắn"));
          }
          // Nếu không có lỗi ở tầng Chrome API, coi như content script đã nhận và xử lý
          console.log("handleSendToPortal: Phản hồi từ content script:", response);
          // *** ĐÁNH DẤU: Resolve promise khi nhận được phản hồi ***
          if (response) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
    if (!isAddOk) {
      console.error("handleSendToPortal: Lỗi content script.");
      updateToPhone("error", "Lỗi: từ content script.", keyMessage);
      return false; // Không có phản hồi thì dừng

    }
    // *** ĐÁNH DẤU: Code này chỉ chạy *sau khi* Promise được resolve ***
    console.log("handleSendToPortal: Content script đã xử lý xong lệnh ADD.");
    updateToPhone("message", `Đã gửi và xử lý xong ${temp1.maBG} trên Portal.`, keyMessage);
    if (isPrint) {
      updateToPhone("message", `Đang chuẩn bị in. Chờ xíu`, keyMessage);
      //chuyển MaBuuGui thành mảng từ bgs
      var maHieus = bgs.map(m => m.MaBuuGui)
      printMaHieus(maHieus)
      updateToPhone("message", `In xong`, keyMessage);
    }
    return true; // *** ĐÁNH DẤU: Trả về true báo hiệu thành công ***

  } catch (error: any) {
    // Bắt lỗi từ các await trước đó hoặc từ Promise bị reject
    console.error("handleSendToPortal: Lỗi trong quá trình gửi lệnh ADD:", error);
    updateToPhone("message", `Lỗi khi gửi lệnh ADD (${temp1?.maBG || '?'}): ${error.message}`, keyMessage);
    return false; // *** ĐÁNH DẤU: Trả về false báo hiệu thất bại ***
  }
};


async function dieuTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab("https://packnsend.vnpost.vn/tin/quan-ly-tin.html", "quan-ly-tin")
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + " "
  }
  if (activeTab != undefined)
    //wait 2s
    await delay(2000);

  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! }, func: (text) => {
      var textTr = document.querySelector("#txtTrackingCode") as HTMLInputElement;
      textTr.value = text

    }, args: [text]
  })
}


async function hoanTatTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab("https://packnsend.vnpost.vn/hoan-tat-tin.html", "hoan-tat-tin", true)
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + ","
  }
  if (activeTab != undefined)
    //send command
    await delay(2000)
  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! }, func: (text) => {
      //Điền danh sách mã hiệu chỗ tìm kiếm
      var textTr = document.querySelector("#txtLadingCode") as HTMLInputElement;
      textTr.value = text
      // Tạo và dispatch sự kiện change
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const now = new Date();
      const past = new Date();
      past.setDate(now.getDate() - 20); // trừ 20 ngày

      const todayStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      const pastStr = `${pad(past.getDate())}/${pad(past.getMonth() + 1)}/${past.getFullYear()}`;

      // Gán giá trị vào input
      const input = document.getElementById('txtDateRange');
      (input as HTMLInputElement).value = `${pastStr} - ${todayStr}`;

      // Trigger sự kiện nếu cần (nếu có event listener trên ô này)
      const event = new Event('change', { bubbles: true });
      if (input) {
        input.dispatchEvent(event);
      } else {
        console.error("Input element is null");
      }


      //thực hiện nhấn nút từ id btnSearch và chờ 2s
      const btnSearch = document.querySelector("#btnSearch") as HTMLButtonElement;
      if (btnSearch) {
        btnSearch.click();
      }
      //wait 2s
      setTimeout(() => {
        const event = document.createEvent('HTMLEvents');
        event.initEvent('change', true, false);
        //dispatch event change cho textTr
        textTr.dispatchEvent(event);

        //Chọn tất cả
        const selectElement = document.querySelector('select[name="tbl_order_ORD002_length"]');
        if (selectElement) {
          (selectElement as HTMLSelectElement).value = "-1";
          selectElement?.dispatchEvent(event);
        } else {
          console.error("selectElement is null");
        }

        //Đánh dấu chọn tất cả
        const checkall = document.querySelector('#chkAll') as HTMLInputElement;
        checkall.checked = true;

        checkall.dispatchEvent(event);
      }, 2000);


    }, args: [text]
  })

}
const prepareBlobs = async (maHieus: string[]) => {
  //đảo ngược maHieus
  maHieus = maHieus.reverse()
  //2	1	Bưu kiện - Parcel	1	593200	562310	29/12/2024	TB	2,0	CB593856255VN
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone("message", `Đang lưu ${index + 1}|${maHieus.length} MH ${element} `);
      chrome.action.setBadgeText({ text: (index + 1).toString() });
      var blob: Blob | null = null;
      if (blobsTemp.find(m => m.maHieu === element) != null) {
        blob = blobsTemp.find(m => m.maHieu === element)?.blob!
      } else
        blob = await getBlobMaHieu(element)

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({ maHieu: element, blob: blob, dateCreated: Date.now() })
      }
      else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        break;
      }
    } catch {
      break
    }
  }
}

const handlePrintPageSort = async (data: any) => {
  var res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token)

  var maHieus = (res as NguoiGuiDetailProp[])
    .map((m) => m.itemDetails.map((n) => n.ttNumber))
    .flat();
  //sap xep ma hieu
  maHieus.sort(customSort)
  await printMaHieus(maHieus)
}

const checkToken = async (): Promise<boolean> => {
  const res = await getMaHieusFromPortalId(["1034814510"], token);
  return res ? true : false;
};


function saveToken(token: string): void {
  chrome.storage.local.set({ token });
  console.log('Token saved:', token);
}
async function saveStorage(value: string): Promise<void> {
  await chrome.storage.local.set({ "blobs": value });
}
async function saveStorageExcel(value: string): Promise<void> {
  await chrome.storage.local.set({ "excel": value });
}

const handleGetMaHieus = async (data: any) => {
  const res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token);
  if (!res) return
  const maHieus = res
    .map((m) => m.itemDetails.map((n) => ({
      ID: m.id,
      Code: n.ttNumber,
      IDCODE: n.id,
      Weight: n.weight,
      Address: n.receiverAddress,
      Name: n.receiverName,
      Date: n.createdDate,
    })))
    .flat();
  return maHieus
};


const handleGetPortal = async (time: string = "") => {
  updateToPhone("message", " Đang lấy data từ Portal");
  handleGetDataFromPortal(time);
};
const handleGetDataFromPortal = async (time: string) => {
  try {
    let toDayText = formatDateRight(new Date());
    if (time != "") {
      toDayText = time;
      console.log(time)
    }
    const data: any = await getItemHdr(toDayText);
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
    await db.ref("PORTAL/MAINPAGE/").remove();

    // Ghi dữ liệu mới vào "PORTAL/MAINPAGE/"
    await db.ref("PORTAL/MAINPAGE/").set(newItems);

  } catch (error) {
    console.error("Error fetching data from portal:", error);
  }
};

const handleEditHangHoa = (data: any) => {
  createOrActiveTab(
    "https://portalkhl.vnpost.vn/itemhdr/?id=" + data.DoiTuong,
    "portalkhl.vnpost.vn",
    true
  );
};



const printMaHieus = async (maHieus: string[]) => {
  chrome.action.setBadgeText({ text: 'In...' });
  chrome.action.setBadgeBackgroundColor({ color: '#0000FF' });

  var blobs: Blob[] | null = await getBlobs(maHieus);
  console.log('1')
  if (blobs == null)
    return;
  var tab = await createOrActiveTab(
    "https://example.com/",
    "https://example.com/",

    false, false, true
  );
  var blob = await convertBlobsToBlob(blobs)
  var base64String = await pdfBlobTo64(blob);
  await saveStorage(base64String);
  //waiting 1 s
  await delay(1000);
  chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
  await chrome.tabs.sendMessage(tab!.id!, { message: "PRINTBLOB" });
}



const updateToPhone = async (
  lenh: String,
  doiTuong: String,
  key: string = keyMessage
) => {

  await db.ref(`PORTAL/CHILD/${key}/message/tophone`).set({
    Lenh: lenh,
    DoiTuong: doiTuong,
    TimeStamp: Date.now().toLocaleString(),
  }).catch((error: any) => {
    console.error('Error saving data:', error);
  });
}
const updateToPC = async (
  lenh: String,
  doiTuong: String,
  key: string = keyMessage
) => {

  await db.ref(`${keyMessage}/message/topc`).set({
    Lenh: lenh,
    DoiTuong: doiTuong,
    TimeStamp: Date.now().toLocaleString(),
  }).catch((error: any) => {
    console.error('Error saving data:', error);
  });
}

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
      updateToPhone("message", `In ${index + 1}|${maHieus.length} MH ${element} `);
      chrome.action.setBadgeText({ text: (index + 1).toString() });

      var blob: Blob | null = null;
      if (blobsTemp.find(m => m.maHieu === element) != null) {
        blob = blobsTemp.find(m => m.maHieu === element)?.blob!
      } else
        blob = await getBlobMaHieu(element)

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({ maHieu: element, blob: blob, dateCreated: Date.now() })
        blobs.push(blob!);
      }
      else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        return null;
      }
    } catch {
      break
    }
  }
  return blobs;
}
const getBlobMaHieu = async (maHieu: string): Promise<Blob | null> => {
  const res = await fetchPrintByMH(maHieu, token)
  const base64String = res[0]; // your base64 string
  return base64ToBlob(base64String, "application/pdf");
}


async function loadTodaysBlobs(): Promise<BlobStruct[]> {
  return new Promise<BlobStruct[]>((resolve, reject) => {
    const openRequest: IDBOpenDBRequest = indexedDB.open("MyDatabase", 1);

    // Nếu database chưa tồn tại hoặc cần nâng cấp phiên bản
    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("blobs")) {
        const objectStore = db.createObjectStore("blobs", { keyPath: "maHieu" });
        objectStore.createIndex("dateCreatedIndex", "dateCreated", { unique: false });
      }
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction("blobs", "readonly");
      const objectStore = transaction.objectStore("blobs");
      const dateIndex = objectStore.index("dateCreatedIndex");

      // Xác định khoảng thời gian cho ngày hôm nay
      const now = new Date();
      const startOfToday: number = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfTomorrow: number = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

      // Tạo IDBKeyRange từ đầu ngày hôm nay đến cuối ngày (startOfTomorrow - 1ms)
      const range = IDBKeyRange.bound(startOfToday, startOfTomorrow - 1);

      const blobsTemp: BlobStruct[] = [];
      const cursorRequest: IDBRequest = dateIndex.openCursor(range);

      cursorRequest.onsuccess = (event: Event) => {
        const cursor: IDBCursorWithValue | null = (event.target as IDBRequest).result;
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
    "packnsend.vnpost.vn"
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
    }
  );
};


const handleGetPNS = async (dayLast: any) => {
  updateToPhone("message", "Đã nhận lệnh lấy dữ liệu từ PNS");
  let khachHangsTemp = await handleGetDataFromPNS(dayLast);
  if (khachHangsTemp.length > 0) {
    //tổng hợp trạng thái khachHangsTemp[0]

    khachHangsTemp.forEach((m) => {
      m.countState.countChapNhan = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã chấp nhận"
      ).length;
      m.countState.countDangGom = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đang đi thu gom"
      ).length;
      m.countState.countNhanHang = m.BuuGuis.filter(
        (m) => m.TrangThai === "Nhận hàng thành công"
      ).length;
      m.countState.countPhanHuong = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã phân hướng"
      ).length;
    });
    await db.ref("PNS/KhachHangs").set(khachHangsTemp);
    await db.ref("PNS/TimeUpdate").set(new Date().toLocaleTimeString());
  } else {
    updateToPhone("message", "Chưa đăng nhập PNS");
    await khoitaoPNS();
  }
};
const tichHopCookieToString = (cookies: chrome.cookies.Cookie[]): string => {
  var text = "";
  cookies.forEach((m) => {
    text += m.name + "=" + m.value + "; ";
  });
  return text;
};

const getAllCookies = (url: string) => {
  return new Promise<string>((resolve, _reject) => {
    chrome.cookies.getAll({ domain: url }, (cookies) => {
      const texts: string = tichHopCookieToString(cookies);
      resolve(texts);
    });
  });
};
const getCookieFromWeb = async (url: string) => {
  const cookiesText = await getAllCookies(url);
  return cookiesText;
};

// --- HÀM MỚI: Đảm bảo đăng nhập Portal ---
/**
 * Kiểm tra xem tab có cần đăng nhập Portal không và thực hiện đăng nhập nếu cần.
 * @param tabId ID của tab cần kiểm tra và đăng nhập.
 * @returns Promise chứa đối tượng { success: boolean, loadedTab?: chrome.tabs.Tab }
 */
async function ensurePortalLogin(tabId: number): Promise<{ success: boolean; loadedTab?: chrome.tabs.Tab }> {
  let loadedTab: chrome.tabs.Tab | undefined;
  let originalUrl: string | undefined;
  let loginSuccess = false;

  try {
    // Lấy thông tin tab hiện tại và chờ tải xong
    loadedTab = await waitForTabToLoad(tabId);
    console.log(`ensurePortalLogin: Tab ${tabId} tải xong tại URL: ${loadedTab.url}`);

    if (loadedTab.url && loadedTab.url.includes('login')) {
      await delay(1000);
      console.log(`ensurePortalLogin: Tab ${tabId} đang ở trang login. Thực hiện đăng nhập...`);
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
        args: [accountPortal, passwordPortal]
      });
      console.log(`ensurePortalLogin: Đã tiêm script đăng nhập vào tab ${tabId}`);

      // Chờ tab tải xong sau khi đăng nhập
      console.log(`ensurePortalLogin: Đang chờ tab ${tabId} điều hướng/tải lại sau khi thử đăng nhập...`);
      loadedTab = await waitForTabLoadAfterAction(tabId, originalUrl, 6000); // Chờ tối đa 6s
      console.log(`ensurePortalLogin: Tab ${tabId} sau khi chờ đăng nhập. URL cuối: ${loadedTab?.url}`);

      // Kiểm tra lại xem đăng nhập thành công không
      if (loadedTab?.url?.includes('login')) {
        console.error(`ensurePortalLogin: Đăng nhập thất bại, vẫn ở trang login (${tabId}).`);
        updateToPhone("message", "Lỗi: Đăng nhập Portal thất bại.");
        loginSuccess = false;
      } else if (!loadedTab?.url) {
        console.error(`ensurePortalLogin: Không lấy được URL cuối cùng của tab ${tabId} sau khi chờ.`);
        updateToPhone("message", "Lỗi: Không xác định được trạng thái sau đăng nhập.");
        loginSuccess = false;
      } else {
        console.log(`ensurePortalLogin: Đăng nhập thành công (đã rời trang login) cho tab ${tabId}.`);
        loginSuccess = true;
      }
    } else {
      console.log(`ensurePortalLogin: Tab ${tabId} không ở trang login, giả sử đã đăng nhập.`);
      loginSuccess = true; // Giả sử đã đăng nhập nếu không thấy trang login
    }
  } catch (error: any) {
    console.error(`ensurePortalLogin: Lỗi trong quá trình kiểm tra/đăng nhập cho tab ${tabId}:`, error);
    updateToPhone("message", `Lỗi đăng nhập Portal: ${error.message}`);
    loginSuccess = false;
  }

  return { success: loginSuccess, loadedTab: loadedTab };
}
// --- KẾT THÚC HÀM MỚI ---

const khoiTaoPortal = async (data: any): Promise<boolean> => {
  try {
    console.log("Bắt đầu khởi tạo Portal...", data);
    let loginSuccess = false;
    let loadedTab: chrome.tabs.Tab | undefined = undefined;
    let originalUrl: string | undefined;
    var initialTab = await createOrActiveTab(
      "https://portalkhl.vnpost.vn/accept-api",
      "portalkhl.vnpost.vn",
      true
    );

    if (!initialTab || !initialTab.id) {
      console.error("Lỗi: Không thể mở hoặc kích hoạt tab Portal.");
      updateToPhone("message", "Lỗi: Không thể mở tab Portal.");
      return false;
    }
    const tabId = initialTab.id;

    console.log(`Tab ban đầu ${tabId}. URL: ${initialTab.url}`);

    // --- Sử dụng hàm ensurePortalLogin ---
    const loginResult = await ensurePortalLogin(tabId);
    loginSuccess = loginResult.success;
    loadedTab = loginResult.loadedTab; // Cập nhật loadedTab từ kết quả
    // --- Kết thúc sử dụng hàm ensurePortalLogin ---

    // --- Chỉ tiếp tục nếu đăng nhập thành công hoặc không cần đăng nhập ---
    if (loginSuccess && loadedTab?.id) {
      console.log(`khoiTaoPortal: Đăng nhập OK. Tiếp tục gửi lệnh KHOITAOPORTAL cho tab ${loadedTab.id}...`);
      updateToPhone("message", "Đang khởi tạo hợp đồng...");
      await delay(1000)

      const response = await chrome.tabs.sendMessage(loadedTab.id, {
        message: "KHOITAOPORTAL",
        ...data, // Đảm bảo 'data' chứa MaKH, Address, IsChooseHopDong, STTHopDong...
        keyMessage: keyMessage,
      });
      console.log("Phản hồi từ content script KHOITAOPORTAL:", response);
      // Xử lý phản hồi từ content script
      if (response && response.data === "ok") {
        updateToPhone("message", "Khởi tạo thành công.");
        return true; // *** ĐÁNH DẤU: Điểm thành công duy nhất ***
      } else {
        const errorMsg = (response && response.data) ? response.data : "Phản hồi không hợp lệ từ content script.";
        console.error("Lỗi từ content script KHOITAOPORTAL:", errorMsg);
        updateToPhone("message", `Lỗi khởi tạo: ${errorMsg}`);
        return false; // *** ĐÁNH DẤU: Điểm thất bại 3 (Phản hồi không đúng) ***
      }
    } else if (!loginSuccess) {
      console.log("Không tiếp tục vì đăng nhập thất bại hoặc không xác nhận được.");
      return false;
      // Tin nhắn lỗi đã được gửi ở trên nếu đăng nhập thất bại
    }

    // await createTab("https://google.com.vn");
  } catch (error: any) {
    console.error("Lỗi trong hàm khoiTaoPortal:", error);
    updateToPhone("message", `Lỗi nghiêm trọng: ${error.message || "Lỗi không xác định khi khởi tạo."}`);
    return false
    // Gửi trạng thái lỗi nghiêm trọng về điện thoại
  }
  console.warn("khoiTaoPortal chạy đến cuối mà không return tường minh.");
  return false;
};
const handleKhoiTao = async (data: any): Promise<boolean> => {
  updateToPhone("message", "Đã nhận lệnh khởi tạo");

  const temp = JSON.parse(data.DoiTuong);


  if (temp.account && temp.password) {
    accountPortal = temp.account;
    passwordPortal = temp.password;
  }

  const snapshot = await db.ref("PORTAL/HopDongs/" + temp.maKH).get();
  const hopDong = snapshot.val();
  return await khoiTaoPortal(hopDong);
};
const handleGetDataFromPNS = async (dayLast: any): Promise<KhachHangProps[]> => {
  // var cookie = await getCookieFromWeb("packnsend.vnpost.vn");
  const data = await getDataFromPNS(dayLast);
  if (data == null)
    return []
  const snapshots = changePNSObjectToSnapshots(data.Data);
  const khachHangs = changeSnapshotToKHs(snapshots);
  khachHangs.sort((a, b) => b.BuuGuis.length - a.BuuGuis.length);
  return khachHangs
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
const changeSnapshotToKHs = (snapshots: DataSnapshotProps[]): KhachHangProps[] => {
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
      Money: null, // Hoặc giá trị mặc định phù hợp khác
      ListDo: null, // Hoặc giá trị mặc định phù hợp khác
      TrangThaiRequest: null // Hoặc giá trị mặc định phù hợp khác,
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

  const bgsFirebase = await ref.child("PORTAL/BuuGuis/").get();
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
const sendMessageToTab = async (tabId: any, bgs: any, currentBuuGui: any, maKH: any, keyMessage: any) => {
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
        console.error("Error sending message to tab:", chrome.runtime.lastError);
      } else {
        console.log("Response from content script:", response);
      }
    }
  );
};

const handlePrintPage = async (data: any) => {
  var listJsonItem = await getMaHieusFromPortalId(JSON.parse(data), token);

  var res = await fetch("https://api-portalkhl.vnpost.vn/khl2024/khl/jasper/JasperVD", {
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
  })
  var data = await res.json()
  var tab = await createOrActiveTab(
    "https://example.com/",
    "https://example.com/",
    false, false, true
  );
  const base64String = data[0]; // your base64 string
  await saveStorage(base64String);

  //waiting 1 s
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await chrome.tabs.sendMessage(tab!.id!, { message: "PRINTBLOB" });

};



const API_BASE_URL = "https://api-portalkhl.vnpost.vn";
const PNS_BASE_URL = "https://packnsend.vnpost.vn";
const fetchPrintByMH = async (maHieu: string, token: string): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}/khl2024/khl/jasper/printByTTNumber`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=UTF-8",
      authorization: `Bearer ${token}`,
      capikey: "19001235"
    },
    body: JSON.stringify({ ttNumber: maHieu, listReport: ["BD1New"], lienNumbers: ["1"], hiddenPrice: false })
  });
  return res.json();
};

const getMaHieusFromPortalId = async (ids: any, token: string): Promise<NguoiGuiDetailProp[] | null> => {
  console.log('IDS ', ids)

  const res = await Promise.all(
    ids.map((id: string) =>
      fetch(`${API_BASE_URL}/khl/portalItem/getItemHdr`, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9,vi;q=0.8",
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
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
      }).then((res) => res.json())
    )
  );
  if (res[0].status === 401 || res[0].status === 400) return null;
  return res as NguoiGuiDetailProp[];
};
const getItemHdr = async (toDayText: string): Promise<NguoiGuiProp[]> => {
  const res = await fetch(`${API_BASE_URL}/khl/getItemHdr`, {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      authorization: `Bearer ${token}`,
      capikey: "19001235",
      "content-type": "application/json; charset=UTF-8",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    },
    referrer: "https://portalkhl.vnpost.vn/",
    referrerPolicy: "strict-origin-when-cross-origin",
    body: `{"orgCode":"${buuCuc}","tuNgay":"${toDayText}","denNgay":"${toDayText}","sourceSystem":"KHL","origin":""}`,
    method: "POST",
    mode: "cors",
    credentials: "include",
  });
  return res.json();
};

const getDataFromPNS = async (dayLast: string): Promise<any> => {
  const res = await fetch(`${PNS_BASE_URL}/Order/Home/ExportExcellOrderManage`, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest",
      cookie: "_ga=GA1.1.1252308094.1682309904; tctbdvn-_zldp=yr040hnCEdI2kxlbdwBeQuILj7FFHTSRALXKDo17bUf5oxEi8nvo1%2FHkNiXB4tD3VVj9liGvi%2BU%3D; _ga_PX3P5JLJ7K=GS1.1.1692945085.4.0.1692945085.0.0.0; _ga_TDJH6SEKEF=GS1.1.1703234131.4.1.1703234170.0.0.0; __SRVNAME=pns7; ASP.NET_SessionId=1tl4k4fo4bu5vhqwn53coee3; .ASPXAUTH=9E1633939FA3B00F904E422CCCB86B402F1B1A92F702B251189551D02FEB874EC894F1B04112D0BC9C69BFF93094451F2651D82616FEB484B469B41DDF924CC365801E490B1E3C2D21E993FBAB7EDCCB4716418487A4F9F4D87BC8C3F2A1F8175F2B8048EFC2B4FFABF23E7F62887AB9; panelIdCookie=userid=593280_xonld",
      Referer: "https://packnsend.vnpost.vn/tin/quan-ly-tin.html?startDate=11%2F02%2F2024&endDate=11%2F02%2F2024",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: `Id=0&FromDate=${toDateString(dayLast)}+&ToDate=+${toDateString(0)}&Code=&CustomerCode=&Status=&ContactPhone=&TrackingCode=&Page=0&Channel=&senderDistrictId=0&senderWardId=0&flagConfig=&orderNumber=&serviceCodeMPITS=`,
    method: "POST",
  });
  let data: any = null;
  try {

    data = await res.json()
  } catch {
    data = null

  }
  return data;
};
const loginDirect = async (account: string, password: string): Promise<string | null> => {
  const res = await fetch(`${API_BASE_URL}/api/auth/signinKhl`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=UTF-8",
      capikey: "19001235"
    },
    body: JSON.stringify({ username: account, password: password, ip: "", random: Math.random() })
  });
  const data = await res.json();
  return data.tokenFe || null;
};

function sendPong() {
  db.ref(`PORTAL/STATUS/${keyMessage}`).set({ timestamp: Date.now(), online: true });
}

function handleSaveAccount(accountPortal: string, passwordPortal: string): void {
  if (!accountPortal || !passwordPortal || !buuCuc) {
    alert("Tài khoản hoặc mật khẩu và bưu cục không được để trống");
    return;
  }
  chrome.storage.local.set({ accountPortal: accountPortal, passwordPortal: passwordPortal }, () => {
    console.log("Saved account and password");
  });
}



async function openAndExportExcel(res: any, request: any = null, ishcc: boolean = false) {
  let itemDetails = res[0].itemDetails;
  let fileName = '/temp.xlsx';
  console.log(ishcc)
  if (ishcc) {
    fileName = '/temphcc.xlsx';
  }

  // Read and modify temp.xlsx
  fetch(chrome.runtime.getURL(fileName)).then(async (response) => {

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    let indexStart = 4;
    for (let index = 0; index < itemDetails.length; index++) {
      const element = itemDetails[index];
      if (!ishcc) {
        worksheet[`A${indexStart + index}`] = { v: element.serviceCode };
        worksheet[`D${indexStart + index}`] = { v: '2-Bộ' };
        worksheet[`E${indexStart + index}`] = { v: element.ttNumber };

        worksheet[`H${indexStart + index}`] = { v: element.receiverName };
        worksheet[`I${indexStart + index}`] = { v: element.receiverPhone };
        worksheet[`M${indexStart + index}`] = { v: element.receiverAddress };
        worksheet[`S${indexStart + index}`] = { v: element.weight };
        worksheet[`Z${indexStart + index}`] = { v: element.serviceGtgt };
        worksheet[`AB${indexStart + index}`] = { v: element.codAmount };
        worksheet[`AK${indexStart + index}`] = { v: '1-Chuyển hoàn ngay' };
        worksheet[`AL${indexStart + index}`] = { v: '3-Chuyển hoàn về bưu cục gốc' };
        worksheet[`BQ${indexStart + index}`] = { v: request };
      } else {
        worksheet[`A${indexStart + index}`] = { v: element.serviceCode };
        worksheet[`B${indexStart + index}`] = { v: element.procedureId };
        worksheet[`C${indexStart + index}`] = { v: element.procedureCategoryId };
        worksheet[`D${indexStart + index}`] = { v: element.procedureType == "1" ? '1-Tiếp nhận' : '2-Chuyển trả' };
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
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    // Điều chỉnh số hàng cuối cùng nếu cần
    range.e.r = Math.max(range.e.r, indexStart + itemDetails.length - 1);
    worksheet['!ref'] = XLSX.utils.encode_range(range);

    // Ghi workbook mới ra một ArrayBuffer
    const newWorkbookArrayBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    });
    // // Convert the array buffer to a base64 string
    const base64 = btoa(String.fromCharCode(...new Uint8Array(newWorkbookArrayBuffer)));
    await saveStorageExcel(base64);
    var tab = await createOrActiveTab(
      "https://example.com/",
      "https://example.com/",

      false, false, true
    );
    // Read the base64 string back into a workbook
    //  const workbookFromBase64 = XLSX.read(base64, { type: 'base64' });
    //  const sheet = workbookFromBase64.Sheets[workbookFromBase64.SheetNames[0]];
    //waiting 1 s
    await delay(1000);
    //add ten with name and date
    const currentDate = new Date();
    const formattedDate = `${currentDate.getDate()}-${currentDate.getMonth() + 1}-${currentDate.getFullYear()}`;

    await chrome.tabs.sendMessage(tab!.id!, { message: "EXPORTEXCEL", ten: `${res[0].customerName}_${formattedDate}` });
  });
}

async function handleAddPNS(dayLast: any) {
  updateToPhone("message", "Đã nhận lệnh lấy dữ liệu từ PNS");
  let khachHangsTemp = await handleGetDataFromPNS(dayLast);
  if (khachHangsTemp.length > 0) {
    console.log(khachHangsTemp)

    //get khachHangs from firebase
    const responsef: any = await db.ref("PNS/KhachHangs").get();
    var khachHangsFirebase: KhachHangProps[] = responsef.val();
    //insert khachHangsFirebase to khachHangsTemp
    khachHangsTemp.forEach((m) => {
      const index = khachHangsFirebase.findIndex((n: any) => n.MaKH === m.MaKH);
      if (index === -1) {
        khachHangsFirebase.push(m);
      } else {
        khachHangsFirebase[index].BuuGuis = khachHangsFirebase[index].BuuGuis.concat(m.BuuGuis);
      }
    });
    khachHangsFirebase.forEach((m) => {
      m.countState.countChapNhan = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đã chấp nhận"
      ).length;
      m.countState.countDangGom = m.BuuGuis.filter(
        (m) => m.TrangThai === "Đang đi thu gom"
      ).length;
      m.countState.countNhanHang = m.BuuGuis.filter(
        (m) => m.TrangThai === "Nhận hàng thành công"
      ).length;
      m.countState.countPhanHuong = m.BuuGuis.filter(
        (m) => (m.TrangThai === "Đã phân hướng")
      ).length;
    });
    await db.ref("PNS/KhachHangs").set(khachHangsFirebase);
    await db.ref("PNS/TimeUpdate").set(new Date().toLocaleTimeString());
  } else {
    updateToPhone("message", "Chưa đăng nhập PNS");
    await khoitaoPNS();
  }
}
async function handleXoaBuuGui(id: String): Promise<void | PromiseLike<void>> {
  console.log(id)

  var res = await fetch("https://api-portalkhl.vnpost.vn/khl/portalItem/deleteItemDetail", {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "authorization": `Bearer  ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "Referer": "https://portalkhl.vnpost.vn/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": `[\"${id}\"]`,
    "method": "POST"
  });


  res.status === 200 ? updateToPhone("message", "Xóa thành công") : updateToPhone("message", "Xóa thất bại")
  console.log("Đã xóa thành công", await res.json())
}

function handleSaveKHOption(data: any): void | PromiseLike<void> {
  var temp1 = JSON.parse(data.DoiTuong);
  console.log(temp1)
  //save chrome local b
  chrome.storage.local.set({ currentMaKH: temp1.maKH, currentOptions: temp1.options }, function () {
  })
  if (temp1.account && temp1.password) {
    accountPortal = temp1.account;
    passwordPortal = temp1.password;
  }
}
const handleEditKL = async (data: any): Promise<void> => {
  //https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=1041187714&id=JEeKLN4s00nnt4kqNwWKWfvINfD
  var temp1 = JSON.parse(data.DoiTuong);
  let loginSuccess = false;
  let originalUrl: string | undefined;
  let loadedTab: chrome.tabs.Tab | undefined = undefined;
  var initialTab = await createOrActiveTab(
    "https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=" + temp1.ID + "&id=" + temp1.IDCODE,
    "portalkhl.vnpost.vn",
    true
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
  if (loginSuccess && loadedTab && !loadedTab.url?.includes('accept-api-dtl')) {
      console.log("handleEditKL: Đăng nhập thành công, mở lại đúng URL chỉnh sửa KL...");
      await createOrActiveTab(
          "https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=" + temp1.ID + "&id=" + temp1.IDCODE,
          "portalkhl.vnpost.vn",
          true // Kích hoạt tab này
      );
      // Chờ tab mới tải xong (hoặc tab cũ điều hướng xong)
      loadedTab = await waitForTabToLoad(loadedTab.id!); // Chờ trên cùng tabId
      console.log(`handleEditKL: Tab ${loadedTab?.id} đã ở đúng URL chỉnh sửa KL: ${loadedTab?.url}`);
      await delay(1500); // Chờ thêm chút cho ổn định
  }
  // --- Kết thúc sử dụng hàm ensurePortalLogin ---


  // --- Chỉ tiếp tục nếu đăng nhập thành công hoặc không cần đăng nhập ---
  if (loginSuccess && loadedTab?.id) {
    console.log(`handleEditKL: Đăng nhập OK. Gửi lệnh CHANGEKL cho tab ${loadedTab.id}...`);
    chrome.tabs.sendMessage(loadedTab.id, { // Sử dụng loadedTab.id đã được cập nhật
      message: "CHANGEKL", // Lệnh mới
      kl: temp1.Weight,
      keyMessage: keyMessage,
    }, async (response) => {

      // Kiểm tra lỗi runtime trước
      if (chrome.runtime.lastError) {
        console.error(`handleEditKL: Lỗi gửi/nhận CHANGEKL: ${chrome.runtime.lastError.message}`);
        return;
      }
      console.log("handleEditKL: Phản hồi từ CHANGEKL:", response);
      // Xử lý phản hồi nếu cần
      if (response && response.status === 'success') {
          updateToPhone("message", `Đã cập nhật KL cho ${temp1.IDCODE}`);
          // Có thể đóng tab sau khi thành công nếu muốn
          // await chrome.tabs.remove(loadedTab.id!);
      } else {
          updateToPhone("message", `Lỗi cập nhật KL cho ${temp1.IDCODE}: ${response?.error || 'Không rõ'}`);
      }

    });
  } else if (!loginSuccess) {
    console.log("handleEditKL: Không tiếp tục vì đăng nhập thất bại hoặc không xác nhận được.");
    // Tin nhắn lỗi đã được gửi trong ensurePortalLogin
  }
  // Hàm này không cần trả về boolean nữa vì nó xử lý hoàn toàn bên trong
}
