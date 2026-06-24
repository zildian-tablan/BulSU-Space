import React from 'react';
import type { IMessage } from '../types';

type DeleteMessageDialogProps = {
  message: IMessage;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onClose: () => void;
};

const DeleteMessageDialog: React.FC<DeleteMessageDialogProps> = ({
  message,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1e1e1e] rounded-xl max-w-sm w-full shadow-xl overflow-hidden">
        <div className="p-5">
          <h3 className="text-lg font-bold text-white mb-2">Delete Message</h3>
          <p className="text-gray-300 text-sm mb-6">How would you like to delete this message?</p>

          <div className="space-y-3">
            <button
              onClick={onDeleteForMe}
              className="w-full p-3 bg-[#2a2a2a] hover:bg-[#333] rounded-lg text-left flex items-center gap-3 transition-colors"
            >
              <span className="material-icons text-gray-400">delete</span>
              <div>
                <div className="text-white font-medium">Delete for me</div>
                <div className="text-gray-400 text-xs">Remove this message only for you</div>
              </div>
            </button>

            <button
              onClick={onDeleteForEveryone}
              className="w-full p-3 bg-[#2a2a2a] hover:bg-[#333] rounded-lg text-left flex items-center gap-3 transition-colors"
            >
              <span className="material-icons text-red-500">delete_forever</span>
              <div>
                <div className="text-white font-medium">Delete for everyone</div>
                <div className="text-gray-400 text-xs">
                  Remove this message for all conversation participants
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="border-t border-gray-800 p-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteMessageDialog;
