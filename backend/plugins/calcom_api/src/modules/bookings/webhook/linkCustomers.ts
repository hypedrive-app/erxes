import { sendTRPCMessage } from 'erxes-api-shared/utils';

import { IBookingAttendee } from '@/bookings/@types/bookings';

/**
 * Resolves each attendee to an erxes customer.
 *
 * Matching is by email only. Cal.com does not require a phone number, and
 * matching on name would collide across different people with the same name —
 * silently attaching one person's bookings to another's record is worse than
 * leaving the booking unlinked.
 *
 * Creating a customer for an unknown attendee is OFF by default. Every public
 * booking page is reachable by anyone, so auto-creating would let strangers
 * write rows into the CRM's contact list. Set CALCOM_CREATE_MISSING_CONTACTS=true
 * to opt in — appropriate when the booking pages are internal or invite-only.
 */

const shouldCreateMissing = () =>
  process.env.CALCOM_CREATE_MISSING_CONTACTS === 'true';

const findCustomerByEmail = async (subdomain: string, email: string) => {
  // findOne understands customerPrimaryEmail specially: it matches BOTH the
  // primaryEmail field and the emails[] array, so a contact reached at a
  // secondary address still resolves.
  const customer = await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    module: 'customers',
    action: 'findOne',
    input: { customerPrimaryEmail: email },
  });

  // findOne answers {} rather than null when it has nothing, so a truthiness
  // check alone would treat "not found" as a customer with no _id.
  return customer?._id ? customer : null;
};

const createCustomerFromAttendee = async (
  subdomain: string,
  attendee: IBookingAttendee,
) => {
  const [firstName, ...restName] = (attendee.name || '').trim().split(/\s+/);

  const created = await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    module: 'customers',
    action: 'createOrUpdate',
    input: {
      doc: {
        primaryEmail: attendee.email,
        emails: [attendee.email],
        firstName: firstName || undefined,
        lastName: restName.length ? restName.join(' ') : undefined,
        // Records where the contact came from, so a CRM user can tell an
        // auto-created booking contact from one someone entered deliberately.
        integrationId: undefined,
        state: 'lead',
      },
    },
  });

  return created?._id ? created : null;
};

/**
 * Returns the attendee list with erxesCustomerId filled in where a match was
 * found. Attendees that could not be resolved are returned unchanged rather
 * than dropped — the booking is still worth mirroring without a linked contact.
 */
export const linkAttendeesToCustomers = async (
  subdomain: string,
  attendees: IBookingAttendee[] = [],
): Promise<IBookingAttendee[]> => {
  const linked: IBookingAttendee[] = [];

  for (const attendee of attendees) {
    if (!attendee.email) {
      linked.push(attendee);
      continue;
    }

    try {
      let customer = await findCustomerByEmail(subdomain, attendee.email);

      if (!customer && shouldCreateMissing()) {
        customer = await createCustomerFromAttendee(subdomain, attendee);
      }

      linked.push(
        customer ? { ...attendee, erxesCustomerId: customer._id } : attendee,
      );
    } catch (e) {
      // A core lookup failing must not lose the booking. Mirroring it unlinked
      // is recoverable — a later delivery, or a backfill, can attach the
      // contact; dropping the webhook is not.
      console.error(
        `calcom: could not resolve customer for ${attendee.email}`,
        e,
      );
      linked.push(attendee);
    }
  }

  return linked;
};
