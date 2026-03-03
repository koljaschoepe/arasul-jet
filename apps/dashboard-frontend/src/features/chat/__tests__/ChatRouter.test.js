/**
 * ChatRouter Component Tests
 *
 * Tests fuer das Chat-Routing:
 * - Index-Route rendert ChatLanding
 * - :chatId-Route rendert ChatView
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ChatRouter from '../ChatRouter';

// Mock child components to isolate routing logic
jest.mock('../ChatLanding', () => {
  return function MockChatLanding() {
    return <div data-testid="chat-landing">ChatLanding</div>;
  };
});

jest.mock('../ChatView', () => {
  return function MockChatView() {
    return <div data-testid="chat-view">ChatView</div>;
  };
});

// Mock ChatContext provider (ChatLanding/ChatView need it, but they're mocked)
jest.mock('../../../contexts/ChatContext', () => ({
  ChatProvider: ({ children }) => <div>{children}</div>,
  useChatContext: () => ({}),
}));

function renderWithRouter(initialPath = '/chat') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/chat/*" element={<ChatRouter />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ChatRouter', () => {
  test('rendert ChatLanding auf /chat', () => {
    renderWithRouter('/chat');
    expect(screen.getByTestId('chat-landing')).toBeInTheDocument();
  });

  test('rendert ChatView auf /chat/:chatId', () => {
    renderWithRouter('/chat/42');
    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
  });

  test('rendert ChatLanding und nicht ChatView auf Index-Route', () => {
    renderWithRouter('/chat');
    expect(screen.getByTestId('chat-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  test('rendert ChatView und nicht ChatLanding auf Chat-Route', () => {
    renderWithRouter('/chat/1');
    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-landing')).not.toBeInTheDocument();
  });
});
