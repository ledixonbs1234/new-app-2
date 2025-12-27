
export interface SyncProgress {
  total: number;
  downloaded: number;
  failed: number;
  status: "idle" | "syncing" | "completed" | "error";
}

export async function syncAllImages(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "TRIGGER_SYNC_IMAGES" }, (response) => {
      // Background xác nhận đã nhận lệnh
      console.log("[SidePanel] Yêu cầu sync đã gửi:", response);
      resolve();
    });
  });
}

 
export function listenToFirebaseImages(
  callback: () => void
): () => void {
  const listener = (message: any) => {
    if (message.type === "IMAGES_UPDATED") {
      console.log("[SidePanel] Background báo dữ liệu đã cập nhật -> Reload UI");
      callback();
    }
  };

  chrome.runtime.onMessage.addListener(listener);

  // Hàm cleanup
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}

