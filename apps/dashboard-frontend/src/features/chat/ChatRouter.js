import { Routes, Route } from 'react-router-dom';
import ChatLanding from './ChatLanding';
import ChatView from './ChatView';

export default function ChatRouter() {
  return (
    <Routes>
      <Route index element={<ChatLanding />} />
      <Route path=":chatId" element={<ChatView />} />
    </Routes>
  );
}
