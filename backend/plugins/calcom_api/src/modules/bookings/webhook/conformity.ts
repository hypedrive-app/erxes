import { sendTRPCMessage } from 'erxes-api-shared/utils';

import { IBookingAttendee } from '@/bookings/@types/bookings';

/**
 * Registers booking <-> customer relations in core's conformity graph.
 *
 * The mirror already stores erxesCustomerId on each attendee, which is enough
 * for this plugin's own queries. Conformities are what make the relation
 * visible to the REST of erxes — the customer detail panel, segments, and
 * anything else that asks "what is related to this record" goes through this
 * graph rather than reading a plugin's collection.
 *
 * mainType is the Cal.com booking, keyed by its uid. uid rather than the Mongo
 * _id because it is the identifier every Cal.com webhook carries and the one a
 * URL exposes, so a relation stays meaningful even if the mirror row is
 * rebuilt.
 */

export const CALCOM_BOOKING_CONFORMITY_TYPE = 'calcom:booking';

export const linkBookingConformities = async (
  subdomain: string,
  uid: string,
  attendees: IBookingAttendee[] = [],
): Promise<void> => {
  const customerIds = [
    ...new Set(
      attendees
        .map((a) => a.erxesCustomerId)
        .filter((id): id is string => !!id),
    ),
  ];

  if (!customerIds.length) return;

  for (const customerId of customerIds) {
    try {
      // addConformity is idempotent at the model level — Conformities.addConformity
      // does a findOne on the exact doc before inserting — so replaying a
      // webhook does not accumulate duplicate edges.
      await sendTRPCMessage({
        subdomain,
        pluginName: 'core',
        // Singular: core registers this router as `conformity`
        // (core-api/src/modules/conformities/trpc/conformity.ts), which is
        // what resolveRecordRelationIds and frontline's widget already send.
        // The plural spelling here matched the directory name rather than the
        // route and resolved to nothing — tRPC answers a missing path with
        // "No procedure found" and the caller's default, so every booking
        // silently failed to link to its customer.
        module: 'conformity',
        action: 'addConformity',
        // sendTRPCMessage defaults to 'query', which issues a GET. addConformity
        // is a TRPCMutationProcedure, and tRPC refuses a GET to one --
        // "Unsupported GET-request to mutation procedure" -- so the default
        // could never have worked here.
        method: 'mutation',
        input: {
          mainType: CALCOM_BOOKING_CONFORMITY_TYPE,
          mainTypeId: uid,
          relType: 'customer',
          relTypeId: customerId,
        },
      });
    } catch (e) {
      // The relation is an enrichment, not the record. Losing it must not cost
      // us the booking, which is already stored by the time this runs.
      console.error(
        `calcom: could not link booking ${uid} to customer ${customerId}`,
        e,
      );
    }
  }
};
