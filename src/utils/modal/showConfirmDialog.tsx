// utils/showConfirmDialog.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import ConfirmDialog from "../../components/common/ConfirmDialog"; // adjust path

interface ShowConfirmDialogOptions {
  title?: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "danger" | "primary" | "neutral";
  headerTone?: "danger" | "primary" | "success" | "neutral";
  showCancel?: boolean; // optional to hide cancel button
  onConfirm?: () => void; // new optional callback
  onCancel?: () => void;  // new optional callback
}

export function showConfirmDialog({
  title = "Please confirm",
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  confirmTone = "primary",
  headerTone = "danger",
  showCancel = true,
  onConfirm,
  onCancel
}: ShowConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    const handleConfirm = () => {
      cleanup();
      onConfirm?.(); // call the optional callback
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      onCancel?.(); // call the optional callback
      resolve(false);
    };

    root.render(
      <ConfirmDialog
        open={true}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        confirmTone={confirmTone}
        headerTone={headerTone}
        showCancel={showCancel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  });
}
