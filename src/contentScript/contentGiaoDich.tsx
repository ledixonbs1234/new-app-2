/**
 * Content Script cho trang "Giao Dịch" - https://portalkhl.vnpost.vn/itemdetail/?hdrId=*
 * Chức năng: Tự động điền địa chỉ người nhận với gợi ý thông minh
 * 
 * Tránh conflict: Script này sẽ kiểm tra xem processSinglePortalItem đang chạy không
 * Nếu đang chạy, script này sẽ tạm dừng hoạt động
 */

import { delay } from "./utils";

// ==========================================================================
// Biến Toàn cục và Cấu hình
// ==========================================================================

let addressData: any[] = []; // Lưu trữ dữ liệu địa chỉ chính
let isSaveKhoiLuong = "";
let IsChooseSusget = false;
let PhoneNumber = "";
let Address = "";
let isProcessingPortalItem = false; // Cờ để kiểm tra processSinglePortalItem đang chạy
let isScriptActive = false; // Trạng thái script có đang hoạt động không
let domObserver: MutationObserver | null = null; // Observer cho DOM changes
let lastParcelIndexValue = -1; // Theo dõi giá trị parcelIndex để phát hiện khi tăng

// ID của các element thường dùng
const ELEMENT_IDS = {
  RECEIVER_ADDRESS: "receiverAddress",
  RECEIVER_NAME: "receiverName",
  RECEIVER_PHONE: "receiverPhone",
  WEIGHT: "weight",
  TT_NUMBER: "ttNumber",
  MONEY: "PROP0018",
  EXAMPLE_LIST: "exampleList",
  POPUP_VAS_OK_BUTTON_SELECTOR: "#popup-vas > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)",
  SAVE_AND_ADD_BUTTON_SELECTOR: "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button",
  SERVICE_INPUT_XPATH: "//*[@id='content']/div/div/div[2]/form/div[3]/div/div/div[9]/div[2]/div/div[1]/div[2]/div[1]/div/div[1]/div/input",
  GHOST_INPUT: "ghost-input-giao-tich", // ID riêng để tránh conflict
};

// Keys sử dụng trong chrome.storage.local và localStorage
const STORAGE_KEYS = {
  KHOI_LUONG: "khoiluong",
  IS_UPERCASE: "isUperCase",
  IS_FULL_TEXT_ADDRESS: "isfulltextaddress",
  PROCESSING_FLAG: "processingPortalItem", // Cờ để kiểm tra xem contentScript có đang xử lý không
};

// Field groups cho smart zoom
type FieldGroup = "TT_NUMBER" | "RECEIVER_INFO" | "WEIGHT" | "MONEY" | "NONE";

const FIELD_GROUPS: Record<string, FieldGroup> = {
  [ELEMENT_IDS.TT_NUMBER]: "TT_NUMBER",
  [ELEMENT_IDS.RECEIVER_NAME]: "RECEIVER_INFO",
  [ELEMENT_IDS.RECEIVER_PHONE]: "RECEIVER_INFO",
  [ELEMENT_IDS.RECEIVER_ADDRESS]: "RECEIVER_INFO",
  [ELEMENT_IDS.WEIGHT]: "WEIGHT",
  [ELEMENT_IDS.MONEY]: "MONEY",
};

// Key codes
const KEY_CODES = {
  TAB: 9,
  ENTER: 13,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  ESC: 27,
  ARROW_UP: 38,
  ARROW_DOWN: 40,
  F1: 112,
  F2: 113,
  F4: 115,
};
const STORAGE_KEY_PANEL_WIDTH = 'vnpost_sidepanel_saved_width'; // Key để lưu độ rộng
let isTabed = false;
let currentSuggestion: string | null = null;

// ==========================================================================
// Hàm Tiện ích (Utility Functions)
// ==========================================================================

function isEmpty(str: any): boolean {
  return !str || str.length === 0;
}


function removeAccents(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function getElementByXpath(path: string): Node | null {
  try {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  } catch (error) {
    console.error("[GiaoTich] Lỗi khi tìm element bằng XPath:", path, error);
    return null;
  }
}

function waitForElmGiaoTich(selector: string, timeout: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element as HTMLElement);
    }

    const startTime = Date.now();
    const observer = new MutationObserver(() => {
      const targetElement = document.querySelector(selector);
      if (targetElement) {
        resolve(targetElement as HTMLElement);
        observer.disconnect();
      }
      if (Date.now() - startTime > timeout) {
        resolve(null);
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function debounce(func: Function, delay: number): (...args: any[]) => void {
  let timer: NodeJS.Timeout;
  return function (this: any, ...args: any[]) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// ==========================================================================
// Kiểm tra xem processSinglePortalItem có đang chạy không
// ==========================================================================

/**
 * Kiểm tra xem content script chính (processSinglePortalItem) có đang xử lý không
 * Nếu đang xử lý, script này sẽ tạm dừng
 */
function checkIfProcessingActive(): boolean {
  // Kiểm tra từ chrome storage hoặc biến global
  return isProcessingPortalItem;
}
/**
 * Kiểm tra xem Side Panel có đang mở không bằng cách check DOM trực tiếp
 * Thay vì đợi message sync state
 */
function isSidePanelOpen(): boolean {
  return !!document.getElementById(SIDE_PANEL_ID);
}

function notifySidePanelZoom(fieldGroup: FieldGroup): void {
  const isOpen = isSidePanelOpen();

  console.log("[GiaoTich] 📤 notifySidePanelZoom called:", {
    fieldGroup,
    isSidePanelOpen: isOpen
  });

  if (fieldGroup === "NONE" || !isOpen) {
    console.log("[GiaoTich] ❌ Not sending - fieldGroup is NONE or panel closed");
    return;
  }
// 1. Kiểm tra DOM xem panel có mở không
  const container = document.getElementById(SIDE_PANEL_ID);
  const iframe = container?.querySelector('iframe') as HTMLIFrameElement;

  if (!container || !iframe) {
    console.log("[GiaoTich] ❌ Not sending - panel closed");
    return;
  }
  

  console.log("[GiaoTich] 📤 notifySidePanelZoom via postMessage:", fieldGroup);

  const message = {
    type: "APPLY_SMART_ZOOM",
    payload: { fieldGroup }
  };

  // 2. Gửi bằng postMessage trực tiếp vào Iframe
  // targetOrigin là URL của extension để bảo mật
  const extensionOrigin = chrome.runtime.getURL(""); // vd: chrome-extension://abcdef.../
  
  // Gửi tin nhắn
  iframe.contentWindow?.postMessage(message,extensionOrigin);
}
/**
 * Gửi message đến side panel để chuyển sang ảnh tiếp theo
 */
function requestNextImage(): void {
  if (!isSidePanelOpen()) {
    console.log("[GiaoTich] Side panel not open, skip next image request");
    return;
  }

  console.log("[GiaoTich] 🖼️ Requesting side panel to show next image");
  chrome.runtime.sendMessage({ type: "SIDEPANEL_NEXT_IMAGE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("[GiaoTich] Error requesting next image:", chrome.runtime.lastError.message);
    } else {
      console.log("[GiaoTich] Next image request sent successfully");
    }
  });
}

/**
 * Monitor parcelIndex input để tự động chuyển ảnh khi hoàn thành đơn
 */
function monitorParcelIndex(): void {
  const parcelIndexInput = document.querySelector('input[name="parcelIndex"]') as HTMLInputElement;

  if (!parcelIndexInput) {
    console.log("[GiaoTich] parcelIndex input not found, will retry...");
    return;
  }

  console.log("[GiaoTich] 👀 Started monitoring parcelIndex input");

  // Lấy giá trị ban đầu
  const initialValue = parseInt(parcelIndexInput.value) || 0;
  lastParcelIndexValue = initialValue;
  console.log(`[GiaoTich] Initial parcelIndex value: ${lastParcelIndexValue}`);

  // Observer để theo dõi thay đổi value
  const observer = new MutationObserver(() => {
    const currentValue = parseInt(parcelIndexInput.value) || 0;

    if (currentValue > lastParcelIndexValue) {
      console.log(`[GiaoTich] 📈 parcelIndex increased: ${lastParcelIndexValue} → ${currentValue}`);
      lastParcelIndexValue = currentValue;

      // Đợi một chút để đảm bảo form đã lưu xong
      setTimeout(() => {
        requestNextImage();
      }, 300);
    } else if (currentValue !== lastParcelIndexValue) {
      // Giá trị thay đổi nhưng không tăng (có thể reset hoặc giảm)
      console.log(`[GiaoTich] parcelIndex changed: ${lastParcelIndexValue} → ${currentValue}`);
      lastParcelIndexValue = currentValue;
    }
  });

  // Observe attributes thay đổi
  observer.observe(parcelIndexInput, {
    attributes: true,
    attributeFilter: ['value']
  });

  // Cũng listen cho input event (React controlled inputs)
  parcelIndexInput.addEventListener('input', () => {
    const currentValue = parseInt(parcelIndexInput.value) || 0;

    if (currentValue > lastParcelIndexValue) {
      console.log(`[GiaoTich] 📈 parcelIndex increased (input event): ${lastParcelIndexValue} → ${currentValue}`);
      lastParcelIndexValue = currentValue;

      setTimeout(() => {
        requestNextImage();
      }, 300);
    } else if (currentValue !== lastParcelIndexValue) {
      lastParcelIndexValue = currentValue;
    }
  });

  // Store observer để cleanup sau
  (window as any)._parcelIndexObserver = observer;
}

/**
 * Điền mã hiệu vào ttNumber field
 */
function fillTtNumber(maHieu: string): void {
  if (!maHieu) return;

  const ttNumberInput = document.getElementById(ELEMENT_IDS.TT_NUMBER) as HTMLInputElement;
  if (!ttNumberInput) {
    console.warn("[GiaoTich] ttNumber input not found");
    return;
  }

  // Set value
  ttNumberInput.value = maHieu;

  // Trigger React events to ensure the value is recognized
  ttNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
  ttNumberInput.dispatchEvent(new Event('change', { bubbles: true }));
  ttNumberInput.dispatchEvent(new Event('blur'));

  console.log(`[GiaoTich] Filled ttNumber with: ${maHieu}`);
  const recei = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
  if (recei) {
    recei.value = "";
    recei.focus();
  }

}

/**
 * Attach focus listener cho một input field để trigger smart zoom
 */
function attachSmartZoomListener(input: HTMLElement, fieldId: string): void {
  // Prevent attaching multiple listeners
  if ((input as any)._smartZoomAttached) return;

  const fieldGroup = FIELD_GROUPS[fieldId] || "NONE";
  if (fieldGroup === "NONE") return;

  input.addEventListener("focus", () => {
    console.log(`[GiaoTich] Focus vào ${fieldId}, trigger zoom: ${fieldGroup}`);
    notifySidePanelZoom(fieldGroup);
  });
  (input as any)._smartZoomAttached = true;
}

function monitorProcessingStatus(): void {
  // Lắng nghe tin nhắn từ contentScript.tsx để cập nhật trạng thái
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.event === "CONTENT" && msg.message === "PROCESS_STATUS") {
      isProcessingPortalItem = msg.isProcessing;
      console.log("[GiaoTich] Processing status updated:", isProcessingPortalItem);
    }


    if (msg.action === "TOGGLE_SIDE_PANEL") {
      toggleSidePanel();
    }

    // Lắng nghe yêu cầu điền ttNumber từ side panel
    if (msg.type === "FILL_TT_NUMBER" && msg.payload?.maHieu) {
      fillTtNumber(msg.payload.maHieu);
    }
    // Lắng nghe yêu cầu query focused element trên portal
    if (msg.type === "QUERY_FOCUSED_ELEMENT") {
      try {
        const activeElement = document.activeElement as HTMLElement | null;
        const id = activeElement?.id || null;
        sendResponse({ activeElementId: id });
      } catch (err) {
        console.log('[GiaoTich] QUERY_FOCUSED_ELEMENT error', err);
        sendResponse({ activeElementId: null });
      }
      // synchronous response
      return false;
    }
    // Lắng nghe yêu cầu focus ttNumber từ side panel
    if (msg.type === "FOCUS_TT_NUMBER") {
      const ttNumberInput = document.getElementById(ELEMENT_IDS.TT_NUMBER) as HTMLInputElement;
      if (ttNumberInput) {
        //bỏ focus các input khác
        ttNumberInput.blur();
        ttNumberInput.focus();
        console.log("[GiaoTich] [FOCUS_TT_NUMBER] Focused ttNumber input");
      } else {
        console.log("[GiaoTich] [FOCUS_TT_NUMBER] ttNumber input not found");
      }
    }
  });
}
// Biến global để lưu trạng thái style (tránh tạo lại nhiều lần)
const SIDE_PANEL_ID = 'inpage-sidepanel-container';
const STYLE_FIX_ID = 'split-screen-style-fix';
const SIDE_PANEL_WIDTH = 360;
// Định nghĩa interface mở rộng cho Window để lưu trạng thái Observer (nếu cần dùng Global)
declare global {
  interface Window {
    _layoutObserver?: MutationObserver;
  }
}
/**
 * Hàm chính để Bật/Tắt Sidepanel
 */
function toggleSidePanel(): void {
  // 1. Kiểm tra xem Panel đã tồn tại chưa
  const existingContainer = document.getElementById(SIDE_PANEL_ID) as HTMLDivElement | null;
  const existingStyle = document.getElementById(STYLE_FIX_ID) as HTMLStyleElement | null;

  // 2. NẾU ĐÃ CÓ -> TẮT (Xóa DOM, xóa Style, ngắt Observer)
  if (existingContainer) {
    existingContainer.remove();
    if (existingStyle) existingStyle.remove();

    // Ngắt theo dõi layout khi đóng panel để tiết kiệm tài nguyên
    if (window._layoutObserver) {
      window._layoutObserver.disconnect();
      delete window._layoutObserver;
    }
    return;
  }

  // 3. NẾU CHƯA CÓ -> BẬT
  injectCssFix();
  const container = createSidePanelContainer();
  document.body.appendChild(container);

  // Khởi động Observer để đồng bộ menu React
  initMenuObserver();
}

/**
 * Inject CSS để sửa lỗi layout React (calc 100vw) và chia cột Flexbox
 */
function injectCssFix(): void {
  const style = document.createElement('style');
  style.id = STYLE_FIX_ID;
  style.innerHTML = `
      body {
          display: flex !important;
          flex-direction: row !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
      }
      #root {
          flex: 1 1 auto !important;
          height: 100% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          position: relative !important;
          z-index: 1 !important;
          min-width: 0 !important;
      }
      /* Grid layout fix: Cột 1 theo biến, Cột 2 tự giãn (1fr) */
      .layout {
          grid-template-columns: var(--menu-width, 360px) 1fr !important;
          width: 100% !important;
          min-height: 100vh !important;
      }
      /* Fix Modal hiển thị đè lên toàn bộ vùng nhìn thấy */
      .modal-upd, .swal-overlay {
          width: 100% !important; 
          position: fixed !important;
      }
  `;
  document.head.appendChild(style);
}

/**
 * Tạo cấu trúc DOM cho Sidepanel
 */
function createSidePanelContainer(): HTMLDivElement {
  const extensionUrl = chrome.runtime.getURL('sidepanel.html');
  // Lấy độ rộng đã lưu, nếu không có thì dùng mặc định 360
  const savedWidth = localStorage.getItem(STORAGE_KEY_PANEL_WIDTH);
  const initialWidth = savedWidth ? parseInt(savedWidth, 10) : SIDE_PANEL_WIDTH;
  // --- Container ---
  const container = document.createElement('div');
  container.id = SIDE_PANEL_ID;
  Object.assign(container.style, {
    width: `${initialWidth}px`,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderLeft: '1px solid rgba(0,0,0,0.1)',
    zIndex: '2147483647',
    flex: '0 0 auto',
    position: 'relative',
    boxShadow: '-2px 0 5px rgba(0,0,0,0.05)',
  } as CSSStyleDeclaration);

  // --- Header ---
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '36px',
    background: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: '0',
  } as CSSStyleDeclaration);

  // --- Close Button ---
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 12px',
    height: '100%',
    color: '#555',
  } as CSSStyleDeclaration);

  // Sự kiện đóng: Gọi lại toggleSidePanel để hủy
  closeBtn.addEventListener('click', () => toggleSidePanel());

  header.appendChild(closeBtn);
  container.appendChild(header);

  // --- Iframe ---
  const iframe = document.createElement('iframe');
  iframe.src = extensionUrl;
  Object.assign(iframe.style, {
    border: 'none',
    width: '100%',
    flex: '1',
    height: '100%',
  } as CSSStyleDeclaration);
  container.appendChild(iframe);

  // --- Resizer (Thanh kéo) ---
  const resizer = document.createElement('div');
  Object.assign(resizer.style, {
    position: 'absolute',
    left: '-5px',
    top: '0',
    bottom: '0',
    width: '10px',
    cursor: 'ew-resize',
    zIndex: '2147483648',
    backgroundColor: 'transparent',
  } as CSSStyleDeclaration);

  // Gán sự kiện resize
  setupResizer(resizer, container, iframe);

  container.appendChild(resizer);

  return container;
}

/**
 * Xử lý logic kéo thả (Resize)
 */
function setupResizer(
  resizer: HTMLDivElement,
  container: HTMLDivElement,
  iframe: HTMLIFrameElement
): void {
  let isResizing = false;

  const onMove = (ev: PointerEvent) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - ev.clientX;
    const maxWidth = window.innerWidth * 0.7;

    // Giới hạn min 300px, max 70% màn hình
    if (newWidth > 300 && newWidth < maxWidth) {
      container.style.width = `${newWidth}px`;
    }
  };

  const stopResize = () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', stopResize);

    // Bật lại tương tác chuột cho iframe
    iframe.style.pointerEvents = 'auto';

    const currentWidth = parseInt(container.style.width, 10);
    if (!isNaN(currentWidth)) {
      localStorage.setItem(STORAGE_KEY_PANEL_WIDTH, currentWidth.toString());
      console.log(`[GiaoTich] Saved sidepanel width: ${currentWidth}px`);
    }
  };

  const startResize = (ev: PointerEvent) => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';

    // Tắt tương tác chuột iframe để kéo mượt hơn
    iframe.style.pointerEvents = 'none';

    ev.preventDefault();
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', stopResize);
  };

  resizer.addEventListener('pointerdown', startResize);
}

/**
 * Theo dõi thay đổi của class .layout để cập nhật biến CSS --menu-width
 */
function initMenuObserver(): void {
  // Nếu đã có observer đang chạy thì thôi
  if (window._layoutObserver) return;

  const checkLayoutExist = setInterval(() => {
    const layoutNode = document.querySelector('.layout') as HTMLElement | null;

    if (layoutNode) {
      clearInterval(checkLayoutExist);

      // Hàm helper để đọc style từ DOM và set biến CSS
      const syncMenuWidth = () => {
        const currentStyle = layoutNode.getAttribute('style');
        // Regex tìm: grid-template-columns: [GIÁ TRỊ] ...
        const match = currentStyle && currentStyle.match(/grid-template-columns:\s*([^ ]+)/);

        if (match && match[1]) {
          layoutNode.style.setProperty('--menu-width', match[1]);
        }
      };

      // Chạy ngay lần đầu
      syncMenuWidth();

      // Khởi tạo Observer
      const observer = new MutationObserver((mutations: MutationRecord[]) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "attributes" && mutation.attributeName === "style") {
            syncMenuWidth();
          }
        });
      });

      observer.observe(layoutNode, { attributes: true });

      // Lưu reference vào global để sau này đóng lại được
      window._layoutObserver = observer;
    }
  }, 500);
}



// ==========================================================================
// Xử lý Sự kiện và Logic Chính
// ==========================================================================

const inputContainsTypeKeyword = (input: string): boolean => {
  const normalized = normalizeText(input);
  return /\b(phuong|xa|thi tran|quan|huyen|thi xa|tinh|thanh pho|kp|thon)\b/i.test(normalized);
};

function normalizeText(str: string): string {
  if (!str) return "";
  try {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  } catch (e) {
    console.warn("[GiaoTich] normalizeText error:", e);
    return str
      .toLowerCase()
      .replace(/[àáảãạâầấẩẫậăằắẳẵặ]/g, "a")
      .replace(/[èéẻẽẹêềếểễệ]/g, "e")
      .replace(/[ìíỉĩị]/g, "i")
      .replace(/[òóỏõọôồốổỗộơờớởỡợ]/g, "o")
      .replace(/[ùúủũụưừứửữự]/g, "u")
      .replace(/[ỳýỷỹỵ]/g, "y")
      .replace(/đ/g, "d");
  }
}

function checkPress(e: KeyboardEvent): void {
  if (checkIfProcessingActive()) {
    console.log("[GiaoTich] Processing active, skipping key handler");
    return;
  }

  const ele = document.activeElement as HTMLInputElement;
  if (ele && ele.nodeName.toLowerCase() === "input") {
    const eleId = ele.id;
    const keyCode = e.keyCode || (e as any).which;

    switch (keyCode) {
      case KEY_CODES.TAB:
        handleTabKey(e, ele, eleId);
        break;
      case KEY_CODES.ENTER:
        handleEnterKey(e, ele, eleId);
        break;
      case KEY_CODES.F4:
        var btnLuu = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button") as HTMLElement;
        if (btnLuu) {
          btnLuu.click();
        }
        break;

    }
  }
}

async function handleTabKey(e: KeyboardEvent, ele: HTMLInputElement, eleId: string): Promise<void> {
  switch (eleId) {
    case ELEMENT_IDS.RECEIVER_NAME:
      var phoneSender = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-2 > div > div > div > div > div:nth-child(2)");
      if (phoneSender) {
        if (phoneSender.textContent.includes("2412279")) {
          var info = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(5) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-8 > textarea") as HTMLTextAreaElement;
          if (info) {
            // nếu info trống
            if (info.value.trim() === "") {
              info.value = `Cho xem hàng.
KH TỪ CHỐI lhe ngay shop  tại nhà KH để xử lý không mang về BCP mới xử lý  Shop sẽ không đồng ý yc bồi thường 100% giá trị`;
              info.dispatchEvent(new Event('input', { bubbles: true }));
              info.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }

        }
      }
      const receiverName = ele.value;
      if (receiverName) {
        const tenKhongDau = removeAccents(receiverName).toLowerCase();
        chrome.storage.local.get(tenKhongDau, (result) => {
          if (result && result[tenKhongDau] && result[tenKhongDau].length > 0) {
            const savedData = result[tenKhongDau][0];
            if (savedData) {
              const tempSplit = savedData.split("|");
              Address = tempSplit[0] || "";
              PhoneNumber = tempSplit[1] || "";
              IsChooseSusget = true;

              const ghost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
              const addressInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
              if (ghost && addressInput) {
                const fullAddress = Address;
                if (isEmpty(addressInput.value) || addressInput.value !== fullAddress) {
                  if (ghost) {
                    ghost.value = fullAddress;
                    currentSuggestion = fullAddress;
                  }
                }
              }
            } else {
              Address = "";
              PhoneNumber = "";
              IsChooseSusget = false;
              const ghostEl = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
              if (ghostEl) ghostEl.value = "";
            }
          } else {
            Address = "";
            PhoneNumber = "";
            IsChooseSusget = false;
            const ghostEl = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
            if (ghostEl) ghostEl.value = "";
          }
        });
      } else {
        Address = "";
        PhoneNumber = "";
        IsChooseSusget = false;
        const ghostEl = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
        if (ghostEl) ghostEl.value = "";
      }

      const addressInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
      if (addressInput) {
        addressInput.focus();
        if (!IsChooseSusget && isEmpty(addressInput.value)) {
          // Không xóa nếu có gợi ý từ tên
        } else if (IsChooseSusget) {
          // Nếu có gợi ý từ tên, không làm gì cả
        } else {
          addressInput.value = "";
        }
      }
      e.preventDefault();
      break;

    case ELEMENT_IDS.RECEIVER_PHONE:
      const weightInput = document.getElementById(ELEMENT_IDS.WEIGHT) as HTMLInputElement;
      if (weightInput) {
        weightInput.focus();
        if (isSaveKhoiLuong !== "yes") {
          chrome.storage.local.get(STORAGE_KEYS.KHOI_LUONG, (result) => {
            if (result[STORAGE_KEYS.KHOI_LUONG] !== "yes") {
              weightInput.value = "";
            }
          });
        }
      }
      e.preventDefault();

      const nameInputStore = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
      const addressValueStore = (document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement)?.value || "";
      const phoneValueStore = ele.value;

      if (nameInputStore && nameInputStore.value && addressValueStore && phoneValueStore) {
        const nameKhongDauStore = removeAccents(nameInputStore.value).toLowerCase();
        chrome.storage.local.get(nameKhongDauStore, (result) => {
          let shouldSave = true;
          if (result && result[nameKhongDauStore] && result[nameKhongDauStore].length > 0) {
            const existingData = result[nameKhongDauStore][0];
            if (existingData === addressValueStore + "|" + phoneValueStore) {
              shouldSave = false;
            }
          }
          if (shouldSave) {
            chrome.storage.local.set(
              { [nameKhongDauStore]: [addressValueStore + "|" + phoneValueStore] },
              () => { }
            );
          }
        });
      }
      break;

    case ELEMENT_IDS.TT_NUMBER:
      var phoneSender = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-2 > div > div > div > div > div:nth-child(2)");
      if (phoneSender && phoneSender.textContent.includes("14159")) {
        const serviceInfo = document.getElementsByName("serviceCode")[0] as HTMLInputElement | undefined;
        const firstChar = ele.value.charAt(0).toUpperCase();

        if (serviceInfo) {
          const serviceValue = serviceInfo.value;
          let targetCode = "";
          if (firstChar === "C" && serviceValue !== "CTN009") {
            targetCode = "CTN009";
          } else if (firstChar === "E" && serviceValue !== "ETN048") {
            targetCode = "ETN048";
          }

          if (targetCode) {
            const input = document.getElementById("serviceCode") as HTMLInputElement;
            if (!input) {
              console.log("[GiaoTich] Không tìm thấy input serviceCode");
              return;
            }
            e.preventDefault();
            input.focus();
            input.value = targetCode;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            // Đợi gợi ý hiện ra
            await delay(400);

            // Tìm và chọn gợi ý đúng mã
            const suggestionSelector = 'div[id^="react-select-"][tabindex="-1"]';
            const suggestions = Array.from(document.querySelectorAll(suggestionSelector)) as HTMLElement[];
            const option = suggestions.find(el => el.textContent?.trim().startsWith(targetCode));
            if (option) {
              option.click();
              console.log(`[GiaoTich] Đã chọn ${targetCode} từ gợi ý (react-select)`);
            } else {
              console.log(`[GiaoTich] Không tìm thấy gợi ý ${targetCode} (react-select)`);
            }

          }
        }
      }


      const receiverNameInput = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
      if (receiverNameInput) {
        receiverNameInput.focus();
        receiverNameInput.value = "";
      }
      e.preventDefault();
      break;
    case ELEMENT_IDS.MONEY:
      const okButton = document.querySelector(ELEMENT_IDS.POPUP_VAS_OK_BUTTON_SELECTOR) as HTMLElement | null;
      if (okButton) {
        okButton.click();
      }
      e.preventDefault(); // Ngăn tab tiếp nếu cần
      break;

    case ELEMENT_IDS.WEIGHT:
      // Click vào dịch vụ input để mở popup
      // const serviceInput = getElementByXpath(ELEMENT_IDS.SERVICE_INPUT_XPATH) as HTMLElement;
      // if (serviceInput) {

      // Đợi popup xuất hiện rồi tự động check GTG021 (COD)
      setTimeout(() => {
        // Tìm tất cả các button trong popup
        const buttons = document.querySelectorAll('.rt-tbody button.btn-link');
        buttons.forEach((button) => {
          if (button.textContent?.trim() === 'GTG021') {
            // Tìm checkbox cùng hàng (cùng .rt-tr-group)
            const row = button.closest('.rt-tr-group');
            if (row) {
              const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
              if (checkbox && !checkbox.disabled) {
                if (!checkbox.checked) {
                  checkbox.click();
                  console.log('[GiaoTich] Đã tự động check dịch vụ GTG021 (COD)');
                } else {
                  // Nếu đã check rồi: click ngay (để uncheck) rồi sau delay tìm lại và click lại
                  console.log('[GiaoTich] Checkbox GTG021 đã checked, sẽ uncheck và check lại để refresh');
                  checkbox.click();
                  console.log('[GiaoTich] Đã uncheck GTG021');

                  // Đợi lâu hơn và tìm lại checkbox để đảm bảo DOM đã update
                  setTimeout(() => {
                    const buttonsRefresh = document.querySelectorAll('.rt-tbody button.btn-link');
                    buttonsRefresh.forEach((btn) => {
                      if (btn.textContent?.trim() === 'GTG021') {
                        const rowRefresh = btn.closest('.rt-tr-group');
                        if (rowRefresh) {
                          const checkboxRefresh = rowRefresh.querySelector('input[type="checkbox"]') as HTMLInputElement;
                          if (checkboxRefresh && !checkboxRefresh.disabled && !checkboxRefresh.checked) {
                            checkboxRefresh.click();
                            console.log('[GiaoTich] ✅ Đã check lại GTG021 sau khi refresh');
                          } else if (checkboxRefresh?.checked) {
                            console.log('[GiaoTich] ⚠️ GTG021 vẫn đang checked, có thể chưa uncheck kịp');
                          }
                        }
                      }
                    });
                  }, 300); // Tăng delay lên 1200ms
                }
              }
            }
          }
        });
      }, 300); // Đợi 300ms cho popup render
      e.preventDefault();
      break;
    // }
  }
}

function handleEnterKey(e: KeyboardEvent, _ele: HTMLInputElement, eleId: string): void {
  if (eleId === ELEMENT_IDS.TT_NUMBER) {
    e.preventDefault();
    const receiverNameInput = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
    if (receiverNameInput) {
      receiverNameInput.focus();
      receiverNameInput.value = "";
    }
  } else if (eleId === ELEMENT_IDS.RECEIVER_ADDRESS) {
    console.log("[GiaoTich] Enter pressed in address input");
    e.preventDefault();

    const phoneInput = document.getElementById(ELEMENT_IDS.RECEIVER_PHONE) as HTMLInputElement;
    if (phoneInput) {
      phoneInput.value = "";
      phoneInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      phoneInput.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      phoneInput?.dispatchEvent(new Event("blur"));
    }
    return;
  } else if (eleId === ELEMENT_IDS.MONEY) {
    e.preventDefault();
    const okButton = document.querySelector(ELEMENT_IDS.POPUP_VAS_OK_BUTTON_SELECTOR) as HTMLElement | null;
    if (okButton) {
      okButton.click();
    }
  }
}

function selectItem(event: Event): void {
  const target = event.target as HTMLElement;
  if (target && target.tagName === "LI") {
    const inputField = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
    if (inputField) {
      const selectedText = target.textContent;
      inputField.value = selectedText || "";
      const ghost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
      if (ghost) ghost.value = "";

      const phoneInput = document.getElementById(ELEMENT_IDS.RECEIVER_PHONE) as HTMLInputElement;
      if (phoneInput) {
        phoneInput.focus();
      }
    }
  }
}

function findSuggestions(inputText: string): void {
  if (checkIfProcessingActive()) {
    return; // Dừng nếu processSinglePortalItem đang chạy
  }

  const ghost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
  const receiverInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;

  if (!inputText || inputText.trim().length < 2) {
    if (ghost) ghost.value = "";
    currentSuggestion = null;
    return;
  }

  if (isTabed) {
    isTabed = false;
    const btnfind = document.querySelector(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div.MuiGrid-root.MuiGrid-container.MuiGrid-item.MuiGrid-grid-xs-8 > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(4)"
    ) as HTMLElement;
    if (btnfind) btnfind.click();

    const phoneInput = document.getElementById(ELEMENT_IDS.RECEIVER_PHONE) as HTMLInputElement;
    if (phoneInput) {
      phoneInput.value = "";
      phoneInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      phoneInput.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      phoneInput?.dispatchEvent(new Event("blur"));
    }
    return;
  }

  if (!receiverInput || !ghost) return;

  const trimmedInput = inputText.trim();
  const normalizedInput = normalizeText(trimmedInput);

  let bestMatchItem: any = null;
  let matchedLevel: string | null = null;
  let highestScore = -1;
  let matchedOriginalString = "";

  for (const item of addressData) {
    const searchFields: any[] = [];

    if (item.ThonKhuPho) {
      for (const thon of item.ThonKhuPho) {
        searchFields.push({
          name: thon.Name,
          normalized: thon.NameKD,
          weight: 4,
          level: "Thon",
          originalThonName: thon.Name,
        });
      }
    }

    searchFields.push({
      name: item.NameXP || item.NameXPN,
      normalized: normalizeText(item.NameXPKD || item.NameXPN),
      weight: 3,
      level: "XP",
    });
    searchFields.push({
      name: item.NameQH || item.NameQHN,
      normalized: normalizeText(item.NameQHKD || item.NameQHN),
      weight: 2,
      level: "QH",
    });
    searchFields.push({
      name: item.NameTTP || item.NameTTPN,
      normalized: normalizeText(item.NameTTPKD || item.NameTTPN),
      weight: 1,
      level: "TTP",
    });

    for (const field of searchFields) {
      if (field.normalized) {
        const currentNormalizedField = field.normalized;
        let currentScore = 0;
        let matchIndex = -1;

        if (normalizedInput.endsWith(currentNormalizedField)) {
          currentScore = field.weight * 100 + currentNormalizedField.length + 500;
          matchIndex = normalizedInput.length - currentNormalizedField.length;
        } else {
          matchIndex = normalizedInput.lastIndexOf(currentNormalizedField);
          if (matchIndex !== -1) {
            currentScore = field.weight * 100 + currentNormalizedField.length;
            const positionFactor = (matchIndex + currentNormalizedField.length) / normalizedInput.length;
            currentScore += Math.round(positionFactor * 50);
          }
        }

        if (matchIndex !== -1 && currentScore > 0) {
          const indexAfterMatch = matchIndex + currentNormalizedField.length;
          let remainingInput = "";
          if (indexAfterMatch < inputText.length) {
            remainingInput = inputText.substring(indexAfterMatch);
          }
          const normalizedRemainingInput = normalizeText(remainingInput.trim().replace(/^,?\s*/, ""));

          if (normalizedRemainingInput) {
            let nextLevelNormalized = "";
            if (field.level === "Thon") nextLevelNormalized = normalizeText(item.NameXPKD || item.NameXPN);
            else if (field.level === "XP") nextLevelNormalized = normalizeText(item.NameQHKD || item.NameQHN);
            else if (field.level === "QH") nextLevelNormalized = normalizeText(item.NameTTPKD || item.NameTTPN);

            if (nextLevelNormalized && nextLevelNormalized.startsWith(normalizedRemainingInput)) {
              currentScore += 1000;
            }
          }
        }

        if (currentScore > highestScore) {
          highestScore = currentScore;
          bestMatchItem = item;
          matchedOriginalString = field.normalized;
          matchedLevel = field.level;
        }
      }
    }
  }

  if (bestMatchItem && matchedLevel) {
    const lastIndex = normalizedInput.lastIndexOf(matchedOriginalString.toLowerCase());
    const indexAfterMatch = lastIndex !== -1 ? lastIndex + matchedOriginalString.length : -1;

    let remainingInput = "";
    if (indexAfterMatch !== -1 && indexAfterMatch < inputText.length) {
      remainingInput = inputText.substring(indexAfterMatch);
    }

    const useFormatted = inputContainsTypeKeyword(inputText);

    const getPartString = (item: any, level: string, useFmt: boolean): string => {
      let name;
      if (level === "XP") name = useFmt ? item.NameXP || item.NameXPKD : item.NameXPN || item.NameXPKD;
      else if (level === "QH") name = useFmt ? item.NameQH || item.NameQHKD : item.NameQHN || item.NameQHKD;
      else if (level === "TTP") name = useFmt ? item.NameTTP || item.NameTTPKD : item.NameTTPN || item.NameTTPKD;
      return name ? name.toLowerCase() : "";
    };

    const appendedParts: string[] = [];
    let nextSuggestionPartNormalized = "";
    const normalizedRemainingInput = normalizeText(remainingInput.trim().replace(/^,?\s*/, ""));

    switch (matchedLevel) {
      case "Thon":
        appendedParts.push(getPartString(bestMatchItem, "XP", useFormatted));
        appendedParts.push(getPartString(bestMatchItem, "QH", useFormatted));
        appendedParts.push(getPartString(bestMatchItem, "TTP", useFormatted));
        nextSuggestionPartNormalized = normalizeText(getPartString(bestMatchItem, "XP", false));
        break;
      case "XP":
        appendedParts.push(getPartString(bestMatchItem, "QH", useFormatted));
        appendedParts.push(getPartString(bestMatchItem, "TTP", useFormatted));
        nextSuggestionPartNormalized = normalizeText(getPartString(bestMatchItem, "QH", false));
        break;
      case "QH":
        appendedParts.push(getPartString(bestMatchItem, "TTP", useFormatted));
        nextSuggestionPartNormalized = normalizeText(getPartString(bestMatchItem, "TTP", false));
        break;
      case "TTP":
        break;
    }

    const shouldShowSuggestion =
      appendedParts.length > 0 &&
      (!normalizedRemainingInput ||
        (nextSuggestionPartNormalized && nextSuggestionPartNormalized.startsWith(normalizedRemainingInput)));

    if (shouldShowSuggestion) {
      let suggestionSuffix = appendedParts.join(" ");

      let separator = ", ";
      if (
        inputText.endsWith(",") ||
        inputText.endsWith(", ") ||
        remainingInput.trim().startsWith(",")
      ) {
        separator = " ";
      } else if (inputText.endsWith(" ")) {
        separator = "";
      } else if (remainingInput.trim() === "" && !inputText.endsWith(" ")) {
        separator = " ";
      } else if (
        remainingInput.trim() !== "" &&
        !remainingInput.startsWith(" ") &&
        !remainingInput.startsWith(",")
      ) {
        separator = " ";
      } else {
        separator = "";
      }

      const trimmedRemaining = remainingInput.trimStart().replace(/^,?\s*/, "");
      if (trimmedRemaining) {
        const normSuffix = normalizeText(suggestionSuffix);
        const normRemaining = normalizeText(trimmedRemaining);
        if (normSuffix.startsWith(normRemaining)) {
          suggestionSuffix = suggestionSuffix.substring(normRemaining.length);
        }
      }

      let ghostText = inputText + separator + suggestionSuffix;

      if (inputText === inputText.toUpperCase()) {
        ghostText = ghostText.toUpperCase();
      }

      if (ghostText.length > inputText.length && normalizeText(ghostText).startsWith(normalizeText(inputText))) {
        ghost.value = ghostText;
        currentSuggestion = ghostText;
      } else {
        ghost.value = "";
        currentSuggestion = null;
      }
    } else {
      ghost.value = "";
      currentSuggestion = null;
    }
  } else {
    ghost.value = "";
    currentSuggestion = null;
  }
}

// ==========================================================================
// Khởi tạo và Lắng nghe sự kiện
// ==========================================================================

/**
 * Kiểm tra URL hiện tại có phải trang itemdetail không
 */
function isItemDetailPage(): boolean {
  return window.location.href.includes("itemdetail");
}

/**
 * Bật script khi vào trang itemdetail
 */
function activateScript(): void {
  if (isScriptActive) {
    console.log("[GiaoTich] Script đã được bật rồi");
    return;
  }

  console.log("[GiaoTich] Bật script cho trang itemdetail");
  isScriptActive = true;

  // Bắt đầu observe DOM để tìm receiverAddress input
  observeDOMForAddressInput();

  // Gắn keydown listener
  document.addEventListener("keydown", checkPress, false);

  // Monitor parcelIndex để tự động chuyển ảnh
  setTimeout(() => {
    monitorParcelIndex();
  }, 1000); // Đợi DOM render xong
}

/**
 * Tắt script khi rời khỏi trang itemdetail
 */
function deactivateScript(): void {
  if (!isScriptActive) {
    console.log("[GiaoTich] Script đã tắt rồi");
    return;
  }

  console.log("[GiaoTich] Tắt script vì rời khỏi trang itemdetail");
  isScriptActive = false;

  // Dừng DOM observer
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  // Xóa ghost input nếu có
  const ghostInput = document.getElementById(ELEMENT_IDS.GHOST_INPUT);
  if (ghostInput) {
    ghostInput.remove();
  }

  // Xóa keydown listener
  document.removeEventListener("keydown", checkPress, false);

  // Xóa ResizeObservers
  if ((window as any)._inputResizeObserversGiaoTich) {
    (window as any)._inputResizeObserversGiaoTich = new WeakMap();
  }

  // Dừng parcelIndex observer
  if ((window as any)._parcelIndexObserver) {
    (window as any)._parcelIndexObserver.disconnect();
    (window as any)._parcelIndexObserver = null;
  }

  // Reset lastParcelIndexValue
  lastParcelIndexValue = -1;
}

/**
 * Theo dõi URL changes trong React SPA
 */
function monitorURLChanges(): void {
  let lastUrl = window.location.href;

  console.log("[GiaoTich] Bắt đầu monitor URL changes. URL hiện tại:", lastUrl);

  // Kiểm tra URL ban đầu
  if (isItemDetailPage()) {
    console.log("[GiaoTich] URL ban đầu là itemdetail, activate script");
    activateScript();
  } else {
    console.log("[GiaoTich] URL ban đầu không phải itemdetail");
  }

  // Theo dõi pushState và replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    console.log("[GiaoTich] pushState detected");
    handleURLChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    console.log("[GiaoTich] replaceState detected");
    handleURLChange();
  };

  // Theo dõi popstate (nút back/forward)
  window.addEventListener('popstate', () => {
    console.log("[GiaoTich] popstate detected");
    handleURLChange();
  });

  // Fallback: Polling để phát hiện URL change (cho trường hợp React Router không dùng History API)
  setInterval(() => {
    const currentUrl = window.location.href;
    if (lastUrl !== currentUrl) {
      console.log("[GiaoTich] URL changed detected by polling:", lastUrl, "->", currentUrl);
      handleURLChange();
    }
  }, 500);

  function handleURLChange(): void {
    const currentUrl = window.location.href;
    const wasItemDetail = lastUrl.includes("itemdetail");
    const isItemDetail = currentUrl.includes("itemdetail");

    console.log("[GiaoTich] handleURLChange - Last:", lastUrl, "Current:", currentUrl);
    console.log("[GiaoTich] Was itemdetail:", wasItemDetail, "Is itemdetail:", isItemDetail);

    if (isItemDetail && !wasItemDetail) {
      // Vừa vào trang itemdetail
      console.log("[GiaoTich] ✅ URL changed TO itemdetail:", currentUrl);
      activateScript();
    } else if (!isItemDetail && wasItemDetail) {
      // Vừa rời khỏi trang itemdetail
      console.log("[GiaoTich] ❌ URL changed AWAY FROM itemdetail:", currentUrl);
      deactivateScript();
    } else if (isItemDetail && wasItemDetail) {
      console.log("[GiaoTich] 🔄 Still on itemdetail page");
    } else {
      console.log("[GiaoTich] ⏭️ Still not on itemdetail page");
    }

    lastUrl = currentUrl;
  }
}

async function initialize(): Promise<void> {
  console.log("[GiaoTich] Bắt đầu khởi tạo...");

  // Load localStorage settings nếu cần (hiện tại không dùng)
  // const storedUpperCase = localStorage.getItem(STORAGE_KEYS.IS_UPERCASE);
  // const storedFullText = localStorage.getItem(STORAGE_KEYS.IS_FULL_TEXT_ADDRESS);

  chrome.storage.local.get(STORAGE_KEYS.KHOI_LUONG, (result) => {
    isSaveKhoiLuong = result[STORAGE_KEYS.KHOI_LUONG] === "yes" ? "yes" : "no";
  });

  try {
    const response = await fetch(chrome.runtime.getURL("/data.json"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data && typeof data === "object" && Array.isArray(data.QuocGia)) {
      addressData = data.QuocGia;
      console.log("[GiaoTich] Dữ liệu địa chỉ đã load:", addressData.length, "items");
    } else {
      console.error("[GiaoTich] Invalid address data format.");
    }
  } catch (error) {
    console.error("[GiaoTich] Lỗi khi tải data.json:", error);
  }

  // Luôn monitor processing status (không phụ thuộc URL)
  monitorProcessingStatus();

  // Theo dõi URL changes và bật/tắt script
  monitorURLChanges();

  // Attach smart zoom listeners cho các field quan trọng
  attachSmartZoomListenersToAllFields();
}

/**
 * Attach smart zoom listeners cho tất cả các field có trong FIELD_GROUPS
 */
function attachSmartZoomListenersToAllFields(): void {
  // Đợi DOM ready
  const attachWhenReady = () => {
    Object.keys(FIELD_GROUPS).forEach((fieldId) => {
      const input = document.getElementById(fieldId);
      if (input) {
        attachSmartZoomListener(input, fieldId);
        console.log(`[GiaoTich] Attached smart zoom listener to #${fieldId}`);
      }
    });
  };

  // Thử attach ngay
  attachWhenReady();

  // Và observe để attach khi các field được thêm vào DOM
  const observer = new MutationObserver(() => {
    attachWhenReady();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function attachListenersToInput(receiverAddressInput: HTMLInputElement): void {
  if ((receiverAddressInput as any)._listenersAttached) {
    console.log("[GiaoTich] Listeners đã được gắn cho element này.");
    return;
  }

  console.log("[GiaoTich] Gắn listener cho:", receiverAddressInput.id);

  const parentContainer = receiverAddressInput.parentNode;
  let ghostInput = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;

  if (parentContainer && !ghostInput) {
    ghostInput = document.createElement("input");
    ghostInput.type = "text";
    ghostInput.className = "address-input-base";
    ghostInput.setAttribute("readonly", "true");
    ghostInput.setAttribute("tabindex", "-1");
    ghostInput.style.zIndex = "1";
    ghostInput.id = ELEMENT_IDS.GHOST_INPUT;
    ghostInput.style.position = "absolute";
    ghostInput.style.setProperty("color", "lightgrey", "important");

    (parentContainer as HTMLElement).style.position = "relative";
    (parentContainer as HTMLElement).insertBefore(ghostInput, receiverAddressInput);
  } else if (!parentContainer) {
    console.error("[GiaoTich] Cannot find parent container for receiverAddressInput");
    return;
  }

  ghostInput = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;

  const syncGhostStyle = (): void => {
    if (!ghostInput || !receiverAddressInput || !document.body.contains(receiverAddressInput)) {
      return;
    }
    try {
      const computedStyle = getComputedStyle(receiverAddressInput);
      ghostInput.style.width = receiverAddressInput.offsetWidth + "px";
      ghostInput.style.height = receiverAddressInput.offsetHeight + "px";
      ghostInput.style.top = "1px";
      ghostInput.style.left = "37px";
      ghostInput.style.fontSize = computedStyle.fontSize;
      ghostInput.style.fontFamily = computedStyle.fontFamily;
      ghostInput.style.fontWeight = computedStyle.fontWeight;
      ghostInput.style.lineHeight = computedStyle.lineHeight;
      ghostInput.style.padding = computedStyle.padding;
      ghostInput.style.border = "none";
      ghostInput.style.borderRadius = computedStyle.borderRadius;
      ghostInput.style.boxSizing = computedStyle.boxSizing;
      ghostInput.style.marginTop = computedStyle.marginTop;
      ghostInput.style.marginLeft = computedStyle.marginLeft;
      ghostInput.style.display = "block";
    } catch (e) {
      console.warn("[GiaoTich] Error syncing ghost style:", e);
      if (ghostInput) ghostInput.style.display = "none";
    }
  };

  syncGhostStyle();

  receiverAddressInput.style.position = "relative";
  receiverAddressInput.style.zIndex = "2";
  receiverAddressInput.style.backgroundColor = "transparent";

  if (typeof ResizeObserver !== "undefined") {
    if (!(window as any)._inputResizeObserversGiaoTich) {
      (window as any)._inputResizeObserversGiaoTich = new WeakMap();
    }
    if ((window as any)._inputResizeObserversGiaoTich.has(receiverAddressInput)) {
      (window as any)._inputResizeObserversGiaoTich.get(receiverAddressInput).disconnect();
    }
    const resizeObserver = new ResizeObserver(debounce(syncGhostStyle, 100));
    resizeObserver.observe(receiverAddressInput);
    (window as any)._inputResizeObserversGiaoTich.set(receiverAddressInput, resizeObserver);
  }

  const debouncedFindSuggestions = debounce(findSuggestions, 100);
  const inputHandler = (event: Event): void => {
    const currentGhost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
    if (!currentGhost || (currentGhost.previousSibling !== receiverAddressInput && currentGhost.previousElementSibling !== receiverAddressInput)) {
      console.warn("[GiaoTich] Ghost input missing or misplaced, attempting re-sync.");
    }
    debouncedFindSuggestions((event.target as HTMLInputElement).value);
  };
  receiverAddressInput.addEventListener("input", inputHandler);

  const keydownHandler = (event: KeyboardEvent): void => {
    const currentGhost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement;
    if (
      currentSuggestion &&
      currentGhost &&
      currentGhost.value &&
      (event.key === "Tab" || event.key === "ArrowRight") &&
      receiverAddressInput.selectionStart === receiverAddressInput.value.length
    ) {
      event.preventDefault();
      receiverAddressInput.value = currentSuggestion;
      receiverAddressInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      receiverAddressInput.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      receiverAddressInput?.dispatchEvent(new Event("blur"));

      currentGhost.value = "";
      currentSuggestion = null;
      isTabed = true;
    } else if (["ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Backspace", "Delete"].includes(event.key)) {
      if (currentGhost) currentGhost.value = "";
      currentSuggestion = null;
    }
  };
  receiverAddressInput.addEventListener("keydown", keydownHandler);

  const phoneInput = document.getElementById(ELEMENT_IDS.RECEIVER_PHONE) as HTMLInputElement;
  if (phoneInput && !(phoneInput as any)._listenersAttached) {
    phoneInput.addEventListener("focusin", (event: FocusEvent) => {
      const currentAddressValue = receiverAddressInput.value;
      if (PhoneNumber && IsChooseSusget && currentAddressValue === Address) {
        if (isEmpty((event.target as HTMLInputElement).value) || (event.target as HTMLInputElement).value !== PhoneNumber) {
          (event.target as HTMLInputElement).value = PhoneNumber;
        }
      }
      IsChooseSusget = false;
    });
    (phoneInput as any)._listenersAttached = true;
  }

  (receiverAddressInput as any)._listenersAttached = true;
  (receiverAddressInput as any)._inputHandlerRef = inputHandler;
  (receiverAddressInput as any)._keydownHandlerRef = keydownHandler;
}

function observeDOMForAddressInput(): void {
  const targetNode = document.body;
  const config = { childList: true, subtree: true };

  const callback = function (mutationsList: MutationRecord[], _observer: MutationObserver): void {
    if (checkIfProcessingActive()) {
      return; // Bỏ qua nếu đang xử lý Portal
    }

    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.matches && el.matches("#" + ELEMENT_IDS.RECEIVER_ADDRESS)) {
              console.log("[GiaoTich] Phát hiện #receiverAddress được thêm vào:", el);
              attachListenersToInput(el as HTMLInputElement);
            } else if (el.querySelector) {
              const receiverInput = el.querySelector("#" + ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
              if (receiverInput) {
                console.log("[GiaoTich] Phát hiện #receiverAddress bên trong node được thêm:", receiverInput);
                attachListenersToInput(receiverInput);
              }
            }
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.matches && el.matches("#" + ELEMENT_IDS.RECEIVER_ADDRESS)) {
              console.log("[GiaoTich] #receiverAddress bị xóa khỏi DOM:", el);
              if ((window as any)._inputResizeObserversGiaoTich && (window as any)._inputResizeObserversGiaoTich.has(el)) {
                (window as any)._inputResizeObserversGiaoTich.get(el).disconnect();
                (window as any)._inputResizeObserversGiaoTich.delete(el);
                console.log("[GiaoTich] Đã hủy ResizeObserver.");
              }
              const ghostInput = document.getElementById(ELEMENT_IDS.GHOST_INPUT);
              if (ghostInput && el.parentNode && el.parentNode === ghostInput.parentNode) {
                console.log("[GiaoTich] Xóa ghost input.");
                ghostInput.remove();
              }
            }
          }
        });
      }
    }
  };

  // Lưu observer vào biến global để có thể disconnect sau này
  domObserver = new MutationObserver(callback);
  domObserver.observe(targetNode, config);
  console.log("[GiaoTich] MutationObserver đang theo dõi sự thay đổi DOM...");

  const existingInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
  if (existingInput) {
    console.log("[GiaoTich] #receiverAddress đã tồn tại khi bắt đầu observer.");
    attachListenersToInput(existingInput);
  }
}

// ==========================================================================
// Điểm bắt đầu thực thi
// ==========================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
