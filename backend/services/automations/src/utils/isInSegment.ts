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

// NOTE (known defect, deliberately not worked around here): both transports end
// in `return result || defaultValue`, so with `defaultValue: false` below, a
// plugin outage, a disabled plugin, a deleted segment id or an Elasticsearch
// failure is indistinguishable from a legitimate "this record is not in the
// segment" — the automation silently never enrols and reports nothing wrong.
//
// It cannot be fixed from this call site. A sentinel `defaultValue` is defeated
// by that same `||`: a real `false` would be replaced by the sentinel and every
// genuine non-match would then raise. The fix belongs in the transports, which
// must stop collapsing a falsy result into the default and must distinguish
// "did not answer" from "answered no" — a change that touches every call site
// and so needs its own pass.
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
        defaultValue: false,
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
    defaultValue: false,
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
