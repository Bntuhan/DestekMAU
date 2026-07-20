import { useState, useEffect } from 'react'
import './OnboardingTour.css'

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState({})

  const steps = [
    {
      targetId: 'nav-tickets',
      title: 'Talep Akışı',
      content: 'Tüm taleplerinizi ve güncel durumlarını buradan takip edebilirsiniz.',
      placement: 'right'
    },
    {
      targetId: 'nav-new-ticket',
      title: 'Yeni Talep',
      content: 'Yeni bir destek talebi oluşturmak için bu butonu kullanın.',
      placement: 'right'
    },
    {
      targetId: null,
      title: 'Komut Paleti',
      content: 'Cmd + K (veya Ctrl + K) tuşlarına basarak hızlıca arama yapabilir ve komut çalıştırabilirsiniz.',
      placement: 'center'
    }
  ]

  useEffect(() => {
    const seen = localStorage.getItem('destek_tour_seen')
    if (!seen) {
      // Small delay to ensure elements are rendered
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (isVisible) {
      updateTooltipPosition()
      window.addEventListener('resize', updateTooltipPosition)
      return () => window.removeEventListener('resize', updateTooltipPosition)
    }
  }, [isVisible, currentStep])

  function updateTooltipPosition() {
    const step = steps[currentStep]
    if (!step.targetId) {
      setTooltipStyle({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
      return
    }

    const target = document.getElementById(step.targetId)
    if (target) {
      const rect = target.getBoundingClientRect()
      // Default to right placement for now
      setTooltipStyle({
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.right + 20}px`,
        transform: 'translateY(-50%)'
      })
      // Add highlight class
      target.classList.add('tour-highlight')
    }
  }

  function nextStep() {
    removeHighlight()
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      finishTour()
    }
  }

  function skipTour() {
    removeHighlight()
    finishTour()
  }

  function finishTour() {
    localStorage.setItem('destek_tour_seen', 'true')
    setIsVisible(false)
  }

  function removeHighlight() {
    const step = steps[currentStep]
    if (step && step.targetId) {
      const target = document.getElementById(step.targetId)
      if (target) {
        target.classList.remove('tour-highlight')
      }
    }
  }

  if (!isVisible) return null

  const step = steps[currentStep]

  return (
    <div className="onboarding-overlay">
      <div className={`onboarding-tooltip mau-card ${step.placement === 'center' ? 'onboarding-tooltip--center' : ''}`} style={tooltipStyle}>
        <div className="onboarding-tooltip__header">
          <h3>{step.title}</h3>
          <span className="onboarding-tooltip__progress">{currentStep + 1} / {steps.length}</span>
        </div>
        <div className="onboarding-tooltip__content">
          {step.content}
        </div>
        <div className="onboarding-tooltip__footer">
          <button className="mau-btn mau-btn--ghost" onClick={skipTour}>Geç</button>
          <button className="mau-btn mau-btn--primary" onClick={nextStep}>
            {currentStep < steps.length - 1 ? 'İleri' : 'Bitir'}
          </button>
        </div>
      </div>
    </div>
  )
}
