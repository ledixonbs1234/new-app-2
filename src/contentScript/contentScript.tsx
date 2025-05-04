import { KhachLeProps } from "../states/states";
import { handlePortalHCCPage, handlePortalPage } from "./handlePortalPage";
import { delay, waitForElm, waitForNotElm } from "./utils";

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
  console.log("CONTENT SCRIPT");

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
        if (msg.message === "PROCESS_SINGLE_ITEM") {
          console.log("Processing single item:", msg.current.MaBuuGui);
          try {
            // Gọi hàm xử lý một item (có thể là hàm startSendCurrentCode đã sửa đổi)
            const result = await processSinglePortalItem(msg.current, msg.makh, msg.keyMessage, msg.options);
            console.log("Finished processing", msg.current.MaBuuGui, "Result:", result);
            callback({ status: "success", maBG: msg.current.MaBuuGui }); // Báo thành công
          } catch (error: any) {
            console.error(`Error processing ${msg.current.MaBuuGui}:`, error);
            // --- BÁO LỖI VỀ BACKGROUND ---
            callback({ status: "error", maBG: msg.current.MaBuuGui, error: error.message || "Lỗi không xác định trên Portal" });
          }
        }
        else if (msg.message === "CHANGEKL") {
          changeKL(msg.kl);
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

            //kiêmr tra xem có form không
            var form = await waitForElm(
              "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form"
            );
            if (form == null) {
              callback({ data: "Không tìm thấy ô tìm kiếm" });
              return;
            }
            // forcus vào ô tìm kiếm
            // const searchDetailBox = document.querySelector(
            //   "#searchDetailBox"
            // ) as HTMLInputElement;
            // searchDetailBox?.focus();
            var customerCode: HTMLInputElement | null =
              document.querySelector("#customerCode");
            if (customerCode) {
              customerCode.value = msg.MaKH; // Đặt giá trị trước
              customerCode.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              customerCode.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              customerCode?.dispatchEvent(new Event("blur"));

              // click vào nút địa chỉ

            }
            var address: HTMLInputElement | null =
              document.querySelector("#customerAddress");
            address?.focus();

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
              "#customerContractNumber"
            );
            //thucw hien lay hop dong va send tin nhan
            chrome.runtime.sendMessage({
              event: "CONTENT",
              message: "SEND_MAHD",
              content: maHopDong?.value ?? "",
              keyMessage: msg.keyMessage,
            });

            await delay(200);
            // callback({ data: "callback khoi tao ok" });
            var btnLuuVaTim: HTMLInputElement | null = document.querySelector(
              "#content > div > div > div.sub-content.multiple-item-no-footer > div > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > form > div:nth-child(11) > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-6 > div:nth-child(1) > div > button"
            );
            if (btnLuuVaTim) {
              btnLuuVaTim?.click();
              await delay(1500);
              var searchBox = document.querySelector(
                "#ttNumberSearch"
              ) as HTMLInputElement;
              if (searchBox) {
                searchBox.focus();
                callback({ data: "ok" });
              } else {
                callback({ data: "Lỗi không tìm thấy ô tìm kiếm Mã bưu gửi" });
              }
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
                "Abc@123456";

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
});

let isFirstRun = true;

// --- HÀM MỚI hoặc SỬA ĐỔI: Xử lý MỘT item trên Portal ---
// (Đây là logic cũ của startSendCurrentCode nhưng không còn vòng lặp và cờ isRunning)
async function processSinglePortalItem(
  buuGui: BuuGuiProps,
  maKH: any,
  keyMessage: string, // keyMessage có thể không cần ở content script nữa
  options: any
): Promise<void> { // Trả về Promise để background biết khi nào xong, throw error nếu lỗi
  console.log("Processing Portal item:", buuGui.MaBuuGui);
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
    const notNumberSearch = await waitForNotElm("#ttNumberSearch", 15); // Tăng timeout
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
    const weightThucTe = document.querySelector<HTMLInputElement>("#weight");
    const weightNotDot = weightThucTe?.value.replace(".", "")
    if (weightThucTe) {
      if (
        buuGui.KhoiLuong.toString() !== weightNotDot) {
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
      10
    );
    if (!findAndSearchBtn) {
      throw new Error("Không tìm thấy nút 'Lưu và tìm kiếm'");
    }

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

  } catch (error: any) {
    console.error(`Error in processSinglePortalItem for ${buuGui?.MaBuuGui}:`, error);
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

    const notNumberSearch = await waitForNotElm("#ttNumberSearch", 10);
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
    );
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
      window.postMessage({
        type: "CONTENT",
        message: "ADDWEIGHT",
        kl: kl,
      });
      await delay(400);
    }
    // Xử lý nút tìm kiếm
    const findAndSearchBtn = await waitForElm(
      "#content > div > div > div.sub-content.multiple-item-no-footer > div > div:nth-child(1) > div > button"
    );

    (findAndSearchBtn as HTMLElement).click();
    await delay(500);

    // Kiểm tra lại phần nhập mã số

  } catch (error) {
    console.error("Error in startSendCurrentCode:", error);
    sharedState.isRunning = false;
  }

}

