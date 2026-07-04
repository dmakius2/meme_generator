import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { authFetch } from '../lib/api.ts';
import { resolveApiUrl } from './StockPhotoPicker.tsx';

interface Meme {
  meme_id: string;
  image_url: string;
  top_text: string;
  bottom_text: string;
  created_at: number;
}

export default function MyMemes() {
  const { idToken } = useAuth();
  const [memes, setMemes] = useState<Meme[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken) return;
    authFetch('/memes', idToken)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load memes');
        return res.json();
      })
      .then(setMemes)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [idToken]);

  async function handleDelete(memeId: string) {
    if (!idToken) return;
    setDeletingId(memeId);
    try {
      const res = await authFetch(`/memes/${memeId}`, idToken, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete meme');
      setMemes((prev) => prev.filter((m) => m.meme_id !== memeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>My Memes</h1>
      </header>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p>Loading…</p>
      ) : memes.length === 0 ? (
        <div className="empty-state">
          <span>You haven't created any memes yet.</span>
        </div>
      ) : (
        <div className="my-memes-grid">
          {memes.map((meme) => (
            <div key={meme.meme_id} className="my-meme-card">
              <img src={resolveApiUrl(meme.image_url)} alt="Meme" className="meme-img" />
              <p className="my-meme-date">{new Date(meme.created_at * 1000).toLocaleString()}</p>
              <div className="my-meme-actions">
                <a
                  href={resolveApiUrl(meme.image_url)}
                  download="meme.jpg"
                  className="download-link"
                >
                  Download
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={deletingId === meme.meme_id}
                  onClick={() => handleDelete(meme.meme_id)}
                >
                  {deletingId === meme.meme_id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
