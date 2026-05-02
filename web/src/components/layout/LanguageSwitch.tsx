import { useI18n } from '../../i18n';

export function LanguageSwitch(): JSX.Element {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="language-switch" aria-label="Language">
      <button
        type="button"
        className={language === 'it' ? 'is-active' : ''}
        onClick={() => setLanguage('it')}
        aria-label={t('language.italian')}
      >
        IT
      </button>
      <button
        type="button"
        className={language === 'en' ? 'is-active' : ''}
        onClick={() => setLanguage('en')}
        aria-label={t('language.english')}
      >
        EN
      </button>
    </div>
  );
}
