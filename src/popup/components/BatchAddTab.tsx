import { Button, Card, InputNumber, message, Space, Input } from "antd";
import { useState } from "react";

export default function BatchAddTab() {
  const [rowCount, setRowCount] = useState<number>(1);
  const [content, setContent] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddBatch = async () => {
    // Validate input
    if (!rowCount || rowCount < 1) {
      message.error("Số lượng dòng phải lớn hơn 0");
      return;
    }
    if (!content.trim()) {
      message.error("Nội dung hàng hóa không được để trống");
      return;
    }
    if (!weight.trim()) {
      message.error("Khối lượng không được để trống");
      return;
    }

    setIsAdding(true);

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        message.error("Không tìm thấy tab hiện tại");
        setIsAdding(false);
        return;
      }

      // Check if current URL matches
      if (!tab.url?.includes("https://my.vnpost.vn/order/domestic/batch/create")) {
        message.error("Vui lòng mở trang https://my.vnpost.vn/order/domestic/batch/create");
        setIsAdding(false);
        return;
      }

      // Show success message and close popup immediately
      message.success(`Đang thêm ${rowCount} dòng... Popup sẽ đóng để tránh xung đột focus.`, 2);
      
      // Small delay to let user see the message
      await new Promise(resolve => setTimeout(resolve, 500));

      // Focus the tab first to restore page focus
      await chrome.tabs.update(tab.id, { active: true });
      
      // Send message to content script
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "ADD_BATCH_ROWS",
          payload: {
            rowCount,
            content,
            weight,
          },
        },
        (response) => {
          // This callback might not be called if popup closes
          if (chrome.runtime.lastError) {
            console.error("Error:", chrome.runtime.lastError.message);
            return;
          }
          
          if (response && response.success) {
            console.log(`Successfully added ${rowCount} rows`);
          } else {
            console.error(response?.error || "Unknown error");
          }
        }
      );
      
      // Close popup after a small delay to ensure message is sent
      setTimeout(() => {
        window.close();
      }, 100);
      
    } catch (error: any) {
      setIsAdding(false);
      message.error("Lỗi: " + error.message);
    }
  };

  return (
    <Card title="Thêm danh sách hàng loạt">
      <Space direction="vertical" style={{ width: "100%" }}>
        <div>
          <label style={{ fontWeight: "bold" }}>Số lượng dòng cần thêm:</label>
          <InputNumber
            min={1}
            max={100}
            value={rowCount}
            onChange={(value) => setRowCount(value || 1)}
            style={{ width: "100%", marginTop: 5 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: "bold" }}>Nội dung hàng hóa:</label>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập nội dung hàng hóa"
            style={{ marginTop: 5 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: "bold" }}>Khối lượng (gram):</label>
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Ví dụ: 1.000"
            style={{ marginTop: 5 }}
          />
        </div>

        <Button
          type="primary"
          onClick={handleAddBatch}
          loading={isAdding}
          disabled={isAdding}
          block
          style={{ marginTop: 10 }}
        >
          Thêm danh sách
        </Button>

        <div style={{ marginTop: 10, padding: 10, backgroundColor: "#f0f0f0", borderRadius: 5 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
            <strong>Lưu ý:</strong> Chức năng này chỉ hoạt động trên trang{" "}
            <a href="https://my.vnpost.vn/order/domestic/batch/create" target="_blank" rel="noreferrer">
              Tạo đơn hàng loạt
            </a>
          </p>
          <p style={{ margin: "5px 0 0 0", fontSize: 12, color: "#ff4d4f" }}>
            ⚠️ Popup sẽ tự động đóng sau khi bấm "Thêm danh sách" để tránh xung đột focus với trang web.
          </p>
        </div>
      </Space>
    </Card>
  );
}
