import React from 'react';

type ArchiveHintPopoverProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * A popover component to provide hints about the archive feature
 */
const ArchiveHintPopover: React.FC<ArchiveHintPopoverProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-30" onClick={onClose}></div>
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-xl p-5 max-w-md w-full shadow-xl z-10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <span className="material-icons text-amber-400">archive</span>
            Archive Feature
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors duration-200"
            aria-label="Close"
          >
            <span className="material-icons">close</span>
          </button>
        </div>
        
        <div className="space-y-3 text-gray-300">
          <p>
            The <span className="text-amber-400">Archive</span> feature lets you hide chats from your main chat list without deleting them.
          </p>
          <p>
            To archive a chat, right-click on it and select <span className="text-amber-400">Archive chat</span>.
          </p>
          <p>
            To view your archived chats, click the <span className="text-amber-400">archive</span> icon at the top of your chat list.
          </p>
          <p>
            You can unarchive a chat at any time by right-clicking it in the archive view and selecting <span className="text-amber-400">Unarchive chat</span>.
          </p>
        </div>
        
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg transition-colors duration-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveHintPopover;
