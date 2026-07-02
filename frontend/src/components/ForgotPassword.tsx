import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

export default function ForgotPassword() {
  const { forgotPassword, confirmForgotPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmForgotPassword(email, code, newPassword);
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Reset password</h1>
      </header>
      <div className="layout layout-single">
        <section className="panel form-panel">
          {step === 'request' ? (
            <form onSubmit={handleRequest}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset code'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleReset}>
              <p>We sent a reset code to {email}.</p>
              <div className="field">
                <label htmlFor="code">Reset code</label>
                <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="newPassword">New password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            </form>
          )}
          {error && <div className="error-box">{error}</div>}
          <p className="auth-links">
            <Link to="/login">Back to log in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
