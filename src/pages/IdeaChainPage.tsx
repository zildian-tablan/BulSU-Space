import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, collection as subcollection, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../contexts/AuthContext';

interface IdeaPost {
  id: string;
  title?: string;
  body: string;
  createdAt?: any;
  authorId?: string | null;
}

const getInitials = (id?: string | null) => {
  if (!id) return 'I';
  const parts = id.split(/[^a-zA-Z0-9]/).filter(Boolean);
  if (parts.length === 0) return id.charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const formatTime = (ts: any) => {
  try {
    if (!ts) return '';
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleString();
    return String(ts);
  } catch (e) {
    return '';
  }
};

const IdeaChainPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState<IdeaPost[]>([]);
  const [loading, setLoading] = useState(true);
  // collapsedPosts maps postId -> boolean (true = collapsed). Default: collapsed (true)
  const [collapsedPosts, setCollapsedPosts] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const recentlyAddedRef = useRef<string | null>(null);
  const preservedScrollRef = useRef<number>(0);

  // default to collapsed unless explicitly set to false
  const isPostCollapsed = (id: string) => collapsedPosts[id] !== false;
  const togglePostCollapsed = (id: string) => setCollapsedPosts(prev => ({ ...prev, [id]: !isPostCollapsed(id) }));
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [fullScreenPostId, setFullScreenPostId] = useState<string | null>(null);

  // close fullscreen modal on Escape
  useEffect(() => {
    if (!fullScreenPostId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreenPostId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullScreenPostId]);

  useEffect(() => {
    const q = query(collection(db, 'idea_chain_posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, snap => {
      const items: IdeaPost[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        items.push({ id: d.id, body: data.body || '', title: data.title, createdAt: data.createdAt, authorId: data.authorId || null });
      });
      setPosts(items);
      // If we recently added a post, restore scroll to avoid shuffling other posts visually
      if (recentlyAddedRef.current) {
        try {
          window.scrollTo({ top: preservedScrollRef.current, behavior: 'auto' });
        } catch (e) {
          // ignore if scrolling not available
        }
        recentlyAddedRef.current = null;
      }
      // mark initial load complete
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const createPost = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentUser) {
      alert('You must be signed in to post.');
      return;
    }
    if (!newBody.trim()) return;
    setSubmitting(true);
    try {
      const waitForAuth = (timeout = 3000) => new Promise<boolean>(resolve => {
        const start = Date.now();
        const check = () => {
          if (auth.currentUser) return resolve(true);
          if (Date.now() - start >= timeout) return resolve(false);
          setTimeout(check, 200);
        };
        check();
      });

      const authReady = await waitForAuth(3000);
      if (!authReady) {
        console.error('createPost aborted: Firebase auth not ready (auth.currentUser is null)');
        alert('Your session is not active. Please refresh the page or sign in again and try posting.');
        return;
      }
      // preserve scroll position to avoid layout shift for other posts
      preservedScrollRef.current = (window.scrollY || document.documentElement.scrollTop || 0) as number;

      const newDoc = await addDoc(collection(db, 'idea_chain_posts'), {
        body: newBody.trim(),
        authorId: currentUser.id,
        createdAt: serverTimestamp(),
      });
      // default newly-created post to collapsed (hide responses)
      if (newDoc && newDoc.id) {
        setCollapsedPosts(prev => ({ ...prev, [newDoc.id]: true }));
        recentlyAddedRef.current = newDoc.id;
      }
      setNewBody('');
      setOpenCreate(false);
    } catch (err) {
      console.error('createPost error', err);
      alert('Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="relative py-6 sm:py-8">
        {/* Shared full-viewport background: replaced colorful gradient blobs with a solid background */}
        {typeof document !== 'undefined' && createPortal(
          <div className="pointer-events-none fixed inset-0 z-0" aria-hidden style={{ backgroundColor: '#0b0b0d' }} />,
          document.body
        )}

      {/* Column gap control: zero on small screens, small gap on md+; also remove card bottom margin on mobile */}
      <style>{`
        .idea-chain-columns{ column-gap:0px; }
        .idea-chain-columns .break-inside-avoid{ margin-bottom: 0 !important; }
        @media (min-width:768px){
          .idea-chain-columns{ column-gap:0.5rem; }
          .idea-chain-columns .break-inside-avoid{ margin-bottom: 0.5rem !important; }
        }
      `}</style>

  <div className="w-full sm:max-w-6xl md:max-w-7xl sm:mx-auto mx-0 relative z-10 pb-24 md:pb-8">
          <div className="relative p-4 sm:p-6 z-10">
            <div className="flex items-center justify-between mb-2 md:mb-6">
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">Idea Chain</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenCreate(true)}
                  className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gradient-to-r from-teal-500 to-indigo-600 text-white text-sm shadow-sm"
                >
                  <span className="material-symbols-outlined">add</span>
                  Create Idea
                </button>
                <button
                  onClick={() => setOpenCreate(true)}
                  className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 text-white text-base shadow-sm"
                >
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Floating create button moved to bottom-right */}

          {openCreate && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-2xl mx-4 rounded-2xl bg-gradient-to-br from-gray-900/80 to-black/80 border border-gray-800 shadow-2xl p-6 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-indigo-500 flex items-center justify-center text-white font-bold">✦</div>
                    <h3 className="text-xl font-bold text-white">Create Idea</h3>
                  </div>
                  <button onClick={() => setOpenCreate(false)} aria-label="Close" className="text-gray-300 hover:text-white p-1 rounded-md">✕</button>
                </div>

                <form onSubmit={createPost}>
                  <textarea
                    placeholder="Share an idea..."
                    value={newBody}
                    onChange={e => setNewBody(e.target.value)}
                    className="w-full p-4 rounded-xl bg-black/60 border border-gray-800 text-white resize-none h-44 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="flex items-center justify-end mt-3">
                    <button type="button" onClick={() => setOpenCreate(false)} className="px-4 py-2 mr-2 rounded-lg bg-gray-800 text-white">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-indigo-600 hover:opacity-95 disabled:opacity-60 text-white">
                      {submitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

          {/* Masonry-like layout: use CSS columns so items flow independently and opening a post only affects its column */}
          <div className="columns-1 md:columns-2 idea-chain-columns">
            {loading ? (
              // Render 4 skeleton cards while loading
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={"skeleton-" + i}
                  className="inline-block w-full break-inside-avoid mb-0 md:mb-2 relative overflow-hidden rounded-none md:rounded-2xl md:p-2 p-3 bg-gradient-to-br from-[#08080a] to-[#0b0b0d] border border-gray-800/60 shadow-md transition transform hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  tabIndex={0}
                >
                  {/* left accent stripe for mobile */}
                  <div className="absolute left-0 top-1 bottom-1 w-1 bg-indigo-600/60 md:hidden rounded-tr-sm rounded-br-sm" />
                  <div className="flex items-start gap-0.5 md:gap-1 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-gray-700/40" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-gray-700/40 rounded w-1/3" />
                      <div className="h-3 bg-gray-700/30 rounded w-1/4" />
                      <div className="h-8 bg-gray-700/20 rounded w-full" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              posts.map(post => (
                <div
                  key={post.id}
                  className="inline-block w-full break-inside-avoid mb-0 md:mb-2 relative overflow-hidden rounded-none md:rounded-2xl md:p-2 p-3 bg-gradient-to-br from-[#08080a] to-[#0b0b0d] border border-gray-800/60 shadow-md hover:shadow-xl transition transform hover:shadow-2xl active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  tabIndex={0}
                >
                  {/* left accent stripe for mobile */}
                  <div className="absolute left-0 top-1 bottom-1 w-1 bg-indigo-600/60 md:hidden rounded-tr-sm rounded-br-sm" />
                {/* Toggle for collapsing responses at top-right of the whole post card */}
                  {/* per-post collapse toggle (only affects the targeted post) */}
                  {(() => {
                    const isCollapsed = isPostCollapsed(post.id);
                    return (
                      <button
                        type="button"
                        onClick={() => togglePostCollapsed(post.id)}
                        aria-label={isCollapsed ? 'Show responses' : 'Hide responses'}
                        className="absolute top-2 right-2 z-20 w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-800/70 hover:bg-gray-700 flex items-center justify-center text-gray-200"
                      >
                        <span className="material-symbols-outlined text-[14px] md:text-[18px]">{isCollapsed ? 'expand_more' : 'expand_less'}</span>
                      </button>
                    );
                  })()}
                  {/* Fullscreen view button (shows modal) */}
                  <button
                    type="button"
                    onClick={() => setFullScreenPostId(post.id)}
                    aria-label="Open fullscreen"
                    className="absolute top-2 right-12 z-20 w-7 h-7 md:w-9 md:h-9 rounded-full bg-gray-800/70 hover:bg-gray-700 flex items-center justify-center text-gray-200"
                    title="Open fullscreen"
                  >
                    <span className="material-symbols-outlined text-[14px] md:text-[18px]">full_coverage</span>
                  </button>
                <div className="absolute -inset-px sm:rounded-2xl rounded-none pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.04), rgba(99,102,241,0.03))', zIndex: 0 }} />

                <div className="relative z-10 flex items-start gap-0.5 md:gap-1">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 text-white flex items-center justify-center font-semibold shadow-sm">
                      <span className="material-symbols-outlined text-[18px] text-yellow-50">lightbulb</span>
                    </div>
                  </div>
                    <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        {post.title ? (
                          <div className="text-base md:text-sm text-gray-300 mb-1 font-medium">{post.title}</div>
                        ) : null}
                        <div className="text-xs md:text-sm text-gray-400">{formatTime(post.createdAt)}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-white leading-relaxed text-sm max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">{post.body}</div>
                  </div>
                </div>

                <ResponsesList postId={post.id} collapsed={isPostCollapsed(post.id)} />
              </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom-right floating action button (Create Idea) rendered into a portal so it stays fixed to the viewport */}
        {typeof document !== 'undefined' && createPortal(
          <>
            {/* Fullscreen post modal */}
            {fullScreenPostId ? (
              <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setFullScreenPostId(null)} />
                <div className="relative z-10 w-full max-w-5xl mx-auto rounded-2xl bg-gradient-to-br from-gray-950 to-black border border-gray-800/50 shadow-2xl p-0 overflow-hidden" role="dialog" aria-modal="true">
                  <div className="flex items-center justify-between gap-4 px-6 py-4 bg-gradient-to-r from-indigo-950/60 via-gray-950/80 to-teal-950/40 border-b border-gray-800/50">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 via-orange-400 to-orange-500 text-white flex items-center justify-center font-semibold shadow-lg ring-2 ring-yellow-400/20">
                        <span className="material-symbols-outlined text-[24px] text-yellow-50">lightbulb</span>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-white tracking-tight">Idea Chain</div>
                        <div className="text-xs text-gray-400 mt-0.5">{formatTime(posts.find(p => p.id === fullScreenPostId)?.createdAt)}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setFullScreenPostId(null)} 
                      aria-label="Close fullscreen" 
                      className="text-gray-400 hover:text-white hover:bg-gray-800/50 p-2.5 rounded-lg transition-all"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  </div>

                  <div style={{ maxHeight: '75vh' }} className="overflow-auto p-8 bg-gradient-to-b from-gray-950/95 to-black/95 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    <div className="max-w-none mx-auto rounded-xl p-6 bg-gray-900/40 border border-gray-800/60 shadow-2xl backdrop-blur-sm">
                      <div className="prose prose-invert max-w-none">
                        <div className="text-white leading-relaxed text-base mb-6">{posts.find(p => p.id === fullScreenPostId)?.body}</div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-gray-800/50">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="material-symbols-outlined text-indigo-400 text-[20px]">link</span>
                          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Chained Responses</h3>
                        </div>
                        <ResponsesList postId={fullScreenPostId as string} collapsed={false} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Floating FAB removed; Create button now lives in the header */}
          </>,
          document.body
        )}
      </div>
    </MainLayout>
  );
};

const ResponsesList: React.FC<{ postId: string; collapsed?: boolean }> = ({ postId, collapsed = true }) => {
  const { currentUser } = useAuth();
  const [responses, setResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(true);
  const nameCache = useRef<Record<string, string>>({});
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Real-time responses: subscribe to the responses subcollection and enrich author names
  useEffect(() => {
    const q = query(subcollection(doc(db, 'idea_chain_posts', postId), 'responses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const items: any[] = [];
      snap.forEach(d => items.push({ id: d.id, ...(d.data() as any) }));

      // enrich responses with authorName if possible
      (async () => {
        const cache = nameCache.current;
        const toFetch = new Set<string>();
        items.forEach(r => {
          if (!r.anonymous && r.authorId) {
            const id = r.authorId as string;
            if (!cache[id]) toFetch.add(id);
          }
        });

        if (toFetch.size > 0) {
          await Promise.all(Array.from(toFetch).map(async id => {
            try {
              const udoc = await getDoc(doc(db, 'users', id));
              if (udoc.exists()) {
                const data = udoc.data() as any;
                cache[id] = data.name || data.firstName || data.email || id;
              } else {
                cache[id] = id;
              }
            } catch (e) {
              cache[id] = id;
            }
          }));
        }

        const enriched = items.map(r => ({ ...r, authorName: (!r.anonymous && r.authorId) ? nameCache.current[r.authorId as string] : undefined }));
        setResponses(enriched);
        setLoadingResponses(false);
      })();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const submitResponse = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentUser) { alert('Sign in to respond'); return; }
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const waitForAuth = (timeout = 3000) => new Promise<boolean>(resolve => {
        const start = Date.now();
        const check = () => {
          if (auth.currentUser) return resolve(true);
          if (Date.now() - start >= timeout) return resolve(false);
          setTimeout(check, 200);
        };
        check();
      });

      const authReady = await waitForAuth(3000);
      if (!authReady) {
        console.error('submitResponse aborted: Firebase auth not ready (auth.currentUser is null)');
        alert('Your session is not active. Please refresh the page or sign in again and try responding.');
        return;
      }
      await addDoc(subcollection(doc(db, 'idea_chain_posts', postId), 'responses'), {
        body: text.trim(),
        anonymous: !!anonymous,
        authorId: anonymous ? null : currentUser.id,
        createdAt: serverTimestamp(),
      });
  setText('');
  // responses are realtime via onSnapshot — no manual refresh needed
    } catch (err) {
      console.error(err);
      alert('Failed to post response');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="mt-3 md:mt-4 relative overflow-hidden transition-all duration-300">
      {/* The parent post card controls collapsed state via the `collapsed` prop. When collapsed, hide the form and response list */}
      {!collapsed && (
        <div className="relative">
          {/* Scrollable container for responses */}
          <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {/* Vertical tree line connecting all responses - positioned relative to scrollable content */}
            <div className="absolute left-5 top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-500/40 via-teal-500/30 to-transparent pointer-events-none" />
          
          <form onSubmit={submitResponse} className="mb-3 md:mb-4 relative">
            {/* Horizontal tree line connector */}
            <div className="absolute left-5 top-4 w-4 h-[2px] bg-indigo-500/40" />
            
            <div className="flex items-start gap-2 pl-10">
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Write a response..."
                  className="flex-1 p-2 rounded-lg bg-black/50 border border-gray-700/50 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  aria-label="Write a response"
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-500 text-white font-medium text-sm shadow-md hover:shadow-lg disabled:opacity-60 transition-all"
                  aria-label={submitting ? 'Sending' : 'Chain response'}
                >
                  Chain
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pl-10">
              <label className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="form-checkbox h-3.5 w-3.5 text-indigo-500 rounded" />
                <span>Anonymous</span>
              </label>
            </div>
          </form>
          
          <div className="space-y-2">
            {loadingResponses ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={"resp-skel-" + i} className="relative pl-10">
                  <div className="absolute left-5 top-3 w-4 h-[2px] bg-gray-700/40" />
                  <div className="bg-gray-800/20 rounded-lg p-3 border border-gray-700/30">
                    <div className="flex items-start gap-2 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-gray-700/40" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-700/30 rounded w-1/4" />
                        <div className="h-2 bg-gray-700/20 rounded w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : responses.length === 0 ? (
              <div className="relative pl-10">
                <div className="absolute left-5 top-3 w-4 h-[2px] bg-gray-700/40" />
                <div className="bg-gray-800/10 rounded-lg p-4 border border-gray-700/20 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center text-white">
                      <span className="material-symbols-outlined text-[16px]">chat_bubble_outline</span>
                    </div>
                  </div>
                  <div className="text-gray-400 text-xs">No responses yet — be the first to respond.</div>
                </div>
              </div>
            ) : (
              <>
                {responses.map((r, idx) => {
                  const isLast = idx === responses.length - 1;
                  return (
                    <div key={r.id} className="relative pl-10">
                      {/* Horizontal tree line connector */}
                      <div className="absolute left-5 top-3 w-4 h-[2px] bg-indigo-500/40" />
                      
                      {/* Corner connector for last item */}
                      {isLast && (
                        <div className="absolute left-5 top-0 w-[2px] h-3 bg-gradient-to-b from-indigo-500/40 to-transparent" />
                      )}
                      
                      <div className="bg-gray-800/20 backdrop-blur-sm rounded-lg p-3 border border-gray-700/40 hover:border-indigo-500/40 hover:bg-gray-800/30 transition-all">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-xs text-gray-300 font-medium">{r.anonymous ? 'Anonymous' : (r.authorName || r.authorId || 'User')}</div>
                              <div className="text-[10px] text-gray-500">{formatTime(r.createdAt)}</div>
                            </div>
                            <div className="text-white text-sm leading-relaxed">{r.body}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdeaChainPage;
