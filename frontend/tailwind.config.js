/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: '#F5F0EB',
          100: '#EBE3DA',
          200: '#D6C8B8',
          300: '#C1AC96',
          400: '#AC9174',
          500: '#977653',
          600: '#7A5F42',
          700: '#5C4832',
          800: '#3D3122',
          900: '#1F1911',
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          50: '#F0F2F5',
          100: '#D9DEE6',
          200: '#B3BCCD',
          300: '#8D9AB4',
          400: '#66789A',
          500: '#405680',
          600: '#334566',
          700: '#26344D',
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          600: '#059669',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
        },
        danger: {
          50: '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
        },
        info: {
          50: '#EFF6FF',
          500: '#3B82F6',
          600: '#2563EB',
        },
        purple: {
          50: '#F5F3FF',
          500: '#8B5CF6',
        },
        'bg-main': '#F7F6F4',
        'bg-card': '#FFFFFF',
        'bg-sidebar': '#1E293B',
        'bg-sidebar-hover': '#334155',
        'bg-sidebar-active': '#3B82F6',
        'text-primary': '#1E293B',
        'text-secondary': '#64748B',
        'text-muted': '#94A3B8',
        'text-inverse': '#FFFFFF',
        'border-light': '#E2E8F0',
        'border-medium': '#CBD5E1',
        'border-focus': '#3B82F6',
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        // 与 index.css 的 --font-sans / --font-number 同源（此前两边内容不一致）
        sans: ['var(--font-sans)'],
        number: ['var(--font-number)'],
      },
      screens: {
        // 大屏手机（iPhone Pro Max 之类）与 640 之间此前是空白地带，
        // 卡片在此区间会挤成一列却仍占满宽，需要单独一档。
        xs: '420px',
      },
      minHeight: {
        tap: '44px',
        'tap-lg': '56px',
      },
      minWidth: {
        tap: '44px',
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        sm: '0 1px 2px rgba(0,0,0,0.04)',
        md: '0 4px 12px rgba(0,0,0,0.06)',
        lg: '0 8px 24px rgba(0,0,0,0.08)',
        xl: '0 16px 48px rgba(0,0,0,0.1)',
        focus: '0 0 0 3px rgba(59,130,246,0.15)',
        // 层次阴影：用变量统一，避免各处手写阴影深浅不一
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        float: 'var(--shadow-float)',
      },
      transitionTimingFunction: {
        // index.css 里 --ease-* 定义了却从未接入 Tailwind，
        // 各文件只能硬编码 cubic-bezier 或沿用默认 linear/ease。此处接线。
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        // Layout.tsx 里出现过 duration-350——Tailwind 默认没有这一档，
        // 该类名静默不生效（侧栏过渡时长实际是 0s）。补齐常用档位。
        250: '250ms',
        350: '350ms',
        400: '400ms',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        // 入场：内容「落位」而不是生硬出现（苹果的做法是让元素从它来的方向上浮出）
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        // 数字/徽章变化时的回弹：让"我点到了"这件事被看见
        pop: {
          "0%": { transform: "scale(0.94)" },
          "60%": { transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "fade-up": "fade-up 260ms var(--ease-out) both",
        pop: "pop 260ms var(--ease-spring) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
