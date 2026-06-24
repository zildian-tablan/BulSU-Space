import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, where, Timestamp, arrayUnion } from 'firebase/firestore';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

// Test component to verify read receipts functionality
const ReadReceiptTest: React.FC = () => {
  const [testMessage, setTestMessage] = useState<any>(null);
  const [readByCurrentUser, setReadByCurrentUser] = useState(false);
  const userId = auth.currentUser?.uid;

  // Setup test message
  useEffect(() => {
    if (!userId) return;

    // Create a test message collection
    const testMessagesCollection = collection(db, 'testMessages');
    
    // Create a test message if none exists
    const setupTestMessage = async () => {
      // Check if we already have a test message
      const q = query(testMessagesCollection, where('isTestMessage', '==', true));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Create a test message
        const messageData = {
          content: 'This is a test message for read receipts',
          senderId: 'test-sender-id',
          createdAt: Timestamp.now(),
          status: 'sent',
          isTestMessage: true,
          readBy: []
        };
        
        const docRef = await addDoc(testMessagesCollection, messageData);
        console.log('Created test message with ID:', docRef.id);
      } else {
        console.log('Using existing test message');
      }
    };
    
    setupTestMessage().catch(console.error);
    
    // Listen for changes to test messages
    const unsubscribe = onSnapshot(
      query(testMessagesCollection, where('isTestMessage', '==', true)),
      (snapshot) => {
        if (!snapshot.empty) {
          const messageDoc = snapshot.docs[0];
          const messageData = messageDoc.data();
          setTestMessage({ id: messageDoc.id, ...messageData });
          
          // Check if current user has read the message
          setReadByCurrentUser(messageData.readBy?.includes(userId) || false);
        }
      }
    );
    
    return () => unsubscribe();
  }, [userId]);

  // Mark the test message as read
  const markAsRead = async () => {
    if (!testMessage || !userId) return;
    
    try {
      const messageRef = doc(db, 'testMessages', testMessage.id);
      await updateDoc(messageRef, {
        readBy: arrayUnion(userId),
        status: 'read'
      });
      console.log('Marked test message as read by', userId);
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  // Reset the test message read status
  const resetReadStatus = async () => {
    if (!testMessage) return;
    
    try {
      const messageRef = doc(db, 'testMessages', testMessage.id);
      await updateDoc(messageRef, {
        readBy: [],
        status: 'sent'
      });
      console.log('Reset test message read status');
    } catch (error) {
      console.error('Error resetting read status:', error);
    }
  };

  // Get read status display
  const getReadStatus = () => {
    if (!testMessage) return null;
    
    if (testMessage.readBy && testMessage.readBy.length > 0) {
      return (
        <div className="flex items-center text-green-500">
          <CheckCircleIcon className="h-5 w-5 mr-1" />
          <span>Read by {testMessage.readBy.length} user(s)</span>
        </div>
      );
    } else if (testMessage.status === 'delivered') {
      return (
        <div className="flex items-center text-gray-400">
          <CheckCircleIcon className="h-5 w-5 mr-1" />
          <span>Delivered</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-gray-400">
          <span>Sent</span>
        </div>
      );
    }
  };

  if (!testMessage) {
    return <div className="p-4">Loading test message...</div>;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg max-w-md mx-auto my-8">
      <h2 className="text-xl font-bold mb-4 text-white">Read Receipt Test</h2>
      
      <div className="bg-gray-700 p-3 rounded-lg mb-4">
        <p className="text-white mb-2">{testMessage.content}</p>
        <div className="text-sm text-gray-300">Status: {getReadStatus()}</div>
      </div>
      
      <div className="flex flex-col gap-2">
        <button
          onClick={markAsRead}
          disabled={readByCurrentUser}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          {readByCurrentUser ? 'Already Marked as Read' : 'Mark as Read'}
        </button>
        
        <button
          onClick={resetReadStatus}
          className="px-4 py-2 bg-red-600 text-white rounded"
        >
          Reset Read Status
        </button>
      </div>
      
      <div className="mt-4 bg-gray-900 p-3 rounded-lg">
        <h3 className="font-bold text-white mb-2">Debug Info:</h3>
        <pre className="text-xs text-gray-400 overflow-auto max-h-40">
          {JSON.stringify(testMessage, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ReadReceiptTest; 