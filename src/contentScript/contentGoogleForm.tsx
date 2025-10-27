// Content script for Google Forms auto-fill
console.log("Google Forms content script loaded");

// Helper function to wait for element
function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

// Helper function to set input value and trigger events
function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Trigger events
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

// Helper function to select dropdown option by value
async function selectDropdownOption(dropdownSelector: string, optionValue: string) {
  const dropdown = await waitForElement(dropdownSelector);
  
  // Click to open dropdown
  console.log("Clicking dropdown to open...");
  (dropdown as HTMLElement).click();
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Find and click the option with matching data-value
  const optionSelector = `div.MocG8c[data-value="${optionValue}"]`;
  console.log("Looking for option:", optionSelector);
  const option = await waitForElement(optionSelector);
  console.log("Found option, clicking...");
  
  // Scroll into view if needed
  (option as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  
  // Trigger multiple events like a real user click
  const optionElement = option as HTMLElement;
  
  // MouseDown event
  optionElement.dispatchEvent(new MouseEvent('mousedown', { 
    bubbles: true, 
    cancelable: true, 
    view: window 
  }));
  
  await new Promise((resolve) => setTimeout(resolve, 50));
  
  // Click event
  optionElement.click();
  
  await new Promise((resolve) => setTimeout(resolve, 50));
  
  // MouseUp event
  optionElement.dispatchEvent(new MouseEvent('mouseup', { 
    bubbles: true, 
    cancelable: true, 
    view: window 
  }));
  
  console.log("Clicked option with full events:", optionValue);
  
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// Helper function to get current date in required format
function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper function to select radio button by value
async function selectRadioButton(radioValue: string) {
  try {
    console.log("Looking for radio button with value:", radioValue);
    
    // Find radio button with matching data-value
    const radioSelector = `div[role="radio"][data-value="${radioValue}"]`;
    const radioButton = await waitForElement(radioSelector);
    
    console.log("Found radio button, clicking...");
    
    // Click the radio button
    const radioElement = radioButton as HTMLElement;
    
    // Trigger full click events
    radioElement.dispatchEvent(new MouseEvent('mousedown', { 
      bubbles: true, 
      cancelable: true, 
      view: window 
    }));
    
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    radioElement.click();
    
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    radioElement.dispatchEvent(new MouseEvent('mouseup', { 
      bubbles: true, 
      cancelable: true, 
      view: window 
    }));
    
    console.log("Selected radio button:", radioValue);
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    return true;
  } catch (error) {
    console.error("Error selecting radio button:", error);
    return false;
  }
}

// Detect which page we're on
function detectFormPage(): 'page1' | 'page2' | 'page3' | 'page4' | 'page5' | 'unknown' {
  // Check pageHistory hidden input to determine which page we're on
  const pageHistory = document.querySelector('input[name="pageHistory"]') as HTMLInputElement;
  const pageHistoryValue = pageHistory?.value || '';
  
  console.log("Page history:", pageHistoryValue);
  
  // Page 1: pageHistory = "0"
  // Page 2: pageHistory = "0,1"  
  // Page 3: pageHistory = "0,1,2" (LLBH chuyên sâu path)
  // Page 4: pageHistory = "0,1,2,4" (LLBH tuyến đầu path - skips page 3)
  // Page 5: pageHistory = "0,1,2,4,5" (BÁO CÁO DOANH THU PPBL)
  
  if (pageHistoryValue === "0,1,2,4,5") {
    console.log("Detected: Page 5 (pageHistory = 0,1,2,4,5) - BÁO CÁO DOANH THU PPBL");
    return 'page5';
  } else if (pageHistoryValue === "0,1,2,4") {
    console.log("Detected: Page 4 (pageHistory = 0,1,2,4) - BÁO CÁO DỊCH VỤ TCBC");
    return 'page4';
  } else if (pageHistoryValue === "0,1,2") {
    console.log("Detected: Page 3 (pageHistory = 0,1,2)");
    return 'page3';
  } else if (pageHistoryValue === "0,1") {
    console.log("Detected: Page 2 (pageHistory = 0,1)");
    return 'page2';
  } else if (pageHistoryValue === "0" || !pageHistoryValue) {
    console.log("Detected: Page 1 (pageHistory = 0 or empty)");
    return 'page1';
  }
  
  console.log("Detected: Unknown page");
  return 'unknown';
}

// Function to fill Page 1
async function fillPage1(hrmCode: string, fullName: string, date?: string) {
  try {
    console.log("Starting Page 1 fill with:", { hrmCode, fullName, date });

    // 1. Fill "Mã HRM" field (entry.1480053906)
    const hrmInput = await waitForElement('input[aria-labelledby*="i6"]') as HTMLInputElement;
    setInputValue(hrmInput, hrmCode);
    console.log("Filled Mã HRM:", hrmCode);

    // 2. Fill "Họ và Tên" field (entry.1687851615)
    const nameInput = await waitForElement('input[aria-labelledby*="i11"]') as HTMLInputElement;
    setInputValue(nameInput, fullName);
    console.log("Filled Họ và Tên:", fullName);

    // 3. Fill "Báo cáo DT/DS ngày" field with provided date or current date (entry.729580960)
    const dateInput = await waitForElement('input[type="date"]') as HTMLInputElement;
    const dateToUse = date || getCurrentDate();
    setInputValue(dateInput, dateToUse);
    console.log("Filled Báo cáo DT/DS ngày:", dateToUse);

    // Wait a bit to ensure all fields are filled
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. Click "Tiếp" (Next) button
    const nextButton = await waitForElement('div[role="button"][jsname="OCpkoe"]');
    (nextButton as HTMLElement).click();
    console.log("Clicked Tiếp button - Page will reload to Page 2");

    return { success: true };
  } catch (error: any) {
    console.error("Error filling Page 1:", error);
    return { success: false, error: error.message };
  }
}

// Function to fill Page 2
async function fillPage2() {
  try {
    console.log("Starting Page 2 fill...");
    
    // Wait for the page to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Select "LLBH tuyến đầu (GDV, VHX)" radio button
    const radioSelected = await selectRadioButton("LLBH tuyến đầu (GDV, VHX)");
    
    if (!radioSelected) {
      throw new Error("Failed to select radio button");
    }
    
    console.log("Selected: LLBH tuyến đầu (GDV, VHX)");
    
    // Wait a bit before clicking next
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Click "Tiếp" button
    const nextButton = await waitForElement('div[role="button"][jsname="OCpkoe"]');
    (nextButton as HTMLElement).click();
    console.log("Clicked Tiếp button on Page 2");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error filling Page 2:", error);
    return { success: false, error: error.message };
  }
}

// Function to fill Page 3
async function fillPage3() {
  try {
    console.log("Starting Page 3 fill...");
    
    // Wait for the page to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Fill "Số KH_GDV,VHX" field with "0" (entry.1485764740)
    const soKhInput = await waitForElement('input[aria-labelledby*="i1"]') as HTMLInputElement;
    setInputValue(soKhInput, "0");
    console.log("Filled Số KH_GDV,VHX: 0");
    
    // Fill "DT (triệu)_GDV,VHX" field with "0" (entry.998273080)
    const dtInput = await waitForElement('input[aria-labelledby*="i6"]') as HTMLInputElement;
    setInputValue(dtInput, "0");
    console.log("Filled DT (triệu)_GDV,VHX: 0");
    
    // Wait a bit before clicking next
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Click "Tiếp" button
    const nextButton = await waitForElement('div[role="button"][jsname="OCpkoe"]');
    (nextButton as HTMLElement).click();
    console.log("Clicked Tiếp button on Page 3");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error filling Page 3:", error);
    return { success: false, error: error.message };
  }
}

// Function to fill Page 4 - BÁO CÁO DỊCH VỤ TCBC (12 fields, all with "0")
async function fillPage4() {
  try {
    console.log("Starting Page 4 fill (BÁO CÁO DỊCH VỤ TCBC)...");
    
    // Wait for the page to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Fill all 12 input fields with "0"
    // The fields are labeled from i1 to i56 (increments of 5: i1, i6, i11, i16, i21, i26, i31, i36, i41, i46, i51, i56)
    const fieldSelectors = [
      'input[aria-labelledby*="i1"]',   // Số KH tương tác TKBĐ
      'input[aria-labelledby*="i6"]',   // Số dư TKBĐ
      'input[aria-labelledby*="i11"]',  // Số KH tương tác cho Vay
      'input[aria-labelledby*="i16"]',  // Số tiền cho Vay
      'input[aria-labelledby*="i21"]',  // SL mở TKNH
      'input[aria-labelledby*="i26"]',  // SL BHXM
      'input[aria-labelledby*="i31"]',  // SL BHOT
      'input[aria-labelledby*="i36"]',  // Số phí BHOT
      'input[aria-labelledby*="i41"]',  // SL BH tại nạn HGĐ
      'input[aria-labelledby*="i46"]',  // Số phí các bảo hiểm khác
      'input[aria-labelledby*="i51"]',  // Số phí thu BHXH
      'input[aria-labelledby*="i56"]',  // Số phí thu BHYT
    ];
    
    // Fill each field with "0"
    for (let i = 0; i < fieldSelectors.length; i++) {
      const input = await waitForElement(fieldSelectors[i]) as HTMLInputElement;
      setInputValue(input, "0");
      console.log(`Filled field ${i + 1}/12: 0`);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between fields
    }
    
    console.log("All 12 fields filled with 0");
    
    // Wait a bit before clicking next
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Click "Tiếp" button
    const nextButton = await waitForElement('div[role="button"][jsname="OCpkoe"]');
    (nextButton as HTMLElement).click();
    console.log("Clicked Tiếp button on Page 4");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error filling Page 4:", error);
    return { success: false, error: error.message };
  }
}

// Function to fill Page 5 - BÁO CÁO DOANH THU PPBL (2 fields, all with "0")
async function fillPage5() {
  try {
    console.log("Starting Page 5 fill (BÁO CÁO DOANH THU PPBL)...");
    
    // Wait for the page to be fully loaded
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Fill all 2 input fields with "0"
    // Based on the HTML: entry.1486278635 (i1) and entry.124592798 (i6)
    const fieldSelectors = [
      'input[aria-labelledby*="i1"]',   // Doanh số HTD bán lẻ (Triệu)
      'input[aria-labelledby*="i6"]',   // Doanh số hàng hóa khác (Triệu)
    ];
    
    // Fill each field with "0"
    for (let i = 0; i < fieldSelectors.length; i++) {
      const input = await waitForElement(fieldSelectors[i]) as HTMLInputElement;
      setInputValue(input, "0");
      console.log(`Filled field ${i + 1}/2: 0`);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between fields
    }
    
    console.log("All 2 fields filled with 0");
    
    // Wait a bit before clicking next
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Click "Tiếp" button
    const nextButton = await waitForElement('div[role="button"][jsname="OCpkoe"]');
    (nextButton as HTMLElement).click();
    console.log("Clicked Tiếp button on Page 5");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error filling Page 5:", error);
    return { success: false, error: error.message };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FILL_GOOGLE_FORM") {
    const { hrmCode, fullName, date } = message.payload;
    
    // Detect which page we're on
    const currentPage = detectFormPage();
    
    if (currentPage === 'page1') {
      // Fill page 1
      fillPage1(hrmCode, fullName, date)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          sendResponse({ success: false, error: error.message });
        });
    } else if (currentPage === 'page2') {
      // Fill page 2
      fillPage2()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          sendResponse({ success: false, error: error.message });
        });
    } else if (currentPage === 'page3') {
      // Fill page 3
      fillPage3()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          sendResponse({ success: false, error: error.message });
        });
    } else if (currentPage === 'page4') {
      // Fill page 4
      fillPage4()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          sendResponse({ success: false, error: error.message });
        });
    } else if (currentPage === 'page5') {
      // Fill page 5
      fillPage5()
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          sendResponse({ success: false, error: error.message });
        });
    } else {
      sendResponse({ 
        success: false, 
        error: "Cannot detect form page. Please make sure you're on a Google Forms page." 
      });
    }

    return true; // Keep the message channel open for async response
  }
});
