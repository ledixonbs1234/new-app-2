import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Button, Space, Tooltip } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { StoredImage } from "../../types/vnpost";
import { createImageObjectURL, revokeImageObjectURL } from "../utils/imageDB";

// Định nghĩa cấu trúc Preset
interface ZoomPreset {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
}

interface ImageViewerProps {
  image: StoredImage | null;
  // Callback bắn lên cha khi user thay đổi góc nhìn
  onTransformChange?: (preset: ZoomPreset) => void;
}

export interface ImageViewerHandle {
  applyZoomPreset: (preset: ZoomPreset) => void;
  getCurrentZoom: () => ZoomPreset;
  resetToDefault: () => void;
}

const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(({ image, onTransformChange }, ref) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Cờ để chặn callback onTransformChange khi đang apply preset bằng code
  // Tránh việc vừa apply xong lại trigger lưu đè lại
  const isApplyingPresetRef = useRef<boolean>(false);

  // 1. Tạo Object URL từ Blob
  useEffect(() => {
    if (image?.blob) {
      const url = createImageObjectURL(image.blob);
      setImageUrl(url);

      return () => {
        revokeImageObjectURL(url);
      };
    } else {
      setImageUrl(null);
    }
  }, [image]);

  // 2. THEO DÕI THAY ĐỔI VÀ GỌI CALLBACK LÊN CHA
  useEffect(() => {
    if (onTransformChange && !isApplyingPresetRef.current) {
      onTransformChange({ zoom, pan, rotation });
    }
  }, [zoom, pan, rotation, onTransformChange]);

  // 3. Public methods ra ngoài qua Ref
  useImperativeHandle(ref, () => ({
    applyZoomPreset: (preset: ZoomPreset) => {
      isApplyingPresetRef.current = true; // Bật cờ chặn
      setZoom(preset.zoom);
      setPan(preset.pan);
      setRotation(preset.rotation);
      
      // Tắt cờ chặn sau 1 khoảng thời gian ngắn
      setTimeout(() => {
        isApplyingPresetRef.current = false;
      }, 200);
    },
    getCurrentZoom: () => {
      return { zoom, pan, rotation };
    },
    resetToDefault: () => {
      isApplyingPresetRef.current = true;
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setTimeout(() => {
        isApplyingPresetRef.current = false;
      }, 200);
    }
  }), [zoom, pan, rotation]);

  // --- Logic Zoom/Pan/Rotate ---
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 1));
  const handleRotateLeft = () => setRotation((prev) => (prev - 90) % 360);
  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360);
  
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    // e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((prev) => Math.max(1, Math.min(5, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      e.preventDefault();
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);
  const handleDragStart = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  // --- Render ---
  if (!image || !imageUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8c8c8c" }}>
        Chọn hình ảnh để xem
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#fafafa",
      }}
    >
      {/* Controls */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 10,
          background: "rgba(255, 255, 255, 0.95)",
          padding: "8px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        }}
      >
        <Space direction="vertical" size="small">
          <Tooltip title="Phóng to" placement="left">
            <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} size="small" disabled={zoom >= 5} />
          </Tooltip>
          <Tooltip title="Thu nhỏ" placement="left">
            <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} size="small" disabled={zoom <= 1} />
          </Tooltip>
          <Tooltip title="Xoay trái" placement="left">
            <Button icon={<RotateLeftOutlined />} onClick={handleRotateLeft} size="small" />
          </Tooltip>
          <Tooltip title="Xoay phải" placement="left">
            <Button icon={<RotateRightOutlined />} onClick={handleRotateRight} size="small" />
          </Tooltip>
          <Tooltip title="Đặt lại" placement="left">
            <Button icon={<UndoOutlined />} onClick={handleReset} size="small" />
          </Tooltip>
        </Space>
      </div>

      {/* Info Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 10,
          background: "rgba(0, 0, 0, 0.75)",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "12px",
          maxWidth: "calc(100% - 24px)",
        }}
      >
        <div style={{ fontWeight: 600 }}>{image.maHieu || "Chưa xử lý"}</div>
        <div style={{ opacity: 0.8, marginTop: 4 }}>
          Zoom: {(zoom * 100).toFixed(0)}% | Xoay: {rotation}°
        </div>
      </div>

      {/* Image Container */}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDragStart={handleDragStart}
      >
        <img
          src={imageUrl}
          alt={image.maHieu || "Image"}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.2s ease-out",
            userSelect: "none",
            pointerEvents: "none",
          }}
          draggable={false}
          onDragStart={handleDragStart}
        />
      </div>
    </div>
  );
});

ImageViewer.displayName = "ImageViewer";

export default ImageViewer;