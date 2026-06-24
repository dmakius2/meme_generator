import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export interface StockPhoto {
  id: string;
  url: string;
}

export function resolveApiUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

interface StockPhotoPickerProps {
  selectedId: string | null;
  onSelect: (photo: StockPhoto) => void;
}

export default function StockPhotoPicker({ selectedId, onSelect }: StockPhotoPickerProps) {
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/stock-photo-assets`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load stock photos');
        return res.json();
      })
      .then((data: StockPhoto[]) => {
        if (!cancelled) setPhotos(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="stock-photos-error">{error}</p>;
  if (photos.length === 0) return null;

  return (
    <div className="stock-photo-grid">
      {photos.map((photo) => (
        <button
          key={photo.id}
          type="button"
          className={`stock-photo-thumb ${selectedId === photo.id ? 'selected' : ''}`}
          onClick={() => onSelect(photo)}
        >
          <img src={resolveApiUrl(photo.url)} alt={photo.id} />
        </button>
      ))}
    </div>
  );
}
