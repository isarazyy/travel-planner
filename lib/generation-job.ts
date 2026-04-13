/**
 * Background generation job manager.
 * Uses Supabase `generation_jobs` table to track async plan generation.
 */
import { createAdminClient } from './supabase-admin';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface GenerationJob {
  id: string;
  user_id: string;
  status: JobStatus;
  form_data: any;
  trip_id: string | null;
  result: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function createJob(userId: string, formData: any): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('generation_jobs')
    .insert({ user_id: userId, status: 'pending', form_data: formData })
    .select('id')
    .single();

  if (error) {
    console.error('[job] create failed:', error.message);
    return null;
  }
  return data.id;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra?: { result?: any; trip_id?: string; error_message?: string },
) {
  const admin = createAdminClient();
  if (!admin) return;

  const update: Record<string, any> = { status, updated_at: new Date().toISOString() };
  if (extra?.result !== undefined) update.result = extra.result;
  if (extra?.trip_id) update.trip_id = extra.trip_id;
  if (extra?.error_message) update.error_message = extra.error_message;

  const { error } = await admin
    .from('generation_jobs')
    .update(update)
    .eq('id', jobId);

  if (error) console.error('[job] update failed:', error.message);
}

export async function getJob(jobId: string, userId: string): Promise<GenerationJob | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as GenerationJob;
}

export async function getLatestPendingJob(userId: string): Promise<GenerationJob | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as GenerationJob;
}
