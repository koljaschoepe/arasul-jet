import React, { useState } from 'react';
import { API_BASE } from '../config/api';
import './Login.css';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check your credentials and try again.');
      }

      // Store token in localStorage
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));

      // Call success callback
      onLoginSuccess(data);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>Arasul Platform</h1>
          <p>Edge AI Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div id="login-error" className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
              autoFocus
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading || !username || !password}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Default username: <strong>admin</strong>
          </p>
          <p className="login-help">
            Password was displayed during bootstrap. Check system logs if forgotten.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
