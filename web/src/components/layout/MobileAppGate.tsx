import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';

type MobilePlatform = 'ios' | 'android' | 'generic';

const MOBILE_APP_URLS: Record<'ios' | 'android', string | null> = {
  ios: null,
  android: null
};

function detectPlatform(): MobilePlatform {
  if (typeof navigator === 'undefined') {
    return 'generic';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }
  if (/android/.test(userAgent)) {
    return 'android';
  }
  return 'generic';
}

export function MobileAppGate(): JSX.Element | null {
  const { t } = useI18n();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 900px)');
    const sync = () => setIsMobileViewport(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  const platform = useMemo(() => detectPlatform(), []);
  const appUrl = platform === 'android' ? MOBILE_APP_URLS.android : MOBILE_APP_URLS.ios;
  const titleKey = platform === 'ios'
    ? 'mobile.title.ios'
    : platform === 'android'
      ? 'mobile.title.android'
      : 'mobile.title.generic';
  const actionLabel = platform === 'android' ? t('mobile.openAndroid') : t('mobile.openIos');

  if (!isMobileViewport || isDismissed) {
    return null;
  }

  return (
    <div className="mobile-app-gate" role="dialog" aria-modal="true" aria-labelledby="mobile-app-gate-title">
      <div className="mobile-app-gate__panel">
        <img src="/images/fyre-app-icon.png" alt="" aria-hidden />
        <h2 id="mobile-app-gate-title">{t(titleKey)}</h2>
        <p>{t('mobile.body')}</p>

        {appUrl ? (
          <a className="mobile-app-gate__primary" href={appUrl}>
            {actionLabel}
          </a>
        ) : (
          <button className="mobile-app-gate__primary" type="button" disabled>
            {actionLabel}
          </button>
        )}

        <button className="mobile-app-gate__secondary" type="button" onClick={() => setIsDismissed(true)}>
          {t('mobile.continue')}
        </button>
      </div>
    </div>
  );
}
