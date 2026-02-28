import React, { useEffect, useState, useRef } from "react";
import { Card, Tooltip, Spin } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { StoredImage } from "../../types/vnpost";
import { revokeImageObjectURL } from "../utils/imageDB";

interface ThumbnailGalleryProps {
  images: StoredImage[];
  selectedIndex: number;
  onSelectImage: (index: number) => void;
  shouldScrollToSelected?: boolean; // Only scroll when explicitly requested
}

const ThumbnailGallery: React.FC<ThumbnailGalleryProps> = ({
  images,
  selectedIndex,
  onSelectImage,
  shouldScrollToSelected = false,
}) => {
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const thumbnailRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastScrolledIndexRef = useRef<number>(-1);
  const previousImagesRef = useRef<Set<string>>(new Set());

  // Hàm hỗ trợ tạo ảnh thu nhỏ từ Blob
  const generateMinimalThumbnail = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 150;
        let { width, height } = img;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = Math.round(MAX_SIZE);
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = Math.round(MAX_SIZE);
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        // Xuất ra base64 jpeg dung lượng thấp
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve("");
      };
      img.src = objUrl;
    });
  };

  // Create object URLs / base64 for thumbnails - OPTIMIZED with incremental updates
  useEffect(() => {
    const processUpdates = async () => {
      const currentImageIds = new Set(images.map(img => img.imageId));
      const previousImageIds = previousImagesRef.current;

      // Only process NEW images
      const newImages = images.filter(img => !previousImageIds.has(img.imageId));
      const removedImageIds = Array.from(previousImageIds).filter(id => !currentImageIds.has(id));

      if (newImages.length === 0 && removedImageIds.length === 0) {
        return;
      }

      // Xóa URL cũ (nếu có ObjectURL bị sót)
      if (removedImageIds.length > 0) {
        setThumbnailUrls(prevUrls => {
          const urlMap = new Map(prevUrls);
          removedImageIds.forEach(id => {
            const url = urlMap.get(id);
            if (url && url.startsWith("blob:")) {
              revokeImageObjectURL(url);
            }
            urlMap.delete(id);
          });
          return urlMap;
        });
      }

      // Xử lý tạo ảnh minimal cho các mảng ảnh mới
      newImages.forEach(async (image) => {
        let finalUrl = "";
        if (image.blob) {
          // Tạo bản thu nhỏ từ blob gốc
          finalUrl = await generateMinimalThumbnail(image.blob);
        }

        if (finalUrl) {
          setThumbnailUrls(prev => {
            const up = new Map(prev);
            up.set(image.imageId, finalUrl);
            return up;
          });
        }
      });

      previousImagesRef.current = currentImageIds;
    };

    processUpdates();

    return () => {
      // Dọn dẹp object url khi unmount (nếu vẫn còn lưu blob: do version cũ)
      setThumbnailUrls(prev => {
        prev.forEach(url => {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        });
        return prev;
      });
    };
  }, [images]);

  // Auto-scroll to selected thumbnail ONLY when explicitly requested
  useEffect(() => {
    if (!shouldScrollToSelected) {
      // Don't scroll during progressive updates
      return;
    }

    if (lastScrolledIndexRef.current === selectedIndex) {
      // Already scrolled to this index
      return;
    }

    const selectedElement = thumbnailRefs.current.get(selectedIndex);
    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
      lastScrolledIndexRef.current = selectedIndex;
      console.log(`[ThumbnailGallery] 📜 Scrolled to thumbnail ${selectedIndex}`);
    }
  }, [selectedIndex, shouldScrollToSelected]);

  if (images.length === 0) {
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
        Không có hình ảnh
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "12px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
        gap: "12px",
        height: "max-content", // Thêm thuộc tính này để container kéo dài theo content
      }}
    >
      {images.map((image, index) => {
        const isSelected = index === selectedIndex;
        const thumbnailUrl = thumbnailUrls.get(image.imageId);

        return (
          <Tooltip
            key={image.imageId}
            title={
              <div>
                <div>Mã hiệu: {image.maHieu || "Chưa xử lý"}</div>
                <div>
                  Thời gian: {new Date(image.timestamp).toLocaleString("vi-VN")}
                </div>
              </div>
            }
            placement="top"
          >
            <div
              ref={(el) => {
                if (el) {
                  thumbnailRefs.current.set(index, el);
                } else {
                  thumbnailRefs.current.delete(index);
                }
              }}
              style={{ position: "relative" }}
            >
              <Card
                hoverable
                onClick={() => onSelectImage(index)}
                style={{
                  border: isSelected ? "2px solid #1890ff" : "1px solid #d9d9d9",
                  borderRadius: "8px",
                  padding: 0,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: isSelected
                    ? "0 4px 12px rgba(24, 144, 255, 0.3)"
                    : "0 2px 8px rgba(0, 0, 0, 0.1)",
                }}
              >
                {/* Thumbnail Image */}
                <div
                  style={{
                    width: "100%",
                    height: "100px",
                    background: thumbnailUrl ? "#f0f0f0" : "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={image.maHieu || `Image ${index + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div style={{
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <Spin
                        indicator={<LoadingOutlined style={{ fontSize: 24, color: "#1890ff" }} spin />}
                      />
                      <div style={{ color: "#8c8c8c", fontSize: "11px" }}>
                        Đang tải...
                      </div>
                    </div>
                  )}
                </div>

                {/* Image Info */}
                <div
                  style={{
                    padding: "8px",
                    background: isSelected ? "#e6f7ff" : "#fff",
                    borderTop: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isSelected ? "#1890ff" : "#262626",
                      marginBottom: "4px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    #{index + 1}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#8c8c8c",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {image.maHieu || "Chưa xử lý"}
                  </div>
                </div>
              </Card>

              {/* Badge icon positioned absolutely */}
              <div style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                fontSize: "18px",
                zIndex: 1
              }}>
                {image.processed ? (
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                ) : (
                  <ClockCircleOutlined style={{ color: "#faad14" }} />
                )}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(ThumbnailGallery, (prevProps, nextProps) => {
  // Only re-render if these props actually changed
  return (
    prevProps.selectedIndex === nextProps.selectedIndex &&
    prevProps.shouldScrollToSelected === nextProps.shouldScrollToSelected &&
    prevProps.images.length === nextProps.images.length &&
    prevProps.onSelectImage === nextProps.onSelectImage
  );
});
