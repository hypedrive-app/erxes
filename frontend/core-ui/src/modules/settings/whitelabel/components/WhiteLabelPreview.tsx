import { IconEye } from '@tabler/icons-react';

/**
 * A miniature of the real login screen (DynamicBanner + AuthenticationLayout
 * + Login, under modules/auth), scaled down and non-interactive.
 *
 * Rebuilt rather than rendered live in an iframe: the real screen needs a
 * signed-out session and its own router, neither of which exists inside a
 * settings page. This copies its actual structure and class names — the
 * split banner, the logo position, the heading/description block, the
 * rounded-xl card with the same padding and shadow, the same tab pill and
 * "Welcome" copy — so what an operator sees here is what visitors will
 * actually see, not a generic mockup with a passing resemblance.
 */
export const WhiteLabelPreview = ({
  logo,
  loginText,
  loginDescription,
  enabled,
}: {
  logo?: string;
  loginText?: string;
  loginDescription?: string;
  enabled: boolean;
}) => {
  const heading = loginText || 'Grow your business better and faster';
  const description =
    loginDescription ||
    'A single XOS (experience operating system) enables to create unique and life-changing experiences that work for all types of businesses.';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <IconEye className="size-4" />
        Login screen preview
      </div>

      <div className="relative rounded-xl border overflow-hidden shadow-sm">
        {!enabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              Custom branding is off — showing stock erxes
            </span>
          </div>
        )}

        <div className="flex h-104 w-full">
          {/* DynamicBanner, scaled down. */}
          <div className="hidden sm:flex sm:w-1/2 relative overflow-hidden bg-foreground dark:bg-background">
            <div className="w-full h-full flex flex-col items-center justify-center text-primary-foreground px-6">
              <div className="absolute top-4">
                <PreviewLogo logo={logo} className="h-5 text-background" />
              </div>
              <div className="max-w-[85%] flex flex-col gap-1.5 text-center sm:text-left">
                <h1 className="text-sm font-semibold leading-tight text-background dark:text-foreground line-clamp-3">
                  {heading}
                </h1>
                <p className="text-xs font-medium leading-snug text-muted-foreground line-clamp-4">
                  {description}
                </p>
              </div>
            </div>
          </div>

          {/* AuthenticationLayout + Login, scaled down. */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-6 bg-[radial-gradient(#F0F1FE,#F7F8FA)] dark:bg-[radial-gradient(#0D0D0D,#161616)]">
            <PreviewLogo logo={logo} className="h-6 text-primary" />

            <div className="w-full max-w-56 rounded-lg shadow-lg overflow-hidden bg-sidebar">
              <div className="bg-background border border-t-0 rounded-b-lg p-3.5 pt-4 flex flex-col gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs font-semibold leading-none">
                    Welcome
                  </div>
                  <div className="text-[10px] text-center text-accent-foreground leading-tight">
                    Please sign in to your account to continue
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-md bg-foreground/5 p-0.5">
                  <div className="rounded-sm bg-background shadow-sm px-2 py-1 text-center text-[9px] font-medium text-primary">
                    Magic link
                  </div>
                  <div className="rounded-sm px-2 py-1 text-center text-[9px] font-medium text-muted-foreground">
                    Email
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="h-1.5 w-10 rounded-full bg-foreground/15" />
                  <div className="h-6 rounded-md border bg-background" />
                </div>

                <div className="h-6 rounded-md bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewLogo = ({
  logo,
  className,
}: {
  logo?: string;
  className?: string;
}) => {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className={`object-contain w-auto ${className}`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 64 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M33.5391 16.2509C37.0504 11.098 40.3559 5.6423 43.2828 0C39.9515 3.76153 36.0244 9.23484 32.4283 14.6003C30.5221 11.8476 28.2416 8.89684 25.629 6.13271C28.2178 10.9228 29.5272 13.5594 31.3185 16.2696C25.8711 24.5008 21.4362 32 21.4362 32C25.1709 27.6879 28.8932 22.9404 32.4283 17.8714C33.9435 19.9647 35.9034 22.3349 39.0351 25.8911C39.0289 25.886 37.0742 21.6278 33.5391 16.2509Z"
        fill="currentColor"
      />
    </svg>
  );
};
