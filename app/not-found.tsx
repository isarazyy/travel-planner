import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <p className="text-6xl mb-4">🗺️</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">页面不存在</h1>
        <p className="text-gray-500 mb-6">你要找的页面走丢了</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition"
        >
          回到首页
        </Link>
      </div>
    </div>
  );
}
