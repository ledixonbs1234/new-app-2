import React, { useEffect, useState, useRef, useCallback } from "react";
import { Spin, Alert, Button, Space, Tooltip, message, Switch, Modal } from "antd";
import { ReloadOutlined, UndoOutlined, LeftOutlined, RightOutlined, ClearOutlined } from "@ant-design/icons";
import { StoredImage } from "../types/vnpost";
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

  // =================================================================
  // LISTEN MESSAGES (APPLY ZOOM)
  // =================================================================

  // useEffect để lắng nghe message
  useEffect(() => {
    // 1. Handler cho Chrome Runtime Message (Giữ nguyên logic cũ cho các tính năng khác)
    const handleRuntimeMessage = (msg: any, _sender: any, sendResponse: any) => {
      if (msg.type === "SIDEPANEL_PING") { sendResponse({ status: "alive" }); return false; }
      
      if (msg.type === "SIDEPANEL_NEXT_IMAGE") {
        if (selectedIndex < images.length - 1) {
          handleSelectImage(selectedIndex + 1);
          sendResponse({ status: "success" });
        } else {
          sendResponse({ status: "end" });
        }
        return false;
      }
      return false;
    };

    // 2. Handler mới cho Window Message (Nhận từ Content Script qua postMessage)
    const handleWindowMessage = (event: MessageEvent) => {
      // Kiểm tra nguồn gốc tin nhắn để bảo mật (chỉ nhận từ chính extension hoặc trang web chứa nó)
      // Trong trường hợp này, trang web gửi vào iframe extension, nên origin là domain trang web
      // Tuy nhiên để đơn giản ta check cấu trúc data
      
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // XỬ LÝ ZOOM THÔNG MINH (Trigger từ focus input bên ngoài)
      if (msg.type === "APPLY_SMART_ZOOM") {
        if (msg.payload?.fieldGroup && autoZoomEnabled) {
          const fieldGroup: FieldGroup = msg.payload.fieldGroup;
          console.log(`[SidePanel] 📩 Received postMessage signal: ${fieldGroup}`);
          applySmartZoom(fieldGroup);
        }
      }
    };

    // Đăng ký listeners
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener("message", handleWindowMessage);

    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [savedPresets, autoZoomEnabled, selectedIndex, images.length]); // Dependencies
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

  if (loading && images.length === 0) return <div style={{padding:20, textAlign:'center'}}><Spin size="large"/><div>Đang tải...</div></div>;
  if (images.length === 0) return (
    <div style={{padding:20, textAlign:'center'}}>
        <h3>Chưa có hình ảnh</h3>
        <Button icon={<ReloadOutlined/>} onClick={handleRefresh}>Làm mới</Button>
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
             <Tooltip title="Xóa tất cả"><Button danger type="text" icon={<ClearOutlined/>} onClick={handleClearAllImages}/></Tooltip>
             <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} loading={syncProgress.status === "syncing"} />
          </Space>
        </div>
        
        {/* Navigation & Tools */}
        <div style={{ marginTop: 8, padding: 8, background: "#f5f5f5", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
           <Space>
              <Button size="small" icon={<LeftOutlined/>} onClick={handlePreviousImage} disabled={selectedIndex === 0}/>
              <span style={{ fontSize: 12 }}>{selectedIndex + 1}/{images.length}</span>
              <Button size="small" icon={<RightOutlined/>} onClick={handleNextImage} disabled={selectedIndex === images.length - 1}/>
           </Space>
           <Space>
              <span style={{ fontSize: 12 }}>Auto Zoom:</span>
              <Switch size="small" checked={autoZoomEnabled} onChange={handleToggleAutoZoom} />
              <Tooltip title="Reset Zoom"><Button size="small" icon={<UndoOutlined/>} onClick={handleResetPresets}/></Tooltip>
           </Space>
        </div>
      </div>

      {/* Main Content */}
      <div className="sidepanel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
    </div>
  );
};

export default SidePanel;