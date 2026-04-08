'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  is_whitelisted: boolean;
  is_blacklisted: boolean;
  generation_count: number;
  chat_count: number;
  total_tokens: number;
  estimated_cost_yuan: number;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  todayNew: number;
  totalGenerations: number;
  whitelistedCount: number;
  blacklistedCount: number;
  totalTokens: number;
  totalCostYuan: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setError('无权访问管理后台。请用管理员账号登录。');
        } else {
          setError(data.error || '加载失败');
        }
        return;
      }
      setUsers(data.users || []);
      setStats(data.stats || null);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  async function toggleWhitelist(userId: string, current: boolean) {
    setToggling(userId);
    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, whitelisted: !current }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, is_whitelisted: !current } : u,
          ),
        );
      }
    } catch {} finally { setToggling(null); }
  }

  async function toggleBlacklist(userId: string, current: boolean) {
    setToggling(userId);
    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, blacklisted: !current }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId
              ? { ...u, is_blacklisted: !current, is_whitelisted: !current ? false : u.is_whitelisted }
              : u,
          ),
        );
      }
    } catch {} finally { setToggling(null); }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-gray-600 mb-4">{error}</p>
        <Link href="/login?redirect=/admin" className="text-orange-500 hover:text-orange-600 font-medium">
          去登录 →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
        <button
          onClick={() => { setLoading(true); fetchUsers(); }}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          刷新数据
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">总用户</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-emerald-600">{stats.todayNew}</p>
            <p className="text-xs text-gray-500">今日新增</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-orange-600">{stats.totalGenerations}</p>
            <p className="text-xs text-gray-500">总生成次数</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-blue-600">{stats.whitelistedCount}</p>
            <p className="text-xs text-gray-500">白名单</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-red-600">{stats.blacklistedCount}</p>
            <p className="text-xs text-gray-500">黑名单</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-purple-600">{formatTokens(stats.totalTokens)}</p>
            <p className="text-xs text-gray-500">总 Tokens</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-amber-600">¥{stats.totalCostYuan.toFixed(2)}</p>
            <p className="text-xs text-gray-500">预估费用</p>
          </div>
        </div>
      )}

      {/* User table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 text-left font-medium text-gray-600">邮箱</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">生成</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">对话</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Tokens</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">费用(¥)</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">状态</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">注册时间</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.user_id} className={`hover:bg-gray-50/50 ${u.is_blacklisted ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-3 text-gray-900 font-medium max-w-[200px] truncate">
                      {u.email}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">
                      {u.generation_count || 0}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">
                      {u.chat_count || 0}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">
                      {formatTokens(u.total_tokens || 0)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">
                      {(parseFloat(String(u.estimated_cost_yuan)) || 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {u.is_blacklisted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          已拉黑
                        </span>
                      ) : u.is_whitelisted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          白名单
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          普通
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(u.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!u.is_blacklisted && (
                          <button
                            onClick={() => toggleWhitelist(u.user_id, u.is_whitelisted)}
                            disabled={toggling === u.user_id}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition disabled:opacity-50 ${
                              u.is_whitelisted
                                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {u.is_whitelisted ? '移除白名单' : '加白'}
                          </button>
                        )}
                        <button
                          onClick={() => toggleBlacklist(u.user_id, u.is_blacklisted)}
                          disabled={toggling === u.user_id}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition disabled:opacity-50 ${
                            u.is_blacklisted
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-600 hover:bg-red-100'
                          }`}
                        >
                          {toggling === u.user_id
                            ? '...'
                            : u.is_blacklisted
                              ? '解除拉黑'
                              : '拉黑'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
