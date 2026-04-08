import Link from 'next/link';

const FEATURES = [
  { icon: '🎯', title: '5步深度定制', desc: '从同行人到预算，全方位个性化你的旅行' },
  { icon: '🤖', title: 'AI智能规划', desc: '通义千问大模型为你量身生成行程方案' },
  { icon: '🔄', title: '多方案对比', desc: '穷游、自驾、高铁、飞机一键对比费用' },
  { icon: '📱', title: '随时查看', desc: '所有行程自动保存，手机电脑随时访问' },
];

const STEPS_PREVIEW = [
  { num: '01', title: '填写目的地', desc: '列出想去哪，AI 帮你排先后顺序与走法' },
  { num: '02', title: '选择偏好', desc: '节奏、兴趣、预算等' },
  { num: '03', title: 'AI生成方案', desc: '多种出行方式对比' },
  { num: '04', title: '出发旅行', desc: '带上方案说走就走' },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50 to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 pt-20 pb-24 text-center">
          <div className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-sm font-medium rounded-full mb-6">
            AI 驱动 · 个性化定制
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
            你的专属<br />
            <span className="text-orange-500">旅行规划师</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10">
            输入目的地和你的偏好，AI 为你生成个性化旅行方案。<br />
            支持穷游、自驾、高铁、飞机多种模式一键对比。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/plan?quick=1"
              className="px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-orange-200 transition text-lg"
            >
              ⚡ 快速生成方案
            </Link>
            <Link
              href="/plan"
              className="px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-200 transition"
            >
              🎯 详细定制 →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">为什么选择旅行规划师</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 text-center hover:shadow-md hover:border-orange-100 transition">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">四步搞定旅行规划</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS_PREVIEW.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-bold text-orange-100 mb-3">{s.num}</div>
                <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">准备好出发了吗？</h2>
        <p className="text-gray-500 mb-8">免费注册，开始你的第一次 AI 旅行规划</p>
        <Link
          href="/plan"
          className="inline-block px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-orange-200 transition text-lg"
        >
          立即开始 →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-400">
          <p>旅行规划师 · AI 驱动的个性化旅行方案</p>
        </div>
      </footer>
    </div>
  );
}
