import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Spin, Button, Space, Tooltip, message, Switch, Modal, Tabs, Table, Tag, Checkbox } from "antd";
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, UndoOutlined, LeftOutlined, RightOutlined, ClearOutlined, DeleteOutlined, DollarOutlined, PhoneOutlined, EnvironmentOutlined, RobotOutlined, SaveOutlined, LinkOutlined } from "@ant-design/icons";
import { Order, StoredImage } from "../types/vnpost";
import { syncAllImages, listenToFirebaseImages } from "./utils/firebaseSync";
import { getAllImages, initDB } from "./utils/imageDB";
import ImageViewer from "./components/ImageViewer";
import ThumbnailGallery from "./components/ThumbnailGallery";
type FieldGroup = "TT_NUMBER" | "RECEIVER_INFO" | "WEIGHT" | "MONEY" | "NONE";

interface ZoomPreset {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
}

// --- THÊM: Helper chuẩn hóa tiếng Việt để so sánh địa chỉ ---
const normalizeText = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
};

// --- THÊM: Hàm xác định điểm ưu tiên của vùng ---
// Thứ tự ưu tiên: Ra (1) -> Vô (2) -> Quảng Nam (3) -> Quảng Ngãi (4) -> Khác (5)
const getRegionScore = (address: string): number => {
  if (!address) return 5;
  let normAddr = normalizeText(address);

  // --- THÊM: Lọc các từ khóa tỉnh/tp để lấy phần tên địa phương ---
  // Nếu tìm thấy từ khóa, lấy phần chuỗi phía sau nó để tránh nhầm lẫn (VD: Huyện Tịnh Biên có từ "tinh")
  const match = normAddr.match(/(?:tinh|thanh pho|tp)[\W\s]+(.+)$/);
  if (match && match[1]) {
    normAddr = match[1].trim();
  }

  // Check RA
  if (PROVINCE_GROUPS.RA.some(p => normAddr.includes(p))) return 1;

  // Check VO
  if (PROVINCE_GROUPS.VO.some(p => normAddr.includes(p))) return 4;

  // Check QUANG NAM
  if (PROVINCE_GROUPS.QUANG_NAM.some(p => normAddr.includes(p))) return 2;

  // Check QUANG NGAI
  if (PROVINCE_GROUPS.QUANG_NGAI.some(p => normAddr.includes(p))) return 3;

  return 5; // Không xác định
};

// --- THÊM: Định nghĩa dữ liệu tỉnh thành để map vùng miền ---
// Dựa trên file tinhthanh.json bạn cung cấp
const PROVINCE_GROUPS = {
  VO: [
    "binh dinh", "phu yen", "khanh hoa", "ninh thuan", "binh thuan",
    "kon tum", "gia lai", "dak lak", "dak nong", "lam dong",
    "binh phuoc", "tay ninh", "binh duong", "dong nai", "ba ria vung tau",
    "ho chi minh", "hcm", "sai gon", // Thêm hcm/sai gon cho chắc
    "long an", "tien giang", "ben tre", "tra vinh", "vinh long",
    "dong thap", "an giang", "kien giang", "can tho", "hau giang",
    "soc trang", "bac lieu", "ca mau"
  ],
  RA: [
    "da nang", "thua thien hue", "quang tri", "quang binh", "ha tinh",
    "nghe an", "thanh hoa", "ninh binh", "hoa binh", "son la",
    "dien bien", "lai chau", "lao cai", "yen bai", "phu tho",
    "ha giang", "tuyen quang", "cao bang", "bac kan", "thai nguyen",
    "lang son", "bac giang", "quang ninh", "ha noi", "hai phong",
    "hai duong", "hung yen", "ha nam", "nam dinh", "thai binh",
    "vinh phuc", "bac ninh"
  ],
  QUANG_NAM: ["quang nam"],
  QUANG_NGAI: ["quang ngai"]
};

const SidePanel: React.FC = () => {
  // State
  const [images, setImages] = useState<StoredImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    const saved = localStorage.getItem("sidepanel_selected_index");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [loading, setLoading] = useState<boolean>(true);
  /* error and syncProgress removed */
  const [savedHdrId, setSavedHdrId] = useState<string>(() => {
    return localStorage.getItem("sidepanel_saved_hdr_id") || "";
  });
  const [isAutoSaveNormal, setIsAutoSaveNormal] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidepanel_auto_save_normal");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [keepTabOpen, setKeepTabOpen] = useState<boolean>(false);
  const handleToggleAutoSave = (e: any) => {
    const checked = e.target.checked;
    setIsAutoSaveNormal(checked);
    localStorage.setItem("sidepanel_auto_save_normal", JSON.stringify(checked));
  };
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
  /* portalLoading removed */
  const [aiOrders, setAiOrders] = useState<Order[]>([]);
  const [aiSelectedIndex, setAiSelectedIndex] = useState<number>(0);
  // Hàm xử lý lưu vị trí scroll (có debounce để tránh ghi storage quá nhiều)
  /* saveScrollPosition removed */
  // Refs
  const imageViewerRef = useRef<{
    applyZoomPreset: (preset: ZoomPreset) => void;
    getCurrentZoom: () => ZoomPreset;
    resetToDefault: () => void;
  }>(null);
  const isImagesLoadedRef = useRef(false);
  const focusRequestIdRef = useRef(0);
  const hasSyncedRef = useRef(false);

  // Ref quan trọng để theo dõi Field nào đang được Active
  const currentFocusedFieldRef = useRef<FieldGroup>("NONE");

  // Ref cho Timer Debounce (chờ user dừng thao tác mới lưu)
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // =================================================================
  // LOGIC SẮP XẾP DATA (Dùng chung cho Render và Navigation)
  // =================================================================
  const sortedAiOrders = useMemo(() => {
    if (aiOrders.length === 0) return [];

    // 1. Tính toán COD phổ biến (Mode)
    const codCounts = new Map<number, number>();
    aiOrders.forEach(o => {
      const cod = o.COD || 0;
      codCounts.set(cod, (codCounts.get(cod) || 0) + 1);
    });

    let majorityCOD = -1;
    let maxCount = 0;
    for (const [cod, count] of codCounts) {
      if (count > maxCount) {
        maxCount = count;
        majorityCOD = cod;
      }
    }

    // 2. Map giữ index gốc, gắn cờ bất thường và tính điểm vùng
    const mappedList = aiOrders.map((order, idx) => ({
      ...order,
      originalIndex: idx,
      isAbnormalCOD: majorityCOD !== -1 && order.COD !== majorityCOD,
      regionScore: getRegionScore(order.DIACHI) // Tính điểm vùng ngay lúc map
    }));

    // 3. Sắp xếp
    return mappedList.sort((a, b) => {
      // Ưu tiên 1: COD Bất thường lên đầu (Không phân biệt vùng miền)
      if (a.isAbnormalCOD && !b.isAbnormalCOD) return -1;
      if (!a.isAbnormalCOD && b.isAbnormalCOD) return 1;

      // Ưu tiên 2: Sắp xếp theo Vùng (Ra -> Vô -> QNam -> QNgai)
      // Nếu cùng là COD thường (hoặc cùng là COD bất thường), thì sort theo vùng
      if (a.regionScore !== b.regionScore) {
        return a.regionScore - b.regionScore;
      }

      // Ưu tiên 3: Index gốc tăng dần (giữ ổn định)
      return a.originalIndex - b.originalIndex;
    });
  }, [aiOrders]);

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
  // 1. Lấy hdrId từ tab hiện tại và lưu lại
  const handleSaveCurrentHdrId = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const urlObj = new URL(tab.url);
        // Tìm tham số hdrId trong URL
        const id = urlObj.searchParams.get("hdrId");

        if (id) {
          setSavedHdrId(id);
          localStorage.setItem("sidepanel_saved_hdr_id", id);
          message.success(`Đã lưu HdrId: ${id}`);
        } else {
          message.warning("Không tìm thấy hdrId trong URL hiện tại");
        }
      } else {
        message.warning("Không lấy được URL của tab hiện tại");
      }
    } catch (error) {
      console.error(error);
      message.error("Lỗi khi đọc URL");
    }
  };
  const navigateSortedAI = (direction: 'next' | 'prev') => {
    // 1. Tìm vị trí hiện tại trong danh sách ĐÃ SẮP XẾP
    const currentSortedIndex = sortedAiOrders.findIndex(item => item.originalIndex === aiSelectedIndex);

    if (currentSortedIndex === -1) return false;

    // 2. Tính chỉ mục tiếp theo
    const nextSortedIndex = direction === 'next' ? currentSortedIndex + 1 : currentSortedIndex - 1;

    // 3. Kiểm tra giới hạn
    if (nextSortedIndex >= 0 && nextSortedIndex < sortedAiOrders.length) {
      const targetItem = sortedAiOrders[nextSortedIndex];

      // 4. Chọn item dựa trên index GỐC
      handleSelectAIOrder(targetItem.originalIndex);

      // 5. Scroll tới item đó
      setTimeout(() => {
        const el = document.getElementById(`ai-order-${targetItem.originalIndex}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      return true; // Điều hướng thành công
    }

    return false; // Hết danh sách
  };
  // 2. Mở lại trang với hdrId đã lưu
  const handleOpenSavedHdrId = () => {
    if (!savedHdrId) {
      message.warning("Chưa có HdrId nào được lưu");
      return;
    }
    const targetUrl = `https://portalkhl.vnpost.vn/accept-api-dtl?hdrId=${savedHdrId}`;
    chrome.tabs.update({ url: targetUrl });
  };

  const lastAutoNextTimeRef = useRef<number>(0);

  useEffect(() => {
    // Load cài đặt "Giữ Tab" từ storage
    chrome.storage.local.get(["keepSidePanelOpen"], (result) => {
      if (result.keepSidePanelOpen !== undefined) {
        setKeepTabOpen(result.keepSidePanelOpen);
      }
    });
  }, []);
  // =================================================================
  // INIT & LOAD DATA
  // =================================================================
  useEffect(() => {


    const stopListening = listenToFirebaseImages(async () => {
      if (isImagesLoadedRef.current) {
        console.log("[SidePanel] Background báo update -> Reloading images...");
        const updated = await getAllImages();
        setImages(updated);
        setLoading(false);
      }
    });

    // 3. Trigger một lần sync thủ công khi mở panel để đảm bảo data mới nhất
    // syncAllImages();

    return () => {
      stopListening();
    };
  }, []);

  // 2. LAZY LOAD IMAGES: Chỉ tải khi tab "images" được active
  useEffect(() => {
    if (activeTab === 'images' && !isImagesLoadedRef.current) {
      console.log("[SidePanel] Tab Hình Ảnh active -> Bắt đầu tải dữ liệu...");

      // Đánh dấu đã tải để không tải lại khi chuyển tab qua lại
      isImagesLoadedRef.current = true;

      // 1. Load từ DB
      loadImages();

      // 2. Trigger Sync nếu chưa sync
      if (!hasSyncedRef.current) {
        syncAllImages();
        hasSyncedRef.current = true;
      }
    }
  }, [activeTab]);
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
          // --- LOGIC MỚI: Dùng hàm điều hướng theo thứ tự sắp xếp ---
          const success = navigateSortedAI('next');

          if (success) {
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

  const handleToggleKeepTab = (e: any) => {
    const checked = e.target.checked;
    setKeepTabOpen(checked);
    chrome.storage.local.set({ keepSidePanelOpen: checked });
    message.success(checked ? "Đã bật chế độ Giữ Tab khi refresh" : "Đã tắt chế độ Giữ Tab");
  };

  // =================================================================
  // RENDER AI TAB CONTENT (Cập nhật hàm này)
  // =================================================================
  const renderAIOrdersTab = () => {
    if (aiOrders.length === 0) {
      return <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Chưa có dữ liệu. Hãy dùng "Dùng AI" ở Popup.</div>;
    }

    // 1. Tính toán COD phổ biến nhất (Mode)
    const codCounts = new Map<number, number>();
    aiOrders.forEach(o => {
      const cod = o.COD || 0;
      codCounts.set(cod, (codCounts.get(cod) || 0) + 1);
    });

    let majorityCOD = -1;
    let maxCount = 0;
    for (const [cod, count] of codCounts) {
      if (count > maxCount) {
        maxCount = count;
        majorityCOD = cod;
      }
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
          {/* Thêm thông tin về COD phổ biến nếu có sự chênh lệch */}
          {codCounts.size > 1 && maxCount < aiOrders.length && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #eee', fontSize: '12px' }}>
              <span style={{ color: '#666' }}>COD phổ biến: </span>
              <b style={{ color: '#1890ff' }}>{majorityCOD.toLocaleString()}</b>
              <span style={{ color: '#999' }}> ({maxCount} đơn)</span>
              <span style={{ marginLeft: 8, color: '#ff4d4f' }}>• Khác: {aiOrders.length - maxCount} đơn(Đã đưa lên đầu)</span>
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #eee' }}>
            <Checkbox
              checked={isAutoSaveNormal}
              onChange={handleToggleAutoSave}
              style={{ fontSize: '12px' }}
            >
              <span style={{ color: '#1890ff', fontWeight: 500 }}>Tự động Lưu đơn thường</span>
              <span style={{ color: '#999', marginLeft: 4, fontSize: '11px' }}>(Check giá trị &ne; cũ &rarr; Lưu)</span>
            </Checkbox>
          </div>
        </div>

        {/* --- DANH SÁCH ĐƠN HÀNG (GIỮ NGUYÊN) --- */}
        <div style={{ marginBottom: 8, padding: '0 8px', display: 'flex', justifyContent: 'space-between', color: '#666' }}>
          <span>Danh sách chi tiết:</span>
          <span>Đang chọn: <b>  {sortedAiOrders.findIndex(item => item.originalIndex === aiSelectedIndex) + 1}</b></span>
        </div>

        {sortedAiOrders.map((item, sortedIndex) => {
          // Lưu ý: Dùng item.originalIndex để xác định selection
          const idx = item.originalIndex;
          const isSelected = idx === aiSelectedIndex;
          const isAbnormalCOD = item.isAbnormalCOD;

          // Logic màu sắc từng item
          const ms = item.MAUSAC ? item.MAUSAC.toUpperCase() : "";
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

          // Style background cho item khác thường
          let bgStyle = '#fff';
          let borderStyle = '1px solid #d9d9d9';

          if (isSelected) {
            bgStyle = '#e6f7ff';
            borderStyle = '1px solid #1890ff';
          } else if (isAbnormalCOD) {
            bgStyle = '#fff1f0'; // Light red/pink warning
            borderStyle = '1px solid #ff4d4f'; // Red border
          }

          return (
            <div
              key={idx} // Key vẫn là index gốc để React tối ưu
              id={`ai-order-${idx}`} // ID vẫn theo index gốc để scroll hoạt động
              onClick={() => handleSelectAIOrder(idx)} // Click gọi theo index gốc
              style={{
                background: bgStyle,
                border: borderStyle,
                borderRadius: '8px',
                padding: '10px',
                marginBottom: '8px',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 2px 8px rgba(24, 144, 255, 0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s',
                scrollMarginTop: '10px',
                position: 'relative' // Để đặt badge cảnh báo nếu cần
              }}
            >
              {/* Badge cảnh báo cho COD bất thường */}
              {isAbnormalCOD && (
                <div style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: '#ff4d4f',
                  color: 'white',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  zIndex: 1
                }}>!</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <strong style={{ color: isSelected ? '#1890ff' : '#333', fontSize: '13px', marginRight: '8px', wordBreak: 'break-word' }}>
                  #{sortedIndex + 1} {item.NGUOINHAN}
                </strong>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                  {item.MAHIEU && (
                    <Tag color="purple" style={{ margin: 0, fontSize: '11px', fontWeight: 'bold' }}>
                      {item.MAHIEU}
                    </Tag>
                  )}
                  {item.MAUSAC && (
                    <Tag style={tagStyle}>
                      {item.MAUSAC}
                    </Tag>
                  )}
                  {item.COD > 0 && (
                    <Tag color={isAbnormalCOD ? "red" : "green"} style={{ margin: 0, fontSize: '11px', fontWeight: isAbnormalCOD ? 'bold' : 'normal' }}>
                      <DollarOutlined /> {item.COD.toLocaleString()}
                    </Tag>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#666', display: 'flex', gap: 6, alignItems: 'center' }}>
                <PhoneOutlined /> {item.SDT}
              </div>

              <div style={{ fontSize: '12px', color: '#666', marginTop: 4, display: 'flex', gap: 6 }}>
                <EnvironmentOutlined style={{ marginTop: 3, flexShrink: 0 }} />
                <span style={{ lineHeight: '1.4' }}>{item.DIACHI}</span>
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
                "{item.GOC}"
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
      /* setError(null) removed */

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
      // await syncAllImages();

      // Nếu chưa có ảnh nào (lần đầu cài), ta vẫn để loading quay
      // Việc cập nhật ảnh mới sẽ do useEffect (listener) đảm nhận khi Background báo về
      if (local.length === 0) {
        // Có thể set timeout để tắt loading nếu không có ảnh nào trả về sau 5s
        setTimeout(() => setLoading(false), 5000);
      }

    } catch (err: any) {
      console.error(err);
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
    const orderInfo = sortedAiOrders.find(item => item.originalIndex === index);
    const isAbnormal = orderInfo?.isAbnormalCOD || false;
    const shouldAutoSave = isAutoSaveNormal && !isAbnormal;
    // Gửi lệnh điền form xuống Content Script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "FILL_FORM_DATA_AI",
        payload: {
          ...order,
          autoSave: shouldAutoSave // Gửi cờ này xuống content script
        }// Gửi cờ này xuống content script
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



  return (
    <div className="sidepanel-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          type="card"
          // className="full-height-tabs" 
          size="small"
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          tabBarStyle={{ margin: 0, padding: '0 8px', background: '#f5f5f5' }}
          items={[
            {
              key: 'portal',
              label: 'Portal Auto',
              children: (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#666' }}>HdrId:</span>
                      <strong style={{ color: '#1890ff', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {savedHdrId || "Chưa lưu"}
                      </strong>
                    </div>
                    <Space style={{ width: '100%' }}>
                      <Button
                        size="small"
                        icon={<SaveOutlined />}
                        onClick={handleSaveCurrentHdrId}
                        type="default"
                        style={{ flex: 1 }}
                      >
                        Lấy từ Tab
                      </Button>
                      <Button
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={handleOpenSavedHdrId}
                        type="primary"
                        disabled={!savedHdrId}
                        style={{ flex: 1 }}
                      >
                        Mở lại
                      </Button>
                    </Space>
                  </div>
                  <div style={{ padding: '0 12px 8px 12px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                    <Checkbox
                      checked={keepTabOpen}
                      onChange={handleToggleKeepTab}
                      style={{ fontSize: '12px' }}
                    >
                      <span style={{ color: '#1890ff', fontWeight: 500 }}>Giữ Tab khi Refresh</span>
                    </Checkbox>
                  </div>
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
            },
            {
              key: 'images',
              label: 'Hình Ảnh',
              children: (

                <div className="sidepanel-content" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>Hình Ảnh ({images.length})</h3>
                    <Space>
                      <Tooltip title="Xóa tất cả"><Button danger type="text" icon={<ClearOutlined />} onClick={handleClearAllImages} /></Tooltip>
                      <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} />
                    </Space>
                  </div>
                  <div style={{ marginTop: 8, padding: 8, background: "#f5f5f5", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Space>
                      <Button size="small" icon={<LeftOutlined />} onClick={() => activeTab === 'images' ? handlePreviousImage() : navigateSortedAI('prev')} disabled={activeTab === 'images' ? selectedIndex === 0 : (sortedAiOrders.findIndex(x => x.originalIndex === aiSelectedIndex) === 0)} />
                      <span style={{ fontSize: 12 }}>
                        {activeTab === 'images'
                          ? `${selectedIndex + 1}/${images.length}`
                          : `${sortedAiOrders.findIndex(x => x.originalIndex === aiSelectedIndex) + 1}/${aiOrders.length}`}
                      </span>
                      <Button size="small" icon={<RightOutlined />} onClick={() => activeTab === 'images' ? handleNextImage() : navigateSortedAI('next')} disabled={activeTab === 'images' ? selectedIndex === images.length - 1 : (sortedAiOrders.findIndex(x => x.originalIndex === aiSelectedIndex) === aiOrders.length - 1)} />
                    </Space>
                    <Space>
                      <span style={{ fontSize: 12 }}>Auto Zoom:</span>
                      <Switch size="small" checked={autoZoomEnabled} onChange={handleToggleAutoZoom} />
                      <Tooltip title="Reset Zoom"><Button size="small" icon={<UndoOutlined />} onClick={handleResetPresets} /></Tooltip>
                    </Space>
                  </div>
                  {/* LOGIC LOADING RIÊNG CHO TAB HÌNH ẢNH */}
                  {(loading && images.length === 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <Spin size="large" />
                      <div style={{ marginTop: 10, color: '#888' }}>Đang tải hình ảnh...</div>
                    </div>
                  ) : images.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <h3 style={{ color: '#999' }}>Chưa có hình ảnh</h3>
                      <Button icon={<ReloadOutlined />} onClick={handleRefresh} style={{ marginTop: 10 }}>Làm mới</Button>
                    </div>
                  ) : (
                    /* GIAO DIỆN HÌNH ẢNH CHÍNH */
                    <>
                      <div className="image-viewer-section" style={{ flex: '1 1 60%', position: 'relative', borderBottom: '1px solid #ddd' }}>
                        <ImageViewer
                          ref={imageViewerRef}
                          image={images[selectedIndex]} // Lưu ý: dùng images[selectedIndex] thay vì biến selectedImage để an toàn
                          onTransformChange={handleTransformChange}
                        />
                      </div>

                      <div className="thumbnail-gallery-section" style={{ flex: '0 0 180px', overflowY: 'auto', background: '#fafafa' }}>
                        <ThumbnailGallery
                          images={images}
                          selectedIndex={selectedIndex}
                          onSelectImage={handleSelectImage}
                          shouldScrollToSelected={shouldScrollToSelected}
                        />
                      </div>
                    </>
                  )}
                </div>
              )
            },
            {
              key: 'ai_orders',
              label: <span><RobotOutlined /> AI Orders</span>,
              children: renderAIOrdersTab()
            },

          ]}
        />
      </div>

    </div>
  );
};

export default SidePanel;