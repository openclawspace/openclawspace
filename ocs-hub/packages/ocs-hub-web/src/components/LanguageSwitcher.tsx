import React from 'react';
import { changeLanguage, getCurrentLanguage } from '../i18n.ts';

const LanguageSwitcher: React.FC = () => {
  const currentLang = getCurrentLanguage();

  const toggleLanguage = () => {
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    changeLanguage(newLang);
  };

  return (
    <div className="language-switcher">
      <button
        onClick={toggleLanguage}
        className="language-button"
        title={currentLang === 'en' ? '切换到中文' : 'Switch to English'}
      >
        {currentLang === 'en' ? '中文' : 'EN'}
      </button>
    </div>
  );
};

export default LanguageSwitcher;