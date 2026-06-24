import React, { useState } from 'react';
import { storage } from '../firebase/config';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';


const DebugStorageUploadPage: React.FC = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const storageRef = ref(storage, `DebugMedia/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on('state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(percent);
          console.log('[Upload] State:', snapshot.state, 'Progress:', percent + '%', 'Transferred:', snapshot.bytesTransferred, 'Total:', snapshot.totalBytes);
        },
        (err) => {
          setError(err.message);
          setUploading(false);
          console.error('[Upload] Error:', err);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setDownloadUrl(url);
          setUploading(false);
          console.log('[Upload] Complete. Download URL:', url);
        }
      );
      console.log('[Upload] Started for file:', file.name, 'size:', file.size);
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
      console.error('[Upload] Exception:', err);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Debug: Firebase Storage Upload</h2>
      {!isAuthenticated ? (
        <div style={{ color: 'red', marginTop: 16 }}>
          You must be signed in to access this page.
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 12 }}>
            Logged in as: <b>{currentUser?.name || currentUser?.email}</b>
          </div>
          <div>
            <input type="file" onChange={handleFileChange} />
            <button onClick={handleUpload} disabled={!file || uploading} style={{ marginLeft: 8 }}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {uploading && (
            <div style={{ marginTop: 8 }}>
              <progress value={progress} max={100} style={{ width: '100%' }} />
              <div>{progress}%</div>
            </div>
          )}
          {downloadUrl && (
            <div style={{ marginTop: 16 }}>
              <div>File uploaded! <a href={downloadUrl} target="_blank" rel="noopener noreferrer">View file</a></div>
            </div>
          )}
          {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
        </div>
      )}
    </div>
  );
};

export default DebugStorageUploadPage;
