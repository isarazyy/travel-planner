'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlanResultDirect from '@/components/PlanResultDirect';
import { Trip } from '@/lib/types';
import { getLocalTripById } from '@/lib/local-storage-trips';

function tripToDirectProps(trip: Trip) {
  const plans = (trip.trip_plans || []).map((p: any) => ({
    planName: p.planName || p.plan_name || p.mode || '方案',
    planDescription: p.planDescription || p.plan_description || '',
    transport_detail: p.transport_detail || '',
    itinerary: Array.isArray(p.itinerary) ? p.itinerary : [],
    attractions: Array.isArray(p.attractions) ? p.attractions : [],
    accommodations: Array.isArray(p.accommodations) ? p.accommodations : [],
    food_spots: Array.isArray(p.food_spots) ? p.food_spots : [],
    cost_breakdown: p.cost_breakdown || {},
    estimated_total: Number(p.estimated_total) || 0,
    tips: Array.isArray(p.tips) ? p.tips : [],
  }));

  const tripData = {
    departure: trip.departure || '',
    destinations: Array.isArray(trip.destinations) ? trip.destinations : [],
    destination: typeof trip.destination === 'string' ? trip.destination : null,
    date_mode: trip.date_mode || 'flexible',
    start_date: trip.start_date || '',
    end_date: trip.end_date || '',
    people_count: trip.people_count || 1,
    preferences: trip.preferences as any,
  };

  return { trip: tripData, plans };
}

export default function TripDetailPage() {
  const params = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const id = params.id as string;
      try {
        const res = await fetch(`/api/trips/${id}`);
        const data = await res.json();

        if (data?.source === 'local') {
          const local = getLocalTripById(id);
          if (local) {
            setTrip(local as unknown as Trip);
          } else {
            setError('本地行程不存在或已被清除');
          }
          return;
        }

        if (!res.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : '加载失败');
        }
        setTrip(data);
      } catch (err: any) {
        const local = getLocalTripById(id);
        if (local) {
          setTrip(local as unknown as Trip);
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">加载行程中...</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4">😕</p>
        <p className="text-gray-500 mb-6">{error || '行程不存在'}</p>
        <Link href="/plan" className="text-orange-500 font-medium hover:underline">
          去新建规划 →
        </Link>
      </div>
    );
  }

  const { trip: tripData, plans } = tripToDirectProps(trip);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/history"
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            ← 返回历史行程
          </Link>
          <h1 className="text-xl font-bold text-gray-900">行程详情</h1>
        </div>
        <Link
          href="/plan"
          className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-50 transition"
        >
          + 新建规划
        </Link>
      </div>

      <PlanResultDirect
        trip={tripData}
        plans={plans}
        hotelWebSearchUsed={false}
      />
    </div>
  );
}
