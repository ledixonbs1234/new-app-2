import { Order } from "../popup/popup.slice";
import { delay, waitForElm } from "./utils";
function forceChange(e: HTMLInputElement) {
    e.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event("blur"));
}

/**
 * Handle adding batch rows to the table
 */
async function handleAddBatchRows(payload: { rowCount: number; content: string; weight: string }) {
    try {
        const { rowCount, content, weight } = payload;

        // Force focus on the page to ensure events are properly captured
        window.focus();
        document.body.focus();

        // Simulate a click on document to restore focus (this mimics user clicking on page)
        const clickEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        document.body.dispatchEvent(clickEvent);

        // Small delay to ensure focus is restored
        await delay(200);

        // Function to find the "Add" button based on button text "Thêm bưu gửi vào lô"
        const getAddButton = (): HTMLButtonElement | null => {
            // Find all buttons in the page
            const buttons = document.querySelectorAll('button');

            // Look for button with text "Thêm bưu gửi vào lô"
            for (const button of buttons) {
                if (button.textContent?.trim() === "Thêm bưu gửi vào lô") {
                    return button as HTMLButtonElement;
                }
            }

            return null;
        };

        // Find the "Add" button initially
        const addButton = getAddButton();
        if (!addButton) {
            return { success: false, error: "Không tìm thấy nút thêm dòng" };
        }
        // Add rows
        for (let i = 0; i < rowCount; i++) {
            // Get the button again in case position changed after adding row
            const currentAddButton = getAddButton();
            if (!currentAddButton) {
                return { success: false, error: `Không tìm thấy nút thêm dòng ở lần lặp ${i + 1}` };
            }

            // Click add button to create new row
            currentAddButton.click();

            // Wait for the row to be added
            await delay(400);

            // Find all rows in tbody
            const tbody = document.querySelector("#form-create-order > div.ant-row > div > div > div > div.ant-collapse-content.ant-collapse-content-active > div > div.ant-table-wrapper > div > div > div > div > div > table > tbody");

            if (!tbody) {
                return { success: false, error: "Không tìm thấy tbody" };
            }

            const rows = tbody.querySelectorAll("tr.ant-table-row");
            const lastRow = rows[rows.length - 1];

            if (!lastRow) {
                return { success: false, error: "Không tìm thấy dòng vừa thêm" };
            }

            // Fill content (4th column - index 3) - Click to activate edit mode
            const contentCell = lastRow.querySelectorAll("td")[3];
            if (contentCell) {
                const contentDiv = contentCell.querySelector(".editable-cell-value-wrap") as HTMLDivElement;
                if (contentDiv) {
                    // Click to activate edit mode
                    contentDiv.click();
                    await delay(150);

                    // Find and fill input field
                    const contentInput = contentCell.querySelector("input") as HTMLInputElement;
                    if (contentInput) {
                        contentInput.value = content;
                        forceChange(contentInput);
                        // Trigger blur to save
                        contentInput.blur();
                        await delay(100);
                    }
                }
            }

            // Fill weight (5th column - index 4) - Click to activate edit mode
            const weightCell = lastRow.querySelectorAll("td")[4];
            if (weightCell) {
                const weightDiv = weightCell.querySelector(".editable-cell-value-wrap") as HTMLDivElement;
                if (weightDiv) {
                    // Click to activate edit mode
                    weightDiv.click();
                    await delay(150);

                    // Find and fill input field
                    const weightInput = weightCell.querySelector("input") as HTMLInputElement;
                    if (weightInput) {
                        weightInput.value = weight;
                        forceChange(weightInput);
                        // Trigger blur to save
                        weightInput.blur();
                        await delay(100);
                    }
                }
            }

            // Small delay before next iteration
            await delay(200);
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error in handleAddBatchRows:", error);
        return { success: false, error: error.message };
    }
}

var listDichVu = ["Tiêu chuẩn TMĐT ĐG", "Nhanh - TMĐT ĐG"]
var tinhKien = ['kon tum', 'gia lai', 'dak lak', 'binh dinh', 'phu yen', 'khanh hoa', 'quang nam', 'quang ngai', 'da nang']
// <<< THAY ĐỔI 1: Quản lý trạng thái toàn cục >>>
// Mảng này sẽ lưu trữ tất cả các MutationObserver đang hoạt động
// để chúng ta có thể dọn dẹp chúng sau này.
let activeObservers: MutationObserver[] = [];
let uiContainer: HTMLDivElement | null = null;

// Định nghĩa cấu trúc của một mục địa chỉ trong data.json
interface AddressItem {
    NameXPKD?: string;
    NameQHKD?: string;
    NameTTPKD?: string;
    // Thêm các thuộc tính khác nếu cần
}

// ==========================================================================
// Cấu hình & Biến toàn cục
// ==========================================================================

const ADDRESS_INPUT_ID: string = "form-create-order_receiverAddress";
const GHOST_INPUT_ID: string = "ghost-address-input-suggestion";

let addressData: AddressItem[] = []; // Mảng chứa các đối tượng địa chỉ
let currentSuggestion: string | null = null; // Gợi ý hiện tại
let ghostInput: HTMLInputElement | null = null; // Tham chiếu đến element ghost input


window.onload = async () => {
    if (window.location.href.includes("domestic/create")) {

        console.log("Received URL_CHANGED message. Re-initializing script.");
        await runMainLogic();
    } else if (window.location.href.includes("order-manager")) {
        console.log("Tìm thấy Order Manager, đang chạy logic đơn hàng.");
        await runOrderLogic()
    } else {
        cleanup();
    }
}
/**
 * Hàm tiện ích để tạo và theo dõi một MutationObserver.
 * Thay vì dùng `new MutationObserver` trực tiếp, hãy dùng hàm này.
 * @param {MutationCallback} callback - Hàm callback cho observer.
 * @returns {MutationObserver}
 */
function createAndTrackObserver(callback: MutationCallback) {
    const observer = new MutationObserver(callback);
    activeObservers.push(observer); // Tự động thêm vào mảng theo dõi
    return observer;
}

// <<< THAY ĐỔI 3: Di chuyển tất cả logic vào hàm chính >>>
/**
 * Hàm logic chính của extension.
 * Hàm này bao gồm TẤT CẢ code từ `window.onload` cũ của bạn.
 */
async function runMainLogic() {
    // Bước 1: Dọn dẹp trạng thái cũ
    cleanup();
    // Chờ một chút để đảm bảo DOM của SPA đã cập nhật xong
    await delay(500);
    console.log("Running main logic for URL:", window.location.href);
    // `element` ở đây được TypeScript hiểu là kiểu `Element`.
    // Bắt đầu chạy
    await initialize();


    // Tìm phần tử có class 'g-avatar'
    await waitForElement('.g-avatar')
    const nameElement = document.querySelector('.g-avatar');

    // Kiểm tra xem phần tử có tồn tại không
    if (!nameElement) {
        return;
    }


}

// --- GLOBAL CACHE CHO TEMPLATES ---
let cachedCmsTemplates: string[] | null = null;

/**
 * Hàm lấy danh sách Template từ Background (có cache)
 */
async function getCmsTemplates(): Promise<string[]> {
    if (cachedCmsTemplates) return cachedCmsTemplates;

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            event: 'CONTENTMY',
            type: 'GET_CMS_TEMPLATES',
            payload: {}
        }, (response) => {
            if (response?.status === 'success' && Array.isArray(response.templates)) {
                cachedCmsTemplates = response.templates;
                resolve(response.templates);
            } else {
                resolve([]);
            }
        });
    });
}

/**
 * Hàm tạo và xử lý Form Chuyển tiếp (Đã tích hợp Template)
 */
async function createForwardForm(ticketId: string, defaultOrgCode: string, contentMaVanDon: string): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.style.marginTop = '15px';
    container.style.padding = '12px';
    container.style.backgroundColor = '#f9f9f9'; // Màu nền nhẹ hơn chút để tách biệt
    container.style.border = '1px solid #d9d9d9';
    container.style.borderRadius = '8px';

    // HTML Structure
    container.innerHTML = `
        <div style="font-weight: bold; color: #0050b3; margin-bottom: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
            <span>📤 Chuyển tiếp Ticket</span>
            <span style="font-size: 10px; color: #999;">${ticketId}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <!-- 1. Input Đơn vị -->
            <div>
                <input type="text" id="org-code-${ticketId}" 
                    value="${defaultOrgCode}" 
                    placeholder="Nhập mã đơn vị (6 số)..." 
                    maxlength="6"
                    style="width: 100%; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px;">
                <div id="org-info-display-${ticketId}" style="font-size: 12px; font-weight: 500; margin-top: 4px; min-height: 18px;"></div>
            </div>

            <!-- 2. Select Template (Mới) -->
            <select id="template-select-${ticketId}" 
                style="width: 100%; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; background-color: #fff; cursor: pointer; display: none;">
                <option value="">📋 Chọn mẫu nội dung...</option>
            </select>

            <!-- 3. Textarea -->
            <textarea id="comment-${ticketId}" 
                placeholder="Nhập nội dung chuyển tiếp..." 
                rows="3"
                style="width: 100%; padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; font-family: sans-serif; resize: vertical;"></textarea>
            
            <!-- 4. Button Gửi -->
            <button id="btn-send-${ticketId}" 
                style="background-color: #1890ff; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s;">
                Gửi Chuyển Tiếp
            </button>
        </div>
    `;

    // --- Select Elements ---
    const inputOrg = container.querySelector(`#org-code-${ticketId}`) as HTMLInputElement;
    const displayOrg = container.querySelector(`#org-info-display-${ticketId}`) as HTMLDivElement;
    const selectTemplate = container.querySelector(`#template-select-${ticketId}`) as HTMLSelectElement;
    const txtComment = container.querySelector(`#comment-${ticketId}`) as HTMLTextAreaElement;
    const btnSend = container.querySelector(`#btn-send-${ticketId}`) as HTMLButtonElement;

    let selectedOrg: { orgCode: string; name: string } | null = null;

    // --- LOGIC 1: Load Templates ---
    const templates = await getCmsTemplates();
    if (templates && templates.length > 0) {
        selectTemplate.style.display = 'block'; // Chỉ hiện khi có template
        templates.forEach(temp => {
            const option = document.createElement('option');
            option.value = temp;
            // Cắt ngắn text hiển thị nếu dài quá
            option.textContent = temp.length > 60 ? temp.substring(0, 60) + '...' : temp;
            selectTemplate.appendChild(option);
        });

        // Sự kiện khi chọn template
        selectTemplate.onchange = () => {
            if (selectTemplate.value) {
                txtComment.value = selectTemplate.value;
                // Focus lại vào textarea để user có thể sửa thêm
                txtComment.focus();
            }
        };
    }

    // --- SỬA LẠI LOGIC fetchOrg ---
    const fetchOrg = async (code: string) => {
        if (code.length !== 6) {
            displayOrg.textContent = '';
            selectedOrg = null;
            btnSend.disabled = true;
            btnSend.style.opacity = '0.6';
            btnSend.style.cursor = 'not-allowed';
            return;
        }

        displayOrg.textContent = '⏳ Đang tìm qua Background...';
        displayOrg.style.color = '#999';

        // Gửi message nhờ Background fetch hộ
        chrome.runtime.sendMessage({
            event: 'CONTENTMY',
            type: 'SEARCH_ORG_INFO', // Type mới chúng ta vừa thêm ở background
            payload: { code: code }
        }, (response) => {
            // Kiểm tra lỗi runtime
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                displayOrg.textContent = '❌ Lỗi kết nối Extension';
                return;
            }

            if (response && response.status === 'success' && response.data && response.data.length > 0) {
                const data = response.data;
                selectedOrg = { orgCode: data[0].orgCode, name: data[0].name };

                displayOrg.textContent = `✓ ${selectedOrg.orgCode} - ${selectedOrg.name}`;
                displayOrg.style.color = '#52c41a';
                btnSend.disabled = false;
                btnSend.style.opacity = '1';
                btnSend.style.cursor = 'pointer';
            } else {
                displayOrg.textContent = '❌ Không tìm thấy mã đơn vị này';
                displayOrg.style.color = '#ff4d4f';
                selectedOrg = null;
                btnSend.disabled = true;
                btnSend.style.opacity = '0.6';
                btnSend.style.cursor = 'not-allowed';
            }
        });
    };

    // Debounce nhẹ hoặc lắng nghe input
    inputOrg.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value.replace(/\D/g, '');
        inputOrg.value = val;
        fetchOrg(val);
    });

    // Auto-fetch nếu có mã mặc định (từ lịch sử ticket)
    if (defaultOrgCode) fetchOrg(defaultOrgCode);
    else {
        // Trạng thái ban đầu
        btnSend.disabled = true;
        btnSend.style.opacity = '0.6';
        btnSend.style.cursor = 'not-allowed';
    }

    // --- LOGIC 3: Gửi Chuyển Tiếp ---
    btnSend.onclick = async () => {
        const comment = txtComment.value.trim();
        if (!selectedOrg || !comment) {
            alert("⚠️ Vui lòng nhập đủ Mã đơn vị và Nội dung!");
            txtComment.focus();
            return;
        }

        if (!confirm(`Xác nhận chuyển tiếp ticket đến:\n${selectedOrg.orgCode} - ${selectedOrg.name}?`)) return;

        // UI Loading state
        const originalText = btnSend.textContent;
        btnSend.disabled = true;
        btnSend.textContent = '🔄 Đang gửi qua Background...';
        btnSend.style.backgroundColor = '#40a9ff';
        btnSend.style.cursor = 'wait';

        // Chuẩn bị dữ liệu thô (Raw Object)
        const dataOrgObj = [{
            tempId: 72,
            orgCode: selectedOrg.orgCode,
            orgName: `${selectedOrg.orgCode} - ${selectedOrg.name}`,
            filename: "",
            comment: comment,
            file: "",
            type: 2,
            number: 1
        }];

        // Gửi Message sang Background
        chrome.runtime.sendMessage({
            event: 'CONTENTMY',
            type: 'FORWARD_CMS_TICKET',
            payload: {
                ticketId: ticketId,
                dataOrgObj: dataOrgObj
            }
        }, (response) => {
            // Kiểm tra lỗi Runtime (Extension bị reload, mất kết nối...)
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                alert("❌ Lỗi kết nối Extension: " + chrome.runtime.lastError.message);
                resetButtonState();
                return;
            }

            if (response && response.status === 'success') {
                // Thành công
                btnSend.textContent = '✅ Đã gửi thành công';
                btnSend.style.backgroundColor = '#52c41a';
                txtComment.value = '';

                // Ẩn nút sau 2s để báo hiệu xong
                setTimeout(() => {
                    btnSend.textContent = originalText;
                    btnSend.style.backgroundColor = '#1890ff';
                    btnSend.style.cursor = 'pointer';
                    btnSend.disabled = false;
                }, 2000);
            } else {
                // Thất bại
                console.error("Lỗi từ Background:", response?.error);
                alert(`❌ Lỗi khi gửi: ${response?.error || 'Không rõ nguyên nhân'}`);
                resetButtonState();
            }
        });

        // Hàm helper reset nút khi lỗi
        const resetButtonState = () => {
            btnSend.textContent = 'Thử lại';
            btnSend.style.backgroundColor = '#ff4d4f';
            btnSend.disabled = false;
            btnSend.style.cursor = 'pointer';
        };
    };

    return container;
}

// <<< THAY ĐỔI 4: Thiết lập trình lắng nghe tin nhắn một lần >>>
/**
 * Lắng nghe tin nhắn từ background script và các phần khác của extension.
 * Trình lắng nghe này chỉ được đăng ký MỘT LẦN.
 */
chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
    if (message.type === "URL_CHANGED") {
        if (message.url.includes("domestic/create")) {

            console.log("Received URL_CHANGED message. Re-initializing script.");
            await runMainLogic();
        } else if (message.url.includes("order-manager")) {
            console.log("Tìm thấy Order Manager, đang chạy logic đơn hàng.");
            cleanup();
            await runOrderLogic()
        } else {
            cleanup();
        }
        return true; // Báo hiệu sẽ trả lời bất đồng bộ (good practice)
    } else if (message.type === "STORAGE_UPDATED") {
        console.log("Storage updated, refreshing UI.");
        // Chỉ gọi hàm update UI, không cần chạy lại toàn bộ logic
        if (typeof updateUI === 'function') {
            updateUI();
        }
        return true;
    } else if (message.type === "UPDATE_ORDER_INFO") {
        // ===== THÊM MỚI: Xử lý update từ Firebase =====
        const { maVanDon, fullLog } = message;
        console.log(`[Content] Received UPDATE_ORDER_INFO for ${maVanDon}`);

        // Cập nhật vào bảng danh sách
        updateOrderInfoInTable(maVanDon, fullLog);

        // Cập nhật vào modal nếu đang mở
        updateOrderInfoInModal(maVanDon, fullLog);

        sendResponse({ status: 'updated' });
        return true;
    } else if (message.type === "GET_MYPOST_TOKEN") {
        const token = localStorage.getItem('accessToken');
        sendResponse({ token: token || null });
        return true; // Giữ kênh mở cho phản hồi bất đồng bộ
    } else if (message.type === "ADD_BATCH_ROWS") {
        // Handle adding batch rows
        (async () => {
            try {
                const result = await handleAddBatchRows(message.payload);
                sendResponse(result);
            } catch (error: any) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }
})

// ===== HÀM MỚI: Cập nhật thông tin trong bảng =====
function updateOrderInfoInTable(maVanDon: string, fullLog: string) {
    const tableRows = document.querySelectorAll('tr.ant-table-row');
    let updated = false;

    tableRows.forEach(row => {
        const maVanDonLink = row.querySelector('a');
        if (maVanDonLink?.textContent?.trim() === maVanDon) {
            const infoTextSpan = row.querySelector('.info-text') as HTMLElement;
            const deleteBtn = row.querySelector('.info-delete-btn') as HTMLElement;

            if (infoTextSpan) {
                // Clear và render với màu sắc
                infoTextSpan.innerHTML = '';
                const formattedContent = formatLogWithColors(fullLog);
                infoTextSpan.appendChild(formattedContent);

                infoTextSpan.scrollTop = infoTextSpan.scrollHeight;

                // Cập nhật hiển thị nút xóa
                if (deleteBtn) {
                    deleteBtn.style.display = (fullLog && fullLog.trim() !== '') ? 'block' : 'none';
                }

                updated = true;
                console.log(`[Table] Updated info for ${maVanDon}`);
            }
        }
    });

    if (!updated) {
        console.log(`[Table] Could not find row for ${maVanDon}`);
    }
}

// ===== HÀM MỚI: Cập nhật thông tin trong modal =====
function updateOrderInfoInModal(maVanDon: string, fullLog: string) {
    const modalBody = document.querySelector('.ant-modal-body');
    if (!modalBody) return;

    const textSpan = modalBody.querySelector('.info-text-dialog') as HTMLElement;
    if (!textSpan) return;

    // Kiểm tra xem modal đang hiển thị mã vận đơn này không
    const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title'))
        .find(el => el.textContent?.includes('Đơn hàng'))
        ?.closest('.ant-card');

    if (!orderCard) return;

    const allThs = orderCard.querySelectorAll('th');
    for (const th of allThs) {
        if (th.textContent?.trim().includes('Mã vận đơn')) {
            const currentMaVanDon = th.nextElementSibling?.textContent?.trim();
            if (currentMaVanDon === maVanDon) {
                // Clear và render với màu sắc
                textSpan.innerHTML = '';
                const formattedContent = formatLogWithColors(fullLog);
                textSpan.appendChild(formattedContent);

                textSpan.scrollTop = textSpan.scrollHeight;
                console.log(`[Modal] Updated info for ${maVanDon}`);
            }
            break;
        }
    }
}


/**
 * <<< THAY ĐỔI 2: Hàm Dọn Dẹp (Cleanup) >>>
 * Hàm này sẽ được gọi trước khi chạy lại logic chính.
 * Nó đảm bảo không có UI hoặc listener cũ nào còn sót lại.
 */
function cleanup() {
    console.log("Cleaning up previous state...");

    // Ngắt kết nối và xóa tất cả các observer cũ
    activeObservers.forEach(observer => observer.disconnect());
    activeObservers = [];

    // Xóa các element UI đã được tạo
    const autoFillContainer = document.getElementById('auto-fill-container');
    if (autoFillContainer) {
        autoFillContainer.remove();
    }
    const ghostInput = document.getElementById(GHOST_INPUT_ID);
    if (ghostInput) {
        ghostInput.remove();
    }

    // Reset các biến trạng thái nếu cần
    uiContainer = null;
    // Bất kỳ biến toàn cục nào khác cần reset cũng nên được đặt ở đây
}


function updateUI() {
    const fillButton = document.getElementById('auto-fill-next') as HTMLButtonElement | null;
    const backButton = document.getElementById('auto-fill-back') as HTMLButtonElement | null;
    if (!fillButton || !backButton) return;

    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
        if (!response || !response.orders || response.orders.length === 0) {
            fillButton.textContent = 'Chưa có dữ liệu';
            fillButton.disabled = true;
            backButton.disabled = true;
            fillButton.style.backgroundColor = '#f5f5f5';
            fillButton.style.color = 'rgba(0, 0, 0, 0.25)';
            return;
        }

        const currentIndex = response.currentIndex ?? 0;
        const total = response.orders.length;

        backButton.disabled = currentIndex === 0;

        if (currentIndex >= total) {
            fillButton.textContent = 'Hoàn thành!';
            fillButton.disabled = true;
            fillButton.style.backgroundColor = '#52c41a';
        } else {
            fillButton.textContent = `Điền đơn (${currentIndex + 1}/${total})`;
            fillButton.disabled = false;
            fillButton.style.backgroundColor = '#1890ff';
        }
    });
}

async function populateForm(order: Order) {
    const fieldMapping: { [key: string]: string | number } = {
        'form-create-order_receiverPhone': order.SDT,
        'form-create-order_saleOrderCode': order.MAUSAC,
        'form-create-order_receiverName': order.NGUOINHAN,
        'form-create-order_receiverAddress': order.DIACHI,

        'cod': order.COD
    };
    var cod = document.querySelector("#scrollableDiv > div:nth-child(2) > table > tr:nth-child(1) > td:nth-child(3) > div > div.ant-col.ant-col-10 > div > div.ant-input-number-input-wrap > input") as HTMLInputElement | HTMLTextAreaElement
    var fullAddressElement = document.getElementById('fulladdress') as HTMLParagraphElement;
    if (fullAddressElement) {
        fullAddressElement.textContent = order.GOC || "Địa chỉ đầy đủ sẽ hiện thị tại đây";
    }
    for (const id in fieldMapping) {
        const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
        if (element) {
            element.value = String(fieldMapping[id]);
            // Kích hoạt sự kiện để các framework (React, Vue,...) nhận diện
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            if (id === 'form-create-order_receiverName') {
                await delay(500);
            } else if (id === 'form-create-order_receiverAddress') {
                element.focus();
                element.setSelectionRange(element.value.length, element.value.length);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (id === 'form-create-order_saleOrderCode') {
                //kiểm tra số lượng màu sắc ví dụ DO thì 1, TRANG thì 1, XANH thì 1, TRANGTRANG thì 2, TRANGDO thì 2,XANHTRANG thì 2
                const mausac = order.MAUSAC;
                const mausacCount = mausac.match(/(TRANG|DO|XANH)/gi)?.length || 0;
                if (mausacCount > 1) {
                    var de = document.querySelector("#form-create-order_weight") as HTMLInputElement;
                    de.value = "5000";
                    de.dispatchEvent(new Event('input', { bubbles: true }));
                    de.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                console.warn(`[Form Filler] Không tìm thấy element với ID: #${id}`);
            }
        }
        if (cod) {
            cod.value = String(order.COD);
            cod.dispatchEvent(new Event('input', { bubbles: true }));
            cod.dispatchEvent(new Event('change', { bubbles: true }));
        }
        var donmau = document.querySelector("#form-create-order_saleOrderCode") as HTMLInputElement;
        //focus địa chỉ và caret vào cuối và enter
        donmau.focus();
        // address.setSelectionRange(address.value.length, address.value.length);
        // address.dispatchEvent(new Event('input', { bubbles: true }));
        // address.dispatchEvent(new Event('change', { bubbles: true }));
        simulateRealClick(donmau);

    }

}


//END HO DUY///////////////////////////////////////////////////





function simulateRealClick(element: HTMLElement) {
    // Hàm này mô phỏng một cú click chuột thực tế hơn
    const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    });

    element.dispatchEvent(mouseDownEvent);
    element.dispatchEvent(mouseUpEvent);
    element.dispatchEvent(clickEvent);
}
//ham bỏ dấu string
const removeDiacritics = (str: string): string => {
    if (!str) return '';
    return str
        .toLowerCase() // 1. Chuyển thành chữ thường
        .normalize('NFD') // 2. Tách ký tự và dấu (e.g., 'vĩnh' -> 'v' + 'i' + 'n' + 'h' + '´')
        .replace(/[\u0300-\u036f]/g, '') // 3. Xóa tất cả các ký tự dấu
        .replace(/đ/g, 'd'); // 4. Xử lý riêng chữ 'đ' thành 'd'
};


function waitForElement(selector: string): Promise<HTMLElement> {
    return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) {
            resolve(el as HTMLElement);
            return;
        }

        const observer = createAndTrackObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                activeObservers = activeObservers.filter(o => o !== observer); // Xóa khỏi mảng
                resolve(el as HTMLElement);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
}
console.log("My Scriptsss");

/**
 * Format log với màu sắc cho thời gian và nội dung
 */
function formatLogWithColors(logText: string): HTMLElement {
    const container = document.createElement('div');

    if (!logText || logText.trim() === '') {
        const emptySpan = document.createElement('span');
        emptySpan.textContent = '(Chưa có thông tin)';
        emptySpan.style.color = '#999';
        emptySpan.style.fontStyle = 'italic';
        container.appendChild(emptySpan);
        return container;
    }

    // Tách các dòng
    const lines = logText.split('\n');

    lines.forEach((line, index) => {
        if (line.trim() === '') return;

        // Regex để tách timestamp (DD-MM-YYYY HH:MM) và nội dung
        // Format: "31-10-2025 14:30 Nội dung text"
        const timestampRegex = /^(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})\s+(.*)$/;
        const match = line.match(timestampRegex);

        const lineDiv = document.createElement('div');
        lineDiv.style.marginBottom = index < lines.length - 1 ? '4px' : '0';

        if (match) {
            // Có timestamp
            const timestamp = match[1];
            const content = match[2];

            // Span cho timestamp
            const timeSpan = document.createElement('span');
            timeSpan.textContent = `[${timestamp}]`;
            timeSpan.style.color = '#1890ff';
            timeSpan.style.fontWeight = '600';
            timeSpan.style.marginRight = '8px';

            // Span cho nội dung
            const contentSpan = document.createElement('span');
            contentSpan.textContent = content;
            contentSpan.style.color = '#262626';

            lineDiv.appendChild(timeSpan);
            lineDiv.appendChild(contentSpan);
        } else {
            // Không có timestamp, hiển thị nguyên dòng
            const plainSpan = document.createElement('span');
            plainSpan.textContent = line;
            plainSpan.style.color = '#595959';
            lineDiv.appendChild(plainSpan);
        }

        container.appendChild(lineDiv);
    });

    return container;
}

/**
 * Theo dõi một phần tử trong DOM và thực thi một callback sau một khoảng trễ
 * mỗi khi nó chuyển từ trạng thái "có nội dung" sang "trống/không tồn tại".
 *
 * @param selector - Chuỗi CSS selector để xác định phần tử.
 * @param callback - Hàm chứa code chính, sẽ được thực thi sau khi phần tử biến mất.
 * @param delayMs - Khoảng thời gian trễ (tính bằng mili giây) trước khi thực thi callback. Mặc định là 500.
 */
function onContentDisappearWithDelay(
    selector: string,
    callback: () => void, // Lưu ý: callback không còn nhận `element` vì nó đã biến mất
    delayMs: number = 500
): void {
    // Biến trạng thái để theo dõi xem nội dung có đang hiển thị hay không
    let isContentVisible = false;

    const handleStateCheck = () => {
        const element = document.querySelector(selector) as HTMLElement | null;
        // Điều kiện để coi là "có nội dung" không thay đổi
        const isCurrentlyVisible =
            element && (element.textContent?.trim().length !== 0 || element.title?.trim().length !== 0);

        if (!isCurrentlyVisible && isContentVisible) {
            // TRẠNG THÁI THAY ĐỔI: Từ đang hiển thị -> SANG KHÔNG hiển thị
            // -> Đây là thời điểm chúng ta cần chạy code, sau khi delay
            isContentVisible = false; // Reset lại trạng thái
            console.log('Phát hiện thay đổi: Nội dung đã biến mất.');

            // Thực thi callback sau một khoảng trễ
            setTimeout(() => {
                console.log(`Thực thi callback sau ${delayMs}ms.`);
                callback();
            }, delayMs);

        } else if (isCurrentlyVisible && !isContentVisible) {
            // TRẠNG THÁI THAY ĐỔI: Từ KHÔNG hiển thị -> SANG hiển thị
            // -> Đánh dấu là đã nhìn thấy, sẵn sàng để theo dõi khi nó biến mất
            isContentVisible = true;
            console.log('Nội dung đã xuất hiện. Đang theo dõi khi nào nó biến mất...');
        }
    };

    // Tạo một MutationObserver để lắng nghe thay đổi liên tục
    const observer = createAndTrackObserver(() => {
        handleStateCheck();
    });

    // Bắt đầu quan sát toàn bộ body của trang
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });

    // Kiểm tra trạng thái ban đầu ngay khi hàm được gọi
    // Điều này quan trọng để "ghi nhận" trạng thái ban đầu của phần tử
    handleStateCheck();
}







// ==========================================================================
// Hàm Tiện ích (Utility Functions)
// ==========================================================================

/**
 * Chuẩn hóa văn bản: chuyển thành chữ thường, bỏ dấu.
 */
function normalizeText(str: string | null | undefined): string {
    if (!str) return '';
    return str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
}

/**
 * Hàm debounce để trì hoãn việc thực thi một hàm.
 */
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
    let timer: number;
    return function (this: unknown, ...args: Parameters<T>) {
        const self = this;
        clearTimeout(timer);
        timer = window.setTimeout(() => func.apply(self, args), delay);
    };
}



// Định nghĩa cấu trúc của một mục địa chỉ trong data.json
interface AddressItem {
    NameXP?: string;
    NameXPN?: string;
    NameXPKD?: string;
    NameQH?: string;
    NameQHN?: string;
    NameQHKD?: string;
    NameTTP?: string;
    NameTTPN?: string;
    NameTTPKD?: string;
    TypeXP?: string;
    TypeQH?: string;
    TypeTTP?: string;
}


// ==========================================================================
// Khởi tạo và Theo dõi DOM
// ==========================================================================

/**
 * Hàm khởi tạo chính của extension.
 */
async function initialize(): Promise<void> {
    console.log("Extension gợi ý địa chỉ (TypeScript) đang chạy...");

    try {
        const response = await fetch(chrome.runtime.getURL('/data.json'));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        // Kiểm tra kiểu dữ liệu của data
        if (data && Array.isArray(data.QuocGia)) {
            addressData = data.QuocGia;
            console.log("Dữ liệu địa chỉ đã được tải.");
        } else {
            console.error("Định dạng data.json không hợp lệ.");
        }
    } catch (error) {
        console.error("Lỗi khi tải data.json:", error);
    }
}


function runOrderLogic() {
    console.log("Order Logic is running. Waiting for order detail modal...");

    // Hàm xử lý ẩn/hiện cột và thay đổi nội dung "Thông Tin Thêm"
    const processOrderTable = () => {
        const tableContent = document.querySelector('.ant-table-content');
        if (!tableContent) {
            console.log("Table content not found yet...");
            return;
        }

        // Tìm thead để xử lý header
        const thead = tableContent.querySelector('thead');
        if (!thead) {
            console.log("Table thead not found yet...");
            return;
        }

        // Tìm các header "Mã đơn hàng" và "Lô vận đơn"
        const headers = thead.querySelectorAll('th');
        let maDonHangIndex = -1;
        let loVanDonIndex = -1;
        let maVanDonIndex = -1;

        headers.forEach((th, index) => {
            const text = th.textContent?.trim();
            if (text === 'Mã đơn hàng') {
                maDonHangIndex = index;
                // Đổi tên header thành "Thông Tin Thêm"
                th.textContent = 'Thông Tin Thêm';
                // Đặt độ rộng cố định cho cột
                th.style.width = '200px';
                th.style.minWidth = '200px';
                th.style.maxWidth = '200px';
            }
            if (text === 'Lô vận đơn') loVanDonIndex = index;
            if (text === 'Mã vận đơn') maVanDonIndex = index;
            // Giữ nguyên nếu đã đổi tên rồi
            if (text === 'Thông Tin Thêm') {
                maDonHangIndex = index;
                // Đảm bảo độ rộng được set
                th.style.width = '200px';
                th.style.minWidth = '200px';
                th.style.maxWidth = '200px';
            }
        });

        if (maDonHangIndex === -1 || loVanDonIndex === -1 || maVanDonIndex === -1) {
            console.log("Required columns not found yet...");
            return;
        }

        // Ẩn cột "Lô vận đơn"
        headers[loVanDonIndex].style.display = 'none';

        // Xử lý tbody
        const tbody = tableContent.querySelector('tbody.ant-table-tbody');
        if (!tbody) {
            console.log("Table tbody not found yet...");
            return;
        }

        const rows = tbody.querySelectorAll('tr.ant-table-row');
        if (rows.length === 0) {
            console.log("No rows found yet...");
            return;
        }

        console.log(`Processing ${rows.length} rows...`);

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');

            // Lấy mã vận đơn làm key (lấy từ thẻ <a> bên trong cell)
            const maVanDonCell = cells[maVanDonIndex];
            const maVanDonLink = maVanDonCell?.querySelector('a');
            const maVanDon = maVanDonLink?.textContent?.trim() || '';

            if (!maVanDon) {
                console.log("Mã vận đơn not found in row");
                return;
            }

            // Ẩn cột "Lô vận đơn"
            if (cells[loVanDonIndex]) cells[loVanDonIndex].style.display = 'none';

            // Xử lý cell "Mã đơn hàng" -> chuyển thành "Thông Tin Thêm"
            const infoCell = cells[maDonHangIndex];
            if (!infoCell) return;

            // Đặt độ rộng cho cell
            infoCell.style.width = '200px';
            infoCell.style.minWidth = '200px';
            infoCell.style.maxWidth = '200px';
            infoCell.style.padding = '8px';

            // Kiểm tra đã xử lý chưa
            if (infoCell.querySelector('.info-edit-container')) {
                console.log(`Row with ${maVanDon} already processed`);
                return;
            }

            console.log(`Processing row with mã vận đơn: ${maVanDon}`);

            // Xóa nội dung cũ
            infoCell.innerHTML = '';

            // Container cho nội dung và nút - LAYOUT DỌC
            const container = document.createElement('div');
            container.className = 'info-edit-container';
            container.style.display = 'flex';
            container.style.flexDirection = 'column'; // Dọc thay vì ngang
            container.style.gap = '6px';
            container.style.width = '100%';

            // Text hiển thị log (ở trên)
            const textSpan = document.createElement('div');
            textSpan.className = 'info-text';
            textSpan.style.fontSize = '13px';
            textSpan.style.wordBreak = 'break-word';
            textSpan.style.lineHeight = '1.6';
            textSpan.style.whiteSpace = 'normal';
            textSpan.style.maxHeight = '180px';
            textSpan.style.overflowY = 'auto';
            textSpan.style.padding = '10px';
            textSpan.style.border = '1px solid #1890ff';
            textSpan.style.borderRadius = '6px';
            textSpan.style.backgroundColor = '#f0f5ff';
            textSpan.style.color = '#262626';
            textSpan.style.fontFamily = 'monospace';

            // Input section (ở dưới)
            const inputSection = document.createElement('div');
            inputSection.style.display = 'flex';
            inputSection.style.flexDirection = 'column';
            inputSection.style.gap = '4px';

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'ant-input';
            textInput.placeholder = 'Nhập nội dung cập nhật...';
            textInput.style.fontSize = '13px';
            textInput.style.padding = '6px 10px';
            textInput.style.borderColor = '#1890ff';

            // Container cho các nút (Update và Delete)
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '4px';
            buttonContainer.style.width = '100%';

            // Nút cập nhật (chiếm 3/4)
            const updateButton = document.createElement('button');
            updateButton.className = 'ant-btn ant-btn-sm ant-btn-primary';
            updateButton.textContent = 'Cập nhật';
            updateButton.style.flex = '3';
            updateButton.style.fontSize = '13px';
            updateButton.style.padding = '6px 12px';
            updateButton.style.height = 'auto';
            updateButton.style.fontWeight = '500';

            // Nút xóa (chiếm 1/4) - Ẩn mặc định
            const deleteButton = document.createElement('button');
            deleteButton.className = 'ant-btn ant-btn-sm ant-btn-danger info-delete-btn';
            deleteButton.textContent = 'Xóa';
            deleteButton.style.flex = '1';
            deleteButton.style.fontSize = '13px';
            deleteButton.style.padding = '6px 12px';
            deleteButton.style.height = 'auto';
            deleteButton.style.display = 'none'; // Ẩn mặc định
            deleteButton.style.fontWeight = '500';

            // Load dữ liệu từ Firebase qua background
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "GET_EXTRA_INFO",
                payload: { maVanDon: maVanDon }
            }, (response) => {
                if (response && response.status === 'success') {
                    const savedInfo = response.data || '';

                    // Clear và render với màu sắc
                    textSpan.innerHTML = '';
                    const formattedContent = formatLogWithColors(savedInfo);
                    textSpan.appendChild(formattedContent);

                    // Hiện nút xóa nếu có dữ liệu
                    if (savedInfo && savedInfo.trim() !== '') {
                        deleteButton.style.display = 'block';
                    }

                    setTimeout(() => {
                        textSpan.scrollTop = textSpan.scrollHeight;
                    }, 100);
                }
            });

            // Xử lý sự kiện click nút cập nhật
            updateButton.onclick = () => {
                const inputValue = textInput.value.trim();
                if (!inputValue) {
                    alert('Vui lòng nhập nội dung!');
                    return;
                }

                // Gửi update lên Firebase qua background script
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "UPDATE_EXTRA_INFO",
                    payload: {
                        maVanDon: maVanDon,
                        content: inputValue
                    }
                }, (response) => {
                    if (response && response.status === 'success') {
                        // Cập nhật UI sau khi lưu Firebase thành công
                        const updatedLog = response.updatedLog;

                        // Clear và render với màu sắc
                        textSpan.innerHTML = '';
                        const formattedContent = formatLogWithColors(updatedLog);
                        textSpan.appendChild(formattedContent);

                        textInput.value = '';
                        textSpan.scrollTop = textSpan.scrollHeight;

                        // Hiện nút xóa vì đã có dữ liệu
                        deleteButton.style.display = 'block';

                        // ===== QUAN TRỌNG: Cập nhật luôn table rows để tránh portal re-render =====
                        updateOrderInfoInTable(maVanDon, updatedLog);

                        console.log(`Đã cập nhật thông tin cho ${maVanDon} qua Firebase`);
                    } else {
                        alert(`Lỗi: ${response?.error || 'Không thể cập nhật'}`);
                    }
                });
            };

            // Xử lý sự kiện click nút xóa - CHỈ XÓA DÒNG CUỐI
            deleteButton.onclick = () => {
                if (!confirm(`Bạn có chắc chắn muốn xóa dòng cuối cùng của mã ${maVanDon}?`)) {
                    return;
                }

                console.log(`[Delete] Đang xóa dòng cuối của ${maVanDon}...`);

                // Gửi lệnh xóa dòng cuối lên Firebase qua background script
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "DELETE_LAST_LINE_EXTRA_INFO",
                    payload: {
                        maVanDon: maVanDon
                    }
                }, (response) => {
                    console.log(`[Delete] Response:`, response);

                    if (response && response.status === 'success') {
                        // Cập nhật UI sau khi xóa thành công
                        const updatedLog = response.updatedLog || '';

                        // Clear và render với màu sắc
                        textSpan.innerHTML = '';
                        const formattedContent = formatLogWithColors(updatedLog);
                        textSpan.appendChild(formattedContent);

                        textInput.value = '';

                        // Ẩn nút xóa nếu không còn dữ liệu
                        if (!updatedLog || updatedLog.trim() === '') {
                            deleteButton.style.display = 'none';
                        }

                        // ===== QUAN TRỌNG: Cập nhật luôn table rows để tránh portal re-render =====
                        updateOrderInfoInTable(maVanDon, updatedLog);

                        console.log(`[Delete] Đã xóa dòng cuối cho ${maVanDon} trên Firebase`);
                    } else {
                        alert(`Lỗi: ${response?.error || 'Không thể xóa'}`);
                    }
                });
            };

            // Xử lý Enter trong input
            textInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    updateButton.click();
                }
            };

            // inputSection.appendChild(textInput);
            // buttonContainer.appendChild(updateButton);
            // buttonContainer.appendChild(deleteButton);
            // inputSection.appendChild(buttonContainer);

            container.appendChild(textSpan);
            container.appendChild(inputSection);
            infoCell.appendChild(container);
        });

        console.log("Table processing completed!");
    };

    // CHỜ WEB LOADING XONG - CÁCH TIẾP CẬN CHO REACTJS SPA
    const initTableProcessing = () => {
        console.log("Waiting for React table to render...");

        // Kiểm tra xem table đã có chưa
        const checkTableExists = () => {
            const tableContent = document.querySelector('.ant-table-content');
            const tbody = tableContent?.querySelector('tbody.ant-table-tbody');
            const rows = tbody?.querySelectorAll('tr.ant-table-row');

            return tableContent && tbody && rows && rows.length > 0;
        };

        // Nếu table đã có sẵn (trang đã load trước khi script chạy)
        if (checkTableExists()) {
            console.log("Table already exists, processing after short delay...");
            setTimeout(() => {
                console.log("Starting table processing...");
                processOrderTable();
                setupObserver();
            }, 1000); // Delay 1s để đảm bảo React đã render xong
            return;
        }

        // Nếu table chưa có, chờ nó xuất hiện
        console.log("Table not found, waiting for React to render...");
        const tableWaitObserver = createAndTrackObserver(() => {
            if (checkTableExists()) {
                console.log("Table detected! Processing after delay...");

                // Disconnect observer này
                tableWaitObserver.disconnect();
                activeObservers = activeObservers.filter(o => o !== tableWaitObserver);

                // Delay một chút để React render xong hết các rows
                setTimeout(() => {
                    console.log("Starting table processing after React render...");
                    processOrderTable();
                    setupObserver();
                }, 1000); // Delay 1.5s để chắc chắn
            }
        });

        // Quan sát toàn bộ body để bắt khi table được thêm vào
        tableWaitObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout fallback: Nếu sau 10s vẫn không thấy table
        setTimeout(() => {
            if (!checkTableExists()) {
                console.warn("Table not found after 10 seconds, giving up...");
                tableWaitObserver.disconnect();
                activeObservers = activeObservers.filter(o => o !== tableWaitObserver);
            }
        }, 10000);
    };

    // Setup observer
    const setupObserver = () => {
        console.log("Setting up mutation observer...");

        // Observer cho table - CHỈ quan sát thay đổi từ React, KHÔNG quan sát thay đổi của chúng ta
        const tableObserver = createAndTrackObserver((mutations) => {
            if (!window.location.href.includes('order-manager')) return;

            // Lọc bỏ những thay đổi do extension gây ra
            const hasRealTableChange = mutations.some(mutation => {
                const target = mutation.target as HTMLElement;

                // Bỏ qua nếu thay đổi xảy ra bên trong container của chúng ta
                if (target.closest?.('.info-edit-container')) {
                    return false;
                }

                // Bỏ qua nếu là thay đổi text trong cell đã xử lý
                if (target.classList?.contains('info-text') ||
                    target.classList?.contains('info-input')) {
                    return false;
                }

                // Chỉ quan tâm đến thay đổi trong tbody NHƯNG không phải do chúng ta
                if (mutation.type === 'childList') {
                    // Kiểm tra xem có node mới được thêm vào tbody không
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasNewRows = addedNodes.some(node => {
                        return (node as HTMLElement).classList?.contains('ant-table-row');
                    });

                    if (hasNewRows) {
                        console.log("New rows detected from React");
                        return true;
                    }
                }

                return false;
            });

            if (hasRealTableChange) {
                // Debounce để tránh chạy quá nhiều lần
                clearTimeout((window as any).__tableProcessTimeout);
                (window as any).__tableProcessTimeout = setTimeout(() => {
                    console.log("Real table change detected, re-processing...");
                    processOrderTable();
                }, 500);
            }
        });

        // CHỈ quan sát tbody, không quan sát toàn bộ body
        const tbody = document.querySelector('.ant-table-tbody');
        if (tbody) {
            tableObserver.observe(tbody, {
                childList: true,
                subtree: false // Không quan sát subtree để tránh bắt thay đổi bên trong cell
            });
            console.log("Observer attached to tbody");
        } else {
            console.log("Tbody not found, observer not attached");
        }
    };

    // Bắt đầu quá trình
    initTableProcessing();

    // Hàm thêm "Thông tin thêm" vào dialog chi tiết
    const addExtraInfoToDialog = (modalElement: Element) => {
        const modalBody = modalElement.querySelector('.ant-modal-body');
        if (!modalBody) return;

        // Hàm helper để lấy text từ label
        const getTextFromLabel = (container: Element, labelText: string): string => {
            const allThs = container.querySelectorAll('th');
            for (const th of allThs) {
                if (th.textContent?.trim().includes(labelText)) {
                    return th.nextElementSibling?.textContent?.trim() ?? '';
                }
            }
            return '';
        };

        // Hàm để cập nhật thông tin dựa vào mã vận đơn hiện tại
        const updateExtraInfo = () => {
            // Lấy modal body mới nhất
            const currentModalBody = modalElement.querySelector('.ant-modal-body');
            if (!currentModalBody) return null;

            // Lấy mã vận đơn
            const orderCard = Array.from(currentModalBody.querySelectorAll('.ant-card-head-title'))
                .find(el => el.textContent?.includes('Đơn hàng'))
                ?.closest('.ant-card');

            if (!orderCard) {
                console.log('Không tìm thấy card Đơn hàng');
                return null;
            }

            const maVanDon = getTextFromLabel(orderCard, 'Mã vận đơn');
            if (!maVanDon) {
                console.log('Không tìm thấy mã vận đơn');
                return null;
            }

            return maVanDon;
        };

        // Tìm table custom-table-orderhdr-sender
        const orderTable = modalBody.querySelector('#custom-table-orderhdr-sender') as HTMLTableElement;

        if (!orderTable) {
            console.log('Không tìm thấy table custom-table-orderhdr-sender');
            return;
        }

        // Xóa row cũ nếu có (để cập nhật lại thông tin mới)
        const existingRow = orderTable.querySelector('#custom-extra-info-row');
        if (existingRow) {
            existingRow.remove();
        }

        // Tạo row mới để chứa "Thông tin thêm"
        const newRow = document.createElement('tr');
        newRow.id = 'custom-extra-info-row';

        // Tạo cell với colspan để chiếm toàn bộ width
        const cell = document.createElement('td');
        cell.colSpan = 3; // Để chiếm hết các cột
        cell.style.padding = '12px';
        cell.style.borderTop = '1px solid #f0f0f0';

        // Tạo container cho "Thông tin thêm"
        const container = document.createElement('div');
        container.id = 'custom-extra-info-container';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';

        // Label "Thông tin thêm"
        const label = document.createElement('div');
        label.style.fontWeight = '600';
        label.style.fontSize = '14px';
        label.style.color = '#262626';
        label.textContent = 'Thông tin thêm:';

        // Text hiển thị log (ở trên)
        const textSpan = document.createElement('div');
        textSpan.className = 'info-text-dialog';
        textSpan.style.fontSize = '14px';
        textSpan.style.wordBreak = 'break-word';
        textSpan.style.lineHeight = '1.6';
        textSpan.style.color = '#262626';
        textSpan.style.whiteSpace = 'pre-wrap';
        textSpan.style.maxHeight = '220px';
        textSpan.style.overflowY = 'auto';
        textSpan.style.padding = '12px';
        textSpan.style.border = '2px solid #1890ff';
        textSpan.style.borderRadius = '8px';
        textSpan.style.backgroundColor = '#e6f7ff';
        textSpan.style.marginBottom = '12px';
        textSpan.style.fontFamily = 'monospace';
        textSpan.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

        // Input section (ở dưới)
        const inputSection = document.createElement('div');
        inputSection.style.display = 'flex';
        inputSection.style.flexDirection = 'column';
        inputSection.style.gap = '6px';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'ant-input';
        textInput.placeholder = 'Nhập nội dung cập nhật...';
        textInput.style.fontSize = '14px';
        textInput.style.padding = '8px 12px';
        textInput.style.borderColor = '#1890ff';
        textInput.style.borderWidth = '2px';

        // Container cho các nút (Update và Delete)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '6px';
        buttonContainer.style.width = '100%';

        // Nút cập nhật (chiếm 3/4)
        const updateButton = document.createElement('button');
        updateButton.className = 'ant-btn ant-btn-sm ant-btn-primary';
        updateButton.textContent = 'Cập nhật';
        updateButton.style.flex = '3';
        updateButton.style.fontSize = '14px';
        updateButton.style.padding = '8px 16px';
        updateButton.style.height = 'auto';
        updateButton.style.fontWeight = '600';

        // Nút xóa (chiếm 1/4) - Ẩn mặc định
        const deleteButton = document.createElement('button');
        deleteButton.className = 'ant-btn ant-btn-sm ant-btn-danger';
        deleteButton.textContent = 'Xóa';
        deleteButton.style.flex = '1';
        deleteButton.style.fontSize = '14px';
        deleteButton.style.padding = '8px 16px';
        deleteButton.style.height = 'auto';
        deleteButton.style.display = 'none'; // Ẩn mặc định
        deleteButton.style.fontWeight = '600';

        // Biến để lưu mã vận đơn hiện tại
        let currentMaVanDon = '';

        // Hàm load dữ liệu từ Firebase qua background
        const loadExtraInfo = (maVanDon: string) => {
            if (!maVanDon) return;

            currentMaVanDon = maVanDon;

            // GỬI REQUEST ĐẾN BACKGROUND ĐỂ LẤY DỮ LIỆU TỪ FIREBASE
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "GET_EXTRA_INFO",
                payload: { maVanDon: maVanDon }
            }, (response) => {
                if (response && response.status === 'success') {
                    const savedInfo = response.data || '';

                    // Clear và render với màu sắc
                    textSpan.innerHTML = '';
                    const formattedContent = formatLogWithColors(savedInfo);
                    textSpan.appendChild(formattedContent);

                    textInput.value = '';

                    // Hiện nút xóa nếu có dữ liệu
                    if (savedInfo && savedInfo.trim() !== '') {
                        deleteButton.style.display = 'block';
                    } else {
                        deleteButton.style.display = 'none';
                    }

                    setTimeout(() => {
                        textSpan.scrollTop = textSpan.scrollHeight;
                    }, 100);
                }
            });

            console.log(`Đang load thông tin cho mã vận đơn: ${maVanDon}`);
        };

        // Hàm check và update mã vận đơn với polling
        let checkCount = 0;
        const maxChecks = 10; // Check tối đa 10 lần

        const checkAndUpdateMaVanDon = () => {
            checkCount++;
            console.log(`[Polling] Lần ${checkCount}: Đang check mã vận đơn...`);

            const newMaVanDon = updateExtraInfo();

            if (newMaVanDon) {
                if (newMaVanDon !== currentMaVanDon) {
                    console.log(`[Polling] Tìm thấy mã vận đơn mới: "${newMaVanDon}" (cũ: "${currentMaVanDon}")`);
                    loadExtraInfo(newMaVanDon);
                    return true; // Đã tìm thấy, dừng check
                } else {
                    console.log(`[Polling] Mã vận đơn không đổi: "${newMaVanDon}"`);
                    return true; // Đã có mã vận đơn, dừng check
                }
            }

            if (checkCount < maxChecks) {
                // Tiếp tục check sau 300ms nếu chưa tìm thấy
                console.log(`[Polling] Chưa tìm thấy, sẽ check lại sau 300ms...`);
                setTimeout(checkAndUpdateMaVanDon, 300);
            } else {
                console.log(`[Polling] Đã check ${maxChecks} lần, dừng polling.`);
            }

            return false;
        };

        // Bắt đầu check
        console.log('[Polling] Bắt đầu polling mã vận đơn...');
        checkAndUpdateMaVanDon();

        // Xử lý sự kiện click nút cập nhật
        updateButton.onclick = () => {
            const inputValue = textInput.value.trim();
            if (!inputValue) {
                alert('Vui lòng nhập nội dung!');
                return;
            }

            if (!currentMaVanDon) {
                alert('Chưa xác định được mã vận đơn!');
                return;
            }

            // GỬI MESSAGE ĐẾN BACKGROUND SCRIPT ĐỂ CẬP NHẬT FIREBASE
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "UPDATE_EXTRA_INFO",
                payload: {
                    maVanDon: currentMaVanDon,
                    content: inputValue
                }
            }, (response) => {
                if (response && response.status === 'success') {
                    // Cập nhật UI sau khi lưu Firebase thành công
                    const updatedLog = response.updatedLog;

                    // Clear và render với màu sắc
                    textSpan.innerHTML = '';
                    const formattedContent = formatLogWithColors(updatedLog);
                    textSpan.appendChild(formattedContent);

                    textInput.value = '';
                    textSpan.scrollTop = textSpan.scrollHeight;

                    // Hiện nút xóa vì đã có dữ liệu
                    deleteButton.style.display = 'block';

                    // Cập nhật cột trong bảng
                    updateOrderInfoInTable(currentMaVanDon, updatedLog);

                    console.log(`Đã cập nhật thông tin cho ${currentMaVanDon} trong dialog qua Firebase`);
                } else {
                    alert(`Lỗi: ${response?.error || 'Không thể cập nhật'}`);
                }
            });
        };

        // Xử lý sự kiện click nút xóa - CHỈ XÓA DÒNG CUỐI
        deleteButton.onclick = () => {
            if (!currentMaVanDon) {
                alert('Chưa xác định được mã vận đơn!');
                return;
            }

            if (!confirm(`Bạn có chắc chắn muốn xóa dòng cuối cùng của mã ${currentMaVanDon}?`)) {
                return;
            }

            // Gửi lệnh xóa dòng cuối lên Firebase qua background script
            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "DELETE_LAST_LINE_EXTRA_INFO",
                payload: {
                    maVanDon: currentMaVanDon
                }
            }, (response) => {
                if (response && response.status === 'success') {
                    // Cập nhật UI sau khi xóa thành công
                    const updatedLog = response.updatedLog || '';

                    // Clear và render với màu sắc
                    textSpan.innerHTML = '';
                    const formattedContent = formatLogWithColors(updatedLog);
                    textSpan.appendChild(formattedContent);

                    textInput.value = '';

                    // Ẩn nút xóa nếu không còn dữ liệu
                    if (!updatedLog || updatedLog.trim() === '') {
                        deleteButton.style.display = 'none';
                    }

                    // Cập nhật cột trong bảng
                    updateOrderInfoInTable(currentMaVanDon, updatedLog);

                    console.log(`Đã xóa dòng cuối cho ${currentMaVanDon} trong dialog trên Firebase`);
                } else {
                    alert(`Lỗi: ${response?.error || 'Không thể xóa'}`);
                }
            });
        };

        // Xử lý Enter trong input
        textInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateButton.click();
            }
        };

        inputSection.appendChild(textInput);
        buttonContainer.appendChild(updateButton);
        buttonContainer.appendChild(deleteButton);
        inputSection.appendChild(buttonContainer);

        container.appendChild(label);
        container.appendChild(textSpan);
        container.appendChild(inputSection);

        // Thêm container vào cell
        cell.appendChild(container);

        // Thêm cell vào row
        newRow.appendChild(cell);

        // Thêm row vào cuối table (tbody nếu có, hoặc trực tiếp vào table)
        const tbody = orderTable.querySelector('tbody');
        if (tbody) {
            tbody.appendChild(newRow);
        } else {
            orderTable.appendChild(newRow);
        }

        console.log(`Đã thêm "Thông tin thêm" vào cuối table #custom-table-orderhdr-sender`);
    };

    // ===== PHẦN MỚI: CMS INTEGRATION =====

    /**
     * Fetch thông tin CMS từ API qua background script (bypass CORS)
     */
    async function fetchCMSData(maVanDon: string): Promise<{ hasData: boolean; tickets?: any[] }> {
        try {
            console.log(`[CMS] Fetching data for ${maVanDon}...`);

            // Gửi request đến background script để fetch CMS data
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "FETCH_CMS_DATA",
                    payload: { maVanDon }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[CMS] Chrome runtime error:', chrome.runtime.lastError);
                        resolve({ hasData: false });
                        return;
                    }

                    if (response && response.status === 'success') {
                        console.log(`[CMS] Received data:`, response.data);
                        resolve(response.data);
                    } else {
                        console.error('[CMS] Fetch failed:', response?.error);
                        resolve({ hasData: false });
                    }
                });
            });

        } catch (error) {
            console.error('[CMS] Error fetching data:', error);
            return { hasData: false };
        }
    }

    /**
     * Thêm section CMS vào modal
     */
    async function addCMSInfoToModal(modalElement: Element, maVanDon: string) {
        console.log(`[CMS] Adding CMS section for ${maVanDon}...`);

        // Tìm card "Người nhận"
        const modalBody = modalElement.querySelector('.ant-modal-body');
        if (!modalBody) return;

        const receiverCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title'))
            .find(el => el.textContent?.includes('Người nhận'))
            ?.closest('.ant-card');

        if (!receiverCard) {
            console.log('[CMS] Receiver card not found');
            return;
        }

        // Tìm ant-col chứa receiver card (ant-col-24)
        const receiverCol = receiverCard.closest('.ant-col.ant-col-24');
        if (!receiverCol) {
            console.log('[CMS] Receiver column not found');
            return;
        }

        // Tìm ant-row container chứa các ant-col
        const rowContainer = receiverCol.parentElement;
        if (!rowContainer || !rowContainer.classList.contains('ant-row')) {
            console.log('[CMS] Row container not found');
            return;
        }

        // Xóa card CMS cũ nếu có
        const oldCMSCard = rowContainer.querySelector('#custom-cms-col');
        if (oldCMSCard) {
            oldCMSCard.remove();
        }

        // Tạo ant-col wrapper cho CMS card
        const cmsCol = document.createElement('div');
        cmsCol.id = 'custom-cms-col';
        cmsCol.className = 'ant-col ant-col-24';
        cmsCol.style.paddingLeft = '4px';
        cmsCol.style.paddingRight = '4px';

        // Tạo card CMS mới
        const cmsCard = document.createElement('div');
        cmsCard.className = 'ant-card ant-card-small';
        cmsCard.style.width = '100%';
        cmsCard.style.height = '100%';
        cmsCard.style.marginTop = '8px';

        // Card header
        const cardHead = document.createElement('div');
        cardHead.className = 'ant-card-head';
        cardHead.innerHTML = `
            <div class="ant-card-head-wrapper">
                <div class="ant-card-head-title">
                    <div>
                        <span role="img" aria-label="file-text" class="anticon anticon-file-text">
                            <svg viewBox="64 64 896 896" focusable="false" width="1em" height="1em" fill="currentColor">
                                <path d="M854.6 288.6L639.4 73.4c-6-6-14.1-9.4-22.6-9.4H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V311.3c0-8.5-3.4-16.7-9.4-22.7zM790.2 326H602V137.8L790.2 326zm1.8 562H232V136h302v216a42 42 0 0042 42h216v494z"></path>
                            </svg>
                        </span> Thông tin CMS
                    </div>
                </div>
                <div class="ant-card-extra">
                    <button id="custom-cms-detail-btn" class="ant-btn ant-btn-primary ant-btn-sm" style="display: none;">
                        <span>Chi tiết CMS</span>
                    </button>
                </div>
            </div>
        `;

        // Card body
        const cardBody = document.createElement('div');
        cardBody.className = 'ant-card-body';
        cardBody.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Đang tải dữ liệu CMS...</div>';

        cmsCard.appendChild(cardHead);
        cmsCard.appendChild(cardBody);
        cmsCol.appendChild(cmsCard);

        // Chèn cmsCol sau receiverCol trong rowContainer
        rowContainer.insertBefore(cmsCol, receiverCol.nextSibling);

        // Fetch data và update UI
        const cmsData = await fetchCMSData(maVanDon);

        if (!cmsData.hasData) {
            cardBody.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <span style="display: inline-block; padding: 4px 12px; background: #f5f5f5; border: 1px solid #d9d9d9; border-radius: 4px; color: #999; font-size: 14px;">
                        Chưa có CMS
                    </span>
                </div>
            `;
            return;
        }

        if (!cmsData.tickets || cmsData.tickets.length === 0) {
            cardBody.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <span style="display: inline-block; padding: 4px 12px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 4px; color: #fa8c16; font-size: 14px;">
                        Không tìm thấy ticket
                    </span>
                </div>
            `;
            return;
        }

        // Render nhiều bảng (mỗi ticket 1 bảng)
        let allTablesHtml = '';
        cardBody.innerHTML = '';

        cmsData.tickets.forEach((ticket: any, ticketIndex: number) => {
            // Header cho mỗi ticket
            if (ticketIndex > 0) {
                allTablesHtml += '<div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #1890ff;"></div>';
            }

            allTablesHtml += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: #1890ff; font-size: 14px;">📋 ${ticket.ticketCode}</strong>
                </div>
            `;

            if (!ticket.actions || ticket.actions.length === 0) {
                allTablesHtml += `
                    <div style="padding: 12px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 4px; margin-bottom: 12px;">
                        <span style="color: #fa8c16; font-size: 13px;">Ticket này chưa có action</span>
                    </div>
                `;
                return;
            }

            // Render table cho ticket này
            allTablesHtml += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">';
            allTablesHtml += `
                <thead>
                    <tr style="background: #fafafa; border-bottom: 1px solid #f0f0f0;">
                        <th style="padding: 8px; text-align: center; font-weight: 600; width: 50px;">STT</th>
                        <th style="padding: 8px; text-align: left; font-weight: 600; width: 140px;">Ngày</th>
                        <th style="padding: 8px; text-align: left; font-weight: 600; width: 180px;">Đơn vị</th>
                        <th style="padding: 8px; text-align: left; font-weight: 600;">Nội dung</th>
                        <th style="padding: 8px; text-align: left; font-weight: 600; width: 180px;">Đơn vị liên quan</th>
                    </tr>
                </thead>
                <tbody>
            `;

            ticket.actions.forEach((action: any, index: number) => {
                const bgColor = index % 2 === 0 ? '#fff' : '#fafafa';
                allTablesHtml += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #f0f0f0;">
                        <td style="padding: 8px; text-align: center;">${action.stt}</td>
                        <td style="padding: 8px; font-size: 13px;">${action.date}</td>
                        <td style="padding: 8px; font-size: 13px;">${action.unit}</td>
                        <td style="padding: 8px; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${action.content}</td>
                        <td style="padding: 8px; font-size: 13px;">${action.relatedUnit || '-'}</td>
                    </tr>
                `;
            });

            allTablesHtml += '</tbody></table>';


            // 1. Tạo container cho ticket này nếu chưa có
            const ticketWrapper = document.createElement('div');
            ticketWrapper.style.marginBottom = '20px';
            ticketWrapper.innerHTML = allTablesHtml; // chứa table của 1 ticket

            // 2. Lấy mã đơn vị cuối cùng (Last Unit) để gợi ý chuyển tiếp
            const lastAction = ticket.actions?.[ticket.actions.length - 1];
            const unitMatch = lastAction?.unit?.match(/(\d{6})/);
            const defaultOrgCode = unitMatch?.[1] || '';

            const isTicketClosed = lastAction?.content?.includes('Đóng yêu cầu') || false;

            if (!isTicketClosed) {
                // Tạo một placeholder div để giữ chỗ
                const formPlaceholder = document.createElement('div');
                ticketWrapper.appendChild(formPlaceholder);

                // Gọi hàm async và replace placeholder khi xong
                createForwardForm(ticket.ticketId, defaultOrgCode, maVanDon).then(formElement => {
                    ticketWrapper.replaceChild(formElement, formPlaceholder);
                });
            }

            cardBody.appendChild(ticketWrapper);


        });

        // cardBody.innerHTML = allTablesHtml;

        // Hiện button Chi tiết CMS và gắn sự kiện
        const detailButton = cmsCard.querySelector('#custom-cms-detail-btn') as HTMLButtonElement;
        if (detailButton) {
            detailButton.style.display = 'block';
            detailButton.addEventListener('click', () => {
                openCMSDetailTab(maVanDon);
            });
        }

        console.log('[CMS] CMS section added successfully');
    }

    /**
     * Mở tab CMS để search mã vận đơn
     */
    function openCMSDetailTab(maVanDon: string) {
        console.log(`[CMS] Opening CMS detail for ${maVanDon}`);

        chrome.runtime.sendMessage({
            event: "CONTENTMY",
            type: "OPEN_CMS_SEARCH",
            payload: { itemCode: maVanDon }
        }, (response) => {
            if (response?.status === 'success') {
                console.log('[CMS] Tab opened successfully');
            } else {
                console.error('[CMS] Failed to open tab:', response?.error);
            }
        });
    }

    // ===== KẾT THÚC PHẦN CMS =====

    // Hàm để xử lý khi modal xuất hiện
    const processModal = (modalElement: Element) => {
        // 1. Tìm nút "Đánh giá" để làm điểm neo
        const reviewButton = modalElement.querySelector('button[title="Đánh giá"]');
        if (!reviewButton) {
            // Đôi khi nút chưa render kịp, chúng ta sẽ chờ ở lần kiểm tra sau
            return;
        }

        // 2. Luôn thêm "Thông tin thêm" vào dialog (hàm sẽ tự xóa cũ nếu có)
        addExtraInfoToDialog(modalElement);

        // 2.5. Thêm CMS info
        const getTextFromLabel = (container: Element, labelText: string): string => {
            const allThs = container.querySelectorAll('th');
            for (const th of allThs) {
                if (th.textContent?.trim().includes(labelText)) {
                    return th.nextElementSibling?.textContent?.trim() ?? '';
                }
            }
            return '';
        };
        const modalBody = modalElement.querySelector('.ant-modal-body');
        if (modalBody) {
            const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title'))
                .find(el => el.textContent?.includes('Đơn hàng'))
                ?.closest('.ant-card');
            if (orderCard) {
                const maVanDon = getTextFromLabel(orderCard, 'Mã vận đơn');
                if (maVanDon) {
                    addCMSInfoToModal(modalElement, maVanDon);
                }
            }
        }

        // 3. Kiểm tra xem nút của chúng ta đã được thêm vào chưa
        const existingButton = modalElement.querySelector('#custom-copy-info-btn');
        if (existingButton) {
            console.log('Các nút đã tồn tại, chỉ cập nhật thông tin thêm');
            return; // Đã có nút rồi, không cần thêm nút copy/khiếu nại nữa
        }

        console.log('Đang thêm các nút Copy/Khiếu nại/Hỗ trợ...');

        // 4. Tạo nút mới
        const copyButton = document.createElement('button');
        copyButton.id = 'custom-copy-info-btn';
        copyButton.textContent = 'Copy Thông tin';
        // Thêm các class yêu cầu
        copyButton.className = 'ant-btn ant-btn-default btn-outline-warning';
        // Thêm một chút khoảng cách cho đẹp
        copyButton.style.marginLeft = '8px';

        // 4. Gán sự kiện click để sao chép thông tin
        copyButton.onclick = () => {
            // Tìm thẻ cha chứa tất cả thông tin
            const modalBody = modalElement.querySelector('.ant-modal-body');
            if (!modalBody) {
                console.error("Không tìm thấy modal body!");
                return;
            }

            // --- Hàm trợ giúp để lấy text an toàn ---
            const getTextFromLabel = (container: Element, labelText: string): string => {
                const allThs = container.querySelectorAll('th');
                for (const th of allThs) {
                    // Dùng includes để linh hoạt hơn (ví dụ: "Họ và tên" và "Họ và tên ")
                    if (th.textContent?.trim().includes(labelText)) {
                        const td = th.nextElementSibling as HTMLElement;
                        // Lấy textContent và dọn dẹp khoảng trắng
                        return td?.textContent?.trim().replace(/\s+/g, ' ') ?? 'N/A';
                    }
                }
                return 'N/A';
            };

            // --- Trích xuất thông tin ---
            // Mã vận đơn nằm ở card "Đơn hàng"
            const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title')).find(el => el.textContent?.includes('Đơn hàng'))?.closest('.ant-card');

            // Các thông tin còn lại nằm ở card "Người nhận"
            const receiverCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title')).find(el => el.textContent?.includes('Người nhận'))?.closest('.ant-card');

            if (!orderCard || !receiverCard) {
                console.error("Không thể tìm thấy card thông tin đơn hàng hoặc người nhận.");
                alert("Lỗi: Không thể trích xuất thông tin.");
                return;
            }


            const maVanDon = getTextFromLabel(orderCard, 'Mã vận đơn');
            const hoTen = getTextFromLabel(receiverCard, 'Họ và tên');
            // Số điện thoại có thể có icon ẩn, lấy text là đủ
            const soDienThoaiRaw = getTextFromLabel(receiverCard, 'Số điện thoại');
            // Tách phần số điện thoại ra khỏi các text/icon thừa
            const soDienThoai = soDienThoaiRaw.split(' ')[0] || 'N/A';
            const diaChi = getTextFromLabel(receiverCard, 'Địa chỉ');

            // 5. Định dạng chuỗi để copy, giống với ví dụ của bạn
            const textToCopy = `${maVanDon}\n${hoTen}\n${soDienThoai}\n${diaChi}`;

            // 6. Copy vào clipboard
            navigator.clipboard.writeText(textToCopy).then(() => {
                console.log('Đã copy thông tin:', textToCopy);
                const originalText = copyButton.textContent;
                copyButton.textContent = 'Đã copy!';
                copyButton.disabled = true;
                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.disabled = false;
                }, 2000); // Reset lại nút sau 2 giây
            }).catch(err => {
                console.error('Lỗi khi copy: ', err);
                alert('Không thể tự động copy. Vui lòng thử lại.');
            });
        };

        // Chờ 1s để chạy hàm dưới (click để expand số điện thoại)
        const fullSDTView = document.querySelector("#custom-table-orderhdr-sender > tr:nth-child(2) > td > span > span") as HTMLElement;
        if (fullSDTView) {
            fullSDTView.click();
        } else {
            console.warn('Không tìm thấy element fullSDTView để click');
        }

        // 7. Chèn nút mới vào sau nút "Đánh giá"
        reviewButton.insertAdjacentElement('afterend', copyButton);
        console.log('Đã thêm nút "Copy Thông tin".');

        // --- BẮT ĐẦU PHẦN CODE MỚI ---
        const existingComplaintButton = modalElement.querySelector('#custom-complaint-btn');
        if (existingComplaintButton) {
            return; // Đã có nút rồi, không làm gì cả
        }

        const copy1Button = modalElement.querySelector('#custom-copy-info-btn');
        if (!copy1Button) {
            // Chờ nút copy được tạo ở lần kiểm tra sau
            return;
        }

        const complaintButton = document.createElement('button');
        complaintButton.id = 'custom-complaint-btn';
        complaintButton.textContent = 'Khiếu nại';
        complaintButton.className = 'ant-btn ant-btn-default'; // Thay đổi class nếu muốn
        complaintButton.style.marginLeft = '8px';

        complaintButton.onclick = () => {
            const modalBody = modalElement.querySelector('.ant-modal-body');
            if (!modalBody) {
                console.error("Không tìm thấy modal body!");
                return;
            }

            // Hàm trợ giúp để lấy text Mã vận đơn
            const getTextFromLabel = (container: Element, labelText: string): string => {
                const allThs = container.querySelectorAll('th');
                for (const th of allThs) {
                    if (th.textContent?.trim().includes(labelText)) {
                        return th.nextElementSibling?.textContent?.trim() ?? '';
                    }
                }
                return '';
            };

            const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title')).find(el => el.textContent?.includes('Đơn hàng'))?.closest('.ant-card');
            if (!orderCard) {
                alert('Lỗi: Không tìm thấy card thông tin đơn hàng.');
                return;
            }

            const itemCode = getTextFromLabel(orderCard, 'Mã vận đơn');

            if (!itemCode) {
                alert('Lỗi: Không lấy được mã vận đơn.');
                return;
            }

            console.log(`Bắt đầu quy trình Khiếu nại cho mã: ${itemCode}`);
            const token = localStorage.getItem('accessToken');

            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "CREATE_COMPLAINT",
                payload: {
                    itemCode: itemCode,
                    token: token,
                    type: 'complaint'
                }
            });
        };

        // Chèn nút "Khiếu nại" sau nút "Copy"
        copy1Button.insertAdjacentElement('afterend', complaintButton);
        console.log('Đã thêm nút "Khiếu nại".');
        const complaintButton1 = document.createElement('button');
        complaintButton1.id = 'custom-complaint-btn';
        complaintButton1.textContent = 'Hỗ trợ';
        complaintButton1.className = 'ant-btn ant-btn-default'; // Thay đổi class nếu muốn
        complaintButton1.style.marginLeft = '8px';

        complaintButton1.onclick = () => {
            const modalBody = modalElement.querySelector('.ant-modal-body');
            if (!modalBody) {
                console.error("Không tìm thấy modal body!");
                return;
            }

            // Hàm trợ giúp để lấy text Mã vận đơn
            const getTextFromLabel = (container: Element, labelText: string): string => {
                const allThs = container.querySelectorAll('th');
                for (const th of allThs) {
                    if (th.textContent?.trim().includes(labelText)) {
                        return th.nextElementSibling?.textContent?.trim() ?? '';
                    }
                }
                return '';
            };

            const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title')).find(el => el.textContent?.includes('Đơn hàng'))?.closest('.ant-card');
            if (!orderCard) {
                alert('Lỗi: Không tìm thấy card thông tin đơn hàng.');
                return;
            }

            const itemCode = getTextFromLabel(orderCard, 'Mã vận đơn');

            if (!itemCode) {
                alert('Lỗi: Không lấy được mã vận đơn.');
                return;
            }

            console.log(`Bắt đầu quy trình Hỗ trợ cho mã: ${itemCode}`);
            const token = localStorage.getItem('accessToken');

            chrome.runtime.sendMessage({
                event: "CONTENTMY",
                type: "CREATE_COMPLAINT",
                payload: {
                    itemCode: itemCode,
                    token: token,
                    type: 'support'
                }
            });
        };

        // Chèn nút "Khiếu nại" sau nút "Copy"
        copy1Button.insertAdjacentElement('afterend', complaintButton1);
        console.log('Đã thêm nút "Hỗ trợ".');
    };



    // Đơn giản hóa: Check modal định kỳ thay vì dùng observer phức tạp
    let lastProcessedMaVanDon = '';
    // @ts-ignore - checkInterval is used to store the interval reference
    let checkInterval: number | null = null;

    const checkAndProcessModal = () => {
        const modalElement = document.querySelector('div[role="dialog"]') as HTMLElement;

        // Nếu không có modal hoặc modal bị ẩn
        if (!modalElement || modalElement.style.display === 'none' || !modalElement.offsetParent) {
            // Modal đã đóng, reset
            if (lastProcessedMaVanDon) {
                console.log('[Modal Check] Modal đã đóng, reset tracking');
                lastProcessedMaVanDon = '';
            }
            return;
        }

        // Modal đang mở, check mã vận đơn
        const modalBody = modalElement.querySelector('.ant-modal-body');
        if (!modalBody) return;

        const orderCard = Array.from(modalBody.querySelectorAll('.ant-card-head-title'))
            .find(el => el.textContent?.includes('Đơn hàng'))
            ?.closest('.ant-card');

        if (!orderCard) return;

        // Lấy mã vận đơn
        const allThs = orderCard.querySelectorAll('th');
        let currentMaVanDon = '';
        for (const th of allThs) {
            if (th.textContent?.trim().includes('Mã vận đơn')) {
                currentMaVanDon = th.nextElementSibling?.textContent?.trim() ?? '';
                break;
            }
        }

        if (!currentMaVanDon) return;

        // Nếu mã vận đơn thay đổi
        if (currentMaVanDon !== lastProcessedMaVanDon) {
            console.log(`[Modal Check] Phát hiện mã vận đơn mới: "${currentMaVanDon}" (cũ: "${lastProcessedMaVanDon}")`);
            lastProcessedMaVanDon = currentMaVanDon;

            // Xóa container "Thông tin thêm" cũ
            const oldContainer = modalElement.querySelector('#custom-extra-info-container');
            if (oldContainer) {
                console.log('[Modal Check] Xóa container thông tin thêm cũ');
                oldContainer.remove();
            }

            // Xóa các nút cũ để tạo lại
            const oldCopyBtn = modalElement.querySelector('#custom-copy-info-btn');
            const oldComplaintBtn = modalElement.querySelector('#custom-complaint-btn');
            const oldSupportBtn = modalElement.querySelector('#custom-support-btn');

            if (oldCopyBtn) oldCopyBtn.remove();
            if (oldComplaintBtn) oldComplaintBtn.remove();
            if (oldSupportBtn) oldSupportBtn.remove();

            // Xử lý lại modal
            processModal(modalElement);
        }
    };

    // Check modal mỗi 500ms
    checkInterval = window.setInterval(checkAndProcessModal, 500);
    console.log('[Modal Check] Đã bắt đầu check modal định kỳ mỗi 500ms');
}