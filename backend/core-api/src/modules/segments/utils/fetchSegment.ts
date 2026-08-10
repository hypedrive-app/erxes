import { splitType } from 'erxes-api-shared/core-modules';
import {
  fetchEs,
  fetchEsWithScroll,
  generateElkIds,
  getEsIndexByContentType,
  getPluginSegmentConfig,
  getRealIdFromElk,
} from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { IOptions } from '../types';
import { generateQueryBySegment } from './common';

export const fetchSegment = async (
  models: IModels,
  subdomain: string,
  segment,
  options: IOptions = {},
): Promise<any> => {
  const { contentType } = segment;

  const { pluginConfigs, mongoConnectionString } =
    await getPluginSegmentConfig(contentType);

  let index = await getEsIndexByContentType(contentType);
  let selector = { bool: {} };

  await generateQueryBySegment(models, subdomain, {
    segment,
    selector: selector.bool,
    options,
    pluginConfigs,
    isInitialCall: true,
  });
  const { returnAssociated } = options;

  if (returnAssociated && contentType !== returnAssociated.relType) {
    index = await getEsIndexByContentType(returnAssociated.relType);

    const itemsResponse = await fetchEs({
      subdomain,
      action: 'search',
      connectionString: mongoConnectionString,
      index: await getEsIndexByContentType(returnAssociated.mainType),
      body: {
        query: selector,
        _source: '_id',
      },
      defaultValue: { body: { hits: { hits: [] } } },
    });

    // ES 7 client replies are enveloped as { body, statusCode, headers }.
    const items = (itemsResponse?.body ?? itemsResponse)?.hits?.hits ?? [];
    const itemIds = items.map((i) => getRealIdFromElk(i._id));

    const associationIds = await models.Conformities.filterConformity({
      mainType: splitType(returnAssociated.mainType)[2],
      mainTypeIds: itemIds,
      relType: splitType(returnAssociated.relType)[2],
    });

    selector = {
      bool: {
        must: [
          {
            terms: {
              _id: await generateElkIds(associationIds, subdomain),
            },
          },
        ],
      },
    };
  }

  if (options.returnSelector) {
    return selector;
  }

  // count entries
  if (options.returnCount) {
    const countResponse = await fetchEs({
      subdomain,
      action: 'count',
      connectionString: mongoConnectionString,
      index,
      body: {
        query: selector,
      },
      // Shape must match what the client returns (`{ body: { count } }`), or
      // the read below silently yields `undefined` instead of the sentinel.
      defaultValue: { body: { count: -1 } },
    });

    return countResponse?.body?.count;
  }

  const { sortField, sortDirection, page, perPage } = options;

  let pagination = {};

  if (page && perPage) {
    pagination = {
      from: (page - 1) * perPage,
      size: perPage,
    };
  }

  if (sortField && sortDirection) {
    pagination = {
      ...pagination,
      sort: {
        [sortField]: {
          order: sortDirection
            ? sortDirection === -1
              ? 'desc'
              : 'asc'
            : 'desc',
        },
      },
    };
  }

  const fetchOptions: any = {
    subdomain,
    action: 'search',
    connectionString: mongoConnectionString,
    index,
    body: {
      _source: options.returnFields || options.returnFullDoc || false,
      query: selector,
      ...pagination,
    },
    defaultValue: { body: { hits: { hits: [] } } },
  };

  if (options.scroll && options.perPage) {
    // keep the search results "scrollable" for 1 minute
    fetchOptions.scroll = '1m';
    fetchOptions.size = perPage;

    const results: any[] = [];
    const resp: any[] = [];

    const initialResponse = await fetchEs(fetchOptions);

    resp.push(initialResponse);

    while (resp.length) {
      const raw = resp.shift();
      // Unwrap the ES 7 client envelope; scroll replies carry it too.
      const { hits = {} } = (raw?.body ?? raw) || {};

      if (hits.hits) {
        hits.hits.forEach((hit) => {
          results.push(getRealIdFromElk(hit._id));
        });
      }

      /* istanbul ignore next */

      if (hits.total?.value === results.length) {
        // check to see if we have collected all the documents
        break;
      }

      /* istanbul ignore next */

      const scrollId = (initialResponse?.body ?? initialResponse)?._scroll_id;

      if (scrollId) {
        // get the next response if there are more to fetch
        resp.push(await fetchEsWithScroll(scrollId));
      }
    }

    return results;
  }

  const response = await fetchEs(fetchOptions);

  // The ES 7 client wraps every reply as { body, statusCode, headers }, so the
  // hits live under `body` — the count path above already reads `body.count`
  // for exactly this reason. Reading `response.hits` directly threw
  // "Cannot read properties of undefined (reading 'hits')" on every segment.
  const hits = (response?.body ?? response)?.hits?.hits ?? [];

  if (options.returnFullDoc || options.returnFields) {
    return hits.map((hit) => ({
      _id: getRealIdFromElk(hit._id),
      ...hit._source,
    }));
  }

  return hits.map((hit) => getRealIdFromElk(hit._id));
};
