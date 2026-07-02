import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import ProtectedRoute from './auth/ProtectedRoute.tsx';
import MemeGenerator from './components/MemeGenerator.tsx';
import MyMemes from './components/MyMemes.tsx';
import Login from './components/Login.tsx';
import Signup from './components/Signup.tsx';
import ForgotPassword from './components/ForgotPassword.tsx';

function NavBar() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="nav-bar">
      <Link to="/" className="nav-brand">Meme Generator</Link>
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
          <Route path="/" element={<ProtectedRoute><MemeGenerator /></ProtectedRoute>} />
          <Route path="/my-memes" element={<ProtectedRoute><MyMemes /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
