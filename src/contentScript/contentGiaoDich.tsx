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
let requestNextImageTimer: ReturnType<typeof setTimeout> | null = null;
let addressData: any[] = []; // Lưu trữ dữ liệu địa chỉ chính
let isSaveKhoiLuong = "";
let IsChooseSusget = false;
let PhoneNumber = "";
let Address = "";
let isProcessingPortalItem = false; // Cờ để kiểm tra processSinglePortalItem đang chạy
let isScriptActive = false; // Trạng thái script có đang hoạt động không
let domObserver: MutationObserver | null = null; // Observer cho DOM changes
let lastParcelIndexValue = -1; // Theo dõi giá trị parcelIndex để phát hiện khi tăng
// 1. Thêm biến để lưu giá trị cũ của input cần kiểm tra
let lastAutoSavedValue: string = "";
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
const DIA_BAN_PARENT_SELECTOR = "#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(4)";
const CUSTOM_GOC_ID = "custom-goc-display-text";
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

/**
 * Hàm hiển thị text GOC vào cuối element Địa bàn
 */
function displayGocData(gocContent: string) {
  // Tìm element cha
  const parentElement = document.querySelector(DIA_BAN_PARENT_SELECTOR) as HTMLElement;

  if (!parentElement) {
    console.warn("[GiaoTich] Không tìm thấy element cha Địa bàn để chèn GOC.");
    return;
  }

  // Kiểm tra xem đã có element hiển thị GOC chưa
  let gocElement = document.getElementById(CUSTOM_GOC_ID);

  if (!gocElement) {
    // Nếu chưa có, tạo mới
    gocElement = document.createElement("div");
    gocElement.id = CUSTOM_GOC_ID;

    // Style cho đẹp
    Object.assign(gocElement.style, {
      width: "100%", // Xuống dòng
      marginTop: "5px",
      marginLeft: "10px", // Căn lề giống các input radio
      padding: "5px 10px",
      backgroundColor: "#f9f0ff", // Màu nền tím nhạt
      border: "1px dashed #722ed1", // Viền tím
      borderRadius: "4px",
      color: "#531dab", // Màu chữ tím đậm
      fontSize: "15px",
      fontWeight: "500",
      fontFamily: "monospace", // Font code để dễ nhìn
      whiteSpace: "pre-wrap", // Giữ định dạng xuống dòng nếu có
      display: "block"
    });

    // Chèn vào cuối parent
    parentElement.appendChild(gocElement);

    // Vì parent là MuiGrid (flex), để element này xuống dòng đẹp, ta có thể set parent flex-wrap
    parentElement.style.flexWrap = "wrap";
  }

  // Cập nhật nội dung
  gocElement.textContent = `📋 GỐC: ${gocContent}`;

  // Hiệu ứng nháy để báo hiệu cập nhật
  gocElement.style.backgroundColor = "#d3adf7";
  setTimeout(() => {
    gocElement!.style.backgroundColor = "#f9f0ff";
  }, 500);
}

function debounce(func: Function, delay: number): (...args: any[]) => void {
  let timer: ReturnType<typeof setTimeout>;
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
  iframe.contentWindow?.postMessage(message, extensionOrigin);
}
/**
 * Gửi message đến side panel để chuyển sang ảnh tiếp theo
 */
function requestNextImage(): void {
  // Clear timer cũ nếu có
  if (requestNextImageTimer) clearTimeout(requestNextImageTimer);

  // Debounce: Chỉ gửi lệnh sau khi yên tĩnh 300ms
  requestNextImageTimer = setTimeout(() => {
    if (!isSidePanelOpen()) {
      console.log("[GiaoTich] Side panel not open, skip next image request");
      return;
    }

    console.log("[GiaoTich] 🖼️ Requesting side panel to show next image");
    chrome.runtime.sendMessage({ type: "SIDEPANEL_NEXT_IMAGE" }, () => {
      if (chrome.runtime.lastError) {
        // Bỏ qua lỗi nếu sidepanel đóng đột ngột
        // console.log("[GiaoTich] Error requesting next image:", chrome.runtime.lastError.message);
      } else {
        console.log("[GiaoTich] Next image request sent successfully");
      }
    });
  }, 300); // Tăng delay lên 300ms để gộp các event
}

// Thêm ID cho nút AI để tránh trùng lặp
const AI_BUTTON_ID = "btn-ai-address-check";
const AI_OVERLAY_ID = "ai-result-overlay";
/**
 * Hiển thị Overlay AI với giao diện Card hiện đại
 */
function showAIResultOverlay(text: string, isError: boolean = false) {
  // Xóa overlay cũ nếu có
  const oldOverlay = document.getElementById(AI_OVERLAY_ID);
  if (oldOverlay) oldOverlay.remove();

  // Container chính (Overlay layer)
  const container = document.createElement("div");
  container.id = AI_OVERLAY_ID;
  Object.assign(container.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%) translateY(-20px)",
    zIndex: "2147483647",
    opacity: "0",
    transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
  });

  // Card nội dung
  const card = document.createElement("div");
  Object.assign(card.style, {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.1)",
    padding: "16px 20px",
    minWidth: "350px",
    maxWidth: "500px",
    borderLeft: isError ? "5px solid #ff4d4f" : "5px solid #8a2be2",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  });

  // Header của Card
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">${isError ? '⚠️' : '🤖'}</span>
            <span style="font-weight: 700; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${isError ? 'Lỗi Phân Tích' : 'AI Gợi Ý Địa Chỉ'}
            </span>
        </div>
    `;

  // Nút đóng (X)
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  Object.assign(closeBtn.style, {
    border: "none",
    background: "none",
    cursor: "pointer",
    color: "#999",
    fontSize: "16px",
    padding: "4px"
  });
  closeBtn.onclick = () => {
    container.style.opacity = "0";
    container.style.transform = "translateX(-50%) translateY(-20px)";
    setTimeout(() => container.remove(), 400);
  };
  header.appendChild(closeBtn);

  // Nội dung kết quả
  const content = document.createElement("div");
  Object.assign(content.style, {
    color: "#444",
    fontSize: "15px",
    lineHeight: "1.5",
    fontWeight: "500",
    backgroundColor: isError ? "#fff1f0" : "#f9f5ff",
    padding: "12px",
    borderRadius: "8px",
    border: isError ? "1px solid #ffccc7" : "1px solid #e9d8fd",
    whiteSpace: "pre-wrap"
  });
  content.textContent = text;

  card.appendChild(header);
  card.appendChild(content);

  // Nút chức năng (Chỉ hiện khi không phải lỗi)
  if (!isError && text.length > 5 && !text.includes("Đang phân tích")) {
    const actionArea = document.createElement("div");
    actionArea.style.display = "flex";
    actionArea.style.justifyContent = "flex-end";

    const applyBtn = document.createElement("button");
    Object.assign(applyBtn.style, {
      backgroundColor: "#8a2be2",
      color: "white",
      border: "none",
      borderRadius: "6px",
      padding: "8px 16px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      transition: "background-color 0.2s"
    });
    applyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            SỬ DỤNG ĐỊA CHỈ NÀY
        `;

    applyBtn.onmouseover = () => applyBtn.style.backgroundColor = "#7b27cc";
    applyBtn.onmouseout = () => applyBtn.style.backgroundColor = "#8a2be2";

    applyBtn.onclick = () => {
      fillCorrectedAddress(text);
      closeBtn.click(); // Đóng overlay sau khi điền
    };

    actionArea.appendChild(applyBtn);
    card.appendChild(actionArea);
  }

  container.appendChild(card);
  document.body.appendChild(container);

  // Trigger animation hiện lên
  setTimeout(() => {
    container.style.opacity = "1";
    container.style.transform = "translateX(-50%) translateY(0)";
  }, 10);

  // Tự động tắt sau 15s (tăng thêm thời gian để kịp đọc)
  if (!text.includes("Đang phân tích")) {
    setTimeout(() => {
      if (document.body.contains(container)) {
        closeBtn.click();
      }
    }, 15000);
  }
}

/**
 * Nâng cấp hàm injectAIButton để xử lý mượt mà hơn
 */
function injectAIButton() {
  if (document.getElementById(AI_BUTTON_ID)) return;

  const addressInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
  if (!addressInput) return;

  const parentContainer = addressInput.parentNode as HTMLElement;
  const siblingButton = addressInput.nextElementSibling;

  const aiBtn = document.createElement("button");
  aiBtn.id = AI_BUTTON_ID;
  aiBtn.type = "button";
  aiBtn.className = "btn btn-primary btn-sm";
  Object.assign(aiBtn.style, {
    marginLeft: "4px",
    backgroundColor: "#8a2be2",
    borderColor: "#8a2be2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 6px", // Chỉnh lại padding cho vừa icon
    borderRadius: "4px", // Bo góc giống các nút khác của hệ thống
    boxShadow: "0 2px 4px rgba(138, 43, 226, 0.3)",
    cursor: "pointer"
  });
  aiBtn.title = "Sửa lỗi địa chỉ bằng AI (Gemini)";

  aiBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Ngôi sao chính -->
        <path d="M12 3L14.5 9L21 11.5L14.5 14L12 21L9.5 14L3 11.5L9.5 9L12 3Z" fill="white"/>
        <!-- Ngôi sao nhỏ phụ 1 -->
        <path d="M19 16L19.7 18.3L22 19L19.7 19.7L19 22L18.3 19.7L16 19L18.3 18.3L19 16Z" fill="white"/>
        <!-- Ngôi sao nhỏ phụ 2 -->
        <path d="M5 3L5.7 5.3L8 6L5.7 6.7L5 9L4.3 6.7L2 6L4.3 5.3L5 3Z" fill="white"/>
    </svg>
        </svg>
    `;

  aiBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const address = addressInput.value.trim();

    if (!address) {
      showAIResultOverlay("Vui lòng nhập địa chỉ cần sửa lỗi!", true);
      return;
    }

    showAIResultOverlay("Đang phân tích địa chỉ bằng AI...");

    chrome.runtime.sendMessage({
      type: "CORRECT_ADDRESS",
      payload: { address }
    }, (response) => {
      if (chrome.runtime.lastError) {
        showAIResultOverlay("Lỗi kết nối Extension: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (response && response.status === "success") {
        showAIResultOverlay(response.result);
      } else {
        showAIResultOverlay("Lỗi: " + (response?.error || "Không có phản hồi từ AI"), true);
      }
    });
  });

  if (siblingButton) {
    parentContainer.insertBefore(aiBtn, siblingButton.nextSibling);
  } else {
    parentContainer.appendChild(aiBtn);
  }
}

// Thêm vào hàm monitorProcessingStatus hoặc tạo mới trong initialize
function listenForFillForm() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // ... (các logic cũ)

    // LOGIC MỚI: Điền form từ AI Order
    if (msg.type === "FILL_FORM_DATA_AI") {
      const order = msg.payload; // Kiểu Order
      console.log("[GiaoTich] Filling form from AI:", order);

      try {
        // 1. Điền Tên Người Nhận
        const nameInput = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
        if (nameInput) {
          nameInput.value = order.NGUOINHAN || "";
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (order.MAHIEU) {
          const ttNumberInput = document.getElementById(ELEMENT_IDS.TT_NUMBER) as HTMLInputElement;
          if (!ttNumberInput) {
            console.warn("[GiaoTich] ttNumber input not found");
            // Không return ở đây để các trường khác vẫn được điền
          } else {
            console.log("[GiaoTich] Filling ttNumber:", order.MAHIEU);
            ttNumberInput.value = order.MAHIEU;
            ttNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
            ttNumberInput.dispatchEvent(new Event('change', { bubbles: true }));
            ttNumberInput.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        }



        // 3. Điền Địa Chỉ (Quan trọng: cần trigger sự kiện để React nhận diện)
        const addressInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
        if (addressInput) {
          addressInput.value = order.DIACHI || "";
          addressInput.dispatchEvent(new Event('input', { bubbles: true }));
          addressInput.dispatchEvent(new Event('change', { bubbles: true }));
          // Focus để kích hoạt các script gợi ý nếu cần
          addressInput.focus();
          addressInput.dispatchEvent(new Event('blur'));
          var find = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(5) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(4)")
          if (find) {
            (find as HTMLButtonElement).click();
          }
        }
        // 2. Điền Số Điện Thoại
        const phoneInput = document.getElementById(ELEMENT_IDS.RECEIVER_PHONE) as HTMLInputElement;
        if (phoneInput) {
          phoneInput.value = order.SDT || "";
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
          phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
          // Trigger logic lưu cache nếu có
          phoneInput.dispatchEvent(new Event('blur'));
        }
        if (order.GOC) {
          displayGocData(order.GOC);
        }
        setChiDanPhat("- Liên hệ người nhận trước khi phát.\n- CHO KHÁCH XEM HÀNG, Khách xem hàng không nhận không thu phí hủy ĐH \n- Phát một phần đơn hàng (DOP2) khi có yêu cầu.\n - Hoàn trả một phần đơn hàng theo BKC: 59CVOTHITHUAN319.\n- Phát không thành công vui lòng liên hệ với người gửi: 0366 576 671 \n- Liên hệ người gửi trước khi Chuyển hoàn và Chuyển hoàn về BCG");

        // --- 2. LOGIC KIỂM TRA GIÁ TRỊ VÀ AUTO SAVE (Sửa đổi) ---
        console.log("[GiaoTich] Checking value change...");

        // Xác định selector dựa trên radio button "Địa bàn"
        // Mặc định là 'new'
        let isNewAddress = true;
        const radioNew = document.querySelector('input[name="diaban2"][value="new"]') as HTMLInputElement;
        const radioOld = document.querySelector('input[name="diaban2"][value="old"]') as HTMLInputElement;

        if (radioNew && radioNew.checked) {
          isNewAddress = true;
        } else if (radioOld && radioOld.checked) {
          isNewAddress = false;
        }

        let targetInputSelector = "";
        if (isNewAddress) {
          // Selector cho Địa bàn MỚI
          targetInputSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(6) > div:nth-child(6) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-4 > input";
        } else {
          // Selector cho Địa bàn CŨ
          targetInputSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(6) > div:nth-child(7) > div:nth-child(6) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-4 > input";
        }

        const saveButtonSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button";

        // Luôn chờ kiểm tra dù có AutoSave hay không
        setTimeout(() => {
          const targetInput = document.querySelector(targetInputSelector) as HTMLInputElement;

          if (targetInput) {
            const currentValue = targetInput.value;
            console.log(`[GiaoTich] Validation (${isNewAddress ? 'New' : 'Old'}) - Current: "${currentValue}", Last: "${lastAutoSavedValue}"`);

            // --- ĐIỀU KIỆN KIỂM TRA ---
            // 1. Giá trị không được trống
            // 2. Giá trị PHẢI KHÁC giá trị của đơn trước đó
            if (currentValue && currentValue.trim() !== "" && currentValue !== lastAutoSavedValue) {

              // TRƯỜNG HỢP HỢP LỆ (Value changed)
              console.log("[GiaoTich] Value changed. Updating tracker.");

              // Reset visual feedback (nếu trước đó bị đỏ/cam)
              targetInput.style.backgroundColor = "";

              lastAutoSavedValue = currentValue; // Cập nhật giá trị mới nhất để so sánh lần sau

              // Chỉ bấm nút Lưu nếu có cờ autoSave
              if (order.autoSave) {
                console.log("[GiaoTich] Auto Save is ON. Clicking save in 500ms...");
                setTimeout(() => {
                  const saveBtn = document.querySelector(saveButtonSelector) as HTMLElement;
                  if (saveBtn) {
                    saveBtn.click();
                    console.log("[GiaoTich] ✅ Auto Saved!");

                    // Visual feedback
                    const gocElement = document.getElementById(CUSTOM_GOC_ID);
                    if (gocElement) {
                      gocElement.innerHTML += ' <span style="color: green; font-weight: bold;">(Đã lưu tự động)</span>';
                    }
                  }
                }, 500);
              }

            } else {
              // TRƯỜNG HỢP LỖI (Value không đổi hoặc rỗng)
              // Chạy cảnh báo cho cả trường hợp AutoSave và Manual
              console.warn("[GiaoTich] ❌ Value unchanged or empty. Warning user.");

              // Thay vì displayWarning, đổi màu nền input thành CAM
              targetInput.style.backgroundColor = "orange";

              // Nếu muốn vẫn log ra console hoặc toast nhẹ (tuỳ chọn)
              // displayWarning("Địa chỉ tự động không thay đổi hãy chú ý"); 
            }
          } else {
            console.warn(`[GiaoTich] Target input for validation not found. Selector: ${targetInputSelector}`);
          }
        }, 800); // Delay chờ Portal tính toán/load lại data

        sendResponse({ status: "success" });
      } catch (e: any) {
        console.error("[GiaoTich] Error filling form:", e);
        sendResponse({ status: "error", message: e.message });
      }
      return true;
    }
  });
}

/**
 * Monitor parcelIndex input để tự động chuyển ảnh khi hoàn thành đơn
 */
function monitorParcelIndex(): void {
  // 1. QUAN TRỌNG: Dọn dẹp Observer cũ nếu tồn tại trước khi tạo mới
  if ((window as any)._parcelIndexObserver) {
    console.log("[GiaoTich] Disconnecting existing observer before creating new one.");
    (window as any)._parcelIndexObserver.disconnect();
    (window as any)._parcelIndexObserver = null;
  }

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

  // Hàm xử lý logic kiểm tra thay đổi
  const handleChange = (source: string) => {
    const currentValue = parseInt(parcelIndexInput.value) || 0;

    // Chỉ xử lý khi giá trị TĂNG lên (đơn hàng mới)
    if (currentValue > lastParcelIndexValue) {
      console.log(`[GiaoTich] 📈 parcelIndex increased (${source}): ${lastParcelIndexValue} → ${currentValue}`);
      lastParcelIndexValue = currentValue; // Cập nhật ngay lập tức để chặn các event trùng lặp tiếp theo
      requestNextImage();
    } else if (currentValue !== lastParcelIndexValue) {
      // Cập nhật giá trị mới nếu nó khác (vd: reset về 0) nhưng không trigger next
      // console.log(`[GiaoTich] parcelIndex changed but not increased: ${lastParcelIndexValue} → ${currentValue}`);
      lastParcelIndexValue = currentValue;
    }
  };

  // Observer để theo dõi thay đổi value attribute
  const observer = new MutationObserver(() => handleChange('MutationObserver'));

  // Observe attributes thay đổi
  observer.observe(parcelIndexInput, {
    attributes: true,
    attributeFilter: ['value']
  });

  // Cũng listen cho input event (React controlled inputs)
  // Lưu ý: Đặt tên hàm listener để có thể remove sau này nếu cần
  const inputListener = () => handleChange('InputEvent');
  parcelIndexInput.addEventListener('input', inputListener);

  // Store observer và cleanup function vào global để dọn dẹp sau
  (window as any)._parcelIndexObserver = observer;

  // Lưu reference tới element và listener để removeEvent khi deactivate
  (window as any)._parcelInputRef = parcelIndexInput;
  (window as any)._parcelInputListener = inputListener;
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

    // --- THÊM: Xóa trạng thái mở trong session ---
    sessionStorage.removeItem('VNPOST_SIDEPANEL_OPEN_STATE');

    return;
  }

  // 3. NẾU CHƯA CÓ -> BẬT
  injectCssFix();
  const container = createSidePanelContainer();
  document.body.appendChild(container);

  // Khởi động Observer để đồng bộ menu React
  initMenuObserver();

  // --- THÊM: Lưu trạng thái mở vào session ---
  sessionStorage.setItem('VNPOST_SIDEPANEL_OPEN_STATE', 'true');
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
function setChiDanPhat(infoText?: string): void {
  var phoneSender = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-2 > div > div > div > div > div:nth-child(2)");
  if (phoneSender) {
    if (phoneSender.textContent?.includes("2412279") || phoneSender.textContent?.includes("2412278") || phoneSender.textContent?.includes("6576671")) {
      var info1 = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(5) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-8 > textarea") as HTMLTextAreaElement;
      if (info1) {
        // nếu info trống
        if (info1.value.trim() === "") {
          if (infoText && infoText.trim() !== "") {
            info1.value = infoText;
          } else
            info1.value = `Cho xem hàng.
KH TỪ CHỐI lhe ngay shop  tại nhà KH để xử lý không mang về BCP mới xử lý  Shop sẽ không đồng ý yc bồi thường 100% giá trị`;
          info1.dispatchEvent(new Event('input', { bubbles: true }));
          info1.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }

    }
  }
}

async function handleTabKey(e: KeyboardEvent, ele: HTMLInputElement, eleId: string): Promise<void> {
  switch (eleId) {
    case ELEMENT_IDS.RECEIVER_NAME:
      setChiDanPhat();

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
      setChiDanPhat();
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
      setChiDanPhat();
      var phoneSender = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-2 > div > div > div > div > div:nth-child(2)");
      if (phoneSender && phoneSender.textContent?.includes("14159")) {
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
      setChiDanPhat();
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
  // ========================================================================
  // BẮT TÍN HIỆU GÕ TẮT & XỬ LÝ NHIỀU KẾT QUẢ TRÙNG LẶP
  // ========================================================================
  const quickTypeMatch = inputText.match(/^(.*?)\s{2,}([a-zA-Z\s]+)$/);

  if (quickTypeMatch) {
    const prefix = quickTypeMatch[1];
    const query = quickTypeMatch[2].trim().toLowerCase();
    const queryWords = query.split(' ');

    if ((queryWords.length === 2 || queryWords.length === 3) && abbreviationDict[query]) {
      const matches = abbreviationDict[query];

      // Trích xuất phần text đứng trước từ viết tắt để hiển thị mờ cho khớp vị trí
      multiMatchGhostPrefix = inputText.substring(0, inputText.lastIndexOf(quickTypeMatch[2]));
      multiMatchRealPrefix = prefix;

      if (matches.length === 1) {
        // TRƯỜNG HỢP 1 KẾT QUẢ: Hiển thị như bình thường
        multiMatchSuggestions = [];
        const suggestionSuffix = matches[0];

        // SỬA LỖI ĐÈ CHỮ Ở ĐÂY: Nối chuỗi gợi ý bằng mũi tên " ➔ "
        ghost.value = inputText + " ➔ " + suggestionSuffix;
        currentSuggestion = multiMatchRealPrefix + " " + suggestionSuffix;
        return;
      }
      else if (matches.length > 1) {
        // TRƯỜNG HỢP NHIỀU KẾT QUẢ: Hiển thị kết quả đầu tiên + Hint báo hiệu có thể cuộn
        multiMatchSuggestions = matches;
        multiMatchIndex = 0; // Bắt đầu ở vị trí 0

        const suggestionSuffix = matches[0];

        // SỬA LỖI ĐÈ CHỮ Ở ĐÂY: Nối chuỗi gợi ý bằng mũi tên " ➔ "
        ghost.value = inputText + " ➔ " + suggestionSuffix + ` [1/${matches.length} ↕]`;

        // Chuỗi thực tế khi bấm Tab (KHÔNG chứa phần hint)
        currentSuggestion = multiMatchRealPrefix + " " + suggestionSuffix;
        return;
      }
    }
  }

  // NẾU KHÔNG KHỚP QUICK TYPE -> Reset các biến cuộn
  multiMatchSuggestions = [];
  // ========================================================================
  // KẾT THÚC LOGIC GÕ TẮT
  // ========================================================================
  const trimmedInput = inputText.trim();
  const normalizedInput = normalizeText(trimmedInput);

  let bestMatchItem: any = null;
  let matchedLevel: string | null = null;
  let highestScore = -1;
  let matchedOriginalString = "";

  // VÒNG LẶP ĐÃ ĐƯỢC TỐI ƯU
  for (let i = 0; i < addressData.length; i++) {
    const item = addressData[i];
    const searchFields = item.precomputedSearchFields; // Lấy mảng đã tính sẵn

    for (let j = 0; j < searchFields.length; j++) {
      const field = searchFields[j];

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

          // Tránh gọi normalizeText nhiều lần, kiểm tra trước
          const cleanRemaining = remainingInput.trim().replace(/^,?\s*/, "");
          if (cleanRemaining) {
            const normalizedRemainingInput = normalizeText(cleanRemaining);

            let nextLevelNormalized = "";
            if (field.level === "Thon") nextLevelNormalized = item.NameXPKD; // Đã chuẩn hóa
            else if (field.level === "XP") nextLevelNormalized = item.NameQHKD;
            else if (field.level === "QH") nextLevelNormalized = item.NameTTPKD;

            if (nextLevelNormalized && normalizeText(nextLevelNormalized).startsWith(normalizedRemainingInput)) {
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

  // Remove event listener thủ công
  if ((window as any)._parcelInputRef && (window as any)._parcelInputListener) {
    (window as any)._parcelInputRef.removeEventListener('input', (window as any)._parcelInputListener);
    (window as any)._parcelInputRef = null;
    (window as any)._parcelInputListener = null;
  }

  // Reset lastParcelIndexValue
  lastParcelIndexValue = -1;
  // Clear timer
  if (requestNextImageTimer) clearTimeout(requestNextImageTimer);
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
  listenForFillForm();

  // Load localStorage settings nếu cần (hiện tại không dùng)
  // const storedUpperCase = localStorage.getItem(STORAGE_KEYS.IS_UPERCASE);
  // const storedFullText = localStorage.getItem(STORAGE_KEYS.IS_FULL_TEXT_ADDRESS);

  chrome.storage.local.get(STORAGE_KEYS.KHOI_LUONG, (result) => {
    isSaveKhoiLuong = result[STORAGE_KEYS.KHOI_LUONG] === "yes" ? "yes" : "no";
  });

  // =================================================================
  // LẮNG NGHE SỰ KIỆN KHI NGƯỜI DÙNG NHẬP TIỀN VÀO #PROP0018
  // Dùng Focusout (khi click ra ngoài) và Change
  // =================================================================
  document.body.addEventListener('focusout', (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.id === 'PROP0018') {
      saveRecentCodValue(target.value);
    }
  });

  document.body.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.id === 'PROP0018') {
      saveRecentCodValue(target.value);
    }
  });

  try {
    const response = await fetch(chrome.runtime.getURL("/tree_data.json"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data && data.QuocGiaTree) {
      // Gọi hàm giải nén và tạo từ điển
      processTreeData(data.QuocGiaTree);
    } else {
      console.error("[GiaoTich] Invalid tree data format.");
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
  try {
    const result = await new Promise<any>(resolve =>
      chrome.storage.local.get(["keepSidePanelOpen"], resolve)
    );

    const wasOpen = sessionStorage.getItem('VNPOST_SIDEPANEL_OPEN_STATE') === 'true';
    const shouldKeepOpen = result.keepSidePanelOpen === true;

    // Chỉ mở lại nếu: User bật setting VÀ trước đó panel đang mở
    if (shouldKeepOpen && wasOpen) {
      console.log("[GiaoTich] 🔄 Auto-reopening Side Panel (Keep Tab active)");
      // Kiểm tra xem đã mở chưa để tránh mở trùng (dù toggleSidePanel đã check nhưng cẩn thận hơn)
      if (!document.getElementById(SIDE_PANEL_ID)) {
        toggleSidePanel();
      }
    }
  } catch (e) {
    console.error("[GiaoTich] Lỗi auto-reopen sidepanel:", e);
  }
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
    ghostInput.style.setProperty("color", "#999", "important");

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

  const debouncedFindSuggestions = debounce(findSuggestions, 200);
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

    // ========================================================================
    // 1. XỬ LÝ PHÍM LÊN/XUỐNG CHO DANH SÁCH GỢI Ý TRÙNG LẶP
    // ========================================================================
    if (multiMatchSuggestions.length > 1 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault(); // Ngăn con trỏ nhảy về đầu/cuối của ô input

      // Tính toán vị trí mới
      if (event.key === "ArrowDown") {
        multiMatchIndex = (multiMatchIndex + 1) % multiMatchSuggestions.length;
      } else if (event.key === "ArrowUp") {
        multiMatchIndex = (multiMatchIndex - 1 + multiMatchSuggestions.length) % multiMatchSuggestions.length;
      }

      const suggestionSuffix = multiMatchSuggestions[multiMatchIndex];

      // SỬA LỖI ĐÈ CHỮ Ở ĐÂY: Dùng receiverAddressInput.value nối với mũi tên
      currentGhost.value = receiverAddressInput.value + " ➔ " + suggestionSuffix + `[${multiMatchIndex + 1}/${multiMatchSuggestions.length} ↕]`;

      // Cập nhật lại kết quả chuẩn để chốt khi bấm Tab
      currentSuggestion = multiMatchRealPrefix + " " + suggestionSuffix;

      return; // Dừng tại đây, không xử lý các phím khác
    }

    // ========================================================================
    // 2. XỬ LÝ PHÍM TAB HOẶC ARROW RIGHT ĐỂ CHỐT GỢI Ý
    // ========================================================================
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
      multiMatchSuggestions = []; // Chốt xong thì xóa danh sách cuộn
      isTabed = true;
    }
    // ========================================================================
    // 3. XÓA GỢI Ý MỜ NẾU BẤM CÁC PHÍM ĐIỀU HƯỚNG KHÁC HOẶC XÓA CHỮ
    // ========================================================================
    else if (["ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Backspace", "Delete"].includes(event.key)) {
      if (currentGhost) currentGhost.value = "";
      currentSuggestion = null;
      multiMatchSuggestions = []; // Thoát ra thì xóa danh sách cuộn
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
/**
 * Hàm điền địa chỉ và mô phỏng nhấn phím Enter để kích hoạt logic của trang web
 */
function fillCorrectedAddress(newAddress: string) {
  const addressInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;

  if (addressInput) {
    // 1. Gán giá trị AI đã sửa vào ô input
    addressInput.value = newAddress;

    // 2. Kích hoạt sự kiện để React/Ant Design cập nhật State dữ liệu
    const inputEvents = ['input', 'change'];
    inputEvents.forEach(evtName => {
      addressInput.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
    });


    addressInput.focus();
    var find = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(5) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(4)")
    if (find) {
      (find as HTMLButtonElement).click();
    }


    // 5. Hiệu ứng nháy xanh để thông báo
    addressInput.style.transition = "background-color 0.3s";
    addressInput.style.backgroundColor = "#e6f7ff";
    setTimeout(() => {
      addressInput.style.backgroundColor = "transparent";
    }, 1000);

    console.log("[GiaoTich] AI filled address and triggered Enter logic.");
  }
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
              injectAIButton();
            } else if (el.querySelector) {
              const receiverInput = el.querySelector("#" + ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement;
              if (receiverInput) {
                console.log("[GiaoTich] Phát hiện #receiverAddress bên trong node được thêm:", receiverInput);
                attachListenersToInput(receiverInput);
                injectAIButton();
              }
            }

            injectRecentCodUI();
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
    injectAIButton();
  }
  injectRecentCodUI();
}

// ==========================================================================
// Điểm bắt đầu thực thi
// ==========================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// ==========================================================================
// CÁC BIẾN HỖ TRỢ CUỘN NHIỀU GỢI Ý KHI BỊ TRÙNG LẶP (ARROW UP / DOWN)
// ==========================================================================
let multiMatchSuggestions: string[] = [];
let multiMatchIndex: number = -1;
let multiMatchGhostPrefix: string = ""; // VD: "12 nguyễn văn trỗi  " (chứa dấu cách để hiển thị mờ đè lên chữ)
let multiMatchRealPrefix: string = "";  // VD: "12 nguyễn văn trỗi" (để gán vào value thật khi ấn Tab)


// ==========================================================================
// TÍNH NĂNG GÕ TẮT & GIẢI NÉN TREE DATA
// ==========================================================================
let abbreviationDict: Record<string, string[]> = {};

function processTreeData(treeData: any) {
  abbreviationDict = {};
  addressData = [];

  for (const ttpName in treeData) {
    const ttpData = treeData[ttpName];

    for (const qhName in ttpData.Districts) {
      const qhData = ttpData.Districts[qhName];

      for (const ward of qhData.Wards) {

        // 1. Tạo chuỗi địa chỉ đầy đủ
        const fullAddress = `${ward.Name}, ${qhName}, ${ttpName}`;

        // 2. Tạo CÁC combo gõ tắt
        // Combo 2 từ: Xã + Tỉnh (VD: "tb hn") -> Dành cho những xã có tên độc lạ
        const combo2 = `${ward.Init} ${ttpData.Init}`;

        // Combo 3 từ: Xã + Huyện + Tỉnh (VD: "tb bd hn") -> Độ chính xác 99.9%
        const combo3 = `${ward.Init} ${qhData.Init} ${ttpData.Init}`;

        // Lưu vào từ điển
        if (!abbreviationDict[combo2]) abbreviationDict[combo2] = [];
        if (!abbreviationDict[combo2].includes(fullAddress)) abbreviationDict[combo2].push(fullAddress);

        if (!abbreviationDict[combo3]) abbreviationDict[combo3] = [];
        if (!abbreviationDict[combo3].includes(fullAddress)) abbreviationDict[combo3].push(fullAddress);
        // TÍNH TOÁN SẴN SEARCH FIELDS TẠI ĐÂY
        const searchFields: any[] = [];
        if (ward.ThonKhuPho) { // Lưu ý: File JSON của bạn phải có mảng này
          for (const thon of ward.ThonKhuPho) {
            searchFields.push({
              name: thon.Name,
              normalized: normalizeText(thon.NameKD || thon.Name),
              weight: 4,
              level: "Thon",
              originalThonName: thon.Name,
            });
          }
        }

        searchFields.push({
          name: ward.N,
          normalized: normalizeText(ward.KD || ward.N),
          weight: 3,
          level: "XP",
        });
        searchFields.push({
          name: qhData.N,
          normalized: normalizeText(qhData.KD || qhData.N),
          weight: 2,
          level: "QH",
        });
        searchFields.push({
          name: ttpData.N,
          normalized: normalizeText(ttpData.KD || ttpData.N),
          weight: 1,
          level: "TTP",
        });

        // 3. Đẩy vào addressData kèm searchFields đã được compile
        addressData.push({
          NameTTP: ttpName,
          NameTTPN: ttpData.N,
          NameTTPKD: ttpData.KD,

          NameQH: qhName,
          NameQHN: qhData.N,
          NameQHKD: qhData.KD,

          NameXP: ward.Name,
          NameXPN: ward.N,
          NameXPKD: ward.KD,

          precomputedSearchFields: searchFields // LƯU LẠI ĐỂ DÙNG TRONG findSuggestions
        });
      }
    }
  }
  console.log(`[GiaoTich] Đã nạp ${addressData.length} xã/phường.`);
}
// ==========================================================================
// State cho tính năng nút COD gần đây
// ==========================================================================
const STORAGE_KEY_RECENT_COD = "vnpost_recent_cod_values";
const STORAGE_KEY_SHOW_COD = "vnpost_show_cod_btns";

// Lấy danh sách từ localStorage (nếu có)
let recentCodValues: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT_COD) || "[]");
let isShowRecentCodButtons: boolean = localStorage.getItem(STORAGE_KEY_SHOW_COD) === "true";
/**
 * Lưu giá trị COD mới vào mảng và LocalStorage
 */
function saveRecentCodValue(value: string) {
  const valStr = value.replace(/\./g, "").trim(); // Loại bỏ dấu chấm ngàn nếu có
  if (!valStr || valStr === "0") return;

  // Nếu đã tồn tại thì xóa cái cũ đi để đưa lên đầu
  const index = recentCodValues.indexOf(valStr);
  if (index > -1) {
    recentCodValues.splice(index, 1);
  }

  recentCodValues.unshift(valStr); // Thêm vào đầu
  if (recentCodValues.length > 4) {
    recentCodValues.pop(); // Giữ tối đa 4 phần tử
  }

  localStorage.setItem(STORAGE_KEY_RECENT_COD, JSON.stringify(recentCodValues));
  renderCodButtons(); // Cập nhật lại UI
}
/**
 * Điền giá trị vào #PROP0018 thông qua việc mở modal GTG021 và click OK
 */
async function fillCodAndSubmit(value: string) {
  // 1. Mở popup GTG021 (COD)
  let clicked = false;
  const buttons = document.querySelectorAll('.rt-tbody button.btn-link');
  
  for (const button of Array.from(buttons)) {
    if (button.textContent?.trim() === 'GTG021') {
      const row = button.closest('.rt-tr-group');
      if (row) {
        const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
        if (checkbox && !checkbox.disabled) {
          if (!checkbox.checked) {
            checkbox.click();
            console.log('[GiaoTich] Đã tự động check dịch vụ GTG021 (COD)');
            clicked = true;
          } else {
            console.log('[GiaoTich] Checkbox GTG021 đã checked, sẽ uncheck và check lại để refresh');
            checkbox.click();
            console.log('[GiaoTich] Đã uncheck GTG021');
            
            await delay(300); // Tạm dừng 300ms chờ DOM update
            
            const buttonsRefresh = document.querySelectorAll('.rt-tbody button.btn-link');
            for (const btn of Array.from(buttonsRefresh)) {
              if (btn.textContent?.trim() === 'GTG021') {
                const rowRefresh = btn.closest('.rt-tr-group');
                if (rowRefresh) {
                  const checkboxRefresh = rowRefresh.querySelector('input[type="checkbox"]') as HTMLInputElement;
                  if (checkboxRefresh && !checkboxRefresh.disabled && !checkboxRefresh.checked) {
                    checkboxRefresh.click();
                    console.log('[GiaoTich] ✅ Đã check lại GTG021 sau khi refresh');
                  }
                }
              }
            }
            clicked = true;
          }
        }
      }
    }
  }

  if (!clicked) {
    console.warn("[GiaoTich] Không tìm thấy checkbox GTG021.");
    return;
  }

  // 2. Chờ popup xuất hiện (có chứa ô #PROP0018)
  let codInput: HTMLInputElement | null = null;
  for (let i = 0; i < 20; i++) { // Chờ tối đa 2 giây (20 * 100ms)
    await delay(100);
    codInput = document.getElementById('PROP0018') as HTMLInputElement;
    if (codInput) break; // Nếu tìm thấy ô input thì thoát vòng lặp chờ
  }

  if (!codInput) {
    console.warn("[GiaoTich] Không tìm thấy ô #PROP0018 sau khi check GTG021.");
    return;
  }

  // 3. Format lại và Điền số tiền
  const formattedValue = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(codInput, formattedValue);
  } else {
    codInput.value = formattedValue;
  }

  // Kích hoạt sự kiện để React nhận diện sự thay đổi
  codInput.dispatchEvent(new Event('input', { bubbles: true }));
  codInput.dispatchEvent(new Event('change', { bubbles: true }));

  // 4. Giả lập Enter (để validate dữ liệu nếu có)
  const enterEvent = new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
  });
  codInput.dispatchEvent(enterEvent);

  // 5. Bấm nút OK theo logic của bạn
  await delay(150); // Chờ 150ms để React cập nhật DOM an toàn sau sự kiện Enter
  
  const okButton = document.querySelector(ELEMENT_IDS.POPUP_VAS_OK_BUTTON_SELECTOR) as HTMLElement | null;
  if (okButton) {
    okButton.click();
    console.log(`[GiaoTich] Đã tự động điền ${formattedValue} và ấn OK.`);
  } else {
    console.warn("[GiaoTich] Không tìm thấy nút OK của popup.");
  }
}
/**
 * Render 4 nút COD vào giao diện (Đã fix layout đều và đẹp)
 */
function renderCodButtons() {
  const buttonsArea = document.getElementById('recent-cod-buttons-area');
  if (!buttonsArea) return;

  buttonsArea.innerHTML = '';
  recentCodValues.forEach(val => {
    const formattedVal = val.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");

    const btn = document.createElement('button');
    btn.type = "button";
    btn.className = "modern-cod-btn";

    // Style hiện đại, fix bố cục chiều rộng 100%
    Object.assign(btn.style, {
      width: "100%",                // Chiều rộng tràn hết container để các nút bằng nhau
      boxSizing: "border-box",      // Không bị tràn lề khi có padding
      fontSize: "13px",
      fontWeight: "600",
      padding: "6px 8px",           // Thu gọn padding ngang một chút
      margin: "0",                  // BỎ MARGIN (đã dùng gap ở parent)
      borderRadius: "6px",
      backgroundColor: "#F0F8FF",
      border: "1px solid #BFE0FF",
      color: "#0056B3",
      cursor: "pointer",
      transition: "all 0.2s ease",
      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",     // Căn giữa chữ
      whiteSpace: "nowrap"          // Không bị xuống dòng chữ
    });

    // Hover effect: Sáng lên và nhô lên nhẹ
    btn.onmouseover = () => {
      btn.style.backgroundColor = "#D9EFFF";
      btn.style.borderColor = "#80C4FF";
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 3px 6px rgba(0,0,0,0.08)";
    };

    // Bỏ Hover: Trở về ban đầu
    btn.onmouseout = () => {
      btn.style.backgroundColor = "#F0F8FF";
      btn.style.borderColor = "#BFE0FF";
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
    };

    // Active effect: Hiệu ứng lún xuống khi click
    btn.onmousedown = () => {
      btn.style.transform = "scale(0.96)";
    };
    btn.onmouseup = () => {
      btn.style.transform = "translateY(-1px)";
    };

    btn.innerText = formattedVal + ' ₫';

    // Hành động khi click
    btn.onclick = (e) => {
      e.preventDefault();
      fillCodAndSubmit(val);
    };

    buttonsArea.appendChild(btn);
  });
}
/**
 * Chèn UI vào cạnh Textarea "Nội dung BG" (Đã fix Flexbox)
 */
function injectRecentCodUI() {
  const contentNoteTextarea = document.querySelector('textarea[name="contentNote"]') as HTMLTextAreaElement;
  if (!contentNoteTextarea || document.getElementById('recent-cod-container')) return;

  const parentContainer = contentNoteTextarea.parentElement;
  if (!parentContainer) return;

  // Biến cha thành flexbox để xếp ngang
  parentContainer.style.display = "flex";
  parentContainer.style.gap = "12px"; // Tăng khoảng cách giữa input text và cột nút COD cho thoáng
  parentContainer.style.alignItems = "flex-start";
  contentNoteTextarea.style.flex = "1"; // Để textarea chiếm phần không gian còn lại

  // Tạo Container chứa UI
  const container = document.createElement('div');
  container.id = 'recent-cod-container';
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "0px"; // Khoảng cách giữa Text Checkbox và Cột Nút
  container.style.width = "400px"; // Cố định chiều rộng cột
  container.style.flexShrink = "0"; // QUAN TRỌNG: Ngăn không cho cột này bị ép nhỏ lại

  // Render Checkbox
  const checkboxWrapper = document.createElement('div');
  checkboxWrapper.innerHTML = `
    <label style="font-size: 11.5px; display: flex; align-items: center; gap: 0px; cursor: pointer; color: #d48806; font-weight: bold; user-select: none;">
      <input type="checkbox" id="toggle-recent-cod" ${isShowRecentCodButtons ? 'checked' : ''} style="cursor: pointer;" />
      Lịch sử tiền COD
    </label>
  `;
  container.appendChild(checkboxWrapper);

  // Render khu vực chứa Buttons
  const buttonsArea = document.createElement('div');
  buttonsArea.id = 'recent-cod-buttons-area';
  buttonsArea.style.display = isShowRecentCodButtons ? "flex" : "none";
  buttonsArea.style.flexDirection = "row"; // QUAN TRỌNG: Ép các nút xếp dọc 
  buttonsArea.style.gap = "6px"; // Khoảng cách đều đặn 6px giữa các nút
  container.appendChild(buttonsArea);

  // Gắn sự kiện cho Checkbox
  const checkbox = checkboxWrapper.querySelector('#toggle-recent-cod') as HTMLInputElement;
  checkbox.addEventListener('change', (e) => {
    isShowRecentCodButtons = (e.target as HTMLInputElement).checked;
    localStorage.setItem(STORAGE_KEY_SHOW_COD, isShowRecentCodButtons.toString());
    buttonsArea.style.display = isShowRecentCodButtons ? "flex" : "none";
  });

  parentContainer.appendChild(container);

  // Render các nút ban đầu
  renderCodButtons();
}
