import { z } from 'zod';
import { TAutomationProducers } from './types';

export const AutomationBaseInput = z.object({
  subdomain: z.string(),
  data: z.any().optional(),
});

/**
 * An optional field on a document read back out of Mongo.
 *
 * `.optional()` alone permits `undefined` and REJECTS `null`, which is the
 * wrong shape here: these fields are declared `{ type: String, optional: true }`
 * in definitions/, and an unset optional path materialises as `null`, not
 * `undefined`, once the document crosses the tRPC/queue JSON boundary.
 * Validation therefore failed for every cross-service action dispatch with
 *   {"code":"invalid_type","expected":"string","received":"null",
 *    "path":["data","action","workflowId"]}
 * and the automation died immediately after its trigger matched — the split
 * evaluated correctly, then nothing was tagged and no task was created.
 *
 * Accepting `null` and normalising it to `undefined` fixes the boundary
 * WITHOUT widening the types every consumer sees: IAutomationExecution and
 * friends still declare `field?: string`, so no downstream code has to learn
 * about a null it never received before. Widening the schema alone does not
 * work — it makes the inferred type `string | null | undefined` and breaks
 * assignment to those interfaces in core-api, sales, frontline and operation.
 */
const storedOptional = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullish()
    .transform((value) => (value === null ? undefined : value)) as z.ZodType<
    z.infer<T> | undefined,
    z.ZodTypeDef,
    z.infer<T> | null | undefined
  >;

// STORED subdocument, nested inside AutomationExecutionInput.actions — so it
// is on the same failing path. See AutomationActionInput for why `.optional()`
// is wrong for a field read back out of Mongo.
export const AutomationExecActionInput = z.object({
  createdAt: storedOptional(z.string()),
  startedAt: storedOptional(z.string()),
  finishedAt: storedOptional(z.string()),
  durationMs: storedOptional(z.number()),
  status: storedOptional(z.enum(['success', 'error', 'waiting'])),
  actionId: z.string(),
  actionType: z.string(),
  actionConfig: z.any().optional(),
  nextActionId: storedOptional(z.string()),
  result: z.any().optional(),
});

// Also a STORED document — see AutomationActionInput below for why every
// absent field arrives as `null` rather than `undefined`, and why `.optional()`
// is the wrong validator for that.
export const AutomationExecutionInput = z.object({
  _id: z.string(),
  createdAt: storedOptional(z.string()),
  modifiedAt: storedOptional(z.string()),
  automationId: z.string(),
  triggerId: z.string(),
  triggerType: z.string(),
  triggerConfig: z.record(z.any()),
  nextActionId: storedOptional(z.string()),
  targetId: z.string(),
  target: z.record(z.any()),
  status: z.string(),
  description: z.string(),
  actions: storedOptional(z.array(AutomationExecActionInput)),
  // Arrives as a Date in-process but as an ISO string after crossing the
  // queue/producer JSON boundary (same reason createdAt is a string above)
  startWaitingDate: storedOptional(z.date()),
  waitingActionId: storedOptional(z.string()),
  objToCheck: storedOptional(z.record(z.any())),
  responseActionId: storedOptional(z.string()),
});

// Mirrors a STORED action document — `workflowId` and `targetActionId` here are
// the two fields whose `null` broke every cross-service dispatch. See
// storedOptional above.
export const AutomationActionInput = z.object({
  id: z.string(),
  type: z.string(),
  nextActionId: storedOptional(z.string()),
  config: z.any().optional(),
  style: z.any(),
  icon: storedOptional(z.string()),
  label: storedOptional(z.string()),
  description: storedOptional(z.string()),
  workflowId: storedOptional(z.string()),
  targetActionId: storedOptional(z.string()),
});

export const ReceiveActionsInputData = z.object({
  moduleName: z.string(),
  actionType: z.string(),
  action: AutomationActionInput,
  execution: AutomationExecutionInput,
  collectionType: z.string(),
});
export const ReceiveActionsInput = AutomationBaseInput.extend({
  data: ReceiveActionsInputData,
});

export const CheckCustomTriggerInputData = z.object({
  moduleName: z.string(),
  collectionType: z.string(),
  relationType: z.string().optional(),
  automationId: z.string(),
  // STORED trigger document — same null-vs-undefined problem as
  // AutomationActionInput. `workflowId` in particular was already worked around
  // once by stripping nulls out of the stored automations by hand; widening the
  // validator fixes the cause instead, for every automation rather than the
  // ones that happened to be repaired.
  trigger: z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.any()),
    actionId: storedOptional(z.string()),
    style: z.any().nullish(),
    icon: storedOptional(z.string()),
    label: storedOptional(z.string()),
    description: storedOptional(z.string()),
    isCustom: storedOptional(z.boolean()),
    workflowId: storedOptional(z.string()),
  }),
  target: z.record(z.any()),
  config: z.record(z.any()),
  eventUpdateDescription: z.record(z.string(), z.any()).optional(),
});

export const CheckTargetMatchInputData = z.object({
  moduleName: z.string(),
  contentType: z.string(),
  collectionType: z.string(),
  targetId: z.string(),
  selector: z.record(z.any()),
});

export const FindObjectInputData = z.object({
  objectType: z.string(),
  field: z.string(),
  value: z.string(),
});

export const ResolveOutputPathsInputData = z.object({
  nodeType: z.string(),
  source: z.record(z.any()),
  paths: z.array(z.string()),
  defaultValue: z.any().optional(),
});

export const SetPropertiesInputData = z.object({
  moduleName: z.string(),
  triggerType: z.string(),
  targetType: z.string(),
  actionType: z.string(),
  action: AutomationActionInput,
  execution: AutomationExecutionInput,
  collectionType: z.string(),
});

export const GenerateAiContextInputData = z.object({
  moduleName: z.string(),
  collectionType: z.string().optional(),
  triggerType: z.string(),
  target: z.record(z.any()),
});

export const LoadAiKnowledgeDocumentBatchInputData = z.object({
  moduleName: z.string(),
  sourceKey: z.string(),
  sourceIds: z.array(z.string()).max(1000).optional(),
  candidateSourceIds: z.array(z.string()).max(1000).optional(),
  config: z.record(z.unknown()).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  skipTotalCount: z.boolean().optional(),
});

export const LookupAiToolInputData = z.object({
  moduleName: z.string(),
  toolKey: z.string(),
  query: z.string().default(''),
  limit: z.number().int().min(1).max(20).optional(),
  filters: z.record(z.unknown()).optional(),
});

export const CheckCustomTriggerInput = AutomationBaseInput.extend({
  data: CheckCustomTriggerInputData,
});

export const CheckTargetMatchInput = AutomationBaseInput.extend({
  data: CheckTargetMatchInputData,
});

export const FindObjectInput = AutomationBaseInput.extend({
  data: FindObjectInputData,
});

export const ResolveOutputPathsInput = AutomationBaseInput.extend({
  data: ResolveOutputPathsInputData,
});

export const SetPropertiesInput = AutomationBaseInput.extend({
  data: SetPropertiesInputData,
});

export const GenerateAiContextInput = AutomationBaseInput.extend({
  data: GenerateAiContextInputData,
});

export const LoadAiKnowledgeDocumentBatchInput = AutomationBaseInput.extend({
  data: LoadAiKnowledgeDocumentBatchInputData,
});

export const LookupAiToolInput = AutomationBaseInput.extend({
  data: LookupAiToolInputData,
});

export type TAutomationProducersInput = {
  [TAutomationProducers.RECEIVE_ACTIONS]: z.infer<
    typeof ReceiveActionsInputData
  >;
  [TAutomationProducers.CHECK_CUSTOM_TRIGGER]: z.infer<
    typeof CheckCustomTriggerInputData
  >;
  [TAutomationProducers.CHECK_TARGET_MATCH]: z.infer<
    typeof CheckTargetMatchInputData
  >;
  [TAutomationProducers.FIND_OBJECT]: z.infer<typeof FindObjectInputData>;
  [TAutomationProducers.RESOLVE_OUTPUT_PATHS]: z.infer<
    typeof ResolveOutputPathsInputData
  >;
  [TAutomationProducers.SET_PROPERTIES]: z.infer<typeof SetPropertiesInputData>;

  [TAutomationProducers.GENERATE_AI_CONTEXT]: z.infer<
    typeof GenerateAiContextInputData
  >;
  [TAutomationProducers.LOAD_AI_KNOWLEDGE_DOCUMENT_BATCH]: z.infer<
    typeof LoadAiKnowledgeDocumentBatchInputData
  >;
  [TAutomationProducers.LOOKUP_AI_TOOL]: z.infer<typeof LookupAiToolInputData>;
};
