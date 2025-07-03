import { Order } from "../popup/popup.slice";
import { delay, waitForElm } from "./utils";
function forceChange(e: HTMLInputElement) {
    e.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event("blur"));
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

    // .firstChild.textContent sẽ lấy chính xác text của phần tử này,
    // bỏ qua text của các phần tử con (như icon mũi tên xuống).
    const userName = nameElement.firstChild && nameElement.firstChild.textContent
        ? nameElement.firstChild.textContent.trim()
        : "";

    console.log(userName); console.log("Mã khách hàng:", userName);
    if (userName.indexOf("Lan") != -1) {
        // 2. Định nghĩa selector cho phần tử chứa text đó.
        // Sử dụng attribute selector `[title="..."]` là cách rất ổn định.
        const targetSelector: string = `#form-create-order > div > div:nth-child(1) > div > div:nth-child(1) > div > div.ant-card-body > div > div:nth-child(2) > div:nth-child(1) > div > div.ant-col.ant-form-item-control > div > div`;
        // 3. Gọi hàm waitForElementWithText và truyền vào hành động bạn muốn làm
        console.log("Đang bắt đầu chờ hợp đồng...");
        onContentStateChange(targetSelector, async (element: Element) => {

            console.log("Đã tìm thấy phần tử hợp đồng!", element);
            var de = document.querySelector("#form-create-order_weight") as HTMLInputElement;
            de.value = "2000";
            forceChange(de);
            var checkTaiBC = document.querySelector("#form-create-order_sendType > label:nth-child(2) > span.ant-radio > input") as HTMLInputElement;
            checkTaiBC.click()
            var noidung = document.querySelector("#form-create-order_contentNote") as HTMLInputElement;
            noidung.value = "Hoa Lan";
            forceChange(noidung);

            const receiverPhoneInput = document.querySelector("#form-create-order_receiverPhone") as HTMLInputElement | null;

            // Kiểm tra xem ô input có tồn tại không trước khi thực hiện hành động
            if (receiverPhoneInput) {
                console.log("Tìm thấy ô SĐT người nhận. Đang tiến hành focus...");

                // Sử dụng phương thức .focus() để đặt con trỏ vào ô input
                receiverPhoneInput.focus();
            }

            var selector = "#form-create-order > div > div:nth-child(1) > div > div:nth-child(2) > div > div.ant-card-body > div > div:nth-child(7) > div > div:nth-child(1) > div > div > div > div > div > div > div > span.ant-select-selection-item"
            const span = await waitForElement(selector);
            watchTextChange(span, async (newText) => {
                console.log("Nội dung mới của span:", newText);
                //nếu nội dụng mới không dấu giống với một trong danh sách tinhKien thì chon listDichVu[0] còn lại là chọn listDichVu[1]
                const normalizedText = removeDiacritics(newText.toLowerCase());
                console.log("Nội dung mới đã bỏ dấu:", normalizedText);
                const isTinhKien = tinhKien.some(tinh => normalizedText.includes(tinh));
                console.log("Có phải là tỉnh Kiên Giang không:", isTinhKien);

                var dichVu = "";

                if (isTinhKien) {
                    dichVu = listDichVu[0]; // Chọn dịch vụ đầu tiên trong danh sách
                } else {
                    dichVu = listDichVu[1]; // Chọn dịch vụ thứ hai trong danh sách
                }
                selectService(dichVu)
                await delay(1000);
                console.log("Danh sách dịch vụ hiện tại:", listDichVu);
                console.log("My Script Loaded after delay");


                console.log(`Đang chờ dịch vụ ' xuất hiện...`);
                const additionalService = "Phát hàng thu tiền COD";
                await setAdditionalService(additionalService, "280000");
                var chidan = document.querySelector("#form-create-order_deliveryInstruction") as HTMLInputElement;
                chidan.value = "";
                forceChange(chidan);
                var butonKoXem = document.querySelector("#form-create-order > div > div:nth-child(2) > div > div:nth-child(2) > div > div.ant-card-body > div:nth-child(3) > div.ant-col.ant-col-24.config-height > div > div > div.ant-col.ant-form-item-control > div > div > div > div:nth-child(1) > button") as HTMLButtonElement;
                butonKoXem.click();
                // doSomething(newText);
            });
        })















    } else if (userName.indexOf("Duy") != -1) {
        if (window.location.href.includes("https://my.vnpost.vn/order/domestic/create")) {
            createUI();
            updateUI();


            console.log("Đã khởi tạo UI cho Duy");
            await selectedDonMau("ĐƠN TRẮNG")
            onContentDisappearWithDelay('#form-create-order_contentNote', async () => {
                console.log("Đã phát hiện phần tử rc_select_0 biến mất, đang tự động chọn đơn mẫu...");
                await selectedDonMau("ĐƠN TRẮNG")

            });

        }
    }
    // Thực hiện các hành động khác...


}

// <<< THAY ĐỔI 4: Thiết lập trình lắng nghe tin nhắn một lần >>>
/**
 * Lắng nghe tin nhắn từ background script và các phần khác của extension.
 * Trình lắng nghe này chỉ được đăng ký MỘT LẦN.
 */
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
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
    } else
        if (message.type === "GET_MYPOST_TOKEN") {
            const token = localStorage.getItem('accessToken');
            sendResponse({ token: token || null });
            return true; // Giữ kênh mở cho phản hồi bất đồng bộ
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
// MY HO DUY///////////////////////////////////////////////////
function createUI() {
    if(!document.getElementById('fulladdress')){
        var khungCanInsert  = document .querySelector("#form-create-order > div > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div > div.ant-card-body > div > div:nth-child(5)") as HTMLDivElement;
        //insert tag p nằm vị trí kế tiếp của khungCanInsert
        var fullAddress = document.createElement("p");
        fullAddress.id = "fulladdress";
        fullAddress.style.fontSize = "14px";
        fullAddress.style.color = "#1890ff";
        fullAddress.style.marginTop = "10px";
        fullAddress.textContent = "Địa chỉ đầy đủ sẽ hiện thị tại đây";

        khungCanInsert.insertAdjacentElement("afterend", fullAddress);
    }
    if (document.getElementById('auto-fill-container')) return;

    uiContainer = document.createElement('div');
    uiContainer.id = 'auto-fill-container';

    Object.assign(uiContainer.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999',
        backgroundColor: '#ffffff',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        fontFamily: 'system-ui, sans-serif'
    });

    const backButton = document.createElement('button');
    backButton.id = 'auto-fill-back';
    backButton.textContent = '<< Quay lại';
    backButton.onclick = handleGoBack;

    const fillButton = document.createElement('button');
    fillButton.id = 'auto-fill-next';
    fillButton.textContent = 'Điền đơn >>';
    fillButton.onclick = handleFillData;

    [backButton, fillButton].forEach(button => {
        Object.assign(button.style, {
            padding: '8px 14px',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            backgroundColor: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '14px',
        });
        button.onmouseover = () => button.style.borderColor = '#40a9ff';
        button.onmouseout = () => button.style.borderColor = '#d9d9d9';
    });

    fillButton.style.backgroundColor = '#1890ff';
    fillButton.style.color = 'white';

    uiContainer.appendChild(backButton);
    uiContainer.appendChild(fillButton);

    document.body.appendChild(uiContainer);
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

function handleFillData() {
    chrome.runtime.sendMessage({ type: "FILL_NEXT" }, async (response) => {
        if (response && response.order) {
            await populateForm(response.order);
        }
        updateUI();
    });
}

function handleGoBack() {
    chrome.runtime.sendMessage({ type: "GO_BACK" }, (response) => {
        if (response && response.order) {
            populateForm(response.order);
        }
        updateUI();
    });
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
// Hàm tạo ra một khoảng trễ có thể `await`

async function selectService(dichVu: string) {
    console.log(`Bắt đầu chọn dịch vụ: ${dichVu}`);

    // 1. Tìm ô chọn dịch vụ
    const serviceSelectInput = document.getElementById('form-create-order_serviceCode');
    if (!serviceSelectInput) {
        console.error("Không tìm thấy ô nhập liệu dịch vụ.");
        return;
    }

    const clickableSelectBox = serviceSelectInput.closest('.ant-select-selector');
    if (!clickableSelectBox) {
        console.error("Không tìm thấy ô chọn dịch vụ để click.");
        return;
    }

    // 2. Mở danh sách
    simulateRealClick(clickableSelectBox as HTMLElement);
    console.log("Đã click để mở danh sách, đang chờ...");

    // 3. Chờ một khoảng thời gian cố định (thay thế cho setTimeout)
    await delay(800);

    // 4. Tìm và click vào lựa chọn
    const options = document.querySelectorAll<HTMLElement>('.ant-select-item-option-content');
    let foundOption: HTMLElement | null = null;

    options.forEach(option => {
        if (option.textContent && option.textContent.trim() === dichVu) {
            foundOption = option.closest('.ant-select-item');
        }
    });

    if (foundOption) {
        console.log("Đã tìm thấy dịch vụ! Đang tiến hành chọn...");
        simulateRealClick(foundOption as HTMLElement);
        console.log(`THÀNH CÔNG! Đã tự động chọn dịch vụ '${dichVu}'.`);
    } else {
        console.error(`LỖI: Không tìm thấy dịch vụ '${dichVu}' trong danh sách.`);
        // Đóng dropdown lại
        simulateRealClick(clickableSelectBox as HTMLElement);
    }
}

async function selectedDonMau(tenDonMau: string) {
    console.log(`Bắt đầu chọn dịch vụ: ${tenDonMau}`);

    // 1. Tìm ô chọn dịch vụ
    // await waitForElm('#rc_select_0')

    const serviceSelectInput = await findSelectNextToText("Đơn hàng mẫu")
    if (!serviceSelectInput) {
        console.error("Không tìm thấy ô nhập liệu dịch vụ.");
        return;
    }

    // const clickableSelectBox = serviceSelectInput.closest('.ant-select-selection-placeholder');
    // if (!clickableSelectBox) {
    //     console.error("Không tìm thấy ô chọn dịch vụ để click.");
    //     return;
    // }

    // 2. Mở danh sách
    simulateRealClick(serviceSelectInput as HTMLElement);
    console.log("Đã click để mở danh sách, đang chờ...");

    // 3. Chờ một khoảng thời gian cố định (thay thế cho setTimeout)
    await delay(800);

    // 4. Tìm và click vào lựa chọn
    const options = document.querySelectorAll<HTMLElement>('.ant-select-item-option');
    let foundOption: HTMLElement | null = null;

    options.forEach(option => {
        if (option.textContent && option.textContent.trim() === tenDonMau) {
            foundOption = option.closest('.ant-select-item');
        }
    });

    if (foundOption) {
        console.log("Đã tìm thấy dịch vụ! Đang tiến hành chọn...");
        simulateRealClick(foundOption as HTMLElement);
        console.log(`THÀNH CÔNG! Đã tự động chọn dịch vụ '${tenDonMau}'.`);
    }
}
function watchTextChange(element: HTMLElement, callback: (newText: string) => void) {
    const observer = createAndTrackObserver(() => {
        callback(element.textContent ?? "");
    });

    observer.observe(element, {
        characterData: true,
        subtree: true,
        childList: true,
    });

    // Gọi callback lần đầu nếu cần
    callback(element.textContent ?? "");
}
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
// Hàm chờ một phần tử trong danh sách dropdown xuất hiện

async function setAdditionalService(serviceName: string, value: string): Promise<boolean> {
    console.log(`[2] Bắt đầu xử lý dịch vụ cộng thêm: '${serviceName}' với giá trị '${value}'`);

    let targetRow: HTMLElement | null = null;
    await waitForCondition(() => {
        // Kiểm tra xem có ít nhất một hàng trong bảng
        const rowCount = document.querySelectorAll('#scrollableDiv table tr').length;
        return rowCount > 1;
    }, 5000);
    const rows = document.querySelectorAll<HTMLElement>('#scrollableDiv table tr');
    // Tìm đúng hàng chứa dịch vụ
    for (const row of rows) {
        const nameCell = row.querySelector<HTMLElement>('td:nth-child(2)');
        if (nameCell?.textContent?.trim() === serviceName) {
            targetRow = row;
            break;
        }
    }

    if (!targetRow) {
        console.error(`>> LỖI: Không tìm thấy hàng của dịch vụ '${serviceName}'.`);
        return false;
    }

    // --- Bước 2.1: Check vào checkbox ---
    const checkboxInput = targetRow.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const labelToClick = targetRow.querySelector<HTMLElement>('label');

    if (!checkboxInput || !labelToClick) {
        console.error("Không tìm thấy checkbox trên hàng dịch vụ.");
        return false;
    }

    if (!checkboxInput.checked) {
        console.log(`Đang check vào '${serviceName}'...`);
        simulateRealClick(labelToClick);
        // Chờ một chút để ô input hiện ra
        await new Promise(resolve => setTimeout(resolve, 500));
    } else {
        console.log(`Dịch vụ '${serviceName}' đã được check từ trước.`);
    }

    // --- Bước 2.2: Tìm và điền giá trị vào ô input ---
    // Tìm input số trong cùng hàng đó (thường có class ant-input-number-input)
    const valueInput = targetRow.querySelector<HTMLInputElement>('.ant-input-number-input');

    if (valueInput) {
        console.log(`Đang điền giá trị '${value}'...`);
        simulateReactInput(valueInput, value);
        console.log(`>> THÀNH CÔNG: Đã điền xong dịch vụ cộng thêm.`);
        return true;
    } else {
        console.error(`>> LỖI: Đã check được dịch vụ nhưng không tìm thấy ô để nhập giá trị.`);
        return false;
    }
}

/**
 * Chờ cho đến khi một điều kiện được thỏa mãn hoặc hết thời gian.
 * @param conditionFunction Hàm trả về boolean. Việc chờ đợi sẽ kết thúc khi hàm này trả về true.
 * @param timeout Thời gian chờ tối đa (miliseconds).
 * @param checkInterval Khoảng thời gian giữa mỗi lần kiểm tra (miliseconds).
 * @returns Promise sẽ resolve khi điều kiện đúng, hoặc reject khi hết thời gian.
 */
function waitForCondition(
    conditionFunction: () => boolean,
    timeout: number = 5000,
    checkInterval: number = 200
): Promise<void> {
    return new Promise((resolve, reject) => {
        let elapsedTime = 0;
        const interval = setInterval(() => {
            if (conditionFunction()) {
                clearInterval(interval);
                resolve();
            } else {
                elapsedTime += checkInterval;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`Hết thời gian chờ (${timeout}ms) nhưng điều kiện vẫn chưa được thỏa mãn.`));
                }
            }
        }, checkInterval);
    });
}
// Hàm mô phỏng việc nhập liệu vào một ô input của React
function simulateReactInput(inputElement: HTMLInputElement, text: string) {
    // Để React ghi nhận giá trị, cần phải thiết lập value thông qua prototype
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(inputElement, text);

    // Kích hoạt các sự kiện mà React lắng nghe
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });

    inputElement.dispatchEvent(inputEvent);
    inputElement.dispatchEvent(changeEvent);
}

/**
 * Chờ cho một phần tử xuất hiện trong DOM khớp với selector và chứa một đoạn text nhất định.
 * Sử dụng MutationObserver để theo dõi thay đổi một cách hiệu quả.
 *
 * @param selector - Chuỗi CSS selector để tìm phần tử.
 * @param text - Đoạn text cần có trong textContent hoặc title của phần tử.
 * @param callback - Hàm sẽ được gọi khi tìm thấy phần tử, nhận phần tử đó làm đối số.
 */
function waitForElementWithText(
    selector: string,
    text: string,
    callback: (element: Element) => void
): void {
    // Hàm kiểm tra xem phần tử đã xuất hiện chưa.
    // Trả về true nếu tìm thấy và đã thực thi callback, ngược lại trả về false.
    const checkElement = (): boolean => {
        // document.querySelector trả về Element | null
        const element: Element | null = document.querySelector(selector);

        // Kiểm tra xem element có tồn tại và khớp với điều kiện text không
        if (element && (element.textContent?.includes(text) || element.getAttribute('title')?.includes(text))) {
            // Nếu tìm thấy, gọi callback và dừng việc quan sát
            if (observer) {
                observer.disconnect();
            }
            callback(element);
            return true;
        }
        return false;
    };

    // Nếu phần tử đã có sẵn, không cần observer
    if (checkElement()) {
        return;
    }

    // Nếu chưa, tạo một MutationObserver
    const observer: MutationObserver = new MutationObserver((mutationsList: MutationRecord[], obs: MutationObserver) => {
        // Chỉ cần kiểm tra lại khi có thay đổi trong DOM
        if (checkElement()) {
            // Khi đã tìm thấy, không cần lặp qua các mutation khác
            return;
        }
    });

    // Bắt đầu quan sát toàn bộ body của trang
    // `childList`: theo dõi việc thêm/xóa các node con.
    // `subtree`: theo dõi các thay đổi trong toàn bộ cây con của document.body.
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

/**
 * Theo dõi trạng thái của một phần tử trong DOM và thực thi một callback
 * mỗi khi nó chuyển từ trạng thái "trống/không tồn tại" sang có nội dung mong muốn.
 *
 * @param selector - Chuỗi CSS selector để xác định phần tử.
 * @param targetText - Văn bản mục tiêu mà nội dung của phần tử phải khớp.
 * @param callback - Hàm chứa code chính, sẽ được thực thi mỗi khi trạng thái thay đổi thỏa mãn.
 */
function onContentStateChange(
    selector: string,
    callback: (element: HTMLElement) => void
): void {
    // Biến trạng thái để theo dõi xem nội dung có đang hiển thị hay không
    let isContentVisible = false;

    const handleStateCheck = () => {
        const element = document.querySelector(selector) as HTMLElement | null;
        const isCurrentlyVisible =
            element && (element.textContent?.trim().length != 0 || element.title?.trim().length != 0);

        if (isCurrentlyVisible && !isContentVisible) {
            // TRẠNG THÁI THAY ĐỔI: Từ KHÔNG hiển thị -> SANG hiển thị
            // -> Đây là thời điểm chúng ta cần chạy code
            isContentVisible = true;
            console.log('Phát hiện thay đổi: Nội dung đã xuất hiện.');
            callback(element);
        } else if (!isCurrentlyVisible && isContentVisible) {
            // TRẠNG THÁI THAY ĐỔI: Từ đang hiển thị -> SANG KHÔNG hiển thị
            // -> Reset lại trạng thái để sẵn sàng cho lần xuất hiện tiếp theo
            isContentVisible = false;
            console.log('Nội dung đã bị ẩn/thay đổi. Đang chờ xuất hiện lại...');
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
        attributes: true, // Quan trọng để bắt thay đổi của 'title' và 'textContent'
        characterData: true // Quan trọng để bắt thay đổi trực tiếp của text node
    });

    // Kiểm tra trạng thái ban đầu ngay khi hàm được gọi
    handleStateCheck();
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

// Định nghĩa cấu trúc của một trường tìm kiếm
interface SearchField {
    name?: string;
    normalized: string;
    weight: number;
    type: 'XP' | 'QH' | 'TTP';
}

// Định nghĩa các hằng số ID element
const ELEMENT_IDS = {
    RECEIVER_ADDRESS: "form-create-order_receiverAddress",
    GHOST_INPUT: "ghost-address-input-suggestion",
};

// Khai báo các biến toàn cục với kiểu dữ liệu
let isTabed: boolean = false;
let isEndsWithMatch: boolean = false; // Biến này cần được khai báo

/**
 * Tìm kiếm gợi ý địa chỉ phức tạp dựa trên input của người dùng,
 * tính điểm và ưu tiên các kết quả khớp ngữ cảnh.
 * @param inputText - Văn bản người dùng đã gõ.
 */
function findSuggestions(inputText: string): void {
    const ghost = document.getElementById(ELEMENT_IDS.GHOST_INPUT) as HTMLInputElement | null;
    const receiverInput = document.getElementById(ELEMENT_IDS.RECEIVER_ADDRESS) as HTMLInputElement | null;

    if (!ghost || !receiverInput) {
        console.error("Không tìm thấy ghost input hoặc receiver input.");
        return;
    }

    if (!inputText || inputText.trim().length < 2) {
        ghost.value = '';
        currentSuggestion = null;
        return;
    }


    const trimmedInput = inputText.trim();
    const normalizedInput = normalizeText(trimmedInput);

    let bestMatchItem: AddressItem | null = null;
    let matchedLevel: 'XP' | 'QH' | 'TTP' | null = null;
    let highestScore: number = -1;
    let matchedOriginalString: string = '';

    for (const item of addressData) {
        const normalizedXP = normalizeText(item.NameXPKD || item.NameXPN || item.NameXP);
        const normalizedQH = normalizeText(item.NameQHKD || item.NameQHN || item.NameQH);
        const normalizedTTP = normalizeText(item.NameTTPKD || item.NameTTPN || item.NameTTP);

        const searchFields: SearchField[] = [
            { name: item.NameXP || item.NameXPN || item.NameXPKD, normalized: normalizedXP, weight: 3, type: 'XP' },
            { name: item.NameQH || item.NameQHN || item.NameQHKD, normalized: normalizedQH, weight: 2, type: 'QH' },
            { name: item.NameTTP || item.NameTTPN || item.NameTTPKD, normalized: normalizedTTP, weight: 1, type: 'TTP' }
        ];

        for (const field of searchFields) {
            if (field.normalized) {
                const currentNormalizedField = field.normalized;
                let currentScore = 0;
                let matchIndex = -1;

                if (normalizedInput.endsWith(currentNormalizedField)) {
                    isEndsWithMatch = true;
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
                    let remainingInput = '';
                    if (indexAfterMatch < inputText.length) {
                        remainingInput = inputText.substring(indexAfterMatch);
                    }
                    const normalizedRemainingInput = normalizeText(remainingInput.trim().replace(/^,?\s*/, ''));

                    if (normalizedRemainingInput) {
                        let nextLevelNormalized = '';
                        if (field.type === 'XP') nextLevelNormalized = normalizedQH;
                        else if (field.type === 'QH') nextLevelNormalized = normalizedTTP;

                        if (nextLevelNormalized && nextLevelNormalized.startsWith(normalizedRemainingInput)) {
                            currentScore += 1000;
                        }
                    }
                }

                if (currentScore > highestScore) {
                    highestScore = currentScore;
                    bestMatchItem = item;
                    matchedOriginalString = field.normalized;
                    matchedLevel = field.type;
                }
            }
        }
    }

    if (bestMatchItem && matchedLevel) {
        const lastIndex = normalizedInput.lastIndexOf(matchedOriginalString.toLowerCase());
        const indexAfterMatch = lastIndex !== -1 ? lastIndex + matchedOriginalString.length : -1;

        let remainingInput = '';
        if (indexAfterMatch !== -1 && indexAfterMatch < inputText.length) {
            remainingInput = inputText.substring(indexAfterMatch);
        }
        const normalizedRemainingInput = normalizeText(remainingInput.trim().replace(/^,?\s*/, ''));

        const useFormatted = inputContainsTypeKeyword(inputText);

        const getPartString = (item: AddressItem, level: 'XP' | 'QH' | 'TTP', useFmt: boolean): string => {
            let name: string | undefined;
            if (level === 'XP') name = useFmt ? (item.NameXP || item.NameXPKD) : (item.NameXPN || item.NameXPKD);
            else if (level === 'QH') name = useFmt ? (item.NameQH || item.NameQHKD) : (item.NameQHN || item.NameQHKD);
            else if (level === 'TTP') name = useFmt ? (item.NameTTP || item.NameTTPKD) : (item.NameTTPN || item.NameTTPKD);
            return name ? name.toLowerCase() : '';
        };

        const appendedParts: string[] = [];
        let nextSuggestionPartNormalized = '';

        if (matchedLevel === 'XP') {
            const qhPart = getPartString(bestMatchItem, 'QH', useFormatted);
            if (qhPart) {
                appendedParts.push(qhPart);
                if (!nextSuggestionPartNormalized) nextSuggestionPartNormalized = normalizeText(qhPart);
            }
            const ttpPart = getPartString(bestMatchItem, 'TTP', useFormatted);
            if (ttpPart) {
                appendedParts.push(ttpPart);
                if (!nextSuggestionPartNormalized) nextSuggestionPartNormalized = normalizeText(ttpPart);
            }
        } else if (matchedLevel === 'QH') {
            const ttpPart = getPartString(bestMatchItem, 'TTP', useFormatted);
            if (ttpPart) {
                appendedParts.push(ttpPart);
                if (!nextSuggestionPartNormalized) nextSuggestionPartNormalized = normalizeText(ttpPart);
            }
        }

        const shouldShowSuggestion = appendedParts.length > 0 &&
            (!normalizedRemainingInput || (nextSuggestionPartNormalized && nextSuggestionPartNormalized.startsWith(normalizedRemainingInput)));

        if (shouldShowSuggestion) {
            let suggestionSuffix = appendedParts.join(' ');

            let separator = ', ';
            if (inputText.endsWith(',') || inputText.endsWith(', ') || remainingInput.trim().startsWith(',')) {
                separator = ' ';
            } else if (inputText.endsWith(' ')) {
                separator = '';
            } else if (remainingInput.trim() === '' && !inputText.endsWith(' ')) {
                separator = ' ';
            } else if (remainingInput.trim() !== '' && !remainingInput.startsWith(' ') && !remainingInput.startsWith(',')) {
                separator = ' ';
            } else {
                separator = '';
            }

            const trimmedRemaining = remainingInput.trimStart().replace(/^,?\s*/, '');
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
                ghost.value = '';
                currentSuggestion = null;
            }
        } else {
            ghost.value = '';
            currentSuggestion = null;
        }
    } else {
        ghost.value = '';
        currentSuggestion = null;
    }
}

const inputContainsTypeKeyword = (input: any) => {
    const normalized = normalizeText(input);
    return /\b(phuong|xa|thi tran|quan|huyen|thi xa|tinh|thanh pho)\b/.test(normalized);
};

/**
 * Gắn các listener cần thiết vào ô input địa chỉ.
 * @param addressInput - Element input địa chỉ.
 */
function setupAddressSuggestion(addressInput: HTMLInputElement): void {
    // Tránh gắn listener nhiều lần bằng cách sử dụng một thuộc tính tùy chỉnh
    if ((addressInput as any)._suggestionSetup) return;
    console.log("Thiết lập gợi ý cho:", addressInput.id);

    // 1. Tạo và chèn "Ghost Input"
    if (!document.getElementById(GHOST_INPUT_ID)) {
        ghostInput = document.createElement("input");
        ghostInput.id = GHOST_INPUT_ID;
        ghostInput.type = "text";
        ghostInput.setAttribute("readonly", "true");
        ghostInput.setAttribute("tabindex", "-1");
        Object.assign(ghostInput.style, {
            position: "absolute",
            color: "lightgrey",
            border: "none",
            backgroundColor: "transparent",
            zIndex: "1",
        });

        const syncStyles = () => {
            if (!addressInput.isConnected || !ghostInput) return;
            const computedStyle = getComputedStyle(addressInput);
            const propertiesToSync = ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'padding', 'margin', 'borderRadius', 'boxSizing'];
            propertiesToSync.forEach(prop => {
                ghostInput!.style[prop as any] = computedStyle[prop as any];
            });
            ghostInput.style.width = `${addressInput.offsetWidth}px`;
            ghostInput.style.height = `${addressInput.offsetHeight}px`;
            ghostInput.style.left = `${addressInput.offsetLeft}px`;
            ghostInput.style.top = `${addressInput.offsetTop}px`;
        };

        addressInput.parentElement!.style.position = "relative";
        addressInput.parentElement!.insertBefore(ghostInput, addressInput);

        Object.assign(addressInput.style, {
            position: "relative",
            zIndex: "2",
            backgroundColor: "transparent",
        });

        syncStyles();
        new ResizeObserver(debounce(syncStyles, 50)).observe(addressInput);
    } else {
        ghostInput = document.getElementById(GHOST_INPUT_ID) as HTMLInputElement;
    }

    // 2. Gắn listener 'input' với debounce
    const debouncedFinder = debounce(findSuggestions, 200);
    addressInput.addEventListener('input', (event: Event) => {
        const target = event.target as HTMLInputElement;
        debouncedFinder(target.value);
    });

    // 3. Gắn listener 'keydown' để hoàn thành gợi ý
    addressInput.addEventListener('keydown', (event: KeyboardEvent) => {
        if ((event.key === 'Tab' || event.key === 'ArrowRight') && currentSuggestion && addressInput.selectionStart === addressInput.value.length) {
            event.preventDefault();
            addressInput.value = currentSuggestion;
            forceChange(addressInput);
            if (ghostInput) ghostInput.value = '';
            currentSuggestion = null;
        } else if (['ArrowLeft', 'Backspace', 'Delete'].includes(event.key)) {
            if (ghostInput) ghostInput.value = '';
            currentSuggestion = null;
        }
    });

    // 4. Xóa gợi ý khi input bị mất focus
    addressInput.addEventListener('blur', () => {
        if (ghostInput) ghostInput.value = '';
        currentSuggestion = null;
    });

    (addressInput as any)._suggestionSetup = true;
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
            observeForAddressInput();
        } else {
            console.error("Định dạng data.json không hợp lệ.");
        }
    } catch (error) {
        console.error("Lỗi khi tải data.json:", error);
    }
}

/**
 * Sử dụng MutationObserver để tìm ô input địa chỉ khi nó xuất hiện trên trang.
 */
/**
 * Sử dụng MutationObserver để liên tục tìm các ô input địa chỉ mới xuất hiện trên trang.
 * Hàm này đủ mạnh để xử lý việc các component bị render lại trong SPA.
 */
function observeForAddressInput(): void {
    // Hàm này sẽ kiểm tra và thiết lập cho input nếu cần
    const checkAndSetup = () => {
        const addressInput = document.getElementById(ADDRESS_INPUT_ID) as HTMLInputElement | null;

        // Nếu tìm thấy input và nó chưa được thiết lập...
        if (addressInput && !(addressInput as any)._suggestionSetup) {
            setupAddressSuggestion(addressInput);
        }
    };

    const observer = new MutationObserver((mutationsList: MutationRecord[]) => {
        // Mỗi khi có sự thay đổi trong DOM, ta chỉ cần gọi hàm kiểm tra
        // Không cần lặp qua mutationsList, vì có thể có quá nhiều thay đổi không liên quan.
        // Chỉ cần quét lại phần tử ta quan tâm là đủ.
        checkAndSetup();
    });

    observer.observe(document.body, {
        childList: true, // theo dõi việc thêm/xóa node
        subtree: true    // theo dõi toàn bộ cây DOM con
    });

    // Rất quan trọng: Kiểm tra ngay lập tức khi hàm được gọi
    // để xử lý trường hợp input đã tồn tại sẵn khi script chạy.
    console.log("Bắt đầu theo dõi DOM để tìm ô địa chỉ...");
    checkAndSetup();
}


/**
 * Tìm một ô Ant Design Select nằm ngay bên cạnh một đoạn văn bản cụ thể.
 * @param {string} textContent - Văn bản chính xác của element neo (ví dụ: 'Đơn hàng mẫu').
 * @returns {Promise<HTMLElement | null>} - Trả về phần tử .ant-select-selector hoặc null nếu không tìm thấy.
 */
async function findSelectNextToText(textContent: string) {
    try {
        // 1. Chờ cho element chứa text xuất hiện.
        // Chúng ta không thể dùng querySelector đơn giản vì text có thể chưa render.
        // Dùng một hàm chờ tùy chỉnh.
        const textElement = await waitForElementWithTextContent('b', textContent) as HTMLElement;
        if (!textElement) {
            console.warn(`Không tìm thấy element 'b' với text "${textContent}".`);
            return null;
        }
        console.log(`Đã tìm thấy element neo:`, textElement);

        // 2. Đi ra thẻ cha là .ant-space-item
        const parentSpaceItem = textElement.closest('.ant-space-item');
        if (!parentSpaceItem) {
            console.error(`Không tìm thấy thẻ cha .ant-space-item cho text: "${textContent}"`);
            return null;
        }
        console.log(`Đã tìm thấy thẻ cha:`, parentSpaceItem);

        // 3. Đi sang thẻ "anh em" (.ant-space-item) tiếp theo
        const siblingSpaceItem = parentSpaceItem.nextElementSibling;
        if (!siblingSpaceItem || !siblingSpaceItem.classList.contains('ant-space-item')) {
            console.error(`Không tìm thấy thẻ "anh em" .ant-space-item.`);
            return null;
        }
        console.log(`Đã tìm thấy thẻ anh em:`, siblingSpaceItem);

        // 4. Từ thẻ anh em, tìm ô select có thể click
        const clickableSelectBox = siblingSpaceItem.querySelector('.ant-select-selector');
        if (!clickableSelectBox) {
            console.error(`Không tìm thấy .ant-select-selector trong thẻ anh em.`);
            return null;
        }

        console.log(`THÀNH CÔNG: Đã tìm thấy ô select cho "${textContent}"`);
        return clickableSelectBox;

    } catch (error) {
        console.error(`Đã xảy ra lỗi khi tìm select bên cạnh text "${textContent}":`, error);
        return null;
    }
}

/**
 * Hàm tiện ích chờ một element xuất hiện dựa vào selector và text content.
 * @param {string} selector - CSS selector của element.
 * @param {string} text - Văn bản cần khớp chính xác (trim).
 * @returns {Promise<HTMLElement | null>}
 */
function waitForElementWithTextContent(selector: any, text: string) {
    return new Promise((resolve) => {
        const check = () => {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.textContent?.trim() === text) {
                    return el;
                }
            }
            return null;
        };

        let element = check();
        if (element) {
            resolve(element);
            return;
        }

        const observer = createAndTrackObserver(() => { // Sử dụng hàm đã có
            element = check();
            if (element) {
                observer.disconnect();
                activeObservers = activeObservers.filter(o => o !== observer);
                resolve(element);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
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