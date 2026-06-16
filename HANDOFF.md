# 项目接手说明（给 Codex）

最后更新：2026-06-16　交接自 Claude 工作流。下面是接手这个项目需要知道的全部要点。

## 1. 这是什么

AI 旅行规划 Web 应用「旅行规划师」。用户填 9 步问卷 → 大模型生成多日行程（每日时间线、费用拆解、地图、订票/导航入口），支持游客直接生成、登录后保存历史、对话改方案。

- 线上地址：https://travel-planner-zy.fly.dev
- 仓库：GitHub `isarazyy/travel-planner`，主分支 `main`

## 2. 技术栈

| 层 | 用什么 |
|----|--------|
| 框架 | Next.js **16.2.1**（App Router）+ React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 大模型 | 通义千问 DashScope（默认 qwen-turbo，对话用 qwen-plus） |
| 地图/POI/驾车/天气 | 高德地图 REST + Open-Meteo（天气免 Key） |
| 联网检索 | Tavily（可选，住宿优劣势归纳） |
| 数据库/账号 | Supabase（PostgreSQL + Auth） |
| 部署 | **Fly.io**（app=`travel-planner-zy`，region=`nrt` 东京） |

> 注意：`AGENTS.md` 提醒——这版 Next.js 16 有 break changes，写代码前先看 `node_modules/next/dist/docs/`。README 里写的「Vercel 部署」是早期文案，**实际线上跑在 Fly.io**。

## 3. 跑起来

```bash
npm install
cp .env.example .env.local   # 填入真实 Key（见下）
npm run dev                  # http://localhost:3000
npm run build                # 部署前必过
```

环境变量见 `.env.example`。真实密钥在本机 `.env.local`（**未打包、未提交**）。Fly 线上的公开 Key 写在 `fly.toml` 的 build args，服务端密钥（DASHSCOPE_API_KEY / AMAP_KEY / SUPABASE_SERVICE_ROLE_KEY 等）在 Fly secrets，用 `fly secrets list` 查。

## 4. 部署流程（重要）

**push 到 `main` 会自动触发 Fly 部署**（GitHub Actions）。本机 `flyctl` 直连 api.fly.io 被网络墙，所以一律走 Actions：

```bash
git push origin main
# 看部署：
gh run watch $(gh run list --workflow=fly-deploy.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

`.github/workflows/`：
- `fly-deploy.yml`：push main 自动部署
- `fly-region.yml`：手动迁移机器到指定 region
- `supabase-keepalive.yml`：每天 ping Supabase，防免费项目休眠（曾导致登录 fetch failed）

## 5. 代码结构

- `app/` 页面与 API 路由（`api/generate` 生成主流程、`api/plan-chat` 对话改方案、`api/auth/*` 登录、`api/trips/*` 历史、`api/share` 分享、`api/amap/*`、`api/nav`）
- `components/` UI；核心是 `StepForm/`（9 步问卷）、`PlanResultDirect.tsx`（结果页/改行程/今日导览）、`DayTimeline.tsx`（每日时间线/订票）
- `lib/`（40 个文件）核心逻辑：
  - `prompts.ts` —— **提示词，体量大、最关键**，改生成质量基本都动它
  - `qwen.ts` / `qwen-models.ts` —— 大模型调用与模型选择
  - `amap-*.ts` —— 高德（poi/transit/driving/loader/uri）
  - `backfill-driving.ts` —— 用高德真实驾车数据回填里程/时长/过路费
  - `post-enrich-poi.ts` / `post-enrich-transit.ts` —— 生成后补图片/交通
  - `normalize-plan.ts` —— 规整大模型输出结构
  - `weather.ts` / `trip-web-search.ts` / `hotel-web-search.ts` / `usage-limit.ts`
- `supabase/` 建表 SQL 与 migration（新项目跑 `schema.sql`，老项目补 `migrations/002_*.sql`）

## 6. 近期做了什么（最新在前）

- **同行人并入快速预设**：原来「快速预设」和「同行人」两处会互相覆盖人数/人群，已合并为单一入口（`StepTravelStyle.tsx`），人数/童龄作为所选人群的细化项。
- **自驾交通地理准确性**：禁止大模型编造途经城市（如上海→黄山曾误写"途经南昌"）和精确路费，改为区间+"以导航实际为准"；few-shot 示例同步改。`backfill-driving.ts` 加了地理编码错配兜底（单段 >2000km 或时长远超预估则丢弃，曾出现"黄山→宏村 2652km/3228元"垃圾）。
- **路线真实性**：长途自驾按 ~90km/h 估时，长转场日活动减负，返程日要有真实活动；重写了北京→青岛 few-shot 示例。
- **功能补全**：门票预订入口、景点介绍做实（图片/评分/营业时间）、人群偏好预设、手动改行程、当天导览模式、移动端打磨。
- **稳定性**：HTML 不长期缓存 + `ChunkReloadGuard` 防部署后白屏；Supabase keepalive 防休眠。

## 7. 已知坑 / 待办

- **访问慢**：用户在国内，Fly 把流量从美西边缘转发到东京机器，TTFB 偏高。属网络地理问题，非代码 bug。张阳已决定**暂不花钱**迁移/加边缘，保持现状。
- **双方案差异化**（同时生成两套差异明显的方案）一直没做，因成本/延迟，张阳明确**先不做**。
- **高德地理编码歧义**：同名地名（如"宏村"）偶尔定位到外省。已加兜底丢弃离谱结果，但根治需带城市上下文做地理编码（`amap-driving.ts` / `amap-transit.ts` 的 geocode 没传 city）。
- README 的部署章节还停留在 Vercel，需要时更新为 Fly。

## 8. 改东西的固定动作

1. 改完 `npm run build` 必须过
2. `git push origin main` 触发部署，用 gh 看 Actions 结果
3. 用 curl 打线上 `/api/generate` 验证（SSE，取最后一行 `data:` 解析 JSON）
4. 生成质量类问题：先怀疑 `prompts.ts` 的 few-shot 示例（示例的影响力 > 抽象规则，多次踩坑验证）
