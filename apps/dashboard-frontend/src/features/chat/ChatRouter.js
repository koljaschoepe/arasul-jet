import { Routes, Route, Navigate } from 'react-router-dom';
import ChatLanding from './ChatLanding';
import ChatView from './ChatView';

function ChatIndexRedirect() {
  const lastChatId = localStorage.getItem('arasul_last_chat_id');
  if (lastChatId) {
    return <Navigate to={`/chat/${lastChatId}`} replace />;
  }
  return <ChatLanding />;
}

export default function ChatRouter() {
  return (
    <Routes>
      <Route index element={<ChatIndexRedirect />} />
      <Route path=":chatId" element={<ChatView />} />
    </Routes>
  );
}
