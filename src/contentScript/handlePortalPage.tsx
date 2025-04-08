import { sharedState } from "./contentScript";
import { delay, waitForElm } from "./utils";
export function handlePortalHCCPage() {
  var sel = "#content > div > div > div.sub-content.multiple-item-no-footer > div.content-box.item-detail-list > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div.MuiGrid-root.MuiGrid-container > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-8";

  waitForElm(sel).then(() => {
    console.log("Tìm thấy HCC");
    const buttonContainer = document.querySelector(sel);
    const newButtonDiv = document.createElement("div");
    newButtonDiv.className = "MuiGrid-root MuiGrid-item";

    const newButton = document.createElement("button");
    newButton.type = "button";

    newButton.className = "btn btn-primary btn-sm";
    newButton.title = "ALT+N";
    newButton.innerHTML = '<svg class="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9, 2-2V5c0-1.1-.9-2-2-2zm-7 14H8v-2h4v2zm0-4H8v-2h4v2zm0-4H8V7h4v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg> Xuất Excel';

    newButtonDiv.appendChild(newButton);
    buttonContainer!.insertBefore(newButtonDiv, buttonContainer!.children[1]);

    // Add event listener to open dialog
    newButton.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.style.position = "fixed";
      dialog.style.top = "50%";
      dialog.style.left = "50%";
      dialog.style.transform = "translate(-50%, -50%)";
      dialog.style.backgroundColor = "white";
      dialog.style.padding = "20px";
      dialog.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
      dialog.style.zIndex = "1000";
      dialog.style.width = "300px";
      dialog.style.borderRadius = "8px";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Nhập mã yêu cầu thu gom";
      input.style.width = "100%";
      input.style.marginBottom = "10px";
      input.style.padding = "8px";
      input.style.border = "1px solid #ccc";
      input.style.borderRadius = "4px";

      const note = document.createElement("p");
      note.innerText = "Danh sách khi xuất chỉ hổ trợ cơ bản khi người dùng nhập bình thường, còn những trường hợp hiếm thì gdv lưu ý giúp. Hiện tại vẫn chưa hỗ trợ nhập nội dung hàng hóa, gdv vui lòng sửa trong file exel mới xuất.";
      note.style.fontSize = "12px";
      note.style.color = "#555";
      note.style.marginBottom = "10px";

      const exportButton = document.createElement("button");
      exportButton.innerText = "Xuất Excel";
      exportButton.className = "btn btn-primary btn-sm";
      exportButton.style.marginRight = "10px";
      exportButton.addEventListener("click", async () => {
        //Công việc như sau :
        //1. Lấy mã yêu cầu thu gom
        //2. Lấy thông tin từ trang web
        sharedState.idKH = null;
        sharedState.token = null;
        window.postMessage({
          type: "CONTENT",
          message: "GETIDKHEXCEL",
        });
        // chờ 2 s dùng await
        await delay(2000);

        if (sharedState.idKH === null && sharedState.token === null) {
          alert("Không lấy id bản kê hoặc token được, vui lòng thử lại");
          return;
        } else {
          console.log("IDKH", sharedState.idKH);
          chrome.runtime.sendMessage({
            event: "CONTENT",
            message: "REQUEST_EXCEL",
            content: sharedState.idKH,
            token: sharedState.token,
            request: input.value,
            ishcc: true,
          });
          // Add your export logic here
        }

        document.body.removeChild(dialog);

        //3. Xuất thông tin ra file excel
      });

      const closeButton = document.createElement("button");
      closeButton.innerText = "Đóng";
      closeButton.className = "btn btn-secondary btn-sm";
      closeButton.addEventListener("click", () => {
        document.body.removeChild(dialog);
      });

      dialog.appendChild(input);
      dialog.appendChild(note);
      dialog.appendChild(exportButton);
      dialog.appendChild(closeButton);
      document.body.appendChild(dialog);
    });
  });
}

export function handlePortalPage() {
  var sel = "#content > div > div > div.sub-content.multiple-item-no-footer > div.content-box.item-detail-list > div.MuiPaper-root.content-box-info.MuiPaper-elevation1.MuiPaper-rounded > div.MuiGrid-root.MuiGrid-container > div.MuiGrid-root.content-box-button.MuiGrid-container.MuiGrid-item.MuiGrid-justify-content-xs-center.MuiGrid-grid-xs-8";

  waitForElm(sel).then(() => {
    console.log("tim thay web nayf");
    const buttonContainer = document.querySelector(sel);
    const newButtonDiv = document.createElement("div");
    newButtonDiv.className = "MuiGrid-root MuiGrid-item";

    const newButton = document.createElement("button");
    newButton.type = "button";

    newButton.className = "btn btn-primary btn-sm";
    newButton.title = "ALT+N";
    newButton.innerHTML = '<svg class="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9, 2-2V5c0-1.1-.9-2-2-2zm-7 14H8v-2h4v2zm0-4H8v-2h4v2zm0-4H8V7h4v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg> Xuất Excel';

    newButtonDiv.appendChild(newButton);
    buttonContainer!.insertBefore(newButtonDiv, buttonContainer!.children[1]);

    // Add event listener to open dialog
    newButton.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.style.position = "fixed";
      dialog.style.top = "50%";
      dialog.style.left = "50%";
      dialog.style.transform = "translate(-50%, -50%)";
      dialog.style.backgroundColor = "white";
      dialog.style.padding = "20px";
      dialog.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
      dialog.style.zIndex = "1000";
      dialog.style.width = "300px";
      dialog.style.borderRadius = "8px";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Nhập mã yêu cầu thu gom";
      input.style.width = "100%";
      input.style.marginBottom = "10px";
      input.style.padding = "8px";
      input.style.border = "1px solid #ccc";
      input.style.borderRadius = "4px";

      const note = document.createElement("p");
      note.innerText = "Danh sách khi xuất chỉ hổ trợ cơ bản khi người dùng nhập bình thường, còn những trường hợp hiếm thì gdv lưu ý giúp. Hiện tại vẫn chưa hỗ trợ nhập nội dung hàng hóa, gdv vui lòng sửa trong file exel mới xuất.";
      note.style.fontSize = "12px";
      note.style.color = "#555";
      note.style.marginBottom = "10px";

      const exportButton = document.createElement("button");
      exportButton.innerText = "Xuất Excel";
      exportButton.className = "btn btn-primary btn-sm";
      exportButton.style.marginRight = "10px";
      exportButton.addEventListener("click", async () => {
        //Công việc như sau :
        //1. Lấy mã yêu cầu thu gom
        //2. Lấy thông tin từ trang web
        sharedState.idKH = null;
        sharedState.token = null;
        window.postMessage({
          type: "CONTENT",
          message: "GETIDKHEXCEL",
        });
        // chờ 2 s dùng await
        await delay(2000);

        if (sharedState.idKH === null && sharedState.token === null) {
          alert("Không lấy id bản kê hoặc token được, vui lòng thử lại");
          return;
        } else {
          console.log("IDKH", sharedState.idKH);
          chrome.runtime.sendMessage({
            event: "CONTENT",
            message: "REQUEST_EXCEL",
            content: sharedState.idKH,
            token: sharedState.token,
            request: input.value,
          });
          // Add your export logic here
        }

        document.body.removeChild(dialog);

        //3. Xuất thông tin ra file excel
      });

      const closeButton = document.createElement("button");
      closeButton.innerText = "Đóng";
      closeButton.className = "btn btn-secondary btn-sm";
      closeButton.addEventListener("click", () => {
        document.body.removeChild(dialog);
      });

      dialog.appendChild(input);
      dialog.appendChild(note);
      dialog.appendChild(exportButton);
      dialog.appendChild(closeButton);
      document.body.appendChild(dialog);
    });
  });
}
