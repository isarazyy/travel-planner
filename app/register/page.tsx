'use client';

import { useState } from 'react';
import { createClient, isConfigured } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError('Supabase 未配置：本地请改 .env.local；线上请在 Vercel → Environment Variables 添加 NEXT_PUBLIC_SUPABASE_* 后重新部署');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/login?registered=1');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">创建账户</h1>
          <p className="text-gray-500 mt-2">开始定制你的旅行规划</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
          {!isConfigured && (
            <div className="bg-amber-50 text-amber-700 px-4 py-3 rounded-lg text-sm space-y-2">
              <p>⚠️ Supabase 尚未配置，登录/注册不可用。</p>
              <ul className="list-disc pl-4 text-xs space-y-1">
                <li>
                  <strong>本地：</strong> <code className="bg-amber-100 px-1 rounded">.env.local</code> 中填写{' '}
                  <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> 与{' '}
                  <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
                </li>
                <li>
                  <strong>Vercel：</strong> Settings → Environment Variables → 添加上述两项（Production）→ Redeploy
                </li>
              </ul>
              <p className="text-xs">Supabase：Project Settings → API 可复制 URL 与 anon key。</p>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
              placeholder="再输入一次密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '注册中...' : '注册'}
          </button>

          <p className="text-center text-sm text-gray-500">
            已有账户？{' '}
            <Link href="/login" className="text-orange-500 hover:text-orange-600 font-medium">
              登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
