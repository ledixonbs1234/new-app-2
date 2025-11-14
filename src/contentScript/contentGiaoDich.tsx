/**
 * Content Script cho trang "Giao Dịch" - https://portalkhl.vnpost.vn/itemdetail/?hdrId=*
 * Chức năng: Tự động điền địa chỉ người nhận với gợi ý thông minh
 * 
 * Tránh conflict: Script này sẽ kiểm tra xem processSinglePortalItem đang chạy không
 * Nếu đang chạy, script này sẽ tạm dừng hoạt động
 */

// ==========================================================================
// Biến Toàn cục và Cấu hình
// ==========================================================================

let addressData: any[] = []; // Lưu trữ dữ liệu địa chỉ chính
let isSaveKhoiLuong = "";
let IsChooseSusget = false;
let PhoneNumber = "";
let Address = "";
let isProcessingPortalItem = false; // Cờ để kiểm tra processSinglePortalItem đang chạy

// ID của các element thường dùng
const ELEMENT_IDS = {
  RECEIVER_ADDRESS: "receiverAddress",
  RECEIVER_NAME: "receiverName",
  RECEIVER_PHONE: "receiverPhone",
  WEIGHT: "weight",
  TT_NUMBER: "ttNumber",
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

function monitorProcessingStatus(): void {
  // Lắng nghe tin nhắn từ contentScript.tsx để cập nhật trạng thái
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg.event === "CONTENT" && msg.message === "PROCESS_STATUS") {
      isProcessingPortalItem = msg.isProcessing;
      console.log("[GiaoTich] Processing status updated:", isProcessingPortalItem);
    }
  });
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
    }
  }
}

function handleTabKey(e: KeyboardEvent, ele: HTMLInputElement, eleId: string): void {
  switch (eleId) {
    case ELEMENT_IDS.RECEIVER_NAME:
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
      const receiverNameInput = document.getElementById(ELEMENT_IDS.RECEIVER_NAME) as HTMLInputElement;
      if (receiverNameInput) {
        receiverNameInput.focus();
        receiverNameInput.value = "";
      }
      e.preventDefault();
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
              if (checkbox && !checkbox.checked && !checkbox.disabled) {
                checkbox.click();
                console.log('[GiaoTich] Đã tự động check dịch vụ GTG021 (COD)');
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

async function initialize(): Promise<void> {
  console.log("[GiaoTich] Bắt đầu khởi tạo...");

  // Kiểm tra xem đây có phải trang itemdetail không
  if (!window.location.href.includes("itemdetail")) {
    console.log("[GiaoTich] Không phải trang itemdetail, dừng script");
    return;
  }

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
      observeDOMForAddressInput();
    } else {
      console.error("[GiaoTich] Invalid address data format.");
    }
  } catch (error) {
    console.error("[GiaoTich] Lỗi khi tải data.json:", error);
  }

  document.addEventListener("keydown", checkPress, false);
  monitorProcessingStatus();
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

  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
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
