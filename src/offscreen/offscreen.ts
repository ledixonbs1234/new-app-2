console.log('Offscreen document loaded');

// Hàm helper để chuyển base64 thành Blob
function base64ToBlob(base64: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Lắng nghe message từ background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PRINT_PDF") {
    console.log("Received PRINT_PDF message in offscreen");
    
    try {
      // Lấy base64 data từ message
      const base64Data = message.base64Data;
      
      // Chuyển base64 thành Blob
      const blob = base64ToBlob(base64Data, "application/pdf");
      
      // Tạo Object URL
      const url = URL.createObjectURL(blob);
      
      // Mở cửa sổ in
      const printWindow = window.open(url);
      
      if (printWindow) {
        printWindow.onload = function() {
          // In tự động khi tải xong
          printWindow.print();
          
          // // Dọn dẹp URL sau khi in
          // setTimeout(() => {
          //   URL.revokeObjectURL(url);
          //   printWindow.close();
          // }, 1000);
        };
        
        sendResponse({ success: true });
      } else {
        throw new Error("Không thể mở cửa sổ in - có thể bị chặn popup");
      }
      
    } catch (error:any) {
      console.error("Lỗi khi in PDF:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true; // Giữ kênh message mở
});