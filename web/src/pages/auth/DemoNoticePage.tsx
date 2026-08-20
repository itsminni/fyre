import { Link } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

export function DemoNoticePage(): JSX.Element {
  const { t } = useI18n();

  return (
    <GradientBackdrop>
      <main className="auth-page fade-in-up">
        <div className="public-language-row">
          <LanguageSwitch />
        </div>

        <Card title={t('demoNotice.title')} subtitle={t('demoNotice.subtitle')}>
          <div className="demo-notice-page__content">
            <p>{t('demoNotice.body1')}</p>
            <p>{t('demoNotice.body2')}</p>
          </div>

          <p className="auth-form__switch">
            <Link to="/auth/signup">{t('demoNotice.back')}</Link>
          </p>
        </Card>
      </main>
    </GradientBackdrop>
  );
}
