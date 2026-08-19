import { createScopedEventHandlers } from '../../core-modules/common/eventHandlers/generateEventHandlers';
import {
  createTRPCUntypedClient,
  httpBatchLink,
  TRPCRequestOptions,
} from '@trpc/client';
import * as trpcExpress from '@trpc/server/adapters/express';
import { IncomingHttpHeaders } from 'http';
import { getPlugin, isEnabled } from '../service-discovery';
import { generateRequestProcess, getEnv } from '../utils';
import { setEventHandlerRuntimeContext } from '../../core-modules/common/eventHandlers/runtimeContext';

export type MessageProps = {
  subdomain: string;
  method?: 'query' | 'mutation';
  pluginName: string;
  module: string;
  action: string;
  input: any;
  defaultValue?: any;
  options?: TRPCRequestOptions;
  context?: CommonTRPCContext;
  /**
   * Raise instead of returning `defaultValue` when the call could not be made
   * or did not complete — plugin disabled, no registered address, or any
   * transport/RPC error.
   *
   * Off by default, so existing callers are unaffected. Opt in wherever a
   * falsy `defaultValue` is indistinguishable from a real answer: with
   * `defaultValue: false`, "the service says no" and "the service never
   * answered" are the same value, and a caller that branches on it will take
   * the negative path during an outage while reporting nothing wrong.
   *
   * A caller that opts in MUST have somewhere for the error to go. tRPC already
   * models this correctly — a procedure signals failure by throwing, and the
   * client promise rejects — so this only stops discarding a signal the
   * transport was already given.
   */
  throwOnFailure?: boolean;
};

export type CommonTRPCContext = {
  processId?: string;
  userId?: string;
  cpUserId?: string;
};

export type ScopedEventHandlers = ReturnType<typeof createScopedEventHandlers>;

type RequestTRPCContext = {
  subdomain: string;
} & CommonTRPCContext;

export type TRPCContext = RequestTRPCContext & {
  eventHandlers: ScopedEventHandlers;
};

export interface InterMessage {
  subdomain: string;
  data?: any;
  timeout?: number;
  defaultValue?: any;
  thirdService?: boolean;
}

export interface RPSuccess {
  status: 'success';
  data?: any;
}
export interface RPError {
  status: 'error';
  errorMessage: string;
}
export type RPResult = RPSuccess | RPError;
export type RP = (params: InterMessage) => RPResult | Promise<RPResult>;

export const trpcContextHeaderName = 'x-trpc-context';

export function encodeTRPCContextHeader(
  subdomain: string,
  method: 'query' | 'mutation',
  context: CommonTRPCContext | undefined,
): string {
  const contextData = {
    subdomain,
    method,
    ...context,
  };
  const contextJson = JSON.stringify(contextData);
  return Buffer.from(contextJson, 'utf8').toString('base64');
}

/**
 * Decode the base64 JSON tRPC context header into tenant, method, and caller
 * context. Returns null when the header is absent or malformed. Note: the
 * header is an encoding, not an authentication credential.
 */
export function decodeTRPCContextHeader(headers: IncomingHttpHeaders): {
  subdomain: string;
  method: 'query' | 'mutation';
  context: CommonTRPCContext;
} | null {
  const contextHeader = headers[trpcContextHeaderName];
  if (!contextHeader) {
    return null;
  }
  if (Array.isArray(contextHeader)) {
    throw new Error(`Multiple ${trpcContextHeaderName} headers`);
  }
  try {
    const contextJson = Buffer.from(contextHeader, 'base64').toString('utf-8');
    const decoded = JSON.parse(contextJson);
    const { subdomain, method, ...context } = decoded;
    return { subdomain, method, context };
  } catch (error) {
    return null;
  }
}

export const sendTRPCMessage = async ({
  subdomain,
  pluginName,
  method,
  module,
  action,
  input,
  defaultValue,
  options,
  context,
  throwOnFailure = false,
}: MessageProps) => {
  if (!method) {
    method = 'query';
  }

  if (pluginName && !(await isEnabled(pluginName))) {
    if (throwOnFailure) {
      throw new Error(
        `[TRPC] Cannot call ${module}.${action}: plugin "${pluginName}" is not enabled`,
      );
    }
    return defaultValue;
  }

  const pluginInfo = await getPlugin(pluginName);

  const VERSION = getEnv({ name: 'VERSION' });

  let client;

  try {
    // Encode context into header
    const contextHeader = encodeTRPCContextHeader(subdomain, method, context);

    if (VERSION && VERSION === 'saas') {
      client = createTRPCUntypedClient({
        links: [
          httpBatchLink({
            url: `https://${subdomain}.next.erxes.io/gateway/pl:${pluginName}/trpc`,
            headers: () => ({
              [trpcContextHeaderName]: contextHeader,
            }),
          }),
        ],
      });
    } else {
      // Validate plugin address before constructing URL
      if (!pluginInfo.address || pluginInfo.address.trim() === '') {
        if (throwOnFailure) {
          throw new Error(
            `[TRPC] Cannot call ${module}.${action}: plugin "${pluginName}" address is not available`,
          );
        }
        console.warn(
          `Plugin "${pluginName}" address is not available. Returning defaultValue.`,
        );
        return defaultValue;
      }

      client = createTRPCUntypedClient({
        links: [
          httpBatchLink({
            url: `${pluginInfo.address}/trpc`,
            headers: () => ({
              [trpcContextHeaderName]: contextHeader,
            }),
          }),
        ],
      });
    }

    const result = await client[method](`${module}.${action}`, input, options);

    // `??`, not `||`. With `||` a legitimate falsy answer — `false` from a
    // boolean predicate, `0` from a count, `''` from a formatter — was
    // discarded and replaced by the caller's default, so a successful call
    // could not return the very value it was asked for. `segment.isInSegment`
    // is the clearest case: it returns `count > 0`, and every real `false` was
    // being overwritten. `??` substitutes only for null/undefined, which is
    // what "no value" was always meant to mean.
    return result ?? defaultValue;
  } catch (e: any) {
    if (throwOnFailure) {
      throw e;
    }

    // Previously this catch discarded `e` entirely — no log, no rethrow — so a
    // plugin outage and a legitimate negative answer were indistinguishable at
    // BOTH ends: the caller got the same value and nothing was written
    // anywhere. Its sibling sendCoreModuleProducer already logs here; matching
    // that is the minimum needed to tell the two apart after the fact.
    console.warn(
      `[TRPC] Error calling ${module}.${action} on plugin "${pluginName}": ` +
        `${e?.message || 'Unknown error'}. Returning defaultValue.`,
    );
    return defaultValue;
  }
};

/**
 * Shared plugin-context initialization for in-process tRPC execution:
 * request process state, event-handler runtime context, and scoped event
 * handlers. Used by the /trpc express adapter and by the agent-tools
 * endpoints so both paths build identical contexts.
 */
export const createPluginTRPCContext = async <TContext>(
  subdomain: string,
  reqContext: CommonTRPCContext,
  trpcContext?: (subdomain: string, context: any) => Promise<TContext>,
): Promise<TContext | TRPCContext> => {
  const processInfo = generateRequestProcess();

  const context: RequestTRPCContext = {
    ...processInfo,
    ...reqContext,
    subdomain,
  };

  const runtimeContext = {
    subdomain,
    processId: context.processId || '',
    userId: context.userId || '',
  };

  setEventHandlerRuntimeContext(subdomain, runtimeContext);

  const eventHandlers = createScopedEventHandlers(subdomain, runtimeContext);

  if (trpcContext) {
    return await trpcContext(subdomain, {
      ...context,
      eventHandlers,
    });
  }

  return {
    ...context,
    eventHandlers,
  };
};

export const createTRPCContext =
  <TContext>(
    trpcContext: (
      subdomain: string,
      context: any,
    ) => Promise<TContext & TRPCContext>,
  ) =>
  async ({
    req,
  }: trpcExpress.CreateExpressContextOptions): Promise<
    TContext & TRPCContext
  > => {
    // Extract context from header (encoded) or fallback to request body/input
    const decoded = decodeTRPCContextHeader(req.headers);
    const subdomain = decoded?.subdomain;
    const reqContext = decoded?.context;
    const method = decoded?.method || 'query';

    if (!subdomain || (method === 'mutation' && !reqContext)) {
      throw new Error('Invalid context');
    }

    return (await createPluginTRPCContext(
      subdomain,
      reqContext || {},
      trpcContext,
    )) as TContext & TRPCContext;
  };

export type ITRPCContext<TExtraContext = object> = Awaited<
  ReturnType<typeof createTRPCContext<TExtraContext>>
>;

export const ok = (data: any) => {
  return {
    status: 'success',
    data,
    timestamp: new Date().toISOString(),
  };
};

export const err = (error: any) => {
  return {
    status: 'error',
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message || error.message,
      details: error instanceof Error ? error.message : 'Database error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
      ...(error.suggestion && { suggestion: error.suggestion }),
    },
    timestamp: new Date().toISOString(),
  };
};
