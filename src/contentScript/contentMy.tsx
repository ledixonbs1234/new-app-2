import { delay, waitForElm } from "./utils";
function forceChange(e: HTMLInputElement) {
    e.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    e.dispatchEvent(new Event("blur"));
}
var listDichVu = ["Tiêu chuẩn TMĐT ĐG", "Nhanh - TMĐT ĐG"]
var tinhKien = ['kon tum', 'gia lai', 'dak lak', 'binh dinh', 'phu yen', 'khanh hoa', 'quang nam', 'quang ngai', 'da nang']

window.onload = async () => {
    // 2. Định nghĩa selector cho phần tử chứa text đó.
    // Sử dụng attribute selector `[title="..."]` là cách rất ổn định.
    const targetSelector: string = `#form-create-order > div > div:nth-child(1) > div > div:nth-child(1) > div > div.ant-card-body > div > div:nth-child(2) > div:nth-child(1) > div > div.ant-col.ant-form-item-control > div > div`;
    // 3. Gọi hàm waitForElementWithText và truyền vào hành động bạn muốn làm
    console.log("Đang bắt đầu chờ hợp đồng...");
    onContentStateChange(targetSelector, async (element: Element) => {
        // `element` ở đây được TypeScript hiểu là kiểu `Element`.
        // Bắt đầu chạy
        await initialize();
        console.log("Đã tìm thấy phần tử hợp đồng!", element);

        // Tìm phần tử có class 'g-avatar'
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
        }














    });
    // Thực hiện các hành động khác...
};

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
function watchTextChange(element: HTMLElement, callback: (newText: string) => void) {
    const observer = new MutationObserver(() => {
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

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
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
    const observer = new MutationObserver(() => {
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
function observeForAddressInput(): void {
    const observer = new MutationObserver((mutationsList: MutationRecord[]) => {
        const addressInput = document.getElementById(ADDRESS_INPUT_ID) as HTMLInputElement | null;
        if (addressInput) {
            setupAddressSuggestion(addressInput);
            observer.disconnect();
            console.log("Đã tìm thấy và thiết lập cho ô địa chỉ. Dừng theo dõi DOM.");
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    const existingInput = document.getElementById(ADDRESS_INPUT_ID) as HTMLInputElement | null;
    if (existingInput) {
        setupAddressSuggestion(existingInput);
        observer.disconnect();
        console.log("Ô địa chỉ đã tồn tại. Dừng theo dõi DOM.");
    }
}