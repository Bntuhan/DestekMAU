/* eslint-disable */
import { createContext, useContext, useEffect, useState } from 'react'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('destek_theme') || 'light')
  const [lang, setLang] = useState(() => localStorage.getItem('destek_lang') || 'tr')

  useEffect(() => {
    localStorage.setItem('destek_theme', theme)
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  useEffect(() => {
    localStorage.setItem('destek_lang', lang)
  }, [lang])

  return (
    <SettingsContext.Provider value={{ theme, setTheme, lang, setLang }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}

const dict = {
  tr: {
    tickets: "Talepler",
    newTicket: "Yeni talep",
    newUser: "Yeni Kişi",
    assign: "Atama",
    logout: "Oturumu kapat",
    themeToggle: "Karanlık Mod",
    langToggle: "English",
  },
  en: {
    tickets: "Tickets",
    newTicket: "New Ticket",
    newUser: "Add User",
    assign: "Assignments",
    logout: "Log Out",
    themeToggle: "Light Mode",
    langToggle: "Türkçe",
  }
}

export function useTranslation() {
  const { lang } = useSettings()
  return { t: dict[lang] || dict.tr, lang }
}
