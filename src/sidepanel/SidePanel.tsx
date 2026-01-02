import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Spin, Alert, Button, Space, Tooltip, message, Switch, Modal, Tabs, Table, Tag } from "antd";
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, UndoOutlined, LeftOutlined, RightOutlined, ClearOutlined, DeleteOutlined, DollarOutlined, PhoneOutlined, EnvironmentOutlined, RobotOutlined } from "@ant-design/icons";
import { Order, StoredImage } from "../types/vnpost";
import { syncAllImages, SyncProgress, listenToFirebaseImages } from "./utils/firebaseSync";
import { getAllImages, initDB } from "./utils/imageDB";
import ImageViewer from "./components/ImageViewer";
import ThumbnailGallery from "./components/ThumbnailGallery";

type FieldGroup = "TT_NUMBER" | "RECEIVER_INFO" | "WEIGHT" | "MONEY" | "NONE";

interface ZoomPreset {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
}

const SidePanel: React.FC = () => {
  // State
  const [images, setImages] = useState<StoredImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    const saved = localStorage.getItem("sidepanel_selected_index");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    total: 0, downloaded: 0, failed: 0, status: "idle",
  });
  const [autoZoomEnabled, setAutoZoomEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidepanel_auto_zoom_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [shouldScrollToSelected, setShouldScrollToSelected] = useState<boolean>(false);

  // State cho Portal Tab
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("sidepanel_active_tab") || "images";
  });
  const [portalList, setPortalList] = useState<any[]>([]);
  const [portalLoading, setPortalLoading] = useState<boolean>(false);
  const [aiOrders, setAiOrders] = useState<Order[]>([]);
  const [aiSelectedIndex, setAiSelectedIndex] = useState<number>(0);
  // Hàm xử lý lưu vị trí scroll (có debounce để tránh ghi storage quá nhiều)
  const saveScrollPosition = useCallback(debounceLocal((key: string, value: number) => {
    localStorage.setItem(`sidepanel_scroll_${key}`, value.toString());
  }, 300), []);
  // Refs
  const imageViewerRef = useRef<{
    applyZoomPreset: (preset: ZoomPreset) => void;
    getCurrentZoom: () => ZoomPreset;
    resetToDefault: () => void;
  }>(null);

  const focusRequestIdRef = useRef(0);

  // Ref quan trọng để theo dõi Field nào đang được Active
  const currentFocusedFieldRef = useRef<FieldGroup>("NONE");

  // Ref cho Timer Debounce (chờ user dừng thao tác mới lưu)
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State Presets
  const [savedPresets, setSavedPresets] = useState<Record<FieldGroup, ZoomPreset>>(() => {
    const saved = localStorage.getItem("sidepanel_zoom_presets");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return {
      TT_NUMBER: { zoom: 2, pan: { x: -100, y: -150 }, rotation: 0 },
      RECEIVER_INFO: { zoom: 2.5, pan: { x: 0, y: 0 }, rotation: 0 },
      WEIGHT: { zoom: 2, pan: { x: 100, y: 100 }, rotation: 0 },
      MONEY: { zoom: 2, pan: { x: -100, y: 150 }, rotation: 0 },
      NONE: { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 },
    };
  });

  // =================================================================
  // LOGIC LƯU PRESET MỚI (CHỦ ĐỘNG + DEBOUNCE)
  // =================================================================

  const handleTransformChange = useCallback((newTransform: ZoomPreset) => {
    // 1. Nếu tắt AutoZoom thì không lưu đè
    // 2. Nếu chưa focus vào field nào (đang ở NONE) thì không lưu
    if (!autoZoomEnabled || currentFocusedFieldRef.current === "NONE") return;

    // Clear timer cũ
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }

    // Set timer mới: chờ 1000ms
    saveDebounceTimerRef.current = setTimeout(() => {
      const fieldToSave = currentFocusedFieldRef.current;

      // Kiểm tra lại lần nữa trong timeout
      if (fieldToSave === "NONE") return;

      console.log(`[SidePanel] 💾 Auto-saving preset for ${fieldToSave}:`, newTransform);

      setSavedPresets(prev => {
        const currentPreset = prev[fieldToSave];

        // So sánh để tránh update state nếu không đổi (tránh render lại không cần thiết)
        if (
          Math.abs(currentPreset.zoom - newTransform.zoom) < 0.001 &&
          Math.abs(currentPreset.pan.x - newTransform.pan.x) < 1 &&
          Math.abs(currentPreset.pan.y - newTransform.pan.y) < 1 &&
          currentPreset.rotation === newTransform.rotation
        ) {
          return prev;
        }

        const newPresets = { ...prev, [fieldToSave]: newTransform };
        localStorage.setItem("sidepanel_zoom_presets", JSON.stringify(newPresets));
        return newPresets;
      });

    }, 1000);
  }, [autoZoomEnabled]);

  function debounceLocal(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function (...args: any[]) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
  const lastAutoNextTimeRef = useRef<number>(0);
  // =================================================================
  // INIT & LOAD DATA
  // =================================================================
  useEffect(() => {
    // 1. Load data từ IDB ngay lập tức (hiển thị cái đang có)
    loadImages();

    // 2. Lắng nghe tín hiệu từ Background
    // Khi Background báo "IMAGES_UPDATED", ta chỉ cần load lại từ IDB
    const stopListening = listenToFirebaseImages(async () => {
      // Data đã nằm trong IDB rồi, chỉ cần query ra
      const updated = await getAllImages();
      setImages(updated);
      setLoading(false);
    });

    // 3. Trigger một lần sync thủ công khi mở panel để đảm bảo data mới nhất
    syncAllImages();

    return () => {
      stopListening();
    };
  }, []);
  // =================================================================
  // LISTEN MESSAGES (LOGIC AUTO NEXT ĐƯỢC SỬA ĐỔI)
  // =================================================================
  useEffect(() => {
    const handleRuntimeMessage = (msg: any, _sender: any, sendResponse: any) => {
      if (msg.type === "SIDEPANEL_PING") { sendResponse({ status: "alive" }); return false; }

      // --- LOGIC TỰ ĐỘNG CHUYỂN DỰA TRÊN TAB ĐANG FOCUS ---
      if (msg.type === "SIDEPANEL_NEXT_IMAGE") {

        console.log("[SidePanel] Received NEXT signal. Active Tab:", activeTab);
        // --- CƠ CHẾ CHẶN SPAM (THROTTLE) ---
        const now = Date.now();
        // Nếu lệnh trước đó cách đây dưới 1 giây, bỏ qua lệnh này
        if (now - lastAutoNextTimeRef.current < 1000) {
          console.warn("[SidePanel] Ignored rapid Auto Next request.");
          sendResponse({ status: "ignored_too_fast" });
          return false;
        }
        lastAutoNextTimeRef.current = now; // Cập nhật thời gian
        // ------------------------------------
        if (activeTab === "images") {
          // Logic cũ cho tab Hình ảnh
          if (selectedIndex < images.length - 1) {
            handleSelectImage(selectedIndex + 1);
            sendResponse({ status: "success", type: "image" });
          } else {
            sendResponse({ status: "end" });
          }
        }
        else if (activeTab === "ai_orders") {
          // Logic mới cho tab AI Orders
          if (aiSelectedIndex < aiOrders.length - 1) {
            const nextIndex = aiSelectedIndex + 1;
            handleSelectAIOrder(nextIndex);
            // Cuộn đến item đó trong danh sách (nếu cần)
            const el = document.getElementById(`ai-order-${nextIndex}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

            sendResponse({ status: "success", type: "ai_order" });
          } else {
            message.success("Đã hoàn thành danh sách đơn AI!");
            sendResponse({ status: "end" });
          }
        }

        return false;
      }
      return false;
    };

    // ... (window message listener giữ nguyên)

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    // ...
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      // ...
    };
  }, [
    activeTab, // Quan trọng: Re-bind khi đổi tab
    images, selectedIndex,
    aiOrders, aiSelectedIndex,
    // ... dependencies khác
  ]);

// =================================================================
  // SINGLE MESSAGE LISTENER (GỘP TẤT CẢ VÀO ĐÂY ĐỂ TRÁNH XUNG ĐỘT)
  // =================================================================
  useEffect(() => {
    // 1. Handler cho Runtime Message (Background/Content Script -> SidePanel)
    const handleRuntimeMessage = (msg: any, _sender: any, sendResponse: any) => {
      // --- PING ---
      if (msg.type === "SIDEPANEL_PING") {
        sendResponse({ status: "alive" });
        return false;
      }

      // --- NEXT ITEM (XỬ LÝ DỰA TRÊN TAB ĐANG MỞ) ---
      if (msg.type === "SIDEPANEL_NEXT_IMAGE") {
        
        // Cơ chế chặn spam (Throttle) - 1 giây
        const now = Date.now();
        if (now - lastAutoNextTimeRef.current < 1000) {
            console.warn("[SidePanel] ⚠️ Ignored rapid request (Throttle).");
            sendResponse({ status: "ignored_too_fast" });
            return false;
        }
        lastAutoNextTimeRef.current = now;

        console.log(`[SidePanel] ⏭️ NEXT Signal. Current Tab: ${activeTab}`);

        if (activeTab === "images") {
          // CHỈ chuyển ảnh nếu đang ở tab Images
          if (selectedIndex < images.length - 1) {
            handleSelectImage(selectedIndex + 1);
            sendResponse({ status: "success", type: "image" });
          } else {
            sendResponse({ status: "end" });
          }
        } 
        else if (activeTab === "ai_orders") {
          // CHỈ chuyển đơn AI nếu đang ở tab AI Orders
          if (aiSelectedIndex < aiOrders.length - 1) {
            const nextIndex = aiSelectedIndex + 1;
            handleSelectAIOrder(nextIndex);
            
            // Cuộn tới item
            setTimeout(() => {
                const el = document.getElementById(`ai-order-${nextIndex}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);

            sendResponse({ status: "success", type: "ai_order" });
          } else {
            message.success("Đã hoàn thành danh sách đơn AI!");
            sendResponse({ status: "end" });
          }
        } else {
            console.log("[SidePanel] Ignored NEXT signal (Tab not supported).");
        }

        return false; // Sync response
      }
      
      // --- CÁC MESSAGE KHÁC ---
      if (msg.type === "PORTAL_LIST_UPDATED") {
        setPortalList(msg.data || []);
      }
      
      if (msg.type === "IMAGES_UPDATED") {
         loadImages(); // Gọi hàm load lại ảnh
      }

      return false;
    };

    // 2. Handler cho Window Message (PostMessage từ iframe/web) - Xử lý Zoom
    const handleWindowMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === "APPLY_SMART_ZOOM") {
        if (msg.payload?.fieldGroup && autoZoomEnabled) {
          const fieldGroup: FieldGroup = msg.payload.fieldGroup;
          // Chỉ apply zoom nếu đang ở tab images
          if (activeTab === "images") {
             console.log(`[SidePanel] 🔍 Smart Zoom: ${fieldGroup}`);
             applySmartZoom(fieldGroup);
          }
        }
      }
    };

    // Đăng ký Listener
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener("message", handleWindowMessage);

    // Cleanup (Quan trọng: Xóa listener cũ khi dependencies thay đổi)
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      window.removeEventListener("message", handleWindowMessage);
    };

  }, [
    activeTab,          // QUAN TRỌNG: Re-bind khi đổi tab để logic if(activeTab) đúng
    images, selectedIndex, 
    aiOrders, aiSelectedIndex,
    autoZoomEnabled, savedPresets
  ]);
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    localStorage.setItem("sidepanel_active_tab", key);
  };

  // Effect riêng cho Portal List Sync
  useEffect(() => {
    chrome.storage.session.get(["orders", "currentIndex"], (result) => {
      if (result.orders) {
        setAiOrders(result.orders);
      }
      if (result.currentIndex !== undefined) {
        setAiSelectedIndex(result.currentIndex);
      }
    });
    const handleStorageUpdate = (msg: any) => {
      if (msg.type === "STORAGE_UPDATED") {
        if (msg.payload.orders) setAiOrders(msg.payload.orders);
        if (msg.payload.currentIndex !== undefined) setAiSelectedIndex(msg.payload.currentIndex);
      }
    };
    chrome.runtime.onMessage.addListener(handleStorageUpdate);
    // 1. Lấy dữ liệu ban đầu
    chrome.runtime.sendMessage({ type: "GET_PORTAL_LIST" }, (res) => {
      if (res && res.status === 'success') {
        setPortalList(res.data);
      }
    });

    // 2. Lắng nghe cập nhật realtime
    const handlePortalUpdate = (msg: any) => {
      if (msg.type === "PORTAL_LIST_UPDATED") {
        console.log("[SidePanel] Portal list updated:", msg.data?.length);
        setPortalList(msg.data || []);
      }
    };
    chrome.runtime.onMessage.addListener(handlePortalUpdate);
    return () => chrome.runtime.onMessage.removeListener(handlePortalUpdate);
  }, []);

  // =================================================================
  // RENDER AI TAB CONTENT (Cập nhật hàm này)
  // =================================================================
  const renderAIOrdersTab = () => {
    if (aiOrders.length === 0) {
      return <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Chưa có dữ liệu. Hãy dùng "Dùng AI" ở Popup.</div>;
    }

    return (
      <div
        id="ai-orders-list"
        style={{
          height: 'calc(100vh - 110px)',
          overflowY: 'auto',
          padding: '8px',
          background: '#f0f2f5',
          paddingBottom: '20px'
        }}
      >
        {/* --- PHẦN THỐNG KÊ TỔNG HỢP --- */}
        <div style={{
          background: '#fff',
          padding: '8px 12px',
          borderRadius: '8px',
          marginBottom: '10px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', fontWeight: 600 }}>
            TỔNG HỢP ({aiOrders.length} Đơn):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(colorSummary).map(([key, data]) => {
              if (data.count === 0) return null; // Chỉ hiện màu có số lượng > 0
              return (
                <Tag
                  key={key}
                  color={data.color}
                  style={{
                    margin: 0,
                    fontWeight: 'bold',
                    color: key === 'TRANG' ? '#333' : '#fff', // Màu trắng thì chữ đen cho dễ nhìn
                    border: key === 'TRANG' ? '1px solid #d9d9d9' : 'none'
                  }}
                >
                  {data.count} {data.label}
                </Tag>
              );
            })}
            {/* Nếu không có màu nào được tìm thấy */}
            {Object.values(colorSummary).every(x => x.count === 0) && (
              <span style={{ fontSize: '12px', color: '#ccc', fontStyle: 'italic' }}>Chưa xác định màu</span>
            )}
          </div>
        </div>

        {/* --- DANH SÁCH ĐƠN HÀNG (GIỮ NGUYÊN) --- */}
        <div style={{ marginBottom: 8, padding: '0 8px', display: 'flex', justifyContent: 'space-between', color: '#666' }}>
          <span>Danh sách chi tiết:</span>
          <span>Đang chọn: <b>{aiSelectedIndex + 1}</b></span>
        </div>

        {aiOrders.map((order, idx) => {
          const isSelected = idx === aiSelectedIndex;

          // Logic màu sắc từng item (giữ nguyên code cũ của bạn)
          const ms = order.MAUSAC ? order.MAUSAC.toUpperCase() : "";
          const detectedColors: string[] = [];
          if (ms.includes("DO")) detectedColors.push("#ff4d4f");
          if (ms.includes("XANH")) detectedColors.push("#1890ff");
          if (ms.includes("VANG")) detectedColors.push("#faad14");
          if (ms.includes("TIM")) detectedColors.push("#722ed1");
          if (ms.includes("DEN")) detectedColors.push("#333333");
          if (ms.includes("HONG")) detectedColors.push("#eb2f96");
          if (ms.includes("TRANG")) detectedColors.push("#bfbfbf");

          let tagStyle: React.CSSProperties = { margin: 0, fontSize: '11px', fontWeight: 700, border: 'none' };
          if (detectedColors.length > 1) {
            tagStyle.background = `linear-gradient(135deg, ${detectedColors.join(', ')})`;
            tagStyle.color = 'white';
            tagStyle.textShadow = '0 1px 1px rgba(0,0,0,0.5)';
          } else if (detectedColors.length === 1) {
            tagStyle.backgroundColor = detectedColors[0];
            tagStyle.color = (detectedColors[0] === "#bfbfbf") ? '#333' : 'white';
          } else {
            tagStyle.backgroundColor = '#f0f0f0';
            tagStyle.color = '#595959';
            tagStyle.border = '1px solid #d9d9d9';
          }

          return (
            <div
              key={idx}
              id={`ai-order-${idx}`}
              onClick={() => handleSelectAIOrder(idx)}
              style={{
                background: isSelected ? '#e6f7ff' : '#fff',
                border: isSelected ? '1px solid #1890ff' : '1px solid #d9d9d9',
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '8px',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 2px 8px rgba(24, 144, 255, 0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s',
                scrollMarginTop: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <strong style={{ color: isSelected ? '#1890ff' : '#333', fontSize: '13px', marginRight: '8px', wordBreak: 'break-word' }}>
                  #{idx + 1} {order.NGUOINHAN}
                </strong>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                  {order.MAUSAC && (
                    <Tag style={tagStyle}>
                      {order.MAUSAC}
                    </Tag>
                  )}
                  {order.COD > 0 && (
                    <Tag color="green" style={{ margin: 0, fontSize: '11px' }}>
                      <DollarOutlined /> {order.COD.toLocaleString()}
                    </Tag>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#666', display: 'flex', gap: 6, alignItems: 'center' }}>
                <PhoneOutlined /> {order.SDT}
              </div>

              <div style={{ fontSize: '12px', color: '#666', marginTop: 4, display: 'flex', gap: 6 }}>
                <EnvironmentOutlined style={{ marginTop: 3, flexShrink: 0 }} />
                <span style={{ lineHeight: '1.4' }}>{order.DIACHI}</span>
              </div>

              <div style={{
                marginTop: 6,
                padding: 6,
                background: '#fafafa',
                borderRadius: 4,
                fontSize: '11px',
                color: '#999',
                fontStyle: 'italic',
                borderLeft: '2px solid #ddd'
              }}>
                "{order.GOC}"
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  // =================================================================
  // LOGIC TÍNH TỔNG MÀU SẮC (Thêm đoạn này vào trong component SidePanel)
  // =================================================================
  const colorSummary = useMemo(() => {
    // Định nghĩa bảng màu và biến đếm
    const stats: Record<string, { count: number; color: string; label: string }> = {
      DO: { count: 0, color: "#ff4d4f", label: "Đỏ" },
      XANH: { count: 0, color: "#1890ff", label: "Xanh" },
      TRANG: { count: 0, color: "#bfbfbf", label: "Trắng" },
      VANG: { count: 0, color: "#faad14", label: "Vàng" },
      TIM: { count: 0, color: "#722ed1", label: "Tím" },
      DEN: { count: 0, color: "#333333", label: "Đen" },
      HONG: { count: 0, color: "#eb2f96", label: "Hồng" },
    };

    aiOrders.forEach(order => {
      if (!order.MAUSAC) return;
      const ms = order.MAUSAC.toUpperCase();

      // Quét từng key màu để đếm số lần xuất hiện
      // Ví dụ: "DODO" sẽ khớp regex /DO/g 2 lần -> cộng 2
      Object.keys(stats).forEach(key => {
        const regex = new RegExp(key, "g");
        const matches = ms.match(regex);
        if (matches) {
          stats[key].count += matches.length;
        }
      });
    });

    return stats;
  }, [aiOrders]); // Chỉ tính lại khi danh sách đơn thay đổi
  ;
  const loadImages = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Khởi tạo DB
      await initDB();

      // 2. Lấy dữ liệu ĐANG CÓ trong cache (IndexedDB) hiển thị ngay lập tức
      // Điều này giúp UI hiện lên ngay, không cần chờ mạng
      const local = await getAllImages();

      if (local.length > 0) {
        setImages(local);
        // Logic khôi phục vị trí đã chọn
        const savedIndex = localStorage.getItem("sidepanel_selected_index");
        if (savedIndex !== null) {
          const index = parseInt(savedIndex, 10);
          if (index >= 0 && index < local.length) setSelectedIndex(index);
        }
        setLoading(false); // Có dữ liệu cũ thì tắt loading luôn cho mượt
      }

      // 3. Gửi tín hiệu cho Background bắt đầu đồng bộ ảnh MỚI
      // Lưu ý: Hàm này giờ chỉ gửi tin nhắn rồi return ngay, KHÔNG chờ tải xong
      await syncAllImages();

      // Nếu chưa có ảnh nào (lần đầu cài), ta vẫn để loading quay
      // Việc cập nhật ảnh mới sẽ do useEffect (listener) đảm nhận khi Background báo về
      if (local.length === 0) {
        // Có thể set timeout để tắt loading nếu không có ảnh nào trả về sau 5s
        setTimeout(() => setLoading(false), 5000);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Lỗi tải ảnh");
      setLoading(false);
    }
  };

  const handleRefresh = () => loadImages();

  const handleSelectImage = (index: number) => {
    setSelectedIndex(index);
    setShouldScrollToSelected(true);
    setTimeout(() => setShouldScrollToSelected(false), 500);
    localStorage.setItem("sidepanel_selected_index", index.toString());

    // Reset context
    currentFocusedFieldRef.current = "NONE";
    if (saveDebounceTimerRef.current) clearTimeout(saveDebounceTimerRef.current);

    if (autoZoomEnabled && imageViewerRef.current) {
      imageViewerRef.current.resetToDefault();
    }

    const selectedImg = images[index];
    if (selectedImg?.maHieu) {
      sendMaHieuToPortal(selectedImg.maHieu);
    } else {
      focusRequestIdRef.current += 1;
      focusTtNumberInPortal(focusRequestIdRef.current);
    }
  };

  const focusTtNumberInPortal = (requestId: number, attempt: number = 1) => {
    setTimeout(async () => {
      if (focusRequestIdRef.current !== requestId) return;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url?.includes("portalkhl.vnpost.vn")) return;

        chrome.tabs.sendMessage(tab.id, { type: "QUERY_FOCUSED_ELEMENT" }, (res) => {
          if (chrome.runtime.lastError) { attemptSendFocus(); return; }
          const activeId = res?.activeElementId;
          // Nếu đang nhập liệu thông tin người nhận thì không giật focus
          if (activeId === "receiverName" || activeId === "receiverAddress" || activeId === "receiverPhone") return;
          attemptSendFocus();
        });

        function attemptSendFocus() {
          chrome.tabs.sendMessage(tab.id!, { type: "FOCUS_TT_NUMBER" }, () => {
            if (chrome.runtime.lastError && attempt < 3) {
              focusTtNumberInPortal(requestId, attempt + 1);
            }
          });
        }
      } catch (e) { console.error(e); }
    }, 500);
  };

  const sendMaHieuToPortal = async (maHieu: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.includes("portalkhl.vnpost.vn")) {
      chrome.tabs.sendMessage(tab.id, { type: "FILL_TT_NUMBER", payload: { maHieu } });
    }
  };

  const handleSelectAIOrder = async (index: number) => {
    if (index < 0 || index >= aiOrders.length) return;

    setAiSelectedIndex(index);
    // Lưu lại index vào session để đồng bộ popup (nếu cần)
    chrome.storage.session.set({ currentIndex: index });

    const order = aiOrders[index];

    // Gửi lệnh điền form xuống Content Script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "FILL_FORM_DATA_AI",
        payload: order
      });

      // Focus vào tab để user có thể nhập tiếp hoặc lưu
      chrome.tabs.update(tab.id, { active: true });
    }
  };


  const handleClearAllImages = () => {
    Modal.confirm({
      title: "Xác nhận xóa",
      content: "Xóa toàn bộ hình ảnh?",
      onOk: () => {
        chrome.runtime.sendMessage({ event: "CONTENTMY", type: "CLEAR_ALL_IMAGES" }, (res) => {
          if (res?.status === "success") {
            setImages([]);
            setSelectedIndex(0);
            message.success("Đã xóa thành công");
          }
        });
      }
    });
  };

  const handlePreviousImage = () => { if (selectedIndex > 0) handleSelectImage(selectedIndex - 1); };
  const handleNextImage = () => { if (selectedIndex < images.length - 1) handleSelectImage(selectedIndex + 1); };

  const handleResetPresets = () => {
    const defaultPresets: Record<FieldGroup, ZoomPreset> = {
      TT_NUMBER: { zoom: 2, pan: { x: -100, y: -150 }, rotation: 0 },
      RECEIVER_INFO: { zoom: 2.5, pan: { x: 0, y: 0 }, rotation: 0 },
      WEIGHT: { zoom: 2, pan: { x: 100, y: 100 }, rotation: 0 },
      MONEY: { zoom: 2, pan: { x: -100, y: 150 }, rotation: 0 },
      NONE: { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 },
    };
    setSavedPresets(defaultPresets);
    localStorage.setItem("sidepanel_zoom_presets", JSON.stringify(defaultPresets));
    message.success("Đã đặt lại vị trí mặc định");
  };

  const handleToggleAutoZoom = (checked: boolean) => {
    setAutoZoomEnabled(checked);
    localStorage.setItem("sidepanel_auto_zoom_enabled", JSON.stringify(checked));
    if (!checked) currentFocusedFieldRef.current = "NONE";
  };

  // --- HANDLERS FOR PORTAL TAB ---
  const handleExecuteItem = (maBuuGui: string) => {
    message.loading({ content: `Đang gửi lệnh chạy ${maBuuGui}...`, key: 'exec_item' });
    chrome.runtime.sendMessage({ type: "EXECUTE_PORTAL_ITEM", payload: { maBuuGui } }, (res) => {
      if (res?.status === 'processing') {
        message.success({ content: 'Đã gửi lệnh', key: 'exec_item', duration: 2 });
      }
    });
  };

  const handlePrintPortalList = () => {
    chrome.runtime.sendMessage({ type: "PRINT_PORTAL_LIST" }, (res) => {
      if (res?.status === 'success') {
        message.success("Đang mở in...");
      } else {
        message.error(res?.message || "Lỗi khi in");
      }
    });
  };

  const handleDeleteItem = (maBuuGui: string) => {
    chrome.runtime.sendMessage({ type: "DELETE_PORTAL_ITEM", payload: { maBuuGui } });
  };

  const portalColumns: ColumnsType<any> = [
    {
      title: '#',
      dataIndex: 'Index',
      key: 'Index',
      width: 40,
      render: (text: number) => text + 1,
    },
    {
      title: 'Mã Bưu Gửi',
      dataIndex: 'MaBuuGui',
      key: 'MaBuuGui',
      width: 130,
      render: (text: string) => <b style={{ cursor: 'pointer' }} onClick={() => sendMaHieuToPortal(text)}>{text}</b>
    },
    {
      title: 'Tiền',
      dataIndex: 'Money',
      key: 'Money',
      width: 80,
      render: (money: string) => money ? <span style={{ color: 'green' }}>{money}</span> : '-'
    },
    {
      title: 'TT',
      dataIndex: 'Status',
      key: 'Status',
      width: 80,
      render: (status: string, record: any) => {
        let color = 'default';
        let label = 'Chờ';
        if (status === 'processing') { color = 'processing'; label = 'Chạy'; }
        if (status === 'success') { color = 'success'; label = 'OK'; }
        if (status === 'error') { color = 'error'; label = 'Lỗi'; }

        const tag = <Tag color={color} style={{ marginRight: 0 }}>{label}</Tag>;
        if (status === 'error' && record.Message) {
          return <Tooltip title={record.Message}>{tag}</Tooltip>
        }
        return tag;
      }
    },
    {
      title: 'Act',
      key: 'action',
      width: 70,
      render: (_, record) => (
        <Space size={2}>
          <Button size="small" type="text" onClick={() => handleExecuteItem(record.MaBuuGui)} icon={<RightOutlined />} title="Run" />
          <Button size="small" type="text" danger onClick={() => handleDeleteItem(record.MaBuuGui)} icon={<DeleteOutlined />} title="Delete" />
        </Space>
      ),
    },
  ];

  // =================================================================
  // LISTEN MESSAGES (APPLY ZOOM)
  // =================================================================

  const applySmartZoom = (fieldGroup: FieldGroup) => {
    // 1. Cập nhật field hiện tại
    currentFocusedFieldRef.current = fieldGroup;

    // 2. Clear timer debounce cũ (nếu có)
    if (saveDebounceTimerRef.current) clearTimeout(saveDebounceTimerRef.current);

    const preset = savedPresets[fieldGroup];
    if (preset && imageViewerRef.current) {
      console.log(`[SidePanel] Applying preset for ${fieldGroup}:`, preset);
      imageViewerRef.current.applyZoomPreset(preset);
    }
  };

  // =================================================================
  // RENDER
  // =================================================================

  if (loading && images.length === 0) return <div style={{ padding: 20, textAlign: 'center' }}><Spin size="large" /><div>Đang tải...</div></div>;
  if (images.length === 0) return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <h3>Chưa có hình ảnh</h3>
      <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Làm mới</Button>
    </div>
  );

  const selectedImage = images[selectedIndex];

  return (
    <div className="sidepanel-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div className="sidepanel-header" style={{ padding: '12px', borderBottom: '1px solid #ddd', background: '#fff' }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Hình Ảnh ({images.length})</h3>
          <Space>
            <Tooltip title="Xóa tất cả"><Button danger type="text" icon={<ClearOutlined />} onClick={handleClearAllImages} /></Tooltip>
            <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} loading={syncProgress.status === "syncing"} />
          </Space>
        </div>

        {/* Navigation & Tools */}
        <div style={{ marginTop: 8, padding: 8, background: "#f5f5f5", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Space>
            <Button size="small" icon={<LeftOutlined />} onClick={handlePreviousImage} disabled={selectedIndex === 0} />
            <span style={{ fontSize: 12 }}>{selectedIndex + 1}/{images.length}</span>
            <Button size="small" icon={<RightOutlined />} onClick={handleNextImage} disabled={selectedIndex === images.length - 1} />
          </Space>
          <Space>
            <span style={{ fontSize: 12 }}>Auto Zoom:</span>
            <Switch size="small" checked={autoZoomEnabled} onChange={handleToggleAutoZoom} />
            <Tooltip title="Reset Zoom"><Button size="small" icon={<UndoOutlined />} onClick={handleResetPresets} /></Tooltip>
          </Space>
        </div>
      </div>

      {/* TABS CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          type="card"
          size="small"
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          tabBarStyle={{ margin: 0, padding: '0 8px', background: '#f5f5f5' }}
          items={[
            {
              key: 'images',
              label: 'Hình Ảnh',
              children: (
                <div className="sidepanel-content" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Image Viewer (Upper part) */}
                  <div className="image-viewer-section" style={{ flex: '1 1 60%', position: 'relative', borderBottom: '1px solid #ddd' }}>
                    <ImageViewer
                      ref={imageViewerRef}
                      image={selectedImage}
                      onTransformChange={handleTransformChange}
                    />
                  </div>

                  {/* Thumbnails (Lower part) */}
                  <div className="thumbnail-gallery-section" style={{ flex: '0 0 160px', overflowY: 'auto', background: '#fafafa' }}>
                    <ThumbnailGallery
                      images={images}
                      selectedIndex={selectedIndex}
                      onSelectImage={handleSelectImage}
                      shouldScrollToSelected={shouldScrollToSelected}
                    />
                  </div>
                </div>
              )
            },
            {
              key: 'ai_orders',
              label: <span><RobotOutlined /> AI Orders</span>,
              children: renderAIOrdersTab()
            },
            {
              key: 'portal',
              label: 'Portal Auto',
              children: (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <div style={{ padding: 8, borderBottom: '1px solid #eee', background: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tổng: <b>{portalList.length}</b></span>
                    <Button size="small" icon={<RightOutlined />} onClick={handlePrintPortalList}>In Danh Sách</Button>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Table
                      dataSource={portalList}
                      columns={portalColumns}
                      rowKey="MaBuuGui"
                      size="small"
                      pagination={false}
                      scroll={{ y: 'calc(100vh - 220px)' }}
                      sticky
                    />
                  </div>
                  {portalList.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Chưa có dữ liệu auto. Hãy chạy lệnh từ App.</div>}
                </div>
              )
            }
          ]}
        />
      </div>

    </div>
  );
};

export default SidePanel;