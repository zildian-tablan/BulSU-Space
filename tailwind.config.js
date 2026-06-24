/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        'gray': {
          800: '#1F2937',
          900: '#111827',
        },
        'green': {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
      },
      backgroundColor: {
        'primary': '#10B981',
        'primary-hover': '#059669',
        'dark': '#111827',
        'dark-light': '#1F2937',
      },
      textColor: {
        'primary': '#10B981',
        'primary-hover': '#059669',
      },
      fontSize: {
        'xxs': '0.65rem',
      },
      scale: {
        '115': '1.15',
      },
      animation: {
        'fadeIn': 'fadeIn 0.3s ease-in-out',
        'fadeInUp': 'fadeInUp 0.5s ease-out forwards',
        'fadeInDown': 'fadeInDown 0.5s ease-out forwards',
        'scaleIn': 'scaleIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'blob': 'blob 7s infinite',
        'typing': 'typing 35s steps(20, end)',
        'blink': 'blink 1.5s step-end infinite',
        'pulse-slow': 'pulse 3s infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-enhanced': 'float-enhanced 8s ease-in-out infinite',
        'menuFadeIn': 'menuFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'menuFadeOut': 'menuFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'particle': 'particle 8s ease-in-out infinite',
        'particle-delay-1': 'particle 8s ease-in-out 1s infinite',
        'particle-delay-2': 'particle 8s ease-in-out 2s infinite',
        'particle-delay-3': 'particle 8s ease-in-out 3s infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'shootingStar': 'shootingStar 5s linear infinite',
      },
      userSelect: {
        'none': 'none',
        'text': 'text',
        'all': 'all',
        'auto': 'auto',
      },
      keyframes: {
        typing: {
          '0%': { width: '0%' },
          '10%': { width: '0%' }, /* Long pause before starting to type */
          '40%': { width: '100%' }, /* Very slow typing phase */
          '80%': { width: '100%' }, /* Extra long pause when text is complete */
          '98%': { width: '0%' }, /* Ultra slow erasing phase */
          '100%': { width: '0%' }
        },
        blink: {
          'from, to': { borderColor: 'transparent' },
          '50%': { borderColor: 'currentColor' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        menuFadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-20px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        menuFadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-20px) scale(0.95)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-enhanced': {
          '0%': { transform: 'translateY(0) rotate(0)' },
          '25%': { transform: 'translateY(-15px) rotate(1deg)' },
          '50%': { transform: 'translateY(-5px) rotate(-1deg)' },
          '75%': { transform: 'translateY(-12px) rotate(0.5deg)' },
          '100%': { transform: 'translateY(0) rotate(0)' },
        },
        'particle': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '0.6' },
          '25%': { transform: 'translate(10px, -10px) scale(1.3)', opacity: '0.8' },
          '50%': { transform: 'translate(5px, 15px) scale(1)', opacity: '0.6' },
          '75%': { transform: 'translate(-10px, 5px) scale(1.2)', opacity: '0.8' },
          '100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.6' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        blob: {
          '0%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
          '100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
        },
        shootingStar: {
          '0%': {
            transform: 'translateX(0) translateY(0) rotate(315deg)',
            opacity: 0,
          },
          '15%': {
            opacity: 1,
          },
          '60%, 100%': {
            transform: 'translateX(800px) translateY(-800px) rotate(315deg)',
            opacity: 0,
          },
        },
      },
      borderColor: {
        'primary': '#10B981',
      },
    },
  },
  plugins: [],
  // Force dark mode for entire application
  variants: {
    extend: {
      backgroundColor: ['dark'],
      textColor: ['dark'],
      borderColor: ['dark'],
    },
  },
}
