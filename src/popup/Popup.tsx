

import { Button, Card, Input, List, message, Space, Tabs, TabsProps } from "antd";
import { useEffect, useState } from "react";
import './popup.css'
import { setOrders, clearOrders, Order, setCurrentIndex } from "./popup.slice";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import TextArea from "antd/es/input/TextArea";

export default function Popup() {
  // Lấy dữ liệu từ Redux store
  const { orderData, currentIndex } = useSelector((state: RootState) => state.popup);
  const dispatch = useDispatch();
  const [keyMessageInput, setKeyMessageInput] = useState<string>("");
  const [accountPortal, setAccountPortal] = useState<string>("");
  const [passwordPortal, setPasswordPortal] = useState<string>("");
  const [buuCuc, setBuuCuc] = useState<string>("593200");
  const [jsonInput, setJsonInput] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  // Các màu gốc chúng ta cần tìm và đếm
const baseColors: string[] = ["TRANG", "DO", "XANH"];
  useEffect(() => {
    console.log("Popup is running...");

    //get keymessage accountPortal and passwordPortal from storage
    chrome.storage.local.get(["keyMessage", "accountPortal", "passwordPortal", "buuCuc"], (result) => {
      setKeyMessageInput(result.keyMessage);
      setAccountPortal(result.accountPortal);
      setPasswordPortal(result.passwordPortal);
      setBuuCuc(result.buuCuc);
    });

  }, []);

  // Load dữ liệu ban đầu từ session storage khi popup mở
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_INITIAL_DATA" }, (response) => {
      if (response && response.orders) {
        dispatch(setOrders({ orders: response.orders, from: 'background' }));
        if (response.currentIndex) {
          dispatch(setCurrentIndex({ index: response.currentIndex, from: 'background' }));
        }
      }
    });

    // Lắng nghe các thay đổi từ background (ví dụ: content-script cập nhật index)
    const listener = (msg: any) => {
      if (msg.type === "STORAGE_UPDATED") {
        if (msg.payload.orders !== undefined) {
          dispatch(setOrders({ orders: msg.payload.orders, from: 'background' }));
        }
        if (msg.payload.currentIndex !== undefined) {
          dispatch(setCurrentIndex({ index: msg.payload.currentIndex, from: 'background' }));
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);

  }, [dispatch]);

  const handleSaveJson = (jsonText:string) => {
    if (!jsonText.trim()) {
      message.error("Vui lòng dán dữ liệu JSON.");
      return;
    }
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) throw new Error("Dữ liệu phải là một mảng.");
      dispatch(setOrders({ orders: data, from: 'popup' }));
      message.success(`Đã lưu thành công ${data.length} đơn hàng!`);
      setJsonInput('');
    } catch (e: any) {
      message.error("Lỗi JSON không hợp lệ: " + e.message);
    }
  };
  
function handleUsingAI(): void {
   if (!jsonInput.trim()) {
      message.error("Vui lòng dán dữ liệu JSON.");
      return;
    }
      setIsAiLoading(true);
       message.loading({ content: "AI đang xử lý, vui lòng chờ...", key: 'ai_processing', duration: 0 });
    try {
    

      chrome.runtime.sendMessage({ type: "SEND_AI_DATA",payload:jsonInput }, (response) => {
        // Hàm callback này sẽ được gọi khi background script gửi phản hồi
        
        // Luôn tắt trạng thái loading dù thành công hay thất bại
        setIsAiLoading(false);

        // Kiểm tra lỗi giao tiếp giữa popup và background
        if (chrome.runtime.lastError) {
          console.error("Lỗi giao tiếp:", chrome.runtime.lastError.message);
          message.error({ content: `Lỗi: ${chrome.runtime.lastError.message}`, key: 'ai_processing' });
          return;
        }
        if (response && response.status === 'success') {
          // Thành công: cập nhật thông báo và xử lý dữ liệu
          message.success({ content: "AI đã xử lý và lưu dữ liệu thành công!", key: 'ai_processing' });
          setJsonInput(''); // Xóa nội dung đã nhập
        } else {
          // Thất bại: hiển thị lỗi trả về từ background
          console.error("Lỗi từ background:", response.error);
          message.error({ content: `AI xử lý thất bại: ${response.error || 'Lỗi không xác định'}`, key: 'ai_processing' });
        }
    }); 
    } catch (e: any) {
      // Bắt các lỗi đồng bộ (hiếm khi xảy ra với sendMessage)
      setIsAiLoading(false);
      message.error({ content: "Lỗi không mong muốn khi gửi yêu cầu.", key: 'ai_processing' });
      console.error("Lỗi khi gửi yêu cầu AI:", e);
    }
}

  const handleClearData = () => {
    dispatch(clearOrders({ from: 'popup' }));
    message.info("Đã xóa dữ liệu đơn hàng.");
  };

  function handleSaveKey(): void {
    if (keyMessageInput === "") {
      alert("Key không được để trống");
      return;
    }
    chrome.storage.local.set({ keyMessage: keyMessageInput }, () => {
      console.log("Saved key message");
    });
    chrome.runtime.reload();
  }

  function handleSaveAccount(accountPortal: string, passwordPortal: string, buuCuc: string): void {
    if (!accountPortal || !passwordPortal || !buuCuc) {
      alert("Tài khoản hoặc mật khẩu và bưu cục không được để trống");
      return;
    }
    chrome.storage.local.set({ accountPortal: accountPortal, passwordPortal: passwordPortal, buuCuc: buuCuc }, () => {
      console.log("Saved account and password");
    });
    chrome.runtime.reload();
  }

  // --- HÀM ĐẾM MÀU TỔNG HỢP ---
function demTongHopMau(data: Order[], colorsToFind: string[]): Map<string, number> {
    // 1. Khởi tạo Map để lưu kết quả đếm.
    // Key là màu (chữ hoa), value là số lần đếm.
    const colorCounts = new Map<string, number>();
    colorsToFind.forEach(color => {
        colorCounts.set(color.toUpperCase(), 0);
    });

    // 2. Tạo một biểu thức chính quy từ mảng các màu cần tìm.
    // Ví dụ: ['TRANG', 'DO', 'XANH'] -> /TRANG|DO|XANH/gi
    const searchPattern = new RegExp(colorsToFind.join('|'), 'gi');

    // 3. Lặp qua từng item trong mảng orderData
    for (const item of data) {
        const mausacString = item.MAUSAC;

        // 4. Dùng .match() để tìm tất cả các chuỗi con khớp với regex
        const matches = mausacString.match(searchPattern);
        // Ví dụ: 
        // "TRANGTRANG".match(/TRANG|DO|XANH/gi) -> ['TRANG', 'TRANG']
        // "XANHDO".match(/TRANG|DO|XANH/gi)     -> ['XANH', 'DO']
        // "Không có".match(...)                -> null

        // 5. Nếu tìm thấy, lặp qua các kết quả và cập nhật bộ đếm
        if (matches) {
            for (const match of matches) {
                const standardizedMatch = match.toUpperCase(); // Chuẩn hóa về chữ hoa
                const currentCount = colorCounts.get(standardizedMatch) || 0;
                colorCounts.set(standardizedMatch, currentCount + 1);
            }
        }
    }

    return colorCounts;
}

  const items: TabsProps['items'] = [
    {
      key: '1',
      label: `Danh sách (${currentIndex}/${orderData.length})`,
      children: (
        <Card title="Danh sách đơn hàng" extra={<Button onClick={handleClearData} danger>Xóa dữ liệu</Button>}>
        <text className="info-text " style={{ color: "blue", fontWeight: "bold" }} >Tổng {Array.from(demTongHopMau(orderData, baseColors)).map(([color, count]) => `${count} ${color}`).join(', ')}</text>
          <List
            style={{ maxHeight: 400, overflowY: 'auto' }}
            dataSource={orderData}
            renderItem={(item: Order, index: number) => {
              let className = 'order-item';
              if (index < currentIndex) className += ' completed';
              if (index === currentIndex) className += ' current';
              return (
                <List.Item className={className}>
                  <List.Item.Meta
                    avatar={
                      <span className="status-icon">
                        {index < currentIndex ? '✓' : index === currentIndex ? '→' : '•'}
                      </span>
                    }
                    title={`${index + 1}. ${item.NGUOINHAN} - ${item.SDT} - ${item.MAUSAC}`}
                    description={item.DIACHI + ' ||| ' + item.GOC}
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      ),
    },
    {
      key: '2',
      label: 'Thêm dữ liệu',
      children: (
        <Card title="Dán dữ liệu JSON của bạn tại đây">
          <Space direction="vertical" style={{ width: '100%' }}>
            <TextArea
              rows={15}
              placeholder='[ { "GOC": "...", "MAUSAC": "...", ... } ]'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />
            <Button type="primary" onClick={()=>{handleSaveJson(jsonInput)}} block>
              Lưu và Bắt đầu
            </Button>
             <Button
              type="primary"
              onClick={handleUsingAI}
              block
              loading={isAiLoading}
              disabled={isAiLoading}
            >
              Dùng AI
            </Button>
          </Space>
        </Card>
      ),
    },
  ];

  return (
    //center page
    <div style={{ width: "auto", margin: "auto", marginTop: "20px" }}>
      <Card style={{ width: "500px" }}>

        <Card style={{}}>
          <Space direction="vertical">
            <Space.Compact style={{ width: "300px" }} direction="horizontal">
              <Input
                placeholder="Key"
                value={keyMessageInput}
                onChange={(e) => {
                  setKeyMessageInput(e.target.value);
                }} />
              <Button type="primary" onClick={handleSaveKey}>
                Submit
              </Button>
            </Space.Compact>
            <Space direction="horizontal">
            </Space>
          </Space>


        </Card>
        <Card style={{ marginTop: "20px" }}>
          {/* Tạo username input và password input and save */}
          <Space direction="vertical">
            <Space direction="horizontal">
              <Input
                placeholder="Tài khoản"
                value={accountPortal}
                onChange={(e) => {
                  setAccountPortal(e.target.value);
                }} />
              <Input.Password
                placeholder="Mật khẩu"
                value={passwordPortal}
                onChange={(e) => {
                  setPasswordPortal(e.target.value);
                }} />
              <Button onClick={() => handleSaveAccount(accountPortal, passwordPortal, buuCuc)}>Lưu Tài Khoản</Button>
            </Space>
            <Space>
              <Input
                placeholder="Bưu cục"
                style={{ color: "blue", fontWeight: "bold" }}
                value={buuCuc}
                onChange={(e) => {
                  setBuuCuc(e.target.value);
                }} />

            </Space>
          </Space>

        </Card>
        <Card style={{ marginTop: "20px" }}>
          <Tabs defaultActiveKey="1" items={items} />

        </Card>
      </Card>



    </div>


  );
}




