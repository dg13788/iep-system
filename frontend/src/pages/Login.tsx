import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Brain, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      newErrors.username = '请输入用户名';
    }
    if (!password) {
      newErrors.password = '请输入密码';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (result.ok) {
        toast.success('登录成功！');
        navigate('/');
      } else {
        // 修复说明：此前无论后端返回何种原因都统一提示「用户名或密码错误」，
        // 账号被禁用、后端不可用等真实原因被掩盖，排障困难。
        const msg = result.message || '用户名或密码错误';
        toast.error(msg);
        setErrors({ username: msg });
      }
    } catch {
      toast.error('登录失败，请检查网络或后端服务');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] bg-white">
      {/* Left Side - Welcome */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-gradient-to-br from-primary-50 to-[#F0EDE8]">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#977653" strokeWidth="0.5"/>
            </pattern>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-center items-start px-16 xl:px-24 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center">
                <Brain className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold text-primary-800">启智 IEP</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-bold text-primary-900 leading-tight mb-6">
              以科学守护成长
              <br />
              <span className="text-primary-500">以温度赋能教育</span>
            </h1>

            <p className="text-lg text-[#64748B] leading-relaxed mb-8">
              启智 IEP 管理系统，专为特殊教育学校设计的个别化教育计划管理平台。
              让每一份教育计划都精准到位，让每一个孩子都被温柔以待。
            </p>

            <div className="flex items-center gap-8 text-sm text-[#64748B]">
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-primary-700">500+</span>
                <span>服务学生</span>
              </div>
              <div className="w-px h-10 bg-primary-200" />
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-primary-700">1000+</span>
                <span>IEP计划</span>
              </div>
              <div className="w-px h-10 bg-primary-200" />
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-primary-700">50+</span>
                <span>合作学校</span>
              </div>
            </div>
          </motion.div>

          {/* Decorative elements */}
          <motion.div
            className="absolute bottom-12 right-12 w-32 h-32 rounded-full bg-primary-200 opacity-30"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
          />
          <motion.div
            className="absolute top-24 right-24 w-16 h-16 rounded-full bg-primary-300 opacity-20"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
          />
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12 lg:px-16 bg-white">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        >
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-primary-800">启智 IEP</span>
          </div>

          <h2 className="text-2xl font-bold text-[#1E293B] mb-2">欢迎回来</h2>
          <p className="text-[#64748B] mb-8">请登录您的账户以继续使用</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errors.username) setErrors({ ...errors, username: undefined });
                }}
                placeholder="请输入用户名"
                className={`
                  w-full h-10 px-3 rounded-md border text-sm
                  placeholder:text-[#94A3B8]
                  focus:outline-none focus:border-[#3B82F6] focus:shadow-focus
                  transition-colors
                  ${errors.username ? 'border-[#EF4444]' : 'border-[#CBD5E1]'}
                `}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-[#EF4444]">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#1E293B] mb-1.5">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  placeholder="请输入密码"
                  className={`
                    w-full h-10 px-3 pr-10 rounded-md border text-sm
                    placeholder:text-[#94A3B8]
                    focus:outline-none focus:border-[#3B82F6] focus:shadow-focus
                    transition-colors
                    ${errors.password ? 'border-[#EF4444]' : 'border-[#CBD5E1]'}
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-[#EF4444]">{errors.password}</p>
              )}
            </div>

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#CBD5E1] text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-[#64748B]">记住我</span>
              </label>
              <button type="button" className="text-sm text-primary-500 hover:text-primary-600 cursor-pointer">
                忘记密码？
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`
                w-full h-11 rounded-md bg-primary-500 text-white font-medium
                hover:bg-primary-600 active:bg-primary-700
                transition-colors duration-150
                disabled:opacity-60 disabled:cursor-not-allowed
                cursor-pointer
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  登录中...
                </span>
              ) : (
                '登录'
              )}
            </button>

            {/* Hint */}
            <p className="text-xs text-center text-[#94A3B8] mt-4">
              默认账户：admin / admin123
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
