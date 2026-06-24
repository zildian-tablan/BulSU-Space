import React, { useState, useMemo } from 'react';
import type { IMessage } from '../types';

const MediaFilesPanel: React.FC<{ messages: IMessage[]; onClose: () => void; }> = ({ messages }) => {
  const [tab, setTab] = useState<'media' | 'files'>('media');

  const { mediaItems, fileItems } = useMemo(() => {
    const media: { id: string; url: string; kind: 'image' | 'video' | 'audio'; name: string }[] = [];
    const files: { id: string; url: string; ext: string; name: string }[] = [];
    const imageRegex = /\.(png|jpe?g|gif|webp|avif|bmp|jfif)$/i;
    const videoRegex = /\.(mp4|webm|ogg|mov|m4v)$/i;
    const audioRegex = /\.(mp3|wav|ogg|m4a)$/i;
    const docRegex = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i;
    messages.forEach(m => {
      if (Array.isArray((m as any).attachments)) {
        (m as any).attachments.forEach((url: string, idx: number) => {
          const nameRaw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
          if (imageRegex.test(nameRaw)) {
            media.push({ id: `${m.id}_${idx}`, url, kind: 'image', name: nameRaw });
          } else if (videoRegex.test(nameRaw)) {
            media.push({ id: `${m.id}_${idx}`, url, kind: 'video', name: nameRaw });
          } else if (audioRegex.test(nameRaw)) {
            media.push({ id: `${m.id}_${idx}`, url, kind: 'audio', name: nameRaw });
          } else if (docRegex.test(nameRaw)) {
            const ext = (nameRaw.split('.').pop() || '').toLowerCase();
            files.push({ id: `${m.id}_${idx}`, url, ext, name: nameRaw });
          } else {
            // Unrecognized -> treat as file chip
            const ext = (nameRaw.split('.').pop() || '').toLowerCase();
            files.push({ id: `${m.id}_${idx}`, url, ext, name: nameRaw });
          }
        });
      }
    });
    // Show most recent first
    media.reverse();
    files.reverse();
    return { mediaItems: media, fileItems: files };
  }, [messages]);

  const TabButton: React.FC<{ active: boolean; onClick: () => void; label: string; count: number; icon: string; }> = ({ active, onClick, label, count, icon }) => (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium tracking-wide transition-all
        ${active ? 'bg-green-500/20 text-green-300 border border-green-500/40 shadow-inner shadow-green-900/40' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'}
      `}
    >
      <span className="material-icons text-base">{icon}</span>
      {label}
      <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-green-600/30 text-green-200' : 'bg-gray-700/60 text-gray-300'}`}>{count}</span>
    </button>
  );

  // Empty state when nothing at all
  if (mediaItems.length === 0 && fileItems.length === 0) {
    return (
      <div className="flex flex-col flex-1 p-8 items-center justify-center text-gray-400">
        <div className="flex gap-3 mb-6">
          <TabButton active={true} onClick={() => {}} label="Media" count={0} icon="perm_media" />
          <TabButton active={false} onClick={() => {}} label="Files" count={0} icon="folder" />
        </div>
        <span className="material-icons text-5xl mb-4 text-gray-600">perm_media</span>
        <p className="text-sm">No media or files have been shared yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex gap-2 px-4 pt-4 pb-3 border-b border-gray-800/80 bg-[#121212]/60 backdrop-blur-sm sticky top-0 z-10">
        <TabButton active={tab==='media'} onClick={() => setTab('media')} label="Media" count={mediaItems.length} icon="perm_media" />
        <TabButton active={tab==='files'} onClick={() => setTab('files')} label="Files" count={fileItems.length} icon="folder" />
      </div>
      {tab === 'media' ? (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {mediaItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">No media yet</div>
          ) : (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr">
              {mediaItems.map(item => (
                <div key={item.id} className="group relative rounded-lg border border-gray-800/60 bg-[#1a1a1a] overflow-hidden hover:border-green-500/40 transition-colors">
                  {item.kind === 'image' ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={item.url} alt={item.name} className="w-full h-40 object-cover group-hover:opacity-90 transition-opacity" loading="lazy" />
                    </a>
                  ) : item.kind === 'video' ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block h-40 bg-black">
                      <video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    </a>
                  ) : (
                    <div className="p-3 flex flex-col items-center justify-center h-40">
                      <span className="material-icons text-4xl mb-2 text-green-400">audio_file</span>
                      <audio controls className="w-full">
                        <source src={item.url} />
                      </audio>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[10px] text-gray-200 truncate opacity-0 group-hover:opacity-100 transition-opacity">{item.name}</div>
                  <div className="absolute top-1 right-1 bg-black/50 text-[10px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-200">{item.kind}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {fileItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">No files yet</div>
          ) : (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {fileItems.map(file => {
                const shortName = file.name.length > 34 ? file.name.slice(0, 30) + '…' + file.name.split('.').pop() : file.name;
                const ext = (file.ext || '').toLowerCase();
                let iconUrl: string | null = null;
                if (ext === 'pdf') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337946.png';
                else if (ext === 'doc' || ext === 'docx') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337932.png';
                else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') iconUrl = 'https://cdn-icons-png.flaticon.com/512/4725/4725976.png';
                else if (ext === 'ppt' || ext === 'pptx') iconUrl = 'https://cdn-icons-png.flaticon.com/512/337/337932.png';
                else if (ext === 'txt') iconUrl = 'https://cdn-icons-png.flaticon.com/512/3022/3022503.png';
                else if (ext === 'zip' || ext === 'rar') iconUrl = 'https://cdn-icons-png.flaticon.com/512/9704/9704802.png';
                return (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-full bg-gray-800/60 hover:bg-gray-700 border border-gray-700 hover:border-green-500/40 text-[11px] text-gray-200 transition-all w-full"
                    title={file.name}
                  >
                    {iconUrl ? (
                      <img src={iconUrl} alt={ext} className="h-5 w-5" loading="lazy" />
                    ) : (
                      <span className="material-icons text-green-400 text-base">insert_drive_file</span>
                    )}
                    <span className="truncate flex-1">{shortName}</span>
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-green-600/30 text-green-200 border border-green-500/30">{file.ext || 'file'}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Group Chat Management Modal ---

export default MediaFilesPanel;
