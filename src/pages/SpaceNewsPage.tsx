import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import CreateNewsModal from '../components/news/CreateNewsModal';
import NewsCard from '../components/news/NewsCard';
import NewsCardSkeleton from '../components/news/NewsCardSkeleton';
import FullNewsModal from '../components/news/FullNewsModal';
import { fetchNewsPage, NewsItem, deleteNews } from '../services/newsService';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { isSuperAdminRole } from '../utils/messagingPermissions';

const PAGE_SIZE = 8;

const SpaceNewsPage: React.FC = () => {
  const [openCreate, setOpenCreate] = useState(false);
  const [todayItems, setTodayItems] = useState<NewsItem[]>([]);
  const [pastItems, setPastItems] = useState<NewsItem[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const { currentUser } = useAuth();
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [deletingNewsId, setDeletingNewsId] = useState<string | null>(null);

  const canDeleteNews = isSuperAdminRole(currentUser?.role);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      // fetch past news only (before today)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const beforeDate = Timestamp.fromDate(startOfToday);
      const res = await fetchNewsPage(PAGE_SIZE, lastDoc, beforeDate);
      if (res.items.length) {
        setPastItems(prev => {
          const map = new Map<string, typeof res.items[0]>();
          prev.forEach(i => map.set(i.id, i));
          res.items.forEach(i => map.set(i.id, i));
          return Array.from(map.values());
        });
        setLastDoc(res.lastDoc);
        if (res.items.length < PAGE_SIZE) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [lastDoc, loading, hasMore]);

  useEffect(() => {
    // initial load
    (async () => {
      setLoading(true);
      try {
        // split initial data into today (realtime) and past (paginated)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startTs = Timestamp.fromDate(startOfToday);

        // fetch first page of past items (createdAt < startOfToday)
        const pastRes = await fetchNewsPage(PAGE_SIZE, undefined, startTs);
        setPastItems(pastRes.items);
        setLastDoc(pastRes.lastDoc);
        if (pastRes.items.length < PAGE_SIZE) setHasMore(false);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, []);

  // realtime listener for today's news
  useEffect(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTs = Timestamp.fromDate(startOfToday);
    const newsRef = collection(db, 'space_news');
    const q = query(newsRef, where('createdAt', '>=', startTs), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const items: NewsItem[] = snap.docs.map(d => ({
        id: d.id,
        title: d.data().title,
        description: d.data().description,
        location: d.data().location,
        coordinates: d.data().coordinates,
        imageUrl: d.data().imageUrl,
        createdBy: d.data().createdBy,
        creatorName: d.data().creatorName,
        creatorProfilePic: d.data().creatorProfilePic,
        createdAt: d.data().createdAt
      }));

      // update today's items; ensure no duplicates with pastItems
      setTodayItems(items);
      setPastItems(prev => prev.filter(p => !items.find(t => t.id === p.id)));
    }, err => console.error('Realtime today news error', err));

    return () => unsub();
  }, []);

  // intersection observer for infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    }, { root: null, rootMargin: '200px', threshold: 0.1 });

    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

  const handleCreated = (_id: string) => {
    // Refresh past-news pagination window after create while realtime listener
    // handles today's items.
    (async () => {
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startTs = Timestamp.fromDate(startOfToday);
        const res = await fetchNewsPage(PAGE_SIZE, undefined, startTs);

        setPastItems(prev => {
          const map = new Map<string, typeof res.items[0]>();
          res.items.forEach(i => map.set(i.id, i));
          prev.forEach(i => map.set(i.id, i));
          return Array.from(map.values());
        });
        setLastDoc(res.lastDoc);
        setHasMore(true);
      } catch (err) {
        console.error(err);
      }
    })();
  };

  const handleDelete = useCallback(async (item: NewsItem) => {
    if (!currentUser || !canDeleteNews) return;

    const confirmed = window.confirm(`Delete this news item?\n\n${item.title}`);
    if (!confirmed) return;

    setDeletingNewsId(item.id);
    try {
      await deleteNews(item.id, currentUser.role);
      setTodayItems(prev => prev.filter(news => news.id !== item.id));
      setPastItems(prev => prev.filter(news => news.id !== item.id));
      setSelected(prev => (prev?.id === item.id ? null : prev));
    } catch (err) {
      console.error('Failed to delete news item:', err);
      window.alert('Failed to delete news item. Please try again.');
    } finally {
      setDeletingNewsId(null);
    }
  }, [canDeleteNews, currentUser]);

  return (
    <MainLayout>
      {typeof document !== 'undefined' && createPortal(
        // simple dark solid background to replace colorful SVG blobs
        <div className="pointer-events-none fixed inset-0 z-0 bg-black" aria-hidden style={{ backgroundColor: '#030305' }} />,
        document.body
      )}
  <div className="relative p-4 sm:p-6 z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">BulSU Space News</h1>
          {currentUser && (
            <button
              onClick={() => setOpenCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold shadow-md transition-transform transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <span className="material-symbols-outlined">add</span>
              Create News
            </button>
          )}
        </div>

        <div className="bg-transparent">
          <div className="grid grid-cols-1 gap-6">
            {todayItems.length > 0 || loading ? (
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">News Today</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {loading && todayItems.length === 0
                    ? Array.from({ length: 2 }).map((_, i) => <NewsCardSkeleton key={`today-skel-${i}`} />)
                    : todayItems.map(it => (
                        <NewsCard
                          key={it.id}
                          item={it}
                          onOpen={(item) => setSelected(item)}
                          canDelete={canDeleteNews}
                          deleting={deletingNewsId === it.id}
                          onDelete={handleDelete}
                        />
                      ))}
                </div>
              </section>
            ) : null}

            <section className="mt-6">
              <h2 className="text-xl font-semibold text-white mb-3">Past News</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {pastItems.length === 0 && loading
                  ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                      <NewsCardSkeleton key={`past-skel-${i}`} />
                    ))
                  : pastItems.map(it => (
                      <NewsCard
                        key={it.id}
                        item={it}
                        onOpen={(item) => setSelected(item)}
                        canDelete={canDeleteNews}
                        deleting={deletingNewsId === it.id}
                        onDelete={handleDelete}
                      />
                    ))}
              </div>
            </section>
          </div>

          <div ref={loaderRef} className="mt-6 text-center text-gray-400">
            {loading ? 'Loading...' : hasMore ? 'Scroll to load more' : 'No more news'}
          </div>
        </div>

        <CreateNewsModal open={openCreate} onClose={() => setOpenCreate(false)} onCreated={handleCreated} />
        <FullNewsModal open={!!selected} item={selected} onClose={() => setSelected(null)} />
      </div>
    </MainLayout>
  );
};

export default SpaceNewsPage;
