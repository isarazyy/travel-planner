'use client';

import { Suspense, useState } from 'react';
import { isConfigured } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('returnTo') || searchParams.get('redirect') || '/';
  const justRegistered = searchParams.get('registered') === '1';

  const skipTarget = redirect && redirect !== '/login' ? redirect : '/plan';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '登录失败');
        setLoading(false);
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
      {!isConfigured && (
        <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/80 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">当前未连接账号系统</p>
          <Link
            href={skipTarget}
            className="flex w-full items-center justify-center py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition"
          >
            暂不登录，直接使用 →
          </Link>
        </div>
      )}

      {justRegistered && (
        <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-lg text-sm border border-emerald-100">
          注册成功！请用刚才的邮箱和密码登录。
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
          placeholder="your@email.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
          placeholder="至少6位"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '登录中...' : '登录'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-500">
          没有账户？{' '}
          <Link href="/register" className="text-orange-500 hover:text-orange-600 font-medium">
            注册
          </Link>
        </p>
        <Link href={skipTarget} className="text-gray-400 hover:text-gray-600">
          跳过登录 →
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">欢迎回来</h1>
          <p className="text-gray-500 mt-2">登录你的旅行规划账户</p>
        </div>
        <Suspense fallback={<div className="text-center text-gray-400">加载中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
