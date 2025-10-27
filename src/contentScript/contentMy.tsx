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
    if( fullAddressElement) {
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

    // Hàm để xử lý khi modal xuất hiện
    const processModal = (modalElement: Element) => {
       
        // 1. Kiểm tra xem nút của chúng ta đã được thêm vào chưa
        const existingButton = modalElement.querySelector('#custom-copy-info-btn');
        if (existingButton) {
            return; // Đã có nút rồi, không làm gì cả
        }

        // 2. Tìm nút "Đánh giá" để làm điểm neo
        const reviewButton = modalElement.querySelector('button[title="Đánh giá"]');
        if (!reviewButton) {
            // Đôi khi nút chưa render kịp, chúng ta sẽ chờ ở lần kiểm tra sau
            return;
        }

        // 3. Tạo nút mới
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
 //chờ 1s để chạy hàm dưới
        var fullSDTView = document.querySelector("#custom-table-orderhdr-sender > tr:nth-child(2) > td > span > span") as HTMLElement;
        fullSDTView.click();
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
            complaintButton.textContent = 'Đang xử lý...';
            complaintButton.disabled = true;
            const token = localStorage.getItem('accessToken');

            // Gửi message tới background script
            chrome.runtime.sendMessage({
                event: "CONTENTMY", // Event mới để phân biệt
                type: "CREATE_COMPLAINT",
                payload: {
                    itemCode: itemCode,
                    token: token,
                    type: 'complaint' // Thêm loại khiếu nại
                }
            }, (response) => {
                // Xử lý phản hồi từ background
                if (response && response.status === 'success') {
                    complaintButton.textContent = 'Đã gửi yêu cầu!';
                    setTimeout(() => {
                        complaintButton.textContent = 'Khiếu nại';
                        complaintButton.disabled = false;
                    }, 3000);
                } else {
                    alert(`Lỗi: ${response?.error || 'Không rõ nguyên nhân'}`);
                    complaintButton.textContent = 'Khiếu nại';
                    complaintButton.disabled = false;
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

            console.log(`Bắt đầu quy trình Khiếu nại cho mã: ${itemCode}`);
            complaintButton1.textContent = 'Đang xử lý...';
            complaintButton1.disabled = true;
            const token = localStorage.getItem('accessToken');

            // Gửi message tới background script
            chrome.runtime.sendMessage({
                event: "CONTENTMY", // Event mới để phân biệt
                type: "CREATE_COMPLAINT",
                payload: {
                    itemCode: itemCode,
                    token: token,
                    type: 'support' // Thêm loại hỗ trợ
                }
            }, (response) => {
                // Xử lý phản hồi từ background
                if (response && response.status === 'success') {
                    complaintButton1.textContent = 'Đã gửi yêu cầu!';
                    setTimeout(() => {
                        complaintButton1.textContent = 'Hỗ trợ';
                        complaintButton1.disabled = false;
                    }, 3000);
                } else {
                    alert(`Lỗi: ${response?.error || 'Không rõ nguyên nhân'}`);
                    complaintButton1.textContent = 'Hỗ trợ';
                    complaintButton1.disabled = false;
                }
            });
        };

        // Chèn nút "Khiếu nại" sau nút "Copy"
        copy1Button.insertAdjacentElement('afterend', complaintButton1);
        console.log('Đã thêm nút "Hỗ trợ".');
    };



    const observer = createAndTrackObserver(() => {
        const modalElement = document.querySelector('.ant-modal-wrap');
        if (modalElement) {
            processModal(modalElement);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}