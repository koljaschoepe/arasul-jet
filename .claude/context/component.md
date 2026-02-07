# Context: Adding React Component

## Quick Reference

**Location:** `services/dashboard-frontend/src/components/`
**Pattern:** `ChatMulti.js` (complex), `Modal.js` (simple)
**Design System:** `docs/DESIGN_SYSTEM.md` (MANDATORY)

---

## Color Palette (ONLY these colors!)

```css
/* Primary Blue */
--primary: #45ADFF;
--primary-hover: #6EC4FF;
--primary-active: #2D8FD9;
--primary-muted: rgba(69, 173, 255, 0.15);

/* Backgrounds */
--bg-dark: #101923;
--bg-card: #1A2330;
--bg-hover: #222D3D;

/* Borders & Text */
--border: #2A3544;
--text-primary: #F8FAFC;
--text-secondary: #CBD5E1;
--text-muted: #94A3B8;

/* Status (ONLY when semantic) */
--success: #22C55E;
--warning: #F59E0B;
--error: #EF4444;
```

---

## Component Pattern

```jsx
// src/components/ExampleComponent.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './ExampleComponent.css';

function ExampleComponent({ onAction, initialValue }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/example', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="example-component">
      <h2 className="example-title">Example</h2>
      <div className="example-content">
        {data && <p>{data.name}</p>}
      </div>
      <button className="btn-primary" onClick={onAction}>
        Action
      </button>
    </div>
  );
}

export default ExampleComponent;
```

---

## CSS Pattern

```css
/* src/components/ExampleComponent.css */

.example-component {
  background: #1A2330;
  border: 1px solid #2A3544;
  border-radius: 12px;
  padding: 1.25rem;
}

.example-title {
  color: #F8FAFC;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.example-content {
  color: #CBD5E1;
}

/* Primary Button */
.btn-primary {
  background: #45ADFF;
  color: #000;
  border: none;
  border-radius: 6px;
  padding: 0.625rem 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #6EC4FF;
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #CBD5E1;
  border: 1px solid #2A3544;
  border-radius: 6px;
  padding: 0.625rem 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #222D3D;
  border-color: #45ADFF;
}

/* Input */
.input {
  background: #101923;
  border: 1px solid #2A3544;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #F8FAFC;
  width: 100%;
  transition: border-color 0.2s ease;
}

.input:focus {
  outline: none;
  border-color: #45ADFF;
  box-shadow: 0 0 0 3px rgba(69, 173, 255, 0.15);
}

/* Loading */
.loading {
  color: #94A3B8;
  text-align: center;
  padding: 2rem;
}

/* Error */
.error {
  color: #EF4444;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 1rem;
}
```

---

## Adding Route (if needed)

```jsx
// src/App.js
import ExampleComponent from './components/ExampleComponent';

// In routes:
<Route path="/example" element={
  <PrivateRoute>
    <ExampleComponent />
  </PrivateRoute>
} />
```

---

## Test Pattern

```jsx
// src/__tests__/ExampleComponent.test.js
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExampleComponent from '../components/ExampleComponent';

// Mock fetch
global.fetch = jest.fn();

describe('ExampleComponent', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  it('renders loading state initially', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<ExampleComponent />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders data after fetch', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { name: 'Test' } })
    });

    render(<ExampleComponent />);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
```

---

## Checklist

- [ ] Component created in `src/components/`
- [ ] CSS uses ONLY Design System colors
- [ ] Primary accent is #45ADFF
- [ ] Backgrounds are #101923 / #1A2330
- [ ] Hover/Focus states defined
- [ ] Transitions: `all 0.2s ease`
- [ ] Error handling implemented
- [ ] Loading state implemented
- [ ] Tests written
- [ ] Route added (if needed)
