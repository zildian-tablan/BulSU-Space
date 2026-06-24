import React, { createContext, useContext, useState } from 'react';

interface SidebarContextType {
  activeTab: string;
  isOpen: boolean;
  setActiveTab: (tab: string) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  mobileOverlayOpen: boolean;
  openMobileOverlay: () => void;
  closeMobileOverlay: () => void;
  toggleMobileOverlay: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState<boolean>(false);

  const toggleSidebar = () => {
    setIsOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  const openMobileOverlay = () => setMobileOverlayOpen(true);
  const closeMobileOverlay = () => setMobileOverlayOpen(false);
  const toggleMobileOverlay = () => setMobileOverlayOpen((s) => !s);

  return (
    <SidebarContext.Provider
      value={{
        activeTab,
        isOpen,
        setActiveTab,
        toggleSidebar,
        closeSidebar,
        mobileOverlayOpen,
        openMobileOverlay,
        closeMobileOverlay,
        toggleMobileOverlay,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
