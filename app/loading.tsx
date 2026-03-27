export default function Loading() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400 text-sm">加载中...</p>
      </div>
    </div>
  );
}
