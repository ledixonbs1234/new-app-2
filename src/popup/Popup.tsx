

import { Button, Card, Input, List, message, Space, Tabs, TabsProps } from "antd";
import { useEffect, useState } from "react";
import './popup.css'
import { setOrders, clearOrders, Order, setCurrentIndex } from "./popup.slice";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import TextArea from "antd/es/input/TextArea";
import BatchAddTab from "./components/BatchAddTab";
import GoogleFormTab from "./components/GoogleFormTab";
import { Typography } from "antd"; // Thêm Typography nếu chưa có
const { Text } = Typography;
export default function Popup() {
  // Lấy dữ liệu từ Redux store
  // const { orderData, currentIndex } = useSelector((state: RootState) => state.popup);
  const dispatch = useDispatch();
  const [keyMessageInput, setKeyMessageInput] = useState<string>("");
  const [accountPortal, setAccountPortal] = useState<string>("");
  const [passwordPortal, setPasswordPortal] = useState<string>("");
  const [tokenPortal, setTokenPortal] = useState<string>("");
  const [buuCuc, setBuuCuc] = useState<string>("593200");
  const [jsonInput, setJsonInput] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [testAddress, setTestAddress] = useState<string>("");
  const [aiTestResult, setAiTestResult] = useState<string>("");
  const [isTestLoading, setIsTestLoading] = useState<boolean>(false);
  // Các màu gốc chúng ta cần tìm và đếm
  const baseColors: string[] = ["TRANG", "DO", "XANH"];
  useEffect(() => {
    console.log("Popup is running...");

    //get keymessage accountPortal and passwordPortal from storage
    chrome.storage.local.get(["keyMessage", "accountPortal", "passwordPortal", "token", "buuCuc"], (result) => {
      setKeyMessageInput(result.keyMessage);
      setAccountPortal(result.accountPortal);
      setPasswordPortal(result.passwordPortal);
      setTokenPortal(result.token || "");
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

 

  const handleOpenSidePanel = async () => {
    try {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL_INPAGE" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error injecting in-page side panel:", chrome.runtime.lastError.message);
          message.error("Không thể mở Side Panel trong trang: " + chrome.runtime.lastError.message);
          return;
        }
        if (response?.status === 'success') {
          message.success("Đã mở Side Panel (trong trang)");
        } else {
          message.error("Không thể mở Side Panel: " + (response?.message || 'unknown'));
        }
      });
    } catch (error) {
      console.error("Error opening side panel (in page):", error);
      message.error("Không thể mở Side Panel: " + (error as Error).message);
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
      chrome.runtime.sendMessage('dfd');
      const systemInstruction = `ta có file địa chỉ mẫu, dựa vào thông tin sau, chuyển sang json (chỉ trả về json) có tag sau (GOC,MAUSAC,NGUOINHAN,DIACHI,SDT,COD) .trong đó nội dung gốc ví dụ (1.6 nguyễn duy khuyến 350k 35n 2đỏ Nguyễn Duy Khuyến, đường số 6, ấp Phú Tân, xã Phú Bình, huyện Tân Phú, tỉnh Đồng Nai. Đt 0916302413), màu sắc ví dụ đỏ là DO ,trắng TRẮNG , xanh XANH, 1 đỏ 1 xanh DOXANH , 2đỏ DODO 2 xanh XANHXANH, tên người nhận theo mẫu sau 14.1 do nguyễn 570k 45n 2trắng hoặc 14.2 uyên trần 538k 45n trang 40n) , số điện thoại, và địa chỉ (trong địa chỉ có  tự chỉnh lại cho đúng nếu sai ví dụ xa thong nhat huyen bu dang binh phuoc thành xã thống nhất huyện bù đăng tỉnh bình phước ),số tiền cod ( 510k là 510000, 538k là 538000)
    sai phần người nhận rồi, ý tôi muốn là 20a1 ót duong van 320k 35n 2đỏ 0918820593
313, Ấp Phú lợi, xã Bình phú, TP Bến Tre, Bến Tre thì người nhận là 20a1 ót duong van 320k 35n 2đỏ , hay 32a4 phương dinh 450k 2 xanh 40n đt  0333395115 đc 96 thánh  tâm, du sinh ,p5. Đà lạt thì NGUOINHAN là 32a4 phương dinh 450k 2 xanh 40n

[19/06/2025 11:55:52] Bích Ngọc: 14.1 do nguyễn 570k 45n 2trắng 0916333309 Đ/C 3/161 ấp ngãi lợi b,xã lợi bình nhơn,TP Tân An,Long An
[19/06/2025 15:41:40] Kim Vân: 14.2 uyên trần 538k 45n trang 40n xanh  địa chỉ số nhà 052 tổ dân phố 13 phường Tân Giang thành phố cao bằng tỉnh cao bằng 0904611961
[19/06/2025 16:25:53] Kim Vân: 26a3 trần thanh trúc 350k 35n 2đỏ Địa chỉ: 107 Thủ Khoa Huân, phường 1, Thành phố Tân An, Long An (0983288725)
[20/06/2025 07:49:49] Nguyễn Diệu: 32a4 phương dinh 450k 2 xanh 40n đt  0333395115 đc 96 thánh  tâm, du sinh ,p5. Đà lạt
[21/06/2025 08:46:10] Bích Ngọc: 20a1 ót duong van 320k 35n 2đỏ 0918820593
313, Ấp Phú lợi, xã Bình phú, TP Bến Tre, Bến Tre
và đây là kết quả của tôi
[
    {
        "GOC": "14.1 do nguyễn 570k 45n 2trắng 0916333309 Đ/C 3/161 ấp ngãi lợi b,xã lợi bình nhơn,TP Tân An,Long An",
        "MAUSAC": "TRANGTRANG",
        "NGUOINHAN": "14.1 do nguyễn 570k 45n 2trắng",
        "DIACHI": "3/161 Ấp Ngãi Lợi B, Xã Lợi Bình Nhơn, Thành phố Tân An, Tỉnh Long An",
        "SDT": "0916333309",
        "COD": 570000
    },
    {
        "GOC": "14.2 uyên trần 538k 45n trang 40n xanh  địa chỉ số nhà 052 tổ dân phố 13 phường Tân Giang thành phố cao bằng tỉnh cao bằng 0904611961",
        "MAUSAC": "TRANGXANH",
        "NGUOINHAN": "14.2 uyên trần 538k 45n trang 40n xanh",
        "DIACHI": "Số nhà 052, Tổ dân phố 13, Phường Tân Giang, Thành phố Cao Bằng, Tỉnh Cao Bằng",
        "SDT": "0904611961",
        "COD": 538000
    },
    {
        "GOC": "26a3 trần thanh trúc 350k 35n 2đỏ Địa chỉ: 107 Thủ Khoa Huân, phường 1, Thành phố Tân An, Long An (0983288725)",
        "MAUSAC": "DODO",
        "NGUOINHAN": "26a3 trần thanh trúc 350k 35n 2đỏ",
        "DIACHI": "107 Thủ Khoa Huân, Phường 1, Thành phố Tân An, Tỉnh Long An",
        "SDT": "0983288725",
        "COD": 350000
    },
    {
        "GOC": "32a4 phương dinh 450k 2 xanh 40n đt  0333395115 đc 96 thánh  tâm, du sinh ,p5. Đà lạt",
        "MAUSAC": "XANHXANH",
        "NGUOINHAN": "32a4 phương dinh 450k 2 xanh 40n",
        "DIACHI": "96 Thánh Tâm, Du Sinh, Phường 5, Thành phố Đà Lạt, Tỉnh Lâm Đồng",
        "SDT": "0333395115",
        "COD": 450000
    },
    {
        "GOC": "20a1 ót duong van 320k 35n 2đỏ 0918820593\n313, Ấp Phú lợi, xã Bình phú, TP Bến Tre, Bến Tre",
        "MAUSAC": "DODO",
        "NGUOINHAN": "20a1 ót duong van 320k 35n 2đỏ",
        "DIACHI": "313, Ấp Phú Lợi, Xã Bình Phú, Thành phố Bến Tre, Tỉnh Bến Tre",
        "SDT": "0918820593",
        "COD": 320000
    }
]
    \n `;

      chrome.runtime.sendMessage({ type: "SEND_AI_DATA", payload: jsonInput, systemInstructionText: systemInstruction }, (response) => {
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
          console.log("Dữ liệu nhận từ AI:", response.result);
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
  // === HÀM XỬ LÝ TEST AI ===
  const handleTestAIAddress = () => {
    if (!testAddress.trim()) {
      message.error("Vui lòng nhập địa chỉ cần test.");
      return;
    }

    setIsTestLoading(true);
    setAiTestResult(""); // Xóa kết quả cũ
    message.loading({ content: "AI đang phân tích...", key: 'ai_test', duration: 0 });

    chrome.runtime.sendMessage({
      type: "CORRECT_ADDRESS",
      payload: { address: testAddress }
    }, (response) => {
      setIsTestLoading(false);

      if (chrome.runtime.lastError) {
        message.error({ content: "Lỗi kết nối: " + chrome.runtime.lastError.message, key: 'ai_test' });
        return;
      }

      if (response && response.status === "success") {
        setAiTestResult(response.result);
        message.success({ content: "Đã xử lý xong!", key: 'ai_test', duration: 2 });
      } else {
        message.error({ content: "Lỗi AI: " + (response?.error || "Không xác định"), key: 'ai_test' });
      }
    });
  };

  function handleSaveAccount(accountPortal: string, passwordPortal: string, tokenPortal: string, buuCuc: string): void {
    if (!accountPortal || !passwordPortal || !buuCuc) {
      alert("Tài khoản, mật khẩu và bưu cục không được để trống");
      return;
    }
    chrome.storage.local.set({
      accountPortal: accountPortal,
      passwordPortal: passwordPortal,
      token: tokenPortal,
      buuCuc: buuCuc
    }, () => {
      console.log("Saved account, password, token and buuCuc");
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
      label: 'Google Form',
      children: <GoogleFormTab />,
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
    {
      key: '3',
      label: 'Thêm danh sách',
      children: <BatchAddTab />,
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
              <Button type="default" onClick={handleOpenSidePanel}>
                📦 Mở Panel Hình Ảnh
              </Button>
            </Space>
          </Space>


        </Card>
        <Card style={{ marginTop: "20px" }}>
          {/* Tạo username input và password input and save */}
          <Space direction="vertical" style={{ width: '100%' }}>
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
            </Space>
            <Space direction="horizontal" style={{ width: '100%' }}>
              <Input
                placeholder="Token (tùy chọn)"
                value={tokenPortal}
                style={{ flex: 1 }}
                onChange={(e) => {
                  setTokenPortal(e.target.value);
                }} />
            </Space>
            <Space direction="horizontal">
              <Input
                placeholder="Bưu cục"
                style={{ color: "blue", fontWeight: "bold" }}
                value={buuCuc}
                onChange={(e) => {
                  setBuuCuc(e.target.value);
                }} />
              <Button type="primary" onClick={() => handleSaveAccount(accountPortal, passwordPortal, tokenPortal, buuCuc)}>
                Lưu Tài Khoản
              </Button>
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




