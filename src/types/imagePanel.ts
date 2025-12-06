/**
 * Type definitions for Image Panel feature
 */

export interface UploadedImage {
  url: string;
  sequenceNumber: number;
  captureTime: string;
  fileName: string;
  qrCode: string;
}

export interface UploadedImagesData {
  timestamp: number;
  images: {
    [key: string]: UploadedImage;
  };
}

export interface ZoomPreset {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: number;
}

export interface ImageZoomSettings {
  imageUrl: string;
  qrCode?: string;
  fieldGroup: FieldGroup;
  preset: ZoomPreset;
  lastUpdated: number;
}

export type FieldGroup = 'TT_NUMBER' | 'RECEIVER_INFO' | 'WEIGHT' | 'MONEY';

export interface ImagePanelState {
  isOpen: boolean;
  currentImageIndex: number;
  images: UploadedImage[];
  zoomSettings: Map<string, ImageZoomSettings>;
}
