import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import ProtectedRoute from './auth/ProtectedRoute.tsx';
import MemeGenerator from './components/MemeGenerator.tsx';
import MyMemes from './components/MyMemes.tsx';
import Login from './components/Login.tsx';
import Signup from './components/Signup.tsx';
import ForgotPassword from './components/ForgotPassword.tsx';
import { resolveApiUrl } from './components/StockPhotoPicker.tsx';
import type { StockPhoto } from './components/StockPhotoPicker.tsx';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

function Carousel() {
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/carousel-photo-assets`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: StockPhoto[]) => setPhotos(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (photos.length < 2) return;
    intervalRef.current = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % photos.length);
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [photos.length]);

  function goTo(index: number) {
    setCurrentIndex(index);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % photos.length);
    }, 5000);
  }

  if (photos.length === 0) return null;

  return (
    <div className="carousel-wrap">
      <div className="carousel-container">
        {photos.map((photo, i) => (
          <img
            key={photo.id}
            src={resolveApiUrl(photo.url)}
            alt={photo.id}
            className={`carousel-img${i === currentIndex ? ' active' : ''}`}
          />
        ))}
      </div>
      <div className="carousel-dots">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            className={`carousel-dot${i === currentIndex ? ' active' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`Show photo ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function HomePage() {
  const { idToken, loading } = useAuth();
  if (loading) return null;
  if (idToken) return <MemeGenerator />;
  return (
    <main className="page">
      <header className="header">
        <h1>Meme Generator</h1>
        <p>Upload an image, add text, generate a meme.</p>
      </header>
      <Carousel />
    </main>
  );
}

function NavBar() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="nav-bar">
      <Link to="/apps" className="nav-brand">Meme Generator</Link>
      <div className="nav-links">
        {email ? (
          <>
            <Link to="/">Generator</Link>
            <Link to="/my-memes">My Memes</Link>
            <button type="button" className="btn-secondary" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/memeapp" element={<HomePage />} />
          <Route path="/my-memes" element={<ProtectedRoute><MyMemes /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/memeapp/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
