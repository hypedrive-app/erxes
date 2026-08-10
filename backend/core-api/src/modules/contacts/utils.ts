import { sendTRPCMessage } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { CONTACT_STATUSES } from './constants';
import { withPropertyConditions } from '@/properties/utils';
import { fetchSegment } from '@/segments/utils/fetchSegment';

export const generateFilter = async (
  subdomain: string,
  params: any,
  models: IModels,
) => {
  const {
    searchValue,
    tagIds,
    excludeTagIds,
    tagWithRelated,
    type,
    dateFilters,
    propertiesData,
    brandIds,
    integrationIds,
    integrationTypes,
    status,
    ids,
    excludeIds,
    conformityMainType,
    conformityMainTypeId,
    conformityRelType,
    conformityIsRelated,
    segment,
    segmentData,
  } = params;

  const filter: any = {
    status: { $ne: CONTACT_STATUSES.deleted },
  };

  if (type) {
    filter['state'] = { $eq: type };
  }

  if (status) {
    filter.status = { $eq: CONTACT_STATUSES[status] };
  }

  if (searchValue) {
    const regex = { $regex: searchValue, $options: 'i' };

    filter['$or'] = [
      { searchText: regex },
      { primaryEmail: regex },
      { emails: regex },
      { primaryPhone: regex },
      { phones: regex },
      { firstName: regex },
      { lastName: regex },
      { middleName: regex },
    ];
  }

  if (ids?.length) {
    filter['_id'] = excludeIds ? { $nin: ids } : { $in: ids };
  }

  // conformityIsRelated asks for the contacts reachable through the main
  // record's links rather than the ones linked to it directly.
  if (conformityMainType && conformityMainTypeId && conformityRelType) {
    const conformityIds = conformityIsRelated
      ? await models.Conformities.relatedConformity({
          mainType: conformityMainType,
          mainTypeId: conformityMainTypeId,
          relType: conformityRelType,
        })
      : await models.Conformities.savedConformity({
          mainType: conformityMainType,
          mainTypeId: conformityMainTypeId,
          relTypes: [conformityRelType],
        });

    const matchedIds = (conformityIds || []).filter((id) => id);

    filter['$and'] = [...(filter['$and'] || []), { _id: { $in: matchedIds } }];
  }

  if (brandIds || integrationIds || integrationTypes) {
    const relatedIntegrationIdSet = new Set();

    if (brandIds) {
      const integrations = await findIntegrations(subdomain, {
        brandId: { $in: brandIds },
      });
      integrations.forEach((i) => relatedIntegrationIdSet.add(i._id));
    }

    if (integrationIds) {
      const integrations = await findIntegrations(subdomain, {
        _id: { $in: integrationIds },
      });
      integrations.forEach((i) => relatedIntegrationIdSet.add(i._id));
    }

    if (integrationTypes) {
      const integrations = await findIntegrations(subdomain, {
        kind: { $in: integrationTypes },
      });
      integrations.forEach((i) => relatedIntegrationIdSet.add(i._id));
    }

    if (relatedIntegrationIdSet.size > 0) {
      filter['relatedIntegrationIds'] = {
        $in: Array.from(relatedIntegrationIdSet),
      };
    }
  }

  if (tagIds?.length || excludeTagIds?.length) {
    let baseTagIds = tagIds || excludeTagIds || [];

    if (tagWithRelated) {
      const tagObjs = await models.Tags.find({ _id: { $in: baseTagIds } });

      tagObjs.forEach((tag) => {
        baseTagIds = baseTagIds.concat(tag.relatedIds || []);
      });
    }

    baseTagIds = [...new Set(baseTagIds)];

    if (tagIds?.length && excludeTagIds?.length) {
      filter['tagIds'] = {
        $in: baseTagIds.filter((id) => tagIds.includes(id)),
        $nin: baseTagIds.filter((id) => excludeTagIds.includes(id)),
      };
    } else if (tagIds?.length) {
      filter['tagIds'] = { $in: baseTagIds };
    } else if (excludeTagIds?.length) {
      filter['tagIds'] = { $nin: baseTagIds };
    }
  }

  if (dateFilters) {
    try {
      const dateFilter = JSON.parse(dateFilters);

      for (const [key, value] of Object.entries(dateFilter)) {
        const { gte, lte } = (value || {}) as { gte?: string; lte?: string };

        if (gte || lte) {
          filter[key] = {};

          if (gte) {
            filter[key]['$gte'] = gte;
          }

          if (lte) {
            filter[key]['$lte'] = lte;
          }
        }
      }
    } catch (err) {
      throw new Error(`Invalid dateFilters JSON: ${err}`);
    }
  }

  if (propertiesData) {
    const propertyConditions = withPropertyConditions(propertiesData);

    if (propertyConditions.length) {
      filter['$and'] = [...(filter['$and'] || []), ...propertyConditions];
    }
  }

  // The `segment` / `segmentData` query args are declared on the contacts
  // schema and the UI offers "Filter by segment", but nothing here consumed
  // them — so a segment-filtered list silently returned every contact. Resolve
  // the segment to ids and constrain the query, matching how sales_api applies
  // a segment to deals.
  //
  // `segmentData` carries an unsaved segment from the builder's live preview;
  // `segment` is the id of a saved one.
  const segmentIds = await resolveSegmentIds({
    models,
    subdomain,
    segment,
    segmentData,
    contentType: type === 'company' ? 'core:company' : 'core:customer',
  });

  if (segmentIds) {
    filter._id = filter._id ? { $and: [filter._id, { $in: segmentIds }] } : { $in: segmentIds };
  }

  return filter;
};

/**
 * Resolve a saved segment id, or an inline segment definition, to the contact
 * ids that match it.
 *
 * Returns undefined when no segment was requested, which callers must treat as
 * "do not constrain" — distinct from an empty array, which is a segment that
 * legitimately matched nothing and must yield no rows.
 */
const resolveSegmentIds = async ({
  models,
  subdomain,
  segment,
  segmentData,
  contentType,
}: {
  models: IModels;
  subdomain: string;
  segment?: string;
  segmentData?: string;
  contentType: string;
}): Promise<string[] | undefined> => {
  if (segmentData) {
    let parsed;

    try {
      parsed = JSON.parse(segmentData);
    } catch (err) {
      throw new Error(`Invalid segmentData JSON: ${err}`);
    }

    return fetchSegment(models, subdomain, { ...parsed, contentType });
  }

  if (segment) {
    const found = await models.Segments.findOne({ _id: segment });

    // A stale segment id must not silently widen the result set to everything.
    if (!found) {
      throw new Error(`Segment not found: ${segment}`);
    }

    return fetchSegment(models, subdomain, found);
  }

  return undefined;
};

export const createOrUpdate = async ({
  collection,
  data: { rows, doNotReplaceExistingValues },
}) => {
  const operations: any = [];

  for (const row of rows) {
    const { selector, doc, customFieldsData } = row;

    const prevEntry = await collection.findOne(selector).lean();

    if (prevEntry) {
      let cfData = prevEntry.customFieldsData || [];

      // remove existing rows
      for (const cf of customFieldsData || []) {
        cfData = cfData.filter(({ field }) => field !== cf.field);
      }

      // add new rows
      for (const cf of customFieldsData || []) {
        cfData.push(cf);
      }

      const newDoc = { ...doc };

      if (doNotReplaceExistingValues) {
        for (const fieldName of Object.keys(doc)) {
          if (prevEntry[fieldName]) {
            delete newDoc[fieldName];
          }
        }
      }

      newDoc.customFieldsData = cfData;

      operations.push({
        updateOne: { filter: selector, update: { $set: newDoc } },
      });
    } else {
      doc.customFieldsData = customFieldsData;
      doc.createdAt = new Date();
      doc.updatedAt = new Date();
      operations.push({ insertOne: { document: doc } });
    }
  }

  return collection.bulkWrite(operations);
};

export const findIntegrations = (subdomain: string, query, options?) =>
  sendTRPCMessage({
    subdomain,

    pluginName: 'frontline',
    method: 'query',
    module: 'integration',
    action: 'find',
    input: { query },
    defaultValue: [],
    options,
  });

export const customersCount = async ({
  models,
  subdomain,
  type,
}: {
  models: IModels;
  subdomain: string;
  type: string;
}) => {
  const counts = {};

  switch (type) {
    case 'tag': {
      const tagIds = await models.Tags.find({ type: 'core:customer' }).distinct(
        '_id',
      );

      for (const tagId of tagIds) {
        counts[tagId] = await models.Customers.countDocuments({
          tagIds: tagId,
        });
      }

      break;
    }
    case 'brand': {
      const brandIds = await models.Brands.find({}).distinct('_id');

      const integrations = await findIntegrations(subdomain, {
        brandId: { $in: brandIds },
      });

      for (const integration of integrations) {
        if (!integration.brandId) {
          continue;
        }

        counts[integration.brandId] = await models.Customers.countDocuments({
          relatedIntegrationIds: integration._id,
        });
      }

      break;
    }
  }

  return counts;
};
