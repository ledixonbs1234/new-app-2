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

interface ImageViewerProps {
  image: StoredImage | null;
}

interface ZoomPreset {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
}

export interface ImageViewerHandle {
  applyZoomPreset: (preset: ZoomPreset) => void;
  getCurrentZoom: () => ZoomPreset;
}

const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(({ image }, ref) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create object URL from blob ONLY (never use Firebase URL directly)
  useEffect(() => {
    if (image?.blob) {
      const url = createImageObjectURL(image.blob);
      setImageUrl(url);

      return () => {
        revokeImageObjectURL(url);
      };
    } else {
      // Don't use image.url - wait for blob to download
      setImageUrl(null);
    }
  }, [image]);

  // Note: Image change reset is now controlled by parent (SidePanel)
  // based on autoZoomEnabled state

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    applyZoomPreset: (preset: ZoomPreset) => {
      setZoom(preset.zoom);
      setPan(preset.pan);
      setRotation(preset.rotation);
      console.log("[ImageViewer] Applied zoom preset:", preset);
    },
    getCurrentZoom: () => {
      return { zoom, pan, rotation };
    },
    resetToDefault: () => {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      console.log("[ImageViewer] Reset to default view");
    }
  }), [zoom, pan, rotation]);

  // Zoom in/out
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 1));
  };

  // Rotate
  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90) % 360);
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Reset view
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((prev) => Math.max(1, Math.min(5, prev + delta)));
  };

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault(); // Ngăn default drag behavior
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      e.preventDefault(); // Ngăn default drag behavior
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Ngăn chặn drag event mặc định của browser
  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!image || !imageUrl) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#8c8c8c",
        }}
      >
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
            <Button
              icon={<ZoomInOutlined />}
              onClick={handleZoomIn}
              size="small"
              disabled={zoom >= 5}
            />
          </Tooltip>
          <Tooltip title="Thu nhỏ" placement="left">
            <Button
              icon={<ZoomOutOutlined />}
              onClick={handleZoomOut}
              size="small"
              disabled={zoom <= 1}
            />
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

      {/* Image info */}
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
        <div style={{ fontWeight: 600 }}>
          {image.maHieu || "Chưa xử lý"}
        </div>
        <div style={{ opacity: 0.8, marginTop: 4 }}>
          Zoom: {(zoom * 100).toFixed(0)}% | Xoay: {rotation}°
        </div>
      </div>

      {/* Image container */}
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
