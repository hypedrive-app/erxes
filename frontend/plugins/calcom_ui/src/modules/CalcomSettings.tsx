import { CalcomConfigForm } from '~/modules/bookings/components/CalcomConfigForm';
import { CalcomIntegrationStatus } from '~/modules/bookings/components/IntegrationStatus';
import { WebhookHealthCard } from '~/modules/bookings/components/WebhookHealthCard';

/**
 * Cal.com integration settings.
 *
 * Status first, then configuration: when something is not working the first
 * question is which half is broken — inbound webhooks or the outbound API —
 * and that answer sits directly above the fields that fix it.
 */
export const CalcomSettings = () => {
  return (
    <div className="flex flex-col gap-8 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Cal.com</h1>
        <p className="mt-1 text-muted-foreground">
          Bookings made in Cal.com are mirrored into the CRM and linked to the
          contact who booked them.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Status</h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">
          The two halves fail independently — one can work while the other does
          not.
        </p>
        <CalcomIntegrationStatus />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Connection</h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">
          Cal.com pushes booking events here. This sets that up for you — no
          need to create a webhook in Cal.com by hand.
        </p>
        <WebhookHealthCard />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Configuration</h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">
          Values saved here are stored in the CRM and override the deployment
          environment, so a key can be rotated without a redeploy.
        </p>
        <CalcomConfigForm />
      </section>
    </div>
  );
};
