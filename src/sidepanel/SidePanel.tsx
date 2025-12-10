import React, { useEffect, useState, useRef } from "react";
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
  const [images, setImages] = useState<StoredImage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    // Load saved index from localStorage
    const saved = localStorage.getItem("sidepanel_selected_index");
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    total: 0,
    downloaded: 0,
    failed: 0,
    status: "idle",
  });
  
  // Ref to trigger zoom in ImageViewer
  const imageViewerRef = useRef<{ 
    applyZoomPreset: (preset: ZoomPreset) => void; 
    getCurrentZoom: () => ZoomPreset;
    resetToDefault: () => void;
  }>(null);
  
  // Track current focused field to save preset when losing focus
  const currentFocusedFieldRef = useRef<FieldGroup>("NONE");
  
  // Track the initial preset applied (to compare if user actually changed it)
  const appliedPresetRef = useRef<ZoomPreset | null>(null);
  
  // Auto zoom toggle state
  const [autoZoomEnabled, setAutoZoomEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidepanel_auto_zoom_enabled");
    return saved !== null ? JSON.parse(saved) : true; // Default: enabled
  });
  
  // Control scroll behavior - only scroll when user actively selects
  const [shouldScrollToSelected, setShouldScrollToSelected] = useState<boolean>(false);
  
  // Saved presets per field group
  const [savedPresets, setSavedPresets] = useState<Record<FieldGroup, ZoomPreset>>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem("sidepanel_zoom_presets");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved presets:", e);
      }
    }
    // Default presets
    return {
      TT_NUMBER: { zoom: 2, pan: { x: -100, y: -150 }, rotation: 0 },
      RECEIVER_INFO: { zoom: 2.5, pan: { x: 0, y: 0 }, rotation: 0 },
      WEIGHT: { zoom: 2, pan: { x: 100, y: 100 }, rotation: 0 },
      MONEY: { zoom: 2, pan: { x: -100, y: 150 }, rotation: 0 },
      NONE: { zoom: 1, pan: { x: 0, y: 0 }, rotation: 0 },
    };
  });

  // Initialize and load images
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    // Initial load
    loadImages();
    
    // Setup realtime listener for Firebase changes
    const setupRealtimeListener = async () => {
      try {
        console.log("[SidePanel] Setting up Firebase realtime listener...");
        unsubscribe = await listenToFirebaseImages(async (firebaseImages) => {
          const imageCount = Object.keys(firebaseImages).length;
          console.log(`[SidePanel] Firebase data changed: ${imageCount} images`);
          
          // Re-sync when Firebase data changes (with progressive batch updates)
          await syncAllImages({
            onProgress: (progress) => {
              setSyncProgress(progress);
            },
            onImageDownloaded: async (_batchImage) => {
              // Update UI per batch to reduce re-renders
              const updatedImages = await getAllImages();
              setImages(updatedImages);
              console.log(`[SidePanel] 📥 Batch updated from Firebase, total: ${updatedImages.length}`);
            }
          });
          
          // Reload from IndexedDB
          const updatedImages = await getAllImages();
          setImages(updatedImages);
          
          if (updatedImages.length === 0) {
            setError("Không có hình ảnh nào được tìm thấy");
          } else {
            setError(null);
            
            // Validate and restore selected index after Firebase update
            const savedIndex = localStorage.getItem("sidepanel_selected_index");
            if (savedIndex !== null) {
              const index = parseInt(savedIndex, 10);
              if (index >= 0 && index < updatedImages.length) {
                // Keep current selection if still valid
                if (index !== selectedIndex) {
                  setSelectedIndex(index);
                  console.log(`[SidePanel] 🔄 Revalidated selected index after Firebase update: ${index}`);
                }
              } else {
                // Reset if out of bounds
                console.log(`[SidePanel] ⚠️ Selected index ${index} out of bounds after update, resetting to 0`);
                setSelectedIndex(0);
                localStorage.setItem("sidepanel_selected_index", "0");
              }
            }
          }
        });
        console.log("[SidePanel] Realtime listener setup complete");
      } catch (err) {
        console.error("[SidePanel] Failed to setup realtime listener:", err);
      }
    };
    
    setupRealtimeListener();
    
    // Notify content scripts that side panel is open
    console.log("[SidePanel] 📢 Broadcasting SIDEPANEL_STATUS: open");
    chrome.runtime.sendMessage({ type: "SIDEPANEL_STATUS", isOpen: true }, () => {
      // Ignore errors - content script might not be loaded yet
      if (chrome.runtime.lastError) {
        console.log("[SidePanel] Broadcast failed (expected if no listeners):", chrome.runtime.lastError.message);
      }
    });
    
    // Also broadcast to all tabs (in case content scripts are already loaded)
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "SIDEPANEL_STATUS", isOpen: true }, () => {
            // Ignore errors - not all tabs have content script
            chrome.runtime.lastError; // Just consume the error
          });
        }
      });
      console.log("[SidePanel] 📢 Broadcasted to all tabs");
    });
    
    // Cleanup: notify when side panel closes and unsubscribe listener
    return () => {
      console.log("[SidePanel] Cleaning up realtime listener...");
      if (unsubscribe) {
        unsubscribe();
      }
      console.log("[SidePanel] 📢 Broadcasting SIDEPANEL_STATUS: closed");
      chrome.runtime.sendMessage({ type: "SIDEPANEL_STATUS", isOpen: false }, () => {
        chrome.runtime.lastError; // Consume error
      });
    };
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      setError(null);

      // Initialize IndexedDB
      await initDB();

      // Check if images exist locally
      const localImages = await getAllImages();

      if (localImages.length > 0) {
        // Load from IndexedDB first for instant display
        setImages(localImages);
        setLoading(false);
      }

      // Sync from Firebase - this will:
      // 1. Fetch metadata immediately → show all thumbnails
      // 2. Download blobs progressively in batches
      await syncAllImages({
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
        onImageDownloaded: async (_batchImage) => {
          // Progressively update UI per batch (not per image)
          // This reduces re-renders from 50x to ~17x for 50 images
          const updatedImages = await getAllImages();
          setImages(updatedImages);
          console.log(`[SidePanel] 📥 Batch updated, total: ${updatedImages.length} images`);
        }
      });

      // Final reload from IndexedDB after sync completes
      const updatedImages = await getAllImages();
      setImages(updatedImages);
      setLoading(false);

      if (updatedImages.length === 0) {
        setError("Không có hình ảnh nào được tìm thấy");
      } else {
        // Restore selected index if valid
        const savedIndex = localStorage.getItem("sidepanel_selected_index");
        if (savedIndex !== null) {
          const index = parseInt(savedIndex, 10);
          if (index >= 0 && index < updatedImages.length) {
            setSelectedIndex(index);
            console.log(`[SidePanel] 📂 Restored selected index: ${index}`);
            
            // Send maHieu to portal if available
            const selectedImg = updatedImages[index];
            if (selectedImg?.maHieu) {
              sendMaHieuToPortal(selectedImg.maHieu);
            }
          } else {
            console.log(`[SidePanel] ⚠️ Saved index ${index} out of bounds (${updatedImages.length} images), resetting to 0`);
            setSelectedIndex(0);
            localStorage.setItem("sidepanel_selected_index", "0");
          }
        }
      }
    } catch (err) {
      console.error("Failed to load images:", err);
      setError(
        err instanceof Error ? err.message : "Không thể tải hình ảnh"
      );
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadImages();
  };

  const handleSelectImage = (index: number) => {
    setSelectedIndex(index);
    setShouldScrollToSelected(true); // Enable scroll for user selection
    
    // Reset scroll flag after a short delay to prevent interference with progressive updates
    setTimeout(() => setShouldScrollToSelected(false), 500);
    
    // Save to localStorage to persist across side panel reopens
    localStorage.setItem("sidepanel_selected_index", index.toString());
    console.log(`[SidePanel] 💾 Saved selected index: ${index}`);
    
    // Reset tracking when changing images to prevent false saves
    currentFocusedFieldRef.current = "NONE";
    appliedPresetRef.current = null;
    
    // If auto zoom enabled, reset to default view when changing images
    // If disabled, keep current zoom state
    if (autoZoomEnabled && imageViewerRef.current) {
      imageViewerRef.current.resetToDefault();
    }
    
    // If has maHieu, send to portal page to fill ttNumber
    const selectedImg = images[index];
    if (selectedImg?.maHieu) {
      sendMaHieuToPortal(selectedImg.maHieu);
    }
  };

  const sendMaHieuToPortal = async (maHieu: string) => {
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) return;
      
      // Check if it's a portal page
      if (!tab.url.startsWith("https://portalkhl.vnpost.vn/")) {
        console.log("[SidePanel] Not a portal page, skipping ttNumber fill");
        return;
      }
      
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, {
        type: "FILL_TT_NUMBER",
        payload: { maHieu }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("[SidePanel] Could not send maHieu:", chrome.runtime.lastError.message);
        } else {
          console.log(`[SidePanel] Sent maHieu to portal: ${maHieu}`);
        }
      });
    } catch (error) {
      console.error("[SidePanel] Error sending maHieu:", error);
    }
  };

  const handleClearAllImages = () => {
    Modal.confirm({
      title: "⚠️ Xác nhận xóa toàn bộ hình ảnh",
      content: `Bạn có chắc chắn muốn xóa vĩnh viễn ${images.length} hình ảnh từ cả local và Firebase?`,
      okText: "Xóa tất cả",
      okType: "danger",
      cancelText: "Không",
      onOk: () => {
        return executeDeleteAllImages();
      },
    });
  };

  const executeDeleteAllImages = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const hideLoading = message.loading("Đang xóa toàn bộ hình ảnh...", 0);
      
      chrome.runtime.sendMessage(
        {
          event: "CONTENTMY",
          type: "CLEAR_ALL_IMAGES",
        },
        (response) => {
          hideLoading();
          
          if (chrome.runtime.lastError) {
            const errorMsg = "Lỗi kết nối: " + chrome.runtime.lastError.message;
            message.error(errorMsg);
            console.error("[SidePanel]", errorMsg);
            reject(new Error(errorMsg));
            return;
          }

          if (response && response.status === "success") {
            message.success(response.message || "Đã xóa toàn bộ hình ảnh thành công");
            console.log(`[SidePanel] Cleared ${response.deletedCount} images from Firebase`);
            
            // Reset UI state
            setImages([]);
            setSelectedIndex(0);
            localStorage.setItem("sidepanel_selected_index", "0");
            
            resolve();
          } else {
            const errorMsg = response?.error || "Không thể xóa hình ảnh";
            message.error("Lỗi: " + errorMsg);
            console.error("[SidePanel]", errorMsg);
            reject(new Error(errorMsg));
          }
        }
      );
    });
  };

  const handlePreviousImage = () => {
    if (selectedIndex > 0) {
      handleSelectImage(selectedIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (selectedIndex < images.length - 1) {
      handleSelectImage(selectedIndex + 1);
    }
  };

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
    console.log("[SidePanel] Reset all zoom presets to defaults");
  };

  const handleToggleAutoZoom = (checked: boolean) => {
    setAutoZoomEnabled(checked);
    localStorage.setItem("sidepanel_auto_zoom_enabled", JSON.stringify(checked));
    message.info(checked ? "Đã bật tự động zoom" : "Đã tắt tự động zoom", 1.5);
    console.log("[SidePanel] Auto zoom:", checked ? "enabled" : "disabled");
  };

  // Listen for smart zoom messages from content script
  useEffect(() => {
    const handleMessage = (msg: any, sender: any, sendResponse: any) => {
      console.log("[SidePanel] ✉️ Received message:", msg.type, msg);
      
      // Respond to ping (for status check)
      if (msg.type === "SIDEPANEL_PING") {
        sendResponse({ status: "alive" });
        return false;
      }
      
      // Handle next image request from content script
      if (msg.type === "SIDEPANEL_NEXT_IMAGE") {
        console.log("[SidePanel] 🖼️ Processing next image request");
        
        if (selectedIndex < images.length - 1) {
          const nextIndex = selectedIndex + 1;
          console.log(`[SidePanel] ✅ Moving to next image: ${selectedIndex} → ${nextIndex}`);
          handleSelectImage(nextIndex);
          sendResponse({ status: "success", newIndex: nextIndex });
        } else {
          console.log("[SidePanel] ⚠️ Already at last image");
          sendResponse({ status: "already_at_end", currentIndex: selectedIndex });
        }
        return false;
      }
      
      // Respond to status query (deprecated - now handled by background)
      if (msg.type === "QUERY_SIDEPANEL_STATUS") {
        console.log("[SidePanel] Responding to status query");
        sendResponse({ isOpen: true });
        return false; // Synchronous response, don't keep channel open
      }
      
      // Handle smart zoom request
      if (msg.type === "APPLY_SMART_ZOOM") {
        console.log("[SidePanel] Processing APPLY_SMART_ZOOM:", {
          fieldGroup: msg.payload?.fieldGroup,
          autoZoomEnabled,
          hasPayload: !!msg.payload,
          hasFieldGroup: !!msg.payload?.fieldGroup
        });
        
        if (msg.payload?.fieldGroup && autoZoomEnabled) {
          const fieldGroup: FieldGroup = msg.payload.fieldGroup;
          console.log(`[SidePanel] ✅ Applying smart zoom for: ${fieldGroup}`);
          applySmartZoom(fieldGroup);
        } else {
          console.log("[SidePanel] ❌ Smart zoom NOT applied:", {
            reason: !msg.payload?.fieldGroup ? "No fieldGroup" : "Auto zoom disabled"
          });
        }
        return false; // No response needed
      }
      
      return false; // Default: no response
    };

    console.log("[SidePanel] 📡 Message listener registered (autoZoomEnabled:", autoZoomEnabled, ")");
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      console.log("[SidePanel] 📡 Message listener removed");
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [savedPresets, autoZoomEnabled, selectedIndex, images.length, handleSelectImage]);

  // Listen for window blur (side panel losing focus) to save current preset
  useEffect(() => {
    const handleWindowBlur = () => {
      const currentField = currentFocusedFieldRef.current;
      if (currentField !== "NONE" && imageViewerRef.current && appliedPresetRef.current) {
        const currentZoom = imageViewerRef.current.getCurrentZoom();
        const appliedPreset = appliedPresetRef.current;
        
        // Check if user actually changed the zoom/pan (compare with applied preset)
        const hasChanged = 
          Math.abs(currentZoom.zoom - appliedPreset.zoom) > 0.01 ||
          Math.abs(currentZoom.pan.x - appliedPreset.pan.x) > 1 ||
          Math.abs(currentZoom.pan.y - appliedPreset.pan.y) > 1 ||
          currentZoom.rotation !== appliedPreset.rotation;
        
        if (!hasChanged) {
          console.log(`[SidePanel] No changes detected for ${currentField}, skipping save`);
          currentFocusedFieldRef.current = "NONE";
          appliedPresetRef.current = null;
          return;
        }
        
        console.log(`[SidePanel] Saving preset for ${currentField}:`, currentZoom);
        
        const newPresets = {
          ...savedPresets,
          [currentField]: currentZoom,
        };
        
        setSavedPresets(newPresets);
        localStorage.setItem("sidepanel_zoom_presets", JSON.stringify(newPresets));
        
        // Show notification
        const fieldNames: Record<FieldGroup, string> = {
          TT_NUMBER: "Số TT",
          RECEIVER_INFO: "Thông tin người nhận",
          WEIGHT: "Khối lượng",
          MONEY: "Tiền COD",
          NONE: ""
        };
        message.success(`Đã lưu vị trí zoom cho trường "${fieldNames[currentField]}"`, 2);
        
        // Reset focused field
        currentFocusedFieldRef.current = "NONE";
        appliedPresetRef.current = null;
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [savedPresets]);

  // Apply zoom based on field group (use saved presets)
  const applySmartZoom = (fieldGroup: FieldGroup) => {
    // Track current focused field
    currentFocusedFieldRef.current = fieldGroup;

    const preset = savedPresets[fieldGroup];
    if (preset && imageViewerRef.current) {
      console.log("[SidePanel] Applying smart zoom for:", fieldGroup, preset);
      imageViewerRef.current.applyZoomPreset(preset);
      // Save the applied preset to compare later
      appliedPresetRef.current = { ...preset };
    }
  };

  // Render loading state
  if (loading && images.length === 0) {
    return (
      <div className="sidepanel-container">
        <div className="sidepanel-header">
          <h1>Hình Ảnh Bưu Gửi</h1>
        </div>
        <div className="loading-container">
          <Spin size="large" />
          <div className="loading-text">Đang tải hình ảnh...</div>
          {syncProgress.total > 0 && (
            <div className="loading-progress">
              {syncProgress.downloaded} / {syncProgress.total} hình ảnh
              {syncProgress.failed > 0 && ` (${syncProgress.failed} lỗi)`}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render error state
  if (error && images.length === 0) {
    return (
      <div className="sidepanel-container">
        <div className="sidepanel-header">
          <h1>Hình Ảnh Bưu Gửi</h1>
        </div>
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <Alert
            message="Không thể tải hình ảnh"
            description={error}
            type="error"
            showIcon
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{ marginTop: 16 }}
          >
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  // Render empty state
  if (images.length === 0) {
    return (
      <div className="sidepanel-container">
        <div className="sidepanel-header">
          <h1>Hình Ảnh Bưu Gửi</h1>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-text">Chưa có hình ảnh nào</div>
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{ marginTop: 16 }}
          >
            Làm mới
          </Button>
        </div>
      </div>
    );
  }

  const selectedImage = images[selectedIndex];

  return (
    <div className="sidepanel-container">
      <div className="sidepanel-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Hình Ảnh Bưu Gửi ({images.length})</h1>
          <Space size="small">
            <Tooltip title="Xóa toàn bộ hình ảnh">
              <Button
                type="text"
                danger
                icon={<ClearOutlined />}
                onClick={handleClearAllImages}
                disabled={images.length === 0 || syncProgress.status === "syncing"}
                size="small"
              >
                Xóa tất cả
              </Button>
            </Tooltip>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={syncProgress.status === "syncing"}
              size="small"
            >
              Làm mới
            </Button>
          </Space>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", padding: "8px", background: "#f5f5f5", borderRadius: "6px" }}>
          <Space size="small">
            <Button
              type="default"
              icon={<LeftOutlined />}
              onClick={handlePreviousImage}
              disabled={selectedIndex === 0}
              size="small"
            >
              Trước
            </Button>
            <span style={{ fontSize: "14px", color: "#666" }}>
              {selectedIndex + 1} / {images.length}
            </span>
            <Button
              type="default"
              icon={<RightOutlined />}
              onClick={handleNextImage}
              disabled={selectedIndex === images.length - 1}
              size="small"
            >
              Sau
            </Button>
          </Space>
          <Space size="small">
            <span style={{ fontSize: "13px", color: "#595959" }}>Tự động zoom:</span>
            <Switch 
              checked={autoZoomEnabled} 
              onChange={handleToggleAutoZoom}
              size="small"
            />
            <Tooltip title="Đặt lại vị trí zoom mặc định">
              <Button
                type="default"
                icon={<UndoOutlined />}
                onClick={handleResetPresets}
                size="small"
              >
                Đặt lại
              </Button>
            </Tooltip>
          </Space>
        </div>
      </div>
      <div className="sidepanel-content">
        <div className="image-viewer-section">
          <ImageViewer ref={imageViewerRef} image={selectedImage} />
        </div>
        <div className="thumbnail-gallery-section">
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
