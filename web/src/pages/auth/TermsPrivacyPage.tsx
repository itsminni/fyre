import { Link } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

export function TermsPrivacyPage(): JSX.Element {
  const { t } = useI18n();

  return (
    <GradientBackdrop>
      <main className="auth-page fade-in-up">
        <div className="public-language-row">
          <LanguageSwitch />
        </div>

        <Card title={t('terms.title')} subtitle={t('terms.subtitle')}>
          <div className="terms-page__content">
            <p>{t('terms.body1')}</p>
            <p>{t('terms.body2')}</p>
          </div>

          <p className="auth-form__switch">
            <Link to="/auth/signup">{t('terms.back')}</Link>
          </p>
        </Card>
      </main>
    </GradientBackdrop>
  );
}
