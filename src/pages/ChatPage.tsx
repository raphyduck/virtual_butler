/**
 * ChatPage.tsx
 *
 * Root page component.
 *
 * Layout (full viewport, no scroll on the outer shell):
 * ┌────────────────────────────────────────────┐
 * │  Sidebar (260 px, desktop) │  ChatArea      │
 * │  — fixed left column —     │  — flex-1 —    │
 * └────────────────────────────────────────────┘
 *
 * On mobile the Sidebar slides in as a drawer over the ChatArea.
 */

import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";

const ChatPage: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    /*
     * h-screen + overflow-hidden on the outer shell ensures the page
     * always fills the full viewport and that neither column can cause
     * the body to scroll. Each column manages its own internal scroll.
     */
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left column: chat session list */}
      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Right column: active chat thread */}
      <ChatArea onOpenSidebar={() => setSidebarOpen(true)} />
    </div>
  );
};

export default ChatPage;
