import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ChatPage } from "@/pages/ChatPage";
import { HomePage } from "@/pages/HomePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="chat/:id" element={<ChatPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
