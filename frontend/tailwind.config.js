/** @type {import('tailwindcss').Config} */
module.exports = {
  // class 策略：换肤靠 <html data-theme="dark"> 切换（见 index.css 的 token 体系）
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* ---- 字号规模（可读性修正，2026-10-15 真实浏览器实测后定版）----
         PC 端正文长期停在 Tailwind 默认 text-sm=14px / text-xs=12px，
         教师全天对着系统逐条看目标与试次记录，实测反馈「字小人眼累」。
         src 下 text-sm 用了 748 处、text-xs 598 处，逐组件改不现实也会漂移，
        因此在设计系统层统一上调一档（rem 基准 16px 不变）：
          text-xs  12px → 13px（辅助信息/角标/表格次级列）
          text-sm  14px → 15px（正文主力，表格单元格/表单标签/列表项）
          text-base 16px 起为强调正文，不再上调，保证层次差不被压缩。
        行高随字号同步（显式 leading-* 类优先级更高，不受影响）。
        移动端未测试，小屏下如需回落可在此统一收紧。 */
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],   // 13px / 18px
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],   // 15px / 22px
        base: ['1rem', { lineHeight: '1.5rem' }],        // 16px / 24px
      },
      // 【token 接线 · 第 2/3 处】
      // 全部用 rgb(var(--x) / <alpha-value>)：<alpha-value> 让 Tailwind
      // 能拼出 bg-surface/50、text-ink-3/70 这类透明度修饰——
      // 深色主题做层次主要靠半透明叠加，没有这个占位符就做不出来。
      // 变量定义在 src/index.css 的 :root / [data-theme] 区块。
      colors: {
        /* ---- shadcn 语义层（ui/ 组件使用，格式已由 hsl 改为 rgb） ---- */
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
          // 色阶接入 token，深色主题下不会残留浅色块的违和感
          50: 'rgb(var(--brand-soft) / <alpha-value>)',
          100: 'rgb(var(--brand-soft) / <alpha-value>)',
          200: 'rgb(var(--brand-line) / <alpha-value>)',
          300: 'rgb(var(--brand) / <alpha-value>)',
          400: 'rgb(var(--brand) / <alpha-value>)',
          500: 'rgb(var(--brand) / <alpha-value>)',
          600: 'rgb(var(--brand-strong) / <alpha-value>)',
          700: 'rgb(var(--brand-deep) / <alpha-value>)',
          800: 'rgb(var(--brand-deep) / <alpha-value>)',
          900: 'rgb(var(--brand-deep) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
          50: 'rgb(var(--surface-2) / <alpha-value>)',
          100: 'rgb(var(--surface-2) / <alpha-value>)',
          200: 'rgb(var(--line) / <alpha-value>)',
          300: 'rgb(var(--line-2) / <alpha-value>)',
          400: 'rgb(var(--ink-3) / <alpha-value>)',
          500: 'rgb(var(--secondary) / <alpha-value>)',
          600: 'rgb(var(--ink-2) / <alpha-value>)',
          700: 'rgb(var(--ink) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
          50: 'rgb(var(--danger-soft) / <alpha-value>)',
          100: 'rgb(var(--danger-soft) / <alpha-value>)',
          200: 'rgb(var(--danger-line) / <alpha-value>)',
          400: 'rgb(var(--danger) / <alpha-value>)',
          500: 'rgb(var(--danger) / <alpha-value>)',
          600: 'rgb(var(--danger-strong) / <alpha-value>)',
        },

        /* ---- 业务语义层（token 化后的主力命名空间） ----
           ink / line / surface / brand / success|warning|danger|info|violet
           命名按用途而非颜色：同一个语义在不同主题下取不同色值。 */

        // 表面：画布 / 卡片 / 次级 / 悬停 / 反色（侧栏）
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        // 遮罩：抽屉/对话框的压暗层。配 /50 /30 使用
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          inverse: 'rgb(var(--surface-inverse) / <alpha-value>)',
          'inverse-2': 'rgb(var(--surface-inverse-2) / <alpha-value>)',
          'inverse-3': 'rgb(var(--surface-inverse-3) / <alpha-value>)',
        },
        // 文字：主 / 次 / 弱 / 极弱 + 深面上的文字
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          2: 'rgb(var(--ink-2) / <alpha-value>)',
          3: 'rgb(var(--ink-3) / <alpha-value>)',
          4: 'rgb(var(--ink-4) / <alpha-value>)',
          'on-dark': 'rgb(var(--ink-on-dark) / <alpha-value>)',
          'on-dark-2': 'rgb(var(--ink-on-dark-2) / <alpha-value>)',
          'on-dark-3': 'rgb(var(--ink-on-dark-3) / <alpha-value>)',
        },
        // 线：常规边框 / 强分隔 / 焦点环
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          2: 'rgb(var(--line-2) / <alpha-value>)',
          focus: 'rgb(var(--line-focus) / <alpha-value>)',
        },
        // 品牌
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          strong: 'rgb(var(--brand-strong) / <alpha-value>)',
          deep: 'rgb(var(--brand-deep) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          line: 'rgb(var(--brand-line) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          soft: 'rgb(var(--success-soft) / <alpha-value>)',
          strong: 'rgb(var(--success-strong) / <alpha-value>)',
          // 数字档位：既有业务代码大量使用 success-50/500/600 这类写法。
          // 全部指向同一组 token，换肤时自动跟随；若不接，Tailwind 静默不生成
          // 这些类 → 状态色失效（构建类名校验器 build_class_verify.py 会报出）。
          50: 'rgb(var(--success-soft) / <alpha-value>)',
          100: 'rgb(var(--success-soft) / <alpha-value>)',
          200: 'rgb(var(--success-soft) / <alpha-value>)',
          300: 'rgb(var(--success) / <alpha-value>)',
          400: 'rgb(var(--success) / <alpha-value>)',
          500: 'rgb(var(--success) / <alpha-value>)',
          600: 'rgb(var(--success-strong) / <alpha-value>)',
          700: 'rgb(var(--success-strong) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          soft: 'rgb(var(--warning-soft) / <alpha-value>)',
          strong: 'rgb(var(--warning-strong) / <alpha-value>)',
          50: 'rgb(var(--warning-soft) / <alpha-value>)',
          100: 'rgb(var(--warning-soft) / <alpha-value>)',
          200: 'rgb(var(--warning-soft) / <alpha-value>)',
          300: 'rgb(var(--warning) / <alpha-value>)',
          400: 'rgb(var(--warning) / <alpha-value>)',
          500: 'rgb(var(--warning) / <alpha-value>)',
          600: 'rgb(var(--warning-strong) / <alpha-value>)',
          700: 'rgb(var(--warning-strong) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          soft: 'rgb(var(--danger-soft) / <alpha-value>)',
          strong: 'rgb(var(--danger-strong) / <alpha-value>)',
          line: 'rgb(var(--danger-line) / <alpha-value>)',
          50: 'rgb(var(--danger-soft) / <alpha-value>)',
          100: 'rgb(var(--danger-soft) / <alpha-value>)',
          200: 'rgb(var(--danger-line) / <alpha-value>)',
          300: 'rgb(var(--danger) / <alpha-value>)',
          400: 'rgb(var(--danger) / <alpha-value>)',
          500: 'rgb(var(--danger) / <alpha-value>)',
          600: 'rgb(var(--danger-strong) / <alpha-value>)',
          700: 'rgb(var(--danger-strong) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          soft: 'rgb(var(--info-soft) / <alpha-value>)',
          strong: 'rgb(var(--info-strong) / <alpha-value>)',
          50: 'rgb(var(--info-soft) / <alpha-value>)',
          100: 'rgb(var(--info-soft) / <alpha-value>)',
          200: 'rgb(var(--info-soft) / <alpha-value>)',
          300: 'rgb(var(--info) / <alpha-value>)',
          400: 'rgb(var(--info) / <alpha-value>)',
          500: 'rgb(var(--info) / <alpha-value>)',
          600: 'rgb(var(--info-strong) / <alpha-value>)',
          700: 'rgb(var(--info-strong) / <alpha-value>)',
        },
        violet: {
          DEFAULT: 'rgb(var(--violet) / <alpha-value>)',
          soft: 'rgb(var(--violet-soft) / <alpha-value>)',
        },
        // purple 是 violet 的历史别名：既有代码仍有 2 处使用 purple-50/500，
        // 别名删不得（删了这两处样式直接失效且构建不报错）。
        purple: {
          DEFAULT: 'rgb(var(--violet) / <alpha-value>)',
          50: 'rgb(var(--violet-soft) / <alpha-value>)',
          100: 'rgb(var(--violet-soft) / <alpha-value>)',
          200: 'rgb(var(--violet-soft) / <alpha-value>)',
          300: 'rgb(var(--violet) / <alpha-value>)',
          400: 'rgb(var(--violet) / <alpha-value>)',
          500: 'rgb(var(--violet) / <alpha-value>)',
          600: 'rgb(var(--violet) / <alpha-value>)',
          700: 'rgb(var(--violet) / <alpha-value>)',
        },

        /* ---- 旧类名别名（保持既有代码零改动即可继续工作）
               这些名字指向同一批 token，是迁移期的桥，不是新真源。 ---- */
        'bg-main': 'rgb(var(--canvas) / <alpha-value>)',
        'bg-card': 'rgb(var(--surface) / <alpha-value>)',
        'bg-sidebar': 'rgb(var(--surface-inverse) / <alpha-value>)',
        'bg-sidebar-hover': 'rgb(var(--surface-inverse-2) / <alpha-value>)',
        'bg-sidebar-active': 'rgb(var(--surface-inverse-3) / <alpha-value>)',
        'text-primary': 'rgb(var(--ink) / <alpha-value>)',
        'text-secondary': 'rgb(var(--ink-2) / <alpha-value>)',
        'text-muted': 'rgb(var(--ink-3) / <alpha-value>)',
        'text-inverse': 'rgb(var(--ink-on-dark) / <alpha-value>)',
        'border-light': 'rgb(var(--line) / <alpha-value>)',
        'border-medium': 'rgb(var(--line-2) / <alpha-value>)',
        'border-focus': 'rgb(var(--line-focus) / <alpha-value>)',

        /* shadcn 扩展槽位，同样接到 token */
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar-background) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'rgb(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'rgb(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'rgb(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'rgb(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)',
          ring: 'rgb(var(--sidebar-ring) / <alpha-value>)',
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
        xs: "0 1px 2px 0 rgb(var(--shadow-tint) / var(--shadow-alpha))",
        sm: '0 1px 2px rgb(var(--shadow-tint) / var(--shadow-alpha))',
        md: '0 4px 12px rgb(var(--shadow-tint) / var(--shadow-alpha))',
        lg: '0 8px 24px rgb(var(--shadow-tint) / var(--shadow-alpha-strong))',
        xl: '0 16px 48px rgb(var(--shadow-tint) / var(--shadow-alpha-strong))',
        focus: '0 0 0 3px rgb(var(--line-focus) / 0.15)',
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
  plugins: [
    require("tailwindcss-animate"),
    // --------------------------------------------------------------
    // 补两个 Tailwind v3 缺失的内置变体
    // v4 才内置 aria-invalid / has-focus，v3 里直接写会「静默不生成」——
    // 后果是：表单校验失败时没有红框（用户看不出哪一项填错了），
    // 日历这类组合控件聚焦时没有外框高亮（焦点在哪看不见）。
    // 用 addVariant 而非 variants.extend：后者在这套 v3.4 构建链上未生效，
    // 同样表现为静默不生成，只能靠 demo_data/temp/build_class_verify.py 扫出来。
    // --------------------------------------------------------------
    require("tailwindcss/plugin")(({ addVariant }) => {
      addVariant("aria-invalid", '&[aria-invalid="true"]');
      addVariant("has-focus", "&:focus-within");
    }),
  ],
}
