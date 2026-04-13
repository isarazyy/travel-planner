'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function GeneratingBanner() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'running' | 'done' | 'error' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const id = localStorage.getItem('gen_job_id');
    if (id) {
      setJobId(id);
      setStatus('running');
    }

    const check = () => {
      const current = localStorage.getItem('gen_job_id');
      if (current && !jobId) { setJobId(current); setStatus('running'); }
      if (!current && jobId) { setJobId(null); setStatus(null); }
    };
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) { if (pollRef.current) clearInterval(pollRef.current); return; }

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/job/status?id=${jobId}`);
        const j = await r.json();
        if (j.status === 'done') {
          setStatus('done');
          clearInterval(pollRef.current!);
          pollRef.current = null;
        } else if (j.status === 'error') {
          setStatus('error');
          localStorage.removeItem('gen_job_id');
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setTimeout(() => { setJobId(null); setStatus(null); }, 5000);
        } else {
          setStatus(j.status);
        }
      } catch { /* retry */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  // Don't show banner on the plan page itself (it has its own loading state)
  if (pathname === '/plan') return null;
  if (!jobId || !status) return null;

  const handleClick = () => {
    if (status === 'done') {
      // Navigate to plan page, which will pick up the result via polling
      router.push('/plan');
    } else {
      router.push('/plan');
    }
  };

  return (
    <div
      onClick={handleClick}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 cursor-pointer"
    >
      <div className={`flex items-center gap-2.5 px-5 py-3 rounded-full shadow-lg border transition-all ${
        status === 'done'
          ? 'bg-green-50 border-green-200 text-green-800'
          : status === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-white border-orange-200 text-gray-800'
      }`}>
        {status === 'done' ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">方案已生成！点击查看</span>
          </>
        ) : status === 'error' ? (
          <>
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm font-medium">生成失败，点击重试</span>
          </>
        ) : (
          <>
            <svg className="animate-spin h-4 w-4 text-orange-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm font-medium">方案生成中...</span>
            <span className="text-xs text-gray-400">点击查看</span>
          </>
        )}
      </div>
    </div>
  );
}
