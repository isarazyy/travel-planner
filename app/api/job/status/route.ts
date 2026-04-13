import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/generation-job';
import { getOptionalUser } from '@/lib/optional-auth';

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('id');
  if (!jobId) {
    return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
  }

  const { userId } = await getOptionalUser();
  if (!userId) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const job = await getJob(jobId, userId);
  if (!job) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  const res: Record<string, unknown> = {
    status: job.status,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };

  if (job.status === 'done' && job.result) {
    res.result = job.result;
    res.tripId = job.trip_id;
  }
  if (job.status === 'error') {
    res.errorMessage = job.error_message || '生成失败';
  }

  return NextResponse.json(res);
}
