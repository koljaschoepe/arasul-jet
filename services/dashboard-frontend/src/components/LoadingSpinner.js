import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ message = 'Laden...', fullscreen = false }) => {
  const containerClass = fullscreen ? 'loading-spinner-fullscreen' : 'loading-spinner-inline';

  return (
    <div className={containerClass}>
      <div className="spinner-animation">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
