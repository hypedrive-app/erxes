import { handleTrigger } from '../executions/handleTrigger';
import type { Job } from 'bullmq';
import { debugError } from '../debugger';
import { IJobData } from './initMQWorkers';

// Type for trigger job data
interface ITriggerData {
  type: string;
  actionType: string;
  targets: unknown[]; // Replace with actual type if known
  recordType?: string;
  repeatOptions?: {
    executionId: string;
    actionId: string;
    optionalConnectId?: string;
  };
}

// Final job interfaces
type ITriggerJobData = IJobData<ITriggerData>;

export const triggerHandlerWorker = async (job: Job<ITriggerJobData>) => {
  const { subdomain, data } = job?.data ?? {};

  console.info(
    `Trigger worker received data: ${JSON.stringify({ subdomain, data })}`,
  );
  try {
    await handleTrigger(subdomain, data);
  } catch (error: any) {
    debugError(`Error processing job ${job.id}: ${error.message}`);

    // Rethrow. Swallowing here resolved the processor, so BullMQ marked the job
    // COMPLETED and createMQWorkerWithListeners' 'completed' listener logged
    // "completed successfully" — a total failure to process a trigger reported
    // as a success, with no failed-job record and nothing to alert on.
    //
    // The original comment justified the swallow as preventing job retries.
    // That does not hold: no `attempts` is configured for this worker
    // (initMQWorkers -> createMQWorkerWithListeners passes no workerOptions),
    // and BullMQ's default is a single attempt. So there is no retry to
    // prevent — the only effect was hiding the failure.
    //
    // The 'failed' listener already logs the error and BullMQ records the job
    // as failed, which is what makes these visible at all.
    throw error;
  }
};
