import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

export default function Signup() {
  const { signUp, confirmSignUp, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'signup' | 'confirm'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUp(email, password);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmSignUp(email, code);
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>{step === 'signup' ? 'Create an account' : 'Confirm your email'}</h1>
      </header>
      <div className="layout layout-single">
        <section className="panel form-panel">
          {step === 'signup' ? (
            <form onSubmit={handleSignUp}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Signing up…' : 'Sign up'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirm}>
              <p>We sent a confirmation code to {email}.</p>
              <div className="field">
                <label htmlFor="code">Confirmation code</label>
                <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              <div className="actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Confirming…' : 'Confirm'}
                </button>
              </div>
            </form>
          )}
          {error && <div className="error-box">{error}</div>}
          <p className="auth-links">
            <Link to="/login">Already have an account? Log in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
