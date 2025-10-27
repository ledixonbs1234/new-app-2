import { Button, Card, Input, message, Space, Progress, DatePicker } from "antd";
import { useState, useEffect } from "react";
import dayjs, { Dayjs } from "dayjs";

export default function GoogleFormTab() {
  const [hrmCode, setHrmCode] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    // Load saved data from storage (không load ngày, luôn dùng ngày hôm nay)
    chrome.storage.local.get(["hrmCode", "fullName"], (result) => {
      if (result.hrmCode) setHrmCode(result.hrmCode);
      if (result.fullName) setFullName(result.fullName);
    });
    
    // Reset ngày về hôm nay mỗi lần mở popup
    setSelectedDate(dayjs());
  }, []);

  const handleSaveInfo = () => {
    if (!hrmCode || !fullName) {
      message.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (hrmCode.length !== 8) {
      message.error("Mã HRM phải có đúng 8 số");
      return;
    }

    chrome.storage.local.set({ hrmCode, fullName }, () => {
      message.success("Đã lưu thông tin");
    });
  };

  const fillCurrentPage = async (tab: chrome.tabs.Tab): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id!,
        {
          type: "FILL_GOOGLE_FORM",
          payload: {
            hrmCode,
            fullName,
            date: selectedDate.format("YYYY-MM-DD"), // Gửi ngày theo định dạng YYYY-MM-DD
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: "No response" });
        }
      );
    });
  };

  const waitForPageLoad = (tabId: number): Promise<void> => {
    return new Promise((resolve) => {
      const listener = (
        changedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (changedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          // Additional delay to ensure form is fully loaded
          setTimeout(() => resolve(), 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  };

  const handleAutoRun = async () => {
    if (!hrmCode || !fullName) {
      message.error("Vui lòng nhập và lưu thông tin trước");
      return;
    }

    if (hrmCode.length !== 8) {
      message.error("Mã HRM phải có đúng 8 số");
      return;
    }

    setIsRunning(true);
    setProgress(0);

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.id) {
        message.error("Không tìm thấy tab hiện tại");
        setIsRunning(false);
        return;
      }

      // Check if current URL is Google Forms
      if (!tab.url?.includes("docs.google.com/forms")) {
        message.error("Vui lòng mở trang Google Forms");
        setIsRunning(false);
        return;
      }

      message.loading({ content: "Bắt đầu tự động điền form...", key: "autoFill", duration: 0 });

      // Page 1: Fill basic info
      setCurrentStep("Đang điền Trang 1 (Thông tin cơ bản)...");
      setProgress(20);
      let result = await fillCurrentPage(tab);
      if (!result.success) {
        throw new Error("Lỗi trang 1: " + result.error);
      }
      
      // Wait for page 2 to load
      await waitForPageLoad(tab.id);
      
      // Page 2: Select radio button
      setCurrentStep("Đang điền Trang 2 (Chọn LLBH tuyến đầu)...");
      setProgress(40);
      result = await fillCurrentPage(tab);
      if (!result.success) {
        throw new Error("Lỗi trang 2: " + result.error);
      }
      
      // Wait for page 3 to load
      await waitForPageLoad(tab.id);
      
      // Page 3: Fill 2 fields
      setCurrentStep("Đang điền Trang 3 (2 trường)...");
      setProgress(60);
      result = await fillCurrentPage(tab);
      if (!result.success) {
        throw new Error("Lỗi trang 3: " + result.error);
      }
      
      // Wait for page 4 to load
      await waitForPageLoad(tab.id);
      
      // Page 4: Fill 12 fields
      setCurrentStep("Đang điền Trang 4 (12 trường TCBC)...");
      setProgress(80);
      result = await fillCurrentPage(tab);
      if (!result.success) {
        throw new Error("Lỗi trang 4: " + result.error);
      }
      
      // Wait for page 5 to load
      await waitForPageLoad(tab.id);
      
      // Page 5: Fill 2 fields (PPBL)
      setCurrentStep("Đang điền Trang 5 (2 trường PPBL)...");
      setProgress(95);
      result = await fillCurrentPage(tab);
      if (!result.success) {
        throw new Error("Lỗi trang 5: " + result.error);
      }
      
      // Success
      setProgress(100);
      setCurrentStep("Hoàn thành!");
      message.success({ 
        content: "Đã điền toàn bộ form thành công!", 
        key: "autoFill",
        duration: 3
      });
      
    } catch (error: any) {
      message.error({ 
        content: "Lỗi: " + error.message, 
        key: "autoFill",
        duration: 5
      });
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        setCurrentStep("");
        setProgress(0);
      }, 3000);
    }
  };

  return (
    <Card title="Tự động điền Google Form">
      <Space direction="vertical" style={{ width: "100%" }}>
        <div>
          <label style={{ fontWeight: "bold" }}>Mã HRM (8 số):</label>
          <Input
            value={hrmCode}
            onChange={(e) => setHrmCode(e.target.value)}
            placeholder="Nhập mã HRM (8 số)"
            maxLength={8}
            style={{ marginTop: 5 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: "bold" }}>Họ và Tên:</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nhập họ và tên"
            style={{ marginTop: 5 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: "bold" }}>Báo cáo DT/DS ngày:</label>
          <DatePicker
            value={selectedDate}
            onChange={(date) => setSelectedDate(date || dayjs())}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày"
            style={{ marginTop: 5, width: "100%" }}
            allowClear={false}
          />
          <p style={{ margin: "5px 0 0 0", fontSize: 11, color: "#999" }}>
            💡 Mặc định là ngày hôm nay (tự động cập nhật mỗi lần mở popup)
          </p>
        </div>

        <Button
          type="default"
          onClick={handleSaveInfo}
          block
          style={{ marginTop: 10 }}
        >
          Lưu thông tin
        </Button>

        <Button
          type="primary"
          onClick={handleAutoRun}
          loading={isRunning}
          disabled={isRunning}
          block
          style={{ marginTop: 10 }}
          size="large"
        >
          {isRunning ? "Đang chạy..." : "Tự động điền toàn bộ"}
        </Button>

        {isRunning && (
          <div style={{ marginTop: 10 }}>
            <Progress percent={progress} status="active" />
            <p style={{ marginTop: 5, fontSize: 12, color: "#1890ff", textAlign: "center" }}>
              {currentStep}
            </p>
          </div>
        )}

        <div style={{ marginTop: 10, padding: 10, backgroundColor: "#f0f0f0", borderRadius: 5 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
            <strong>Lưu ý:</strong> Chức năng này chỉ hoạt động trên trang Google Forms
          </p>
          <p style={{ margin: "5px 0 0 0", fontSize: 12, color: "#1890ff" }}>
            ℹ️ <strong>Cách sử dụng:</strong>
          </p>
          <ol style={{ margin: "5px 0 0 0", paddingLeft: 20, fontSize: 12, color: "#666" }}>
            <li>Nhập và lưu thông tin Mã HRM và Họ tên</li>
            <li>Mở trang đầu tiên của Google Forms</li>
            <li>Click nút "Tự động điền toàn bộ"</li>
            <li>Đợi hệ thống tự động điền hết 5 trang</li>
          </ol>
          <p style={{ margin: "5px 0 0 0", fontSize: 11, color: "#52c41a" }}>
            ✅ Hệ thống sẽ tự động điền và chuyển trang cho bạn
          </p>
        </div>
      </Space>
    </Card>
  );
}
