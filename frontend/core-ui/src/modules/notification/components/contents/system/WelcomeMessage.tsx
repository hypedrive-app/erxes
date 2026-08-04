import {
  IconAddressBook,
  IconShoppingCart,
  IconChartPie,
  IconAffiliate,
  IconFile,
} from '@tabler/icons-react';
import { useAtomValue } from 'jotai';
import {
  WelcomeNotificationContentLayout,
  TOnboardingStepItem,
  currentOrganizationState,
} from 'ui-modules';
const OnboardingSteps: TOnboardingStepItem[] = [
  {
    icon: <IconAddressBook className="size-5" />,
    title: 'Contacts',
    description: 'Keep all customer and lead information in one hub.',
    action: {
      label: 'Try it out now',
      to: '/contacts',
    },
  },
  {
    icon: <IconShoppingCart className="size-5" />,
    title: 'Products',
    forOwner: true,
    description:
      'Manage and showcase all your products or services in one place.',
    action: {
      label: 'Try it out now',
      to: 'settings/products',
    },
  },
  {
    icon: <IconChartPie className="size-5" />,
    title: 'Segments',
    forOwner: true,
    description:
      'Group customers by behavior, source, or data for targeted engagement.',
    action: {
      label: 'Try it out now',
      to: '/segments',
    },
  },
  {
    icon: <IconAffiliate className="size-5" />,
    title: 'Automation',
    forOwner: true,
    description: 'Automate repetitive tasks and save time.',
    action: {
      label: 'Try it out now',
      to: '/automations',
    },
  },
  {
    icon: <IconFile className="size-5" />,
    title: 'Documentation',
    forOwner: true,
    description:
      'Store and organize your docs, link them to tickets, conversations and tasks.',
    action: {
      label: 'Try it out now',
      to: '/documents',
    },
  },
];

export const WelcomeMessageContent = () => {
  // Reads the white-label name rather than hardcoding "erxes": this instance
  // is branded, and the welcome notification was the one place still greeting
  // people with the upstream product name. Falls back to erxes when
  // white-labelling is off, which is the correct default there.
  const organization = useAtomValue(currentOrganizationState);

  return (
    <WelcomeNotificationContentLayout
      title={`Welcome to ${organization?.orgShortName || 'erxes'}`}
      description="A New Experience Begins!"
      videoSrc="https://pub-3bcba1ff529f4ce3bf25b4e16962c239.r2.dev/intro.mp4"
      onboardingSteps={OnboardingSteps}
    />
  );
};
