import { useState, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import StockPhotoPicker, { resolveApiUrl } from './StockPhotoPicker.tsx';
import type { StockPhoto } from './StockPhotoPicker.tsx';
import { useAuth } from '../auth/AuthContext.tsx';
import { authFetch, downloadFile } from '../lib/api.ts';

export default function MemeGenerator() {
  const { idToken } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedStockPhoto, setSelectedStockPhoto] = useState<StockPhoto | null>(null);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [memeUrl, setMemeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setSelectedStockPhoto(null);
    setMemeUrl(null);
    setError(null);
  }

  async function handleDownload() {
    if (!memeUrl) return;
    try {
      await downloadFile(memeUrl, 'meme.jpg');
    } catch {
      setError('Failed to download meme');
    }
  }

  function handleStockPhotoSelect(photo: StockPhoto) {
    setSelectedStockPhoto(photo);
    setImageFile(null);
    setImagePreview(resolveApiUrl(photo.url));
    setMemeUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!imageFile && !selectedStockPhoto) return;

    setLoading(true);
    setError(null);
    setMemeUrl(null);

    const formData = new FormData();
    if (imageFile) {
      formData.append('image', imageFile);
    } else if (selectedStockPhoto) {
      formData.append('stock_photo_id', selectedStockPhoto.id);
    }
    formData.append('top_text', topText);
    formData.append('bottom_text', bottomText);

    if (!idToken) {
      setError('You must be logged in to generate a meme.');
      setLoading(false);
      return;
    }

    console.log('[generate] idToken present:', !!idToken);
    console.log('[generate] idToken prefix:', idToken.slice(0, 30) + '...');
    console.log('[generate] imageFile:', imageFile?.name ?? null);
    console.log('[generate] selectedStockPhoto:', selectedStockPhoto?.id ?? null);

    try {
      console.log('[generate] calling authFetch -> POST /generate');
      const res = await authFetch('/generate', idToken, {
        method: 'POST',
        body: formData,
      });
      console.log('[generate] response status:', res.status, res.ok);

      if (!res.ok) {
        const detail = await res.text();
        console.log('[generate] error body:', detail);
        throw new Error(detail || 'Server error');
      }

      const data = await res.json();
      console.log('[generate] success, url:', data.url);
      setMemeUrl(resolveApiUrl(data.url));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log('[generate] caught error:', message);
      setError(message === 'Failed to fetch'
        ? 'Could not reach the backend. Is it running on port 8000?'
        : message
      );
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setImageFile(null);
    setImagePreview(null);
    setSelectedStockPhoto(null);
    setTopText('');
    setBottomText('');
    setMemeUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Meme Generator</h1>
        <p>Upload an image, add text, generate a meme.</p>
      </header>

      <div className="layout">
        <section className="panel form-panel">
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="image-upload">Upload an image</label>
              <input
                id="image-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>

            <div className="field">
              <label>Or pick a stock photo</label>
              <StockPhotoPicker
                selectedId={selectedStockPhoto?.id ?? null}
                onSelect={handleStockPhotoSelect}
              />
            </div>

            <div className="field">
              <label htmlFor="top-text">Top Text</label>
              <input
                id="top-text"
                type="text"
                value={topText}
                onChange={(e) => setTopText(e.target.value)}
                placeholder="TOP TEXT"
                maxLength={80}
              />
            </div>

            <div className="field">
              <label htmlFor="bottom-text">Bottom Text</label>
              <input
                id="bottom-text"
                type="text"
                value={bottomText}
                onChange={(e) => setBottomText(e.target.value)}
                placeholder="BOTTOM TEXT"
                maxLength={80}
              />
            </div>

            <div className="actions">
              <button type="submit" className="btn-primary" disabled={(!imageFile && !selectedStockPhoto) || loading}>
                {loading ? 'Generating…' : 'Generate Meme'}
              </button>
              {(imageFile || selectedStockPhoto || memeUrl) && (
                <button type="button" className="btn-secondary" onClick={handleReset}>
                  Reset
                </button>
              )}
            </div>
          </form>

          {error && <div className="error-box">{error}</div>}
        </section>

        <section className="panel preview-panel">
          {memeUrl ? (
            <>
              <p className="preview-label">Generated Meme</p>
              <img src={memeUrl} alt="Generated meme" className="meme-img" />
              <button type="button" onClick={handleDownload} className="download-link">
                Download
              </button>
            </>
          ) : imagePreview ? (
            <>
              <p className="preview-label">Preview</p>
              <img src={imagePreview} alt="Upload preview" className="meme-img preview-dim" />
            </>
          ) : (
            <div className="empty-state">
              <span>Your meme will appear here</span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
