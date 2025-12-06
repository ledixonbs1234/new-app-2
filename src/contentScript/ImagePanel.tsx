/**
 * Image Panel Component
 * Displays uploaded images with zoom, rotate, and thumbnail features
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UploadedImage, ZoomPreset, FieldGroup } from '../types/imagePanel';
import { imageDB } from './imageDB';
import '../asserts/tailwind.css';

interface ImagePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentFieldGroup: FieldGroup | null;
}

const ImagePanel: React.FC<ImagePanelProps> = ({ isOpen, onClose, currentFieldGroup }) => {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load images from IndexedDB
  useEffect(() => {
    const loadImages = async () => {
      try {
        const loadedImages = await imageDB.getImages();
        setImages(loadedImages);
        if (loadedImages.length > 0 && currentIndex >= loadedImages.length) {
          setCurrentIndex(0);
        }
      } catch (error) {
        console.error('[ImagePanel] Error loading images:', error);
      }
    };

    if (isOpen) {
      loadImages();
    }
  }, [isOpen]);

  // Load zoom preset when image or field group changes
  useEffect(() => {
    const loadZoomPreset = async () => {
      if (images.length === 0 || !currentFieldGroup) return;

      const currentImage = images[currentIndex];
      if (!currentImage) return;

      try {
        // Try to load by QR code first (Plan A)
        let preset = await imageDB.getZoomSettingByQrCode(currentImage.qrCode, currentFieldGroup);
        
        // Fallback to image URL (Plan B)
        if (!preset) {
          preset = await imageDB.getZoomSetting(currentImage.url, currentFieldGroup);
        }

        if (preset) {
          setZoomPreset(preset);
        } else {
          // Reset to default if no preset found
          setZoomPreset({ scale: 1, translateX: 0, translateY: 0, rotation: 0 });
        }
      } catch (error) {
        console.error('[ImagePanel] Error loading zoom preset:', error);
      }
    };

    loadZoomPreset();
  }, [currentIndex, currentFieldGroup, images]);

  // Auto-save zoom preset with debounce
  const saveZoomPreset = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (images.length === 0 || !currentFieldGroup) return;

      const currentImage = images[currentIndex];
      if (!currentImage) return;

      try {
        await imageDB.saveZoomSetting({
          imageUrl: currentImage.url,
          qrCode: currentImage.qrCode,
          fieldGroup: currentFieldGroup,
          preset: zoomPreset,
          lastUpdated: Date.now(),
        });
        console.log('[ImagePanel] Zoom preset saved:', currentFieldGroup);
      } catch (error) {
        console.error('[ImagePanel] Error saving zoom preset:', error);
      }
    }, 5000); // 5 second debounce
  }, [images, currentIndex, currentFieldGroup, zoomPreset]);

  // Trigger save when zoom preset changes
  useEffect(() => {
    saveZoomPreset();
  }, [zoomPreset, saveZoomPreset]);

  const handleZoomIn = () => {
    setZoomPreset(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
  };

  const handleZoomOut = () => {
    setZoomPreset(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.5) }));
  };

  const handleRotate = () => {
    setZoomPreset(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
  };

  const handleReset = () => {
    setZoomPreset({ scale: 1, translateX: 0, translateY: 0, rotation: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - zoomPreset.translateX, y: e.clientY - zoomPreset.translateY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setZoomPreset(prev => ({
      ...prev,
      translateX: e.clientX - dragStart.x,
      translateY: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomPreset(prev => ({ ...prev, scale: Math.min(Math.max(prev.scale * delta, 0.5), 5) }));
  };

  const selectImage = (index: number) => {
    setCurrentIndex(index);
  };

  if (!isOpen) return null;

  const currentImage = images[currentIndex];

  return (
    <div 
      className="fixed top-0 right-0 h-full bg-white shadow-lg border-l border-gray-300 z-[10000]"
      style={{ width: '500px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-300 bg-gray-50">
        <h3 className="text-lg font-semibold">
          Image Viewer {currentImage && `(${currentIndex + 1}/${images.length})`}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
        >
          ×
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
        <button
          onClick={handleZoomIn}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={handleRotate}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          title="Rotate"
        >
          ↻
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
          title="Reset"
        >
          Reset
        </button>
        <span className="ml-auto text-sm text-gray-600">
          {currentImage && `QR: ${currentImage.qrCode}`}
        </span>
      </div>

      {/* Main Image Display */}
      <div
        ref={imageContainerRef}
        className="relative overflow-hidden bg-gray-100"
        style={{ height: 'calc(100% - 300px)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {currentImage ? (
          <img
            src={currentImage.url}
            alt={currentImage.fileName}
            className="absolute top-1/2 left-1/2 max-w-none cursor-move"
            style={{
              transform: `translate(-50%, -50%) translate(${zoomPreset.translateX}px, ${zoomPreset.translateY}px) scale(${zoomPreset.scale}) rotate(${zoomPreset.rotation}deg)`,
              transformOrigin: 'center',
            }}
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No image available
          </div>
        )}
      </div>

      {/* Thumbnails */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-300" style={{ height: '200px' }}>
        <div className="p-2 text-sm font-semibold text-gray-700 border-b border-gray-200">
          Thumbnails
        </div>
        <div className="flex gap-2 p-2 overflow-x-auto" style={{ height: 'calc(100% - 32px)' }}>
          {images.map((img, idx) => (
            <div
              key={img.url}
              onClick={() => selectImage(idx)}
              className={`relative flex-shrink-0 cursor-pointer border-2 rounded overflow-hidden ${
                idx === currentIndex ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{ width: '120px', height: '150px' }}
            >
              <img
                src={img.url}
                alt={img.fileName}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 text-center">
                #{img.sequenceNumber}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImagePanel;
