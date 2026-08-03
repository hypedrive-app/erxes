import * as dotenv from 'dotenv';

import { getPlugin, getPlugins } from 'erxes-api-shared/utils';
import retry from '../util/retry';
import fetch from 'node-fetch';

export type ErxesProxyTarget = {
  name: string;
  address: string;
  config: any;
};

dotenv.config();

const { MAX_PLUGIN_RETRY } = process.env;

const maxPluginRetry = Number(MAX_PLUGIN_RETRY) || Number.MAX_SAFE_INTEGER;

async function getProxyTarget(name: string): Promise<ErxesProxyTarget> {
  const service = await getPlugin(name);

  if (!service.address) {
    throw new Error(`Plugin ${name} has no address value in service discovery`);
  }

  console.log(`${name} address: ${service.address}`);

  return {
    name,
    address: service.address,
    config: service.config,
  };
}

async function retryGetProxyTarget(name: string): Promise<ErxesProxyTarget> {
  const intervalSeconds = 1;
  return retry({
    fn: () => getProxyTarget(name),
    intervalMs: intervalSeconds * 1000,
    maxTries: maxPluginRetry,
    retryExhaustedLog: `Plugin ${name} still hasn't joined the service discovery after checking for ${maxPluginRetry} time(s) with ${intervalSeconds} second(s) interval. Retry exhausted.`,
    retryLog: `Waiting for plugin ${name} to join service discovery`,
    successLog: `Plugin ${name} joined service discovery.`,
  });
}

async function ensureGraphqlEndpointIsUp({
  address,
  name,
}: ErxesProxyTarget): Promise<void> {
  if (!address) return;

  const endpoint = `${address}/graphql`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      variables: null,
      query: `
          query SubgraphIntrospectQuery {
            _service {
              sdl
            }
          }
          `,
      operationName: 'SubgraphIntrospectQuery',
    }),
  });
  if (res.ok) {
    return;
  }

  throw new Error(
    `Plugin ${name}'s graphql endpoint ${endpoint} is not ready yet`,
  );
}

async function retryEnsureGraphqlEndpointIsUp(target: ErxesProxyTarget) {
  const { name, address } = target;

  const endpoint = `${address}/graphql`;
  await retry({
    fn: () => ensureGraphqlEndpointIsUp(target),
    intervalMs: 5 * 1000,
    maxTries: maxPluginRetry,
    retryExhaustedLog: `ERROR: ${name} graphql endpoint ${endpoint} isn't running.`,
    retryLog: `WAITING FOR: ${name} graphql endpoint ${endpoint}`,
    successLog: `UP: ${name} graphql endpoint ${endpoint}`,
  });
}

export async function retryGetProxyTargets(): Promise<ErxesProxyTarget[]> {
  try {
    const serviceNames = await getPlugins();

    // allSettled, not all: with Promise.all a single plugin that never joins
    // service discovery rejects the whole array, the catch below runs
    // process.exit(1), and main.ts never reaches httpServer.listen(). Under
    // `restart: unless-stopped` that is a permanent crash-loop in which the
    // gateway serves NOTHING — not /graphql, not /health, not the core-api
    // passthrough that /initial-setup and /core-login ride on. One misnamed or
    // slow-starting plugin therefore took down every working plugin with it.
    //
    // `core` is the exception and is still fatal: the gateway proxies its own
    // auth and setup routes to it, so a gateway without core is not degraded,
    // it is useless.
    const settled = await Promise.allSettled(
      serviceNames.map(retryGetProxyTarget),
    );

    const proxyTargets: ErxesProxyTarget[] = [];

    settled.forEach((outcome, idx) => {
      const name = serviceNames[idx];

      if (outcome.status === 'fulfilled') {
        proxyTargets.push(outcome.value);
        return;
      }

      if (name === 'core') {
        throw outcome.reason;
      }

      console.error(
        `Plugin ${name} never joined service discovery — starting without it. ` +
          `Its routes will 404 until it registers and the gateway is restarted.`,
        outcome.reason,
      );
    });

    // Same reasoning: a plugin whose graphql endpoint is down must not stop the
    // ones that are up. It is dropped from the targets rather than kept as a
    // target that would proxy into a dead address.
    const healthChecked = await Promise.allSettled(
      proxyTargets.map(retryEnsureGraphqlEndpointIsUp),
    );

    const liveTargets = proxyTargets.filter((target, idx) => {
      if (healthChecked[idx].status === 'fulfilled') return true;

      if (target.name === 'core') {
        throw (healthChecked[idx] as PromiseRejectedResult).reason;
      }

      console.error(
        `Plugin ${target.name} graphql endpoint never came up — dropping it from the proxy targets.`,
      );
      return false;
    });

    return liveTargets;
  } catch (e) {
    console.log(e);
    console.error(e);
    process.exit(1);
  }
}
