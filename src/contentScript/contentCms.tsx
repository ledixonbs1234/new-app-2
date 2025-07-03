import { delay } from "./utils";

console.log("CMS Content Script Loaded!");

/**
 * Hàm chờ một element xuất hiện trong DOM.
 * @param selector CSS selector của element
 * @param timeout Thời gian chờ tối đa
 * @returns Promise chứa HTMLElement hoặc null
 */
function waitForElement(selector: string, timeout = 10000): Promise<HTMLElement | null> {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector) as HTMLElement);
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector) as HTMLElement);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

/**
 * Hàm chờ một element thay đổi thuộc tính style (ví dụ: display)
 * @param selector CSS selector của element
 * @param styleProp Tên thuộc tính style (vd: 'display')
 * @param expectedValue Giá trị mong muốn (vd: 'block')
 * @param timeout Thời gian chờ
 * @returns Promise chứa HTMLElement hoặc null
 */
function waitForStyleChange(selector: string, styleProp: keyof CSSStyleDeclaration, expectedValue: string, timeout = 10000): Promise<HTMLElement | null> {
    return new Promise(async (resolve) => {
        const element = await waitForElement(selector, timeout);
        if (!element) {
            return resolve(null);
        }

        // Kiểm tra điều kiện ban đầu
        if ((element.style as any)[styleProp] === expectedValue) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            // Kiểm tra lại điều kiện khi có thay đổi
            if ((element.style as any)[styleProp] === expectedValue) {
                observer.disconnect();
                resolve(element);
            }
        });

        // Chỉ quan sát thuộc tính của element đó
        observer.observe(element, { attributes: true, attributeFilter: ['style'] });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}


chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === "PREPARE_COMPLAINT_FORM") {
        console.log("Nhận được dữ liệu khiếu nại:", request.payload);
        const { orgCode, serviceCode, itemCode, type } = request.payload;

        try {
            // 1. Chờ và click nút "Thêm mới"
            const addButton = await waitForElement('#btnAdd');
            if (!addButton) throw new Error('Không tìm thấy nút "Thêm mới" (#btnAdd).');
            console.log('Đã tìm thấy nút Thêm mới, đang click...');
            addButton.click();

            // 2. Chờ panel/modal hiện ra
            // Điều kiện là #chooseService có style display: block
            console.log('Đang chờ panel khiếu nại hiện ra...');
            const chooseServicePanel = await waitForStyleChange('#chooseService', 'display', 'block');
            if (!chooseServicePanel) throw new Error('Panel khiếu nại không hiện ra (dựa vào #chooseService).');
            console.log('Panel khiếu nại đã hiện. Đang click nút Chọn dịch vụ...');

            // 3. Click nút "Chọn dịch vụ"
            const chooseServiceButton = document.getElementById('btnChooseService') as HTMLButtonElement;
            if (!chooseServiceButton) throw new Error('Không tìm thấy nút "Chọn dịch vụ" (#btnChooseService).');
            chooseServiceButton.click();

            // TODO: Các bước tiếp theo để điền form sẽ được thêm vào đây
            // Ví dụ:
            await delay(1000); // Chờ 1 giây để đảm bảo form đã sẵn sàng
            const codeInput = await waitForElement('#inpComplaintPostageNumber');
            if (codeInput) (codeInput as HTMLInputElement).value = itemCode;

            const orgCodeInput = await waitForElement('#txtcuscode');
            if (orgCodeInput) (orgCodeInput as HTMLInputElement).value = orgCode;
            // 5. Chọn dịch vụ
            console.log(`Đang tìm dịch vụ với code: ${serviceCode}...`);
            const serviceSelect = document.getElementById('slService') as HTMLSelectElement;
            if (!serviceSelect) throw new Error('Không tìm thấy thẻ select dịch vụ #slService.');

            // Tìm option có data-code khớp với serviceCode
            const targetOption = serviceSelect.querySelector(`option[data-code="${serviceCode}"]`) as HTMLOptionElement;

            if (targetOption) {
                // Lấy value của option đó
                const targetValue = targetOption.value;
                console.log(`Đã tìm thấy dịch vụ: "${targetOption.textContent?.trim()}" với value "${targetValue}"`);

                // Cập nhật giá trị cho thẻ select gốc
                serviceSelect.value = targetValue;

                // *** BẮT ĐẦU THAY ĐỔI: SỬA LỖI CSP ***
                // Dispatch sự kiện "change" để các listener khác của trang web (nếu có) nhận biết
                serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));

                // Tạo và dispatch một CustomEvent mà thư viện Chosen lắng nghe
                // Tên sự kiện 'chosen:updated' là chuẩn của thư viện này.
                const chosenUpdateEvent = new CustomEvent('chosen:updated', { bubbles: true });
                serviceSelect.dispatchEvent(chosenUpdateEvent);


                // --- BẮT ĐẦU CODE MỚI ---
                // 6. Chọn Nội dung yêu cầu
                console.log('Đang chọn nội dung yêu cầu...');
                const reasonSelect = document.getElementById('slReason') as HTMLSelectElement;
                if (!reasonSelect) throw new Error('Không tìm thấy thẻ select nội dung #slReason.');

                // Tìm option có chứa chữ "Khiếu nại"
                let targetReasonOption: HTMLOptionElement | null = null;
                const allReasonOptions = reasonSelect.querySelectorAll('option');
                for (const option of allReasonOptions) {
                    if (type == 'complaint') {
                        if (option.textContent && option.textContent.includes('Khiếu nại')) {
                            targetReasonOption = option;
                            break; // Dừng lại khi tìm thấy
                        }
                    } else if (type == 'support') {
                        if (option.textContent && option.textContent.includes('Hiệu chỉnh')) {
                            targetReasonOption = option;
                            break; // Dừng lại khi tìm thấy
                        }
                    }

                }

                if (targetReasonOption) {
                    console.log(`Đã tìm thấy nội dung: "${targetReasonOption.textContent!.trim()}"`);
                    // Áp dụng cùng kỹ thuật CustomEvent
                    reasonSelect.value = targetReasonOption.value;
                    reasonSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    reasonSelect.dispatchEvent(new CustomEvent('chosen:updated', { bubbles: true }));
                    console.log('Đã cập nhật nội dung yêu cầu thành công.');
                } else {
                    console.warn('Không tìm thấy nội dung "Khiếu nại" trong danh sách.');
                }
                // --- KẾT THÚC CODE MỚI ---

            } else {
                console.warn(`Không tìm thấy dịch vụ với code "${serviceCode}" trong danh sách.`);
                // Bạn có thể quyết định dừng lại hoặc tiếp tục
                // throw new Error(`Dịch vụ ${serviceCode} không tồn tại.`);
            }


            console.log('Hoàn thành các bước tự động ban đầu!');
            sendResponse({ status: 'ok' });

        } catch (error: any) {
            console.error('Lỗi trong quá trình tự động hóa form CMS:', error);
            alert(`Lỗi tự động hóa CMS: ${error.message}`);
            sendResponse({ status: 'error', error: error.message });
        }
        return true; // Giữ kênh mở cho xử lý bất đồng bộ
    }
});