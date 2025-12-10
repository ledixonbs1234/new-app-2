# Side Panel Image Viewer

Chrome extension side panel for viewing and managing imported images from Firebase.

## Features

- **Image Viewer**: Display images with zoom, pan, and rotate controls
- **Thumbnail Gallery**: Grid view of all images with tracking numbers (mã hiệu)
- **IndexedDB Caching**: Download and store images locally for offline access
- **Firebase Sync**: Real-time sync from `/PORTAL/CHILD/maychu/imported_images`
- **Responsive Controls**: Mouse wheel zoom, drag to pan
- **Status Indicators**: Visual badges for processed/unprocessed images

## Architecture

```
src/sidepanel/
├── index.tsx                 # Entry point
├── SidePanel.tsx            # Main component
├── sidepanel.css            # Styles
├── components/
│   ├── ImageViewer.tsx      # Image display with zoom/rotate/pan
│   └── ThumbnailGallery.tsx # Thumbnail grid
└── utils/
    ├── imageDB.ts           # IndexedDB wrapper
    └── firebaseSync.ts      # Firebase sync logic
```

## Usage

1. **Build the extension**: `npm run build`
2. **Open side panel**: Click extension icon or use keyboard shortcut
3. **Images load automatically** from Firebase on panel open
4. **Click thumbnails** to view full image
5. **Use controls** to zoom, rotate, pan

## Controls

- **Zoom In/Out**: Click buttons or mouse wheel
- **Rotate**: 90° increments left/right
- **Pan**: Drag image when zoomed
- **Reset**: Return to default view
- **Refresh**: Resync from Firebase

## Data Flow

1. Panel opens → Initialize IndexedDB
2. Load cached images (if any) → Display immediately
3. Fetch metadata from Firebase `/PORTAL/CHILD/maychu/imported_images`
4. Download image blobs from Firebase Storage URLs
5. Save to IndexedDB → Update display
6. Show progress: `downloaded / total` images

## Firebase Data Structure

```json
{
  "PORTAL": {
    "CHILD": {
      "maychu": {
        "imported_images": {
          "image-id-1": {
            "maHieu": "CB594676502VN",
            "processed": true,
            "timestamp": 1765089564871,
            "uploadedAt": 1765089597425,
            "url": "https://firebasestorage.googleapis.com/..."
          }
        }
      }
    }
  }
}
```

## IndexedDB Schema

**Database**: `ImagePanelDB`

**Object Stores**:
- `images`: Stores image data and blobs
  - keyPath: `imageId`
  - indexes: `timestamp`, `maHieu`
- `metadata`: Stores app state
  - keyPath: `key`

## TypeScript Interfaces

```typescript
interface ImportedImage {
  imageId: string;
  maHieu: string;
  processed: boolean;
  timestamp: number;
  uploadedAt: number;
  url: string;
}

interface StoredImage extends ImportedImage {
  blob?: Blob;
  objectUrl?: string;
}
```

## Performance

- Images downloaded in parallel
- Object URLs created on-demand
- Automatic cleanup on unmount
- Progress tracking during sync

## Error Handling

- Failed downloads: Save metadata only, retry on refresh
- Network errors: Show error alert with retry button
- Empty state: Display helpful message
- Loading state: Spinner with progress counter

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build
```

## Manifest Configuration

```json
{
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "permissions": [
    "sidePanel",
    "storage",
    "unlimitedStorage"
  ]
}
```

## Webpack Entry Point

```javascript
entry: {
  sidepanel: path.resolve('./src/sidepanel/index.tsx'),
}
```

## Future Enhancements

- [ ] Keyboard shortcuts (arrow keys for navigation)
- [ ] Image search/filter by mã hiệu
- [ ] Batch operations (mark multiple as processed)
- [ ] Export images as PDF/ZIP
- [ ] Real-time Firebase listener for new images
- [ ] Panel width persistence (resizable)
