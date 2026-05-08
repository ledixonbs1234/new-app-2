import { KhachLeProps } from "../states/states";
import { handlePortalHCCPage, handlePortalPage } from "./handlePortalPage";
import { delay, waitForElm, waitForNotElm, waitForValueElm } from "./utils";

// Bỏ sharedState.isRunning vì background sẽ quản lý luồng
// export const sharedState = {
//   isRunning: false,
//   idKH: null,
//   token: null
// };
export const sharedState = {
  idKH: null,
  token: null,
  isRunning: false,
};

function base64ToBlob(
  base64: string,
  contentType: string = "",
  sliceSize: number = 512
): Blob | null {
  if (base64 == null) {
    return null;
  }
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}

type BuuGuiProps = {
  index: number;
  KhoiLuong: string;
  MaBuuGui: string;
  TrangThai: string;
  ListDo: string[] | null;
  TimeTrangThai: string;
};
window.onload = () => {
  console.log("CONTENT SCRIPT PORTAL");

  if (window.location.href.startsWith("https://portalkhl.vnpost.vn/itemhdr/?id=")) {
    handlePortalPage();
  } else if (window.location.href.startsWith("https://portalkhl.vnpost.vn/public-service?id=")) {
    handlePortalHCCPage();

  }
};

chrome.runtime.onMessage.addListener((msg, _sender, callback) => {
  (async () => {
    try {
      if (msg) {
        console.log("LISTENER CONTENT SCRIPT", msg);


        // END: Thêm listener mới cho MyPost

        if (msg.message === "PING") {
          callback({ status: "pong" });
        } else if (msg.message === "PROCESS_SINGLE_ITEM") {
          console.log("Processing single item:", msg.current.MaBuuGui);
          try {
            // Gọi hàm xử lý một item (có thể là hàm startSendCurrentCode đã sửa đổi)
            const result = await processSinglePortalItem(msg.current, msg.makh, msg.keyMessage, msg.options, msg.isDeletePhone);
            console.log("Finished processing", msg.current.MaBuuGui, "Result:", result);
            callback({ status: "success", maBG: msg.current.MaBuuGui }); // Báo thành công
          } catch (error: any) {
            console.error(`Error processing ${msg.current.MaBuuGui}:`, error);
            // --- BÁO LỖI VỀ BACKGROUND ---
            callback({ status: "error", maBG: msg.current.MaBuuGui, error: error.message || "Lỗi không xác định trên Portal" });
          }
        }
        else if (msg.message === "PROCESS_SINGLE_ITEM_KHOITAO") {
          console.log("Processing single item:", msg.current.MaBuuGui);
          try {
            // Gọi hàm xử lý một item (có thể là hàm startSendCurrentCode đã sửa đổi)
            const result = await processSinglePortalItem_khoitao(msg.current, msg.makh, msg.keyMessage, msg.options, msg.isDeletePhone);
            console.log("Finished processing", msg.current.MaBuuGui, "Result:", result);
            callback({ status: "success", maBG: msg.current.MaBuuGui }); // Báo thành công
          } catch (error: any) {
            console.error(`Error processing ${msg.current.MaBuuGui}:`, error);
            // --- BÁO LỖI VỀ BACKGROUND ---
            callback({ status: "error", maBG: msg.current.MaBuuGui, error: error.message || "Lỗi không xác định trên Portal" });
          }
        }
        else if (msg.message === "FILL_CHINH_COD") {
          console.log("[Content] Received FILL_CHINH_COD with barcode:", msg.barcode);
          try {
            // Wait for the input field to be available
            const inputSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div:nth-child(1) > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div:nth-child(1) > div:nth-child(2) > input";
            const inputEl = await waitForElm(inputSelector, 30) as HTMLInputElement;
            if (!inputEl) throw new Error("Không tìm thấy ô nhập barcode");

            // Fill barcode
            inputEl.value = msg.barcode;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            inputEl.dispatchEvent(new Event('blur'));

            await delay(500);

            // Wait for the "Kiểm tra điều kiện" button
            const btnSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div:nth-child(1) > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div.MuiGrid-root.MuiGrid-container.MuiGrid-justify-content-xs-center > div > button";
            const btnEl = await waitForElm(btnSelector, 10) as HTMLElement | null;
            if (!btnEl || !(btnEl instanceof HTMLButtonElement)) throw new Error("Không tìm thấy nút 'Kiểm tra điều kiện'");

            btnEl.click();
            await delay(500);

            // Chọn Loại yêu cầu -> "Điều chỉnh số tiền COD"
            const wrapperSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div.content-box.item-detail-list > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div:nth-child(2) > div:nth-child(2)";
            let wrapper = document.querySelector(wrapperSelector);

            // Fallback: Tìm theo text nếu selector bị sai lệch
            if (!wrapper) {
              const divs = Array.from(document.querySelectorAll('div')).filter(el =>
                el.textContent === 'Chọn loại sự vụ' || el.textContent === 'Loại yêu cầu'
              );
              if (divs.length > 0) {
                wrapper = divs[0].closest('.MuiGrid-item') || divs[0].parentElement;
              }
            }

            if (wrapper) {
              const typeInput = wrapper.querySelector('input[id^="react-select-"]') || wrapper.querySelector('input');
              if (typeInput) {
                const typeEl = typeInput as HTMLInputElement;

                // 1. Focus input
                typeEl.focus();

                // 2. Mở dropdown bằng cách click vào vùng control
                const controlBox = wrapper.querySelector('.css-1vlitpt') || typeEl.parentElement?.parentElement?.parentElement;
                if (controlBox) {
                  controlBox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                }

                // 3. Backup mở bằng phím
                typeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
                await delay(300);

                // 4. Gõ từ khoá
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                const keyword = "Điều chỉnh số tiền COD";

                if (nativeInputValueSetter) {
                  nativeInputValueSetter.call(typeEl, keyword);
                  typeEl.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  typeEl.value = keyword;
                  typeEl.dispatchEvent(new Event('input', { bubbles: true }));
                }

                await delay(500);

                // 5. Tìm listbox và click trực tiếp vào thẻ chứa nội dung
                const listboxes = Array.from(document.querySelectorAll('div[id$="-listbox"], div[class*="-menu"]'));
                let optionClicked = false;

                for (const box of listboxes) {
                  // Lấy tất cả các thẻ div bên trong listbox
                  const options = Array.from(box.querySelectorAll('div'));
                  // Lọc ra thẻ có nội dung khớp chính xác (hoặc chứa) từ khoá
                  const targetOption = options.find(opt => opt.textContent?.trim() === keyword || opt.textContent?.trim().includes(keyword));

                  if (targetOption) {
                    // Cần mousedown trước rồi mới click cho react-select
                    targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    targetOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                    optionClicked = true;
                    console.log("[Content] Đã click chọn option:", targetOption.textContent);
                    break;
                  }
                }

                // 6. Fallback nếu không tìm thấy DOM option: Dùng phím Enter
                if (!optionClicked) {
                  typeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
                  await delay(100);
                  typeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                }

                await delay(200);
                typeEl.dispatchEvent(new Event('blur'));

                // 7. Chờ bảng tải dữ liệu và click checkbox đầu tiên, sau đó bấm Tạo sự vụ
                await delay(1000); // Thêm delay nhỏ để React xử lý sự kiện filter

                const firstCheckboxSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div.content-box.item-detail-list > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div.ReactTable > div.rt-table > div.rt-tbody > div:nth-child(1) > div > div:nth-child(1) > div > input";
                const firstCheckbox = await waitForElm(firstCheckboxSelector, 5000); // Chờ tối đa 5s để data load

                if (firstCheckbox) {
                  (firstCheckbox as HTMLElement).click();
                  console.log("[Content] Đã check vào ô đầu tiên của bảng.");

                  await delay(300); // Đợi trạng thái checkbox cập nhật

                  const submitBtnSelector = "#content > div > div > div.sub-content.multiple-item-no-footer > div.content-box.item-detail-list > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div:nth-child(2) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-3 > button";
                  const submitBtn = document.querySelector(submitBtnSelector);

                  if (submitBtn) {
                    (submitBtn as HTMLElement).click();
                    console.log("[Content] Đã nhấn nút Tạo sự vụ.");
                  } else {
                    console.warn("[Content] Không tìm thấy nút Tạo sự vụ.");
                  }
                } else {
                  console.warn("[Content] Không tìm thấy dòng dữ liệu nào trong bảng (timeout 5s).");
                }
              }
            }

            callback({ status: "success", message: "Đã điền form Chỉnh COD thành công" });
          } catch (error: any) {
            console.error("[Content] Error filling Chỉnh COD form:", error);
            callback({ status: "error", message: error.message || "Lỗi khi điền thông tin Chỉnh COD" });
          }
        }
        else if (msg.message === "FILL_PORTAL_DATA_FROM_AI") {
          console.log("Received AI extracted data:", msg.extractedData);
          try {
            await fillPortalFormWithAIData(msg.extractedData);
            callback({ status: "success", message: "Đã điền thông tin thành công" });
          } catch (error: any) {
            console.error("Error filling portal form with AI data:", error);
            callback({ status: "error", message: error.message || "Lỗi khi điền thông tin" });
          }
        }
        else if (msg.message === "SEND_SUBMIT") {
          // Chờ form xuất hiện
          const form = await waitForElm("#content > div > div > div.sub-content.multiple-item-no-footer > form", 5000);
          if (!form) {
            throw new Error("Không tìm thấy form portal để điền thông tin");
          } // Xử lý nút tìm kiếm
          const findAndSearchBtn = await waitForElm(
            "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button"
          );
          if (!findAndSearchBtn) return;

          (findAndSearchBtn as HTMLElement).click();




          callback({ status: "success", message: "Đã điền thông tin thành công" });

        }
        else if (msg.message === "CHANGEKL") {
          await changeKL(msg.kl);
          callback({ status: "success", message: "Đã thay đổi khối lượng thành công" });
        }
        else
          if (msg.message === "ADD") {
            chrome.runtime.sendMessage({
              event: "BADGE",
              content: "Run",
            });
            // waitForElm('.have').then((e)=>{})
            sharedState.isRunning = true;
            isFirstRun = true;
            currentMH = msg.current;
            list = msg.list;
            let maKH = msg.makh;
            // var iCurrent = list.findIndex((m) => m.index === currentMH.index);
            var iCurrent = list.findIndex(
              (m) => m.MaBuuGui === currentMH.MaBuuGui
            );
            chrome.runtime.sendMessage({
              event: "BADGE",
              content: iCurrent,
            });
            // chrome.action.setBadgeText({text:currentMH.index.toString()});

            var isError = false;
            if (iCurrent !== -1) {
              console.log("iCurrent ", iCurrent);

              for (let i = iCurrent; i < list.length; i++) {
                if (!sharedState.isRunning) break;
                const element = list[i];
                chrome.runtime.sendMessage({
                  event: "BADGE",
                  content: i + 1,
                });
                await chrome.runtime.sendMessage({
                  event: "CONTENT",
                  message: "CURRENT",
                  content: element,
                });
                await chrome.storage.local.set({
                  selectedbg: JSON.stringify(element),
                });

                await startSendCurrentCode(element, maKH, msg.keyMessage, msg.options);
                if (!sharedState.isRunning) {
                  isError = true;
                  chrome.runtime.sendMessage({
                    event: "BADGE",
                    content: "Dừng Tại" + (i + 1).toString(),
                  });
                  break
                };
              }
              // showNotification("Hoàn Thành");

              if (!isError) {
                chrome.runtime.sendMessage({
                  event: "BADGE",
                  content: "Xong",
                });
              }
            } else {
            }
            if (!sharedState.isRunning) {
              callback(false);
            } else {
              callback(true)
            }
          }
          else if (msg.message === "ADDKHACHLE") {
            var currentKhachLe: KhachLeProps = msg.current;
            try {
              console.log("start send Mam", currentKhachLe.MaHieu);
              // 'body > div.MuiDialog-root'
              const selector = await waitForElm("#customerName");
              if (selector !== null) {
                // await waitForElm(selector)
                var customerName: HTMLInputElement | null = document.querySelector('#customerName')!;
                var customerPhone: HTMLInputElement | null = document.querySelector('#customerPhone')!;
                var customerAddress: HTMLInputElement | null = document.querySelector('#customerAddress')!;

                customerName.value = currentKhachLe.NameSend;
                var event = new Event('input', { bubbles: true });
                customerName.dispatchEvent(event);
                customerPhone.value = currentKhachLe.PhoneSend;
                customerPhone.dispatchEvent(event);
                customerAddress.value = currentKhachLe.AddressSend;
                customerAddress.dispatchEvent(event);


                var receiverName: HTMLInputElement = document.querySelector('#receiverName')!;
                var receiverAddress: HTMLInputElement = document.querySelector("#receiverAddress")!;
                var receiverPhone: HTMLInputElement = document.querySelector("#receiverPhone")!;
                receiverName.value = currentKhachLe.NameReceive;
                receiverName.dispatchEvent(event);
                receiverAddress.value = currentKhachLe.AddressReceive;
                receiverAddress.dispatchEvent(event);
                receiverPhone.value = currentKhachLe.PhoneReceive;
                receiverPhone.dispatchEvent(event);
                var maHieu: HTMLInputElement = document.querySelector("#ttNumber")!;
                maHieu.value = currentKhachLe.MaHieu;
                maHieu.dispatchEvent(event);
                window.postMessage({
                  type: "CONTENT",
                  message: "ADDWEIGHT",
                  data: "",
                  kl: currentKhachLe.KhoiLuongThucTe,
                });
                var chidan: HTMLTextAreaElement = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(5) > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-8 > textarea")!
                chidan.value = "Ngày chấp nhận thực tế " + currentKhachLe.NgayChapNhan
                chidan.dispatchEvent(event);
                await delay(400);
              }
            } catch (error) { }

          }
          else if (msg.message === "KHOITAOPORTAL") {
            console.log("Content Đang chạy KHOITAOPORTAL ", msg);

            var customerCode = await waitForElm("input[name='customerCode'], #customerCode") as HTMLInputElement | null;
            if (customerCode == null) {
              callback({ data: "Không tìm thấy ô mã khách hàng" });
              return;
            }
            if (customerCode) {
              customerCode.value = msg.MaKH; // Đặt giá trị trước
              customerCode.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              customerCode.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              customerCode?.dispatchEvent(new Event("blur"));

              // click vào nút địa chỉ

            }
            var address: HTMLInputElement | null =
              document.querySelector("input[name='customerAddress'], #customerAddress");

            // gán giá trị cho ô tìm kiếm
            // customerCode?.focus();
            // chrome.runtime.sendMessage({
            //   event: "CONTENT",
            //   message: "SEND_MAKH",
            //   content: msg.MaKH,
            //   keyMessage: msg.keyMessage,
            // });

            // window.postMessage({
            //   type: "CONTENT",
            //   message: "ADDTIMKIEMTEXT",
            //   data: msg.MaKH,
            // });

            chrome.runtime.sendMessage({
              event: "CONTENT",
              message: "MESSAGE",
              content: "Đang khởi tạo",
              keyMessage: msg.keyMessage,
            });

            await delay(1000);

            if (msg.IsChooseHopDong) {
              //kiem tra neu co hop dong thi check
              let iCheck = msg.STTHopDong;
              //check hợp đồng
              var checker: HTMLInputElement | null = document.querySelector(
                `body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogContent-root.MuiDialogContent-dividers > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div > div.rt-table > div.rt-tbody > div:nth-child(${iCheck}) > div > div:nth-child(1) > div > input`
              );
              if (checker !== null) {
                (checker as HTMLInputElement)?.click();
                (
                  document.querySelector(
                    "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
                  ) as HTMLButtonElement
                )?.click();

                await delay(500);
              }
            }

            //ghi địa chỉ
            if (msg.Address !== "") {
              // window.postMessage({
              //   type: "CONTENT",
              //   message: "ADDADDRESSTEXT",
              //   data: msg.Address,
              // });
              if (address) {
                address.value = msg.Address; // Đặt giá trị trước
              }

              address?.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              address?.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              address?.dispatchEvent(new Event("blur"));
              console.log("ghi địa chỉ");
            }

            var maHopDong: HTMLInputElement | null = document.querySelector(
              "input[name='customerContractNumber'], #customerContractNumber"
            );
            //thucw hien lay hop dong va send tin nhan
            chrome.runtime.sendMessage({
              event: "CONTENT",
              message: "SEND_MAHD",
              content: maHopDong?.value ?? "",
              keyMessage: msg.keyMessage,
            });

            await delay(200);
          

        // Xử lý tự sinh số hiệu nếu tuSinhSoHieu = true
        if (msg.tuSinhSoHieu !== false) {
          const tuSinhInput =document.querySelector('input[name="autoGenerateBG"]') as HTMLInputElement;

          if (tuSinhInput && !tuSinhInput.checked) {
            tuSinhInput.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } else {
            console.warn("Không tìm thấy checkbox tự sinh số hiệu");
          }

          await delay(300);
        } else {
          console.warn("Bỏ qua checkbox tự sinh số hiệu (tuSinhSoHieu = false)");
        }



        // callback({ data: "callback khoi tao ok" });
        var btnLuuVaTim: HTMLInputElement | null = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div:nth-child(11) > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-6 > div:nth-child(1) > div > button")

        if (msg.btnLuuVaTim === false) {
          console.log("btnLuuVaTim is false, skipping save & search.");
          callback({ data: "ok_no_save" });
          return true;
        }

        if (btnLuuVaTim) {
          console.log("Clicking Save & Search...");

          // 1. Gửi phản hồi NGAY LẬP TỨC để giữ kết nối không bị báo lỗi
          // Báo hiệu cho Background biết là nút đã được bấm và trang sắp reload
          callback({ data: "ok_reloading" });

          // 2. Thực hiện click sau một khoảng delay cực ngắn để đảm bảo message đã đi
          setTimeout(() => {
            btnLuuVaTim?.click();
          }, 100);

          return true; // Kết thúc xử lý tại đây
        } else {
          callback({ data: "Lỗi không tìm thấy nút lưu và tìm" });
        }


        return true;
      } else if (msg.message === "KHOITAOPNS") {
        //thuc hien lay capchar
        var c = document.createElement("canvas");
        var ctx = c.getContext("2d");
        var img: any = document.getElementById("CaptchaImage");
        if (img) {
          ctx?.drawImage(img, 0, 0, 200, 70);
          //send message to popup
          await chrome.runtime.sendMessage({
            event: "CONTENT",
            message: "SEND_CAPCHAR",
            content: c.toDataURL(),
            keyMessage: msg.keyMessage,
          });
        }
        await delay(1000);
        callback({ data: "ok" });
      } else if (msg.message === "SENDCAPCHAR") {
        var capchar: HTMLInputElement | null =
          document.querySelector("#CaptchaText");
        if (capchar) {
          capchar.value = msg.content;
          var isGD = msg.gd;
          console.log("isGD", isGD);
          (document.getElementById("userid") as HTMLInputElement).value =
            !isGD ? "593280_phuhv" : "59A652";
          (document.getElementById("password") as HTMLInputElement).value =
            "Phu2026@";

          var btnLogin = document.querySelector(
            "body > div.content > div.row > div > div > div > form > fieldset > div:nth-child(4) > div:nth-child(4) > div.form-group > button"
          ) as HTMLButtonElement;
          btnLogin.click();
        }
      } else if (msg.message === "GETIDKH") {
        window.postMessage({
          type: "CONTENT",
          message: "GETIDKH",
        });
      } else if (msg.message === "PRINTBLOB") {
        // var blob = new Blob([msg.content], { type: "application/pdf" });
        chrome.storage.local.get("blobs", (result) => {
          let blob = base64ToBlob(result.blobs, "application/pdf");
          const url = URL.createObjectURL(blob!);

          var printWindow = window.open(url);
          if (printWindow == null) return;
          printWindow.onload = function () {
            if (printWindow == null) return;
            printWindow.print();
          };
        });
      } else if (msg.message === "EXPORTEXCEL") {
        console.log("Export Excel");
        chrome.storage.local.get("excel", (result) => {
          console.log("result", result);
          const byteCharacters = atob(result.excel);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
          const url = URL.createObjectURL(blob!);
          console.log("url", url);
          const a = document.createElement("a");
          a.href = url;
          a.download = msg.ten + ".xlsx";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      }
    }
return true;
  } catch (e) {
    console.log(e);
    callback({ data: "Lỗi không xác định" });
  }
})();
return true;
})



let isFirstRun = true;

// --- HÀM MỚI hoặc SỬA ĐỔI: Xử lý MỘT item trên Portal ---
// (Đây là logic cũ của startSendCurrentCode nhưng không còn vòng lặp và cờ isRunning)
async function processSinglePortalItem(
  buuGui: BuuGuiProps,
  maKH: any,
  keyMessage: string, // keyMessage có thể không cần ở content script nữa
  options: any,
  isDeletePhone: boolean
): Promise<void> { // Trả về Promise để background biết khi nào xong, throw error nếu lỗi
  console.log("Processing Portal item:", buuGui.MaBuuGui);

  // === NOTIFY GIAO TICH SCRIPT: START PROCESSING ===
  chrome.runtime.sendMessage({
    event: "CONTENT",
    message: "PROCESS_STATUS",
    isProcessing: true,
  }).catch(() => { });

  try {
    const selector = await waitForElm("body > div.MuiDialog-root", 15); // Tăng timeout một chút
    const numberSearch = await waitForElm("#ttNumberSearch", 15);
    if (!selector || !numberSearch) {
      throw new Error("Không tìm thấy ô tìm kiếm mã hoặc dialog Portal.");
    }
    numberSearch.value = buuGui.MaBuuGui; // Đặt giá trị trước
    numberSearch.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    numberSearch.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    numberSearch.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
    const searchButton: HTMLElement | null = document.querySelector(
      "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
    );
    if (searchButton) {
      searchButton?.click();
    }
    // window.postMessage({
    //   type: "CONTENT",
    //   message: "ADDCODE",
    //   data: buuGui.MaBuuGui,
    // });

    // Chờ một chút để mã được nhập và dialog (nếu có) xuất hiện
    await delay(700); // Tăng nhẹ delay

    // Kiểm tra hộp thông báo lỗi sớm
    const alertBoxEarly = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    if (alertBoxEarly?.innerText) {
      const textShow = alertBoxEarly.innerText.split("\n").pop() ?? "";
      console.log("Alert early:", textShow);
      // Chỉ dừng nếu là lỗi nghiêm trọng, nếu chỉ là cảnh báo "đã xử lý" thì vẫn coi là thành công? -> Quyết định: Dừng nếu có alert
      if (textShow.includes("tồn tại") || textShow.includes("xử lý") || textShow.includes("không đúng")) {
        throw new Error(`Lỗi Portal sớm: ${textShow}`);
      }
      // Nếu không phải lỗi, có thể tiếp tục hoặc bỏ qua (tùy logic)
      // return; // Ví dụ: bỏ qua nếu chỉ là cảnh báo
    }

    // Chờ ô tìm kiếm biến mất (nghĩa là đã tìm thấy và load form)
    const notNumberSearch = await waitForNotElm("#ttNumberSearch", 30); // Tăng timeout
    if (notNumberSearch !== "ok") {
      // Nếu ô tìm kiếm không biến mất -> Lỗi tìm kiếm
      const alertBoxAfterTimeout = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
      const alertText = alertBoxAfterTimeout?.innerText.split("\n").pop() ?? "Không tìm thấy hoặc timeout";
      console.log("Lỗi tìm kiếm hoặc timeout:", buuGui.MaBuuGui);
      throw new Error(`Lỗi tìm kiếm mã ${buuGui.MaBuuGui}: ${alertText}`);
    }

    if (isFirstRun) {
      isFirstRun = false;
      console.log("Pre-check money...");
      await delay(1000);
    }

    const moneyInput = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input",
      10 // Timeout ngắn hơn vì form đã load
    );
    if (!moneyInput) {
      // Có thể form chưa load xong hoặc cấu trúc trang thay đổi
      throw new Error(`Không tìm thấy ô nhập tiền sau khi tìm mã ${buuGui.MaBuuGui}`);
    }

    if (maKH === "C002446626") {
      const firstChar = buuGui.MaBuuGui[0].toUpperCase();
      const dichVu = firstChar === "C" ? "CTN009" : firstChar === "E" ? "ETN037" : null;
      if (dichVu) {
        window.postMessage({ type: "CONTENT", message: "CHANGEDICHVU", dichvu: dichVu });
        await delay(1000);
      }
    }

    await delay(500);

    //thực hiện việc xoá 4 số đầu điện thoại
    if (isDeletePhone) {
      const receiverPhoneInput = document.querySelector<HTMLInputElement>("#receiverPhone");
      if (receiverPhoneInput) {
        const currentPhone = receiverPhoneInput.value;
        if (currentPhone.length >= 4) {
          const newPhone = currentPhone.slice(4);
          receiverPhoneInput.value = newPhone;
          receiverPhoneInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          receiverPhoneInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          receiverPhoneInput.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
        }
      }
    }
    const weightThucTe = document.querySelector<HTMLInputElement>("#weight");
    const weightNotDot = weightThucTe?.value.replace(".", "")
    if (weightThucTe) {
      if (
        buuGui.KhoiLuong.toString() !== weightNotDot && buuGui.KhoiLuong.toString() !== "0") {
        var klTemp = buuGui.KhoiLuong.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1.')
        weightThucTe.value = klTemp; // Đặt giá trị trước
        weightThucTe.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        weightThucTe.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        weightThucTe.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));

        // window.postMessage({
        //   type: "CONTENT",
        //   message: "ADDWEIGHT",
        //   data: buuGui.MaBuuGui,
        //   kl: buuGui.KhoiLuong,
        // });
        // await delay(400);
      }
      else if (options) {
        if (options.selectedOption === "changeKLFromTo") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: options.changeKLFromTo,
          });
          await delay(1000);
        } else if (options.selectedOption === "contentChange") {
          debugger
          const contentItem = document.querySelector<HTMLInputElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(7) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > textarea")
          if (contentItem) {
            var changes = options.contentChanges;
            //chuyen khong dau va viet thuong
            var content = contentItem.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            var klHienTai = 0;
            var klThem = 0;

            for (let i = 0; i < changes.length; i++) {
              if (content.indexOf(changes[i].content) !== -1) {
                if (changes[i].content.startsWith("+")) {
                  klThem += Number(changes[i].khoiLuong);
                } else {
                  klHienTai = Number(changes[i].khoiLuong);
                }
              }
            }
            var klAll = klHienTai + klThem;

            if (klAll > 0) {
              window.postMessage({
                type: "CONTENT",
                message: "ADDWEIGHT",
                data: buuGui.MaBuuGui,
                kl: klAll,
              });
              await delay(400);
            }
          }
        }
        else if (options.selectedOption === "increaseKL") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: (Number(weightNotDot) + Number(options.increaseKL)).toString(),
          });
          await delay(400);



        }
      }
    }

    if (buuGui.ListDo) {
      window.postMessage({
        type: "CONTENT",
        message: "ADDKICHTHUOC",
        data: buuGui.MaBuuGui,
        kt: buuGui.ListDo,
      });
      await delay(1000);
    }
    // Bấm nút "Lưu và tìm tiếp" hoặc tương đương
    const findAndSearchBtn = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button",
      20
    );
    if (!findAndSearchBtn) {
      throw new Error("Không tìm thấy nút 'Lưu và tìm kiếm'");
    }
    await delay(300);

    (findAndSearchBtn as HTMLElement).click();

    // Chờ kết quả (ô tìm kiếm xuất hiện lại hoặc có alert lỗi)
    await delay(700); // Chờ phản hồi từ server

    const alertBoxAfterClick = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    if (alertBoxAfterClick?.innerText) {
      const textShow = alertBoxAfterClick.innerText.split("\n").pop() ?? "";
      if (textShow.includes("thành công")) {
        console.log("Lưu thành công:", buuGui.MaBuuGui);
        // Gửi xác nhận thành công (nếu cần)

      } else if (textShow.includes("Nhập thông tin vào trường bắt buộc")) {
        var button = document.querySelector<HTMLElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div.MuiGrid-root.MuiGrid-container.MuiGrid-item.MuiGrid-grid-xs-8 > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(3)")
        if (button) {
          button.click()
          await delay(500);
          (findAndSearchBtn as HTMLElement).click();
        }
      }
      else {
        // Nếu có alert không phải thành công -> Lỗi
        console.error("Lỗi sau khi bấm lưu:", buuGui.MaBuuGui, textShow);
        throw new Error(`Lỗi Portal sau khi lưu: ${textShow}`);
      }
    }
    // Nếu không có alert, kiểm tra xem ô tìm kiếm đã xuất hiện lại chưa

    // Nếu ô tìm kiếm xuất hiện -> Thành công

    if (!await waitForElm("#ttNumberSearch", 10)) {
      // Nếu ô tìm kiếm không xuất hiện -> Có thể lỗi hoặc xử lý lâu
      throw new Error(`Không thể xác nhận lưu thành công cho ${buuGui.MaBuuGui}`);
    }

    console.log("Lưu thành công (không có alert):", buuGui.MaBuuGui);
    const moneyThuHo = document.querySelector<HTMLInputElement>(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input"
    );

    // Gửi dữ liệu lên popup hoặc Firebase
    await chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "SEND_MH",
      content: buuGui.MaBuuGui,
      content1: moneyThuHo?.value ?? "ko biết",
      keyMessage,
    })

    // Hàm kết thúc thành công
    console.log(`Successfully processed ${buuGui.MaBuuGui}`);

    // === NOTIFY GIAO TICH SCRIPT: STOP PROCESSING ===
    chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "PROCESS_STATUS",
      isProcessing: false,
    }).catch(() => { });

  } catch (error: any) {
    console.error(`Error in processSinglePortalItem for ${buuGui?.MaBuuGui}:`, error);

    // === NOTIFY GIAO TICH SCRIPT: STOP PROCESSING (ON ERROR) ===
    chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "PROCESS_STATUS",
      isProcessing: false,
    }).catch(() => { });

    // **Quan trọng**: Ném lại lỗi để listener message bắt được và báo về background
    throw error;
  }
}

async function processByNumberSearch(buuGui: BuuGuiProps, numberSearch: HTMLInputElement): Promise<void> {
  numberSearch.value = buuGui.MaBuuGui;
  numberSearch.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  numberSearch.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  numberSearch.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));

  const searchButton: HTMLElement | null = document.querySelector(
    "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
  );
  if (searchButton) {
    searchButton.click();
  }

  await delay(700);
  const customerCode = document.querySelector<HTMLInputElement>("#customerCode");
  if (customerCode) {
    await processByCustomerCode(buuGui, customerCode);
  }


  const alertBoxEarly = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
  if (alertBoxEarly?.innerText) {
    const textShow = alertBoxEarly.innerText.split("\n").pop() ?? "";
    console.log("Alert early:", textShow);
    if (textShow.includes("tồn tại") || textShow.includes("xử lý") || textShow.includes("không đúng")) {
      throw new Error(`Lỗi Portal sớm: ${textShow}`);
    }
  }

  const notNumberSearch = await waitForNotElm("#ttNumberSearch", 30);
  if (notNumberSearch !== "ok") {
    const alertBoxAfterTimeout = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    const alertText = alertBoxAfterTimeout?.innerText.split("\n").pop() ?? "Không tìm thấy hoặc timeout";
    console.log("Lỗi tìm kiếm hoặc timeout:", buuGui.MaBuuGui);
    throw new Error(`Lỗi tìm kiếm mã ${buuGui.MaBuuGui}: ${alertText}`);
  }
}

async function processByCustomerCode(buuGui: BuuGuiProps, customerCode: HTMLInputElement): Promise<void> {
  console.log("Xử lý theo mã khách hàng với giá trị:", customerCode.value);
  await delay(1000);

  // Chờ #customerCode có dữ liệu
  var customer = await waitForValueElm("#customerCode");
  if (customer?.value == "C006230404") {
    var checker: HTMLInputElement | null = document.querySelector(
      `body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogContent-root.MuiDialogContent-dividers > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div > div.rt-table > div.rt-tbody > div:nth-child(2) > div > div:nth-child(1) > div > input`
    );
    if (checker !== null) {
      (checker as HTMLInputElement)?.click();
      (
        document.querySelector(
          "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
        ) as HTMLButtonElement
      )?.click();

      await delay(500);
    }
  }
  await delay(300);

  // Nhấn nút "Lưu và tìm kiếm"
  const saveBtn: HTMLElement | null = document.querySelector(
    "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form > div:nth-child(11) > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-6 > div:nth-child(1) > div > button"
  );
  if (saveBtn) {
    saveBtn.click();
  }
}

async function processByEmptyCustomerCode(buuGui: BuuGuiProps): Promise<void> {
  console.log("khoiTaoPortalNew: maHieu", buuGui.MaBuuGui);
  const input = document.getElementById("searchDetailBox") as HTMLInputElement;
  if (input) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, buuGui.MaBuuGui);
    } else {
      input.value = buuGui.MaBuuGui;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const options = { bubbles: true, cancelable: true, keyCode: 13, which: 13, key: "Enter", code: "Enter" };
    input.dispatchEvent(new KeyboardEvent("keydown", options));
    input.dispatchEvent(new KeyboardEvent("keypress", options));
    input.dispatchEvent(new KeyboardEvent("keyup", options));
  }
  await delay(1000);

  // Chờ #customerCode có dữ liệu
  var customer = await waitForValueElm("#customerCode");
  if (customer?.value == "C006230404") {
    var checker: HTMLInputElement | null = document.querySelector(
      `body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogContent-root.MuiDialogContent-dividers > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div > div.rt-table > div.rt-tbody > div:nth-child(2) > div > div:nth-child(1) > div > input`
    );
    if (checker !== null) {
      (checker as HTMLInputElement)?.click();
      (
        document.querySelector(
          "body > div.MuiDialog-root > div.MuiDialog-container.MuiDialog-scrollPaper > div > div.MuiDialogActions-root.MuiDialogActions-spacing > button:nth-child(1)"
        ) as HTMLButtonElement
      )?.click();

      await delay(500);
    }
  }



  await delay(300);

  // Nhấn nút "Lưu và tìm kiếm"
  const saveBtn: HTMLElement | null = document.querySelector(
    "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form > div:nth-child(11) > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-6 > div:nth-child(1) > div > button"
  );
  if (saveBtn) {
    saveBtn.click();
  }
}

async function processSinglePortalItem_khoitao(
  buuGui: BuuGuiProps,
  maKH: any,
  keyMessage: string, // keyMessage có thể không cần ở content script nữa
  options: any,
  isDeletePhone: boolean
): Promise<void> { // Trả về Promise để background biết khi nào xong, throw error nếu lỗi
  console.log("Processing Portal item:", buuGui.MaBuuGui);

  // === NOTIFY GIAO TICH SCRIPT: START PROCESSING ===
  chrome.runtime.sendMessage({
    event: "CONTENT",
    message: "PROCESS_STATUS",
    isProcessing: true,
  }).catch(() => { });

  try {
    // const selector = await waitForElm("body > div.MuiDialog-root", 15);
    // if (!selector) {
    //   throw new Error("Không tìm thấy dialog Portal.");
    // }

    const numberSearch = document.querySelector<HTMLInputElement>("#ttNumberSearch");
    const customerCode = document.querySelector<HTMLInputElement>("#customerCode");

    if (numberSearch) {
      console.log('Is Number Search')
      await processByNumberSearch(buuGui, numberSearch);
    } else if (customerCode && customerCode.value.trim() !== "") {
      console.log("Customer Value")
      await processByCustomerCode(buuGui, customerCode);
    } else if (customerCode && customerCode.value.trim() === "") {
      console.log("Customeer not Value")
      await processByEmptyCustomerCode(buuGui);
    } else {
      throw new Error("Không tìm thấy #ttNumberSearch hoặc #customerCode.");
    }

    if (isFirstRun) {
      isFirstRun = false;
      console.log("Pre-check money...");
      await delay(1000);
    }

    const moneyInput = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input",
      10 // Timeout ngắn hơn vì form đã load
    );
    if (!moneyInput) {
      throw new Error(`Không tìm thấy ô nhập tiền sau khi tìm mã ${buuGui.MaBuuGui}`);
    }

    if (maKH === "C002446626") {
      const firstChar = buuGui.MaBuuGui[0].toUpperCase();
      const dichVu = firstChar === "C" ? "CTN009" : firstChar === "E" ? "ETN037" : null;
      if (dichVu) {
        window.postMessage({ type: "CONTENT", message: "CHANGEDICHVU", dichvu: dichVu });
        await delay(1000);
      }
    }

    await delay(500);

    //thực hiện việc xoá 4 số đầu điện thoại
    if (isDeletePhone) {
      const receiverPhoneInput = document.querySelector<HTMLInputElement>("#receiverPhone");
      if (receiverPhoneInput) {
        const currentPhone = receiverPhoneInput.value;
        if (currentPhone.length >= 4) {
          const newPhone = currentPhone.slice(4);
          receiverPhoneInput.value = newPhone;
          receiverPhoneInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          receiverPhoneInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          receiverPhoneInput.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
        }
      }
    }
    const weightThucTe = document.querySelector<HTMLInputElement>("#weight");
    const weightNotDot = weightThucTe?.value.replace(".", "")
    if (weightThucTe) {
      if (
        buuGui.KhoiLuong.toString() !== weightNotDot && buuGui.KhoiLuong.toString() !== "0") {
        var klTemp = buuGui.KhoiLuong.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1.')
        weightThucTe.value = klTemp; // Đặt giá trị trước
        weightThucTe.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        weightThucTe.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        weightThucTe.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));

        // window.postMessage({
        //   type: "CONTENT",
        //   message: "ADDWEIGHT",
        //   data: buuGui.MaBuuGui,
        //   kl: buuGui.KhoiLuong,
        // });
        // await delay(400);
      }
      else if (options) {
        if (options.selectedOption === "changeKLFromTo") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: options.changeKLFromTo,
          });
          await delay(1000);
        } else if (options.selectedOption === "contentChange") {
          debugger
          const contentItem = document.querySelector<HTMLInputElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(7) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > textarea")
          if (contentItem) {
            var changes = options.contentChanges;
            //chuyen khong dau va viet thuong
            var content = contentItem.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            var klHienTai = 0;
            var klThem = 0;

            for (let i = 0; i < changes.length; i++) {
              if (content.indexOf(changes[i].content) !== -1) {
                if (changes[i].content.startsWith("+")) {
                  klThem += Number(changes[i].khoiLuong);
                } else {
                  klHienTai = Number(changes[i].khoiLuong);
                }
              }
            }
            var klAll = klHienTai + klThem;

            if (klAll > 0) {
              window.postMessage({
                type: "CONTENT",
                message: "ADDWEIGHT",
                data: buuGui.MaBuuGui,
                kl: klAll,
              });
              await delay(400);
            }
          }
        }
        else if (options.selectedOption === "increaseKL") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: (Number(weightNotDot) + Number(options.increaseKL)).toString(),
          });
          await delay(400);



        }
      }
    }

    if (buuGui.ListDo) {
      window.postMessage({
        type: "CONTENT",
        message: "ADDKICHTHUOC",
        data: buuGui.MaBuuGui,
        kt: buuGui.ListDo,
      });
      await delay(1000);
    }
    // Bấm nút "Lưu và tìm tiếp" hoặc tương đương
    const findAndSearchBtn = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button",
      20
    );
    if (!findAndSearchBtn) {
      throw new Error("Không tìm thấy nút 'Lưu và tìm kiếm'");
    }
    await delay(300);

    (findAndSearchBtn as HTMLElement).click();

    // Chờ kết quả (ô tìm kiếm xuất hiện lại hoặc có alert lỗi)
    await delay(700); // Chờ phản hồi từ server

    const alertBoxAfterClick = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    if (alertBoxAfterClick?.innerText) {
      const textShow = alertBoxAfterClick.innerText.split("\n").pop() ?? "";
      if (textShow.includes("thành công")) {
        console.log("Lưu thành công:", buuGui.MaBuuGui);
        // Gửi xác nhận thành công (nếu cần)

      } else if (textShow.includes("Nhập thông tin vào trường bắt buộc")) {
        var button = document.querySelector<HTMLElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div.MuiGrid-root.MuiGrid-container.MuiGrid-item.MuiGrid-grid-xs-8 > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(3)")
        if (button) {
          button.click()
          await delay(500);
          (findAndSearchBtn as HTMLElement).click();
        }
      }
      else {
        // Nếu có alert không phải thành công -> Lỗi
        console.error("Lỗi sau khi bấm lưu:", buuGui.MaBuuGui, textShow);
        throw new Error(`Lỗi Portal sau khi lưu: ${textShow}`);
      }
    }
    // Nếu không có alert, kiểm tra xem ô tìm kiếm đã xuất hiện lại chưa

    // Nếu ô tìm kiếm xuất hiện -> Thành công

    if (!await waitForElm("#ttNumberSearch", 10)) {
      // Nếu ô tìm kiếm không xuất hiện -> Có thể lỗi hoặc xử lý lâu
      throw new Error(`Không thể xác nhận lưu thành công cho ${buuGui.MaBuuGui}`);
    }

    console.log("Lưu thành công (không có alert):", buuGui.MaBuuGui);
    const moneyThuHo = document.querySelector<HTMLInputElement>(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input"
    );

    // Gửi dữ liệu lên popup hoặc Firebase
    await chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "SEND_MH",
      content: buuGui.MaBuuGui,
      content1: moneyThuHo?.value ?? "ko biết",
      keyMessage,
    })

    // Hàm kết thúc thành công
    console.log(`Successfully processed ${buuGui.MaBuuGui}`);

    // === NOTIFY GIAO TICH SCRIPT: STOP PROCESSING ===
    chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "PROCESS_STATUS",
      isProcessing: false,
    }).catch(() => { });

  } catch (error: any) {
    console.error(`Error in processSinglePortalItem for ${buuGui?.MaBuuGui}:`, error);

    // === NOTIFY GIAO TICH SCRIPT: STOP PROCESSING (ON ERROR) ===
    chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "PROCESS_STATUS",
      isProcessing: false,
    }).catch(() => { });

    // **Quan trọng**: Ném lại lỗi để listener message bắt được và báo về background
    throw error;
  }
}

window.addEventListener("message", (event) => {
  if (event.data.type === "MAIN") {
    if (event.data.message === "GETIDKH") {
      sharedState.idKH = event.data.data;
      console.log("IDKH", sharedState.idKH);
      chrome.runtime.sendMessage({
        event: "CONTENT",
        message: "SEND_IDKH",
        content: event.data.data
      });

    }
    if (event.data.message === "GETIDKHEXCEL") {
      sharedState.idKH = event.data.data;
      sharedState.token = event.data.token;
      console.log("IDKH", sharedState.idKH);
      console.log("Token", sharedState.token);

    } else if (event.data.message === "SENDTOKEN") {
      sharedState.token = event.data.data;
      chrome.runtime.sendMessage({
        event: "CONTENT",
        message: "SEND_TOKEN",
        content: event.data.data,
        keyMessage: event.data.keyMessage
      });
    }
  }
});

const startSendCurrentCode = async (
  buuGui: BuuGuiProps,
  maKH: any,
  keyMessage: string,
  options: any
) => {
  try {
    console.log("start send ", buuGui.MaBuuGui);

    const selector = await waitForElm("body > div.MuiDialog-root");
    const numberSearch = await waitForElm("#ttNumberSearch", 10);
    if (!selector || !numberSearch) return (sharedState.isRunning = false);

    if (!sharedState.isRunning) return;

    window.postMessage({
      type: "CONTENT",
      message: "ADDCODE",
      data: buuGui.MaBuuGui,
    });
    await delay(500);

    // Kiểm tra hộp thông báo
    const alertBox = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    if (alertBox?.innerText) {
      const textShow = alertBox.innerText.split("\n").pop() ?? "";
      console.log("Alert:", textShow);

      await chrome.runtime.sendMessage({
        event: "CONTENT",
        message: "MESSAGE",
        content: textShow,
        keyMessage,
      });

      if (textShow.includes("Bưu gửi đã được xử lý")) return (sharedState.isRunning = false);
    }

    const notNumberSearch = await waitForNotElm("#ttNumberSearch", 30);
    if (notNumberSearch !== "ok") {
      console.log("notNumberSearch");
      return (sharedState.isRunning = false);
    }


    if (!sharedState.isRunning) return;

    if (isFirstRun) {
      isFirstRun = false;
      console.log("Pre-check money...");
      await delay(1000);
    }

    const moneyInput = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input"
    );

    if (maKH === "C002446626") {
      const firstChar = buuGui.MaBuuGui[0].toUpperCase();
      const dichVu = firstChar === "C" ? "CTN009" : firstChar === "E" ? "ETN037" : null;
      if (dichVu) {
        window.postMessage({ type: "CONTENT", message: "CHANGEDICHVU", dichvu: dichVu });
        await delay(1000);
      }
    }
    await delay(500);
    const weightThucTe = document.querySelector<HTMLInputElement>("#weight");
    const weightNotDot = weightThucTe?.value.replace(".", "")
    if (weightThucTe) {
      if (
        buuGui.KhoiLuong.toString() !== weightNotDot) {
        window.postMessage({
          type: "CONTENT",
          message: "ADDWEIGHT",
          data: buuGui.MaBuuGui,
          kl: buuGui.KhoiLuong,
        });
        await delay(400);
      }
      else if (options) {
        if (options.selectedOption === "changeKLFromTo") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: options.changeKLFromTo,
          });
          await delay(1000);
        } else if (options.selectedOption === "contentChange") {
          debugger
          const contentItem = document.querySelector<HTMLInputElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(7) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > textarea")
          if (contentItem) {
            var changes = options.contentChanges;
            //chuyen khong dau va viet thuong
            var content = contentItem.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            var klHienTai = 0;
            var klThem = 0;

            for (let i = 0; i < changes.length; i++) {
              if (content.indexOf(changes[i].content) !== -1) {
                if (changes[i].content.startsWith("+")) {
                  klThem += Number(changes[i].khoiLuong);
                } else {
                  klHienTai = Number(changes[i].khoiLuong);
                }
              }
            }
            var klAll = klHienTai + klThem;

            if (klAll > 0) {
              window.postMessage({
                type: "CONTENT",
                message: "ADDWEIGHT",
                data: buuGui.MaBuuGui,
                kl: klAll,
              });
              await delay(400);
            }
          }
        }
        else if (options.selectedOption === "increaseKL") {
          window.postMessage({
            type: "CONTENT",
            message: "ADDWEIGHT",
            data: buuGui.MaBuuGui,
            kl: (Number(weightNotDot) + Number(options.increaseKL)).toString(),
          });
          await delay(400);



        }
      }
    }

    if (buuGui.ListDo) {
      window.postMessage({
        type: "CONTENT",
        message: "ADDKICHTHUOC",
        data: buuGui.MaBuuGui,
        kt: buuGui.ListDo,
      });
      await delay(1000);
    }

    if (maKH === "C007445066" && Number(moneyInput?.value) < 200) {
      window.postMessage({
        type: "CONTENT",
        message: "ADDWEIGHT",
        data: buuGui.MaBuuGui,
        kl: "5000",
      });
      await delay(1000);
    }

    // Xử lý nút tìm kiếm
    const findAndSearchBtn = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button"
      , 30);
    if (!findAndSearchBtn) return (sharedState.isRunning = false);
    if (!sharedState.isRunning) return;

    (findAndSearchBtn as HTMLElement).click();
    await delay(500);

    // Kiểm tra hộp thông báo sau khi bấm nút
    const alertBoxAfterClick = document.querySelector<HTMLElement>("#root > div.s-alert-wrapper");
    if (alertBoxAfterClick?.innerText) {
      const textShow = alertBoxAfterClick.innerText.split("\n").pop() ?? "";
      console.log("Alert:", textShow);

      await chrome.runtime.sendMessage({
        event: "CONTENT",
        message: "MESSAGE",
        content: textShow,
        keyMessage,
      });

      if (textShow.includes("Bưu gửi đã được xử lý")) return (sharedState.isRunning = false);
    }

    // Kiểm tra lại phần nhập mã số

    if (!sharedState.isRunning) return;

    const moneyThuHo = document.querySelector<HTMLInputElement>(
      "#content > div > div > div.sub-content.multiple-item-no-footer > form > div:nth-child(3) > div > div > div:nth-child(10) > div:nth-child(3) > div > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-7 > input"
    );

    // Gửi dữ liệu lên popup hoặc Firebase
    await chrome.runtime.sendMessage({
      event: "CONTENT",
      message: "SEND_MH",
      content: buuGui.MaBuuGui,
      content1: moneyThuHo?.value ?? "ko biết",
      keyMessage,
    });
    if (!await waitForElm("#ttNumberSearch", 10)) return (sharedState.isRunning = false);
  } catch (error) {
    console.error("Error in startSendCurrentCode:", error);
    sharedState.isRunning = false;
  }
};

let currentMH: BuuGuiProps;
let list: BuuGuiProps[] = [];
async function changeKL(kl: any) {
  try {
    console.log("Đang thay đổi khối lượng", kl);
    await delay(1000);
    const weightThucTe = document.querySelector<HTMLInputElement>("#weight");
    if (weightThucTe) {
      // window.postMessage({
      //   type: "CONTENT",
      //   message: "ADDWEIGHT",
      //   kl: kl,
      // });

      // var form: HTMLElement | null = document.querySelector(
      //     "#content > div > div > div.sub-content.multiple-item-no-footer > form"
      //   );
      //   const formR: any = FindReact(form);
      //   //change "5000" to "5.000"
      //   var klTemp = event.data.kl.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1.')

      //   formR.setState({
      //     formValue: { ...formR.state.formValue, weight: klTemp },
      //   });

      await waitForElm('.rt-tbody button.btn-link')

      await delay(100);

      weightThucTe.value = kl.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1.')
      weightThucTe.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      weightThucTe.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      weightThucTe.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
      await delay(400);

    }
    // Xử lý nút tìm kiếm
    const findAndSearchBtn = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button"
      , 30);

    (findAndSearchBtn as HTMLElement).click();
    await delay(500);

    // Kiểm tra lại phần nhập mã số

  } catch (error) {
    console.error("Error in startSendCurrentCode:", error);
    sharedState.isRunning = false;
  }

}

// Interface để match với ExtractedData class từ Flutter
interface ExtractedData {
  maHieu?: string;
  tenNguoiNhan?: string;
  diaChi?: string;
  soDienThoai?: string;
}

/**
 * Hàm điền thông tin từ AI vào form portal
 * @param extractedData Dữ liệu được trích xuất từ AI (Flutter)
 */
async function fillPortalFormWithAIData(extractedData: ExtractedData): Promise<void> {
  console.log("Starting to fill portal form with AI data:", extractedData);

  try {
    // Chờ form xuất hiện
    const form = await waitForElm("#content > div > div > div.sub-content.multiple-item-no-footer > form", 5000);
    if (!form) {
      throw new Error("Không tìm thấy form portal để điền thông tin");
    }

    // Tạo event để trigger các thay đổi
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });

    // Điền mã hiệu (tracking number)
    if (extractedData.maHieu) {
      const maHieuInput: HTMLInputElement | null = document.querySelector("#ttNumber");
      if (maHieuInput) {
        maHieuInput.value = extractedData.maHieu;
        maHieuInput.dispatchEvent(inputEvent);
        maHieuInput.dispatchEvent(changeEvent);
        console.log("Đã điền mã hiệu:", extractedData.maHieu);
      }
    }

    // Điền tên người nhận
    if (extractedData.tenNguoiNhan) {
      const receiverNameInput: HTMLInputElement | null = document.querySelector("#receiverName");
      if (receiverNameInput) {
        receiverNameInput.value = extractedData.tenNguoiNhan;
        receiverNameInput.dispatchEvent(inputEvent);
        receiverNameInput.dispatchEvent(changeEvent);
        console.log("Đã điền tên người nhận:", extractedData.tenNguoiNhan);
      }
    }

    // Điền địa chỉ người nhận
    if (extractedData.diaChi) {
      const receiverAddressInput: HTMLInputElement | null = document.querySelector("#receiverAddress");
      if (receiverAddressInput) {

        // Kiểm tra nếu địa chỉ có chứa "BÌNH ĐỊNH" thì chuyển sang địa bàn cũ
        if (extractedData.diaChi.toUpperCase().includes("BÌNH ĐỊNH")) {
          console.log("Phát hiện địa chỉ Bình Định, chuyển sang địa bàn cũ");

          // Tìm và click vào radio button "Địa bàn cũ" bằng selector cụ thể
          const radioDiaBanCu: HTMLInputElement | null = document.querySelector("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div:nth-child(4) > div:nth-child(2) > label > input");
          if (radioDiaBanCu) {
            radioDiaBanCu.checked = true;
            radioDiaBanCu.click();
            radioDiaBanCu.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            console.log("Đã chuyển sang địa bàn cũ");
          }
        }
        receiverAddressInput.value = extractedData.diaChi;
        receiverAddressInput.dispatchEvent(inputEvent);
        receiverAddressInput.dispatchEvent(changeEvent);
        console.log("Đã điền địa chỉ:", extractedData.diaChi);


        var button = document.querySelector<HTMLElement>("#content > div > div > div.sub-content.multiple-item-no-footer > form > div.MuiGrid-root.content-box.MuiGrid-container > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > div > div > div.MuiGrid-root.MuiGrid-container.MuiGrid-item.MuiGrid-grid-xs-8 > div.MuiGrid-root.MuiGrid-item.MuiGrid-grid-xs-10 > button:nth-child(3)")
        if (button) {
          button.click()
        }
      }
    }

    // Điền số điện thoại người nhận
    if (extractedData.soDienThoai) {
      const receiverPhoneInput: HTMLInputElement | null = document.querySelector("#receiverPhone");
      if (receiverPhoneInput) {
        receiverPhoneInput.value = extractedData.soDienThoai;
        receiverPhoneInput.dispatchEvent(inputEvent);
        receiverPhoneInput.dispatchEvent(changeEvent);
        console.log("Đã điền số điện thoại:", extractedData.soDienThoai);
      }
    }

    // Delay nhỏ để đảm bảo các thay đổi được áp dụng
    await delay(300);

    console.log("Hoàn thành điền thông tin từ AI vào form portal");

  } catch (error) {
    console.error("Lỗi khi điền thông tin vào form portal:", error);
    throw error;
  }
}

