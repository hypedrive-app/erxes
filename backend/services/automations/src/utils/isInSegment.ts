import { splitType, TAutomationProducers } from 'erxes-api-shared/core-modules';
import {
  sendCoreModuleProducer,
  sendTRPCMessage,
} from 'erxes-api-shared/utils';
import {
  compileSegmentToMongoSelector,
  hasSingleSegmentContentType,
} from './segmentMongoMatcher';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Answers whether a record is in a segment, and RAISES rather than guessing
 * when it cannot find out.
 *
 * `segment.isInSegment` returns `count > 0` — a genuine boolean — so "not in
 * the segment" is a real, common answer. Previously both calls below passed
 * `defaultValue: false`, which made that answer indistinguishable from a plugin
 * outage, a disabled plugin, a deleted segment id or an Elasticsearch failure:
 * every one of those produced `false`, so an automation silently enrolled
 * nothing and reported nothing wrong. The transports compounded it by
 * collapsing a legitimate `false` into the default as well, so even a
 * successful call could not return `false`.
 *
 * Both halves are now fixed in the transports (`?? ` instead of `||`, plus an
 * opt-in `throwOnFailure`), and this function opts in: a failure to evaluate is
 * an error, not a "no". Every caller is inside an error path that records the
 * failure — see the audit in the commit that introduced this.
 */
export const isInSegment = async (
  subdomain: string,
  segmentId: string,
  targetId: string,
  delayMs: number = 15000,
) => {
  const { canUseFastPath, loadSegment, segment } =
    await checkIsSegmentCanUseFastPath({ subdomain, segmentId });
  if (canUseFastPath && loadSegment) {
    const selector = await compileSegmentToMongoSelector({
      segment,
      loadSegment,
    });

    if (selector) {
      const [pluginName, moduleName, collectionType] = splitType(
        segment.contentType,
      );

      return await sendCoreModuleProducer({
        moduleName: 'automations',
        subdomain,
        pluginName,
        producerName: TAutomationProducers.CHECK_TARGET_MATCH,
        input: {
          moduleName,
          contentType: segment.contentType,
          collectionType,
          targetId,
          selector,
        },
        throwOnFailure: true,
      });
    }
  }

  await delay(delayMs);

  return await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    method: 'query',
    module: 'segment',
    action: 'isInSegment',
    input: { segmentId, idToCheck: targetId },
    throwOnFailure: true,
  });
};

const checkIsSegmentCanUseFastPath = async ({
  subdomain,
  segmentId,
}: {
  subdomain: string;
  segmentId: string;
}) => {
  const segmentCache = new Map<string, any>();

  const loadSegment = async (id: string) => {
    if (segmentCache.has(id)) {
      return segmentCache.get(id);
    }

    const loadedSegment = await sendTRPCMessage({
      subdomain,
      pluginName: 'core',
      method: 'query',
      module: 'segment',
      action: 'findOne',
      input: { _id: id },
      defaultValue: null,
    });

    segmentCache.set(id, loadedSegment);

    return loadedSegment;
  };

  const segment = await loadSegment(segmentId);

  if (!segment) {
    return { canUseFastPath: false };
  }

  const canUseFastPath =
    Boolean(segment.contentType) &&
    (await hasSingleSegmentContentType({
      segment,
      loadSegment,
    }));

  return { canUseFastPath, loadSegment, segment };
};
