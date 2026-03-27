# 旅行规划师 🗺️

AI 驱动的个性化旅行规划 Web 应用。

## 功能

- 9步深度定制问卷（同行人、节奏、兴趣、住宿、餐饮、预算、交通等）
- AI 智能生成（通义千问大模型）
- 4种出行方式对比（穷游/自驾/高铁/飞机）
- 每日时间线 + 费用拆解
- 账号系统 + 历史行程管理
- 手机/电脑响应式设计

## 技术栈

- Next.js 16 + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- 通义千问 (DashScope API)
- Vercel 部署

## 本地开发

```bash
npm install
npm run dev
```

### 可选：住宿联网检索（Tavily）

小红书 / 大众点评 / 美团没有面向第三方的免费开放 API。配置 [Tavily](https://tavily.com) 后，服务端会**自动搜索公开网页摘要**，再交给大模型**汇总成各酒店的优劣势**（页面不展示外链，只展示归纳结果）。未配置时则仅为模型常识推断。

在 `.env.local` 中增加：

```bash
TAVILY_API_KEY=tvly-你的密钥
```

### 天气预报（Open-Meteo）

生成行程时会自动请求 [Open-Meteo](https://open-meteo.com/)（**无需 API Key**）获取目的地日预报：晴雨概况、最低/最高气温、降水概率，并写入提示词与结果页。若尚未填写具体目的地（主题/开放模式），则暂用**出发地**坐标作为参考。

## 部署步骤

### 1. 创建 Supabase 项目

1. 访问 https://supabase.com 注册并创建项目
2. 进入 SQL Editor，粘贴 `supabase/schema.sql` 的内容执行
3. 在 Settings > API 页面获取 Project URL 和 anon key

### 2. 获取千问 API Key

1. 访问 https://dashscope.console.aliyun.com/
2. 创建 API Key

### 3. 配置环境变量

复制 `.env.local` 并填入实际值：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
DASHSCOPE_API_KEY=sk-xxx...
```

### 4. 部署到 Vercel

```bash
vercel
```

或者直接在 Vercel Dashboard 导入 GitHub 仓库，并在 Environment Variables 中配置以上三个变量。
