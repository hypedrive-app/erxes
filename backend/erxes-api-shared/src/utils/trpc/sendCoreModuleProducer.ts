import { getPlugin, isEnabled } from '../../utils/service-discovery';
import {
  createTRPCUntypedClient,
  httpBatchLink,
  TRPCRequestOptions,
} from '@trpc/client';
import { TAutomationProducers } from '../../core-modules/automations/types';
import { TAutomationProducersInput } from '../../core-modules/automations/zodTypes';
import { TSegmentProducers } from '../../core-modules/segments/types';
import { TAfterProcessProducers } from '../../core-modules/logs/types';
import {
  TBeforeResolversProducers,
  TBeforeResolversProducersInput,
} from '../apollo/beforeResolvers';
import { TSegmentProducersInput } from '../../core-modules/segments/zodSchemas';
import { TImportExportProducersInput } from '../../core-modules/import-export/zodSchemas';
import { TImportExportProducers } from '../../core-modules/import-export/types';
import { encodeTRPCContextHeader, TRPCContext, trpcContextHeaderName } from '.';
import {
  TRecordReferenceProducers,
  TRecordReferenceProducersInput,
} from '../../core-modules/common/references/types';
type TModuleProducerInputMap = {
  automations: {
    [K in TAutomationProducers]: TAutomationProducersInput[K];
  };
  segments: {
    [K in TSegmentProducers]: TSegmentProducersInput[K];
  };
  afterProcess: {
    [K in TAfterProcessProducers]: any;
  };
  beforeResolvers: {
    [K in TBeforeResolversProducers]: TBeforeResolversProducersInput[K];
  };
  importExport: {
    [K in TImportExportProducers]: TImportExportProducersInput[K];
  };
  references: {
    [K in TRecordReferenceProducers]: TRecordReferenceProducersInput[K];
  };
};

type TCoreModuleProducer<
  TModuleName extends keyof TModuleProducerInputMap =
    keyof TModuleProducerInputMap,
  TProducerName extends keyof TModuleProducerInputMap[TModuleName] =
    keyof TModuleProducerInputMap[TModuleName],
> = {
  subdomain: string;
  moduleName: TModuleName;
  producerName: TProducerName;
  method?: 'query' | 'mutation';
  pluginName: string;
  input: TModuleProducerInputMap[TModuleName][TProducerName];
  defaultValue?: any;
  options?: TRPCRequestOptions;
  context?: TRPCContext;
  /**
   * Raise instead of returning `defaultValue` when the call could not be made —
   * plugin disabled or no registered address. Transport errors already throw
   * from the catch below regardless of this flag.
   *
   * Off by default, so existing callers are unaffected. See the same option on
   * `sendTRPCMessage` for why a falsy `defaultValue` makes an outage
   * indistinguishable from a real negative answer.
   */
  throwOnFailure?: boolean;
};

export const sendCoreModuleProducer = async <
  TModuleName extends keyof TModuleProducerInputMap =
    keyof TModuleProducerInputMap,
  TProducerName extends keyof TModuleProducerInputMap[TModuleName] =
    keyof TModuleProducerInputMap[TModuleName],
>({
  subdomain,
  moduleName,
  pluginName,
  method = 'mutation',
  producerName,
  input,
  defaultValue,
  options,
  context,
  throwOnFailure = false,
}: TCoreModuleProducer<TModuleName, TProducerName>): Promise<any> => {
  if (pluginName && !(await isEnabled(pluginName))) {
    if (throwOnFailure) {
      throw new Error(
        `[TRPC] Cannot call ${String(producerName)}: plugin "${pluginName}" is not enabled`,
      );
    }
    return defaultValue;
  }

  const pluginInfo = await getPlugin(pluginName);

  // Validate plugin address before constructing URL
  if (!pluginInfo.address || pluginInfo.address.trim() === '') {
    if (throwOnFailure) {
      throw new Error(
        `[TRPC] Cannot call ${String(producerName)}: plugin "${pluginName}" address is not available`,
      );
    }
    console.warn(
      `Plugin "${pluginName}" address is not available. Returning defaultValue.`,
    );
    return defaultValue;
  }
  const contextHeader = encodeTRPCContextHeader(subdomain, method, context);

  const baseUrl = `${pluginInfo.address}/${moduleName}`;

  try {
    const client = createTRPCUntypedClient({
      links: [
        httpBatchLink({
          url: baseUrl,
          headers: () => ({
            [trpcContextHeaderName]: contextHeader,
          }),
        }),
      ],
    });

    const result = await client[method](
      String(producerName),
      { subdomain, data: input ?? {} },
      options,
    );

    // `??`, not `||` — see the matching comment in sendTRPCMessage. A
    // legitimate falsy answer (a boolean predicate's `false`, a count's `0`)
    // was being discarded and replaced by the caller's default, so a call that
    // succeeded could not return the value it was asked for.
    return result ?? defaultValue;
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.cause?.code || error?.code;

    if (errorCode === 'ECONNREFUSED') {
      console.warn(
        `[TRPC] Connection refused to plugin "${pluginName}" at ${baseUrl}. ` +
          `The plugin service may not be running or is not accessible. ` +
          `Returning defaultValue.`,
      );
    } else {
      console.warn(
        `[TRPC] Error calling plugin "${pluginName}" at ${baseUrl}: ${errorMessage}. ` +
          `Returning defaultValue.`,
      );
    }

    throw error;
  }
};
