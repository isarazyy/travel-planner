'use client';

import { useEffect, useState } from 'react';
import { Trip } from '@/lib/types';
import TripCard from '@/components/TripCard';
import Link from 'next/link';

export default function HistoryPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trips')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTrips(data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('确定删除这个行程吗？')) return;
    await fetch(`/api/trips/${id}`, { method: 'DELETE' });
    setTrips(trips.filter(t => t.id !== id));
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">历史行程</h1>
        <Link
          href="/plan"
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl transition"
        >
          + 新建规划
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🗺️</p>
          <p className="text-gray-500 mb-2">还没有旅行记录</p>
          <p className="text-sm text-gray-400 mb-6">创建你的第一个旅行规划吧！</p>
          <Link
            href="/plan"
            className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition"
          >
            开始规划
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
